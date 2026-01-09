// modules/dealer/services/dealer.service.js
// Dealer Management & Tips Service

const db = require('../../../config/database');
const cashierService = require('../../cashier/services/cashier.service');

class DealerService {
  // Generate unique dealer code (DL00001, DL00002, etc.)
  async generateDealerCode() {
    const lastDealer = await db.query(
      'SELECT dealer_code FROM tbl_dealers ORDER BY dealer_id DESC LIMIT 1'
    );

    if (!lastDealer || !lastDealer.dealer_code) {
      return 'DL00001';
    }

    const lastNumber = parseInt(lastDealer.dealer_code.replace('DL', ''));
    const newNumber = lastNumber + 1;
    return `DL${String(newNumber).padStart(5, '0')}`;
  }

  // Create new dealer
  async createDealer(data, userId) {
    if (!data.dealer_name) {
      throw new Error('Dealer name is required');
    }

    const dealerCode = await this.generateDealerCode();

    const result = await db.insert('tbl_dealers', {
      dealer_code: dealerCode,
      dealer_name: data.dealer_name,
      phone_number: data.phone_number || null,
      email: data.email || null,
      date_of_joining: data.date_of_joining || new Date(),
      base_salary: parseFloat(data.base_salary) || 0,
      notes: data.notes || null,
      created_by: userId
    });

    return {
      dealer_id: result.insert_id,
      dealer_code: dealerCode,
      dealer_name: data.dealer_name
    };
  }

  // Get all dealers
  async getAllDealers(filters = {}) {
    let whereClause = '1=1';
    let params = [];

    if (filters.is_active !== undefined) {
      whereClause += ' AND is_active = ?';
      params.push(filters.is_active);
    }

    const dealers = await db.selectAll(
      'tbl_dealers',
      '*',
      whereClause,
      params,
      'ORDER BY dealer_name ASC'
    );

    return dealers || [];
  }

  // Get dealer by ID
  async getDealer(dealerId) {
    const dealer = await db.select(
      'tbl_dealers',
      '*',
      'dealer_id = ?',
      [dealerId]
    );

    if (!dealer) {
      throw new Error('Dealer not found');
    }

    return dealer;
  }

  // Update dealer
  async updateDealer(dealerId, data, userId) {
    const dealer = await this.getDealer(dealerId);

    const updateData = {};
    if (data.dealer_name) updateData.dealer_name = data.dealer_name;
    if (data.phone_number !== undefined) updateData.phone_number = data.phone_number;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.base_salary !== undefined) updateData.base_salary = parseFloat(data.base_salary);
    if (data.notes !== undefined) updateData.notes = data.notes;

    await db.update('tbl_dealers', updateData, 'dealer_id = ?', [dealerId]);

    return { ...dealer, ...updateData };
  }

  // Deactivate dealer
  async deactivateDealer(dealerId) {
    await db.update('tbl_dealers', { is_active: 0 }, 'dealer_id = ?', [dealerId]);
    return { message: 'Dealer deactivated successfully' };
  }

  // Activate dealer
  async activateDealer(dealerId) {
    await db.update('tbl_dealers', { is_active: 1 }, 'dealer_id = ?', [dealerId]);
    return { message: 'Dealer activated successfully' };
  }

  // ==========================================
  // DEALER TIPS MANAGEMENT
  // ==========================================

  /**
   * Record Dealer Tip
   * - Dealer receives chips as tips from players
   * - Chips are returned to cashier (full value)
   * - 50% of chip value is paid to dealer in cash
   */
/**
 * Record Dealer Tip
 * - Dealer receives chips as tips from players
 * - Chips are returned to cashier (full value)
 * - 50% of chip value is paid to dealer in cash
 * - ✅ Uses secondary wallet first, then primary if needed
 */
async recordDealerTip(data, userId) {
  const session = await cashierService.getTodaySession();
  if (!session) {
    throw new Error('No active session found');
  }

  const dealer = await this.getDealer(data.dealer_id);
  const chipBreakdown = data.chip_breakdown || {};

  // Calculate chip values
  const chips100Value = (chipBreakdown.chips_100 || 0) * 100;
  const chips500Value = (chipBreakdown.chips_500 || 0) * 500;
  const chips5000Value = (chipBreakdown.chips_5000 || 0) * 5000;
  const chips10000Value = (chipBreakdown.chips_10000 || 0) * 10000;
  
  const totalChipValue = chips100Value + chips500Value + chips5000Value + chips10000Value;
  
  if (totalChipValue <= 0) {
    throw new Error('Please specify chips for dealer tip');
  }

  // Calculate cash payout (default 50% or custom percentage)
  const cashPercentage = (data.cash_percentage || 50) / 100;
  const cashToDealer = totalChipValue * cashPercentage;

  // ✅ IMPORTANT: Dealer tips are paid from Cash in Hand (NOT Online Money) + Primary Wallet
  // Step 1: Check Cash in Hand (cash_balance) first
  // Step 2: If insufficient, use Primary Wallet (Float)
  // NEVER use Online Money (online_balance)
  const cashInHand = parseFloat(session.cash_balance || 0); // Only cash buy-ins
  const primaryAvailable = parseFloat(session.primary_wallet || 0); // Float
  const totalAvailable = cashInHand + primaryAvailable;

  if (cashToDealer > totalAvailable) {
    throw new Error(`Insufficient cash. Need ₹${cashToDealer}, Available: ₹${totalAvailable} (Cash in Hand: ₹${cashInHand}, Primary Wallet: ₹${primaryAvailable}). Online Money cannot be used for dealer tips.`);
  }

  // ✅ Payment split - use Cash in Hand first, then Primary Wallet for remaining
  const paidFromCashInHand = Math.min(cashToDealer, cashInHand);
  const paidFromPrimary = cashToDealer - paidFromCashInHand;
  const paidFromWallet = paidFromCashInHand > 0 && paidFromPrimary > 0 ? 'both' : 
                         paidFromCashInHand > 0 ? 'secondary' : 'primary';

  // Create tip record
  const result = await db.insert('tbl_dealer_tips', {
    session_id: session.session_id,
    dealer_id: data.dealer_id,
    chip_amount: totalChipValue,
    chips_100: chipBreakdown.chips_100 || 0,
    chips_500: chipBreakdown.chips_500 || 0,
    chips_5000: chipBreakdown.chips_5000 || 0,
    chips_10000: chipBreakdown.chips_10000 || 0,
    chips_returned_value: totalChipValue,
    cash_paid_to_dealer: cashToDealer,
    cash_percentage: data.cash_percentage || 50,
    paid_from_wallet: paidFromWallet,
    primary_amount: paidFromPrimary,
    secondary_amount: paidFromCashInHand,
    notes: data.notes || null,
    recorded_by: userId
  });

  // ✅ Chips INCREASE in cashier inventory (dealer returns chips)
  await cashierService.updateChipInventory(
    session.session_id,
    chipBreakdown,
    false // receiving chips back
  );

  // ✅ Deduct cash from appropriate wallet(s)
  // IMPORTANT: Secondary Wallet = Cash in Hand + Online Money
  // When deducting from Cash in Hand, we must also deduct from Secondary Wallet
  // DO NOT touch online_balance (Online Money)
  const walletUpdates = {
    total_dealer_tips: (parseFloat(session.total_dealer_tips) || 0) + totalChipValue,
    total_dealer_cash_paid: (parseFloat(session.total_dealer_cash_paid) || 0) + cashToDealer
  };

  if (paidFromCashInHand > 0) {
    // Deduct from Cash in Hand (part of Secondary Wallet)
    walletUpdates.cash_balance = cashInHand - paidFromCashInHand;
    // Also deduct from Secondary Wallet (since Cash in Hand is part of it)
    // Secondary Wallet = Cash in Hand + Online Money, so we deduct only the Cash in Hand portion
    walletUpdates.secondary_wallet = parseFloat(session.secondary_wallet || 0) - paidFromCashInHand;
    // ✅ DO NOT touch online_balance - Online Money remains unchanged
  }
  if (paidFromPrimary > 0) {
    walletUpdates.primary_wallet = primaryAvailable - paidFromPrimary;
  }

  await db.update('tbl_daily_sessions', walletUpdates, 'session_id = ?', [session.session_id]);

  // ✅ Create transaction record for dashboard tracking
  await db.insert('tbl_transactions', {
    session_id: session.session_id,
    transaction_type: 'expense',
    activity_type: 'dealer_tip',
    activity_id: result.insert_id,
    player_id: null,
    player_name: dealer.dealer_name,
    amount: cashToDealer,
    chips_amount: totalChipValue,
    chips_100: chipBreakdown.chips_100 || 0,
    chips_500: chipBreakdown.chips_500 || 0,
    chips_5000: chipBreakdown.chips_5000 || 0,
    chips_10000: chipBreakdown.chips_10000 || 0,
    wallet_used: paidFromWallet === 'both' ? 'split' : paidFromWallet,
    primary_amount: paidFromPrimary,
    secondary_amount: paidFromCashInHand,
    notes: data.notes || `Dealer tip - ${dealer.dealer_name} (${data.cash_percentage || 50}% of ₹${totalChipValue})`,
    created_by: userId
  });

  // Update dealer stats
  await db.query(
    'UPDATE tbl_dealers SET total_tips_received = total_tips_received + ?, total_cash_paid = total_cash_paid + ? WHERE dealer_id = ?',
    [totalChipValue, cashToDealer, data.dealer_id]
  );

  // Build payment message
  let paymentMsg = '';
  if (paidFromWallet === 'both') {
    paymentMsg = `₹${paidFromCashInHand} from cash in hand + ₹${paidFromPrimary} from primary`;
  } else if (paidFromWallet === 'secondary') {
    paymentMsg = `₹${cashToDealer} from cash in hand`;
  } else {
    paymentMsg = `₹${cashToDealer} from primary wallet`;
  }

  return {
    tip_id: result.insert_id,
    dealer_id: data.dealer_id,
    dealer_name: dealer.dealer_name,
    chip_amount: totalChipValue,
    chips_returned: totalChipValue,
    cash_paid: cashToDealer,
    paid_from: paidFromWallet,
    primary_deducted: paidFromPrimary,
    secondary_deducted: paidFromCashInHand,
    message: `✅ Dealer tip recorded. ₹${totalChipValue} chips returned. ${paymentMsg} paid to ${dealer.dealer_name}.`
  };
}


  // Get dealer tips for session
  async getDealerTipsForSession(sessionId) {
    const tips = await db.queryAll(`
      SELECT 
        t.*, 
        d.dealer_name, 
        d.dealer_code,
        u.username as created_by_name,
        u.full_name as created_by_full_name
      FROM tbl_dealer_tips t
      JOIN tbl_dealers d ON t.dealer_id = d.dealer_id
      LEFT JOIN tbl_users u ON t.created_by = u.user_id
      WHERE t.session_id = ?
      ORDER BY t.created_at DESC
    `, [sessionId]);

    return tips || [];
  }

  // Get dealer tips summary
  async getDealerTipsSummary(dealerId, startDate = null, endDate = null) {
    let whereClause = 'dealer_id = ?';
    let params = [dealerId];

    if (startDate) {
      whereClause += ' AND DATE(created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND DATE(created_at) <= ?';
      params.push(endDate);
    }

    const tips = await db.selectAll(
      'tbl_dealer_tips',
      '*',
      whereClause,
      params,
      'ORDER BY created_at DESC'
    );

    let totalChips = 0;
    let totalCashPaid = 0;
    
    (tips || []).forEach(tip => {
      totalChips += parseFloat(tip.chip_amount);
      totalCashPaid += parseFloat(tip.cash_paid_to_dealer);
    });

    return {
      tips: tips || [],
      total_chip_tips: totalChips,
      total_cash_paid: totalCashPaid,
      tip_count: tips?.length || 0
    };
  }

  // Log chip movement
  async logChipMovement(sessionId, data) {
    const chipBreakdown = data.chip_breakdown || {};
    const totalChips = 
      (chipBreakdown.chips_100 || 0) +
      (chipBreakdown.chips_500 || 0) +
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
      chips_5000: chipBreakdown.chips_5000 || 0,
      chips_10000: chipBreakdown.chips_10000 || 0,
      total_chips: totalChips,
      total_value: data.total_value || 0,
      notes: data.notes || null,
      created_by: data.created_by
    });
  }
}

module.exports = new DealerService();
