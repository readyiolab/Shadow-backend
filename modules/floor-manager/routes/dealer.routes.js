// ============================================
// FILE: modules/floor-manager/routes/dealer.routes.js
// ============================================

const express = require('express');
const router = express.Router();
const dealerController = require('../controllers/dealer.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { isFloorManager } = require('../../../middleware/role.middleware');
const { validateDealer } = require('../validators/dealer.validator');

router.use(verifyToken);
router.use(isFloorManager);

// GET /api/dealers
router.get('/', dealerController.getAllDealers);

// POST /api/dealers
router.post('/', validateDealer, dealerController.createDealer);

// PUT /api/dealers/:dealerId/break
router.put('/:dealerId/break', dealerController.sendDealerOnBreak);

// PUT /api/dealers/:dealerId/available
router.put('/:dealerId/available', dealerController.markDealerAvailable);

module.exports = router;