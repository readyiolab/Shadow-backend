const express = require('express');
const router = express.Router();
const twoFAController = require('../controllers/2fa.controller');
const authMiddleware = require('../../../middleware/auth.middleware');
const twoFAValidator = require('../validators/2fa.validator');

// All routes require authentication
router.use(authMiddleware.verifyToken);

// Setup 2FA
router.post('/setup', twoFAController.setup);

// Verify 2FA token
router.post('/verify', 
  twoFAValidator.verifyToken, 
  twoFAController.verify
);

// Disable 2FA
router.post('/disable', 
  twoFAValidator.disable, 
  twoFAController.disable
);

// Get 2FA status
router.get('/status', twoFAController.getStatus);

// Regenerate backup codes
router.post('/regenerate-backup-codes', 
  twoFAValidator.verifyToken, 
  twoFAController.regenerateBackupCodes
);

module.exports = router;