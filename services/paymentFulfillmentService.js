import Payment from '../models/Payment.js';
import Application from '../models/Application.js';
import User from '../models/User.js';
import { sendPaymentReceivedCredentialsEmail } from './emailService.js';

/**
 * Helper to generate random readable temporary password
 */
const generateTemporaryPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = 'KR@';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

/**
 * Centralized, idempotent payment fulfillment processor.
 * Safely invoked by redirect status endpoint, webhooks, or admin checks.
 *
 * @param {Object} params
 * @param {string} params.merchantOrderId
 * @param {string} params.status - 'SUCCESS' | 'FAILED' | 'PENDING'
 * @param {string} [params.transactionId] - PhonePe UTR / transaction ID
 * @param {string} [params.paymentMode] - e.g. 'UPI_INTENT', 'UPI_QR'
 * @param {string} [params.phonePeOrderId] - PhonePe internal order ID
 * @param {Object} [params.rawResponse] - Full PhonePe raw response
 */
const processPaymentOutcome = async ({
  merchantOrderId,
  status,
  transactionId,
  paymentMode = 'UPI',
  phonePeOrderId,
  rawResponse,
}) => {
  // 1. Find the payment record
  const payment = await Payment.findOne({ merchantOrderId });
  if (!payment) {
    console.warn(`Payment record not found for merchantOrderId: ${merchantOrderId}`);
    return { success: false, message: 'Payment record not found' };
  }

  // 2. If payment is already completed/success, prevent duplicate fulfillment
  if (payment.status === 'SUCCESS' && status === 'SUCCESS') {
    return {
      success: true,
      alreadyFulfilled: true,
      payment,
      message: 'Payment was already fulfilled successfully.',
    };
  }

  // Update payment fields
  payment.status = status;
  if (transactionId) payment.transactionId = transactionId;
  if (paymentMode) payment.paymentMode = paymentMode;
  if (phonePeOrderId) payment.phonePeOrderId = phonePeOrderId;
  if (rawResponse) payment.rawResponse = rawResponse;

  if (status === 'SUCCESS') {
    payment.paidAt = new Date();
  }

  await payment.save();

  // 3. Find and update the related Application
  const application = await Application.findOne({ applicationId: payment.applicationId });
  if (!application) {
    console.warn(`Application [${payment.applicationId}] not found for payment [${merchantOrderId}]`);
    return { success: true, payment };
  }

  // 4. If status is SUCCESS, fulfill the application idempotently
  if (status === 'SUCCESS') {
    const isAlreadyReceived =
      application.status === 'PAYMENT_RECEIVED' ||
      application.status === 'APPLICATION_PENDING' ||
      application.status === 'CONFIRMED';

    // Update payment subdocument on Application
    application.payment.status = 'RECEIVED';
    application.payment.transactionId =
      transactionId || payment.transactionId || merchantOrderId;
    application.payment.submittedAt = application.payment.submittedAt || new Date();
    application.payment.verifiedAt = new Date();
    application.payment.remarks = `Verified via PhonePe Gateway (${paymentMode || 'UPI/QR'})`;

    if (!isAlreadyReceived) {
      application.status = 'PAYMENT_RECEIVED';
      application.statusHistory.push({
        previousStatus: 'PAYMENT_PENDING',
        newStatus: 'PAYMENT_RECEIVED',
        changedByName: 'PhonePe Gateway',
        changedAt: new Date(),
        remarks: `Payment of ₹${payment.amount} confirmed via PhonePe (${paymentMode || 'UPI/QR'}).`,
      });
    }

    // Generate Candidate User Account & Credentials if not yet created
    let user = await User.findOne({
      email: application.personalDetails.email.toLowerCase(),
    });
    let generatedPassword = null;
    let credentialsCreated = false;

    if (!user) {
      generatedPassword = generateTemporaryPassword();
      user = new User({
        name: application.personalDetails.fullName,
        email: application.personalDetails.email.toLowerCase(),
        phone: application.personalDetails.phone,
        password: generatedPassword,
        role: 'USER',
        applicationId: application.applicationId,
        isActive: true,
      });
      await user.save();
      credentialsCreated = true;
    } else if (!application.credentialsGenerated) {
      generatedPassword = generateTemporaryPassword();
      user.password = generatedPassword;
      user.applicationId = application.applicationId;
      await user.save();
      credentialsCreated = true;
    }

    application.user = user._id;
    payment.user = user._id;
    await payment.save();

    if (credentialsCreated && generatedPassword && !application.credentialsGenerated) {
      application.credentialsGenerated = true;
      // Trigger credentials email asynchronously
      sendPaymentReceivedCredentialsEmail(application, generatedPassword).catch((err) => {
        console.error('Non-blocking credentials email dispatch error:', err);
      });
    }

    await application.save();
    console.log(`🎉 Successfully fulfilled payment for Application [${application.applicationId}]`);
  } else if (status === 'FAILED') {
    // If payment failed, ensure application stays in PAYMENT_PENDING so user can retry
    if (application.status === 'PAYMENT_PENDING') {
      application.statusHistory.push({
        previousStatus: application.status,
        newStatus: 'PAYMENT_PENDING',
        changedByName: 'PhonePe Gateway',
        changedAt: new Date(),
        remarks: `Payment attempt [${merchantOrderId}] failed or was cancelled.`,
      });
      await application.save();
    }
  }

  return {
    success: true,
    payment,
    application,
  };
};

export {
  processPaymentOutcome,
};
