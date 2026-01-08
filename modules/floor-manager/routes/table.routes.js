// ============================================
// FILE: modules/floor-manager/routes/table.routes.js
// API routes for table management
// ============================================

const express = require('express');
const router = express.Router();
const tableController = require('../controllers/table.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { isFloorManager } = require('../../../middleware/role.middleware');
const { validateTableCreate, validateDealerAssign } = require('../validators/table.validator');

// All routes require authentication
router.use(verifyToken);                                                                                                                

// Admin, Cashier, and Floor Manager can manage floor                                                                                                                                                                  
router.use(isFloorManager);

/**
 * @route   POST /api/floor-manager/tables
 * @desc    Create new table
 * @access  Admin, Cashier, Floor Manager
 */
router.post('/', validateTableCreate, tableController.createTable);




/**
 * @route   POST /api/floor-manager/tables/add-player
 * @desc    Add player to table
 */
router.post("/add-player", tableController.addPlayerToTable);



/**
 * @route   GET /api/floor-manager/tables                                                                                           
 * @desc    Get all active tables with players
 * @access  Admin, Cashier, Floor Manager                                                                          
 */
router.get('/', tableController.getAllTables);

/**
 * @route   POST /api/floor-manager/tables/assign-dealer
 * @desc    Assign dealer to table
 * @access  Admin, Cashier, Floor Manager
 */
router.post('/assign-dealer', validateDealerAssign, tableController.assignDealer);

/**
 * @route   DELETE /api/floor-manager/tables/:tableId/dealer
 * @desc    Remove dealer from table (send to break)
 * @access  Admin, Cashier, Floor Manager
 */
router.delete('/:tableId/dealer', tableController.removeDealer);

/**
 * @route   GET /api/floor-manager/tables/:tableId/statistics
 * @desc    Get table statistics before closing
 * @access  Admin, Cashier, Floor Manager
 */
router.get('/:tableId/statistics', tableController.getTableStatistics);

/**
 * @route   PUT /api/floor-manager/tables/:tableId/close
 * @desc    Close table
 * @access  Admin, Cashier, Floor Manager
 */
router.put('/:tableId/close', tableController.closeTable);

module.exports = router;