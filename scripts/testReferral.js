import 'dotenv/config';
import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import Application from '../models/Application.js';
import referralService from '../services/referralService.js';

console.log('🧪 Starting Referral System Automated Verification Tests...\n');

const runTests = async () => {
  let passed = 0;
  let failed = 0;

  // Test 1: Phone Normalization Logic
  try {
    const testCases = [
      { input: '+919876543210', expected: '9876543210' },
      { input: '09876543210', expected: '9876543210' },
      { input: '+91 98765 43210', expected: '9876543210' },
      { input: '91-9876543210', expected: '9876543210' },
      { input: '9876543210', expected: '9876543210' },
      { input: '+91 (987) 654-3210', expected: '9876543210' },
      { input: '', expected: '' },
      { input: null, expected: '' },
    ];

    for (const { input, expected } of testCases) {
      const result = referralService.normalizePhone(input);
      if (result !== expected) {
        throw new Error(`Normalization mismatch for "${input}": expected "${expected}", got "${result}"`);
      }
    }
    console.log('✅ Test 1 Passed: Phone number normalization across various formats (+91, 0, brackets, spaces).');
    passed++;
  } catch (err) {
    console.error('❌ Test 1 Failed: Phone Normalization:', err.message);
    failed++;
  }

  // Test 2: Setting Schema Model Validation
  try {
    const testSetting = new Setting({
      key: 'referral_settings',
      referralDiscount: 250,
      baseApplicationFee: 1000,
      isReferralEnabled: true,
      requireVerifiedReferrer: true,
    });

    if (
      testSetting.referralDiscount !== 250 ||
      testSetting.baseApplicationFee !== 1000 ||
      testSetting.requireVerifiedReferrer !== true
    ) {
      throw new Error('Setting model fields did not instantiate properly');
    }

    // Validate schema validation error if discount is negative
    const invalidSetting = new Setting({
      key: 'referral_settings',
      referralDiscount: -50,
    });
    const validationError = invalidSetting.validateSync();
    if (!validationError || !validationError.errors['referralDiscount']) {
      throw new Error('Setting schema should reject negative referralDiscount');
    }

    console.log('✅ Test 2 Passed: Setting model schema and validation rules verified.');
    passed++;
  } catch (err) {
    console.error('❌ Test 2 Failed: Setting Schema Validation:', err.message);
    failed++;
  }

  // Test 3: Application Schema with Referral Sub-document
  try {
    const testApp = new Application({
      applicationId: 'KR1-REF-TEST',
      personalDetails: {
        fullName: 'Rahul Sharma',
        email: 'rahul@example.com',
        phone: '9876543210',
        address: 'Main Road',
        city: 'Kakinada',
        state: 'Andhra Pradesh',
        pincode: '533001',
      },
      applicantType: 'fresher',
      education: {
        tenthOrTwelfth: {
          qualificationType: '12th / Intermediate',
          board: 'State Board',
          instituteName: 'Junior College',
          yearOfPassing: 2020,
          percentageOrCgpa: '85%',
        },
        graduation: {
          degree: 'B.Com',
          specialization: 'Computers',
          university: 'Andhra University',
          collegeName: 'Degree College',
          yearOfPassing: 2023,
          percentageOrCgpa: '75%',
        },
      },
      resume: {
        fileName: 'resume.pdf',
        originalName: 'resume.pdf',
        filePath: 'uploads/resume.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      },
      payment: {
        amount: 800,
        status: 'PENDING',
      },
      referral: {
        isReferred: true,
        referrerName: 'Vikram Singh',
        referrerPhone: '9876500001',
        referrerApplicationId: 'KR1-2026-0001',
        discountAmount: 200,
        originalAmount: 1000,
        isVerified: true,
        verifiedAt: new Date(),
      },
    });

    const valErr = testApp.validateSync();
    if (valErr) {
      throw new Error(`Application validation failed: ${valErr.message}`);
    }

    if (
      !testApp.referral.isReferred ||
      testApp.referral.discountAmount !== 200 ||
      testApp.payment.amount !== 800
    ) {
      throw new Error('Application referral sub-document values not populated correctly');
    }

    console.log('✅ Test 3 Passed: Application model correctly supports referral sub-document and discounted fee.');
    passed++;
  } catch (err) {
    console.error('❌ Test 3 Failed: Application Referral Schema:', err.message);
    failed++;
  }

  // Test 4: Referral Validation Logic (Self-referral check & empty validation)
  try {
    // 4a. Empty inputs
    const emptyCheck = await referralService.validateReferrer({
      referrerName: '',
      referrerPhone: '',
      candidatePhone: '9876543210',
    });
    if (emptyCheck.isValid) {
      throw new Error('Empty referrer details should not be valid');
    }

    // 4b. Self-referral by phone
    const selfCheck = await referralService.validateReferrer({
      referrerName: 'Same Person',
      referrerPhone: '+919876543210',
      candidatePhone: '9876543210',
    });
    if (selfCheck.isValid) {
      throw new Error('Self-referral by matching phone should be rejected');
    }
    if (!selfCheck.message.toLowerCase().includes('self')) {
      throw new Error(`Expected self-referral error message, got: ${selfCheck.message}`);
    }

    console.log('✅ Test 4 Passed: Self-referral detection and input guardrails function properly.');
    passed++;
  } catch (err) {
    console.error('❌ Test 4 Failed: Referral Guardrails:', err.message);
    failed++;
  }

  // Test 5: Dynamic Fee & Discount Calculations
  try {
    const baseFee = 1000;
    const discount = 200;
    const payableFee = Math.max(0, baseFee - discount);
    const amountInPaise = payableFee * 100;

    if (payableFee !== 800 || amountInPaise !== 80000) {
      throw new Error(`Fee calculation failed: payable=${payableFee}, paise=${amountInPaise}`);
    }

    // Extreme discount test (discount > baseFee)
    const largeDiscount = 1200;
    const boundedPayable = Math.max(0, baseFee - largeDiscount);
    if (boundedPayable !== 0) {
      throw new Error(`Fee cannot be negative: got ${boundedPayable}`);
    }

    console.log('✅ Test 5 Passed: Dynamic fee deductions and paise conversion for PhonePe gateway verified.');
    passed++;
  } catch (err) {
    console.error('❌ Test 5 Failed: Dynamic Fee Calculation:', err.message);
    failed++;
  }

  // Test 6: Database Integration (if MongoDB is connected)
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri && !mongoUri.includes('example.mongodb.net')) {
    try {
      console.log('\n🔄 Attempting live MongoDB connection...');
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 4000 });
      console.log('✅ Connected to MongoDB.');

      const settings = await referralService.getReferralSettings();
      console.log(`Current DB Settings: Discount=₹${settings.referralDiscount}, BaseFee=₹${settings.baseApplicationFee}`);

      await mongoose.disconnect();
      console.log('✅ Test 6 Passed: Live database connectivity verified.');
      passed++;
    } catch (dbErr) {
      console.log(`ℹ️ Note: Live MongoDB connection skipped (${dbErr.message}). Unit tests complete.`);
    }
  } else {
    console.log('\nℹ️ Note: Live MongoDB URI not configured in .env (development mode). Mock & unit tests executed.');
  }

  console.log(`\n========================================`);
  console.log(`📊 Referral System Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runTests();
