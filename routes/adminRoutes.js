import express from 'express';
const router = express.Router();
import {
  getDashboardStats,
  getApplications,
  getApplicationById,
  updateApplicationStatus,
  downloadResume,
  createAdminApplication,
  getReferralSettings,
  updateReferralSettings,
  adjustCandidateDiscount,
} from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

// All admin routes require authentication and role = ADMIN
router.use(protect);
router.use(authorize('ADMIN'));

router.get('/dashboard', getDashboardStats);
router.get('/settings/referral', getReferralSettings);
router.put('/settings/referral', updateReferralSettings);
router.get('/applications', getApplications);
router.post('/applications', upload.single('resume'), createAdminApplication);
router.get('/applications/:id', getApplicationById);
router.patch('/applications/:id/status', updateApplicationStatus);
router.patch('/applications/:id/discount', adjustCandidateDiscount);
router.get('/applications/:id/resume', downloadResume);

export default router;
