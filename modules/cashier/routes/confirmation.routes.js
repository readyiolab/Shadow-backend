// ============================================
// FILE: modules/cashier/routes/confirmation.routes.js
// Routes for cashier confirmation
// ============================================

const express = require('express');
const router = express.Router();
const confirmationController = require('../controllers/confirmation.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { checkRole } = require('../../../middleware/role.middleware');

router.use(verifyToken);
router.use(checkRole('admin', 'cashier'));
/**
 * @route   GET /api/cashier/confirmations/pending
 * @desc    Get all pending buy-in confirmation requests
 * @access  Admin, Cashier
 */
router.get('/pending', confirmationController.getPendingRequests);

/**
 * @route   PUT /api/cashier/confirmations/:request_id/accept
 * @desc    Accept request and issue chips (completes buy-in)
 * @access  Admin, Cashier
 */
router.put('/:request_id/accept', confirmationController.acceptAndIssueChips);

/**
 * @route   PUT /api/cashier/confirmations/:request_id/reject
 * @desc    Reject confirmation request
 * @access  Admin, Cashier
 */
router.put('/:request_id/reject', confirmationController.rejectRequest);

module.exports = router;
