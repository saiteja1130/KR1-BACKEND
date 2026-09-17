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
    referralDiscount: {
      type: Number,
      required: true,
      default: 200,
      min: 0,
    },
    baseApplicationFee: {
      type: Number,
      required: true,
      default: 1000,
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
