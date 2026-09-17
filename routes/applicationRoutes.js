const express = require('express');
const router = express.Router();
const {
  submitApplication,
  getPublicApplication,
  submitPaymentTransaction,
  getMyApplication,
  downloadMyResume,
} = require('../controllers/applicationController');
const { protect, checkPaymentVerified } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Public endpoints
router.post('/', upload.single('resume'), submitApplication);
router.get('/public/:applicationId', getPublicApplication);
router.post('/:applicationId/payment', submitPaymentTransaction);

// Protected Candidate Endpoints (Protected by JWT and requires verified payment)
router.get('/my', protect, checkPaymentVerified, getMyApplication);
router.get('/my/resume', protect, checkPaymentVerified, downloadMyResume);

module.exports = router;
