// modules/dealer/routes/dealer.routes.js

const express = require('express');
const router = express.Router();
const dealerController = require('../controllers/dealer.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { checkRole } = require('../../../middleware/role.middleware');

// All routes require authentication
router.use(verifyToken);

// Dealer CRUD - Admin only
router.post('/', checkRole('admin', 'cashier'), dealerController.createDealer);
router.get('/', dealerController.getAllDealers);
router.get('/:dealerId', dealerController.getDealer);
router.put('/:dealerId', checkRole('admin', 'cashier'), dealerController.updateDealer);
router.put('/:dealerId/deactivate', checkRole('admin'), dealerController.deactivateDealer);
router.put('/:dealerId/activate', checkRole('admin'), dealerController.activateDealer);

// Tips
router.post('/tips', dealerController.recordDealerTip);
router.get('/tips/session/:sessionId', dealerController.getDealerTipsForSession);
router.get('/:dealerId/tips/summary', dealerController.getDealerTipsSummary);

module.exports = router;
