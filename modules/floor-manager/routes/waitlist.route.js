// ============================================
// FILE: modules/floor-manager/routes/waitlist.routes.js
// API routes for waitlist management
// ============================================

const express = require('express');
const router = express.Router();
const waitlistController = require('../controllers/waitlist.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { isFloorManager } = require('../../../middleware/role.middleware');
const { validateWaitlist } = require('../validators/waitlist.validator');

router.use(verifyToken);
router.use(isFloorManager);

/**
 * @route   POST /api/floor-manager/waitlist
 * @desc    Add player to waitlist
 * @access  Admin, Cashier, Floor Manager
 */
router.post('/', validateWaitlist, waitlistController.addToWaitlist);

/**
 * @route   GET /api/floor-manager/waitlist
 * @desc    Get all waiting players
 * @access  Admin, Cashier, Floor Manager
 */
router.get('/', waitlistController.getWaitlist);

/**
 * @route   PUT /api/floor-manager/waitlist/:waitlistId/seat
 * @desc    Seat player from waitlist
 * @access  Admin, Cashier, Floor Manager
 */
router.put('/:waitlistId/seat', waitlistController.seatFromWaitlist);

/**
 * @route   DELETE /api/floor-manager/waitlist/:waitlistId
 * @desc    Cancel waitlist entry
 * @access  Admin, Cashier, Floor Manager
 */
router.delete('/:waitlistId', waitlistController.cancelWaitlist);

module.exports = router;