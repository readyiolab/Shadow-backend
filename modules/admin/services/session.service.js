// modules/admin/services/session.service.js

const db = require('../../../config/database');

class AdminSessionService {
  /**
   * Open daily session (Admin only)
   * Admin provides initial float amount
   * FIXED: Handle existing closed sessions and timezone properly
   */
 async openDailySession(ownerFloat, userId, creditLimit = 50000) {
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    
    // ✅ CRITICAL: Check if there's an ACTIVE session for today
    const existingActiveSession = await db.select(
      'tbl_daily_sessions',
      '*',
      'session_date = ? AND is_closed = 0',
      [todayString]
    );

    if (existingActiveSession) {
      throw new Error('Session already opened for today');
    }

    // ✅ CRITICAL: Check if there's a CLOSED session for today
    // If yes, we still create a NEW session (never reopen closed sessions)
    // Closed sessions are historical records and should never be reopened
    const existingClosedSession = await db.select(
      'tbl_daily_sessions',
      '*',
      'session_date = ? AND is_closed = 1',
      [todayString]
    );

    if (existingClosedSession) {
      // ✅ Allow creating a new session even if there's a closed one for today
      // This ensures each session is independent and starts fresh
      console.log(`⚠️ Closed session found for today (ID: ${existingClosedSession.session_id}). Creating new session.`);
    }

    // Validate float amount
    if (!ownerFloat || ownerFloat <= 0) {
      throw new Error('Invalid float amount. Must be greater than 0.');
    }

    // ✅ Create new session with ZERO chips
    // Cashier will set chip inventory when they start working
    const result = await db.insert('tbl_daily_sessions', {
      session_date: todayString,
      owner_float: ownerFloat,
      opening_float: ownerFloat,
      closing_float: 0,
      
      // ✅ NO CHIP INVENTORY - All zeros
      // Cashier will initialize these when first opening their shift
      chips_100_opening: 0,
      chips_500_opening: 0,
      chips_1000_opening: 0,
      chips_5000_opening: 0,
      chips_10000_opening: 0,
      
      chips_100_current: 0,
      chips_500_current: 0,
      chips_1000_current: 0,
      chips_5000_current: 0,
      chips_10000_current: 0,
      
      chips_100_out: 0,
      chips_500_out: 0,
      chips_1000_out: 0,
      chips_5000_out: 0,
      chips_10000_out: 0,
      
      // ✅ Primary Wallet = Owner's Cash Float
      primary_wallet: ownerFloat,
      
      // ✅ Secondary Wallet = Player Deposits (starts at 0) - for backward compatibility
      secondary_wallet: 0,
      secondary_wallet_deposits: 0,
      secondary_wallet_withdrawals: 0,
      
      // ✅ STRICT BALANCE SEPARATION: Cash Balance and Online Balance (start at 0)
      cash_balance: 0, // Only from cash buy-ins
      online_balance: 0, // Only from online buy-ins (NEVER used for cash payout)
      
      total_deposits: 0,
      total_withdrawals: 0,
      total_expenses: 0,
      total_chips_out: 0,
      total_cash_deposits: 0, // ✅ Cash buy-ins counter
      total_online_deposits: 0, // ✅ Online buy-ins counter
      outstanding_credit: 0,
      is_closed: 0,
      chip_inventory_set: 0, // ✅ Flag: Cashier hasn't set chips yet
      
      // ✅ NEW: Credit limit tracking
      cashier_credit_limit: creditLimit || 50000,
      credit_limit_set_by: userId,
      credit_limit_set_at: new Date(),
      
      opened_by: userId,
      opened_at: new Date()
    });

    const session = await db.select(
      'tbl_daily_sessions',
      '*',
      'session_id = ?',
      [result.insert_id]
    );

    return {
      session_id: session.session_id,
      session_date: session.session_date,
      owner_float: parseFloat(session.owner_float),
      opening_float: parseFloat(session.opening_float),
      cashier_credit_limit: parseFloat(session.cashier_credit_limit || 50000),
      status: 'open',
      message: 'Session opened successfully with ₹' + ownerFloat + ' float and ₹' + (creditLimit || 50000) + ' cashier credit limit. Cashier can now set chip inventory and start transactions.'
    };
  }


  /**
   * Close daily session (Admin only)
   * Validates and finalizes the day
   */
  async closeDailySession(userId) {
    const today = new Date().toISOString().split('T')[0];
    
    const session = await db.select(
      'tbl_daily_sessions',
      '*',
      'session_date = ? AND is_closed = 0',
      [today]
    );

    if (!session) {
      throw new Error('No active session found for today');
    }

    // Get session summary data
    const summaryData = await this.calculateSessionSummary(session.session_id);

    // Check for pending credit requests
    if (summaryData.pending_credit_requests > 0) {
      throw new Error('Cannot close session. There are pending credit requests that need approval.');
    }

    // Allow closure even if chips/credits remain, but surface warnings
    const warnings = [];
    if (summaryData.chips_in_circulation > 0) {
      warnings.push(`${summaryData.chips_in_circulation} chips are still in circulation with players`);
    }
    if (summaryData.outstanding_credit > 0) {
      warnings.push(`₹${summaryData.outstanding_credit} in outstanding credit remains`);
    }

    // Calculate final amounts
    const closingFloat = summaryData.remaining_float;
    const netProfitLoss = closingFloat - parseFloat(session.opening_float);

    // Update session as closed
    await db.update('tbl_daily_sessions', {
      closing_float: closingFloat,
      total_deposits: summaryData.total_deposits,
      total_withdrawals: summaryData.total_withdrawals,
      total_expenses: summaryData.total_expenses,
      total_chips_out: summaryData.chips_in_circulation,
      outstanding_credit: summaryData.outstanding_credit,
      is_closed: 1,
      closed_by: userId,
      closed_at: new Date()
    }, 'session_id = ?', [session.session_id]);

    // Save session summary
    await db.insert('tbl_session_summaries', {
      session_id: session.session_id,
      session_date: session.session_date,
      owner_float: session.owner_float,
      opening_float: session.opening_float,
      closing_float: closingFloat,
      total_deposits: summaryData.total_deposits,
      total_cash_deposits: summaryData.cash_deposits,
      total_online_deposits: summaryData.online_deposits,
      total_withdrawals: summaryData.total_withdrawals,
      total_expenses: summaryData.total_expenses,
      chips_in_circulation: summaryData.chips_in_circulation,
      outstanding_credit: summaryData.outstanding_credit,
      net_profit_loss: netProfitLoss,
      total_players: summaryData.total_players,
      total_transactions: summaryData.total_transactions,
      closed_by: userId,
      closed_at: new Date(),
      summary_data: JSON.stringify({
        ...summaryData,
        warnings
      })
    });

    return {
      session_id: session.session_id,
      session_date: session.session_date,
      owner_float: parseFloat(session.owner_float),
      opening_float: parseFloat(session.opening_float),
      closing_float: closingFloat,
      net_profit_loss: netProfitLoss,
      total_deposits: summaryData.total_deposits,
      total_withdrawals: summaryData.total_withdrawals,
      total_expenses: summaryData.total_expenses,
      total_players: summaryData.total_players,
      total_transactions: summaryData.total_transactions,
      warnings,
      message: warnings.length > 0
        ? 'Session closed with warnings'
        : 'Session closed successfully'
    };
  }

  /**
   * Calculate session summary
   * Properly handles all transaction types
   */
  async calculateSessionSummary(sessionId) {
    const transactions = await db.selectAll(
      'tbl_transactions',
      '*',
      'session_id = ?',
      [sessionId],
      'ORDER BY created_at DESC'
    );

    let totalDeposits = 0;
    let cashDeposits = 0;
    let onlineDeposits = 0;
    let totalWithdrawals = 0;
    let totalExpenses = 0;
    let chipsInCirculation = 0;

    (transactions || []).forEach(t => {
      const amount = parseFloat(t.amount || 0);
      const chips = parseFloat(t.chips_amount || 0);

      switch (t.transaction_type) {
        case 'buy_in':
          totalDeposits += amount;
          chipsInCirculation += chips;
          if (t.payment_mode === 'cash') {
            cashDeposits += amount;
          } else if (t.payment_mode && t.payment_mode.startsWith('online_')) {
            onlineDeposits += amount;
          }
          break;
        
        case 'cash_payout':
          totalWithdrawals += amount;
          chipsInCirculation -= chips;
          break;
        
        case 'return_chips':
          chipsInCirculation -= chips;
          break;
        
        case 'issue_credit':
          chipsInCirculation += chips;
          break;
        
        case 'settle_credit':
          break;
        
        case 'expense':
          totalExpenses += amount;
          break;
      }
    });

    chipsInCirculation = Math.max(0, chipsInCirculation);

    const creditData = await db.query(
      'SELECT SUM(credit_outstanding) as total FROM tbl_credits WHERE session_id = ? AND is_fully_settled = 0',
      [sessionId]
    );
    const outstandingCredit = parseFloat(creditData?.total || 0);

    const pendingRequests = await db.query(
      'SELECT COUNT(*) as count FROM tbl_credit_requests WHERE session_id = ? AND request_status = ?',
      [sessionId, 'pending']
    );
    const pendingCreditRequests = pendingRequests?.count || 0;

    const playerCount = await db.query(
      'SELECT COUNT(DISTINCT player_id) as count FROM tbl_transactions WHERE session_id = ? AND player_id IS NOT NULL',
      [sessionId]
    );
    const totalPlayers = playerCount?.count || 0;

    const session = await db.select('tbl_daily_sessions', '*', 'session_id = ?', [sessionId]);
    const remainingFloat = parseFloat(session.opening_float) + totalDeposits - totalWithdrawals - totalExpenses;

    return {
      total_deposits: totalDeposits,
      cash_deposits: cashDeposits,
      online_deposits: onlineDeposits,
      total_withdrawals: totalWithdrawals,
      total_expenses: totalExpenses,
      chips_in_circulation: chipsInCirculation,
      outstanding_credit: outstandingCredit,
      remaining_float: remainingFloat,
      available_float: remainingFloat - outstandingCredit,
      total_players: totalPlayers,
      total_transactions: (transactions || []).length,
      pending_credit_requests: pendingCreditRequests
    };
  }

  /**
   * Get all session summaries (History)
   */
  async getAllSessionSummaries(limit = 30) {
    const summaries = await db.selectAll(
      'tbl_session_summaries',
      '*',
      '',
      [],
      `ORDER BY session_date DESC LIMIT ${limit}`
    );

    return summaries || [];
  }

  /**
   * Get specific session summary
   */
  async getSessionSummary(sessionId) {
    const summary = await db.select(
      'tbl_session_summaries',
      '*',
      'session_id = ?',
      [sessionId]
    );

    if (!summary) {
      throw new Error('Session summary not found');
    }

    if (summary.summary_data) {
      try {
        summary.summary_data = JSON.parse(summary.summary_data);
      } catch (e) {
        console.error('Error parsing summary_data:', e);
      }
    }

    return summary;
  }
  /**
   * Get current active session status
   * FIXED: Check for active (not closed) sessions only
   */
 async getCurrentSessionStatus() {
    const today = new Date().toISOString().split('T')[0];
    
    const session = await db.select(
      'tbl_daily_sessions',
      '*',
      'session_date = ? AND is_closed = 0',
      [today]
    );

    if (!session) {
      return {
        has_active_session: false,
        message: 'No session opened for today'
      };
    }

    const summary = await this.calculateSessionSummary(session.session_id);

    return {
      has_active_session: true,
      is_closed: false,
      session: {
        session_id: session.session_id,
        session_date: session.session_date,
        owner_float: parseFloat(session.owner_float),
        opening_float: parseFloat(session.opening_float),
        chip_inventory_set: session.chip_inventory_set || 0,
        opened_at: session.opened_at
      },
      summary
    };
  }
}

module.exports = new AdminSessionService();