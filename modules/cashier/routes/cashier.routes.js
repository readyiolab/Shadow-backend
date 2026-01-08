const express = require('express');
const router = express.Router();
const cashierController = require('../controllers/cashier.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { checkRole, isFloorManager } = require('../../../middleware/role.middleware');
const { 
  openSessionValidator,
  setChipInventoryValidator,
  updateChipInventoryValidator,
  addCashFloatValidator,
  setCreditLimitValidator,
  sessionIdValidator,
  dateValidator
} = require('../validators/cashier.validator');
const { validateRequest } = require('../../../utils/validation.util');

// All routes require authentication
router.use(verifyToken);

// ==========================================
// SESSION MANAGEMENT (Cashier & Admin)
// ==========================================

/**
 * Open session (Cashier & Admin)
 * POST /api/cashier/open-session
 */
router.post('/open-session', 
  checkRole('cashier', 'admin'), 
  openSessionValidator, 
  validateRequest, 
  cashierController.openSession
);

/**
 * Start session with chip inventory (Cashier & Admin)
 * POST /api/cashier/start-session
 */
router.post('/start-session', 
  checkRole('cashier', 'admin'), 
  cashierController.startSession
);

/**
 * Close session (Cashier & Admin)
 * POST /api/cashier/close-session
 */
router.post('/close-session', 
  checkRole('cashier', 'admin'), 
  cashierController.closeSession
);

/**
 * Get today's session (Cashier, Admin & Floor Manager)
 * GET /api/cashier/today-session
 */
router.get('/today-session',
  isFloorManager,  // Allows floor_manager, cashier, admin
  cashierController.getTodaySession
);

/**
 * Get all session summaries (Admin only)
 * GET /api/cashier/summaries
 */
router.get('/summaries', 
  checkRole('admin'), 
  cashierController.getAllSummaries
);

/**
 * Get specific session summary (Admin only)
 * GET /api/cashier/summary/:session_id
 */
router.get('/summary/:session_id', 
  checkRole('admin'),
  sessionIdValidator,
  validateRequest,
  cashierController.getSessionSummary
);

/**
 * Get session by date (Cashier & Admin)
 * GET /api/cashier/session/date/:date
 */
router.get('/session/date/:date', 
  checkRole('cashier', 'admin'),
  dateValidator,
  validateRequest,
  cashierController.getSessionByDate
);

// ==========================================
// DASHBOARD (Cashier, Admin & Floor Manager)
// ==========================================

/**
 * Get dashboard (Cashier, Admin & Floor Manager)
 * GET /api/cashier/dashboard
 */
router.get('/dashboard',
  isFloorManager,  // Allows floor_manager, cashier, admin
  cashierController.getDashboard
);

// ==========================================
// CHIP INVENTORY MANAGEMENT (Cashier & Admin)
// ==========================================

/**
 * ✅ SET CHIP INVENTORY (Cashier & Admin)
 * POST /api/cashier/set-chip-inventory
 */
router.post(
  '/set-chip-inventory',
  checkRole('cashier', 'admin'),
  setChipInventoryValidator,
  validateRequest,
  cashierController.setChipInventory
);

/**
 * ✅ UPDATE CHIP INVENTORY (Cashier & Admin)
 * POST /api/cashier/update-chip-inventory
 */
router.post(
  '/update-chip-inventory',
  checkRole('cashier', 'admin'),
  updateChipInventoryValidator,
  validateRequest,
  cashierController.updateChipInventory
);

/**
 * Get chip adjustment history (Cashier & Admin)
 * GET /api/cashier/chip-adjustments
 */
router.get(
  '/chip-adjustments',
  checkRole('cashier', 'admin'),
  cashierController.getChipAdjustments
);

/**
 * ✅ NEW: Get chip inventory status (Cashier & Admin)
 * GET /api/cashier/chip-inventory-status
 */
router.get(
  '/chip-inventory-status',
  checkRole('cashier', 'admin'),
  cashierController.getChipInventoryStatus
);

/**
 * ✅ NEW: Get chip movement log (Cashier & Admin)
 * GET /api/cashier/chip-movements
 */
router.get(
  '/chip-movements',
  checkRole('cashier', 'admin'),
  cashierController.getChipMovements
);

// ==========================================
// FLOAT MANAGEMENT (Cashier & Admin)
// ==========================================

/**
 * ✅ Add cash float (Mali) - For when cashier needs more cash for payouts
 * POST /api/cashier/add-cash-float
 */
router.post('/add-cash-float',
  checkRole('cashier', 'admin'),
  addCashFloatValidator,
  validateRequest,
  cashierController.addCashFloat
);

/**
 * ✅ ADD CHIPS ONLY (no float change)
 * POST /api/cashier/add-chips
 */
router.post('/add-chips',
  checkRole('cashier', 'admin'),
  cashierController.addChipsOnly
);

/**
 * ✅ NEW: Get float addition history (Cashier & Admin)
 * GET /api/cashier/float-history
 */
router.get('/float-history',
  checkRole('cashier', 'admin'),
  cashierController.getFloatHistory
);

/**
 * ✅ NEW: Get float addition history for specific session (Cashier & Admin)
 * GET /api/cashier/float-history/:sessionId
 */
router.get('/float-history/:sessionId',
  checkRole('cashier', 'admin'),
  cashierController.getFloatHistoryBySession
);

/**
 * ✅ NEW: Get float summary (Cashier & Admin)
 * GET /api/cashier/float-summary
 */
router.get('/float-summary',
  checkRole('cashier', 'admin'),
  cashierController.getFloatSummary
);

// ==========================================
// CREDIT LIMIT MANAGEMENT
// ==========================================

/**
 * ✅ Set cashier credit limit per session (Admin only)
 * POST /api/cashier/set-credit-limit
 */
router.post('/set-credit-limit',
  checkRole('admin'),
  setCreditLimitValidator,
  validateRequest,
  cashierController.setCreditLimit
);

/**
 * ✅ Get cashier credit limit (Cashier & Admin)
 * GET /api/cashier/credit-limit/:session_id
 */
router.get('/credit-limit/:session_id',
  checkRole('cashier', 'admin'),
  sessionIdValidator,
  validateRequest,
  cashierController.getCreditLimit
);

/**
 * ✅ Get all credit limit history (Admin only)
 * GET /api/cashier/credit-limits-history
 */
router.get('/credit-limits-history',
  checkRole('admin'),
  cashierController.getCreditLimitsHistory
);

module.exports = router;