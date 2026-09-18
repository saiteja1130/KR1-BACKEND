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
      referralDiscountPercent: 10,
      referralDiscount: 150,
      baseApplicationFee: 1499,
      isReferralEnabled: true,
      requireVerifiedReferrer: false,
    };
  }

  let settings = await Setting.findOne({ key: 'referral_settings' });

  if (!settings) {
    settings = new Setting({
      key: 'referral_settings',
      referralDiscountPercent: 10,
      referralDiscount: 150,
      baseApplicationFee: 1499,
      isReferralEnabled: true,
      requireVerifiedReferrer: false,
    });
    await settings.save();
  } else {
    // Ensure referralDiscountPercent exists on legacy settings record
    if (settings.referralDiscountPercent === undefined) {
      settings.referralDiscountPercent = 10;
      settings.referralDiscount = Math.round((settings.baseApplicationFee * 10) / 100);
      await settings.save();
    }
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

  if (data.baseApplicationFee !== undefined) {
    const fee = Number(data.baseApplicationFee);
    if (isNaN(fee) || fee < 0) {
      throw new Error('Base application fee must be a valid non-negative number.');
    }
    settings.baseApplicationFee = fee;
  }

  if (data.referralDiscountPercent !== undefined) {
    const percent = Number(data.referralDiscountPercent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      throw new Error('Referral discount percent must be between 0% and 100%.');
    }
    settings.referralDiscountPercent = percent;
    settings.referralDiscount = Math.round((settings.baseApplicationFee * percent) / 100);
  } else if (data.referralDiscount !== undefined) {
    const discount = Number(data.referralDiscount);
    if (isNaN(discount) || discount < 0) {
      throw new Error('Referral discount must be a valid non-negative number.');
    }
    settings.referralDiscount = discount;
    if (settings.baseApplicationFee > 0) {
      settings.referralDiscountPercent = Math.round((discount / settings.baseApplicationFee) * 100);
    }
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
 * Validates a referrer
 * Referrals are open to anyone - no database check required!
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
      message: 'Please provide the name of your referrer.',
    };
  }

  if (!referrerPhone || !referrerPhone.trim()) {
    return {
      isValid: false,
      message: 'Please provide the mobile number of your referrer.',
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

  const baseFee = settings.baseApplicationFee ?? 1499;
  const discountPercent = settings.referralDiscountPercent ?? 10;
  const discountAmount = Math.round((baseFee * discountPercent) / 100);
  const finalAmount = Math.max(0, baseFee - discountAmount);

  return {
    isValid: true,
    referrerApplicationId: '',
    referrerName: referrerName.trim(),
    referrerPhone: cleanReferrerPhone,
    discountPercent,
    discountAmount,
    baseFee,
    finalAmount,
    message: `10% referral discount applied! Referred by ${referrerName.trim()} (-₹${discountAmount}).`,
  };
};

export default {
  normalizePhone,
  getReferralSettings,
  updateReferralSettings,
  validateReferrer,
};
