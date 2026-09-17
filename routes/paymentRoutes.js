import express from 'express';
const router = express.Router();
import {
  createPaymentOrder,
  getPaymentStatus,
  getApplicationPaymentStatus,
  handleWebhook,
  refundPaymentOrder,
  checkRefundStatus,
} from '../controllers/paymentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

// Public Payment Endpoints
router.post('/create', createPaymentOrder);
router.get('/:merchantOrderId/status', getPaymentStatus);
router.get('/application/:applicationId/status', getApplicationPaymentStatus);

// Server-to-server webhook endpoint
router.post('/phonepe/webhook', handleWebhook);

// Admin-only refund endpoints
router.post('/:merchantOrderId/refund', protect, authorize('ADMIN'), refundPaymentOrder);
router.get('/refund/:refundId/status', protect, authorize('ADMIN'), checkRefundStatus);

export default router;
