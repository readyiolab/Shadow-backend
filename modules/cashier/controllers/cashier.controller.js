const cashierService = require('../services/cashier.service');
const whatsappService = require('../../../services/whatsapp.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');
const { logAudit } = require('../../../utils/logger.util');

class CashierController {

  /**
   * ✅ SET CHIP INVENTORY (Cashier)
   * POST /api/cashier/set-chip-inventory
   */
  async setChipInventory(req, res, next) {
    try {
      const result = await cashierService.setChipInventory(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'SET_CHIP_INVENTORY',
        'tbl_daily_sessions',
        result.session_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        'Chip inventory initialized successfully',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ UPDATE CHIP INVENTORY ADJUSTMENT (Cashier)
   * POST /api/cashier/update-chip-inventory
   */
  async updateChipInventory(req, res, next) {
    try {
      const result = await cashierService.updateChipInventoryAdjustment(
        req.body,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'UPDATE_CHIP_INVENTORY',
        'tbl_daily_sessions',
        result.session_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(
        res,
        'Chip inventory updated successfully',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ GET CHIP ADJUSTMENT HISTORY (Cashier & Admin)
   * GET /api/cashier/chip-adjustments
   */
  async getChipAdjustments(req, res, next) {
    try {
      const adjustments = await cashierService.getChipAdjustmentHistory();

      return sendSuccess(
        res,
        'Chip adjustment history retrieved',
        adjustments,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Open session (Admin only)
   * POST /api/cashier/open-session
   */
  async openSession(req, res, next) {
    try {
      const { owner_float } = req.body;
      
      const sessionId = await cashierService.openDailySession(
        owner_float, 
        req.user.user_id
      );
      
      await logAudit(
        req.user.user_id, 
        'OPEN_SESSION', 
        'tbl_daily_sessions', 
        sessionId, 
        null, 
        { owner_float }, 
        req.ip
      );

      return sendSuccess(
        res, 
        'Daily session opened successfully', 
        { session_id: sessionId }, 
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Start session with chip inventory (Cashier)
   * POST /api/cashier/start-session
   */
  async startSession(req, res, next) {
    try {
      const { owner_float, chip_inventory, cashier_id } = req.body;

      if (!owner_float || parseFloat(owner_float) <= 0) {
        return sendError(res, 'Valid opening float amount is required', 400);
      }

      // Use provided cashier_id or fallback to current user
      const cashierId = cashier_id || req.user.user_id;
      
      const result = await cashierService.startDailySession(
        parseFloat(owner_float),
        chip_inventory || null,
        cashierId
      );
      
      // Use req.user.user_id for audit log (foreign key constraint requires user_id from tbl_users)
      await logAudit(
        req.user.user_id, 
        'START_SESSION', 
        'tbl_daily_sessions', 
        result.session_id, 
        null, 
        { owner_float, chip_inventory, cashier_id: cashierId }, 
        req.ip
      );

      return sendSuccess(
        res, 
        result.message || 'Session started successfully', 
        result, 
        201
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get dashboard
   * GET /api/cashier/dashboard
   */
  async getDashboard(req, res, next) {
    try {
      const data = await cashierService.getDashboardData();
      
      return sendSuccess(res, 'Dashboard data retrieved', data);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Close session (Admin only)
   * POST /api/cashier/close-session
   */
  async closeSession(req, res, next) {
    try {
      const result = await cashierService.closeDailySession(req.user.user_id);
      
      await logAudit(
        req.user.user_id, 
        'CLOSE_SESSION', 
        'tbl_daily_sessions', 
        result.session_id, 
        null, 
        result, 
        req.ip
      );

      // Send WhatsApp notification to admin
      try {
        await whatsappService.sendSessionClosedNotification({
          session_date: result.session_date,
          session_id: result.session_id,
          owner_float: result.owner_float,
          closing_float: result.closing_float,
          net_profit_loss: result.net_profit_loss,
          total_deposits: result.total_deposits,
          total_withdrawals: result.total_withdrawals,
          total_expenses: result.total_expenses,
          outstanding_credit: result.outstanding_credit || 0,
          total_players: result.total_players,
          total_transactions: result.total_transactions
        });
      } catch (whatsappError) {
        console.error('Failed to send WhatsApp notification:', whatsappError);
        // Don't fail the close operation if WhatsApp fails
      }

      return sendSuccess(res, result.message || 'Daily session closed successfully', result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get today's session
   * GET /api/cashier/today-session
   */
  async getTodaySession(req, res, next) {
    try {
      const session = await cashierService.getTodaySession();
      
      // Check if session exists and is not closed (handle both number and string values)
      let isActive = false;
      if (session) {
        const isClosed = session.is_closed;
        // Handle different formats: 0, '0', false, null, undefined
        isActive = (
          isClosed === 0 || 
          isClosed === '0' || 
          isClosed === false ||
          isClosed === null ||
          isClosed === undefined ||
          parseInt(isClosed) === 0
        );
      }
      
      return sendSuccess(res, 'Session status retrieved', {
        has_active_session: isActive,
        session: session || null
      });
    } catch (error) {
      // If error is "No session", return success with has_active_session: false
      if (error.message && error.message.includes('No session')) {
        return sendSuccess(res, 'Session status retrieved', {
          has_active_session: false,
          session: null
        });
      }
      next(error);
    }
  }

  /**
   * Get all session summaries (Admin only)
   * GET /api/cashier/summaries
   */
  async getAllSummaries(req, res, next) {
    try {
      const { limit } = req.query;
      
      const summaries = await cashierService.getAllSessionSummaries(
        limit ? parseInt(limit) : 30
      );
      
      return sendSuccess(res, 'Session summaries retrieved', summaries);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get specific session summary (Admin only)
   * GET /api/cashier/summary/:session_id
   */
  async getSessionSummary(req, res, next) {
    try {
      const { session_id } = req.params;
      
      const summary = await cashierService.getSessionSummary(session_id);
      
      return sendSuccess(res, 'Session summary retrieved', summary);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get session by date (Cashier & Admin)
   * GET /api/cashier/session/date/:date
   */
  async getSessionByDate(req, res, next) {
    try {
      const { date } = req.params;
      
      const session = await cashierService.getSessionByDate(date);
      
      if (!session) {
        return sendSuccess(res, 'No session found for this date', null);
      }
      
      return sendSuccess(res, 'Session retrieved', session);
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ Set cashier credit limit per session (Admin only)
   * POST /api/cashier/set-credit-limit
   */
  async setCreditLimit(req, res, next) {
    try {
      const { session_id, credit_limit } = req.body;

      if (!session_id || credit_limit === undefined) {
        return sendError(res, 'Missing session_id or credit_limit', 400);
      }

      if (credit_limit < 0) {
        return sendError(res, 'Credit limit cannot be negative', 400);
      }

      const result = await cashierService.setCreditLimit(
        session_id,
        credit_limit,
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'SET_CREDIT_LIMIT',
        'tbl_daily_sessions',
        session_id,
        null,
        { credit_limit },
        req.ip
      );

      return sendSuccess(
        res,
        'Credit limit set successfully',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ Get cashier credit limit (Cashier & Admin)
   * GET /api/cashier/credit-limit/:session_id
   */
  async getCreditLimit(req, res, next) {
    try {
      const { session_id } = req.params;

      if (!session_id) {
        return sendError(res, 'Missing session_id', 400);
      }

      const result = await cashierService.getCreditLimit(session_id);

      return sendSuccess(
        res,
        'Credit limit retrieved',
        result,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ Get all credit limit history (Admin only)
   * GET /api/cashier/credit-limits-history
   */
  async getCreditLimitsHistory(req, res, next) {
    try {
      const history = await cashierService.getCreditLimitsHistory();

      return sendSuccess(
        res,
        'Credit limits history retrieved',
        history,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ ADD CASH FLOAT (Mali) with optional chip inventory
   * POST /api/cashier/add-cash-float
   */
  async addCashFloat(req, res, next) {
    try {
      const { amount, notes, chip_breakdown } = req.body;

      if (!amount || parseFloat(amount) <= 0) {
        return sendError(res, 'Valid amount is required', 400);
      }

      const result = await cashierService.addCashFloat(
        {
          amount: parseFloat(amount),
          notes,
          chip_breakdown: chip_breakdown || null
        },
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'ADD_CASH_FLOAT',
        'tbl_session_float_additions',
        result.addition_id,
        null,
        { amount, chip_breakdown },
        req.ip
      );

      return sendSuccess(res, result.message, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ ADD CHIPS ONLY (no float change)
   * POST /api/cashier/add-chips
   */
  async addChipsOnly(req, res, next) {
    try {
      const { chip_breakdown, notes } = req.body;

      if (!chip_breakdown) {
        return sendError(res, 'Chip breakdown is required', 400);
      }

      const result = await cashierService.addChipsOnly(
        {
          chip_breakdown,
          notes
        },
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'ADD_CHIPS_ONLY',
        'tbl_daily_sessions',
        result.session_id,
        null,
        { chip_breakdown },
        req.ip
      );

      return sendSuccess(res, result.message, result, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ NEW: Get float addition history for today's session
   * GET /api/cashier/float-history
   */
  async getFloatHistory(req, res, next) {
    try {
      const session = await cashierService.getTodaySession();
      
      if (!session || !session.session_id) {
        return sendError(res, 'No active session found', 404);
      }

      // ✅ Only return float history for active (not closed) sessions
      if (session.is_closed === 1) {
        return sendSuccess(
          res,
          'Float addition history retrieved',
          [], // Return empty array for closed sessions
          200
        );
      }

      const history = await cashierService.getFloatAdditionHistory(session.session_id);

      return sendSuccess(
        res,
        'Float addition history retrieved',
        history,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ NEW: Get float addition history for a specific session
   * GET /api/cashier/float-history/:sessionId
   */
  async getFloatHistoryBySession(req, res, next) {
    try {
      const { sessionId } = req.params;
      const db = require('../../../config/database');

      if (!sessionId) {
        return sendError(res, 'Session ID is required', 400);
      }

      // ✅ Verify session exists (can be closed or active)
      const session = await db.select(
        'tbl_daily_sessions',
        '*',
        'session_id = ?',
        [parseInt(sessionId)]
      );

      if (!session) {
        return sendError(res, 'Session not found', 404);
      }

      // ✅ Return float history for both active AND closed sessions (historical data)
      const history = await cashierService.getFloatAdditionHistory(parseInt(sessionId));

      return sendSuccess(
        res,
        'Float addition history retrieved',
        history,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ NEW: Get float summary for today's session
   * GET /api/cashier/float-summary
   */
  async getFloatSummary(req, res, next) {
    try {
      const session = await cashierService.getTodaySession();
      
      if (!session) {
        return sendError(res, 'No active session found', 404);
      }

      const summary = await cashierService.getFloatSummary(session.session_id);

      return sendSuccess(
        res,
        'Float summary retrieved',
        summary,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ NEW: Get chip inventory status
   * GET /api/cashier/chip-inventory-status
   */
  async getChipInventoryStatus(req, res, next) {
    try {
      const session = await cashierService.getTodaySession();
      
      if (!session) {
        return sendError(res, 'No active session found', 404);
      }

      const status = await cashierService.getChipInventoryStatus(session.session_id);

      return sendSuccess(
        res,
        'Chip inventory status retrieved',
        status,
        200
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * ✅ NEW: Get chip movement log
   * GET /api/cashier/chip-movements
   */
  async getChipMovements(req, res, next) {
    try {
      const session = await cashierService.getTodaySession();
      
      if (!session) {
        return sendError(res, 'No active session found', 404);
      }

      const movements = await cashierService.getChipMovementLog(session.session_id);

      return sendSuccess(
        res,
        'Chip movement log retrieved',
        movements,
        200
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CashierController();