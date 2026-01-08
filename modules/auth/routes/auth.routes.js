// ============================================
// 5. AUTH ROUTES (routes/auth.routes.js)
// ============================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { loginValidator, registerValidator, otpValidator } = require('../validators/auth.validator');
const { validateRequest } = require('../../../utils/validation.util');

// ===== PUBLIC ROUTES =====

/**
 * Register new user (Admin only in production)
 */
router.post('/register', 
  registerValidator, 
  validateRequest, 
  authController.register
);

/**
 * Login - Step 1: Email & Password
 * Returns: {requiresOTP: true/false, user_id, token?}
 */
router.post('/login', 
  loginValidator, 
  validateRequest, 
  authController.login
);

/**
 * Login - Step 2: Verify OTP
 * Returns: {token, user}
 */
router.post('/verify-otp', 
  otpValidator, 
  validateRequest, 
  authController.verifyOTP
);

/**
 * Resend OTP
 */
router.post('/resend-otp', 
  authController.resendOTP
);

// ===== PROTECTED ROUTES =====

/**
 * Logout
 */
router.post('/logout', 
  verifyToken, 
  authController.logout
);

/**
 * Get Profile
 */
router.get('/profile', 
  verifyToken, 
  authController.getProfile
);

module.exports = router;
