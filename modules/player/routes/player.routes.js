// ============================================
// routes/player.routes.js
// Updated: Allow floor_manager to create players
// ============================================
const express = require('express');
const router = express.Router();
const playerController = require('../controllers/player.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { checkRole, isFloorManager } = require('../../../middleware/role.middleware');
const {
  createPlayerValidator,
  updatePlayerValidator,
  blacklistPlayerValidator,
  addNoteValidator,
  searchPlayersValidator
} = require('../validators/player.validator');
const { validateRequest } = require('../../../utils/validation.util');

// All routes require authentication
router.use(verifyToken);

// Player CRUD
// ✅ UPDATED: Allow floor_manager to create players (needed for walk-in players)
router.post('/', 
  isFloorManager,  // Now allows floor_manager, cashier, admin
  createPlayerValidator, 
  validateRequest, 
  playerController.createPlayer
);

router.get('/', 
  isFloorManager,  // Allows floor_manager, cashier, admin
  playerController.getAllPlayers
);

router.get('/kyc-data/all', 
  checkRole('cashier', 'admin'), 
  playerController.getAllPlayersWithKYC
);

router.get('/search', 
  isFloorManager,  // Allows floor_manager, cashier, admin
  searchPlayersValidator, 
  validateRequest, 
  playerController.searchPlayers
);

router.get('/with-credit', 
  checkRole('cashier', 'admin'), 
  playerController.getPlayersWithCredit
);

router.get('/top-players', 
  checkRole('cashier', 'admin'), 
  playerController.getTopPlayers
);

router.get('/phone/:phone_number', 
  isFloorManager,  // ✅ Allow floor_manager to search by phone
  playerController.getPlayerByPhone
);

router.get('/:identifier', 
  isFloorManager,  // Allows floor_manager, cashier, admin
  playerController.getPlayer
);

router.put('/:player_id', 
  checkRole('cashier', 'admin'), 
  updatePlayerValidator, 
  validateRequest, 
  playerController.updatePlayer
);

// Player status management
router.post('/:player_id/deactivate', 
  checkRole('cashier', 'admin'), 
  playerController.deactivatePlayer
);

router.post('/:player_id/activate', 
  checkRole('cashier', 'admin'), 
  playerController.activatePlayer
);

router.post('/:player_id/blacklist', 
  checkRole('cashier', 'admin'), 
  blacklistPlayerValidator, 
  validateRequest, 
  playerController.blacklistPlayer
);

router.post('/:player_id/unblacklist', 
  checkRole('cashier', 'admin'), 
  playerController.unblacklistPlayer
);

// Player statistics and notes
router.get('/:player_id/stats', 
  checkRole('cashier', 'admin'), 
  playerController.getPlayerStats
);

router.get('/:player_id/notes', 
  checkRole('cashier', 'admin'), 
  playerController.getPlayerNotes
);

router.get('/:player_id/bonus', 
  checkRole('cashier', 'admin'), 
  playerController.getPlayerBonus
);

router.post('/:player_id/notes', 
  checkRole('cashier', 'admin'), 
  addNoteValidator, 
  validateRequest, 
  playerController.addPlayerNote
);

/**
 * ✅ SET PLAYER CREDIT LIMIT (Admin only)
 * POST /api/players/:player_id/credit-limit
 */
router.post('/:player_id/credit-limit',
  checkRole('cashier', 'admin'),
  playerController.setPlayerCreditLimit
);

/**
 * ✅ GET PLAYER CREDIT STATUS
 * GET /api/players/:player_id/credit-status
 */
router.get('/:player_id/credit-status',
  checkRole('cashier', 'admin'),
  playerController.getPlayerCreditStatus
);

/**
 * ✅ TOGGLE HOUSE PLAYER STATUS
 * POST /api/players/:player_id/toggle-house-player
 */
router.post('/:player_id/toggle-house-player',
  checkRole('cashier', 'admin'),
  playerController.toggleHousePlayer
);

module.exports = router;