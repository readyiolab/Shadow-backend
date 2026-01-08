// ============================================
// FILE: modules/floor-manager/routes/player.routes.js
// API routes for player management
// ============================================

const express = require('express');
const router = express.Router();
const playerController = require('../controllers/player.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { isFloorManager } = require('../../../middleware/role.middleware');
const { validateAddPlayer, validateRebuy } = require('../validators/player.validator');

router.use(verifyToken);
router.use(isFloorManager);                                                                                                                                                          

/**
 * @route   POST /api/floor-manager/players
 * @desc    Add player to table (creates AWAITING_CONFIRMATION status)
 * @access  Admin, Cashier, Floor Manager
 */
router.post('/', validateAddPlayer, playerController.addPlayer);

/**
 * @route   PUT /api/floor-manager/players/:tablePlayerId/mark-buyin-completed
 * @desc    Mark buy-in as completed (for players who already have chips)
 * @access  Admin, Cashier, Floor Manager
 */
router.put('/:tablePlayerId/mark-buyin-completed', playerController.markBuyinCompleted);

/**
 * @route   POST /api/floor-manager/players/rebuy
 * @desc    Add rebuy for player (sends to cashier for confirmation)
 * @access  Admin, Cashier, Floor Manager
 */
router.post('/rebuy', validateRebuy, playerController.addRebuy);

/**
 * @route   PUT /api/floor-manager/players/:tablePlayerId/break
 * @desc    Set player on break
 * @access  Admin, Cashier, Floor Manager
 */
router.put('/:tablePlayerId/break', playerController.setOnBreak);

/**
 * @route   PUT /api/floor-manager/players/:tablePlayerId/resume
 * @desc    Resume player from break
 * @access  Admin, Cashier, Floor Manager
 */
router.put('/:tablePlayerId/resume', playerController.resumeBreak);

/**
 * @route   PUT /api/floor-manager/players/:tablePlayerId/call-time
 * @desc    Set call time for player (must play 60 more minutes)
 * @access  Admin, Cashier, Floor Manager
 */
router.put('/:tablePlayerId/call-time', playerController.callTime);

/**
 * @route   PUT /api/floor-manager/players/:tablePlayerId/extend-call-time
 * @desc    Extend call time by additional minutes
 * @access  Admin, Cashier, Floor Manager
 */
router.put('/:tablePlayerId/extend-call-time', playerController.extendCallTime);

/**
 * @route   PUT /api/floor-manager/players/:tablePlayerId/transfer
 * @desc    Transfer player to another table
 * @access  Admin, Cashier, Floor Manager
 */
router.put('/:tablePlayerId/transfer', playerController.transferPlayer);

/**
 * @route   DELETE /api/floor-manager/players/:tablePlayerId
 * @desc    Remove player from table
 * @access  Admin, Cashier, Floor Manager
 */
router.delete('/:tablePlayerId', playerController.removePlayer);

/**
 * @route   GET /api/floor-manager/players/:tablePlayerId/history
 * @desc    Get player time history
 * @access  Admin, Cashier, Floor Manager
 */
router.get('/:tablePlayerId/history', playerController.getPlayerTimeHistory);

module.exports = router;