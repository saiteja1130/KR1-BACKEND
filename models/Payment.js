import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    merchantOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    phonePeOrderId: {
      type: String,
      index: true,
      default: null,
      trim: true,
    },
    applicationId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    amount: {
      type: Number,
      required: true, // In Rupees (e.g. 1500)
    },
    amountInPaise: {
      type: Number,
      required: true, // In Paise (e.g. 150000)
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    status: {
      type: String,
      enum: ['CREATED', 'PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'REFUNDED'],
      default: 'CREATED',
      index: true,
    },
    customerName: {
      type: String,
      default: '',
      trim: true,
    },
    customerPhone: {
      type: String,
      default: '',
      trim: true,
    },
    customerEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
    },
    paymentMode: {
      type: String,
      default: 'UPI', // UPI_INTENT, UPI_COLLECT, UPI_QR, etc.
    },
    transactionId: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    errorCode: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    redirectUrl: {
      type: String,
      default: null,
    },
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    refundedAt: {
      type: Date,
      default: null,
    },
    refundDetails: [
      {
        refundId: String,
        amount: Number,
        status: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ applicationId: 1, createdAt: -1 });
paymentSchema.index({ merchantOrderId: 1, status: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
