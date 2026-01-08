// modules/transaction/controllers/transaction.controller.js
// UPDATED VERSION WITH PROPER RESPONSES

const transactionService = require('../services/transaction.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');
const { logAudit } = require('../../../utils/logger.util');

class TransactionController {
  /**
   * ✅ CREATE BUY-IN TRANSACTION
   * POST /api/transactions/buy-in
   */
  async createBuyIn(req, res, next) {
    try {
      const result = await transactionService.createBuyIn(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'CREATE_BUYIN',
        'tbl_transactions',
        result.transaction_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        'Buy-in transaction created successfully',
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ CREATE CASH PAYOUT TRANSACTION
   * POST /api/transactions/cash-payout
   */
  async createCashPayout(req, res, next) {
    try {
      const result = await transactionService.createCashPayout(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'CREATE_CASH_PAYOUT',
        'tbl_transactions',
        result.transaction_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        'Cash payout completed successfully',
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ DEPOSIT CHIPS (New - replaces return chips)
   * POST /api/transactions/deposit-chips
   */
  async depositChips(req, res, next) {
    try {
      const result = await transactionService.depositChips(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'DEPOSIT_CHIPS',
        'tbl_transactions',
        result.transaction_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        result.message,
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ DEPOSIT CASH - Player deposits cash to secondary wallet
   * POST /api/transactions/deposit-cash
   */
  async depositCash(req, res, next) {
    try {
      // Handle screenshot file if uploaded
      const data = {
        ...req.body,
        screenshot: req.file || null
      };

      const result = await transactionService.depositCash(
        data,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'DEPOSIT_CASH',
        'tbl_transactions',
        result.transaction_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        result.message,
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ CREATE RETURN CHIPS TRANSACTION (Backward compatibility)
   * POST /api/transactions/return-chips
   */
  async createReturnChips(req, res, next) {
    try {
      const result = await transactionService.depositChips(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'CREATE_RETURN_CHIPS',
        'tbl_transactions',
        result.transaction_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        result.message,
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ ADJUST PLAYER BALANCE
   * POST /api/transactions/adjust-balance
   */
  async adjustPlayerBalance(req, res, next) {
    try {
      const result = await transactionService.adjustPlayerBalance(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'ADJUST_PLAYER_BALANCE',
        'tbl_transactions',
        result.transaction_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        result.message,
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET PLAYER ADJUSTMENT HISTORY
   * GET /api/transactions/player/:playerId/adjustments
   */
  async getPlayerAdjustments(req, res, next) {
    try {
      const { playerId } = req.params;
      
      const adjustments = await transactionService.getPlayerAdjustmentHistory(playerId);

      return sendSuccess(
        res,
        'Player adjustment history retrieved',
        {
          player_id: parseInt(playerId),
          adjustments
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ ISSUE CREDIT
   * POST /api/transactions/issue-credit
   */
  async issueCredit(req, res, next) {
    try {
      const result = await transactionService.issueCredit(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'ISSUE_CREDIT',
        'tbl_transactions',
        result.transaction_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        result.message,
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ SETTLE CREDIT
   * POST /api/transactions/settle-credit
   */
  async settleCredit(req, res, next) {
    try {
      const result = await transactionService.settleCredit(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'SETTLE_CREDIT',
        'tbl_transactions',
        result.transaction_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        result.message,
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ CREATE EXPENSE
   * POST /api/transactions/expense
   */
  async createExpense(req, res, next) {
    try {
      const result = await transactionService.createExpense(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'CREATE_EXPENSE',
        'tbl_transactions',
        result.transaction_id,
        null,
        { ...req.body, ...result },
        req.ip
      );

      return sendSuccess(
        res,
        result.message || 'Expense recorded successfully',
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET PLAYER CHIP BALANCE
   * GET /api/transactions/player/:playerId/chip-balance
   */
  async getPlayerChipBalance(req, res, next) {
    try {
      const { playerId } = req.params;
      const balance = await transactionService.getPlayerCurrentStatus(playerId);

      return sendSuccess(
        res,
        'Player chip balance retrieved successfully',
        balance,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET PLAYER CASH DEPOSITS
   * GET /api/transactions/player/:playerId/cash-deposits
   */
  async getPlayerCashDeposits(req, res, next) {
    try {
      const { playerId } = req.params;
      const { session_id } = req.query;

      const result = await transactionService.getPlayerCashDeposits(
        playerId,
        session_id
      );

      return sendSuccess(
        res,
        'Player cash deposits retrieved successfully',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET OUTSTANDING CREDITS
   * GET /api/transactions/outstanding-credits
   */
  async getOutstandingCredits(req, res, next) {
    try {
      const credits = await transactionService.getOutstandingCredits();

      return sendSuccess(
        res, 
        'Outstanding credits retrieved successfully', 
        {
          count: credits.length,
          credits
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET CURRENT SESSION TRANSACTIONS
   * GET /api/transactions
   */
  async getCurrentSessionTransactions(req, res, next) {
    try {
      const transactions = await transactionService.getCurrentSessionTransactions();

      return sendSuccess(
        res,
        'Transactions retrieved successfully',
        {
          count: transactions.length,
          transactions
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET TRANSACTION BY ID
   * GET /api/transactions/:transactionId
   */
  async getTransactionById(req, res, next) {
    try {
      const { transactionId } = req.params;
      const transaction = await transactionService.getTransactionById(transactionId);

      return sendSuccess(
        res,
        'Transaction retrieved successfully',
        transaction,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET PLAYER TRANSACTION HISTORY
   * GET /api/transactions/player/:playerId
   */
  async getPlayerTransactionHistory(req, res, next) {
    try {
      const { playerId } = req.params;
      const { session_id } = req.query;

      const transactions = await transactionService.getPlayerTransactionHistory(
        playerId,
        session_id
      );

      return sendSuccess(
        res,
        'Player transaction history retrieved successfully',
        {
          player_id: parseInt(playerId),
          session_id: session_id ? parseInt(session_id) : null,
          count: transactions.length,
          transactions
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET ALL TRANSACTIONS WITH FILTERS (Admin only)
   * GET /api/transactions/all
   */
  async getAllTransactions(req, res, next) {
    try {
      const filters = {
        session_id: req.query.session_id,
        player_id: req.query.player_id,
        transaction_type: req.query.transaction_type,
        payment_mode: req.query.payment_mode,
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      const transactions = await transactionService.getAllTransactions(filters);

      return sendSuccess(
        res,
        'Transactions retrieved successfully',
        {
          filters,
          count: transactions.length,
          transactions
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET PLAYER'S STORED CHIPS BALANCE
   * GET /api/transactions/player/:playerId/stored-balance
   */
  async getPlayerStoredBalance(req, res, next) {
    try {
      const { playerId } = req.params;
      const result = await transactionService.getPlayerStoredBalance(playerId);

      return sendSuccess(
        res,
        'Stored balance retrieved successfully',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ REDEEM STORED CHIPS (Use stored balance for buy-in)
   * POST /api/transactions/redeem-stored
   */
  async redeemStoredChips(req, res, next) {
    try {
      const result = await transactionService.redeemStoredChips(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'REDEEM_STORED_CHIPS',
        'tbl_transactions',
        result.transaction_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        result.message,
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ ADD TRANSACTION NOTE (with optional image)
   * POST /api/transactions/:transactionId/notes
   */
  async addTransactionNote(req, res, next) {
    try {
      const { transactionId } = req.params;
      
      // ✅ Handle image upload if provided
      let imageUrl = null;
      let imagePublicId = null;
      
      if (req.file) {
        const { uploadToCloudinary } = require('../../../config/cloudinary.config');
        const uploadResult = await uploadToCloudinary(req.file, 'royal-flush/transactions/notes');
        
        if (uploadResult.success) {
          imageUrl = uploadResult.url;
          imagePublicId = uploadResult.public_id;
        } else {
          return sendError(res, uploadResult.error || 'Failed to upload image', 500);
        }
      }
      
      const noteData = {
        note: req.body.note || req.body.text || '',
        image_url: imageUrl,
        image_public_id: imagePublicId
      };
      
      const result = await transactionService.addTransactionNote(
        transactionId,
        noteData,
        req.user.user_id
      );

      return sendSuccess(
        res,
        'Transaction note added successfully',
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET TRANSACTION NOTES
   * GET /api/transactions/:transactionId/notes
   */
  async getTransactionNotes(req, res, next) {
    try {
      const { transactionId } = req.params;
      const result = await transactionService.getTransactionNotes(transactionId);

      return sendSuccess(
        res,
        'Transaction notes retrieved successfully',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ RESOLVE TRANSACTION NOTES
   * POST /api/transactions/:transactionId/notes/resolve
   */
  async resolveTransactionNotes(req, res, next) {
    try {
      const { transactionId } = req.params;
      const result = await transactionService.resolveTransactionNotes(
        transactionId,
        req.user.user_id
      );

      return sendSuccess(
        res,
        'Transaction notes resolved successfully',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ REVERSE TRANSACTION
   * POST /api/transactions/:transactionId/reverse
   */
  async reverseTransaction(req, res, next) {
    try {
      const { transactionId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return sendError(res, 'Reversal reason is required', 400);
      }

      const result = await transactionService.reverseTransaction(
        transactionId,
        reason,
        req.user.user_id
      );

      return sendSuccess(
        res,
        'Transaction reversed successfully',
        result,
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ UPLOAD SCREENSHOT for online payment
   * POST /api/transactions/upload-screenshot
   */
  async uploadScreenshot(req, res, next) {
    try {
      if (!req.file) {
        return sendError(res, 'No screenshot file uploaded', 400);
      }

      const { uploadToCloudinary } = require('../../../config/cloudinary.config');
      
      // Upload to Cloudinary
      const uploadResult = await uploadToCloudinary(req.file, 'royal-flush/transactions/screenshots');
      
      if (!uploadResult.success) {
        return sendError(res, uploadResult.error || 'Failed to upload screenshot to Cloudinary', 500);
      }

      return sendSuccess(
        res,
        'Screenshot uploaded successfully',
        {
          url: uploadResult.url,
          public_id: uploadResult.public_id
        },
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ UPDATE TRANSACTION PLAYER NAME
   * PUT /api/transactions/:transactionId/player-name
   */
  async updateTransactionPlayerName(req, res, next) {
    try {
      const { transactionId } = req.params;
      const { player_id, player_name } = req.body;

      if (!player_id || !player_name) {
        return sendError(res, 'Player ID and player name are required', 400);
      }

      const result = await transactionService.updateTransactionPlayerName(
        transactionId,
        player_id,
        player_name,
        req.user.user_id
      );

      return sendSuccess(
        res,
        result.message,
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TransactionController();