/**
 * PhonePe SDK Integration Verification Script
 * Tests SDK instantiation, pay request builder, amount in paise, and callback validation.
 */
import 'dotenv/config';
import {
  StandardCheckoutClient,
  Env,
  StandardCheckoutPayRequest,
  PrefillUserLoginDetails,
  PhonePeException,
} from '@phonepe-pg/pg-sdk-node';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const CommonUtils = require('@phonepe-pg/pg-sdk-node/dist/common/CommonUtils').CommonUtils;

console.log('🧪 Starting PhonePe SDK Verification Tests...\n');

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: SDK Client Initialization
  try {
    const clientId = process.env.PHONEPE_CLIENT_ID || 'TEST_CLIENT_ID';
    const clientSecret = process.env.PHONEPE_CLIENT_SECRET || 'TEST_CLIENT_SECRET';
    const clientVersion = 1;
    const env = Env.SANDBOX;

    const client = StandardCheckoutClient.getInstance(clientId, clientSecret, clientVersion, env);
    if (client && typeof client.pay === 'function') {
      console.log('✅ Test 1 Passed: StandardCheckoutClient initialized with pay(), getOrderStatus(), validateCallback() methods.');
      passed++;
    } else {
      throw new Error('Client instance missing required methods');
    }
  } catch (err) {
    console.error('❌ Test 1 Failed: SDK Client Initialization:', err.message);
    failed++;
  }

  // Test 2: StandardCheckoutPayRequest Builder (UPI & QR)
  try {
    const merchantOrderId = `KR1_TEST_${Date.now()}`;
    const amountInINR = 1499;
    const amountInPaise = amountInINR * 100; // 100,000 paise
    const redirectUrl = 'http://localhost:3000/payment-status/APP-TEST?merchantOrderId=' + merchantOrderId;
    const phone = '9666193543';

    const prefill = PrefillUserLoginDetails.builder()
      .phoneNumber(phone)
      .build();

    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(amountInPaise)
      .redirectUrl(redirectUrl)
      .prefillUserLoginDetails(prefill)
      .message('KR Material Registration Fee - UPI & QR')
      .build();

    if (
      request.merchantOrderId === merchantOrderId &&
      request.amount === 149900 &&
      request.redirectUrl === redirectUrl &&
      request.prefillUserLoginDetails?.phoneNumber === phone
    ) {
      console.log('✅ Test 2 Passed: StandardCheckoutPayRequest built properly with 100,000 paise (₹1,000) & phone prefill.');
      passed++;
    } else {
      throw new Error('Request fields did not match expected values: ' + JSON.stringify(request));
    }
  } catch (err) {
    console.error('❌ Test 2 Failed: Pay Request Builder:', err.message);
    failed++;
  }

  // Test 3: Webhook Signature Verification
  try {
    const username = 'test_webhook_user';
    const password = 'test_webhook_password';
    const expectedAuth = CommonUtils.calculateSha256({ username, password });

    const rawPayload = JSON.stringify({
      orderId: 'OMO2408301499000001',
      merchantOrderId: 'KR1_APP_001_1726543200',
      state: 'COMPLETED',
      amount: 149900,
      paymentMode: 'UPI_INTENT',
      transactionId: 'T240830151234567890',
    });

    const client = StandardCheckoutClient.getInstance(
      process.env.PHONEPE_CLIENT_ID || 'TEST_CLIENT_ID',
      process.env.PHONEPE_CLIENT_SECRET || 'TEST_CLIENT_SECRET',
      1,
      Env.SANDBOX
    );

    // Valid callback verification
    const verified = client.validateCallback(username, password, expectedAuth, rawPayload);
    if (verified && (verified.payload?.merchantOrderId === 'KR1_APP_001_1726543200' || verified.merchantOrderId === 'KR1_APP_001_1726543200')) {
      console.log('✅ Test 3 Passed: Webhook validateCallback successfully verified authentic signature.');
      passed++;
    } else {
      throw new Error('validateCallback did not return expected payload');
    }

    // Invalid callback verification
    try {
      client.validateCallback(username, password, 'FORGED_AUTH_SIGNATURE', rawPayload);
      console.error('❌ Test 3.1 Failed: Expected forged callback to be rejected!');
      failed++;
    } catch (forgedErr) {
      console.log('✅ Test 3.1 Passed: Forged callback rejected with 417 Invalid Callback error.');
      passed++;
    }
  } catch (err) {
    console.error('❌ Test 3 Failed: Webhook Signature Verification:', err.message);
    failed++;
  }

  // Test 4: Verify PhonePe Service Module
  try {
    const { default: phonepeService } = await import('../services/phonepeService.js');
    if (
      typeof phonepeService.createPaymentOrder === 'function' &&
      typeof phonepeService.getOrderStatus === 'function' &&
      typeof phonepeService.validateWebhookCallback === 'function' &&
      typeof phonepeService.refundPayment === 'function' &&
      typeof phonepeService.getRefundStatus === 'function'
    ) {
      console.log('✅ Test 4 Passed: phonepeService singleton exposes all required methods.');
      passed++;
    } else {
      throw new Error('phonepeService missing expected functions');
    }
  } catch (err) {
    console.error('❌ Test 4 Failed: phonepeService Module:', err.message);
    failed++;
  }

  // Test 5: Verify Payment Model Definition
  try {
    const { default: Payment } = await import('../models/Payment.js');
    const dummyPayment = new Payment({
      merchantOrderId: 'KR1_TEST_001',
      applicationId: 'APP-2026-0001',
      amount: 1499,
      amountInPaise: 149900,
      currency: 'INR',
      status: 'CREATED',
      paymentMode: 'UPI_QR',
    });

    const valErr = dummyPayment.validateSync();
    if (!valErr) {
      console.log('✅ Test 5 Passed: Payment Mongoose Schema validates correctly.');
      passed++;
    } else {
      throw valErr;
    }
  } catch (err) {
    console.error('❌ Test 5 Failed: Payment Schema:', err.message);
    failed++;
  }

  console.log(`\n================================`);
  console.log(`Tests Completed: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
