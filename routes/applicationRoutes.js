import express from 'express';
const router = express.Router();
import {
  submitApplication,
  getPublicApplication,
  submitPaymentTransaction,
  getMyApplication,
  downloadMyResume,
  getReferralInfo,
  validateReferral,
} from '../controllers/applicationController.js';
import { protect, checkPaymentVerified } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

// Public endpoints
router.get('/referral-info', getReferralInfo);
router.post('/validate-referral', validateReferral);
router.post('/', upload.single('resume'), submitApplication);
router.get('/public/:applicationId', getPublicApplication);
router.post('/:applicationId/payment', submitPaymentTransaction);

// Protected Candidate Endpoints (Protected by JWT and requires verified payment)
router.get('/my', protect, checkPaymentVerified, getMyApplication);
router.get('/my/resume', protect, checkPaymentVerified, downloadMyResume);

export default router;
