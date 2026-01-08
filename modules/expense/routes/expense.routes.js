// modules/expense/routes/expense.routes.js

const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expense.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { checkRole } = require('../../../middleware/role.middleware');
const { uploadAttachment } = require('../../../middleware/upload.middleware');

// All routes require authentication
router.use(verifyToken);

// Player Expenses
router.post('/player', expenseController.recordPlayerExpense);
router.get('/player/session/:sessionId', expenseController.getPlayerExpensesForSession);

// Club Expenses - Admin and Cashier can record
router.post('/club', checkRole('admin', 'cashier'), expenseController.recordClubExpense);
router.get('/club/session/:sessionId', expenseController.getClubExpensesForSession);

// Upload attachment for expenses
router.post('/upload-attachment', 
  checkRole('admin', 'cashier'),
  uploadAttachment.single('attachment'),
  expenseController.uploadAttachment
);

// Summary
router.get('/summary/:sessionId', expenseController.getExpenseSummary);

module.exports = router;
