const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    personalDetails: {
      fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true,
      },
      email: {
        type: String,
        required: [true, 'Email address is required'],
        lowercase: true,
        trim: true,
      },
      phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
      },
      altPhone: {
        type: String,
        trim: true,
        default: '',
      },
      address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true,
      },
      city: {
        type: String,
        required: [true, 'City is required'],
        trim: true,
      },
      state: {
        type: String,
        required: [true, 'State is required'],
        trim: true,
      },
      pincode: {
        type: String,
        required: [true, 'Pincode is required'],
        trim: true,
      },
    },
    applicantType: {
      type: String,
      enum: ['fresher', 'experienced'],
      required: [true, 'Applicant type is required'],
    },
    workExperience: {
      totalExperience: {
        type: String,
        default: '',
      },
      currentCompany: {
        type: String,
        default: '',
      },
      designation: {
        type: String,
        default: '',
      },
      relevantExperience: {
        type: String,
        default: '',
      },
      skills: {
        type: [String],
        default: [],
      },
      currentSalary: {
        type: String,
        default: '',
      },
      expectedSalary: {
        type: String,
        default: '',
      },
      noticePeriod: {
        type: String,
        default: '',
      },
    },
    education: {
      tenthOrTwelfth: {
        qualificationType: {
          type: String,
          required: [true, '12th / Intermediate qualification type is required'],
          default: '12th / Intermediate',
        },
        board: {
          type: String,
          required: [true, 'Board name is required'],
          trim: true,
        },
        instituteName: {
          type: String,
          required: [true, 'School / College name is required'],
          trim: true,
        },
        yearOfPassing: {
          type: Number,
          required: [true, 'Year of passing is required'],
        },
        percentageOrCgpa: {
          type: String,
          required: [true, 'Percentage / CGPA is required'],
          trim: true,
        },
      },
      graduation: {
        degree: {
          type: String,
          required: [true, 'Graduation degree is required'],
          trim: true,
        },
        specialization: {
          type: String,
          required: [true, 'Graduation specialization is required'],
          trim: true,
        },
        university: {
          type: String,
          required: [true, 'University name is required'],
          trim: true,
        },
        collegeName: {
          type: String,
          required: [true, 'Graduation college name is required'],
          trim: true,
        },
        yearOfPassing: {
          type: Number,
          required: [true, 'Graduation year of passing is required'],
        },
        percentageOrCgpa: {
          type: String,
          required: [true, 'Graduation percentage / CGPA is required'],
          trim: true,
        },
      },
    },
    resume: {
      fileName: {
        type: String,
        required: [true, 'Resume file name is required'],
      },
      originalName: {
        type: String,
        required: [true, 'Resume original name is required'],
      },
      filePath: {
        type: String,
        required: [true, 'Resume file path is required'],
      },
      mimeType: {
        type: String,
        required: [true, 'Resume mime type is required'],
      },
      size: {
        type: Number,
        required: [true, 'Resume file size is required'],
      },
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
    payment: {
      amount: {
        type: Number,
        default: 1000,
      },
      transactionId: {
        type: String,
        trim: true,
        default: null,
      },
      status: {
        type: String,
        enum: ['PENDING', 'RECEIVED'],
        default: 'PENDING',
      },
      submittedAt: {
        type: Date,
        default: null,
      },
      verifiedAt: {
        type: Date,
        default: null,
      },
      verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      remarks: {
        type: String,
        default: '',
      },
    },
    status: {
      type: String,
      enum: [
        'PAYMENT_PENDING',
        'PAYMENT_RECEIVED',
        'APPLICATION_PENDING',
        'CONFIRMED',
        'REJECTED',
      ],
      default: 'PAYMENT_PENDING',
    },
    statusHistory: [
      {
        previousStatus: {
          type: String,
        },
        newStatus: {
          type: String,
          required: true,
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
        changedByName: {
          type: String,
          default: 'System',
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        remarks: {
          type: String,
          default: '',
        },
      },
    ],
    credentialsGenerated: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast searching and filtering
applicationSchema.index({ status: 1 });
applicationSchema.index({ 'payment.status': 1 });
applicationSchema.index({ 'personalDetails.email': 1 });
applicationSchema.index({ 'personalDetails.phone': 1 });
applicationSchema.index({ 'payment.transactionId': 1 });
applicationSchema.index({ createdAt: -1 });

const Application = mongoose.model('Application', applicationSchema);

module.exports = Application;
