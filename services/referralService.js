import mongoose from 'mongoose';
import Setting from '../models/Setting.js';
import Application from '../models/Application.js';

/**
 * Normalizes phone numbers by stripping country codes, spaces, and non-digit characters
 * Returns the last 10 digits for consistent comparison.
 */
export const normalizePhone = (phone) => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
};

/**
 * Normalizes name strings for fuzzy/lenient comparison
 */
const normalizeName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/^(mr|mrs|ms|dr)\.?\s+/i, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Checks if two names match with reasonable tolerance
 */
const isNameMatch = (nameA, nameB) => {
  const normA = normalizeName(nameA);
  const normB = normalizeName(nameB);

  if (!normA || !normB) return false;
  if (normA === normB) return true;

  // Check if one name contains the other
  if (normA.includes(normB) || normB.includes(normA)) return true;

  // Check word token overlap (e.g. "Rahul Sharma" vs "Rahul")
  const tokensA = normA.split(' ').filter(Boolean);
  const tokensB = normB.split(' ').filter(Boolean);

  const sharedTokens = tokensA.filter((t) => tokensB.includes(t));
  return sharedTokens.length > 0;
};

/**
 * Fetch or initialize global referral settings
 */
export const getReferralSettings = async () => {
  // If mongoose is not connected, return fallback defaults immediately
  if (mongoose.connection?.readyState !== 1) {
    return {
      key: 'referral_settings',
      referralDiscount: 200,
      baseApplicationFee: 1000,
      isReferralEnabled: true,
      requireVerifiedReferrer: false,
    };
  }

  let settings = await Setting.findOne({ key: 'referral_settings' });

  if (!settings) {
    settings = new Setting({
      key: 'referral_settings',
      referralDiscount: 200,
      baseApplicationFee: 1000,
      isReferralEnabled: true,
      requireVerifiedReferrer: false,
    });
    await settings.save();
  }

  return settings;
};

/**
 * Update global referral settings
 */
export const updateReferralSettings = async (data, adminUserId) => {
  let settings = await Setting.findOne({ key: 'referral_settings' });

  if (!settings) {
    settings = new Setting({ key: 'referral_settings' });
  }

  if (data.referralDiscount !== undefined) {
    const discount = Number(data.referralDiscount);
    if (isNaN(discount) || discount < 0) {
      throw new Error('Referral discount must be a valid non-negative number.');
    }
    settings.referralDiscount = discount;
  }

  if (data.baseApplicationFee !== undefined) {
    const fee = Number(data.baseApplicationFee);
    if (isNaN(fee) || fee < 0) {
      throw new Error('Base application fee must be a valid non-negative number.');
    }
    settings.baseApplicationFee = fee;
  }

  if (data.isReferralEnabled !== undefined) {
    settings.isReferralEnabled = Boolean(data.isReferralEnabled);
  }

  if (data.requireVerifiedReferrer !== undefined) {
    settings.requireVerifiedReferrer = Boolean(data.requireVerifiedReferrer);
  }

  if (settings.referralDiscount > settings.baseApplicationFee) {
    throw new Error('Referral discount cannot exceed the base application fee.');
  }

  settings.updatedBy = adminUserId || null;
  await settings.save();

  return settings;
};

/**
 * Validates a referrer against the database
 */
export const validateReferrer = async ({
  referrerName,
  referrerPhone,
  candidatePhone,
  candidateEmail,
}) => {
  const settings = await getReferralSettings();

  if (!settings.isReferralEnabled) {
    return {
      isValid: false,
      message: 'The referral discount program is currently inactive.',
      isReferralEnabled: false,
    };
  }

  if (!referrerName || !referrerName.trim()) {
    return {
      isValid: false,
      message: 'Please provide the registered full name of your referrer.',
    };
  }

  if (!referrerPhone || !referrerPhone.trim()) {
    return {
      isValid: false,
      message: 'Please provide the registered mobile number of your referrer.',
    };
  }

  const cleanReferrerPhone = normalizePhone(referrerPhone);
  const cleanCandidatePhone = normalizePhone(candidatePhone);

  if (cleanReferrerPhone.length < 10) {
    return {
      isValid: false,
      message: 'Referrer mobile number must be at least 10 digits.',
    };
  }

  // Prevent self-referral
  if (cleanCandidatePhone && cleanReferrerPhone === cleanCandidatePhone) {
    return {
      isValid: false,
      message: 'Self-referral is not permitted. You cannot refer yourself.',
    };
  }

  // If database is not connected, return message gracefully
  if (mongoose.connection?.readyState !== 1) {
    return {
      isValid: false,
      message: 'Database is currently offline. Referral verification could not be completed.',
    };
  }

  // Build query to find matching member applications
  const phoneRegex = new RegExp(cleanReferrerPhone + '$');
  const query = {
    'personalDetails.phone': { $regex: phoneRegex },
    status: { $ne: 'REJECTED' },
  };

  // Prevent self-referral by email if candidate email provided
  if (candidateEmail && candidateEmail.trim()) {
    query['personalDetails.email'] = { $ne: candidateEmail.toLowerCase().trim() };
  }

  if (settings.requireVerifiedReferrer) {
    query.$or = [
      { status: { $in: ['PAYMENT_RECEIVED', 'APPLICATION_PENDING', 'CONFIRMED'] } },
      { 'payment.status': 'RECEIVED' },
    ];
  }

  const candidateMatches = await Application.find(query)
    .sort({ createdAt: -1 })
    .select('applicationId personalDetails status payment createdAt');

  if (!candidateMatches || candidateMatches.length === 0) {
    if (settings.requireVerifiedReferrer) {
      return {
        isValid: false,
        message:
          'No verified member found with this phone number. Referrers must have an active, verified registration.',
      };
    }
    return {
      isValid: false,
      message:
        'No registered member or employee found with this mobile number. Please check the number and try again.',
    };
  }

  // Check if any matched candidate has a compatible name
  const matchedCandidate = candidateMatches.find((app) =>
    isNameMatch(app.personalDetails?.fullName, referrerName)
  );

  if (!matchedCandidate) {
    return {
      isValid: false,
      message: `A member with this mobile number was found, but the name does not match "${referrerName.trim()}". Please verify the referrer's full registered name.`,
    };
  }

  const baseFee = settings.baseApplicationFee ?? 1000;
  const discountAmount = settings.referralDiscount ?? 200;
  const finalAmount = Math.max(0, baseFee - discountAmount);

  return {
    isValid: true,
    referrerApplicationId: matchedCandidate.applicationId,
    referrerName: matchedCandidate.personalDetails.fullName,
    discountAmount,
    baseFee,
    finalAmount,
    message: `Referral verified! Referred by ${matchedCandidate.personalDetails.fullName}. ₹${discountAmount} discount applied.`,
  };
};

export default {
  normalizePhone,
  getReferralSettings,
  updateReferralSettings,
  validateReferrer,
};
