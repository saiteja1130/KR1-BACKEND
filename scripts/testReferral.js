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
      baseApplicationFee: 1499,
      isReferralEnabled: true,
      requireVerifiedReferrer: true,
    });

    if (
      testSetting.referralDiscount !== 250 ||
      testSetting.baseApplicationFee !== 1499 ||
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
        originalAmount: 1499,
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

  // Test 5: Open Referral & 10% Discount Calculation
  try {
    const baseFee = 1499;
    const discountPercent = 10;
    const expectedDiscount = Math.round((baseFee * discountPercent) / 100); // 150
    const expectedPayable = baseFee - expectedDiscount; // 1349

    const arbitraryReferral = await referralService.validateReferrer({
      referrerName: 'Venkatesh Rao',
      referrerPhone: '9848012345',
      candidatePhone: '9123456789',
    });

    if (!arbitraryReferral.isValid) {
      throw new Error(`Expected open referral to be valid, got error: ${arbitraryReferral.message}`);
    }

    if (arbitraryReferral.discountAmount !== expectedDiscount) {
      throw new Error(`Expected 10% discount of ₹${expectedDiscount}, got ₹${arbitraryReferral.discountAmount}`);
    }

    if (arbitraryReferral.finalAmount !== expectedPayable) {
      throw new Error(`Expected payable amount ₹${expectedPayable}, got ₹${arbitraryReferral.finalAmount}`);
    }

    const amountInPaise = arbitraryReferral.finalAmount * 100;
    if (amountInPaise !== 134900) {
      throw new Error(`Paise conversion failed: expected 134900, got ${amountInPaise}`);
    }

    console.log(`✅ Test 5 Passed: Open referral verified with 10% discount (₹${expectedDiscount} off standard ₹${baseFee} fee, payable: ₹${expectedPayable}).`);
    passed++;
  } catch (err) {
    console.error('❌ Test 5 Failed: Open Referral & 10% Calculation:', err.message);
    failed++;
  }

  // Test 6: Database Integration & Admin Credentials Verification
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri && !mongoUri.includes('example.mongodb.net')) {
    try {
      console.log('\n🔄 Attempting live MongoDB connection...');
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
      console.log('✅ Connected to MongoDB.');

      // Verify settings
      const settings = await referralService.getReferralSettings();
      console.log(`ℹ️ Current DB Settings: referralDiscountPercent=${settings.referralDiscountPercent}%, referralDiscount=₹${settings.referralDiscount}, baseFee=₹${settings.baseApplicationFee}`);

      if (settings.referralDiscountPercent !== 10 || settings.referralDiscount !== 150) {
        throw new Error(`DB Settings mismatch: expected 10% / ₹150, got ${settings.referralDiscountPercent}% / ₹${settings.referralDiscount}`);
      }

      // Verify Admin user
      const User = (await import('../models/User.js')).default;
      const adminUser = await User.findOne({ email: 'info@kr1.in' }).select('+password');
      if (!adminUser) {
        throw new Error('Admin user info@kr1.in not found in database!');
      }
      const isPassMatch = await adminUser.comparePassword('123456');
      if (!isPassMatch) {
        throw new Error('Admin password verification failed for info@kr1.in with 123456');
      }
      console.log('🔐 Verified Admin user: info@kr1.in password successfully authenticates with 123456!');

      await mongoose.disconnect();
      console.log('✅ Test 6 Passed: Live database settings and admin credentials verified.');
      passed++;
    } catch (dbErr) {
      console.error('❌ Test 6 Failed: Live database check failed:', dbErr.message);
      failed++;
    }
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
