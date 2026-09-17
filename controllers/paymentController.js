import Application from '../models/Application.js';
import Payment from '../models/Payment.js';
import phonepeService from '../services/phonepeService.js';
import { processPaymentOutcome } from '../services/paymentFulfillmentService.js';

/**
 * @desc    Create a new PhonePe payment order for an application (UPI & QR)
 * @route   POST /api/payment/create
 * @access  Public / Candidate
 */
const createPaymentOrder = async (req, res, next) => {
  try {
    const { applicationId } = req.body;

    if (!applicationId || !applicationId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Application ID is required to initiate payment.',
      });
    }

    // 1. Validate application exists
    const application = await Application.findOne({ applicationId: applicationId.trim() });
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found with the specified ID.',
      });
    }

    // 2. Check if already verified/paid
    if (
      application.payment?.status === 'RECEIVED' ||
      application.status === 'PAYMENT_RECEIVED' ||
      application.status === 'APPLICATION_PENDING' ||
      application.status === 'CONFIRMED'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Payment has already been received and verified for this application.',
        isAlreadyVerified: true,
      });
    }

    // 3. Server-side amount calculation (respect discounted fee stored on application)
    const amount = application.payment?.amount || Number(process.env.PAYMENT_AMOUNT) || 1000;
    const amountInPaise = Math.round(amount * 100); // e.g. ₹800 = 80000 paise

    // 4. Generate unique merchantOrderId (PhonePe constraints: alphanumeric + underscores/hyphens)
    const cleanAppId = application.applicationId.replace(/[^A-Za-z0-9]/g, '');
    const merchantOrderId = `KR1_${cleanAppId}_${Date.now()}`;

    // 5. Construct redirect URL back to frontend status page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectBase = process.env.PHONEPE_REDIRECT_URL || `${frontendUrl}/payment-status`;
    const redirectUrl = `${redirectBase}/${application.applicationId}?merchantOrderId=${merchantOrderId}`;

    // 6. Create initial Payment record in DB
    const payment = new Payment({
      merchantOrderId,
      applicationId: application.applicationId,
      user: application.user || null,
      amount,
      amountInPaise,
      currency: 'INR',
      status: 'CREATED',
      customerName: application.personalDetails.fullName,
      customerEmail: application.personalDetails.email,
      customerPhone: application.personalDetails.phone,
      paymentMode: 'UPI_QR',
      redirectUrl,
    });
    await payment.save();

    // 7. Request PhonePe checkout redirect URL via SDK
    try {
      const payResult = await phonepeService.createPaymentOrder({
        merchantOrderId,
        amountInPaise,
        redirectUrl,
        candidatePhone: application.personalDetails.phone,
        candidateName: application.personalDetails.fullName,
      });

      if (payResult.orderId) {
        payment.phonePeOrderId = payResult.orderId;
        await payment.save();
      }

      return res.status(200).json({
        success: true,
        paymentUrl: payResult.paymentUrl,
        merchantOrderId,
        amount,
        applicationId: application.applicationId,
      });
    } catch (sdkError) {
      payment.status = 'FAILED';
      payment.errorMessage = sdkError.message;
      await payment.save();

      console.error('PhonePe SDK Payment Initiation Error:', sdkError);
      return res.status(502).json({
        success: false,
        message: 'Unable to initiate payment with PhonePe gateway. Please try again.',
        error: process.env.NODE_ENV === 'development' ? sdkError.message : undefined,
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify and fetch payment status using merchantOrderId
 * @route   GET /api/payment/:merchantOrderId/status
 * @access  Public / Candidate
 */
const getPaymentStatus = async (req, res, next) => {
  try {
    const { merchantOrderId } = req.params;

    const payment = await Payment.findOne({ merchantOrderId });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment order not found.',
      });
    }

    // Query PhonePe SDK directly for latest verified status
    let verifiedState = null;
    try {
      verifiedState = await phonepeService.getOrderStatus(merchantOrderId);
    } catch (sdkErr) {
      console.warn(`PhonePe getOrderStatus check failed for [${merchantOrderId}]:`, sdkErr.message);
    }

    let updatedResult = null;
    if (verifiedState) {
      updatedResult = await processPaymentOutcome({
        merchantOrderId,
        status: verifiedState.internalStatus,
        transactionId: verifiedState.transactionId,
        paymentMode: verifiedState.paymentMode,
        phonePeOrderId: verifiedState.orderId,
        rawResponse: verifiedState.raw,
      });
    }

    const currentPayment = updatedResult?.payment || payment;
    const application = await Application.findOne({ applicationId: currentPayment.applicationId });

    return res.status(200).json({
      success: true,
      payment: {
        merchantOrderId: currentPayment.merchantOrderId,
        applicationId: currentPayment.applicationId,
        amount: currentPayment.amount,
        status: currentPayment.status,
        paymentMode: currentPayment.paymentMode,
        transactionId: currentPayment.transactionId,
        paidAt: currentPayment.paidAt,
      },
      applicationStatus: application ? application.status : null,
      isVerified: currentPayment.status === 'SUCCESS',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get latest payment status for an application
 * @route   GET /api/payment/application/:applicationId/status
 * @access  Public
 */
const getApplicationPaymentStatus = async (req, res, next) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findOne({ applicationId });
    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.',
      });
    }

    // Find the latest payment record
    const latestPayment = await Payment.findOne({ applicationId }).sort({ createdAt: -1 });

    // If payment exists and is in CREATED or PENDING, check with PhonePe
    if (latestPayment && (latestPayment.status === 'CREATED' || latestPayment.status === 'PENDING')) {
      try {
        const verifiedState = await phonepeService.getOrderStatus(latestPayment.merchantOrderId);
        if (verifiedState) {
          await processPaymentOutcome({
            merchantOrderId: latestPayment.merchantOrderId,
            status: verifiedState.internalStatus,
            transactionId: verifiedState.transactionId,
            paymentMode: verifiedState.paymentMode,
            phonePeOrderId: verifiedState.orderId,
            rawResponse: verifiedState.raw,
          });
        }
      } catch (e) {
        // Non-blocking fallback
      }
    }

    const refreshedPayment = latestPayment
      ? await Payment.findById(latestPayment._id)
      : null;

    const isVerified =
      application.status === 'PAYMENT_RECEIVED' ||
      application.payment.status === 'RECEIVED' ||
      refreshedPayment?.status === 'SUCCESS';

    return res.status(200).json({
      success: true,
      applicationId: application.applicationId,
      applicantName: application.personalDetails.fullName,
      email: application.personalDetails.email,
      amount: application.payment.amount,
      referral: application.referral,
      applicationStatus: application.status,
      payment: refreshedPayment,
      isVerified,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    PhonePe Server-to-Server Webhook handler
 * @route   POST /api/payment/phonepe/webhook
 * @access  Public (Signature verified via PhonePe SDK)
 */
const handleWebhook = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || req.headers['x-verify'] || '';
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const username = process.env.PHONEPE_WEBHOOK_USERNAME;
    const password = process.env.PHONEPE_WEBHOOK_PASSWORD;

    // Validate callback if credentials configured
    let callbackResponse = null;
    if (username && password) {
      try {
        callbackResponse = phonepeService.validateWebhookCallback({
          username,
          password,
          authHeader,
          rawBody,
        });
      } catch (valErr) {
        console.error('❌ PhonePe Webhook signature validation failed:', valErr.message);
        return res.status(401).json({ success: false, message: 'Invalid callback signature' });
      }
    } else {
      // If webhook credentials not yet set in .env, parse body carefully
      console.warn('⚠️ Webhook credentials not configured. Parsing raw body.');
      try {
        callbackResponse = JSON.parse(rawBody);
      } catch (parseErr) {
        callbackResponse = req.body;
      }
    }

    const payload = callbackResponse.payload || callbackResponse;
    const merchantOrderId = payload.merchantOrderId || payload.orderId;

    if (!merchantOrderId) {
      return res.status(400).json({ success: false, message: 'Missing order reference' });
    }

    const state = (payload.state || '').toUpperCase();
    let internalStatus = 'PENDING';
    if (state === 'COMPLETED') {
      internalStatus = 'SUCCESS';
    } else if (state === 'FAILED' || state === 'CANCELLED') {
      internalStatus = 'FAILED';
    }

    // Trigger idempotent fulfillment
    await processPaymentOutcome({
      merchantOrderId,
      status: internalStatus,
      transactionId: payload.transactionId,
      paymentMode: payload.paymentMode || 'UPI',
      phonePeOrderId: payload.orderId,
      rawResponse: payload,
    });

    return res.status(200).json({
      success: true,
      message: 'Callback received and processed successfully',
    });
  } catch (error) {
    console.error('PhonePe Webhook Processing Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error processing webhook callback',
    });
  }
};

/**
 * @desc    Initiate a refund (Admin only)
 * @route   POST /api/payment/:merchantOrderId/refund
 * @access  Private (Admin)
 */
const refundPaymentOrder = async (req, res, next) => {
  try {
    const { merchantOrderId } = req.params;
    const { amount, reason } = req.body;

    const payment = await Payment.findOne({ merchantOrderId });
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    if (payment.status !== 'SUCCESS') {
      return res.status(400).json({
        success: false,
        message: 'Only successfully completed payments can be refunded.',
      });
    }

    const refundAmountInINR = Number(amount) || payment.amount;
    const refundAmountInPaise = refundAmountInINR * 100;
    const merchantRefundId = `REF_${merchantOrderId}_${Date.now()}`;

    const refundResult = await phonepeService.refundPayment({
      merchantRefundId,
      originalMerchantOrderId: merchantOrderId,
      amountInPaise: refundAmountInPaise,
    });

    payment.refundDetails.push({
      refundId: merchantRefundId,
      amount: refundAmountInINR,
      status: 'INITIATED',
      createdAt: new Date(),
    });
    payment.status = 'REFUNDED';
    payment.refundedAt = new Date();
    await payment.save();

    res.status(200).json({
      success: true,
      message: 'Refund initiated successfully via PhonePe.',
      refundResult,
      merchantRefundId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get refund status (Admin only)
 * @route   GET /api/payment/refund/:refundId/status
 * @access  Private (Admin)
 */
const checkRefundStatus = async (req, res, next) => {
  try {
    const { refundId } = req.params;
    const refundStatus = await phonepeService.getRefundStatus(refundId);

    res.status(200).json({
      success: true,
      refundStatus,
    });
  } catch (error) {
    next(error);
  }
};

export {
  createPaymentOrder,
  getPaymentStatus,
  getApplicationPaymentStatus,
  handleWebhook,
  refundPaymentOrder,
  checkRefundStatus,
};
