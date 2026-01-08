const db = require('../../../config/database');
const { sendSuccess, sendError } = require('../../../utils/response.util');
const { logAudit } = require('../../../utils/logger.util');

class ConfirmationController {
  /**
   * ✅ GET ALL PENDING CONFIRMATION REQUESTS
   * Cashier dashboard shows these awaiting confirmation
   */
  async getPendingRequests(req, res) {
    try {
      const cashierService = require('../services/cashier.service');
      const session = await cashierService.getTodaySession();
      
      const requests = await db.queryAll(
        `SELECT 
          bcr.*,
          p.player_name,
          p.phone_number as player_phone,
          t.table_number,
          t.table_name,
          u.full_name as collected_by_name,
          tp.table_player_id
        FROM tbl_buyin_confirmation_requests bcr
        INNER JOIN tbl_players p ON bcr.player_id = p.player_id
        INNER JOIN tbl_tables t ON bcr.table_id = t.table_id
        INNER JOIN tbl_users u ON bcr.collected_by = u.user_id
        LEFT JOIN tbl_table_players tp ON tp.confirmation_request_id = bcr.request_id
        WHERE bcr.session_id = ?
          AND bcr.request_status = 'pending'
        ORDER BY bcr.created_at ASC`,
        [session.session_id]
      );

      return sendSuccess(res, {
        pending_requests: requests || [],
        count: (requests || []).length
      });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  /**
   * ✅ ACCEPT & ISSUE CHIPS (Cashier confirms buy-in)
   * This completes the buy-in flow
   */
  async acceptAndIssueChips(req, res) {
    try {
      const { request_id } = req.params;
      const { chip_breakdown } = req.body;

      // Get request details
      const request = await db.select(
        'tbl_buyin_confirmation_requests',
        '*',
        'request_id = ?',
        [request_id]
      );

      if (!request) {
        return sendError(res, 'Confirmation request not found', 404);
      }

      if (request.request_status !== 'pending') {
        return sendError(res, 'Request already processed', 400);
      }

      // Validate chip breakdown (optional)
      if (chip_breakdown) {
        const totalChipValue =
          (chip_breakdown.chips_100 || 0) * 100 +
          (chip_breakdown.chips_500 || 0) * 500 +
          (chip_breakdown.chips_5000 || 0) * 5000 +
          (chip_breakdown.chips_10000 || 0) * 10000;

        if (Math.abs(totalChipValue - request.buy_in_amount) > 0.01) {
          return sendError(
            res,
            `Chip breakdown (₹${totalChipValue}) doesn't match buy-in amount (₹${request.buy_in_amount})`,
            400
          );
        }
      }

      const confirmedAt = new Date();
      const cashierId = req.user.user_id;

      // ✅ STEP 1: Mark request as confirmed
      await db.update(
        'tbl_buyin_confirmation_requests',
        {
          request_status: 'confirmed',
          confirmed_by: cashierId,
          confirmed_at: confirmedAt,
          chips_issued: true
        },
        'request_id = ?',
        [request_id]
      );

      // ✅ STEP 2: Update player buy-in status to BUYIN_COMPLETED
      await db.update(
        'tbl_table_players',
        {
          buy_in_status: 'BUYIN_COMPLETED',
          updated_at: confirmedAt
        },
        'confirmation_request_id = ?',
        [request_id]
      );

      // ✅ STEP 3: Record transaction (buy-in)
      const cashierService = require('../services/cashier.service');
      const session = await cashierService.getTodaySession();

      // ✅ Get payment mode from request (default to 'cash' if not provided)
      const paymentMode = request.payment_mode || 'cash';
      const isCashBuyIn = paymentMode === 'cash';
      const isOnlineBuyIn = paymentMode && paymentMode.startsWith('online_');

      await db.insert('tbl_transactions', {
        session_id: session.session_id,
        transaction_type: 'buy_in',
        player_id: request.player_id,
        amount: request.buy_in_amount,
        chips_amount: request.buy_in_amount,
        payment_mode: paymentMode,
        wallet_used: 'secondary',
        primary_amount: 0,
        secondary_amount: request.buy_in_amount,
        chips_100: chip_breakdown?.chips_100 || 0,
        chips_500: chip_breakdown?.chips_500 || 0,
        chips_1000: chip_breakdown?.chips_1000 || 0,
        chips_5000: chip_breakdown?.chips_5000 || 0,
        chips_10000: chip_breakdown?.chips_10000 || 0,
        notes: `Buy-in confirmed by cashier. Table ${request.table_id}, Seat ${request.seat_number}`,
        created_by: cashierId,
        created_at: confirmedAt
      });

      // ✅ STEP 4: Update chip inventory (if breakdown provided)
      if (chip_breakdown) {
        await cashierService.updateChipInventory(
          session.session_id,
          chip_breakdown,
          true // giving out chips
        );
      }

      // ✅ STEP 5: Update session wallets - STRICT SEPARATION
      // Cash buy-ins → cash_balance only
      // Online buy-ins → online_balance only
      const buyInAmount = parseFloat(request.buy_in_amount);
      const updates = {
        secondary_wallet: parseFloat(session.secondary_wallet || 0) + buyInAmount, // For backward compatibility
        secondary_wallet_deposits: parseFloat(session.secondary_wallet_deposits || 0) + buyInAmount,
        total_deposits: parseFloat(session.total_deposits || 0) + buyInAmount,
      };

      if (isCashBuyIn) {
        // ✅ Cash buy-in → ONLY update cash_balance (Cash in Hand)
        updates.cash_balance = parseFloat(session.cash_balance || 0) + buyInAmount;
        updates.total_cash_deposits = parseFloat(session.total_cash_deposits || 0) + buyInAmount;
        updates.total_online_deposits = parseFloat(session.total_online_deposits || 0); // No change
      } else if (isOnlineBuyIn) {
        // ✅ Online buy-in → ONLY update online_balance (Online Money)
        updates.online_balance = parseFloat(session.online_balance || 0) + buyInAmount;
        updates.total_online_deposits = parseFloat(session.total_online_deposits || 0) + buyInAmount;
        updates.total_cash_deposits = parseFloat(session.total_cash_deposits || 0); // No change
      } else {
        // Default to cash if payment mode is unclear
        updates.cash_balance = parseFloat(session.cash_balance || 0) + buyInAmount;
        updates.total_cash_deposits = parseFloat(session.total_cash_deposits || 0) + buyInAmount;
        updates.total_online_deposits = parseFloat(session.total_online_deposits || 0); // No change
      }

      await db.update(
        'tbl_daily_sessions',
        updates,
        'session_id = ?',
        [session.session_id]
      );

      return sendSuccess(res, {
        request_id: request_id,
        player_id: request.player_id,
        buy_in_amount: request.buy_in_amount,
        confirmed_at: confirmedAt,
        chips_issued: true,
        message: `Buy-in confirmed and ₹${request.buy_in_amount} chips issued`
      });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  /**
   * ✅ REJECT CONFIRMATION REQUEST
   */
  async rejectRequest(req, res) {
    try {
      const { request_id } = req.params;
      const { rejection_reason } = req.body;

      const request = await db.select(
        'tbl_buyin_confirmation_requests',
        '*',
        'request_id = ?',
        [request_id]
      );

      if (!request) {
        return sendError(res, 'Confirmation request not found', 404);
      }

      if (request.request_status !== 'pending') {
        return sendError(res, 'Request already processed', 400);
      }

      // Mark as rejected
      await db.update(
        'tbl_buyin_confirmation_requests',
        {
          request_status: 'rejected',
          rejection_reason: rejection_reason || 'Rejected by cashier',
          confirmed_by: req.user.user_id,
          confirmed_at: new Date()
        },
        'request_id = ?',
        [request_id]
      );

      // Remove player from table
      await db.update(
        'tbl_table_players',
        {
          is_removed: true,
          removed_at: new Date(),
          removed_by: req.user.user_id
        },
        'confirmation_request_id = ?',
        [request_id]
      );

      return sendSuccess(res, {
        success: true,
        message: 'Request rejected and player removed from table'
      });
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getCurrentSession() {
    const today = new Date().toISOString().split('T')[0];
    const session = await db.select(
      'tbl_daily_sessions',
      '*',
      'session_date = ?',
      [today]
    );

    if (!session) {
      throw new Error('No active session found for today');
    }

    return session;
  }
}

module.exports = new ConfirmationController();