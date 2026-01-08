const express = require('express');
const router = express.Router();
const authController = require('../../player-auth/controllers/auth.controller');
const dashboardController = require('../../player-dashboard/controllers/dashboard.controller');
const {
  verifyPlayerToken,
  limitOTPRequests
} = require('../../../middleware/player-auth.middleware');
const { uploadKYCDocument } = require('../../../middleware/upload.middleware');
// ============================================
// PUBLIC ROUTES (No auth required)
// ============================================

// Request OTP (6-digit via 2Factor.in)
router.post('/auth/request-otp',
    limitOTPRequests,
    authController.requestOTP
  );
  
  // Verify OTP and login
  router.post('/auth/verify-otp',
    authController.verifyOTP
  );
  
  // Resend OTP
  router.post('/auth/resend-otp',
    limitOTPRequests,
    authController.resendOTP
  );

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

// Apply player authentication middleware to all routes below
router.use(verifyPlayerToken);

// Dashboard
router.get('/dashboard',
  dashboardController.getDashboard
);

// ============================================
// PROFILE ROUTES
// ============================================

// Get profile
router.get('/profile',
  dashboardController.getProfile
);

// Update profile (except phone and code)
router.put('/profile',
  dashboardController.updateProfile
);

// Get stats
router.get('/stats',
  dashboardController.getStats
);

// ============================================
// KYC ROUTES (Self-service)
// ============================================

// Get KYC status
router.get('/kyc/status',
  dashboardController.getKYCStatus
);

// Initiate DigiLocker KYC
router.post('/kyc/digilocker/initiate',
  dashboardController.initiateDigiLockerKYC
);

// Create manual KYC record
router.post('/kyc/manual/create',
  dashboardController.createManualKYC
);

// Upload KYC document
router.post('/kyc/manual/upload',
  uploadKYCDocument.single('document'),
  dashboardController.uploadKYCDocument
);

// Submit KYC for review
router.post('/kyc/manual/submit',
  dashboardController.submitKYC
);

// ============================================
// TRANSACTION & NOTIFICATION ROUTES
// ============================================

// Get transactions/credits
router.get('/transactions',
  dashboardController.getTransactions
);

// Get notifications
router.get('/notifications',
  dashboardController.getNotifications
);

// Mark notification as read
router.put('/notifications/:notification_id/read',
  dashboardController.markNotificationRead
);

// Register device for push notifications
router.post('/device/register',
  dashboardController.registerDevice
);

// ============================================
// LOGOUT
// ============================================

router.post('/auth/logout',
  authController.logout
);

module.exports = router;