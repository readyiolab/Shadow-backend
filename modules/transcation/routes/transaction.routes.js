const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { checkRole } = require('../../../middleware/role.middleware');
const {
  buyInValidator,
  cashPayoutValidator,
  returnChipsValidator,
  depositChipsValidator,
  adjustBalanceValidator,
  issueCreditValidator,
  settleCreditValidator,
  expenseValidator
} = require('../validators/transaction.validator');
const { validateRequest } = require('../../../utils/validation.util');
const { param, body } = require('express-validator');
const { uploadScreenshot, uploadAttachment } = require('../../../middleware/upload.middleware');

// All routes require authentication and cashier/admin role
router.use(verifyToken);
router.use(checkRole('cashier', 'admin'));

/**
 * ✅ UPLOAD SCREENSHOT for online payment
 * POST /api/transactions/upload-screenshot
 */
router.post('/upload-screenshot',
  uploadScreenshot.single('screenshot'),
  transactionController.uploadScreenshot
);

/**
 * ✅ BUY-IN: Player pays cash → receives mixed chips
 * POST /api/transactions/buy-in
 */
router.post('/buy-in', 
  buyInValidator, 
  validateRequest, 
  transactionController.createBuyIn
);

/**
 * ✅ CASH PAYOUT: Player returns mixed chips → receives cash
 * POST /api/transactions/cash-payout
 * Can cash out ANY AMOUNT up to player's current balance
 */
router.post('/cash-payout', 
  cashPayoutValidator, 
  validateRequest, 
  transactionController.createCashPayout
);

/**
 * ✅ DEPOSIT CHIPS: Player deposits chips for next session (no cash received)
 * POST /api/transactions/deposit-chips
 * Can deposit ANY AMOUNT up to player's current balance
 */
router.post('/deposit-chips', 
  depositChipsValidator, 
  validateRequest, 
  transactionController.depositChips
);

/**
 * ✅ DEPOSIT CASH: Player deposits cash which goes to secondary wallet
 * POST /api/transactions/deposit-cash
 */
router.post('/deposit-cash', 
  uploadScreenshot.single('screenshot'), // Optional screenshot for online deposits
  transactionController.depositCash
);

/**
 * ✅ RETURN CHIPS (Backward compatibility - uses deposit chips internally)
 * POST /api/transactions/return-chips
 */
router.post('/return-chips', 
  returnChipsValidator, 
  validateRequest, 
  transactionController.createReturnChips
);

/**
 * ✅ ADJUST BALANCE: Record player winnings/losses from dealer table
 * POST /api/transactions/adjust-balance
 * This is called when player plays at table and wins/loses
 */
router.post('/adjust-balance',
  adjustBalanceValidator,
  validateRequest,
  transactionController.adjustPlayerBalance
);

/**
 * Issue credit transaction
 * POST /api/transactions/issue-credit
 */
router.post('/issue-credit',
  issueCreditValidator,
  validateRequest,
  transactionController.issueCredit
);

/**
 * Settle credit transaction
 * POST /api/transactions/settle-credit
 */
router.post('/settle-credit', 
  settleCreditValidator, 
  validateRequest, 
  transactionController.settleCredit
);

/**
 * Record expense
 * POST /api/transactions/expense
 */
router.post('/expense', 
  expenseValidator, 
  validateRequest, 
  transactionController.createExpense
);

/**
 * ✅ GET player chip balance
 * GET /api/transactions/player/:playerId/chip-balance
 * Use this before cash payout to check available balance
 */
router.get('/player/:playerId/chip-balance',
  [param('playerId').isInt().withMessage('Player ID must be an integer')],
  validateRequest,
  transactionController.getPlayerChipBalance
);

/**
 * ✅ GET player's stored chips balance
 * GET /api/transactions/player/:playerId/stored-balance
 * Use this to show stored balance in buy-in form
 */
router.get('/player/:playerId/stored-balance',
  [param('playerId').isInt().withMessage('Player ID must be an integer')],
  validateRequest,
  transactionController.getPlayerStoredBalance
);

/**
 * ✅ REDEEM STORED CHIPS (Use stored balance for buy-in)
 * POST /api/transactions/redeem-stored
 * Player uses their stored chip balance to get chips
 */
router.post('/redeem-stored',
  transactionController.redeemStoredChips
);

/**
 * ✅ GET player adjustment history
 * GET /api/transactions/player/:playerId/adjustments
 */
router.get('/player/:playerId/adjustments',
  [param('playerId').isInt().withMessage('Player ID must be an integer')],
  validateRequest,
  transactionController.getPlayerAdjustments
);

/**
 * Get outstanding credits for current session
 * GET /api/transactions/outstanding-credits
 */
router.get('/outstanding-credits', 
  transactionController.getOutstandingCredits
);

/**
 * Get current session transactions
 * GET /api/transactions
 */
router.get('/', 
  transactionController.getCurrentSessionTransactions
);

/**
 * Get all transactions with filters (Admin only)
 * GET /api/transactions/all
 */
router.get('/all',
  checkRole('admin'),
  transactionController.getAllTransactions
);

/**
 * Get player cash deposits (buy-in transactions)
 * GET /api/transactions/player/:playerId/cash-deposits
 * NOTE: This must come before /player/:playerId to avoid route conflicts
 */
router.get('/player/:playerId/cash-deposits',
  [param('playerId').isInt().withMessage('Player ID must be an integer')],
  validateRequest,
  transactionController.getPlayerCashDeposits
);

/**
 * Get player transaction history
 * GET /api/transactions/player/:playerId
 */
router.get('/player/:playerId',
  [param('playerId').isInt().withMessage('Player ID must be an integer')],
  validateRequest,
  transactionController.getPlayerTransactionHistory
);

/**
 * Get transaction by ID
 * GET /api/transactions/:transactionId
 */
router.get('/:transactionId',
  [param('transactionId').isInt().withMessage('Transaction ID must be an integer')],
  validateRequest,
  transactionController.getTransactionById
);

/**
 * Add transaction note (with optional image attachment)
 * POST /api/transactions/:transactionId/notes
 */
router.post('/:transactionId/notes',
  [param('transactionId').isInt().withMessage('Transaction ID must be an integer')],
  validateRequest,
  uploadAttachment.single('image'), // ✅ Handle image upload
  transactionController.addTransactionNote
);

/**
 * Get transaction notes
 * GET /api/transactions/:transactionId/notes
 */
router.get('/:transactionId/notes',
  [param('transactionId').isInt().withMessage('Transaction ID must be an integer')],
  validateRequest,
  transactionController.getTransactionNotes
);

/**
 * Resolve transaction notes
 * POST /api/transactions/:transactionId/notes/resolve
 */
router.post('/:transactionId/notes/resolve',
  [param('transactionId').isInt().withMessage('Transaction ID must be an integer')],
  validateRequest,
  transactionController.resolveTransactionNotes
);

/**
 * Reverse transaction
 * POST /api/transactions/:transactionId/reverse
 */
router.post('/:transactionId/reverse',
  [param('transactionId').isInt().withMessage('Transaction ID must be an integer')],
  validateRequest,
  transactionController.reverseTransaction
);

/**
 * ✅ UPDATE TRANSACTION PLAYER NAME
 * PUT /api/transactions/:transactionId/player-name
 */
router.put('/:transactionId/player-name',
  [
    param('transactionId').isInt().withMessage('Transaction ID must be an integer'),
    body('player_id').isInt().withMessage('Player ID must be an integer'),
    body('player_name').notEmpty().withMessage('Player name is required'),
  ],
  validateRequest,
  transactionController.updateTransactionPlayerName
);

module.exports = router;