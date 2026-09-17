import express from 'express';
const router = express.Router();
import { login, getMe, changePassword } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

router.post('/login', login);
router.get('/me', protect, getMe);
router.post('/change-password', protect, changePassword);

export default router;
