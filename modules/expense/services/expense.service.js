// modules/expense/services/expense.service.js
// Expense Service - Club Expenses & Player Expenses

const db = require('../../../config/database');
const cashierService = require('../../cashier/services/cashier.service');
const staffService = require('../../staff/services/staff.service');

class ExpenseService {
  // ==========================================
  // PLAYER EXPENSES (Chips returned to cashier)
  // ==========================================

  /**
   * Record Player Expense
   * When player returns chips for food, drinks, tips, etc.
   * Chips are returned to cashier inventory
   */
  async recordPlayerExpense(data, userId) {
  // =========================
  // Validate active session
  // =========================
  const session = await cashierService.getTodaySession();
  if (!session) {
    throw new Error('No active session found');
  }

  // =========================
  // Validate chip breakdown
  // =========================
  const chipBreakdown = data.chip_breakdown || {};
  if (
    !chipBreakdown.chips_100 &&
    !chipBreakdown.chips_500 &&
    !chipBreakdown.chips_1000 &&
    !chipBreakdown.chips_5000 &&
    !chipBreakdown.chips_10000
  ) {
    throw new Error('Chip breakdown is required');
  }

  // =========================
  // Calculate chip value
  // =========================
  const chips100 = chipBreakdown.chips_100 || 0;
  const chips500 = chipBreakdown.chips_500 || 0;
  const chips1000 = chipBreakdown.chips_1000 || 0;
  const chips5000 = chipBreakdown.chips_5000 || 0;
  const chips10000 = chipBreakdown.chips_10000 || 0;

  const totalValue =
    chips100 * 100 +
    chips500 * 500 +
    chips1000 * 1000 +
    chips5000 * 5000 +
    chips10000 * 10000;

  // Validate amount if sent
  if (
    data.chip_amount &&
    Math.abs(parseFloat(data.chip_amount) - totalValue) > 0.01
  ) {
    throw new Error(
      `Chip breakdown value (₹${totalValue}) does not match declared amount (₹${data.chip_amount})`
    );
  }

  // =========================
  // Update chip inventory (chips IN)
  // ✅ ONLY chip movement - NO cash deduction
  // =========================
  await cashierService.updateChipInventory(
    session.session_id,
    chipBreakdown,
    false // receiving chips
  );

  // =========================
  // ✅ NO CASH PAYMENT - Player Expense is chip-only movement
  // Chips are returned to inventory, no money is deducted from any wallet
  // =========================

  // =========================
  // Create player expense record
  // ✅ Chip-only movement - no cash payment
  // =========================
  const result = await db.insert('tbl_player_expenses', {
  session_id: session.session_id,
  player_id: data.player_id || null,
  player_name: data.player_name || null,

  chip_amount: totalValue,
  cash_paid_to_vendor: 0,   // ✅ NO cash payment - chip-only movement

  chips_100: chips100,
  chips_500: chips500,
  chips_1000: chips1000,
  chips_5000: chips5000,
  chips_10000: chips10000,

  expense_category: data.expense_category || 'food',
  paid_from_wallet: null,  // ✅ No wallet used - chip-only

  notes: data.notes || `Player returned chips for ${data.expense_category || 'expense'} (chip-only movement)`,

  created_by: userId                // ✅ MUST NOT BE NULL
});


  // =========================
  // Update session totals (chip count only, no cash)
  // ✅ NO wallet updates - chip-only movement
  // =========================
  await db.update(
    'tbl_daily_sessions',
    {
      total_player_expenses_received:
        (parseFloat(session.total_player_expenses_received) || 0) + totalValue
      // ✅ NO total_expenses update (no cash movement)
      // ✅ NO wallet updates (no cash deduction)
    },
    'session_id = ?',
    [session.session_id]
  );

  // =========================
  // Create transaction record for dashboard tracking
  // ✅ Chip-only movement - amount = 0 (no cash movement)
  // =========================
  await db.insert('tbl_transactions', {
    session_id: session.session_id,
    transaction_type: 'expense',
    activity_type: 'player_expense',
    activity_id: result.insert_id,
    player_id: data.player_id || null,
    player_name: data.player_name || 'Vendor Expense',
    amount: 0,  // ✅ NO cash movement - chip-only
    chips_amount: totalValue,
    chips_100: chips100,
    chips_500: chips500,
    chips_1000: chips1000,
    chips_5000: chips5000,
    chips_10000: chips10000,
    wallet_used: null,  // ✅ No wallet used
    primary_amount: 0,  // ✅ No cash from primary
    secondary_amount: 0,  // ✅ No cash from secondary
    notes: data.notes || `Player expense - ${data.expense_category || 'misc'} (chip-only movement)`,
    created_by: userId
  });

  // =========================
  // Log chip movement
  // =========================
  try {
    await this.logChipMovement(session.session_id, {
      movement_type: 'player_expense',
      direction: 'in',
      player_id: data.player_id || null,
      chip_breakdown: chipBreakdown,
      total_value: totalValue,
      notes: `Player expense (${data.expense_category || 'misc'})`,
      created_by: userId
    });
  } catch (chipLogError) {
    // ✅ Don't fail the transaction if chip movement log fails
    // Log the error but continue with the response
    console.error('⚠️ Warning: Failed to log chip movement:', chipLogError.message);
  }

  // =========================
  // Response
  // =========================
  return {
    expense_id: result.insert_id,
    chip_amount: totalValue,
    chip_breakdown: chipBreakdown,
    paid_from_wallet: null,  // ✅ No wallet used
    message: `Player expense recorded: ₹${totalValue} chips returned to inventory (chip-only movement, no cash deducted)`
  };
}

  /**
   * Get player expenses for session
   */
  async getPlayerExpensesForSession(sessionId) {
    const expenses = await db.queryAll(`
      SELECT 
        e.*,
        u.username as created_by_name,
        u.full_name as created_by_full_name
      FROM tbl_player_expenses e
      LEFT JOIN tbl_users u ON e.created_by = u.user_id
      WHERE e.session_id = ?
      ORDER BY e.created_at DESC
    `, [sessionId]);

    return expenses || [];
  }

  // ==========================================
  // CLUB EXPENSES (Operational expenses)
  // ==========================================

  /**
   * Record Club Expense
   * Food delivery, salary advance, utilities, etc.
   * Paid from secondary wallet first, then primary if needed
   */
  async recordClubExpense(data, userId) {
    // Validate session
    const session = await cashierService.getTodaySession();
    if (!session) {
      throw new Error('No active session found');
    }

    const amount = parseFloat(data.amount);
    if (!amount || amount <= 0) {
      throw new Error('Invalid expense amount');
    }

    // ✅ IMPORTANT: Use Cash in Hand (NOT Online Money) + Primary Wallet
    // Step 1: Check Cash in Hand (cash_balance) first
    // Step 2: If insufficient, use Primary Wallet (Float)
    // NEVER use Online Money (online_balance)
    const cashInHand = parseFloat(session.cash_balance || 0); // Only cash buy-ins
    const primaryAvailable = parseFloat(session.primary_wallet || 0); // Float
    const totalAvailable = cashInHand + primaryAvailable;

    // Check if total funds are sufficient
    if (amount > totalAvailable) {
      throw new Error(`Insufficient cash. Available: ₹${totalAvailable.toFixed(2)} (Cash in Hand: ₹${cashInHand.toFixed(2)}, Primary Wallet: ₹${primaryAvailable.toFixed(2)}). Online Money cannot be used for club expenses.`);
    }

    // Determine how to split the payment (Cash in Hand first, then Primary Wallet)
    let fromCashInHand = 0;
    let fromPrimary = 0;

    if (amount <= cashInHand) {
      // All from Cash in Hand
      fromCashInHand = amount;
    } else {
      // Take all from Cash in Hand, rest from Primary Wallet
      fromCashInHand = cashInHand;
      fromPrimary = amount - cashInHand;
    }

    // Handle salary advance - link to staff
    let staffId = null;
    if (data.expense_category === 'salary_advance' && data.staff_id) {
      staffId = data.staff_id;
      // Create salary advance record
      await staffService.giveSalaryAdvance(
        staffId,
        { advance_amount: amount, notes: data.notes },
        session.session_id,
        userId
      );
    }

    // Determine wallet used for record
    let paidFromWallet = 'secondary';
    if (fromCashInHand === 0) {
      paidFromWallet = 'primary';
    } else if (fromPrimary > 0) {
      paidFromWallet = 'split';
    }

    // Create expense record in tbl_club_expenses
    console.log('Creating club expense with data:', {
      attachment_url: data.attachment_url,
      attachment_public_id: data.attachment_public_id
    });
    
    const result = await db.insert('tbl_club_expenses', {
      session_id: session.session_id,
      expense_category: data.expense_category,
      expense_category_label: data.expense_category_label || this.getCategoryLabel(data.expense_category),
      amount: amount,
      paid_from_wallet: paidFromWallet,
      staff_id: staffId,
      notes: fromPrimary > 0 && fromCashInHand > 0 
        ? `${data.notes || ''} [Split: ₹${fromCashInHand} cash in hand + ₹${fromPrimary} primary]`.trim()
        : (data.notes || null),
      vendor_name: data.vendor_name || null,
      bill_number: data.bill_number || null,
      attachment_url: data.attachment_url || null,
      attachment_public_id: data.attachment_public_id || null,
      created_by: userId

    });
    
    console.log('Club expense created with ID:', result.insert_id);

    // ✅ ALSO CREATE TRANSACTION RECORD for cashbook display
    const       transactionNotes = [
      data.notes || '',
      `Category: ${this.getCategoryLabel(data.expense_category)}`,
      data.vendor_name ? `Vendor: ${data.vendor_name}` : '',
      data.bill_number ? `Bill: ${data.bill_number}` : '',
      fromPrimary > 0 && fromCashInHand > 0 
        ? `[Split: ₹${fromCashInHand} cash in hand + ₹${fromPrimary} primary]`
        : ''
    ].filter(Boolean).join(' | ');

    await db.insert('tbl_transactions', {
      session_id: session.session_id,
      transaction_type: 'expense',
      activity_type: 'club_expense',
      activity_id: result.insert_id, // Link to club expense record
      player_id: null,
      player_name: null,
      amount: amount,
      chips_amount: 0,
      payment_mode: 'cash',
      wallet_used: paidFromWallet,
      primary_amount: fromPrimary,
      secondary_amount: fromCashInHand, // Cash in Hand amount
      notes: transactionNotes,
      attachment_url: data.attachment_url || null,
      attachment_public_id: data.attachment_public_id || null,
      created_by: userId,
      created_at: new Date()
    });

    // ✅ Deduct from wallets
    // IMPORTANT: Secondary Wallet = Cash in Hand + Online Money
    // When deducting from Cash in Hand, we must also deduct from Secondary Wallet
    // DO NOT touch online_balance (Online Money)
    const walletUpdates = {
      total_club_expenses: (parseFloat(session.total_club_expenses) || 0) + amount,
      total_expenses: (parseFloat(session.total_expenses) || 0) + amount
    };

    if (fromCashInHand > 0) {
      // Deduct from Cash in Hand (part of Secondary Wallet)
      walletUpdates.cash_balance = cashInHand - fromCashInHand;
      // Also deduct from Secondary Wallet (since Cash in Hand is part of it)
      // Secondary Wallet = Cash in Hand + Online Money, so we deduct only the Cash in Hand portion
      walletUpdates.secondary_wallet = parseFloat(session.secondary_wallet || 0) - fromCashInHand;
      // ✅ DO NOT touch online_balance - Online Money remains unchanged
    }
    if (fromPrimary > 0) {
      walletUpdates.primary_wallet = primaryAvailable - fromPrimary;
    }

    await db.update('tbl_daily_sessions', walletUpdates, 'session_id = ?', [session.session_id]);

    // Update salary advance tracking if applicable
    if (data.expense_category === 'salary_advance') {
      await db.update('tbl_daily_sessions', {
        total_salary_advances: (parseFloat(session.total_salary_advances) || 0) + amount
      }, 'session_id = ?', [session.session_id]);
    }

    return {
      expense_id: result.insert_id,
      expense_category: data.expense_category,
      amount: amount,
      paid_from: paidFromWallet,
      message: `Recorded club expense of ₹${amount} (${this.getCategoryLabel(data.expense_category)})`
    };
  }

  getCategoryLabel(category) {
    const labels = {
      food_delivery: 'Food Delivery',
      salary_advance: 'Salary Advance',
      utilities: 'Utilities',
      supplies: 'Supplies',
      maintenance: 'Maintenance',
      miscellaneous: 'Miscellaneous'
    };
    return labels[category] || category;
  }

  /**
   * Get club expenses for session
   */
  async getClubExpensesForSession(sessionId) {
    const expenses = await db.queryAll(`
      SELECT 
        e.*, 
        s.staff_name, 
        s.staff_code,
        u.username as created_by_name,
        u.full_name as created_by_full_name
      FROM tbl_club_expenses e
      LEFT JOIN tbl_staff s ON e.staff_id = s.staff_id
      LEFT JOIN tbl_users u ON e.created_by = u.user_id
      WHERE e.session_id = ?
      ORDER BY e.created_at DESC
    `, [sessionId]);

    return expenses || [];
  }

  /**
   * Get expense summary for session
   */
  async getExpenseSummary(sessionId) {
    const playerExpenses = await this.getPlayerExpensesForSession(sessionId);
    const clubExpenses = await this.getClubExpensesForSession(sessionId);

    let totalPlayerExpenses = 0;
    let totalClubExpenses = 0;

    playerExpenses.forEach(e => {
      totalPlayerExpenses += parseFloat(e.chip_amount);
    });

    clubExpenses.forEach(e => {
      totalClubExpenses += parseFloat(e.amount);
    });

    // Group club expenses by category
    const byCategory = {};
    clubExpenses.forEach(e => {
      if (!byCategory[e.expense_category]) {
        byCategory[e.expense_category] = 0;
      }
      byCategory[e.expense_category] += parseFloat(e.amount);
    });

    return {
      player_expenses: {
        total: totalPlayerExpenses,
        count: playerExpenses.length,
        items: playerExpenses
      },
      club_expenses: {
        total: totalClubExpenses,
        count: clubExpenses.length,
        by_category: byCategory,
        items: clubExpenses
      },
      grand_total: totalPlayerExpenses + totalClubExpenses
    };
  }

  // Log chip movement
  async logChipMovement(sessionId, data) {
    const chipBreakdown = data.chip_breakdown || {};
    const totalChips = 
      (chipBreakdown.chips_100 || 0) +
      (chipBreakdown.chips_500 || 0) +
      (chipBreakdown.chips_1000 || 0) +
      (chipBreakdown.chips_5000 || 0) +
      (chipBreakdown.chips_10000 || 0);

    await db.insert('tbl_chip_movement_log', {
      session_id: sessionId,
      movement_type: data.movement_type,
      direction: data.direction,
      player_id: data.player_id || null,
      dealer_id: data.dealer_id || null,
      transaction_id: data.transaction_id || null,
      chips_100: chipBreakdown.chips_100 || 0,
      chips_500: chipBreakdown.chips_500 || 0,
      chips_1000: chipBreakdown.chips_1000 || 0,
      chips_5000: chipBreakdown.chips_5000 || 0,
      chips_10000: chipBreakdown.chips_10000 || 0,
      total_chips: totalChips,
      total_value: data.total_value || 0,
      notes: data.notes || null,
      created_by: data.created_by
    });
  }
}

module.exports = new ExpenseService();
