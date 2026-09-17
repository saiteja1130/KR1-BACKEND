const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Application = require('../models/Application');

// Helper to generate JWT Token
const generateToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET || 'kr1_jwt_secret',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

/**
 * @desc    Login user / admin
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email address and password.',
      });
    }

    // Check for user and include password for comparison
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      // Check if application exists with this email
      const pendingApp = await Application.findOne({
        'personalDetails.email': email.toLowerCase().trim(),
      });

      if (pendingApp) {
        if (pendingApp.status === 'PAYMENT_PENDING' || pendingApp.payment.status === 'PENDING') {
          return res.status(403).json({
            success: false,
            paymentPending: true,
            applicationId: pendingApp.applicationId,
            message: `Application [${pendingApp.applicationId}] is pending payment verification. Login credentials will be generated and emailed once admin verifies your payment.`,
          });
        }
      }

      return res.status(401).json({
        success: false,
        notRegistered: true,
        message: 'No account found with this email address. Please click Apply to register your application.',
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please check your email and password.',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
      });
    }

    // Fetch linked application if USER role
    let applicationInfo = null;
    if (user.role === 'USER') {
      const application = await Application.findOne({
        $or: [
          { applicationId: user.applicationId },
          { 'personalDetails.email': user.email },
        ],
      }).select('applicationId status payment');

      if (application) {
        applicationInfo = {
          applicationId: application.applicationId,
          status: application.status,
          paymentStatus: application.payment.status,
        };
      }
    }

    const token = generateToken(user._id, user.role);

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        applicationId: user.applicationId,
        application: applicationInfo,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get currently authenticated user
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    let applicationInfo = null;
    if (user.role === 'USER') {
      const application = await Application.findOne({
        $or: [
          { applicationId: user.applicationId },
          { 'personalDetails.email': user.email },
        ],
      }).select('applicationId status payment');

      if (application) {
        applicationInfo = {
          applicationId: application.applicationId,
          status: application.status,
          paymentStatus: application.payment.status,
        };
      }
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        applicationId: user.applicationId,
        application: applicationInfo,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Change password
 * @route   POST /api/auth/change-password
 * @access  Private
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both current and new password.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
      });
    }

    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getMe,
  changePassword,
};
