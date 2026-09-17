import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Application from '../models/Application.js';

/**
 * Protect routes - Verifies JWT token and attaches req.user
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authentication token provided.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'kr1_jwt_secret');

    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'The account associated with this token no longer exists.',
      });
    }

    if (!req.user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
      });
    }

    return next();
  } catch (error) {
    console.error('JWT Authentication Error:', error.message);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session token. Please log in again.',
    });
  }
};

/**
 * Authorize specific roles (e.g. 'ADMIN')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: User role '${req.user ? req.user.role : 'GUEST'}' is not authorized to access this resource.`,
      });
    }
    next();
  };
};

/**
 * Check if the candidate's payment has been verified (PAYMENT_RECEIVED)
 * Restricts unverified users from accessing the candidate dashboard / details
 */
const checkPaymentVerified = async (req, res, next) => {
  // Admins always bypass
  if (req.user && req.user.role === 'ADMIN') {
    return next();
  }

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
        message: 'No associated application found for your account.',
      });
    }

    if (application.status === 'PAYMENT_PENDING' || application.payment.status === 'PENDING') {
      return res.status(403).json({
        success: false,
        paymentPending: true,
        applicationId: application.applicationId,
        message: 'Access restricted: Your payment verification is currently pending. Dashboard will be unlocked once admin verifies payment.',
      });
    }

    req.application = application;
    next();
  } catch (error) {
    console.error('Payment Verification Middleware Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while checking payment verification status.',
    });
  }
};

export {
  protect,
  authorize,
  checkPaymentVerified,
};
