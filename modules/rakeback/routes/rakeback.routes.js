// ============================================
// FILE: modules/rakeback/routes/rakeback.routes.js
// Rakeback Routes with Session Tracking
// ============================================

const express = require('express');
const router = express.Router();
const rakebackController = require('../controllers/rakeback.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { checkRole } = require('../../../middleware/role.middleware');

// All routes require authentication
router.use(verifyToken);

// ==========================================
// RAKEBACK TYPE MANAGEMENT
// ==========================================

/**
 * GET RAKEBACK TYPES
 * GET /api/rakeback/types
 */
router.get('/types', rakebackController.getRakebackTypes);

/**
 * CREATE RAKEBACK TYPE
 * POST /api/rakeback/types
 * Body: { required_hours, default_amount }
 */
router.post(
  '/types',
  checkRole('admin', 'floor_manager'),
  rakebackController.createRakebackType
);

/**
 * UPDATE RAKEBACK TYPE
 * PUT /api/rakeback/types/:typeCode
 * Body: { required_hours?, default_amount? }
 */
router.put(
  '/types/:typeCode',
  checkRole('admin', 'floor_manager'),
  rakebackController.updateRakebackType
);

/**
 * DELETE RAKEBACK TYPE (soft delete)
 * DELETE /api/rakeback/types/:typeCode
 */
router.delete(
  '/types/:typeCode',
  checkRole('admin', 'floor_manager'),
  rakebackController.deleteRakebackType
);

// ==========================================
// PLAYER MANAGEMENT
// ==========================================

/**
 * GET ACTIVE SEATED PLAYERS WITH SESSION TIMERS
 * GET /api/rakeback/active-players?sessionId=xxx
 */
router.get(
  '/active-players',
  checkRole('admin', 'cashier', 'floor_manager'),
  rakebackController.getActiveSeatedPlayers
);

/**
 * GET ELIGIBLE PLAYERS
 * GET /api/rakeback/eligible?sessionId=xxx
 */
router.get(
  '/eligible',
  checkRole('admin', 'cashier', 'floor_manager'),
  rakebackController.getEligiblePlayers
);

// ==========================================
// RAKEBACK ASSIGNMENT
// ==========================================

/**
 * ASSIGN RAKEBACK TO PLAYER
 * POST /api/rakeback/assign
 * Body: { table_player_id, rakeback_type_code }
 */
router.post(
  '/assign',
  checkRole('admin', 'cashier', 'floor_manager'),
  rakebackController.assignRakeback
);

/**
 * CANCEL RAKEBACK ASSIGNMENT
 * DELETE /api/rakeback/assignment/:assignmentId
 */
router.delete(
  '/assignment/:assignmentId',
  checkRole('admin', 'floor_manager'),
  rakebackController.cancelAssignment
);

// ==========================================
// RAKEBACK PROCESSING
// ==========================================

/**
 * PROCESS RAKEBACK (give chips when eligible)
 * POST /api/rakeback/process
 * Body: { assignment_id, chip_breakdown }
 */
router.post(
  '/process',
  checkRole('admin', 'cashier'),
  rakebackController.processRakeback
);

/**
 * UPDATE RAKEBACK ELIGIBILITY (background job)
 * POST /api/rakeback/update-eligibility
 */
router.post(
  '/update-eligibility',
  checkRole('admin', 'cashier', 'floor_manager'),
  rakebackController.updateEligibility
);

// ==========================================
// HISTORY & REPORTS
// ==========================================

/**
 * GET RAKEBACKS FOR SESSION
 * GET /api/rakeback/session/:sessionId
 */
router.get('/session/:sessionId', rakebackController.getRakebacksForSession);

/**
 * GET PLAYER RAKEBACK HISTORY
 * GET /api/rakeback/player/:playerId
 */
router.get('/player/:playerId', rakebackController.getPlayerRakebackHistory);

module.exports = router;