// modules/admin/routes/session.routes.js
// ✅ FIXED: Admin only handles cash float, no chip inventory

const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const sessionController = require('../controllers/session.controller');
const { verifyToken, requireRole } = require('../../../middleware/auth.middleware');

// Apply middleware to all routes
router.use(verifyToken);
router.use(requireRole('admin'));

/**
 * POST /api/admin/session/open
 * Open daily session with initial cash float (NO chip inventory)
 * Body: { owner_float: number }
 */
router.post(
  '/open',
  [
    body('owner_float')
      .notEmpty().withMessage('Owner float is required')
      .isFloat({ min: 0.01 }).withMessage('Owner float must be greater than 0')
      .toFloat()
  ],
  sessionController.openDailySession
);

/**
 * POST /api/admin/session/close
 * Close daily session
 */
router.post(
  '/close',
  sessionController.closeDailySession
);

/**
 * GET /api/admin/session/status
 * Get current active session status
 */
router.get(
  '/status',
  sessionController.getCurrentSessionStatus
);

/**
 * GET /api/admin/session/summaries
 * Get all session summaries (history)
 */
router.get(
  '/summaries',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
      .toInt()
  ],
  sessionController.getAllSessionSummaries
);

/**
 * GET /api/admin/session/:sessionId/summary-data
 * Get session summary calculation data
 */
router.get(
  '/:sessionId/summary-data',
  [
    param('sessionId')
      .notEmpty().withMessage('Session ID is required')
      .isInt().withMessage('Session ID must be a valid integer')
      .toInt()
  ],
  sessionController.getSessionSummaryData
);

/**
 * GET /api/admin/session/summary/:sessionId
 * Get specific session summary
 */
router.get(
  '/summary/:sessionId',
  [
    param('sessionId')
      .notEmpty().withMessage('Session ID is required')
      .isInt().withMessage('Session ID must be a valid integer')
      .toInt()
  ],
  sessionController.getSessionSummary
);

module.exports = router;