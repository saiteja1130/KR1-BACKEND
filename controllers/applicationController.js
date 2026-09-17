import path from 'path';
import fs from 'fs';
import Application from '../models/Application.js';
import { generateApplicationId } from '../services/idGenerator.js';
import { sendApplicationSubmittedEmail } from '../services/emailService.js';
import referralService from '../services/referralService.js';

/**
 * @desc    Submit a new job/manpower application
 * @route   POST /api/applications
 * @access  Public
 */
const submitApplication = async (req, res, next) => {
  try {
    // 1. Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Resume upload is required. Please upload your resume in PDF or DOC format.',
      });
    }

    // 2. Parse body fields (supporting both nested JSON strings and objects)
    let personalDetails = req.body.personalDetails;
    let workExperience = req.body.workExperience;
    let education = req.body.education;
    let referral = req.body.referral;
    const applicantType = req.body.applicantType;

    if (typeof personalDetails === 'string') {
      try {
        personalDetails = JSON.parse(personalDetails);
      } catch (e) {
        personalDetails = {};
      }
    }

    if (typeof workExperience === 'string') {
      try {
        workExperience = JSON.parse(workExperience);
      } catch (e) {
        workExperience = {};
      }
    }

    if (typeof education === 'string') {
      try {
        education = JSON.parse(education);
      } catch (e) {
        education = {};
      }
    }

    if (typeof referral === 'string') {
      try {
        referral = JSON.parse(referral);
      } catch (e) {
        referral = null;
      }
    }

    // Fallback if top-level flat fields were submitted
    if (!personalDetails || !personalDetails.fullName) {
      personalDetails = {
        fullName: req.body.fullName || req.body.name,
        email: req.body.email,
        phone: req.body.phone,
        altPhone: req.body.altPhone || '',
        address: req.body.address,
        city: req.body.city,
        state: req.body.state,
        pincode: req.body.pincode,
      };
    }

    // Basic Validations
    if (!personalDetails.fullName || !personalDetails.email || !personalDetails.phone) {
      // Remove uploaded file if validation fails
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: 'Please provide all required personal details (Full Name, Email, Phone, Address).',
      });
    }

    if (!applicantType) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        message: 'Applicant type (Fresher or Experienced) is required.',
      });
    }

    // Check for duplicate recent active application with same email
    const existingApp = await Application.findOne({
      'personalDetails.email': personalDetails.email.toLowerCase().trim(),
      status: { $in: ['PAYMENT_PENDING', 'PAYMENT_RECEIVED', 'APPLICATION_PENDING', 'CONFIRMED'] },
    });

    if (existingApp) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        applicationId: existingApp.applicationId,
        message: `An active application with email ${personalDetails.email} already exists (ID: ${existingApp.applicationId}).`,
      });
    }

    // 3. Referral verification & Dynamic fee calculation
    const settings = await referralService.getReferralSettings();
    const baseFee = settings.baseApplicationFee ?? (Number(process.env.PAYMENT_AMOUNT) || 1500);
    let payableAmount = baseFee;
    let referralData = {
      isReferred: false,
      referrerName: '',
      referrerPhone: '',
      referrerApplicationId: '',
      discountAmount: 0,
      originalAmount: baseFee,
      isVerified: false,
      verifiedAt: null,
    };

    if (referral && (referral.isReferred === true || referral.isReferred === 'true')) {
      const refValidation = await referralService.validateReferrer({
        referrerName: referral.referrerName,
        referrerPhone: referral.referrerPhone,
        candidatePhone: personalDetails.phone,
        candidateEmail: personalDetails.email,
      });

      if (!refValidation.isValid) {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({
          success: false,
          message: refValidation.message || 'Invalid referrer details provided.',
        });
      }

      payableAmount = refValidation.finalAmount;
      referralData = {
        isReferred: true,
        referrerName: refValidation.referrerName,
        referrerPhone: referral.referrerPhone ? referral.referrerPhone.trim() : '',
        referrerApplicationId: refValidation.referrerApplicationId,
        discountAmount: refValidation.discountAmount,
        originalAmount: refValidation.baseFee,
        isVerified: true,
        verifiedAt: new Date(),
      };
    }

    // 4. Generate unique human-readable Application ID
    const applicationId = await generateApplicationId();

    // 5. Build Resume Object
    const resumeData = {
      fileName: req.file.filename,
      originalName: req.file.originalname,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
    };

    // 6. Create new Application document
    const application = new Application({
      applicationId,
      personalDetails: {
        fullName: personalDetails.fullName.trim(),
        email: personalDetails.email.toLowerCase().trim(),
        phone: personalDetails.phone.trim(),
        altPhone: personalDetails.altPhone ? personalDetails.altPhone.trim() : '',
        address: personalDetails.address ? personalDetails.address.trim() : '',
        city: personalDetails.city ? personalDetails.city.trim() : '',
        state: personalDetails.state ? personalDetails.state.trim() : '',
        pincode: personalDetails.pincode ? personalDetails.pincode.trim() : '',
      },
      applicantType,
      workExperience: applicantType === 'experienced' ? {
        totalExperience: workExperience?.totalExperience || '',
        currentCompany: workExperience?.currentCompany || '',
        designation: workExperience?.designation || '',
        relevantExperience: workExperience?.relevantExperience || '',
        skills: Array.isArray(workExperience?.skills) ? workExperience.skills : (workExperience?.skills ? [workExperience.skills] : []),
        currentSalary: workExperience?.currentSalary || '',
        expectedSalary: workExperience?.expectedSalary || '',
        noticePeriod: workExperience?.noticePeriod || '',
      } : {
        totalExperience: '0 years (Fresher)',
        currentCompany: 'N/A',
        designation: 'Fresher',
        relevantExperience: 'N/A',
        skills: Array.isArray(workExperience?.skills) ? workExperience.skills : (workExperience?.skills ? [workExperience.skills] : []),
        currentSalary: '',
        expectedSalary: workExperience?.expectedSalary || '',
        noticePeriod: 'Immediate',
      },
      education: {
        // Support new flat schema (qualificationLevel, instituteName, boardOrUniversity)
        // as well as old nested schema for backward compatibility
        qualificationLevel: education?.qualificationLevel || education?.tenthOrTwelfth?.qualificationType || '12th / Intermediate',
        instituteName: education?.instituteName || education?.tenthOrTwelfth?.instituteName || education?.graduation?.collegeName || '',
        boardOrUniversity: education?.boardOrUniversity || education?.tenthOrTwelfth?.board || education?.graduation?.university || '',
        yearOfPassing: Number(education?.yearOfPassing || education?.tenthOrTwelfth?.yearOfPassing || education?.graduation?.yearOfPassing) || new Date().getFullYear(),
        percentageOrCgpa: education?.percentageOrCgpa || education?.tenthOrTwelfth?.percentageOrCgpa || education?.graduation?.percentageOrCgpa || '',
        specialization: education?.specialization || education?.graduation?.specialization || '',
      },
      resume: resumeData,
      payment: {
        amount: payableAmount,
        status: 'PENDING',
        transactionId: null,
      },
      referral: referralData,
      status: 'PAYMENT_PENDING',
      statusHistory: [
        {
          previousStatus: null,
          newStatus: 'PAYMENT_PENDING',
          changedByName: 'Applicant (System)',
          changedAt: new Date(),
          remarks: referralData.isReferred
            ? `Application submitted with member referral discount (-₹${referralData.discountAmount}). Payable fee: ₹${payableAmount}.`
            : 'Application submitted successfully. Registration fee payment pending.',
        },
      ],
    });

    await application.save();

    // 7. Asynchronously trigger initial application submission email
    sendApplicationSubmittedEmail(application).catch((err) => {
      console.error('Non-blocking email sending error:', err);
    });

    res.status(201).json({
      success: true,
      message: 'Application registered successfully. Please proceed to complete the payment.',
      applicationId: application.applicationId,
      amount: application.payment.amount,
      discountAmount: referralData.discountAmount,
      referral: application.referral,
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

/**
 * @desc    Get public application details for payment page
 * @route   GET /api/applications/public/:applicationId
 * @access  Public
 */
const getPublicApplication = async (req, res, next) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findOne({ applicationId }).select(
      'applicationId personalDetails.fullName personalDetails.email personalDetails.phone applicantType payment referral status createdAt'
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found with the specified ID.',
      });
    }

    res.status(200).json({
      success: true,
      application: {
        applicationId: application.applicationId,
        fullName: application.personalDetails.fullName,
        email: application.personalDetails.email,
        phone: application.personalDetails.phone,
        applicantType: application.applicantType,
        payment: application.payment,
        referral: application.referral,
        status: application.status,
        createdAt: application.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Submit payment transaction ID (UTR)
 * @route   POST /api/applications/:applicationId/payment
 * @access  Public
 */
const submitPaymentTransaction = async (req, res, next) => {
  try {
    const { applicationId } = req.params;
    const { transactionId } = req.body;

    if (!transactionId || !transactionId.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid Transaction ID / UTR number.',
      });
    }

    // Validate minimum UTR length
    if (transactionId.trim().length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID appears too short. Please enter a valid 12-digit UTR number.',
      });
    }

    const application = await Application.findOne({ applicationId });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found with the specified ID.',
      });
    }

    // Guard: block re-submission if payment is already verified
    if (
      application.payment.status === 'RECEIVED' ||
      application.status === 'PAYMENT_RECEIVED' ||
      application.status === 'CONFIRMED'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Your payment has already been verified. No further action is required.',
        isAlreadyVerified: true,
      });
    }

    // Update payment details
    application.payment.transactionId = transactionId.trim().toUpperCase();
    application.payment.submittedAt = new Date();

    // Add status history entry
    application.statusHistory.push({
      previousStatus: application.status,
      newStatus: application.status,
      changedByName: 'Applicant (Self)',
      changedAt: new Date(),
      remarks: `Transaction ID (${transactionId.trim().toUpperCase()}) submitted for verification.`,
    });

    await application.save();

    res.status(200).json({
      success: true,
      message: 'Transaction details submitted successfully. Awaiting administrative verification.',
      application: {
        applicationId: application.applicationId,
        payment: application.payment,
        status: application.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get logged-in candidate's full application & status timeline
 * @route   GET /api/applications/my
 * @access  Private (Candidate with verified payment)
 */
const getMyApplication = async (req, res, next) => {
  try {
    let application = null;

    if (req.user.applicationId) {
      application = await Application.findOne({ applicationId: req.user.applicationId });
    } else {
      application = await Application.findOne({ 'personalDetails.email': req.user.email });
    }

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'No application profile found for your account.',
      });
    }

    res.status(200).json({
      success: true,
      application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Download own uploaded resume
 * @route   GET /api/applications/my/resume
 * @access  Private
 */
const downloadMyResume = async (req, res, next) => {
  try {
    let application = null;

    if (req.user.applicationId) {
      application = await Application.findOne({ applicationId: req.user.applicationId });
    } else {
      application = await Application.findOne({ 'personalDetails.email': req.user.email });
    }

    if (!application || !application.resume || !application.resume.filePath) {
      return res.status(404).json({
        success: false,
        message: 'Resume file not found for your application.',
      });
    }

    let filePath = path.resolve(application.resume.filePath);

    if (!fs.existsSync(filePath)) {
      const fallbackPath = path.resolve(process.cwd(), 'uploads', 'resumes', application.resume.fileName || path.basename(application.resume.filePath));
      if (fs.existsSync(fallbackPath)) {
        filePath = fallbackPath;
      } else {
        return res.status(404).json({
          success: false,
          message: 'Resume file does not exist on the server storage.',
        });
      }
    }

    res.download(filePath, application.resume.originalName);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get public referral program info
 * @route   GET /api/applications/referral-info
 * @access  Public
 */
const getReferralInfo = async (req, res, next) => {
  try {
    const settings = await referralService.getReferralSettings();
    res.status(200).json({
      success: true,
      isReferralEnabled: settings.isReferralEnabled,
      referralDiscount: settings.referralDiscount,
      baseApplicationFee: settings.baseApplicationFee,
      requireVerifiedReferrer: settings.requireVerifiedReferrer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Validate a referrer name and phone number
 * @route   POST /api/applications/validate-referral
 * @access  Public
 */
const validateReferral = async (req, res, next) => {
  try {
    const { referrerName, referrerPhone, candidatePhone, candidateEmail } = req.body;
    const result = await referralService.validateReferrer({
      referrerName,
      referrerPhone,
      candidatePhone,
      candidateEmail,
    });

    if (!result.isValid) {
      return res.status(400).json({
        success: false,
        message: result.message,
        isReferralEnabled: result.isReferralEnabled,
      });
    }

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export {
  submitApplication,
  getPublicApplication,
  submitPaymentTransaction,
  getMyApplication,
  downloadMyResume,
  getReferralInfo,
  validateReferral,
};
