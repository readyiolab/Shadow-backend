// modules/credit/routes/creditRequest.routes.js

const express = require('express');
const router = express.Router();
const creditRequestController = require('../controllers/creditRequest.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { checkRole } = require('../../../middleware/role.middleware');
const { creditRequestValidator, approvalValidator } = require('../validators/creditRequest.validator');
const { validateRequest } = require('../../../utils/validation.util');

// All routes require authentication
router.use(verifyToken);

/**
 * CREATE CREDIT REQUEST (Cashier & Admin)
 * 
 * SMART LOGIC:
 * - If requested_amount <= available_float → AUTO APPROVE ✅
 * - If requested_amount > available_float → SEND TO ADMIN ⏳
 * 
 * POST /api/credit/request
 */
router.post('/request', 
  checkRole('cashier', 'admin'),
  creditRequestValidator,
  validateRequest,
  creditRequestController.createRequest
);

/**
 * GET PENDING CREDIT REQUESTS (Admin)
 * 
 * Returns only requests waiting for admin approval
 * (Auto-approved requests are NOT included here)
 * 
 * GET /api/credit/pending
 */
router.get('/pending',
  checkRole('admin'),
  creditRequestController.getPendingRequests
);

/**
 * GET AUTO-APPROVED CREDIT REQUESTS (Admin/Cashier)
 * 
 * Returns only auto-approved requests (no admin action needed)
 * 
 * GET /api/credit/auto-approved
 */
router.get('/auto-approved',
  checkRole('cashier', 'admin'),
  creditRequestController.getAutoApprovedRequests
);

/**
 * GET ALL CREDIT REQUESTS (Admin)
 * 
 * Returns all requests: pending, approved, and rejected
 * Useful for admin approval dashboard
 * 
 * GET /api/credit/all
 */
router.get('/all',
  checkRole('admin'),
  creditRequestController.getAllRequests
);

/**
 * APPROVE PENDING CREDIT REQUEST (Admin only)
 * 
 * Only works for pending requests (status = 'pending')
 * Auto-approved requests don't need this endpoint
 * 
 * POST /api/credit/approve/:request_id
 */
router.post('/approve/:request_id',
  checkRole('admin'),
  approvalValidator,
  validateRequest,
  creditRequestController.approveRequest
);

/**
 * REJECT PENDING CREDIT REQUEST (Admin only)
 * 
 * Only works for pending requests
 * 
 * POST /api/credit/reject/:request_id
 */
router.post('/reject/:request_id',
  checkRole('admin'),
  approvalValidator,
  validateRequest,
  creditRequestController.rejectRequest
);

/**
 * GET CREDIT REQUEST STATISTICS (Admin & Cashier)
 * ✅ FIXED: Now allows both cashier and admin
 * 
 * Returns stats like:
 * - Total pending
 * - Total auto-approved
 * - Total value
 * 
 * GET /api/credit/stats/session/:session_id
 */
router.get('/stats/session/:session_id',
  checkRole('cashier', 'admin'),  // ✅ FIXED: Added cashier role
  creditRequestController.getStats
);

/**
 * GET SESSION CREDIT REQUESTS (All types)
 * 
 * Returns both pending and auto-approved requests for a session
 * 
 * GET /api/credit/session/:session_id
 */
router.get('/session/:session_id',
  checkRole('cashier', 'admin'),
  creditRequestController.getSessionRequests
);

/**
 * ✅ NEW: GET PLAYER CHIP HOLDINGS (Cashier & Admin)
 * 
 * Returns all players with their chip holdings in a session
 * Includes chip breakdown and current balance
 * 
 * GET /api/credit/player-chip-holdings
 */
router.get('/player-chip-holdings',
  checkRole('cashier', 'admin'),
  creditRequestController.getPlayerChipHoldings
);

/**
 * ✅ NEW: GET SPECIFIC PLAYER'S CHIP DETAILS (Cashier & Admin)
 * 
 * Returns detailed chip holding info for a specific player
 * 
 * GET /api/credit/player-chips/:player_id
 */
router.get('/player-chips/:player_id',
  checkRole('cashier', 'admin'),
  creditRequestController.getPlayerChipDetail
);

/**
 * GET SPECIFIC CREDIT REQUEST DETAILS
 * 
 * Returns detailed info including approval type
 * 
 * GET /api/credit/:request_id
 */
router.get('/:request_id',
  checkRole('cashier', 'admin'),
  creditRequestController.getRequestDetails
);

module.exports = router;