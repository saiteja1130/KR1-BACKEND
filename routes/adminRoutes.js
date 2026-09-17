const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getApplications,
  getApplicationById,
  updateApplicationStatus,
  downloadResume,
  createAdminApplication,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// All admin routes require authentication and role = ADMIN
router.use(protect);
router.use(authorize('ADMIN'));

router.get('/dashboard', getDashboardStats);
router.get('/applications', getApplications);
router.post('/applications', upload.single('resume'), createAdminApplication);
router.get('/applications/:id', getApplicationById);
router.patch('/applications/:id/status', updateApplicationStatus);
router.get('/applications/:id/resume', downloadResume);

module.exports = router;
