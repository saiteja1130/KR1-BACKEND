import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: 'referral_settings',
    },
    referralDiscountPercent: {
      type: Number,
      required: true,
      default: 10,
      min: 0,
      max: 100,
    },
    referralDiscount: {
      type: Number,
      required: true,
      default: 150,
      min: 0,
    },
    baseApplicationFee: {
      type: Number,
      required: true,
      default: 1499,
      min: 0,
    },
    isReferralEnabled: {
      type: Boolean,
      default: true,
    },
    requireVerifiedReferrer: {
      type: Boolean,
      default: false,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Setting = mongoose.model('Setting', settingSchema);

export default Setting;
