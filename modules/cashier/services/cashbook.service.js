// modules/cashier/services/cashbook.service.js
// Daily Cashbook, Chip Ledger, and Credit Register Service

const db = require("../../../config/database");

class CashbookService {
  // ==========================================
  // DAILY CASHBOOK
  // ==========================================

  /**
   * Get cashbook data for a specific date
   */
  async getCashbookByDate(date) {
    const dateStr =
      typeof date === "string" ? date : date.toISOString().split("T")[0];

    // ✅ Get ALL sessions for this date - use DATE() function to match date only (ignore time)
    // This ensures we find sessions even if session_date has a time component
    const allSessions = await db.queryAll(
      `SELECT * FROM tbl_daily_sessions WHERE DATE(session_date) = ? ORDER BY session_id DESC`,
      [dateStr]
    );
    
    if (!allSessions || allSessions.length === 0) {
      console.log(`⚠️ No session found for date: ${dateStr}`);
      return {
        date: dateStr,
        has_data: false,
        message: "No session found for this date",
      };
    }

    // ✅ Prefer closed session (has historical data) or session with most transactions
    // If multiple sessions exist, use the one with transactions or the closed one
    let session = null;
    let allTransactions = [];

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

    console.log(`✅ Found session ${session.session_id} for date ${dateStr} (is_closed: ${session.is_closed})`);

    // ✅ Get ALL transactions from ALL sessions for this date (to show complete history)
    // This ensures we see all transactions even if session was closed and reopened
    const sessionIds = allSessions.map(s => s.session_id);
    const placeholders = sessionIds.map(() => '?').join(',');
    
    const transactions = await db.queryAll(
      `SELECT t.*, u.full_name as cashier_name, u.username as cashier_username, u.role as cashier_role
       FROM tbl_transactions t
       LEFT JOIN tbl_users u ON t.created_by = u.user_id
       WHERE t.session_id IN (${placeholders})
       ORDER BY t.created_at ASC`,
      sessionIds
    );
    
    console.log(`📊 Found ${transactions?.length || 0} transactions across ${allSessions.length} session(s) for date ${dateStr}`);

    // Calculate inflows and outflows
    let totalInflow = 0;
    let totalOutflow = 0;
    let cashBuyIns = 0;
    let onlineBuyIns = 0;
    let creditSettlements = 0;
    let floatAdditions = 0;
    let cashDeposits = 0;
    let cashPayouts = 0;
    let expenses = 0;

    (transactions || []).forEach((t) => {
      const amount = parseFloat(t.amount || 0);

      switch (t.transaction_type) {
        case "buy_in":
          totalInflow += amount;
          if (t.payment_mode === "cash") cashBuyIns += amount;
          else if (t.payment_mode?.startsWith("online_"))
            onlineBuyIns += amount;
          break;
        case "settle_credit":
          totalInflow += amount;
          creditSettlements += amount;
          break;
        case "add_float":
          // Only count if it's not the opening float (opening float is already in opening_balance)
          // Opening float transaction has notes like "Opening float for daily session"
          if (!t.notes || !t.notes.toLowerCase().includes('opening float')) {
            totalInflow += amount;
            floatAdditions += amount;
          }
          break;
        case "opening_chips":
          // Opening chips don't affect cash flow, just record-keeping
          break;
        case "deposit_cash":
          totalInflow += amount;
          cashDeposits += amount;
          break;
        case "deposit_chips":
          // deposit_chips doesn't affect cash flow (chips are stored, no cash changes hands)
          // But it should appear in the transactions list for record-keeping
          break;
        case "cash_payout":
          totalOutflow += amount;
          cashPayouts += amount;
          break;
        case "expense":
          totalOutflow += amount;
          expenses += amount;
          break;
      }
    });

    const openingBalance = parseFloat(session.opening_float || 0);
    const closingBalance = openingBalance + totalInflow - totalOutflow;
    const netChange = totalInflow - totalOutflow;

    return {
      date: dateStr,
      session_id: session.session_id,
      has_data: true,
      is_closed: session.is_closed === 1,

      summary: {
        opening_balance: openingBalance,
        total_inflow: totalInflow,
        total_outflow: totalOutflow,
        closing_balance: closingBalance,
        net_change: netChange,
      },

      breakdown: {
        inflow: {
          cash_buy_ins: cashBuyIns,
          online_buy_ins: onlineBuyIns,
          credit_settlements: creditSettlements,
          float_additions: floatAdditions,
          cash_deposits: cashDeposits,
          total: totalInflow,
        },
        outflow: {
          cash_payouts: cashPayouts,
          expenses: expenses,
          total: totalOutflow,
        },
      },

      transactions: transactions || [],
      transaction_count: (transactions || []).length,
    };
  }

  /**
   * Get cashbook data for date range
   */
  async getCashbookRange(startDate, endDate) {
    const sessions = await db.queryAll(
      `SELECT * FROM tbl_daily_sessions 
       WHERE session_date >= ? AND session_date <= ?
       ORDER BY session_date ASC`,
      [startDate, endDate]
    );

    const results = [];

    for (const session of sessions || []) {
      const dayData = await this.getCashbookByDate(session.session_date);
      results.push(dayData);
    }

    // Calculate totals
    const totals = {
      total_inflow: 0,
      total_outflow: 0,
      net_change: 0,
      days_count: results.length,
    };

    results.forEach((day) => {
      if (day.has_data) {
        totals.total_inflow += day.summary.total_inflow;
        totals.total_outflow += day.summary.total_outflow;
        totals.net_change += day.summary.net_change;
      }
    });

    return {
      start_date: startDate,
      end_date: endDate,
      days: results,
      totals,
    };
  }

  /**
   * Export cashbook to CSV
   */
  async exportCashbookCSV(startDate, endDate) {
    const data = await this.getCashbookRange(startDate, endDate);

    let csv = "CASHBOOK REPORT\n";
    csv += `Period: ${startDate} to ${endDate}\n\n`;

    // Summary
    csv += "SUMMARY\n";
    csv += `Total Days,${data.totals.days_count}\n`;
    csv += `Total Inflow,${data.totals.total_inflow}\n`;
    csv += `Total Outflow,${data.totals.total_outflow}\n`;
    csv += `Net Change,${data.totals.net_change}\n\n`;

    // Daily breakdown
    csv += "DAILY BREAKDOWN\n";
    csv +=
      "Date,Opening,Cash Buy-ins,Online Buy-ins,Credit Settled,Float Added,Cash Payouts,Expenses,Closing,Net\n";

    data.days.forEach((day) => {
      if (day.has_data) {
        csv += `${day.date},`;
        csv += `${day.summary.opening_balance},`;
        csv += `${day.breakdown.inflow.cash_buy_ins},`;
        csv += `${day.breakdown.inflow.online_buy_ins},`;
        csv += `${day.breakdown.inflow.credit_settlements},`;
        csv += `${day.breakdown.inflow.float_additions},`;
        csv += `${day.breakdown.outflow.cash_payouts},`;
        csv += `${day.breakdown.outflow.expenses},`;
        csv += `${day.summary.closing_balance},`;
        csv += `${day.summary.net_change}\n`;
      }
    });

    csv += "\n";

    // All transactions
    csv += "ALL TRANSACTIONS\n";
    csv += "Date,Time,Type,Player,Amount,Payment Mode,Notes\n";

    data.days.forEach((day) => {
      if (day.has_data && day.transactions) {
        day.transactions.forEach((t) => {
          csv += `${day.date},`;
          csv += `${new Date(t.created_at).toLocaleTimeString("en-IN")},`;
          csv += `${t.transaction_type},`;
          csv += `"${t.player_name || "-"}",`;
          csv += `${t.amount || 0},`;
          csv += `${t.payment_mode || "-"},`;
          csv += `"${(t.notes || "").replace(/"/g, '""')}"\n`;
        });
      }
    });

    return csv;
  }

  // ==========================================
  // CHIP LEDGER
  // ==========================================

  /**
   * Get chip ledger for a specific date
   */
  async getChipLedgerByDate(date) {
    const dateStr =
      typeof date === "string" ? date : date.toISOString().split("T")[0];

    // ✅ Get ALL sessions for this date - use DATE() function to match date only (ignore time)
    const allSessions = await db.queryAll(
      `SELECT * FROM tbl_daily_sessions WHERE DATE(session_date) = ? ORDER BY session_id DESC`,
      [dateStr]
    );
    
    if (!allSessions || allSessions.length === 0) {
      return {
        date: dateStr,
        has_data: false,
        message: "No session found for this date",
      };
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

    // Opening chips
    const opening = {
      chips_100: parseInt(session.chips_100_opening || 0),
      chips_500: parseInt(session.chips_500_opening || 0),
      chips_5000: parseInt(session.chips_5000_opening || 0),
      chips_10000: parseInt(session.chips_10000_opening || 0),
    };
    opening.total_count =
      opening.chips_100 +
      opening.chips_500 +
      opening.chips_5000 +
      opening.chips_10000;
    opening.total_value =
      opening.chips_100 * 100 +
      opening.chips_500 * 500 +
      opening.chips_5000 * 5000 +
      opening.chips_10000 * 10000;

    // Current (closing) chips
    const current = {
      chips_100: parseInt(session.chips_100_current || 0),
      chips_500: parseInt(session.chips_500_current || 0),
      chips_5000: parseInt(session.chips_5000_current || 0),
      chips_10000: parseInt(session.chips_10000_current || 0),
    };
    current.total_count =
      current.chips_100 +
      current.chips_500 +
      current.chips_5000 +
      current.chips_10000;
    current.total_value =
      current.chips_100 * 100 +
      current.chips_500 * 500 +
      current.chips_5000 * 5000 +
      current.chips_10000 * 10000;

    // Chips with players
    const withPlayers = {
      chips_100: parseInt(session.chips_100_out || 0),
      chips_500: parseInt(session.chips_500_out || 0),
      chips_5000: parseInt(session.chips_5000_out || 0),
      chips_10000: parseInt(session.chips_10000_out || 0),
    };
    withPlayers.total_count =
      withPlayers.chips_100 +
      withPlayers.chips_500 +
      withPlayers.chips_5000 +
      withPlayers.chips_10000;
    withPlayers.total_value =
      withPlayers.chips_100 * 100 +
      withPlayers.chips_500 * 500 +
      withPlayers.chips_5000 * 5000 +
      withPlayers.chips_10000 * 10000;

    // ✅ Get ALL transactions from ALL sessions for this date (to show complete history)
    // This ensures we see all transactions even if session was closed and reopened
    const sessionIds = allSessions.map(s => s.session_id);
    const placeholders = sessionIds.map(() => '?').join(',');
    
    const chipTransactions = await db.queryAll(
      `SELECT
        t.*,
        u.full_name as cashier_name,
        u.username as cashier_username,
        u.role as cashier_role,
        (SELECT COUNT(*) FROM tbl_transaction_notes tn WHERE tn.transaction_id = t.transaction_id) as notes_count,
        (SELECT MAX(tn.is_resolved) FROM tbl_transaction_notes tn WHERE tn.transaction_id = t.transaction_id) as notes_resolved
      FROM tbl_transactions t
      LEFT JOIN tbl_users u ON t.created_by = u.user_id
      WHERE t.session_id IN (${placeholders})
      ORDER BY t.created_at DESC`,
      sessionIds
    );

    return {
      date: dateStr,
      session_id: session.session_id,
      has_data: true,

      opening,
      current,
      with_players: withPlayers,

      movements: chipTransactions || [],
      movement_count: (chipTransactions || []).length,

      summary: {
        with_cashier: current.total_count,
        with_cashier_value: current.total_value,
        with_players: withPlayers.total_count,
        with_players_value: withPlayers.total_value,
      },
    };
  }

  /**
   * Export chip ledger to CSV
   */
  async exportChipLedgerCSV(startDate, endDate) {
    const sessions = await db.queryAll(
      `SELECT * FROM tbl_daily_sessions 
       WHERE session_date >= ? AND session_date <= ?
       ORDER BY session_date ASC`,
      [startDate, endDate]
    );

    let csv = "CHIP LEDGER REPORT\n";
    csv += `Period: ${startDate} to ${endDate}\n\n`;

    csv += "DAILY CHIP STATUS\n";
    csv +=
      "Date,Opening ₹100,Opening ₹500,Opening ₹5000,Opening ₹10000,Opening Value,";
    csv +=
      "Closing ₹100,Closing ₹500,Closing ₹5000,Closing ₹10000,Closing Value,";
    csv += "With Players Count,With Players Value\n";

    for (const session of sessions || []) {
      const ledger = await this.getChipLedgerByDate(session.session_date);
      if (ledger.has_data) {
        csv += `${ledger.date},`;
        csv += `${ledger.opening.chips_100},${ledger.opening.chips_500},${ledger.opening.chips_5000},${ledger.opening.chips_10000},${ledger.opening.total_value},`;
        csv += `${ledger.current.chips_100},${ledger.current.chips_500},${ledger.current.chips_5000},${ledger.current.chips_10000},${ledger.current.total_value},`;
        csv += `${ledger.with_players.total_count},${ledger.with_players.total_value}\n`;
      }
    }

    return csv;
  }

  // ==========================================
  // CREDIT REGISTER
  // ==========================================

  /**
   * Get credit register for a specific date
   */
  async getCreditRegisterByDate(date) {
    const dateStr =
      typeof date === "string" ? date : date.toISOString().split("T")[0];

    // ✅ Get ALL sessions for this date - use DATE() function to match date only (ignore time)
    const allSessions = await db.queryAll(
      `SELECT * FROM tbl_daily_sessions WHERE DATE(session_date) = ? ORDER BY session_id DESC`,
      [dateStr]
    );
    
    if (!allSessions || allSessions.length === 0) {
      return {
        date: dateStr,
        has_data: false,
        message: "No session found for this date",
      };
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

    // ✅ Get all credits from ALL sessions for this date (to show complete history)
    const sessionIds = allSessions.map(s => s.session_id);
    const placeholders = sessionIds.map(() => '?').join(',');
    
    const credits = await db.queryAll(
      `SELECT c.*, p.player_name, p.phone_number, p.player_code
       FROM tbl_credits c
       LEFT JOIN tbl_players p ON c.player_id = p.player_id
       WHERE c.session_id IN (${placeholders})
       ORDER BY c.created_at DESC`,
      sessionIds
    );

    // Calculate totals
    let totalIssued = 0;
    let totalSettled = 0;
    let totalOutstanding = 0;

    (credits || []).forEach((c) => {
      totalIssued += parseFloat(c.credit_issued || 0);
      totalSettled += parseFloat(c.credit_settled || 0);
      totalOutstanding += parseFloat(c.credit_outstanding || 0);
    });

    // Get outstanding credits (not fully settled)
    const outstandingCredits = (credits || []).filter(
      (c) => c.is_fully_settled !== 1
    );

    // ✅ Get credit-related transactions from ALL sessions for this date
    const creditTransactions = await db.queryAll(
      `SELECT
        t.*,
        u.full_name as cashier_name,
        u.username as cashier_username,
        u.role as cashier_role,
        (SELECT COUNT(*) FROM tbl_transaction_notes tn WHERE tn.transaction_id = t.transaction_id) as notes_count,
        (SELECT MAX(tn.is_resolved) FROM tbl_transaction_notes tn WHERE tn.transaction_id = t.transaction_id) as notes_resolved
      FROM tbl_transactions t
      LEFT JOIN tbl_users u ON t.created_by = u.user_id
      WHERE t.session_id IN (${placeholders}) AND (t.transaction_type = 'credit_issued' OR t.transaction_type = 'issue_credit' OR t.transaction_type = 'settle_credit' OR t.transaction_type = 'return_chips')
      ORDER BY t.created_at DESC`,
      sessionIds
    );

    // has_data should be true if there are credits OR transactions
    const hasData = (credits && credits.length > 0) || (creditTransactions && creditTransactions.length > 0);

    return {
      date: dateStr,
      session_id: session.session_id,
      has_data: hasData,

      summary: {
        total_issued: totalIssued,
        total_settled: totalSettled,
        total_outstanding: totalOutstanding,
        credit_count: (credits || []).length,
        outstanding_count: outstandingCredits.length,
      },

      credits: credits || [],
      outstanding_credits: outstandingCredits,
      transactions: creditTransactions || [],
      transaction_count: (creditTransactions || []).length,
    };
  }

  /**
   * Get all outstanding credits across all sessions
   */
  async getAllOutstandingCredits() {
    const credits = await db.queryAll(
      `SELECT c.*, p.player_name, p.phone_number, p.player_code, s.session_date
       FROM tbl_credits c
       LEFT JOIN tbl_players p ON c.player_id = p.player_id
       LEFT JOIN tbl_daily_sessions s ON c.session_id = s.session_id
       WHERE c.is_fully_settled = 0
       ORDER BY c.created_at DESC`
    );

    let totalOutstanding = 0;
    (credits || []).forEach((c) => {
      totalOutstanding += parseFloat(c.credit_outstanding || 0);
    });

    return {
      total_outstanding: totalOutstanding,
      count: (credits || []).length,
      credits: credits || [],
    };
  }

  /**
   * Export credit register to CSV
   */
  async exportCreditRegisterCSV(startDate, endDate) {
    const sessions = await db.queryAll(
      `SELECT * FROM tbl_daily_sessions 
       WHERE session_date >= ? AND session_date <= ?
       ORDER BY session_date ASC`,
      [startDate, endDate]
    );

    const sessionIds = (sessions || []).map((s) => s.session_id);

    if (sessionIds.length === 0) {
      return "No data found for the selected period";
    }

    const credits = await db.queryAll(
      `SELECT c.*, p.player_name, p.phone_number, p.player_code, s.session_date
       FROM tbl_credits c
       LEFT JOIN tbl_players p ON c.player_id = p.player_id
       LEFT JOIN tbl_daily_sessions s ON c.session_id = s.session_id
       WHERE c.session_id IN (${sessionIds.join(",")})
       ORDER BY s.session_date, c.created_at`
    );

    let csv = "CREDIT REGISTER REPORT\n";
    csv += `Period: ${startDate} to ${endDate}\n\n`;

    // Summary
    let totalIssued = 0;
    let totalSettled = 0;
    let totalOutstanding = 0;

    (credits || []).forEach((c) => {
      totalIssued += parseFloat(c.credit_issued || 0);
      totalSettled += parseFloat(c.credit_settled || 0);
      totalOutstanding += parseFloat(c.credit_outstanding || 0);
    });

    csv += "SUMMARY\n";
    csv += `Total Credits,${(credits || []).length}\n`;
    csv += `Total Issued,${totalIssued}\n`;
    csv += `Total Settled,${totalSettled}\n`;
    csv += `Total Outstanding,${totalOutstanding}\n\n`;

    // All credits
    csv += "CREDIT DETAILS\n";
    csv +=
      "Date,Player,Phone,Issued,Settled,Outstanding,Status,₹100,₹500,₹5000,₹10000\n";

    (credits || []).forEach((c) => {
      csv += `${c.session_date},`;
      csv += `"${c.player_name || "-"}",`;
      csv += `${c.phone_number || "-"},`;
      csv += `${c.credit_issued || 0},`;
      csv += `${c.credit_settled || 0},`;
      csv += `${c.credit_outstanding || 0},`;
      csv += `${c.is_fully_settled ? "Settled" : "Outstanding"},`;
      csv += `${c.chips_100 || 0},`;
      csv += `${c.chips_500 || 0},`;
      csv += `${c.chips_5000 || 0},`;
      csv += `${c.chips_10000 || 0}\n`;
    });

    return csv;
  }

  // ==========================================
  // EMAIL REPORTS
  // ==========================================

  /**
   * Log email report
   */
  async logEmailReport(reportType, fromDate, toDate, recipients, sentBy, status, error = null) {
    await db.insert("tbl_report_emails", {
      report_type: reportType,
      from_date: fromDate,
      to_date: toDate,
      recipients: Array.isArray(recipients) ? recipients.join(",") : recipients,
      sent_by: sentBy,
      status: status,
      error_message: error,
      sent_at: new Date(),
    });
  }

  /**
   * Get email report history
   */
  async getEmailReportHistory(limit = 50) {
    const reports = await db.selectAll(
      "tbl_report_emails",
      "*",
      null,
      null,
      `ORDER BY sent_at DESC LIMIT ${limit}`
    );
    return reports || [];
  }

  // ==========================================
  // DELETE ALL (for a date)
  // ==========================================

  /**
   * Delete all transactions for a date (with proper permissions check)
   */
  async deleteAllTransactionsForDate(date, userId) {
    const dateStr = typeof date === "string" ? date : date.toISOString().split("T")[0];

    // ✅ Get session for this date - use DATE() function to match date only (ignore time)
    const sessions = await db.queryAll(
      `SELECT * FROM tbl_daily_sessions WHERE DATE(session_date) = ? ORDER BY session_id DESC LIMIT 1`,
      [dateStr]
    );
    
    const session = sessions && sessions.length > 0 ? sessions[0] : null;

    if (!session) {
      throw new Error("No session found for this date");
    }

    if (session.is_closed) {
      throw new Error("Cannot delete transactions from a closed session");
    }

    // Delete transactions
    await db.query("DELETE FROM tbl_transactions WHERE session_id = ?", [
      session.session_id,
    ]);

    // Reset session values
    await db.update(
      "tbl_daily_sessions",
      {
        secondary_wallet: 0,
        secondary_wallet_deposits: 0,
        secondary_wallet_withdrawals: 0,
        total_deposits: 0,
        total_withdrawals: 0,
        total_expenses: 0,
        outstanding_credit: 0,
        total_chips_out: 0,
        chips_100_out: 0,
        chips_500_out: 0,
        chips_5000_out: 0,
        chips_10000_out: 0,
        chips_100_current: session.chips_100_opening,
        chips_500_current: session.chips_500_opening,
        chips_5000_current: session.chips_5000_opening,
        chips_10000_current: session.chips_10000_opening,
      },
      "session_id = ?",
      [session.session_id]
    );

    return {
      success: true,
      message: `All transactions deleted for ${dateStr}`,
      deleted_by: userId,
    };
  }

  /**
   * Get all reversals with filtering by type and date
   */
  async getReversals(filters = {}) {
    // Find reversals by checking for transactions with original_transaction_id (reversal transactions)
    // Reversal transactions always have original_transaction_id pointing to the original transaction
    let whereClause = "t.original_transaction_id IS NOT NULL";
    let params = [];

    // Date filter
    if (filters.date) {
      whereClause += " AND DATE(t.created_at) = ?";
      params.push(filters.date);
    }

    // Get reversals with original transaction details
    const reversals = await db.queryAll(
      `SELECT 
        t.transaction_id,
        t.session_id,
        t.player_id,
        t.player_name,
        t.amount,
        t.chips_amount,
        t.reversal_reason,
        t.created_at,
        t.created_by,
        t.original_transaction_id,
        t.transaction_type,
        ot.transaction_type as original_transaction_type,
        ot.created_at as original_created_at,
        u.username as reversed_by_username,
        u.full_name as reversed_by_name
      FROM tbl_transactions t
      LEFT JOIN tbl_transactions ot ON t.original_transaction_id = ot.transaction_id
      LEFT JOIN tbl_users u ON t.created_by = u.user_id
      WHERE ${whereClause}
      ORDER BY t.created_at DESC`,
      params
    );

    if (!reversals || reversals.length === 0) {
      return {
        reversals: [],
        summary: {
          total: 0,
          cashbook: 0,
          chip_ledger: 0,
          credit_register: 0,
          house_player: 0,
          credit_limit: 0
        }
      };
    }

    // Categorize reversals
    const cashbookTypes = ['buy_in', 'settle_cash', 'cash_payout', 'deposit_cash', 'add_float', 'expense'];
    const chipLedgerTypes = ['deposit_chips', 'return_chips', 'redeem_stored'];
    const creditRegisterTypes = ['issue_credit', 'credit_issued', 'settle_credit'];

    const categorized = reversals.map(rev => {
      const originalType = rev.original_transaction_type || '';
      let category = 'other';

      if (cashbookTypes.includes(originalType)) {
        category = 'cashbook';
      } else if (chipLedgerTypes.includes(originalType)) {
        category = 'chip_ledger';
      } else if (creditRegisterTypes.includes(originalType)) {
        category = 'credit_register';
      }
      // TODO: Add house_player and credit_limit categorization when those features are implemented

      return {
        ...rev,
        category
      };
    });

    // Calculate summary
    const summary = {
      total: categorized.length,
      cashbook: categorized.filter(r => r.category === 'cashbook').length,
      chip_ledger: categorized.filter(r => r.category === 'chip_ledger').length,
      credit_register: categorized.filter(r => r.category === 'credit_register').length,
      house_player: categorized.filter(r => r.category === 'house_player').length,
      credit_limit: categorized.filter(r => r.category === 'credit_limit').length
    };

    // Apply category filter if provided
    let filtered = categorized;
    if (filters.category && filters.category !== 'all') {
      filtered = categorized.filter(r => r.category === filters.category);
    }

    // Apply search filter if provided
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(r =>
        r.player_name?.toLowerCase().includes(searchLower) ||
        r.reversal_reason?.toLowerCase().includes(searchLower) ||
        r.reversed_by_username?.toLowerCase().includes(searchLower) ||
        r.original_transaction_type?.toLowerCase().includes(searchLower)
      );
    }

    return {
      reversals: filtered,
      summary
    };
  }

  // ==========================================
  // EXPENSE REPORT
  // ==========================================

  /**
   * Get expense report for a specific date
   * Returns dealer tips and club expenses
   */
  async getExpenseReportByDate(date) {
    const dateStr =
      typeof date === "string" ? date : date.toISOString().split("T")[0];

    // ✅ Get ALL sessions for this date
    const allSessions = await db.queryAll(
      `SELECT * FROM tbl_daily_sessions WHERE DATE(session_date) = ? ORDER BY session_id DESC`,
      [dateStr]
    );
    
    if (!allSessions || allSessions.length === 0) {
      console.log(`⚠️ No session found for date: ${dateStr}`);
      return {
        date: dateStr,
        has_data: false,
        message: "No session found for this date",
      };
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

    console.log(`✅ Found session ${session.session_id} for date ${dateStr} (is_closed: ${session.is_closed})`);

    // ✅ Get dealer tips from ALL sessions for this date
    const sessionIds = allSessions.map(s => s.session_id);
    const placeholders = sessionIds.map(() => '?').join(',');
    
    const dealerTips = await db.queryAll(
      `SELECT 
        dt.*,
        d.dealer_name,
        d.dealer_code,
        u.full_name as recorded_by_name,
        u.username as recorded_by_username
      FROM tbl_dealer_tips dt
      LEFT JOIN tbl_dealers d ON dt.dealer_id = d.dealer_id
      LEFT JOIN tbl_users u ON dt.recorded_by = u.user_id
      WHERE dt.session_id IN (${placeholders})
      ORDER BY dt.created_at ASC`,
      sessionIds
    );

    // ✅ Get club expenses from ALL sessions for this date
    const clubExpenses = await db.queryAll(
      `SELECT 
        ce.*,
        u.full_name as recorded_by_name,
        u.username as recorded_by_username
      FROM tbl_club_expenses ce
      LEFT JOIN tbl_users u ON ce.created_by = u.user_id
      WHERE ce.session_id IN (${placeholders})
      ORDER BY ce.created_at ASC`,
      sessionIds
    );

    // Calculate totals
    let totalDealerTips = 0;
    let totalClubExpenses = 0;

    (dealerTips || []).forEach((tip) => {
      totalDealerTips += parseFloat(tip.cash_paid_to_dealer || 0);
    });

    (clubExpenses || []).forEach((expense) => {
      totalClubExpenses += parseFloat(expense.amount || 0);
    });

    const totalExpenses = totalDealerTips + totalClubExpenses;

    // Format dealer tips for response and remove duplicates
    // Deduplicate based on tip_id, or if tip_id is 0/missing, use dealer_id + amount + full timestamp
    const seenTips = new Set();
    const formattedDealerTips = [];
    
    (dealerTips || []).forEach((tip) => {
      const tipId = tip.tip_id;
      const dealerId = tip.dealer_id;
      const amount = parseFloat(tip.cash_paid_to_dealer || 0);
      const createdAt = tip.created_at;
      
      // Create unique key: tip_id if valid, otherwise dealer_id + amount + full timestamp (milliseconds)
      let uniqueKey;
      if (tipId && tipId > 0) {
        uniqueKey = `tip_${tipId}`;
      } else {
        // For tips without valid tip_id, use full timestamp to avoid false duplicates
        // Only consider it a duplicate if same dealer, same amount, and within 1 second
        const timestamp = createdAt ? new Date(createdAt).getTime() : 0;
        uniqueKey = `dealer_${dealerId}_amount_${amount}_time_${timestamp}`;
      }
      
      // Only add if we haven't seen this tip before
      if (!seenTips.has(uniqueKey)) {
        seenTips.add(uniqueKey);
        formattedDealerTips.push({
          tip_id: tipId,
          dealer_id: dealerId,
          dealer_name: tip.dealer_name || 'Unknown Dealer',
          dealer_code: tip.dealer_code,
          chip_amount: parseFloat(tip.chip_amount || 0),
          cash_paid: parseFloat(tip.cash_paid_to_dealer || 0),
          cash_percentage: parseFloat(tip.cash_percentage || 50),
          notes: tip.notes || null,
          created_at: createdAt,
          recorded_by: tip.recorded_by_name || tip.recorded_by_username || null,
        });
      }
    });

    // Format club expenses for response and remove duplicates
    // Deduplicate based on expense_id, or if expense_id is 0/missing, use category + amount + full timestamp
    const seenExpenses = new Set();
    const formattedClubExpenses = [];
    
    (clubExpenses || []).forEach((expense) => {
      const expenseId = expense.expense_id;
      const category = expense.expense_category || 'Club Expense';
      const amount = parseFloat(expense.amount || 0);
      const createdAt = expense.created_at;
      
      // Create unique key: expense_id if valid, otherwise category + amount + full timestamp (milliseconds)
      let uniqueKey;
      if (expenseId && expenseId > 0) {
        uniqueKey = `expense_${expenseId}`;
      } else {
        // For expenses without valid expense_id, use full timestamp to avoid false duplicates
        const timestamp = createdAt ? new Date(createdAt).getTime() : 0;
        uniqueKey = `category_${category}_amount_${amount}_time_${timestamp}`;
      }
      
      // Only add if we haven't seen this expense before
      if (!seenExpenses.has(uniqueKey)) {
        seenExpenses.add(uniqueKey);
        formattedClubExpenses.push({
          expense_id: expenseId,
          expense_category: category,
          expense_category_label: expense.expense_category_label || null,
          amount: amount,
          description: expense.expense_category_label || category,
          notes: expense.notes || null,
          vendor_name: expense.vendor_name || null,
          bill_number: expense.bill_number || null,
          attachment_url: expense.attachment_url || null,
          attachment_public_id: expense.attachment_public_id || null,
          created_at: createdAt,
          recorded_by: expense.recorded_by_name || expense.recorded_by_username || null,
        });
      }
    });

    return {
      date: dateStr,
      session_id: session.session_id,
      has_data: true,
      is_closed: session.is_closed === 1,
      summary: {
        total_dealer_tips: totalDealerTips,
        total_club_expenses: totalClubExpenses,
        total_expenses: totalExpenses,
      },
      dealer_tips: formattedDealerTips,
      club_expenses: formattedClubExpenses,
    };
  }
}

module.exports = new CashbookService();