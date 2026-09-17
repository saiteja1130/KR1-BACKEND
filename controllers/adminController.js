const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Application = require('../models/Application');
const User = require('../models/User');
const { generateApplicationId } = require('../services/idGenerator');
const {
  sendPaymentReceivedCredentialsEmail,
  sendApplicationUnderReviewEmail,
  sendApplicationConfirmedEmail,
  sendApplicationRejectedEmail,
} = require('../services/emailService');

/**
 * Helper to generate random readable temporary password
 */
const generateTemporaryPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = 'KR@';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

/**
 * @desc    Get dashboard metrics & summary
 * @route   GET /api/admin/dashboard
 * @access  Private (Admin)
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalCount,
      paymentPendingCount,
      paymentReceivedCount,
      applicationPendingCount,
      confirmedCount,
      rejectedCount,
      recentApplications,
      pendingPaymentVerifications,
    ] = await Promise.all([
      Application.countDocuments(),
      Application.countDocuments({ status: 'PAYMENT_PENDING' }),
      Application.countDocuments({ status: 'PAYMENT_RECEIVED' }),
      Application.countDocuments({ status: 'APPLICATION_PENDING' }),
      Application.countDocuments({ status: 'CONFIRMED' }),
      Application.countDocuments({ status: 'REJECTED' }),
      Application.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .select('applicationId personalDetails applicantType payment status createdAt'),
      Application.find({
        status: 'PAYMENT_PENDING',
        'payment.transactionId': { $ne: null, $exists: true },
      })
        .sort({ 'payment.submittedAt': -1 })
        .limit(5)
        .select('applicationId personalDetails payment createdAt'),
    ]);

    const verifiedPaymentsCount = await Application.countDocuments({
      'payment.status': 'RECEIVED',
    });
    const totalRevenue = verifiedPaymentsCount * (Number(process.env.PAYMENT_AMOUNT) || 1000);

    res.status(200).json({
      success: true,
      stats: {
        total: totalCount,
        paymentPending: paymentPendingCount,
        paymentReceived: paymentReceivedCount,
        applicationPending: applicationPendingCount,
        confirmed: confirmedCount,
        rejected: rejectedCount,
        totalRevenue,
      },
      recentApplications,
      pendingPaymentVerifications,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all applications with search, filter, sort & pagination
 * @route   GET /api/admin/applications
 * @access  Private (Admin)
 */
const getApplications = async (req, res, next) => {
  try {
    const {
      search,
      status,
      applicantType,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10,
    } = req.query;

    const query = {};

    // 1. Status Filter
    if (status && status !== 'ALL') {
      query.status = status;
    }

    // 2. Applicant Type Filter
    if (applicantType && applicantType !== 'ALL') {
      query.applicantType = applicantType;
    }

    // 3. Search Filter
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { applicationId: searchRegex },
        { 'personalDetails.fullName': searchRegex },
        { 'personalDetails.email': searchRegex },
        { 'personalDetails.phone': searchRegex },
        { 'payment.transactionId': searchRegex },
      ];
    }

    // 4. Pagination & Sorting setup
    const pageNumber = Math.max(1, parseInt(page, 10));
    const limitNumber = Math.max(1, parseInt(limit, 10));
    const skip = (pageNumber - 1) * limitNumber;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const [applications, totalCount] = await Promise.all([
      Application.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNumber)
        .select(
          'applicationId personalDetails applicantType workExperience education payment status createdAt'
        ),
      Application.countDocuments(query),
    ]);

    const totalPages = Math.ceil(totalCount / limitNumber);

    res.status(200).json({
      success: true,
      applications,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: limitNumber,
        totalPages: totalPages || 1,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single application detail by ID
 * @route   GET /api/admin/applications/:id
 * @access  Private (Admin)
 */
const getApplicationById = async (req, res, next) => {
  try {
    const { id } = req.params;

    let application = null;
    if (id.startsWith('APP-')) {
      application = await Application.findOne({ applicationId: id })
        .populate('payment.verifiedBy', 'name email')
        .populate('statusHistory.changedBy', 'name email');
    } else {
      application = await Application.findById(id)
        .populate('payment.verifiedBy', 'name email')
        .populate('statusHistory.changedBy', 'name email');
    }

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found with specified identifier.',
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
 * @desc    Update application status & trigger automated email notifications / credential generation
 * @route   PATCH /api/admin/applications/:id/status
 * @access  Private (Admin)
 */
const updateApplicationStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, remarks = '' } = req.body;

    const validStatuses = [
      'PAYMENT_PENDING',
      'PAYMENT_RECEIVED',
      'APPLICATION_PENDING',
      'CONFIRMED',
      'REJECTED',
    ];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status provided. Allowed values: ${validStatuses.join(', ')}`,
      });
    }

    let application = null;
    if (id.startsWith('APP-')) {
      application = await Application.findOne({ applicationId: id });
    } else {
      application = await Application.findById(id);
    }

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found.',
      });
    }

    const previousStatus = application.status;
    let generatedPassword = null;
    let credentialsCreated = false;

    // Special logic for PAYMENT_RECEIVED
    if (status === 'PAYMENT_RECEIVED') {
      application.payment.status = 'RECEIVED';
      application.payment.verifiedAt = new Date();
      application.payment.verifiedBy = req.user._id;

      // Check if User account needs to be created or credentials sent
      let user = await User.findOne({ email: application.personalDetails.email.toLowerCase() });

      if (!user) {
        generatedPassword = generateTemporaryPassword();
        user = new User({
          name: application.personalDetails.fullName,
          email: application.personalDetails.email.toLowerCase(),
          phone: application.personalDetails.phone,
          password: generatedPassword,
          role: 'USER',
          applicationId: application.applicationId,
          isActive: true,
        });
        await user.save();
        credentialsCreated = true;
      } else if (!application.credentialsGenerated) {
        generatedPassword = generateTemporaryPassword();
        user.password = generatedPassword;
        user.applicationId = application.applicationId;
        await user.save();
        credentialsCreated = true;
      }

      application.user = user._id;
      application.credentialsGenerated = true;

      // Send email with credentials if newly generated
      if (credentialsCreated && generatedPassword) {
        sendPaymentReceivedCredentialsEmail(application, generatedPassword).catch((err) => {
          console.error('Non-blocking credentials email error:', err);
        });
      }
    } else if (status === 'APPLICATION_PENDING') {
      sendApplicationUnderReviewEmail(application).catch((err) => {
        console.error('Non-blocking application under review email error:', err);
      });
    } else if (status === 'CONFIRMED') {
      sendApplicationConfirmedEmail(application, remarks).catch((err) => {
        console.error('Non-blocking confirmation email error:', err);
      });
    } else if (status === 'REJECTED') {
      sendApplicationRejectedEmail(application, remarks).catch((err) => {
        console.error('Non-blocking rejection email error:', err);
      });
    }

    // Update status and append to history
    application.status = status;
    application.statusHistory.push({
      previousStatus,
      newStatus: status,
      changedBy: req.user._id,
      changedByName: req.user.name || 'Admin',
      changedAt: new Date(),
      remarks: remarks || `Status updated from ${previousStatus} to ${status} by Admin.`,
    });

    await application.save();

    res.status(200).json({
      success: true,
      message: `Application status updated to ${status} successfully.`,
      credentialsGenerated: credentialsCreated,
      application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Download candidate resume securely (Admin)
 * @route   GET /api/admin/applications/:id/resume
 * @access  Private (Admin)
 */
const downloadResume = async (req, res, next) => {
  try {
    const { id } = req.params;

    let application = null;
    if (id.startsWith('APP-')) {
      application = await Application.findOne({ applicationId: id });
    } else {
      application = await Application.findById(id);
    }

    if (!application || !application.resume || !application.resume.filePath) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found for this application.',
      });
    }

    const filePath = path.resolve(application.resume.filePath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Resume file does not exist on server storage.',
      });
    }

    res.download(filePath, application.resume.originalName);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create application entry manually from Admin Panel
 * @route   POST /api/admin/applications
 * @access  Private (Admin)
 */
const createAdminApplication = async (req, res, next) => {
  try {
    let personalDetails = req.body.personalDetails;
    let workExperience = req.body.workExperience;
    let education = req.body.education;
    const applicantType = req.body.applicantType || 'fresher';
    const status = req.body.status || 'PAYMENT_RECEIVED';
    const paymentStatus = req.body.paymentStatus || (status === 'PAYMENT_PENDING' ? 'PENDING' : 'RECEIVED');
    const transactionId = req.body.transactionId || null;
    const remarks = req.body.remarks || 'Manual candidate registration created by Admin.';
    const sendEmail = req.body.sendEmail !== false && req.body.sendEmail !== 'false';

    if (typeof personalDetails === 'string') {
      try { personalDetails = JSON.parse(personalDetails); } catch (e) { personalDetails = {}; }
    }
    if (typeof workExperience === 'string') {
      try { workExperience = JSON.parse(workExperience); } catch (e) { workExperience = {}; }
    }
    if (typeof education === 'string') {
      try { education = JSON.parse(education); } catch (e) { education = {}; }
    }

    if (!personalDetails?.fullName || !personalDetails?.email || !personalDetails?.phone) {
      return res.status(400).json({
        success: false,
        message: 'Full Name, Email Address, and Phone Number are required.',
      });
    }

    const applicationId = await generateApplicationId();

    // Build Resume Metadata (either uploaded file or manual record)
    let resumeData = null;
    if (req.file) {
      resumeData = {
        fileName: req.file.filename,
        originalName: req.file.originalname,
        filePath: req.file.path,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedAt: new Date(),
      };
    } else {
      resumeData = {
        fileName: 'admin_manual_entry.pdf',
        originalName: 'Candidate_File_On_Record.pdf',
        filePath: '',
        mimeType: 'application/pdf',
        size: 1024,
        uploadedAt: new Date(),
      };
    }

    const application = new Application({
      applicationId,
      personalDetails: {
        fullName: personalDetails.fullName.trim(),
        email: personalDetails.email.toLowerCase().trim(),
        phone: personalDetails.phone.trim(),
        altPhone: personalDetails.altPhone ? personalDetails.altPhone.trim() : '',
        address: personalDetails.address ? personalDetails.address.trim() : 'On File',
        city: personalDetails.city ? personalDetails.city.trim() : 'Kakinada',
        state: personalDetails.state ? personalDetails.state.trim() : 'Andhra Pradesh',
        pincode: personalDetails.pincode ? personalDetails.pincode.trim() : '533002',
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
        noticePeriod: workExperience?.noticePeriod || 'Immediate',
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
        tenthOrTwelfth: {
          qualificationType: education?.tenthOrTwelfth?.qualificationType || '12th / Intermediate',
          board: education?.tenthOrTwelfth?.board || 'State Board',
          instituteName: education?.tenthOrTwelfth?.instituteName || 'College / School',
          yearOfPassing: Number(education?.tenthOrTwelfth?.yearOfPassing) || new Date().getFullYear(),
          percentageOrCgpa: education?.tenthOrTwelfth?.percentageOrCgpa || 'N/A',
        },
        graduation: {
          degree: education?.graduation?.degree || 'Bachelor Degree',
          specialization: education?.graduation?.specialization || 'General',
          university: education?.graduation?.university || 'University',
          collegeName: education?.graduation?.collegeName || 'College',
          yearOfPassing: Number(education?.graduation?.yearOfPassing) || new Date().getFullYear(),
          percentageOrCgpa: education?.graduation?.percentageOrCgpa || 'N/A',
        },
      },
      resume: resumeData,
      payment: {
        amount: Number(req.body.amount) || Number(process.env.PAYMENT_AMOUNT) || 1000,
        status: paymentStatus,
        transactionId: transactionId || (paymentStatus === 'RECEIVED' ? 'ADMIN_DIRECT' : null),
        submittedAt: new Date(),
        verifiedAt: paymentStatus === 'RECEIVED' ? new Date() : null,
        verifiedBy: paymentStatus === 'RECEIVED' ? req.user._id : null,
        remarks: 'Admin registration',
      },
      status: status,
      statusHistory: [
        {
          previousStatus: null,
          newStatus: status,
          changedBy: req.user._id,
          changedByName: req.user.name || 'Admin',
          changedAt: new Date(),
          remarks: remarks,
        },
      ],
    });

    let generatedPassword = null;
    if (paymentStatus === 'RECEIVED' || status !== 'PAYMENT_PENDING') {
      let user = await User.findOne({ email: application.personalDetails.email.toLowerCase() });

      if (!user) {
        generatedPassword = generateTemporaryPassword();
        user = new User({
          name: application.personalDetails.fullName,
          email: application.personalDetails.email.toLowerCase(),
          phone: application.personalDetails.phone,
          password: generatedPassword,
          role: 'USER',
          applicationId: application.applicationId,
          isActive: true,
        });
        await user.save();
      }

      application.user = user._id;
      application.credentialsGenerated = true;

      if (sendEmail && generatedPassword) {
        sendPaymentReceivedCredentialsEmail(application, generatedPassword).catch((err) => {
          console.error('Non-blocking credentials email error on admin entry:', err);
        });
      }
    }

    await application.save();

    res.status(201).json({
      success: true,
      message: `Candidate application [${application.applicationId}] created successfully.`,
      application,
      generatedPassword,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboardStats,
  getApplications,
  getApplicationById,
  updateApplicationStatus,
  downloadResume,
  createAdminApplication,
};
