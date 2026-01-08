// modules/cashier/services/cashier.service.js
// Cashier Service - FIXED VERSION

const db = require("../../../config/database");
const cashierShiftService = require("./cashier-shift.service");

class CashierService {
  /**
   * Get today's active session (ONLY if not closed)
   */
  async getTodaySession() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;
    
    // ✅ FIXED: Only return session if it's NOT closed
    const sessions = await db.queryAll(
      `SELECT * FROM tbl_daily_sessions WHERE DATE(session_date) = ? AND is_closed = 0`,
      [todayString]
    );
    return sessions && sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Get today's session (whether closed or not) - for viewing historical data
   */
  async getTodaySessionAny() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;
    
    const sessions = await db.queryAll(
      `SELECT * FROM tbl_daily_sessions WHERE DATE(session_date) = ?`,
      [todayString]
    );
    return sessions && sessions.length > 0 ? sessions[0] : null;
  }

  /**
   * Get session by date
   * ✅ FIXED: Prefers closed session (has historical data) or session with most transactions
   */
  async getSessionByDate(date) {
    const dateStr = typeof date === 'string' ? date.split('T')[0] : date;
    
    const allSessions = await db.queryAll(
      `SELECT s.*, u.username as opened_by_username, u.full_name as opened_by_name
       FROM tbl_daily_sessions s
       LEFT JOIN tbl_users u ON s.opened_by = u.user_id
       WHERE DATE(s.session_date) = ?
       ORDER BY s.session_id DESC`,
      [dateStr]
    );

    if (!allSessions || allSessions.length === 0) {
      return null;
    }

    // ✅ Prefer closed session (has historical data) or session with most transactions
    let session = null;
    
    // First, try to find a closed session with transactions
    for (const s of allSessions) {
      if (s.is_closed === 1) {
        const trans = await db.queryAll(
          `SELECT COUNT(*) as count FROM tbl_transactions WHERE session_id = ?`,
          [s.session_id]
        );
        if (trans && trans[0] && trans[0].count > 0) {
          session = s;
          break;
        }
      }
    }

    // If no closed session with transactions, use the session with most transactions
    if (!session) {
      let maxTransactions = 0;
      for (const s of allSessions) {
        const trans = await db.queryAll(
          `SELECT COUNT(*) as count FROM tbl_transactions WHERE session_id = ?`,
          [s.session_id]
        );
        const count = trans && trans[0] ? parseInt(trans[0].count) : 0;
        if (count > maxTransactions) {
          maxTransactions = count;
          session = s;
        }
      }
    }

    // If still no session, use the most recent one
    if (!session) {
      session = allSessions[0];
    }

    return session;
  }

  /**
   * Start Daily Session
   */
  async startDailySession(ownerFloat, chipInventory, cashierId) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;
    
    const existingSession = await db.select(
      'tbl_daily_sessions',
      '*',
      'DATE(session_date) = ?',
      [todayString]
    );

    if (existingSession) {
      const isClosed = existingSession.is_closed === 1 || 
                       existingSession.is_closed === '1' || 
                       existingSession.is_closed === true ||
                       parseInt(existingSession.is_closed) === 1;
      
      if (isClosed) {
        // ✅ FIXED: Create a NEW session instead of reopening
        // This ensures old transactions stay with the old session_id (historical record)
        // New session gets a fresh session_id with zero transactions
        console.log(`⚠️ Closed session found for today (ID: ${existingSession.session_id}). Creating new session instead of reopening.`);
        // Continue to create new session below (don't return here)
      } else {
        // Active session already exists
        return {
          session_id: existingSession.session_id,
          session_date: existingSession.session_date,
          owner_float: parseFloat(existingSession.owner_float),
          opening_float: parseFloat(existingSession.opening_float),
          cashier_credit_limit: parseFloat(existingSession.cashier_credit_limit || 50000),
          chip_inventory_set: existingSession.chip_inventory_set === 1,
          message: 'Session is already active for today',
          already_active: true
        };
      }
    }

    if (!ownerFloat || ownerFloat <= 0) {
      throw new Error('Invalid float amount. Must be greater than 0.');
    }

    const chips_100 = chipInventory ? parseInt(chipInventory.chips_100 || 0) : 0;
    const chips_500 = chipInventory ? parseInt(chipInventory.chips_500 || 0) : 0;
    const chips_1000 = chipInventory ? parseInt(chipInventory.chips_1000 || 0) : 0;
    const chips_5000 = chipInventory ? parseInt(chipInventory.chips_5000 || 0) : 0;
    const chips_10000 = chipInventory ? parseInt(chipInventory.chips_10000 || 0) : 0;
    const chipsValue = chips_100 * 100 + chips_500 * 500 + chips_1000 * 1000 + chips_5000 * 5000 + chips_10000 * 10000;

    const result = await db.insert('tbl_daily_sessions', {
      session_date: todayString,
      owner_float: ownerFloat,
      opening_float: ownerFloat,
      closing_float: 0,
      chips_100_opening: chips_100,
      chips_500_opening: chips_500,
      chips_1000_opening: chips_1000,
      chips_5000_opening: chips_5000,
      chips_10000_opening: chips_10000,
      chips_100_current: chips_100,
      chips_500_current: chips_500,
      chips_1000_current: chips_1000,
      chips_5000_current: chips_5000,
      chips_10000_current: chips_10000,
      chips_100_out: 0,
      chips_500_out: 0,
      chips_1000_out: 0,
      chips_5000_out: 0,
      chips_10000_out: 0,
      primary_wallet: ownerFloat,
      secondary_wallet: 0,
      secondary_wallet_deposits: 0,
      secondary_wallet_withdrawals: 0,
      total_deposits: 0,
      total_withdrawals: 0,
      total_expenses: 0,
      total_chips_out: 0,
      outstanding_credit: 0,
      is_closed: 0,
      chip_inventory_set: chipInventory ? 1 : 0,
      cashier_credit_limit: 50000,
      credit_limit_set_by: cashierId,
      credit_limit_set_at: new Date(),
      opened_by: cashierId,
      opened_at: new Date()
    });

    const session = await db.select(
      'tbl_daily_sessions',
      '*',
      'session_id = ?',
      [result.insert_id]
    );

    // Create transaction records
    if (ownerFloat > 0) {
      await db.insert('tbl_transactions', {
        session_id: session.session_id,
        transaction_type: 'add_float',
        player_id: null,
        player_name: null,
        amount: ownerFloat,
        chips_amount: 0,
        payment_mode: 'cash',
        wallet_used: 'primary',
        primary_amount: ownerFloat,
        secondary_amount: 0,
        chips_100: 0,
        chips_500: 0,
        chips_5000: 0,
        chips_10000: 0,
        notes: 'Opening float for daily session',
        created_by: cashierId,
        created_at: new Date()
      });
    }

    if (chipInventory && chipsValue > 0) {
      await db.insert('tbl_transactions', {
        session_id: session.session_id,
        transaction_type: 'opening_chips',
        player_id: null,
        player_name: null,
        amount: 0,
        chips_amount: chipsValue,
        payment_mode: null,
        wallet_used: null,
        primary_amount: 0,
        secondary_amount: 0,
        chips_100: chips_100,
        chips_500: chips_500,
        chips_5000: chips_5000,
        chips_10000: chips_10000,
        notes: `Opening chip inventory: ${this.formatChipBreakdown({
          chips_100, chips_500, chips_5000, chips_10000
        })}`,
        created_by: cashierId,
        created_at: new Date()
      });
    }

    // ✅ IMPORTANT: Start cashier shift
    if (cashierId) {
      await cashierShiftService.startShift(session.session_id, cashierId, true);
    }

    return {
      session_id: session.session_id,
      session_date: session.session_date,
      owner_float: parseFloat(session.owner_float),
      opening_float: parseFloat(session.opening_float),
      cashier_credit_limit: parseFloat(session.cashier_credit_limit || 50000),
      chip_inventory_set: session.chip_inventory_set === 1,
      message: 'Session started successfully with ₹' + ownerFloat + ' float'
    };
  }

  /**
   * Get Dashboard Data
   * ✅ FIXED: Returns empty data when session is closed
   */
  async getDashboardData() {
    const session = await this.getTodaySession(); // Only gets ACTIVE session
    
    // ✅ FIXED: If no active session, return empty dashboard
    if (!session) {
      return {
        has_active_session: false,
        wallets: {
          primary: { current: 0, opening: 0, paid_in_payouts: 0, paid_in_expenses: 0 },
          secondary: { current: 0, total_received: 0, paid_in_payouts: 0 }
        },
        totals: { 
          deposits: 0, 
          withdrawals: 0, 
          expenses: 0,
          online_deposits: 0,
          sbi_deposits: 0,
          hdfc_deposits: 0,
          dealer_tips: 0,
          club_expenses: 0,
          player_expenses: 0,
          rakeback: 0
        },
        transactions: {
          stats: {
            buy_ins: { count: 0, total: 0 },
            payouts: { count: 0, total: 0 }
          },
          all: []
        },
        chip_inventory_set: false,
        chip_inventory: {
          opening: { chips_100: 0, chips_500: 0, chips_5000: 0, chips_10000: 0, total_count: 0, total_value: 0 },
          current_in_hand: { chips_100: 0, chips_500: 0, chips_5000: 0, chips_10000: 0, total_count: 0, total_value: 0 }
        },
        outstanding_credit: 0
      };
    }

    // Get transactions for today's session
    // Join with club_expenses to get attachment_url if it's a club expense
    // Also add a flag to verify the club expense exists
    const transactions = await db.queryAll(
      `SELECT 
        t.*,
        ce.attachment_url as club_expense_attachment_url,
        ce.attachment_public_id as club_expense_attachment_public_id,
        CASE WHEN ce.expense_id IS NOT NULL THEN 1 ELSE 0 END as is_valid_club_expense
      FROM tbl_transactions t
      LEFT JOIN tbl_club_expenses ce ON t.activity_type = 'club_expense' AND t.activity_id = ce.expense_id
      WHERE t.session_id = ?
      ORDER BY t.created_at DESC`,
      [session.session_id]
    );
    
    // Merge attachment_url from club_expenses if transaction doesn't have it
    const transactionsWithAttachments = (transactions || []).map(t => ({
      ...t,
      attachment_url: t.attachment_url || t.club_expense_attachment_url || null,
      attachment_public_id: t.attachment_public_id || t.club_expense_attachment_public_id || null
    }));

    // Calculate wallet balances
    const openingFloat = parseFloat(session.opening_float || 0);
    const primaryWallet = parseFloat(session.primary_wallet || openingFloat);
    const secondaryWallet = parseFloat(session.secondary_wallet || 0);

    // Calculate totals from transactions
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    let totalExpenses = 0;
    let buyInCount = 0;
    let buyInTotal = 0;
    let payoutCount = 0;
    let payoutTotal = 0;
    let primaryPaidInPayouts = 0;
    let primaryPaidInExpenses = 0;
    let secondaryTotalReceived = 0;
    let secondaryPaidInPayouts = 0;
    let onlineDeposits = 0;
    let sbiDeposits = 0;
    let hdfcDeposits = 0;
    let dealerTips = 0;
    let clubExpenses = 0;
    let playerExpenses = 0;
    let rakeback = 0;

    (transactionsWithAttachments || []).forEach(t => {
      const amount = parseFloat(t.amount || 0);
      const notes = (t.notes || '').toLowerCase();
      
      switch (t.transaction_type) {
        case 'buy_in':
          totalDeposits += amount;
          buyInCount++;
          buyInTotal += amount;
          if (t.payment_mode && t.payment_mode.startsWith('online_')) {
            secondaryTotalReceived += amount;
            onlineDeposits += amount;
            if (t.payment_mode === 'online_sbi') sbiDeposits += amount;
            else if (t.payment_mode === 'online_hdfc') hdfcDeposits += amount;
          }
          break;
        case 'cash_payout':
          totalWithdrawals += amount;
          payoutCount++;
          payoutTotal += amount;
          if (t.use_ceo_float || !t.use_balance) {
            primaryPaidInPayouts += amount;
          } else {
            secondaryPaidInPayouts += amount;
          }
          break;
        case 'expense':
          totalExpenses += amount;
          if (t.wallet_used === 'primary' || t.wallet_used === 'split') {
            primaryPaidInExpenses += parseFloat(t.primary_amount || amount);
          }
          // Only count by activity_type (most reliable)
          // For club_expense, also verify it has a valid activity_id (links to tbl_club_expenses)
          if (t.activity_type === 'dealer_tip') {
            dealerTips += amount;
          } else if (t.activity_type === 'club_expense' && t.is_valid_club_expense === 1) {
            // Only count if it's a valid club expense (has matching record in tbl_club_expenses)
            clubExpenses += amount;
          } else if (t.activity_type === 'player_expense') {
            // Count player expenses (vendor payments)
            playerExpenses += amount;
          }
          // Note: Removed fallback to notes check to avoid incorrect counting
          break;
        case 'rakeback':
        case 'process_rakeback':
          rakeback += amount;
          break;
        case 'dealer_tip':
          dealerTips += amount;
          break;
        case 'settle_cash':
          if (t.payment_mode && t.payment_mode.startsWith('online_')) {
            secondaryTotalReceived += amount;
            onlineDeposits += amount;
            if (t.payment_mode === 'online_sbi') sbiDeposits += amount;
            else if (t.payment_mode === 'online_hdfc') hdfcDeposits += amount;
          }
          break;
        case 'settle_credit':
          // ✅ Count credit settlements as deposits (cash comes in)
          totalDeposits += amount;
          if (t.payment_mode && t.payment_mode.startsWith('online_')) {
            secondaryTotalReceived += amount;
            onlineDeposits += amount;
            if (t.payment_mode === 'online_sbi') sbiDeposits += amount;
            else if (t.payment_mode === 'online_hdfc') hdfcDeposits += amount;
          }
          break;
        case 'deposit_cash':
          // ✅ Count cash deposits (both cash and online)
          totalDeposits += amount;
          secondaryTotalReceived += amount;
          if (t.payment_mode && t.payment_mode.startsWith('online_')) {
            onlineDeposits += amount;
            if (t.payment_mode === 'online_sbi') sbiDeposits += amount;
            else if (t.payment_mode === 'online_hdfc') hdfcDeposits += amount;
          }
          break;
      }
    });

    const primaryCurrent = parseFloat(session.primary_wallet || openingFloat);
    const secondaryCurrent = parseFloat(session.secondary_wallet || 0);
    const outstandingCredit = parseFloat(session.outstanding_credit || 0);

    const chipInventorySet = session.chip_inventory_set === 1;
    const chipOpening = {
      chips_100: parseInt(session.chips_100_opening || 0),
      chips_500: parseInt(session.chips_500_opening || 0),
      chips_1000: parseInt(session.chips_1000_opening || 0),
      chips_5000: parseInt(session.chips_5000_opening || 0),
      chips_10000: parseInt(session.chips_10000_opening || 0)
    };
    chipOpening.total_count = chipOpening.chips_100 + chipOpening.chips_500 + chipOpening.chips_1000 + chipOpening.chips_5000 + chipOpening.chips_10000;
    chipOpening.total_value = this.calculateChipValue(chipOpening);

    const chipCurrentInHand = {
      chips_100: parseInt(session.chips_100_current || 0),
      chips_500: parseInt(session.chips_500_current || 0),
      chips_1000: parseInt(session.chips_1000_current || 0),
      chips_5000: parseInt(session.chips_5000_current || 0),
      chips_10000: parseInt(session.chips_10000_current || 0)
    };
    chipCurrentInHand.total_count = chipCurrentInHand.chips_100 + chipCurrentInHand.chips_500 + chipCurrentInHand.chips_1000 + chipCurrentInHand.chips_5000 + chipCurrentInHand.chips_10000;
    chipCurrentInHand.total_value = this.calculateChipValue(chipCurrentInHand);

    // ✅ Get separate cash and online balances from session
    const cashBalance = parseFloat(session.cash_balance || 0); // Only cash buy-ins
    const onlineBalance = parseFloat(session.online_balance || 0); // Only online buy-ins

    return {
      has_active_session: true,
      wallets: {
        primary: {
          current: primaryCurrent,
          opening: openingFloat,
          paid_in_payouts: primaryPaidInPayouts,
          paid_in_expenses: primaryPaidInExpenses
        },
        secondary: {
          current: secondaryCurrent, // Total (for backward compatibility)
          total_received: secondaryTotalReceived,
          paid_in_payouts: secondaryPaidInPayouts,
          // ✅ NEW: Separate cash and online balances
          cash_balance: cashBalance, // Cash in Hand (only cash buy-ins)
          online_balance: onlineBalance // Online Money (only online buy-ins)
        }
      },
      totals: {
        deposits: totalDeposits,
        withdrawals: totalWithdrawals,
        expenses: totalExpenses,
        online_deposits: onlineDeposits,
        sbi_deposits: sbiDeposits,
        hdfc_deposits: hdfcDeposits,
        dealer_tips: dealerTips,
        club_expenses: clubExpenses,
        player_expenses: playerExpenses,
        rakeback: rakeback
      },
      transactions: {
        stats: {
          buy_ins: { count: buyInCount, total: buyInTotal },
          payouts: { count: payoutCount, total: payoutTotal }
        },
        all: transactionsWithAttachments || []
      },
      chip_inventory_set: chipInventorySet,
      chip_inventory: {
        opening: chipOpening,
        current_in_hand: chipCurrentInHand
      },
      outstanding_credit: outstandingCredit
    };
  }

  /**
   * Set Chip Inventory
   */
  async setChipInventory(chipData, userId) {
    const session = await this.getTodaySession();
    if (!session) {
      throw new Error('No active session found');
    }

    const chips_100 = parseInt(chipData.chips_100 || 0);
    const chips_500 = parseInt(chipData.chips_500 || 0);
    const chips_1000 = parseInt(chipData.chips_1000 || 0);
    const chips_5000 = parseInt(chipData.chips_5000 || 0);
    const chips_10000 = parseInt(chipData.chips_10000 || 0);

    await db.update(
      'tbl_daily_sessions',
      {
        chips_100_opening: chips_100,
        chips_500_opening: chips_500,
        chips_1000_opening: chips_1000,
        chips_5000_opening: chips_5000,
        chips_10000_opening: chips_10000,
        chips_100_current: chips_100,
        chips_500_current: chips_500,
        chips_1000_current: chips_1000,
        chips_5000_current: chips_5000,
        chips_10000_current: chips_10000,
        chip_inventory_set: 1
      },
      'session_id = ?',
      [session.session_id]
    );

    return { session_id: session.session_id, message: 'Chip inventory set successfully' };
  }

  /**
   * Update Chip Inventory
   */
  async updateChipInventory(sessionId, chipBreakdown, isGivingOut = true) {
    const session = await db.select(
      "tbl_daily_sessions",
      "*",
      "session_id = ?",
      [sessionId]
    );

    if (!session) {
      throw new Error('Session not found');
    }

    const chips_100_change = parseInt(chipBreakdown.chips_100 || 0);
    const chips_500_change = parseInt(chipBreakdown.chips_500 || 0);
    const chips_1000_change = parseInt(chipBreakdown.chips_1000 || 0);
    const chips_5000_change = parseInt(chipBreakdown.chips_5000 || 0);
    const chips_10000_change = parseInt(chipBreakdown.chips_10000 || 0);

    let updates = {};

    if (isGivingOut) {
      // Prevent negative chip balances
      const current_100 = parseInt(session.chips_100_current || 0);
      const current_500 = parseInt(session.chips_500_current || 0);
      const current_1000 = parseInt(session.chips_1000_current || 0);
      const current_5000 = parseInt(session.chips_5000_current || 0);
      const current_10000 = parseInt(session.chips_10000_current || 0);

      updates = {
        chips_100_current: Math.max(0, current_100 - chips_100_change),
        chips_500_current: Math.max(0, current_500 - chips_500_change),
        chips_1000_current: Math.max(0, current_1000 - chips_1000_change),
        chips_5000_current: Math.max(0, current_5000 - chips_5000_change),
        chips_10000_current: Math.max(0, current_10000 - chips_10000_change),
        chips_100_out: parseInt(session.chips_100_out || 0) + chips_100_change,
        chips_500_out: parseInt(session.chips_500_out || 0) + chips_500_change,
        chips_1000_out: parseInt(session.chips_1000_out || 0) + chips_1000_change,
        chips_5000_out: parseInt(session.chips_5000_out || 0) + chips_5000_change,
        chips_10000_out: parseInt(session.chips_10000_out || 0) + chips_10000_change,
      };
    } else {
      updates = {
        chips_100_current: parseInt(session.chips_100_current || 0) + chips_100_change,
        chips_500_current: parseInt(session.chips_500_current || 0) + chips_500_change,
        chips_1000_current: parseInt(session.chips_1000_current || 0) + chips_1000_change,
        chips_5000_current: parseInt(session.chips_5000_current || 0) + chips_5000_change,
        chips_10000_current: parseInt(session.chips_10000_current || 0) + chips_10000_change,
        chips_100_out: Math.max(0, parseInt(session.chips_100_out || 0) - chips_100_change),
        chips_500_out: Math.max(0, parseInt(session.chips_500_out || 0) - chips_500_change),
        chips_1000_out: Math.max(0, parseInt(session.chips_1000_out || 0) - chips_1000_change),
        chips_5000_out: Math.max(0, parseInt(session.chips_5000_out || 0) - chips_5000_change),
        chips_10000_out: Math.max(0, parseInt(session.chips_10000_out || 0) - chips_10000_change),
      };
    }

    await db.update("tbl_daily_sessions", updates, "session_id = ?", [sessionId]);

    return { success: true, updates: updates };
  }

  /**
   * Close Daily Session
   * ✅ FIXED: Also ends all active shifts
   */
  async closeDailySession(userId) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;

    const session = await db.select(
      'tbl_daily_sessions',
      '*',
      'DATE(session_date) = ? AND is_closed = 0',
      [todayString]
    );

    if (!session) {
      throw new Error('No active session found for today');
    }

    const summaryData = await this.calculateSessionSummary(session.session_id);

    if (summaryData.pending_credit_requests > 0) {
      throw new Error('Cannot close session. There are pending credit requests that need approval.');
    }

    const warnings = [];
    if (summaryData.chips_in_circulation > 0) {
      warnings.push(`${summaryData.chips_in_circulation} chips are still in circulation with players`);
    }
    if (summaryData.outstanding_credit > 0) {
      warnings.push(`₹${summaryData.outstanding_credit} in outstanding credit remains`);
    }

    const closingFloat = summaryData.remaining_float;
    const netProfitLoss = closingFloat - parseFloat(session.opening_float);

    // ✅ End all active shifts for this session
    const activeShifts = await db.selectAll(
      'tbl_cashier_shifts',
      '*',
      'session_id = ? AND is_active = 1',
      [session.session_id]
    );

    for (const shift of (activeShifts || [])) {
      try {
        await cashierShiftService.endShift(shift.shift_id, 'Session closed');
      } catch (err) {
        console.log(`Could not end shift ${shift.shift_id}:`, err.message);
      }
    }

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
    try {
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
        summary_data: JSON.stringify({ ...summaryData, warnings })
      });
    } catch (err) {
      console.log('Could not save session summary:', err.message);
    }

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
      chips_in_circulation: summaryData.chips_in_circulation,
      outstanding_credit: summaryData.outstanding_credit,
      total_players: summaryData.total_players,
      total_transactions: summaryData.total_transactions,
      pending_credit_requests: summaryData.pending_credit_requests,
      warnings,
      message: warnings.length > 0 ? 'Session closed with warnings' : 'Session closed successfully'
    };
  }

  /**
   * Calculate session summary
   */
  async calculateSessionSummary(sessionId) {
    const transactions = await db.queryAll(
      `SELECT * FROM tbl_transactions WHERE session_id = ?`,
      [sessionId]
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
          if (t.payment_mode === 'cash') cashDeposits += amount;
          else if (t.payment_mode && t.payment_mode.startsWith('online_')) onlineDeposits += amount;
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
   * Add Cash Float
   */
  async addCashFloat(floatData, userId) {
    const session = await this.getTodaySession();
    if (!session) {
      throw new Error('No active session found');
    }

    const amount = parseFloat(floatData.amount || 0);
    if (amount <= 0) {
      throw new Error('Invalid float amount. Must be greater than 0.');
    }

    const result = await db.insert('tbl_session_float_additions', {
      session_id: session.session_id,
      float_amount: amount,
      chips_100: floatData.chip_breakdown?.chips_100 || 0,
      chips_500: floatData.chip_breakdown?.chips_500 || 0,
      chips_1000: floatData.chip_breakdown?.chips_1000 || 0,
      chips_5000: floatData.chip_breakdown?.chips_5000 || 0,
      chips_10000: floatData.chip_breakdown?.chips_10000 || 0,
      reason: floatData.notes || null,
      added_by: userId,
      created_at: new Date()
    });

    // ✅ CREATE TRANSACTION RECORD for cashbook tracking
    const chips_100_added = parseInt(floatData.chip_breakdown?.chips_100 || 0);
    const chips_500_added = parseInt(floatData.chip_breakdown?.chips_500 || 0);
    const chips_1000_added = parseInt(floatData.chip_breakdown?.chips_1000 || 0);
    const chips_5000_added = parseInt(floatData.chip_breakdown?.chips_5000 || 0);
    const chips_10000_added = parseInt(floatData.chip_breakdown?.chips_10000 || 0);
    
    await db.insert('tbl_transactions', {
      session_id: session.session_id,
      transaction_type: 'add_float',
      player_id: null,
      player_name: null,
      amount: amount,
      chips_amount: 0,
      payment_mode: 'cash',
      wallet_used: 'primary',
      primary_amount: amount,
      secondary_amount: 0,
      chips_100: chips_100_added,
      chips_500: chips_500_added,
      chips_1000: chips_1000_added,
      chips_5000: chips_5000_added,
      chips_10000: chips_10000_added,
      notes: floatData.notes || `Float top-up: ₹${amount.toLocaleString('en-IN')}`,
      created_by: userId,
      created_at: new Date()
    });

    const newPrimaryWallet = parseFloat(session.primary_wallet || session.opening_float || 0) + amount;
    
    // ✅ Only update chips if chip_breakdown is provided
    const sessionUpdates = {
      primary_wallet: newPrimaryWallet,
    };

    // Only add chips if chip breakdown is provided
    if (floatData.chip_breakdown) {
      sessionUpdates.chips_100_current = parseInt(session.chips_100_current || 0) + chips_100_added;
      sessionUpdates.chips_500_current = parseInt(session.chips_500_current || 0) + chips_500_added;
      sessionUpdates.chips_1000_current = parseInt(session.chips_1000_current || 0) + chips_1000_added;
      sessionUpdates.chips_5000_current = parseInt(session.chips_5000_current || 0) + chips_5000_added;
      sessionUpdates.chips_10000_current = parseInt(session.chips_10000_current || 0) + chips_10000_added;
    }
    
    await db.update(
      'tbl_daily_sessions',
      sessionUpdates,
      'session_id = ?',
      [session.session_id]
    );

    return {
      addition_id: result.insert_id,
      session_id: session.session_id,
      float_amount: amount,
      message: `Float of ₹${amount.toLocaleString('en-IN')} added successfully`
    };
  }

  /**
   * Add Chips Only (no float change)
   * Updates chip inventory without affecting primary_wallet
   */
  async addChipsOnly(chipData, userId) {
    const session = await this.getTodaySession();
    if (!session) {
      throw new Error('No active session found');
    }

    const chipBreakdown = chipData.chip_breakdown || {};
    const chips_100_added = parseInt(chipBreakdown.chips_100 || 0);
    const chips_500_added = parseInt(chipBreakdown.chips_500 || 0);
    const chips_1000_added = parseInt(chipBreakdown.chips_1000 || 0);
    const chips_5000_added = parseInt(chipBreakdown.chips_5000 || 0);
    const chips_10000_added = parseInt(chipBreakdown.chips_10000 || 0);

    const chipTotal = 
      chips_100_added * 100 +
      chips_500_added * 500 +
      chips_1000_added * 1000 +
      chips_5000_added * 5000 +
      chips_10000_added * 10000;

    if (chipTotal <= 0) {
      throw new Error('At least one chip must be added');
    }

    // Update chip inventory (receiving chips)
    await this.updateChipInventory(
      session.session_id,
      chipBreakdown,
      false // receiving chips
    );

    // Create transaction record for tracking (no amount, only chips)
    await db.insert('tbl_transactions', {
      session_id: session.session_id,
      transaction_type: 'add_chips',
      player_id: null,
      player_name: null,
      amount: 0, // No money added
      chips_amount: chipTotal,
      payment_mode: null,
      wallet_used: null,
      primary_amount: 0,
      secondary_amount: 0,
      chips_100: chips_100_added,
      chips_500: chips_500_added,
      chips_1000: chips_1000_added,
      chips_5000: chips_5000_added,
      chips_10000: chips_10000_added,
      notes: chipData.notes || `Chips added: ${this.formatChipBreakdown(chipBreakdown)}`,
      created_by: userId,
      created_at: new Date()
    });

    return {
      session_id: session.session_id,
      chips_added: chipTotal,
      message: `Chips worth ₹${chipTotal.toLocaleString('en-IN')} added to inventory successfully`
    };
  }

  /**
   * Get Float Addition History
   */
  async getFloatAdditionHistory(sessionId) {
    const additions = await db.queryAll(
      `SELECT 
        sfa.*,
        u.username as added_by_username,
        u.full_name as added_by_name
      FROM tbl_session_float_additions sfa
      LEFT JOIN tbl_users u ON sfa.added_by = u.user_id
      WHERE sfa.session_id = ?
      ORDER BY sfa.created_at DESC`,
      [sessionId]
    );

    return additions || [];
  }

  /**
   * Get Float Summary
   */
  async getFloatSummary(sessionId) {
    const session = await db.select(
      'tbl_daily_sessions',
      '*',
      'session_id = ?',
      [sessionId]
    );

    if (!session) {
      throw new Error('Session not found');
    }

    const additions = await this.getFloatAdditionHistory(sessionId);
    
    const totalFloatAdded = additions.reduce((sum, a) => sum + parseFloat(a.float_amount || 0), 0);
    const totalChipsAdded = additions.reduce((sum, a) => {
      return sum + 
        (parseInt(a.chips_100 || 0) * 100) +
        (parseInt(a.chips_500 || 0) * 500) +
        (parseInt(a.chips_1000 || 0) * 1000) +
        (parseInt(a.chips_5000 || 0) * 5000) +
        (parseInt(a.chips_10000 || 0) * 10000);
    }, 0);

    return {
      opening_float: parseFloat(session.opening_float || 0),
      total_float_added: totalFloatAdded,
      total_chips_added: totalChipsAdded,
      current_primary_wallet: parseFloat(session.primary_wallet || session.opening_float || 0),
      additions_count: additions.length
    };
  }

  /**
   * Export Float & Chips Log CSV
   */
  async exportFloatChipsLogCSV(startDate, endDate) {
    let csv = "FLOAT & CHIPS LOG REPORT\n";
    csv += `Period: ${startDate} to ${endDate}\n\n`;
    csv += "Date,Type,Description,Amount,Chips Count,Chips Value,User,Notes\n";

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const session = await this.getSessionByDate(dateStr);

      if (session) {
        if (session.opening_float > 0) {
          csv += `${dateStr},Opening Float,Session Opening,${session.opening_float},0,0,${session.opened_by_name || session.opened_by_username || 'System'},""\n`;
        }

        const chipsValue = (session.chips_100_opening || 0) * 100 +
                          (session.chips_500_opening || 0) * 500 +
                          (session.chips_1000_opening || 0) * 1000 +
                          (session.chips_5000_opening || 0) * 5000 +
                          (session.chips_10000_opening || 0) * 10000;
        const chipsCount = (session.chips_100_opening || 0) +
                          (session.chips_500_opening || 0) +
                          (session.chips_1000_opening || 0) +
                          (session.chips_5000_opening || 0) +
                          (session.chips_10000_opening || 0);

        if (chipsValue > 0) {
          csv += `${dateStr},Opening Chips,Session Opening,${chipsValue},${chipsCount},${chipsValue},${session.opened_by_name || session.opened_by_username || 'System'},"${this.formatChipBreakdown({
            chips_100: session.chips_100_opening || 0,
            chips_500: session.chips_500_opening || 0,
            chips_1000: session.chips_1000_opening || 0,
            chips_5000: session.chips_5000_opening || 0,
            chips_10000: session.chips_10000_opening || 0,
          })}"\n`;
        }
      }
    }
    return csv;
  }

  formatChipBreakdown(chips) {
    const parts = [];
    if (chips.chips_100 > 0) parts.push(`${chips.chips_100}×₹100`);
    if (chips.chips_500 > 0) parts.push(`${chips.chips_500}×₹500`);
    if (chips.chips_1000 > 0) parts.push(`${chips.chips_1000}×₹1,000`);
    if (chips.chips_5000 > 0) parts.push(`${chips.chips_5000}×₹5,000`);
    if (chips.chips_10000 > 0) parts.push(`${chips.chips_10000}×₹10,000`);
    return parts.join(' ') || '0 chips';
  }

  calculateChipValue(chips) {
    const chips_100 = Math.max(0, parseInt(chips.chips_100 || 0));
    const chips_500 = Math.max(0, parseInt(chips.chips_500 || 0));
    const chips_1000 = Math.max(0, parseInt(chips.chips_1000 || 0));
    const chips_5000 = Math.max(0, parseInt(chips.chips_5000 || 0));
    const chips_10000 = Math.max(0, parseInt(chips.chips_10000 || 0));
    
    return chips_100 * 100 + chips_500 * 500 + chips_1000 * 1000 + chips_5000 * 5000 + chips_10000 * 10000;
  }

  calculateChipCount(chips) {
    return (chips.chips_100 || 0) + (chips.chips_500 || 0) + (chips.chips_1000 || 0) + (chips.chips_5000 || 0) + (chips.chips_10000 || 0);
  }

  validateChipBreakdown(chipBreakdown, totalAmount) {
    if (!chipBreakdown) {
      throw new Error('Chip breakdown is required');
    }

    const calculatedValue = this.calculateChipValue(chipBreakdown);
    const expectedValue = parseFloat(totalAmount);

    if (Math.abs(calculatedValue - expectedValue) > 0.01) {
      throw new Error(
        `Chip breakdown (₹${calculatedValue.toLocaleString('en-IN')}) does not match total amount (₹${expectedValue.toLocaleString('en-IN')})`
      );
    }

    return true;
  }
}

module.exports = new CashierService();