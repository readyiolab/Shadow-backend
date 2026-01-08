// modules/cashier/services/cashier-shift.service.js
// Cashier Shift Tracking & Report Service - FIXED VERSION
// ✅ FIX: Join with tbl_cashiers table, not tbl_users

const db = require("../../../config/database");

class CashierShiftService {
  /**
   * Get cashier name - tries tbl_cashiers first, then tbl_users
   */
  async getCashierName(cashierId) {
    // First try tbl_cashiers
    const cashier = await db.select(
      "tbl_cashiers",
      "cashier_id, full_name",
      "cashier_id = ?",
      [cashierId]
    );
    
    if (cashier && cashier.full_name) {
      return cashier.full_name;
    }
    
    // Fallback to tbl_users
    const user = await db.select(
      "tbl_users",
      "user_id, full_name, username",
      "user_id = ?",
      [cashierId]
    );
    
    return user?.full_name || user?.username || 'Unknown';
  }

  /**
   * Get session cashiers info (for header display: "3/2 cashiers")
   */
  async getSessionCashiersInfo(sessionId) {
    // If no sessionId provided, get today's session
    if (!sessionId && sessionId !== 0) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayString = `${year}-${month}-${day}`;
      
      const session = await db.select(
        'tbl_daily_sessions',
        'session_id',
        'DATE(session_date) = ? AND is_closed = 0',
        [todayString]
      );
      
      if (!session) {
        return {
          total_cashiers: 0,
          active_cashiers: 0,
          cashiers: [],
          active_shifts: [],
          display_text: '0/0 cashiers',
        };
      }
      sessionId = session.session_id;
    }

    // ✅ FIX: Try to join with tbl_cashiers first, then tbl_users
    const cashiers = await db.queryAll(
      `SELECT sc.*, 
              COALESCE(c.full_name, u.full_name, u.username) as full_name,
              COALESCE(u.username, '') as username
       FROM tbl_session_cashiers sc
       LEFT JOIN tbl_cashiers c ON sc.cashier_id = c.cashier_id
       LEFT JOIN tbl_users u ON sc.cashier_id = u.user_id
       WHERE sc.session_id = ?
       ORDER BY sc.assigned_at`,
      [sessionId]
    );

    // ✅ FIX: Try to join with tbl_cashiers first, then tbl_users
    const activeShifts = await db.queryAll(
      `SELECT cs.*, 
              COALESCE(c.full_name, u.full_name, u.username) as full_name,
              COALESCE(u.username, '') as username
       FROM tbl_cashier_shifts cs
       LEFT JOIN tbl_cashiers c ON cs.cashier_id = c.cashier_id
       LEFT JOIN tbl_users u ON cs.cashier_id = u.user_id
       WHERE cs.session_id = ? AND cs.is_active = 1`,
      [sessionId]
    );

    return {
      total_cashiers: (cashiers || []).length,
      active_cashiers: (activeShifts || []).length,
      cashiers: (cashiers || []).map(c => ({
        ...c,
        cashier_name: c.full_name || c.username || 'Unknown'
      })),
      active_shifts: (activeShifts || []).map(s => ({
        ...s,
        cashier_name: s.full_name || s.username || 'Unknown'
      })),
      display_text: `${(activeShifts || []).length}/${(cashiers || []).length} cashiers`,
    };
  }

  /**
   * Get all shifts for today's session
   * ✅ FIXED: Joins with both tbl_cashiers and tbl_users
   */
  async getAllShifts(sessionId) {
    // If no sessionId provided, get today's session
    if (!sessionId && sessionId !== 0) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayString = `${year}-${month}-${day}`;
      
      const session = await db.select(
        'tbl_daily_sessions',
        'session_id',
        'DATE(session_date) = ? AND is_closed = 0',
        [todayString]
      );
      
      if (!session) {
        return [];
      }
      sessionId = session.session_id;
    }

    // ✅ FIX: Join with BOTH tbl_cashiers and tbl_users, prefer tbl_cashiers
    const shifts = await db.queryAll(
      `SELECT cs.*, 
              COALESCE(c.full_name, u.full_name, u.username) as full_name,
              COALESCE(u.username, '') as username
       FROM tbl_cashier_shifts cs
       LEFT JOIN tbl_cashiers c ON cs.cashier_id = c.cashier_id
       LEFT JOIN tbl_users u ON cs.cashier_id = u.user_id
       WHERE cs.session_id = ?
       ORDER BY cs.started_at DESC`,
      [sessionId]
    );

    return (shifts || []).map(s => ({
      ...s,
      cashier_name: s.full_name || s.username || 'Unknown',
      duration_formatted: s.duration_minutes
        ? this.formatDuration(s.duration_minutes)
        : "Active",
    }));
  }

  /**
   * Start a cashier shift (when cashier opens session or takes over)
   * ✅ FIXED: Returns cashier_name from correct table
   */
  async startShift(sessionId, cashierId, isOpener = false) {
    // If no sessionId provided, get today's session
    if (!sessionId && sessionId !== 0) {
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
        throw new Error('No active session found');
      }
      sessionId = session.session_id;
    }

    // Check if cashier already has an active shift
    const existingShift = await db.select(
      "tbl_cashier_shifts",
      "*",
      "session_id = ? AND cashier_id = ? AND is_active = 1",
      [sessionId, cashierId]
    );

    // ✅ FIX: Get cashier name from correct table
    const cashierName = await this.getCashierName(cashierId);

    if (existingShift) {
      return {
        shift_id: existingShift.shift_id,
        session_id: existingShift.session_id,
        cashier_id: existingShift.cashier_id,
        cashier_name: cashierName,
        full_name: cashierName,
        started_at: existingShift.started_at,
        is_active: existingShift.is_active,
        shift_number: existingShift.shift_number,
        message: "Cashier already has an active shift",
        already_active: true,
      };
    }

    // ✅ RULE: First cashier must end shift before second can start
    // Check if there's any other active shift in this session
    const otherActiveShift = await db.select(
      "tbl_cashier_shifts",
      "*",
      "session_id = ? AND cashier_id != ? AND is_active = 1",
      [sessionId, cashierId]
    );

    if (otherActiveShift) {
      const otherCashierName = await this.getCashierName(otherActiveShift.cashier_id);
      throw new Error(
        `Cannot start shift. Another cashier (${otherCashierName}) has an active shift. ` +
        `Please wait for the current cashier to end their shift before starting a new one.`
      );
    }

    // Get current session state for opening balances
    const session = await db.select(
      "tbl_daily_sessions",
      "*",
      "session_id = ?",
      [sessionId]
    );

    if (!session) {
      throw new Error('Session not found');
    }

    // Count existing shifts for shift number
    const shiftCountResult = await db.query(
      "SELECT COUNT(*) as count FROM tbl_cashier_shifts WHERE session_id = ?",
      [sessionId]
    );
    const shiftNumber = (shiftCountResult?.count || 0) + 1;

    // Calculate chips value
    const chipsValue =
      parseInt(session.chips_100_current || 0) * 100 +
      parseInt(session.chips_500_current || 0) * 500 +
      parseInt(session.chips_5000_current || 0) * 5000 +
      parseInt(session.chips_10000_current || 0) * 10000;

    // Create shift record
    const result = await db.insert("tbl_cashier_shifts", {
      session_id: sessionId,
      cashier_id: cashierId,
      shift_number: shiftNumber,
      started_at: new Date(),
      opening_primary_wallet: parseFloat(session.primary_wallet || 0),
      opening_secondary_wallet: parseFloat(session.secondary_wallet || 0),
      opening_chips_value: chipsValue,
      opening_outstanding_credit: parseFloat(session.outstanding_credit || 0),
      is_active: 1,
      shift_status: "active",
    });

    // Add to session cashiers if not exists
    const existingAssignment = await db.select(
      "tbl_session_cashiers",
      "*",
      "session_id = ? AND cashier_id = ?",
      [sessionId, cashierId]
    );

    if (!existingAssignment) {
      await db.insert("tbl_session_cashiers", {
        session_id: sessionId,
        cashier_id: cashierId,
        is_opener: isOpener ? 1 : 0,
        assigned_at: new Date(),
      });
    }

    // Update session cashier count
    const activeCashiersResult = await db.query(
      "SELECT COUNT(*) as count FROM tbl_cashier_shifts WHERE session_id = ? AND is_active = 1",
      [sessionId]
    );

    await db.update(
      "tbl_daily_sessions",
      {
        current_active_cashiers: activeCashiersResult?.count || 1,
        opener_cashier_id: isOpener ? cashierId : session.opener_cashier_id,
      },
      "session_id = ?",
      [sessionId]
    );

    return {
      shift_id: result.insert_id,
      session_id: sessionId,
      cashier_id: cashierId,
      cashier_name: cashierName,
      full_name: cashierName,
      shift_number: shiftNumber,
      started_at: new Date(),
      is_active: 1,
      is_opener: isOpener,
      message: isOpener
        ? `Shift #${shiftNumber} started for ${cashierName}. This cashier is opening the day.`
        : `Shift #${shiftNumber} started for ${cashierName}.`,
    };
  }

  /**
   * Get current active shift for a cashier
   */
  async getActiveShift(sessionId, cashierId) {
    const shifts = await db.queryAll(
      `SELECT cs.*, 
              COALESCE(c.full_name, u.full_name, u.username) as full_name,
              COALESCE(u.username, '') as username
       FROM tbl_cashier_shifts cs
       LEFT JOIN tbl_cashiers c ON cs.cashier_id = c.cashier_id
       LEFT JOIN tbl_users u ON cs.cashier_id = u.user_id
       WHERE cs.session_id = ? AND cs.cashier_id = ? AND cs.is_active = 1`,
      [sessionId, cashierId]
    );

    const shift = shifts && shifts.length > 0 ? shifts[0] : null;

    if (!shift) {
      return null;
    }

    // Calculate current duration
    const startTime = new Date(shift.started_at);
    const now = new Date();
    const durationMs = now - startTime;
    const durationMinutes = Math.floor(durationMs / 60000);

    return {
      ...shift,
      cashier_name: shift.full_name || shift.username || 'Unknown',
      current_duration_minutes: durationMinutes,
      current_duration_formatted: this.formatDuration(durationMinutes),
    };
  }

  /**
   * End a cashier shift with full report
   */
  async endShift(shiftId, handoverNotes = null) {
    const shift = await db.select(
      "tbl_cashier_shifts",
      "*",
      "shift_id = ?",
      [shiftId]
    );

    if (!shift) {
      throw new Error("Shift not found");
    }

    if (!shift.is_active) {
      throw new Error("Shift already ended");
    }

    // Get current session state
    const session = await db.select(
      "tbl_daily_sessions",
      "*",
      "session_id = ?",
      [shift.session_id]
    );

    // ✅ FIX: Get cashier name from correct table
    const cashierName = await this.getCashierName(shift.cashier_id);

    // Calculate duration - define endTime first
    const endTime = new Date();
    const durationMs = endTime - new Date(shift.started_at);
    const durationMinutes = Math.round(durationMs / 60000);

    // Calculate shift statistics from transactions
    const stats = await this.calculateShiftStatistics(
      shift.session_id,
      shiftId,
      shift.started_at,
      endTime // Pass end time for ended shifts
    );

    // Calculate closing values
    const closingChipsValue =
      parseInt(session.chips_100_current || 0) * 100 +
      parseInt(session.chips_500_current || 0) * 500 +
      parseInt(session.chips_5000_current || 0) * 5000 +
      parseInt(session.chips_10000_current || 0) * 10000;

    // Update shift record
    await db.update(
      "tbl_cashier_shifts",
      {
        ended_at: endTime,
        duration_minutes: durationMinutes,
        closing_primary_wallet: parseFloat(session.primary_wallet || 0),
        closing_secondary_wallet: parseFloat(session.secondary_wallet || 0),
        closing_chips_value: closingChipsValue,
        closing_outstanding_credit: parseFloat(session.outstanding_credit || 0),
        total_buy_ins: stats.buy_ins.count,
        total_buy_ins_amount: stats.buy_ins.amount,
        total_cashouts: stats.cashouts.count,
        total_cashouts_amount: stats.cashouts.amount,
        total_credits_issued: stats.credits_issued.count,
        total_credits_amount: stats.credits_issued.amount,
        total_credits_settled: stats.credits_settled.count,
        total_credits_settled_amount: stats.credits_settled.amount,
        total_expenses: stats.expenses.count,
        total_expenses_amount: stats.expenses.amount,
        total_float_additions: stats.float_additions.count,
        total_float_additions_amount: stats.float_additions.amount,
        total_transactions: stats.total_transactions,
        unique_players_served: stats.unique_players,
        is_active: 0,
        shift_status: "completed",
        handover_notes: handoverNotes,
        shift_report_generated: 1,
      },
      "shift_id = ?",
      [shiftId]
    );

    // Update session active cashier count
    const activeCashiersResult = await db.query(
      "SELECT COUNT(*) as count FROM tbl_cashier_shifts WHERE session_id = ? AND is_active = 1",
      [shift.session_id]
    );

    await db.update(
      "tbl_daily_sessions",
      {
        current_active_cashiers: activeCashiersResult?.count || 0,
      },
      "session_id = ?",
      [shift.session_id]
    );

    // Generate shift report data
    const report = {
      shift_info: {
        shift_id: shift.shift_id,
        shift_number: shift.shift_number,
        cashier_name: cashierName,
        cashier_id: shift.cashier_id,
        started_at: shift.started_at,
        ended_at: endTime,
        duration: this.formatDuration(durationMinutes),
        duration_minutes: durationMinutes,
      },
      opening_balances: {
        primary_wallet: parseFloat(shift.opening_primary_wallet),
        secondary_wallet: parseFloat(shift.opening_secondary_wallet),
        chips_value: parseFloat(shift.opening_chips_value),
        outstanding_credit: parseFloat(shift.opening_outstanding_credit),
        total:
          parseFloat(shift.opening_primary_wallet) +
          parseFloat(shift.opening_secondary_wallet),
      },
      closing_balances: {
        primary_wallet: parseFloat(session.primary_wallet || 0),
        secondary_wallet: parseFloat(session.secondary_wallet || 0),
        chips_value: closingChipsValue,
        outstanding_credit: parseFloat(session.outstanding_credit || 0),
        total:
          parseFloat(session.primary_wallet || 0) +
          parseFloat(session.secondary_wallet || 0),
      },
      statistics: stats,
      net_change: {
        primary_wallet:
          parseFloat(session.primary_wallet || 0) -
          parseFloat(shift.opening_primary_wallet),
        secondary_wallet:
          parseFloat(session.secondary_wallet || 0) -
          parseFloat(shift.opening_secondary_wallet),
        total_cash:
          parseFloat(session.primary_wallet || 0) +
          parseFloat(session.secondary_wallet || 0) -
          (parseFloat(shift.opening_primary_wallet) +
            parseFloat(shift.opening_secondary_wallet)),
      },
    };

    return {
      shift_id: shiftId,
      shift_number: shift.shift_number,
      cashier_name: cashierName,
      started_at: shift.started_at,
      ended_at: endTime,
      duration_minutes: durationMinutes,
      duration_formatted: this.formatDuration(durationMinutes),
      statistics: stats,
      opening_balances: report.opening_balances,
      closing_balances: report.closing_balances,
      net_change: report.net_change,
      report: report,
      message: `Shift #${shift.shift_number} completed for ${cashierName}. Duration: ${this.formatDuration(durationMinutes)}`,
    };
  }

  /**
   * Calculate statistics for a shift period
   */
  async calculateShiftStatistics(sessionId, shiftId, startedAt, endTime = null) {
    const endTimeToUse = endTime || new Date();

    const transactions = await db.selectAll(
      "tbl_transactions",
      "*",
      "session_id = ? AND created_at >= ? AND created_at <= ?",
      [sessionId, startedAt, endTimeToUse]
    );

    const stats = {
      buy_ins: { count: 0, amount: 0, cash: 0, online: 0 },
      cashouts: { count: 0, amount: 0 },
      credits_issued: { count: 0, amount: 0 },
      credits_settled: { count: 0, amount: 0, cash: 0, online: 0 },
      expenses: { count: 0, amount: 0 },
      float_additions: { count: 0, amount: 0 },
      deposits: { count: 0, amount: 0 },
      chip_deposits: { count: 0, amount: 0 },
      total_transactions: 0,
      unique_players: 0,
      total_inflow: 0,
      total_outflow: 0,
    };

    const playerSet = new Set();

    (transactions || []).forEach((t) => {
      stats.total_transactions++;
      if (t.player_id) playerSet.add(t.player_id);

      const amount = parseFloat(t.amount || 0);
      const chipsAmount = parseFloat(t.chips_amount || 0);

      switch (t.transaction_type) {
        case "buy_in":
          stats.buy_ins.count++;
          stats.buy_ins.amount += amount;
          stats.total_inflow += amount;
          if (t.payment_mode === "cash") stats.buy_ins.cash += amount;
          else if (t.payment_mode?.startsWith("online_"))
            stats.buy_ins.online += amount;
          break;
        case "cash_payout":
          stats.cashouts.count++;
          stats.cashouts.amount += amount;
          stats.total_outflow += amount;
          break;
        case "credit_issued":
        case "issue_credit":
          stats.credits_issued.count++;
          stats.credits_issued.amount += chipsAmount || amount;
          break;
        case "settle_credit":
          stats.credits_settled.count++;
          stats.credits_settled.amount += amount;
          stats.total_inflow += amount;
          if (t.payment_mode === "cash") stats.credits_settled.cash += amount;
          else if (t.payment_mode?.startsWith("online_"))
            stats.credits_settled.online += amount;
          break;
        case "expense":
          stats.expenses.count++;
          stats.expenses.amount += amount;
          stats.total_outflow += amount;
          break;
        case "add_float":
          stats.float_additions.count++;
          stats.float_additions.amount += amount;
          stats.total_inflow += amount;
          break;
        case "deposit_chips":
          stats.chip_deposits.count++;
          stats.chip_deposits.amount += chipsAmount;
          break;
        case "deposit_cash":
          stats.deposits.count++;
          stats.deposits.amount += amount;
          stats.total_inflow += amount;
          break;
      }
    });

    stats.unique_players = playerSet.size;
    stats.net_flow = stats.total_inflow - stats.total_outflow;

    return stats;
  }

  /**
   * Generate CSV report for shift
   */
  async generateShiftCSV(shiftId) {
    const shift = await db.select("tbl_cashier_shifts", "*", "shift_id = ?", [
      shiftId,
    ]);

    if (!shift) {
      throw new Error("Shift not found");
    }

    const cashierName = await this.getCashierName(shift.cashier_id);

    const transactions = await db.selectAll(
      "tbl_transactions",
      "*",
      "session_id = ? AND created_at >= ? AND created_at <= ?",
      [shift.session_id, shift.started_at, shift.ended_at || new Date()],
      "ORDER BY created_at ASC"
    );

    let csv = "SHIFT REPORT\n";
    csv += `Shift #,${shift.shift_number}\n`;
    csv += `Cashier,${cashierName}\n`;
    csv += `Started,${new Date(shift.started_at).toLocaleString("en-IN")}\n`;
    csv += `Ended,${shift.ended_at ? new Date(shift.ended_at).toLocaleString("en-IN") : "Active"}\n`;
    csv += `Duration,${this.formatDuration(shift.duration_minutes)}\n`;
    csv += "\n";

    csv += "OPENING BALANCES\n";
    csv += `Primary Wallet,${shift.opening_primary_wallet}\n`;
    csv += `Secondary Wallet,${shift.opening_secondary_wallet}\n`;
    csv += `Chips Value,${shift.opening_chips_value}\n`;
    csv += `Outstanding Credit,${shift.opening_outstanding_credit}\n`;
    csv += "\n";

    csv += "CLOSING BALANCES\n";
    csv += `Primary Wallet,${shift.closing_primary_wallet || "N/A"}\n`;
    csv += `Secondary Wallet,${shift.closing_secondary_wallet || "N/A"}\n`;
    csv += `Chips Value,${shift.closing_chips_value || "N/A"}\n`;
    csv += `Outstanding Credit,${shift.closing_outstanding_credit || "N/A"}\n`;
    csv += "\n";

    csv += "STATISTICS\n";
    csv += `Total Transactions,${shift.total_transactions}\n`;
    csv += `Buy-ins,${shift.total_buy_ins} (₹${shift.total_buy_ins_amount})\n`;
    csv += `Cashouts,${shift.total_cashouts} (₹${shift.total_cashouts_amount})\n`;
    csv += `Credits Issued,${shift.total_credits_issued} (₹${shift.total_credits_amount})\n`;
    csv += `Credits Settled,${shift.total_credits_settled} (₹${shift.total_credits_settled_amount})\n`;
    csv += `Expenses,${shift.total_expenses} (₹${shift.total_expenses_amount})\n`;
    csv += `Float Additions,${shift.total_float_additions} (₹${shift.total_float_additions_amount})\n`;
    csv += `Unique Players,${shift.unique_players_served}\n`;
    csv += "\n";

    csv += "TRANSACTIONS\n";
    csv +=
      "Time,Type,Player,Amount,Chips,Payment Mode,Primary,Secondary,Notes\n";

    (transactions || []).forEach((t) => {
      csv += `${new Date(t.created_at).toLocaleTimeString("en-IN")},`;
      csv += `${t.transaction_type},`;
      csv += `"${t.player_name || "-"}",`;
      csv += `${t.amount || 0},`;
      csv += `${t.chips_amount || 0},`;
      csv += `${t.payment_mode || "-"},`;
      csv += `${t.primary_amount || 0},`;
      csv += `${t.secondary_amount || 0},`;
      csv += `"${(t.notes || "").replace(/"/g, '""')}"\n`;
    });

    return csv;
  }

  /**
   * Get all shifts for a session (alias for getAllShifts)
   */
  async getSessionShifts(sessionId) {
    return this.getAllShifts(sessionId);
  }

  /**
   * Format duration in hours and minutes
   */
  formatDuration(minutes) {
    if (!minutes) return "0m";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }

  /**
   * Get all transactions for a specific cashier (across all their shifts)
   */
  async getCashierTransactions(cashierId, sessionId = null) {
    let whereClause = "cs.cashier_id = ?";
    let params = [cashierId];

    // If sessionId provided, filter by session
    if (sessionId !== null && sessionId !== undefined) {
      whereClause += " AND t.session_id = ?";
      params.push(sessionId);
    }

    // Get all shifts for this cashier
    const shifts = await db.queryAll(
      `SELECT cs.*, 
              COALESCE(c.full_name, u.full_name, u.username) as cashier_name
       FROM tbl_cashier_shifts cs
       LEFT JOIN tbl_cashiers c ON cs.cashier_id = c.cashier_id
       LEFT JOIN tbl_users u ON cs.cashier_id = u.user_id
       WHERE cs.cashier_id = ? ${sessionId !== null ? 'AND cs.session_id = ?' : ''}
       ORDER BY cs.started_at DESC`,
      sessionId !== null ? [cashierId, sessionId] : [cashierId]
    );

    // Get all transactions for each shift
    const allTransactions = [];
    const shiftMap = {};

    for (const shift of shifts || []) {
      const shiftStart = new Date(shift.started_at);
      const shiftEnd = shift.ended_at ? new Date(shift.ended_at) : new Date();
      
      // Get transactions for this shift
      const transactions = await db.queryAll(
        `SELECT t.*,
                COALESCE(c.full_name, u.full_name, u.username) as created_by_name
         FROM tbl_transactions t
         LEFT JOIN tbl_users u ON t.created_by = u.user_id
         LEFT JOIN tbl_cashiers c ON t.created_by = c.cashier_id
         WHERE t.session_id = ? 
           AND t.created_at >= ? 
           AND t.created_at <= ?
         ORDER BY t.created_at DESC`,
        [shift.session_id, shiftStart, shiftEnd]
      );

      // Add shift info to each transaction
      (transactions || []).forEach(t => {
        allTransactions.push({
          ...t,
          shift_id: shift.shift_id,
          shift_number: shift.shift_number,
          shift_started_at: shift.started_at,
          shift_ended_at: shift.ended_at,
          shift_status: shift.shift_status,
        });
      });

      shiftMap[shift.shift_id] = {
        shift_id: shift.shift_id,
        shift_number: shift.shift_number,
        started_at: shift.started_at,
        ended_at: shift.ended_at,
        duration_minutes: shift.duration_minutes,
        cashier_name: shift.cashier_name,
        statistics: await this.calculateShiftStatistics(
          shift.session_id,
          shift.shift_id,
          shift.started_at,
          shift.ended_at ? new Date(shift.ended_at) : null
        ),
      };
    }

    // Get cashier info
    const cashierName = await this.getCashierName(cashierId);

    return {
      cashier_id: cashierId,
      cashier_name: cashierName,
      total_shifts: (shifts || []).length,
      total_transactions: allTransactions.length,
      shifts: Object.values(shiftMap),
      transactions: allTransactions,
    };
  }
}

module.exports = new CashierShiftService();