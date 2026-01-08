// modules/transaction/services/transaction.service.js

const db = require("../../../config/database");
const cashierService = require("../../cashier/services/cashier.service");
const playerService = require("../../player/services/player.service");
const cloudinaryService = require("../../../utils/cloudinary.util");

class TransactionService {
  async getPlayerId(playerData) {
    if (playerData.player_id) {
      return playerData.player_id;
    }

    if (playerData.player_code) {
      const player = await playerService.getPlayer(playerData.player_code);
      return player.player_id;
    }

    if (playerData.phone_number) {
      try {
        const player = await playerService.getPlayerByPhone(
          playerData.phone_number
        );
        return player.player_id;
      } catch (error) {
        if (playerData.player_name) {
          const result = await playerService.createPlayer({
            player_name: playerData.player_name,
            phone_number: playerData.phone_number,
            player_type: "occasional",
          });
          return result.player_id;
        }
      }
    }

    if (playerData.player_name) {
      const result = await playerService.createPlayer({
        player_name: playerData.player_name,
        phone_number: playerData.phone_number || null,
        player_type: "occasional",
      });
      return result.player_id;
    }

    throw new Error("Insufficient player information provided");
  }

  async validateSession() {
    const session = await cashierService.getTodaySession();
    if (!session) {
      throw new Error('No active session found. Please start a session first.');
    }
    return session;
  }

  async getPlayerChipBalance(playerId, sessionId) {
    let balance = await db.select(
      "tbl_player_chip_balances",
      "*",
      "session_id = ? AND player_id = ?",
      [sessionId, playerId]
    );

    if (!balance) {
      await db.insert("tbl_player_chip_balances", {
        session_id: sessionId,
        player_id: playerId,
        total_chips_received: 0,
        total_chips_returned: 0,
        current_chip_balance: 0,
        stored_chips: 0,
        total_bought_in: 0,
        total_cashed_out: 0,
        total_credit_taken: 0,
        total_credit_settled: 0,
        outstanding_credit: 0,
      });

      balance = await db.select(
        "tbl_player_chip_balances",
        "*",
        "session_id = ? AND player_id = ?",
        [sessionId, playerId]
      );
    }

    // ✅ FETCH REAL outstanding credit from tbl_credits (more reliable)
    // This gets the actual credit_outstanding from credit records that are not fully settled
    const outstandingCreditsRecords = await db.selectAll(
      "tbl_credits",
      "*",
      "session_id = ? AND player_id = ? AND is_fully_settled = 0",
      [sessionId, playerId]
    );

    let realOutstandingCredit = 0;
    if (outstandingCreditsRecords && outstandingCreditsRecords.length > 0) {
      outstandingCreditsRecords.forEach((credit) => {
        realOutstandingCredit += parseFloat(credit.credit_outstanding || 0);
      });
    }

    // ✅ Recalculate current_chip_balance to ensure it's accurate
    // Balance = total_chips_received - total_chips_returned (never negative)
    const calculatedBalance = Math.max(
      0,
      parseFloat(balance.total_chips_received || 0) - parseFloat(balance.total_chips_returned || 0)
    );
    
    // ✅ Return balance with REAL outstanding credit from tbl_credits and recalculated balance
    return {
      ...balance,
      current_chip_balance: calculatedBalance, // Use recalculated value
      outstanding_credit: realOutstandingCredit, // Override with real value from tbl_credits
      chips_out: realOutstandingCredit, // For compatibility - some endpoints use chips_out for credit
    };
  }

  async updatePlayerChipBalance(playerId, sessionId, updates) {
    const balance = await this.getPlayerChipBalance(playerId, sessionId);

    const newBalance = {
      total_chips_received:
        parseFloat(balance.total_chips_received) +
        (parseFloat(updates.chips_received) || 0),
      total_chips_returned:
        parseFloat(balance.total_chips_returned) +
        (parseFloat(updates.chips_returned) || 0),
      total_bought_in:
        parseFloat(balance.total_bought_in) +
        (parseFloat(updates.bought_in) || 0),
      total_cashed_out:
        parseFloat(balance.total_cashed_out) +
        (parseFloat(updates.cashed_out) || 0),
      total_credit_taken:
        parseFloat(balance.total_credit_taken) +
        (parseFloat(updates.credit_taken) || 0),
      total_credit_settled:
        parseFloat(balance.total_credit_settled) +
        (parseFloat(updates.credit_settled) || 0),
      // ✅ outstanding_credit should be recalculated from tbl_credits, not updated incrementally
      // Only update if credit_change is explicitly provided (for backward compatibility)
      outstanding_credit: updates.credit_change !== undefined
        ? parseFloat(balance.outstanding_credit) + (parseFloat(updates.credit_change) || 0)
        : parseFloat(balance.outstanding_credit), // Keep existing value if not provided
      stored_chips: parseFloat(
        updates.stored_chips !== undefined
          ? updates.stored_chips
          : balance.stored_chips
      ),
    };

    // Calculate current_chip_balance, ensuring it never goes negative
    // Balance should always be >= 0 (can't have negative chips)
    newBalance.current_chip_balance = Math.max(
      0,
      newBalance.total_chips_received - newBalance.total_chips_returned
    );

    await db.update(
      "tbl_player_chip_balances",
      newBalance,
      "session_id = ? AND player_id = ?",
      [sessionId, playerId]
    );

    return newBalance;
  }

  async adjustPlayerBalance(data, userId) {
    const session = await this.validateSession();
    const playerId = await this.getPlayerId(data);
    const player = await playerService.getPlayer(playerId);

    const adjustmentAmount = parseFloat(data.adjustment_amount);
    const adjustmentType = data.adjustment_type; // 'winning' or 'loss'
    const reason = data.reason || "Gameplay adjustment";

    if (!adjustmentAmount || adjustmentAmount === 0) {
      throw new Error("Adjustment amount must be greater than 0");
    }

    if (!["winning", "loss"].includes(adjustmentType)) {
      throw new Error('Adjustment type must be "winning" or "loss"');
    }

    const balance = await this.getPlayerChipBalance(
      playerId,
      session.session_id
    );

    // Calculate new balance
    let newBalance;
    if (adjustmentType === "winning") {
      // Player WON at table - REPLACE balance with winnings (not add)
      // The winning amount becomes the new balance
      newBalance = adjustmentAmount;
    } else {
      // Player LOST at table - deduct chips from their balance
      if (adjustmentAmount > parseFloat(balance.current_chip_balance)) {
        throw new Error(
          `Player cannot lose ₹${adjustmentAmount}. Only has ₹${balance.current_chip_balance}`
        );
      }
      newBalance = parseFloat(balance.current_chip_balance) - adjustmentAmount;
    }

    // Create transaction record
    const result = await db.insert("tbl_transactions", {
      session_id: session.session_id,
      transaction_type: "balance_adjustment",
      player_id: playerId,
      player_name: player.player_name,
      amount: adjustmentAmount,
      chips_amount: adjustmentAmount,
      payment_mode: null,
      wallet_used: null,
      primary_amount: 0,
      secondary_amount: 0,
      notes: `${
        adjustmentType === "winning" 
          ? `Winning: ₹${adjustmentAmount} (Balance set to ₹${adjustmentAmount})` 
          : `Loss: ₹${adjustmentAmount}`
      } (${reason})`,
      created_by: userId,
      created_at: new Date(),
    });

    // Update player chip balance
    if (adjustmentType === "winning") {
      // For winnings, we need to SET the balance to the winning amount (REPLACE, not add)
      // When a player wins, their balance should be exactly the winning amount
      // We need to ensure: current_chip_balance = total_chips_received - total_chips_returned = adjustmentAmount
      
      // Strategy: Adjust total_chips_received so that balance = winning amount
      // We preserve total_chips_returned (deposits, cashouts) to maintain history
      // Formula: total_chips_received = adjustmentAmount + total_chips_returned
      const balanceRecord = await this.getPlayerChipBalance(playerId, session.session_id);
      const currentReturned = parseFloat(balanceRecord.total_chips_returned || 0);
      const requiredReceived = adjustmentAmount + currentReturned;
      
      const updatedBalance = {
        total_chips_received: requiredReceived, // Set so that balance = winning amount
        total_chips_returned: currentReturned, // Preserve history (deposits, cashouts)
        total_bought_in: parseFloat(balanceRecord.total_bought_in || 0), // Keep historical data
        total_cashed_out: parseFloat(balanceRecord.total_cashed_out || 0), // Keep historical data
        total_credit_taken: parseFloat(balanceRecord.total_credit_taken || 0), // Keep historical data
        total_credit_settled: parseFloat(balanceRecord.total_credit_settled || 0), // Keep historical data
        outstanding_credit: parseFloat(balanceRecord.outstanding_credit || 0), // Keep credit separate
        stored_chips: parseFloat(balanceRecord.stored_chips || 0) // Keep stored chips separate
      };
      
      // current_chip_balance will be calculated as: total_chips_received - total_chips_returned = requiredReceived - currentReturned = adjustmentAmount
      
      await db.update(
        "tbl_player_chip_balances",
        updatedBalance,
        "session_id = ? AND player_id = ?",
        [session.session_id, playerId]
      );
    } else {
      await this.updatePlayerChipBalance(playerId, session.session_id, {
        chips_returned: adjustmentAmount,
      });
    }

    return {
      transaction_id: result.insert_id,
      adjustment_type: adjustmentType,
      adjustment_amount: adjustmentAmount,
      previous_balance: parseFloat(balance.current_chip_balance),
      new_balance: newBalance,
      message: adjustmentType === "winning"
        ? `Player won ₹${adjustmentAmount}. Balance set to ₹${newBalance} (replaced, not added).`
        : `Player lost ₹${adjustmentAmount}. New balance: ₹${newBalance}`,
    };
  }

  /**
   * ✅ Get adjustment history for player today
   */
  async getPlayerAdjustmentHistory(playerId) {
    const session = await this.validateSession();

    const adjustments = await db.selectAll(
      "tbl_transactions",
      "*",
      "session_id = ? AND player_id = ? AND transaction_type = ?",
      [session.session_id, playerId, "balance_adjustment"],
      "ORDER BY created_at DESC"
    );

    return adjustments || [];
  }

  /**
   * ✅ BUY-IN with CHIP BREAKDOWN
   * Cashier decides which chips to give
   * Money goes to SECONDARY wallet
   */
  async createBuyIn(data, userId) {
    const session = await this.validateSession();
    const playerId = await this.getPlayerId(data);
    const player = await playerService.getPlayer(playerId);

    const validPaymentModes = [
      "cash",
      "online_sbi",
      "online_hdfc",
      "online_icici",
      "online_other",
    ];
    if (!validPaymentModes.includes(data.payment_mode)) {
      throw new Error("Invalid payment mode");
    }

    const amount = parseFloat(data.amount);
    const chips = parseFloat(data.chips_amount || amount);

    // ✅ CHIP BREAKDOWN IS MANDATORY
    if (!data.chip_breakdown) {
      throw new Error(
        "Chip breakdown is required. Please specify which chips are being given to the player."
      );
    }

    // ✅ VALIDATE CHIP BREAKDOWN matches amount
    cashierService.validateChipBreakdown(data.chip_breakdown, chips);

    // ✅ CHECK CHIP INVENTORY AVAILABILITY - Prevent negative balances
    const inventoryCheck = await this.validateChipInventoryAvailable(
      session.session_id,
      data.chip_breakdown
    );
    
    if (!inventoryCheck.available) {
      throw new Error(`Insufficient chips: ${inventoryCheck.message}. Please add chips using Top Up Float.`);
    }

    // Create transaction with chip breakdown
    const result = await db.insert("tbl_transactions", {
      session_id: session.session_id,
      transaction_type: "buy_in",
      player_id: playerId,
      player_name: player.player_name,
      amount: amount,
      chips_amount: chips,
      payment_mode: data.payment_mode,
      wallet_used: "secondary",
      primary_amount: 0,
      secondary_amount: amount,

      // ✅ CHIP BREAKDOWN
      chips_100: data.chip_breakdown.chips_100 || 0,
      chips_500: data.chip_breakdown.chips_500 || 0,
      chips_1000: data.chip_breakdown.chips_1000 || 0,
      chips_5000: data.chip_breakdown.chips_5000 || 0,
      chips_10000: data.chip_breakdown.chips_10000 || 0,

      // ✅ SCREENSHOT (for online payments)
      screenshot_url: data.screenshot_url || null,
      screenshot_public_id: data.screenshot_public_id || null,

      notes:
        data.notes ||
        this.generateChipBreakdownNote(data.chip_breakdown, "given"),
      created_by: userId,
      created_at: new Date(),
    });

    // ✅ AUTO-CLAIM PROMOTION BONUS if promotion_id is provided
    let promotionClaimed = false;
    if (data.promotion_id) {
      try {
        const promotionService = require("../../promotion/services/promotion.service");
        await promotionService.claimPromotionBonus(
          data.promotion_id,
          playerId,
          amount,
          result.insert_id,
          userId
        );
        promotionClaimed = true;
        console.log(`✅ Promotion bonus claimed for transaction ${result.insert_id}`);
      } catch (promoError) {
        console.error("❌ Error claiming promotion bonus:", promoError.message);
        // Don't fail the transaction if promotion claim fails
        // The bonus chips are already included in chips_amount
      }
    }

    // Update player chip balance
    await this.updatePlayerChipBalance(playerId, session.session_id, {
      chips_received: chips,
      bought_in: amount,
    });

    // ✅ CRITICAL FIX: UPDATE CHIP INVENTORY (chips given to player)
    // This now DEDUCTS chips from cashier's current inventory
    // AND increases chips_out (tracking what's with players)
    await cashierService.updateChipInventory(
      session.session_id,
      data.chip_breakdown,
      true // true = giving out chips (reduces current, increases out)
    );

    // ✅ STRICT BALANCE SEPARATION: Update session balances based on payment mode
    const isCashBuyIn = data.payment_mode === "cash";
    const isOnlineBuyIn = data.payment_mode.startsWith("online_");
    
    const updates = {
      total_deposits: parseFloat(session.total_deposits || 0) + amount,
      total_cash_deposits:
        isCashBuyIn
          ? parseFloat(session.total_cash_deposits || 0) + amount
          : parseFloat(session.total_cash_deposits || 0),
      total_online_deposits: isOnlineBuyIn
        ? parseFloat(session.total_online_deposits || 0) + amount
        : parseFloat(session.total_online_deposits || 0),
      total_chips_out: parseFloat(session.total_chips_out || 0) + chips,
    };

    // ✅ CRITICAL: STRICT SEPARATION - Cash and Online are COMPLETELY separate
    // - Cash buy-ins → ONLY update cash_balance (Cash in Hand)
    // - Online buy-ins → ONLY update online_balance (Online Money)
    // - secondary_wallet is updated for backward compatibility only
    // - Cash Payout: Only uses cash_balance, NEVER touches online_balance
    if (isCashBuyIn) {
      // ✅ Cash buy-in → ONLY update cash_balance (NOT online_balance)
      updates.cash_balance = parseFloat(session.cash_balance || 0) + amount;
      updates.secondary_wallet = parseFloat(session.secondary_wallet || 0) + amount; // For backward compatibility
      updates.secondary_wallet_deposits = parseFloat(session.secondary_wallet_deposits || 0) + amount;
      // ✅ DO NOT update online_balance for cash buy-ins
    } else if (isOnlineBuyIn) {
      // ✅ Online buy-in → ONLY update online_balance (NOT cash_balance)
      updates.online_balance = parseFloat(session.online_balance || 0) + amount;
      updates.secondary_wallet = parseFloat(session.secondary_wallet || 0) + amount; // For backward compatibility
      updates.secondary_wallet_deposits = parseFloat(session.secondary_wallet_deposits || 0) + amount;
      // ✅ DO NOT update cash_balance for online buy-ins
    }

    await db.update(
      "tbl_daily_sessions",
      updates,
      "session_id = ?",
      [session.session_id]
    );

    await playerService.updatePlayerTransactionStats(
      playerId,
      "buy_in",
      amount
    );
    await playerService.recordPlayerVisit(playerId, session.session_id);

    return {
      transaction_id: result.insert_id,
      amount: amount,
      chips_given: chips,
      chip_breakdown: data.chip_breakdown,
      message: `Buy-in successful. Player paid ₹${amount} and received ${chips} chips (${this.formatChipBreakdown(
        data.chip_breakdown
      )}). Chips deducted from cashier inventory.`,
    };
  }

  // ✅ ADD THIS HELPER METHOD to transaction.service.js
  async validateChipInventoryAvailable(sessionId, chipBreakdown) {
    const session = await db.select(
      "tbl_daily_sessions",
      "*",
      "session_id = ?",
      [sessionId]
    );

    const needed = {
      chips_100: chipBreakdown.chips_100 || 0,
      chips_500: chipBreakdown.chips_500 || 0,
      chips_1000: chipBreakdown.chips_1000 || 0,
      chips_5000: chipBreakdown.chips_5000 || 0,
      chips_10000: chipBreakdown.chips_10000 || 0,
    };

    const available = {
      chips_100: parseInt(session.chips_100_current || 0),
      chips_500: parseInt(session.chips_500_current || 0),
      chips_1000: parseInt(session.chips_1000_current || 0),
      chips_5000: parseInt(session.chips_5000_current || 0),
      chips_10000: parseInt(session.chips_10000_current || 0),
    };

    const insufficient = [];

    if (needed.chips_100 > available.chips_100) {
      insufficient.push(
        `₹100: need ${needed.chips_100}, have ${available.chips_100}`
      );
    }
    if (needed.chips_500 > available.chips_500) {
      insufficient.push(
        `₹500: need ${needed.chips_500}, have ${available.chips_500}`
      );
    }
    if (needed.chips_5000 > available.chips_5000) {
      insufficient.push(
        `₹5000: need ${needed.chips_5000}, have ${available.chips_5000}`
      );
    }
    if (needed.chips_10000 > available.chips_10000) {
      insufficient.push(
        `₹10000: need ${needed.chips_10000}, have ${available.chips_10000}`
      );
    }

    return {
      available: insufficient.length === 0,
      message:
        insufficient.length > 0
          ? insufficient.join(", ")
          : "All chips available",
    };
  }

  // ✅ ADD THIS HELPER METHOD to transaction.service.js
  async validateChipInventoryAvailable(sessionId, chipBreakdown) {
    const session = await db.select(
      "tbl_daily_sessions",
      "*",
      "session_id = ?",
      [sessionId]
    );

    const needed = {
      chips_100: chipBreakdown.chips_100 || 0,
      chips_500: chipBreakdown.chips_500 || 0,
      chips_1000: chipBreakdown.chips_1000 || 0,
      chips_5000: chipBreakdown.chips_5000 || 0,
      chips_10000: chipBreakdown.chips_10000 || 0,
    };

    const available = {
      chips_100: parseInt(session.chips_100_current || 0),
      chips_500: parseInt(session.chips_500_current || 0),
      chips_1000: parseInt(session.chips_1000_current || 0),
      chips_5000: parseInt(session.chips_5000_current || 0),
      chips_10000: parseInt(session.chips_10000_current || 0),
    };

    const insufficient = [];

    if (needed.chips_100 > available.chips_100) {
      insufficient.push(
        `₹100: need ${needed.chips_100}, have ${available.chips_100}`
      );
    }
    if (needed.chips_500 > available.chips_500) {
      insufficient.push(
        `₹500: need ${needed.chips_500}, have ${available.chips_500}`
      );
    }
    if (needed.chips_5000 > available.chips_5000) {
      insufficient.push(
        `₹5000: need ${needed.chips_5000}, have ${available.chips_5000}`
      );
    }
    if (needed.chips_10000 > available.chips_10000) {
      insufficient.push(
        `₹10000: need ${needed.chips_10000}, have ${available.chips_10000}`
      );
    }

    return {
      available: insufficient.length === 0,
      message:
        insufficient.length > 0
          ? insufficient.join(", ")
          : "All chips available",
    };
  }

  // ✅ UPDATED cashierService.updateChipInventory
  // This is the CORRECT implementation that should be in cashier.service.js
  async updateChipInventory(sessionId, chipBreakdown, isGivingOut = true) {
    const session = await db.select(
      "tbl_daily_sessions",
      "*",
      "session_id = ?",
      [sessionId]
    );

    const chips_100_change = parseInt(chipBreakdown.chips_100) || 0;
    const chips_500_change = parseInt(chipBreakdown.chips_500) || 0;
    const chips_1000_change = parseInt(chipBreakdown.chips_1000) || 0;
    const chips_5000_change = parseInt(chipBreakdown.chips_5000) || 0;
    const chips_10000_change = parseInt(chipBreakdown.chips_10000) || 0;

    const totalValue =
      chips_100_change * 100 +
      chips_1000_change * 1000 +
      chips_500_change * 500 +
      chips_5000_change * 5000 +
      chips_10000_change * 10000;

    let updates = {};

    if (isGivingOut) {
      // ✅ GIVING CHIPS TO PLAYER (Buy-in, Credit, Redeem)
      // - DECREASE chips_current (cashier has fewer chips)
      // - INCREASE chips_out (more chips with players)
      updates = {
        chips_100_current:
          parseInt(session.chips_100_current) - chips_100_change,
        chips_500_current:
          parseInt(session.chips_500_current) - chips_500_change,
        chips_5000_current:
          parseInt(session.chips_5000_current) - chips_5000_change,
        chips_10000_current:
          parseInt(session.chips_10000_current) - chips_10000_change,

        chips_100_out: parseInt(session.chips_100_out) + chips_100_change,
        chips_500_out: parseInt(session.chips_500_out) + chips_500_change,
        chips_5000_out: parseInt(session.chips_5000_out) + chips_5000_change,
        chips_10000_out: parseInt(session.chips_10000_out) + chips_10000_change,
      };

      // ✅ CHECK for insufficient chips
      if (
        updates.chips_100_current < 0 ||
        updates.chips_500_current < 0 ||
        updates.chips_5000_current < 0 ||
        updates.chips_10000_current < 0
      ) {
        const shortages = [];
        if (updates.chips_100_current < 0) {
          shortages.push(
            `₹100: need ${chips_100_change}, have ${session.chips_100_current}`
          );
        }
        if (updates.chips_500_current < 0) {
          shortages.push(
            `₹500: need ${chips_500_change}, have ${session.chips_500_current}`
          );
        }
        if (updates.chips_5000_current < 0) {
          shortages.push(
            `₹5000: need ${chips_5000_change}, have ${session.chips_5000_current}`
          );
        }
        if (updates.chips_10000_current < 0) {
          shortages.push(
            `₹10000: need ${chips_10000_change}, have ${session.chips_10000_current}`
          );
        }

        throw new Error(
          `Insufficient chips in inventory: ${shortages.join(", ")}. ` +
            `Please add float (mali) with chips first.`
        );
      }
    } else {
      // ✅ RECEIVING CHIPS BACK FROM PLAYER (Cash payout, Deposit, Return)
      // - INCREASE chips_current (cashier has more chips)
      // - DECREASE chips_out (fewer chips with players)
      updates = {
        chips_100_current:
          parseInt(session.chips_100_current) + chips_100_change,
        chips_500_current:
          parseInt(session.chips_500_current) + chips_500_change,
        chips_5000_current:
          parseInt(session.chips_5000_current) + chips_5000_change,
        chips_10000_current:
          parseInt(session.chips_10000_current) + chips_10000_change,

        chips_100_out: Math.max(
          0,
          parseInt(session.chips_100_out) - chips_100_change
        ),
        chips_500_out: Math.max(
          0,
          parseInt(session.chips_500_out) - chips_500_change
        ),
        chips_5000_out: Math.max(
          0,
          parseInt(session.chips_5000_out) - chips_5000_change
        ),
        chips_10000_out: Math.max(
          0,
          parseInt(session.chips_10000_out) - chips_10000_change
        ),
      };

      // Note: chips_out can go negative if player returns more than received
      // This indicates house profit from player winnings
    }

    await db.update("tbl_daily_sessions", updates, "session_id = ?", [
      sessionId,
    ]);

    return {
      success: true,
      updates: updates,
    };
  }

  // ✅ ADD THIS HELPER METHOD to transaction.service.js
  async validateChipInventoryAvailable(sessionId, chipBreakdown) {
    const session = await db.select(
      "tbl_daily_sessions",
      "*",
      "session_id = ?",
      [sessionId]
    );

    const needed = {
      chips_100: chipBreakdown.chips_100 || 0,
      chips_500: chipBreakdown.chips_500 || 0,
      chips_1000: chipBreakdown.chips_1000 || 0,
      chips_5000: chipBreakdown.chips_5000 || 0,
      chips_10000: chipBreakdown.chips_10000 || 0,
    };

    const available = {
      chips_100: parseInt(session.chips_100_current || 0),
      chips_500: parseInt(session.chips_500_current || 0),
      chips_1000: parseInt(session.chips_1000_current || 0),
      chips_5000: parseInt(session.chips_5000_current || 0),
      chips_10000: parseInt(session.chips_10000_current || 0),
    };

    const insufficient = [];

    if (needed.chips_100 > available.chips_100) {
      insufficient.push(
        `₹100: need ${needed.chips_100}, have ${available.chips_100}`
      );
    }
    if (needed.chips_500 > available.chips_500) {
      insufficient.push(
        `₹500: need ${needed.chips_500}, have ${available.chips_500}`
      );
    }
    if (needed.chips_1000 > available.chips_1000) {
      insufficient.push(
        `₹1K: need ${needed.chips_1000}, have ${available.chips_1000}`
      );
    }
    if (needed.chips_5000 > available.chips_5000) {
      insufficient.push(
        `₹5K: need ${needed.chips_5000}, have ${available.chips_5000}`
      );
    }
    if (needed.chips_10000 > available.chips_10000) {
      insufficient.push(
        `₹10K: need ${needed.chips_10000}, have ${available.chips_10000}`
      );
    }

    return {
      available: insufficient.length === 0,
      message:
        insufficient.length > 0
          ? insufficient.join(", ")
          : "All chips available",
    };
  }

  /**
   * ✅ GET PLAYER'S STORED CHIPS BALANCE
   * Returns the global stored chips balance from tbl_players
   */
  async getPlayerStoredBalance(playerId) {
    const player = await db.select(
      "tbl_players",
      "player_id, player_name, player_code, stored_chips",
      "player_id = ?",
      [playerId]
    );

    // ✅ Return 0 if player not found instead of throwing error
    if (!player) {
      return {
        player_id: playerId,
        player_name: null,
        player_code: null,
        stored_chips: 0,
      };
    }

    return {
      player_id: player.player_id,
      player_name: player.player_name,
      player_code: player.player_code,
      stored_chips: parseFloat(player.stored_chips || 0),
    };
  }

  /**
   * ✅ REDEEM STORED CHIPS (Use stored balance for buy-in)
   * Player uses their stored chip balance instead of paying cash
   * Chips go OUT from inventory, stored balance decreases
   * Accepts either chip_breakdown OR amount (amount will auto-calculate breakdown)
   */
  async redeemStoredChips(data, userId) {
    const session = await this.validateSession();
    const playerId = await this.getPlayerId(data);
    const player = await playerService.getPlayer(playerId);

    // Get player's stored balance
    const storedBalance = parseFloat(player.stored_chips || 0);

    let redeemAmount = 0;
    let chipBreakdown = data.chip_breakdown;

    // ✅ Accept either chip_breakdown OR amount
    if (data.chip_breakdown) {
      // Calculate redemption amount from chip breakdown
      redeemAmount =
        (parseInt(data.chip_breakdown.chips_100) || 0) * 100 +
        (parseInt(data.chip_breakdown.chips_500) || 0) * 500 +
        (parseInt(data.chip_breakdown.chips_1000) || 0) * 1000 +
        (parseInt(data.chip_breakdown.chips_5000) || 0) * 5000 +
        (parseInt(data.chip_breakdown.chips_10000) || 0) * 10000;
    } else if (data.amount) {
      // Auto-calculate optimal chip breakdown from amount
      redeemAmount = parseFloat(data.amount);
      chipBreakdown = this.calculateOptimalChipBreakdown(redeemAmount);
    } else {
      throw new Error("Either chip_breakdown or amount is required.");
    }

    if (redeemAmount <= 0) {
      throw new Error("Please enter a valid amount.");
    }

    // ✅ VALIDATE: Cannot redeem more than stored balance
    if (redeemAmount > storedBalance) {
      throw new Error(
        `Insufficient stored balance. Player has ₹${storedBalance.toLocaleString(
          "en-IN"
        )} stored but trying to redeem ₹${redeemAmount.toLocaleString(
          "en-IN"
        )}.`
      );
    }

    // Create transaction
    const result = await db.insert("tbl_transactions", {
      session_id: session.session_id,
      transaction_type: "redeem_stored",
      player_id: playerId,
      player_name: player.player_name,
      amount: 0, // No cash involved
      chips_amount: redeemAmount,
      payment_mode: "stored_balance",
      wallet_used: null,
      primary_amount: 0,
      secondary_amount: 0,

      // ✅ CHIP BREAKDOWN
      chips_100: chipBreakdown.chips_100 || 0,
      chips_500: chipBreakdown.chips_500 || 0,
      chips_1000: chipBreakdown.chips_1000 || 0,
      chips_5000: chipBreakdown.chips_5000 || 0,
      chips_10000: chipBreakdown.chips_10000 || 0,

      notes:
        data.notes ||
        `Player redeemed ₹${redeemAmount.toLocaleString(
          "en-IN"
        )} from stored balance (${this.formatChipBreakdown(chipBreakdown)})`,
      created_by: userId,
      created_at: new Date(),
    });

    // ✅ Update player chip balance for this session
    const balance = await this.getPlayerChipBalance(
      playerId,
      session.session_id
    );
    await this.updatePlayerChipBalance(playerId, session.session_id, {
      chips_received: redeemAmount,
    });

    // ✅ UPDATE CHIP INVENTORY - chips go out to player
    await cashierService.updateChipInventory(
      session.session_id,
      chipBreakdown,
      true // giving out chips
    );

    // ✅ Update session chips out
    await db.update(
      "tbl_daily_sessions",
      {
        total_chips_out:
          parseFloat(session.total_chips_out || 0) + redeemAmount,
      },
      "session_id = ?",
      [session.session_id]
    );

    // ✅ Decrease player's global stored chips
    const newStoredBalance = storedBalance - redeemAmount;
    await db.query(
      `UPDATE tbl_players SET stored_chips = ? WHERE player_id = ?`,
      [newStoredBalance, playerId]
    );

    // Also update session-level stored chips tracking
    await this.updatePlayerChipBalance(playerId, session.session_id, {
      stored_chips: Math.max(
        0,
        parseFloat(balance.stored_chips || 0) - redeemAmount
      ),
    });

    await playerService.recordPlayerVisit(playerId, session.session_id);

    return {
      transaction_id: result.insert_id,
      chips_given: redeemAmount,
      chip_breakdown: chipBreakdown,
      previous_stored_balance: storedBalance,
      new_stored_balance: newStoredBalance,
      message: `₹${redeemAmount.toLocaleString(
        "en-IN"
      )} chips given from stored balance. Remaining stored: ₹${newStoredBalance.toLocaleString(
        "en-IN"
      )}`,
    };
  }

 // Add this to transaction.service.js - UPDATED createCashPayout method

async createCashPayout(data, userId) {
    const session = await this.validateSession();
    const playerId = await this.getPlayerId(data);
    const player = await playerService.getPlayer(playerId);
    const balance = await this.getPlayerChipBalance(
      playerId,
      session.session_id
    );

    const chipsToReturn = parseFloat(data.chips_amount); // Physical chips only
    const storedBalanceAmount = parseFloat(data.stored_balance_amount || 0); // From toggle
    const totalCashToPay = parseFloat(data.amount); // Physical + stored balance

    // ✅ GET OUTSTANDING CREDIT FROM tbl_credits
    const outstandingCreditsRecords = await db.selectAll(
      "tbl_credits",
      "*",
      "session_id = ? AND player_id = ? AND is_fully_settled = 0",
      [session.session_id, playerId]
    );

    let outstandingCredit = 0;
    if (outstandingCreditsRecords && outstandingCreditsRecords.length > 0) {
      outstandingCredit = outstandingCreditsRecords.reduce((sum, credit) => {
        return sum + parseFloat(credit.credit_outstanding || 0);
      }, 0);
    }

    // ✅ VALIDATE CHIP BREAKDOWN
    if (!data.chip_breakdown) {
      throw new Error(
        "Chip breakdown is required. Please specify which chips the player is returning."
      );
    }

    // ✅ CALCULATE CREDIT SETTLEMENT (only if adjust_outstanding_credit toggle is ON)
    const adjustOutstandingCredit = data.adjust_outstanding_credit === true || data.adjust_outstanding_credit === 1;
    const manualCreditSettlement = data.manual_credit_settlement ? parseFloat(data.manual_credit_settlement) : null;
    
    let creditSettledFromChips = 0;
    let creditSettledFromPayout = 0; // Credit settled from cash payout (when chips are insufficient)
    let chipBreakdownForCredit = {
      chips_100: 0,
      chips_500: 0,
      chips_1000: 0,
      chips_5000: 0,
      chips_10000: 0,
    };

    // Calculate initial payout amount (before credit adjustment)
    let netCashFromPhysical = chipsToReturn;
    let netCashPayout = chipsToReturn + storedBalanceAmount;
    
    if (adjustOutstandingCredit && outstandingCredit > 0) {
      // ✅ Use manual settlement amount if provided, otherwise auto-calculate
      let totalCreditToSettle = 0;
      if (manualCreditSettlement !== null && manualCreditSettlement > 0) {
        // Validate manual amount doesn't exceed outstanding credit or total payout
        totalCreditToSettle = Math.min(
          manualCreditSettlement,
          outstandingCredit,
          chipsToReturn + storedBalanceAmount
        );
      } else {
        // Auto-calculate: settle up to the payout amount
        totalCreditToSettle = Math.min(outstandingCredit, chipsToReturn + storedBalanceAmount);
      }
      
      // First, settle what we can from chips
      creditSettledFromChips = Math.min(chipsToReturn, totalCreditToSettle);
      netCashFromPhysical = chipsToReturn - creditSettledFromChips;
      
      // ✅ Recalculate netCashPayout after credit settlement from chips
      netCashPayout = netCashFromPhysical + storedBalanceAmount;
      
      // If there's remaining credit to settle after chips, settle from cash payout
      const remainingCreditToSettle = totalCreditToSettle - creditSettledFromChips;
      if (remainingCreditToSettle > 0) {
        // Settle remaining credit from cash payout (net cash after chip settlement + stored balance)
        creditSettledFromPayout = Math.min(netCashPayout, remainingCreditToSettle);
        netCashPayout = netCashPayout - creditSettledFromPayout;
      }
      
      // ✅ REMOVED: The validation that was blocking partial settlement
      // Partial settlement is now allowed - we don't need to settle all credit
      
      // Calculate chip breakdown for credit settlement
      if (creditSettledFromChips > 0) {
        const ratio = creditSettledFromChips / chipsToReturn;
        chipBreakdownForCredit = {
          chips_100: Math.floor((data.chip_breakdown.chips_100 || 0) * ratio),
          chips_500: Math.floor((data.chip_breakdown.chips_500 || 0) * ratio),
          chips_1000: Math.floor((data.chip_breakdown.chips_1000 || 0) * ratio),
          chips_5000: Math.floor((data.chip_breakdown.chips_5000 || 0) * ratio),
          chips_10000: Math.floor((data.chip_breakdown.chips_10000 || 0) * ratio),
        };
      }
    } else if (!adjustOutstandingCredit && outstandingCredit > 0) {
      // Toggle is OFF - no credit settlement, but warn if chips are less than credit
      if (chipsToReturn < outstandingCredit) {
        // This is just a warning, not an error - player can still cash out
        console.warn(
          `Warning: Player has outstanding credit (₹${outstandingCredit}) but toggle is OFF. ` +
          `Full payout will be made without credit adjustment.`
        );
      }
    }

    // ✅ CRITICAL: VALIDATE CASH AVAILABILITY FIRST - BEFORE ANY STATE MUTATIONS
    // This ensures NO balances are changed if payout cannot proceed
    // NO stored balance, chips, credit, or wallet changes happen until validation passes
    if (netCashPayout > 0) {
      const totalCreditSettled = creditSettledFromChips + creditSettledFromPayout;
      
      // ✅ Get available balances (STRICT SEPARATION)
      // Secondary Wallet (Cash in Hand) - Will be increased by credit settlement if credit is adjusted
      let cashBalanceAvailable = parseFloat(session.cash_balance || 0);
      if (adjustOutstandingCredit && totalCreditSettled > 0) {
        // Credit settlement will be added to cash balance first
        cashBalanceAvailable = cashBalanceAvailable + totalCreditSettled;
      }
      
      // Primary Wallet (Float) - Second Priority
      const primaryWalletAvailable = parseFloat(session.primary_wallet || 0);
      
      // Online Balance - NEVER touched (for display only)
      const onlineBalanceAvailable = parseFloat(session.online_balance || 0);

      // ✅ VALIDATE: Check if we have enough cash BEFORE making any changes
      const totalAvailable = cashBalanceAvailable + primaryWalletAvailable;
      if (netCashPayout > totalAvailable) {
        const shortage = netCashPayout - totalAvailable;
        throw new Error(
          `Insufficient cash for payout. ` +
            `Need: ₹${netCashPayout.toLocaleString("en-IN")}, ` +
            `Available: ₹${totalAvailable.toLocaleString("en-IN")} ` +
            `(Secondary Wallet - Cash: ₹${cashBalanceAvailable.toLocaleString(
              "en-IN"
            )}${adjustOutstandingCredit && totalCreditSettled > 0 ? ` (includes ₹${totalCreditSettled.toLocaleString("en-IN")} from credit settlement)` : ''}, Primary Wallet: ₹${primaryWalletAvailable.toLocaleString("en-IN")}). ` +
            `Online Balance (₹${onlineBalanceAvailable.toLocaleString("en-IN")}) cannot be used for cash payout. ` +
            `Please add ₹${shortage.toLocaleString("en-IN")} to Primary Wallet to continue.`
        );
      }
    }

    // ✅ NOW SETTLE CREDIT (if toggle is ON and we calculated settlements)
    // ✅ MOVED HERE: This happens AFTER validation passes - NO state changes before validation
    if (adjustOutstandingCredit && (creditSettledFromChips > 0 || creditSettledFromPayout > 0)) {
      // Settle credit from chips
      if (creditSettledFromChips > 0) {
        // Record credit settlement transaction
        await db.insert("tbl_transactions", {
          session_id: session.session_id,
          transaction_type: "settle_credit",
          player_id: playerId,
          player_name: player.player_name,
          amount: creditSettledFromChips,
          chips_amount: creditSettledFromChips,
          payment_mode: "chips",
          wallet_used: null,
          primary_amount: 0,
          secondary_amount: 0,
          chips_100: chipBreakdownForCredit.chips_100,
          chips_500: chipBreakdownForCredit.chips_500,
          chips_1000: chipBreakdownForCredit.chips_1000,
          chips_5000: chipBreakdownForCredit.chips_5000,
          chips_10000: chipBreakdownForCredit.chips_10000,
          notes: `Settled ₹${creditSettledFromChips} credit using winning chips during cash out`,
          created_by: userId,
          created_at: new Date(),
        });

        // Update credit records - Use raw SQL query to ensure we get all fields correctly
        const credits = await db.queryAll(
          `SELECT 
            credit_id,
            credit_request_id,
            session_id,
            player_id,
            player_name,
            credit_issued,
            credit_settled,
            credit_outstanding,
            chips_100,
            chips_500,
            chips_1000,
            chips_5000,
            chips_10000,
            is_fully_settled,
            created_at,
            issued_at,
            settled_at,
            updated_at
           FROM tbl_credits 
           WHERE session_id = ? AND player_id = ? AND is_fully_settled = 0 
           ORDER BY credit_id ASC`,
          [session.session_id, playerId]
        );

        let remainingToSettle = creditSettledFromChips;

        if (credits && credits.length > 0) {
          console.log(`[CashPayout] Settling credit from chips:`, {
            player_id: playerId,
            settle_amount: creditSettledFromChips,
            credits_found: credits.length,
            credits_detail: credits.map(c => ({
              credit_id: c.credit_id,
              credit_issued: c.credit_issued,
              credit_settled: c.credit_settled,
              credit_outstanding: c.credit_outstanding,
              is_fully_settled: c.is_fully_settled
            }))
          });

          for (const credit of credits) {
            if (remainingToSettle <= 0) break;

            const creditOutstanding = parseFloat(credit.credit_outstanding || 0);
            const settleAmount = Math.min(remainingToSettle, creditOutstanding);

            const newSettled = parseFloat(credit.credit_settled || 0) + settleAmount;
            const newOutstanding = creditOutstanding - settleAmount;
            // ✅ CRITICAL: If outstanding becomes 0 or less, mark as fully settled
            const finalOutstanding = Math.max(0, newOutstanding);
            const isFullySettled = finalOutstanding <= 0.01 ? 1 : 0; // Use 0.01 for floating point precision

            // ✅ Handle credit_id = 0 by using multiple fields to identify the record
            const whereClause = credit.credit_id > 0 
              ? `credit_id = ?` 
              : `session_id = ? AND player_id = ? AND credit_issued = ? AND ABS(credit_settled - ?) < 0.01 AND ABS(credit_outstanding - ?) < 0.01 AND created_at = ?`;
            const whereParams = credit.credit_id > 0
              ? [credit.credit_id]
              : [
                  session.session_id, 
                  playerId, 
                  credit.credit_issued, 
                  credit.credit_settled, 
                  credit.credit_outstanding,
                  credit.created_at
                ];

            console.log(`[CashPayout] Updating credit from chips:`, {
              credit_id: credit.credit_id,
              where_clause: whereClause,
              where_params: whereParams,
              old_outstanding: creditOutstanding,
              old_settled: credit.credit_settled,
              settle_amount: settleAmount,
              new_settled: newSettled,
              new_outstanding: finalOutstanding,
              is_fully_settled: isFullySettled
            });

            // ✅ Use raw SQL for atomic update
            await db.query(
              `UPDATE tbl_credits 
               SET credit_settled = ?, 
                   credit_outstanding = ?, 
                   is_fully_settled = ?,
                   settled_at = ?,
                   updated_at = NOW()
               WHERE ${whereClause}`,
              [
                newSettled,
                finalOutstanding,
                isFullySettled,
                isFullySettled ? new Date() : null,
                ...whereParams
              ]
            );

            // ✅ Verify the update
            const verifyCredit = await db.queryAll(
              `SELECT credit_outstanding, is_fully_settled, credit_settled FROM tbl_credits WHERE ${whereClause}`,
              whereParams
            );
            console.log(`[CashPayout] Verification after update:`, {
              credit_id: credit.credit_id,
              verified_outstanding: verifyCredit?.[0]?.credit_outstanding,
              verified_settled: verifyCredit?.[0]?.credit_settled,
              verified_is_fully_settled: verifyCredit?.[0]?.is_fully_settled
            });

            remainingToSettle -= settleAmount;
          }
        }

        // Update credit_settled in balance table
        await this.updatePlayerChipBalance(playerId, session.session_id, {
          credit_settled: creditSettledFromChips,
          // Don't use credit_change - we'll recalculate outstanding_credit from tbl_credits below
        });
      }
      
      // Settle credit from cash payout (if chips were insufficient)
      if (creditSettledFromPayout > 0) {
        // Record credit settlement from payout transaction
        await db.insert("tbl_transactions", {
          session_id: session.session_id,
          transaction_type: "settle_credit",
          player_id: playerId,
          player_name: player.player_name,
          amount: creditSettledFromPayout,
          chips_amount: 0,
          payment_mode: "cash",
          wallet_used: null,
          primary_amount: 0,
          secondary_amount: 0,
          notes: `Settled ₹${creditSettledFromPayout} credit from cash payout`,
          created_by: userId,
          created_at: new Date(),
        });

        // Update credit records for payout settlement - Use raw SQL query
        const creditsForPayout = await db.queryAll(
          `SELECT 
            credit_id,
            credit_request_id,
            session_id,
            player_id,
            player_name,
            credit_issued,
            credit_settled,
            credit_outstanding,
            chips_100,
            chips_500,
            chips_1000,
            chips_5000,
            chips_10000,
            is_fully_settled,
            created_at,
            issued_at,
            settled_at,
            updated_at
           FROM tbl_credits 
           WHERE session_id = ? AND player_id = ? AND is_fully_settled = 0 
           ORDER BY credit_id ASC`,
          [session.session_id, playerId]
        );

        let remainingToSettleFromPayout = creditSettledFromPayout;

        if (creditsForPayout && creditsForPayout.length > 0) {
          console.log(`[CashPayout] Settling credit from payout:`, {
            player_id: playerId,
            settle_amount: creditSettledFromPayout,
            credits_found: creditsForPayout.length,
            credits_detail: creditsForPayout.map(c => ({
              credit_id: c.credit_id,
              credit_issued: c.credit_issued,
              credit_settled: c.credit_settled,
              credit_outstanding: c.credit_outstanding,
              is_fully_settled: c.is_fully_settled
            }))
          });

          for (const credit of creditsForPayout) {
            if (remainingToSettleFromPayout <= 0) break;

            const creditOutstanding = parseFloat(credit.credit_outstanding || 0);
            const settleAmount = Math.min(remainingToSettleFromPayout, creditOutstanding);

            const newSettled = parseFloat(credit.credit_settled || 0) + settleAmount;
            const newOutstanding = creditOutstanding - settleAmount;
            // ✅ CRITICAL: If outstanding becomes 0 or less, mark as fully settled
            const finalOutstanding = Math.max(0, newOutstanding);
            const isFullySettled = finalOutstanding <= 0.01 ? 1 : 0; // Use 0.01 for floating point precision

            // ✅ Handle credit_id = 0 by using multiple fields to identify the record
            const whereClause = credit.credit_id > 0 
              ? `credit_id = ?` 
              : `session_id = ? AND player_id = ? AND credit_issued = ? AND ABS(credit_settled - ?) < 0.01 AND ABS(credit_outstanding - ?) < 0.01 AND created_at = ?`;
            const whereParams = credit.credit_id > 0
              ? [credit.credit_id]
              : [
                  session.session_id, 
                  playerId, 
                  credit.credit_issued, 
                  credit.credit_settled, 
                  credit.credit_outstanding,
                  credit.created_at
                ];

            console.log(`[CashPayout] Updating credit from payout:`, {
              credit_id: credit.credit_id,
              where_clause: whereClause,
              where_params: whereParams,
              old_outstanding: creditOutstanding,
              old_settled: credit.credit_settled,
              settle_amount: settleAmount,
              new_settled: newSettled,
              new_outstanding: finalOutstanding,
              is_fully_settled: isFullySettled
            });

            // ✅ Use raw SQL for atomic update
            await db.query(
              `UPDATE tbl_credits 
               SET credit_settled = ?, 
                   credit_outstanding = ?, 
                   is_fully_settled = ?,
                   settled_at = ?,
                   updated_at = NOW()
               WHERE ${whereClause}`,
              [
                newSettled,
                finalOutstanding,
                isFullySettled,
                isFullySettled ? new Date() : null,
                ...whereParams
              ]
            );

            // ✅ Verify the update
            const verifyCredit = await db.queryAll(
              `SELECT credit_outstanding, is_fully_settled, credit_settled FROM tbl_credits WHERE ${whereClause}`,
              whereParams
            );
            console.log(`[CashPayout] Verification after update:`, {
              credit_id: credit.credit_id,
              verified_outstanding: verifyCredit?.[0]?.credit_outstanding,
              verified_settled: verifyCredit?.[0]?.credit_settled,
              verified_is_fully_settled: verifyCredit?.[0]?.is_fully_settled
            });

            remainingToSettleFromPayout -= settleAmount;
          }
        }

        // Update credit_settled in balance table
        await this.updatePlayerChipBalance(playerId, session.session_id, {
          credit_settled: creditSettledFromPayout,
          // Don't use credit_change - we'll recalculate outstanding_credit from tbl_credits below
        });
      }
      
      // ✅ Recalculate outstanding credit from tbl_credits (source of truth) after all settlements
      // Calculate for CURRENT SESSION only (for session-level tracking)
      const remainingCreditsAfterSettlement = await db.queryAll(
        `SELECT * FROM tbl_credits 
         WHERE session_id = ? AND player_id = ? AND is_fully_settled = 0`,
        [session.session_id, playerId]
      );
      const playerOutstandingCreditForSession = (remainingCreditsAfterSettlement || []).reduce(
        (sum, credit) => sum + parseFloat(credit.credit_outstanding || 0),
        0
      );

      // ✅ Update player balance table with recalculated outstanding credit (session-level)
      await db.update(
        "tbl_player_chip_balances",
        {
          outstanding_credit: playerOutstandingCreditForSession,
        },
        "session_id = ? AND player_id = ?",
        [session.session_id, playerId]
      );

      // ✅ Recalculate player's LIFETIME outstanding credit from ALL sessions (for tbl_players)
      const allPlayerCredits = await db.queryAll(
        `SELECT * FROM tbl_credits 
         WHERE player_id = ? AND is_fully_settled = 0`,
        [playerId]
      );
      const playerLifetimeOutstandingCredit = (allPlayerCredits || []).reduce(
        (sum, credit) => sum + parseFloat(credit.credit_outstanding || 0),
        0
      );

      // ✅ Update player's lifetime outstanding credit in tbl_players
      await db.update(
        "tbl_players",
        {
          outstanding_credit: Math.max(0, playerLifetimeOutstandingCredit), // Ensure never negative
        },
        "player_id = ?",
        [playerId]
      );

      console.log(`[CashPayout] Updated player outstanding credit:`, {
        player_id: playerId,
        session_outstanding: playerOutstandingCreditForSession,
        lifetime_outstanding: playerLifetimeOutstandingCredit,
        credits_found: allPlayerCredits?.length || 0
      });

      // ✅ Recalculate session-level outstanding credit (sum of all players)
      const allRemainingCredits = await db.queryAll(
        `SELECT * FROM tbl_credits 
         WHERE session_id = ? AND is_fully_settled = 0`,
        [session.session_id]
      );
      const newOutstandingCreditTotal = (allRemainingCredits || []).reduce(
        (sum, credit) => sum + parseFloat(credit.credit_outstanding || 0),
        0
      );

      // Group credits by player for better debugging
      const creditsByPlayer = {};
      (allRemainingCredits || []).forEach(c => {
        if (!creditsByPlayer[c.player_id]) {
          creditsByPlayer[c.player_id] = [];
        }
        creditsByPlayer[c.player_id].push({
          credit_id: c.credit_id,
          credit_outstanding: parseFloat(c.credit_outstanding || 0)
        });
      });

      console.log(`[CashPayout] Recalculating session outstanding credit:`, {
        session_id: session.session_id,
        credits_found: allRemainingCredits?.length || 0,
        credits_by_player: Object.keys(creditsByPlayer).map(playerId => ({
          player_id: playerId,
          credit_count: creditsByPlayer[playerId].length,
          total_outstanding: creditsByPlayer[playerId].reduce((sum, c) => sum + c.credit_outstanding, 0)
        })),
        calculated_total: newOutstandingCreditTotal,
        previous_total: session.outstanding_credit
      });

      await db.update(
        "tbl_daily_sessions",
        {
          outstanding_credit: newOutstandingCreditTotal,
        },
        "session_id = ?",
        [session.session_id]
      );
    }
    
    // ✅ ALWAYS recalculate session-level outstanding credit after payout (even if no credit was settled)
    // This ensures the dashboard shows the correct value
    const finalAllRemainingCredits = await db.queryAll(
      `SELECT * FROM tbl_credits 
       WHERE session_id = ? AND is_fully_settled = 0`,
      [session.session_id]
    );
    const finalOutstandingCreditTotal = (finalAllRemainingCredits || []).reduce(
      (sum, credit) => sum + parseFloat(credit.credit_outstanding || 0),
      0
    );

    // Only update if different to avoid unnecessary DB writes
    if (Math.abs(parseFloat(session.outstanding_credit || 0) - finalOutstandingCreditTotal) > 0.01) {
      console.log(`[CashPayout] Final recalculation - updating session outstanding credit:`, {
        session_id: session.session_id,
        old_value: session.outstanding_credit,
        new_value: finalOutstandingCreditTotal
      });

      await db.update(
        "tbl_daily_sessions",
        {
          outstanding_credit: finalOutstandingCreditTotal,
        },
        "session_id = ?",
        [session.session_id]
      );
    }

    // ✅ RETURN PHYSICAL CHIPS to inventory
    await cashierService.updateChipInventory(
      session.session_id,
      data.chip_breakdown,
      false
    );

    await this.updatePlayerChipBalance(playerId, session.session_id, {
      chips_returned: chipsToReturn,
      cashed_out: netCashPayout,
    });

    // ✅ PAY CASH - STRICT BALANCE SEPARATION
    // Priority: Secondary Wallet (Cash in Hand) → Primary Wallet (Float)
    // ❌ Online Balance NEVER touched
    let transactionId = null;
    if (netCashPayout > 0) {
      const totalCreditSettled = creditSettledFromChips + creditSettledFromPayout;
      
      // ✅ Get available balances (STRICT SEPARATION)
      // Secondary Wallet (Cash in Hand) - Will be increased by credit settlement if credit is adjusted
      let cashBalanceAvailable = parseFloat(session.cash_balance || 0);
      if (adjustOutstandingCredit && totalCreditSettled > 0) {
        // Credit settlement will be added to cash balance first
        cashBalanceAvailable = cashBalanceAvailable + totalCreditSettled;
      }
      
      // Primary Wallet (Float) - Second Priority
      const primaryWalletAvailable = parseFloat(session.primary_wallet || 0);
      
      // Online Balance - NEVER touched (for display only)
      const onlineBalanceAvailable = parseFloat(session.online_balance || 0);

      // ✅ DEDUCTION PRIORITY: Secondary Wallet (Cash) → Primary Wallet (Float)
      // When credit is settled, cash balance is increased first, then payout is deducted
      let cashBalanceUsed = 0;
      let floatUsed = 0;
      
      if (netCashPayout <= cashBalanceAvailable) {
        // All from Secondary Wallet (Cash in Hand, after credit settlement if applicable)
        cashBalanceUsed = netCashPayout;
        floatUsed = 0;
      } else {
        // Use all Secondary Wallet (Cash), then Primary Wallet (Float)
        cashBalanceUsed = cashBalanceAvailable;
        floatUsed = netCashPayout - cashBalanceAvailable;

        // Check if we have enough in Primary Wallet
        const totalAvailable = cashBalanceAvailable + primaryWalletAvailable;
        if (netCashPayout > totalAvailable) {
          const shortage = netCashPayout - totalAvailable;
          throw new Error(
            `Insufficient cash for payout. ` +
              `Need: ₹${netCashPayout.toLocaleString("en-IN")}, ` +
              `Available: ₹${totalAvailable.toLocaleString("en-IN")} ` +
              `(Secondary Wallet - Cash: ₹${cashBalanceAvailable.toLocaleString(
                "en-IN"
              )}${adjustOutstandingCredit && totalCreditSettled > 0 ? ` (includes ₹${totalCreditSettled.toLocaleString("en-IN")} from credit settlement)` : ''}, Primary Wallet: ₹${primaryWalletAvailable.toLocaleString("en-IN")}). ` +
              `Online Balance (₹${onlineBalanceAvailable.toLocaleString("en-IN")}) cannot be used for cash payout. ` +
              `Please add ₹${shortage.toLocaleString("en-IN")} to Primary Wallet to continue.`
          );
        }
      }

      // ✅ VALIDATION: Cash Balance cannot go negative (after credit settlement addition)
      if (cashBalanceUsed > cashBalanceAvailable) {
        throw new Error(`Cash balance cannot go negative. Available: ₹${cashBalanceAvailable.toLocaleString("en-IN")}`);
      }

      // Build comprehensive notes
      let transactionNotes = data.notes || "";
      // totalCreditSettled already declared above
      
      let balanceBreakdown = '';
      if (adjustOutstandingCredit && totalCreditSettled > 0) {
        // Credit settlement: Show credit added to cash, then payout deduction
        if (cashBalanceUsed > 0 && floatUsed > 0) {
          balanceBreakdown = `Credit ₹${totalCreditSettled.toLocaleString("en-IN")} added to Cash → Payout: Cash ₹${cashBalanceUsed.toLocaleString("en-IN")}, Float ₹${floatUsed.toLocaleString("en-IN")}`;
        } else if (cashBalanceUsed > 0) {
          balanceBreakdown = `Credit ₹${totalCreditSettled.toLocaleString("en-IN")} added to Cash → Payout: Cash ₹${cashBalanceUsed.toLocaleString("en-IN")}`;
        } else {
          balanceBreakdown = `Credit ₹${totalCreditSettled.toLocaleString("en-IN")} added to Cash → Payout: Float ₹${floatUsed.toLocaleString("en-IN")}`;
        }
      } else {
        // No credit settlement: Original breakdown
        balanceBreakdown = cashBalanceUsed > 0 && floatUsed > 0
          ? `Secondary Wallet (Cash): ₹${cashBalanceUsed.toLocaleString("en-IN")}, Primary Wallet: ₹${floatUsed.toLocaleString("en-IN")}`
          : cashBalanceUsed > 0
          ? `Secondary Wallet (Cash): ₹${cashBalanceUsed.toLocaleString("en-IN")}`
          : `Primary Wallet: ₹${floatUsed.toLocaleString("en-IN")}`;
      }
      
      if (storedBalanceAmount > 0 && totalCreditSettled > 0) {
        transactionNotes = `CASHOUT: Physical chips ₹${chipsToReturn.toLocaleString("en-IN")} → Credit settled ₹${totalCreditSettled.toLocaleString("en-IN")} → Net from physical ₹${netCashFromPhysical.toLocaleString("en-IN")} + Stored ₹${storedBalanceAmount.toLocaleString("en-IN")} → Total cash ₹${netCashPayout.toLocaleString("en-IN")} (${balanceBreakdown})`;
      } else if (storedBalanceAmount > 0) {
        transactionNotes = `CASHOUT: Physical chips ₹${chipsToReturn.toLocaleString("en-IN")} + Stored balance ₹${storedBalanceAmount.toLocaleString("en-IN")} → Total cash ₹${netCashPayout.toLocaleString("en-IN")} (${balanceBreakdown})`;
      } else if (totalCreditSettled > 0) {
        transactionNotes = `CASHOUT: Chips ₹${chipsToReturn.toLocaleString("en-IN")} → Credit settled ₹${totalCreditSettled.toLocaleString("en-IN")} → Net cash ₹${netCashPayout.toLocaleString("en-IN")} (${balanceBreakdown})`;
      } else {
        transactionNotes = `CASHOUT: Chips ₹${chipsToReturn.toLocaleString("en-IN")} → Cash paid ₹${netCashPayout.toLocaleString("en-IN")} (${balanceBreakdown})`;
      }

      // Record cash payout transaction
      const result = await db.insert("tbl_transactions", {
        session_id: session.session_id,
        transaction_type: "cash_payout",
        player_id: playerId,
        player_name: player.player_name,
        amount: netCashPayout,
        chips_amount: chipsToReturn,
        payment_mode: "cash",
        wallet_used:
          cashBalanceUsed > 0 && floatUsed > 0
            ? "cash_and_float"
            : cashBalanceUsed > 0
            ? "cash_balance"
            : "float",
        primary_amount: floatUsed, // Float used
        secondary_amount: cashBalanceUsed, // Cash Balance used (for backward compatibility)
        chips_100: data.chip_breakdown.chips_100 || 0,
        chips_500: data.chip_breakdown.chips_500 || 0,
        chips_1000: data.chip_breakdown.chips_1000 || 0,
        chips_5000: data.chip_breakdown.chips_5000 || 0,
        chips_10000: data.chip_breakdown.chips_10000 || 0,
        notes: transactionNotes,
        created_by: userId,
        created_at: new Date(),
      });

      transactionId = result.insert_id;

      // ✅ UPDATE BALANCES - STRICT SEPARATION
      // Priority: Secondary Wallet (Cash) → Primary Wallet (Float)
      // ❌ Online Balance NEVER touched
      const updates = {
        total_chips_out:
          parseFloat(session.total_chips_out || 0) - chipsToReturn,
      };

      // ✅ CREDIT SETTLEMENT LOGIC: When credit is settled, add it back to Cash in Hand first
      // totalCreditSettled already declared above (line 1203)
      
      if (adjustOutstandingCredit && totalCreditSettled > 0) {
        // ✅ SIMPLE CREDIT SETTLEMENT WITH CASH PAYOUT FLOW:
        // Example: Player has ₹10,000 outstanding credit, cashes out ₹20,000 chips
        // 1. Credit settled: ₹10,000 (just mark as settled, don't add to cash_balance)
        // 2. Net cash payout: ₹20,000 - ₹10,000 = ₹10,000
        // 3. Payout deduction: ₹10,000 deducted directly from cash_balance (Cash in Hand)
        // Result: Credit settled, ₹10,000 paid from Cash in Hand (secondary wallet)
        
        // ✅ SIMPLE LOGIC: Just deduct net payout from Cash in Hand, don't add credit settlement
        const currentCashBalance = parseFloat(session.cash_balance || 0);
        const currentSecondaryWallet = parseFloat(session.secondary_wallet || 0);
        
        // Deduct payout from Cash in Hand (secondary wallet), then Float
        // Priority: Cash in Hand (secondary) → Primary Wallet (float)
        if (netCashPayout <= currentCashBalance) {
          // All from Cash in Hand
          updates.cash_balance = currentCashBalance - netCashPayout;
          updates.secondary_wallet = currentSecondaryWallet - netCashPayout;
          updates.secondary_wallet_withdrawals =
            parseFloat(session.secondary_wallet_withdrawals || 0) + netCashPayout;
          // No float used
        } else {
          // Use all Cash in Hand, then Float
          const cashToUse = currentCashBalance;
          const floatNeeded = netCashPayout - cashToUse;
          
          updates.cash_balance = 0; // All cash used
          updates.secondary_wallet = Math.max(0, currentSecondaryWallet - cashToUse);
          updates.secondary_wallet_withdrawals =
            parseFloat(session.secondary_wallet_withdrawals || 0) + cashToUse;
          
          // Deduct remaining from Float
          updates.primary_wallet = Math.max(
            0,
            parseFloat(session.primary_wallet || 0) - floatNeeded
          );
          updates.total_withdrawals =
            parseFloat(session.total_withdrawals || 0) + floatNeeded;
        }
      } else {
        // ✅ NO CREDIT SETTLEMENT: Original logic - deduct from Cash, then Float
        // Deduct from Secondary Wallet (Cash in Hand) - First Priority
        if (cashBalanceUsed > 0) {
          updates.cash_balance = Math.max(
            0,
            parseFloat(session.cash_balance || 0) - cashBalanceUsed
          );
          // Keep secondary_wallet for backward compatibility
          updates.secondary_wallet = Math.max(
            0,
            parseFloat(session.secondary_wallet || 0) - cashBalanceUsed
          );
          updates.secondary_wallet_withdrawals =
            parseFloat(session.secondary_wallet_withdrawals || 0) + cashBalanceUsed;
        }

        // ✅ Deduct from Primary Wallet (Float) - Second Priority
        if (floatUsed > 0) {
          updates.primary_wallet = Math.max(
            0,
            parseFloat(session.primary_wallet || 0) - floatUsed
          );
          updates.total_withdrawals =
            parseFloat(session.total_withdrawals || 0) + floatUsed;
        }
      }
      
      // ✅ Online Balance remains UNCHANGED (never touched)

      // ✅ CRITICAL: Online Balance remains UNCHANGED (never touched)
      // online_balance is NOT updated here - it stays as is

      await db.update("tbl_daily_sessions", updates, "session_id = ?", [
        session.session_id,
      ]);
    } else {
      // No cash payout, only chip return
      await db.update(
        "tbl_daily_sessions",
        {
          total_chips_out:
            parseFloat(session.total_chips_out || 0) - chipsToReturn,
        },
        "session_id = ?",
        [session.session_id]
      );
    }

    // ✅ DEDUCT STORED BALANCE if included - MOVED HERE (AFTER VALIDATION AND WALLET UPDATES)
    // This ensures stored balance is only deducted if payout is successful
    if (storedBalanceAmount > 0) {
      await db.query(
        `UPDATE tbl_players SET stored_chips = GREATEST(0, COALESCE(stored_chips, 0) - ?) WHERE player_id = ?`,
        [storedBalanceAmount, playerId]
      );
    }

    await playerService.updatePlayerTransactionStats(
      playerId,
      "cash_payout",
      netCashPayout
    );

    // ✅ Send email to CEO if house player
    if (player.is_house_player === 1 && data.ceo_permission_confirmed) {
      try {
        const emailService = require('../../2fa/services/email.service');
        const dotenvConfig = require('../../../config/dotenvConfig');
        const ceoEmail = dotenvConfig.ceoEmail;
        
        if (ceoEmail) {
          await emailService.sendHousePlayerPayoutEmail(
            ceoEmail,
            {
              player_name: player.player_name,
              player_code: player.player_code,
              phone_number: player.phone_number
            },
            {
              amount: netCashPayout,
              chips_amount: chipsToReturn,
              stored_balance_amount: storedBalanceAmount,
              date: new Date()
            }
          );
        }
      } catch (emailError) {
        console.error('❌ Failed to send email to CEO:', emailError);
      }
    }

    // Calculate total credit settled (from chips + from payout)
    const totalCreditSettled = creditSettledFromChips + creditSettledFromPayout;
    const remainingCredit = Math.max(0, outstandingCredit - totalCreditSettled);
    
    return {
      transaction_id: transactionId,
      chips_returned: chipsToReturn,
      chip_breakdown: data.chip_breakdown,
      credit_auto_settled: totalCreditSettled,
      stored_balance_used: storedBalanceAmount,
      net_cash_payout: netCashPayout,
      remaining_credit: remainingCredit,
      fully_settled: remainingCredit <= 0,
      message:
        storedBalanceAmount > 0 && totalCreditSettled > 0
          ? `✅ Player returned ₹${chipsToReturn.toLocaleString("en-IN")} chips. ₹${totalCreditSettled.toLocaleString("en-IN")} credit settled. ₹${storedBalanceAmount.toLocaleString("en-IN")} from stored. Net cash paid: ₹${netCashPayout.toLocaleString("en-IN")}`
          : storedBalanceAmount > 0
          ? `✅ Cash out: ₹${chipsToReturn.toLocaleString("en-IN")} chips + ₹${storedBalanceAmount.toLocaleString("en-IN")} stored. Net cash paid: ₹${netCashPayout.toLocaleString("en-IN")}`
          : totalCreditSettled > 0
          ? `✅ Player returned ₹${chipsToReturn.toLocaleString("en-IN")} chips. ₹${totalCreditSettled.toLocaleString("en-IN")} credit settled. Net cash paid: ₹${netCashPayout.toLocaleString("en-IN")}`
          : `✅ Cash out completed. ₹${netCashPayout.toLocaleString("en-IN")} paid for ₹${chipsToReturn.toLocaleString("en-IN")} chips returned.`,
    };
  }

  async depositChips(data, userId) {
  const session = await this.validateSession();
  const playerId = await this.getPlayerId(data);
  const player = await playerService.getPlayer(playerId);

  // ✅ CHIP BREAKDOWN IS MANDATORY
  if (!data.chip_breakdown) {
    throw new Error("Chip breakdown is required.");
  }

  const depositAmount =
    (parseInt(data.chip_breakdown.chips_100) || 0) * 100 +
    (parseInt(data.chip_breakdown.chips_500) || 0) * 500 +
    (parseInt(data.chip_breakdown.chips_1000) || 0) * 1000 +
    (parseInt(data.chip_breakdown.chips_5000) || 0) * 5000 +
    (parseInt(data.chip_breakdown.chips_10000) || 0) * 10000;

  if (depositAmount <= 0) {
    throw new Error("Please enter at least one chip to deposit.");
  }

  // Create transaction record
  const result = await db.insert("tbl_transactions", {
    session_id: session.session_id,
    transaction_type: "deposit_chips",
    player_id: playerId,
    player_name: player.player_name,
    amount: 0,
    chips_amount: depositAmount,
    payment_mode: null,
    chips_100: data.chip_breakdown.chips_100 || 0,
    chips_500: data.chip_breakdown.chips_500 || 0,
    chips_1000: data.chip_breakdown.chips_1000 || 0,
    chips_5000: data.chip_breakdown.chips_5000 || 0,
    chips_10000: data.chip_breakdown.chips_10000 || 0,
    notes: data.notes || `Player depositing ₹${depositAmount} chips for storage`,
    created_by: userId,
    created_at: new Date(),
  });

  // ✅ CRITICAL FIX: Only update global stored_chips
  // DO NOT touch session balance (current_chip_balance)
  await db.query(
    `UPDATE tbl_players SET stored_chips = COALESCE(stored_chips, 0) + ? WHERE player_id = ?`,
    [depositAmount, playerId]
  );

  // ✅ Chips return to cashier inventory
  await cashierService.updateChipInventory(
    session.session_id,
    data.chip_breakdown,
    false // receiving chips back
  );

  // ✅ Update session chips out
  await db.update(
    "tbl_daily_sessions",
    {
      total_chips_out: Math.max(
        0,
        parseFloat(session.total_chips_out || 0) - depositAmount
      ),
    },
    "session_id = ?",
    [session.session_id]
  );

  // Get updated balance
  const updatedPlayer = await playerService.getPlayer(playerId);
  const totalStoredChips = parseFloat(updatedPlayer.stored_chips || 0);

  return {
    transaction_id: result.insert_id,
    chips_deposited: depositAmount,
    chip_breakdown: data.chip_breakdown,
    total_stored_chips: totalStoredChips,
    message: `₹${depositAmount.toLocaleString("en-IN")} deposited. Total stored: ₹${totalStoredChips.toLocaleString("en-IN")}`,
  };
}

  /**
   * ✅ DEPOSIT CASH - Player deposits cash which goes to Secondary Wallet
   * Cash → Secondary Wallet → Cash in Hand (cash_balance)
   * Online → Secondary Wallet → Online Money (online_balance)
   * Both also increase Store Balance (stored_chips)
   */
  async depositCash(data, userId) {
    const session = await this.validateSession();
    const playerId = await this.getPlayerId(data);
    const player = await playerService.getPlayer(playerId);

    const depositAmount = parseFloat(data.amount);
    if (!depositAmount || depositAmount <= 0) {
      throw new Error("Please enter a valid cash amount to deposit");
    }

    const paymentType = data.payment_type || 'cash'; // 'cash' or 'online'
    const paymentMode = data.payment_mode || (paymentType === 'cash' ? 'cash' : null);
    
    // Validate payment mode
    if (!paymentMode) {
      throw new Error("Payment mode is required");
    }

    // Validate online deposits
    if (paymentType === 'online') {
      if (!paymentMode.startsWith('online_')) {
        throw new Error("Invalid payment mode for online deposit");
      }
      if (!data.screenshot) {
        throw new Error("Screenshot is required for online deposits");
      }
    }

    // Handle screenshot upload to Cloudinary if provided
    let screenshotUrl = null;
    let screenshotPublicId = null;
    if (data.screenshot && data.screenshot.path) {
      try {
        // Upload screenshot to Cloudinary
        const uploadResult = await cloudinaryService.uploadTransactionScreenshot(
          data.screenshot.path,
          playerId,
          'deposit_cash'
        );
        if (uploadResult.success) {
          screenshotUrl = uploadResult.url;
          screenshotPublicId = uploadResult.public_id;
        }
      } catch (uploadError) {
        console.error('Error uploading screenshot to Cloudinary:', uploadError);
        // Continue without screenshot if upload fails
      }
    }

    // Determine wallet destination
    const isOnline = paymentType === 'online';
    const bankName = isOnline ? paymentMode.replace('online_', '').toUpperCase() : '';

    // Create transaction record
    const result = await db.insert("tbl_transactions", {
      session_id: session.session_id,
      transaction_type: "deposit_cash",
      player_id: playerId,
      player_name: player.player_name,
      amount: depositAmount,
      chips_amount: 0,
      payment_mode: paymentMode,
      wallet_used: "secondary", // Always goes to secondary wallet
      primary_amount: 0,
      secondary_amount: depositAmount,
      screenshot_url: screenshotUrl, // Cloudinary URL
      screenshot_public_id: screenshotPublicId, // Cloudinary public ID
      notes: data.notes || `Cash deposit by ${player.player_name}${isOnline ? ` - ${bankName}` : ''} (increases Store Balance)`,
      created_by: userId,
      created_at: new Date(),
    });

    // ✅ Update Secondary Wallet based on payment type
    const sessionUpdates = {
      total_deposits: parseFloat(session.total_deposits || 0) + depositAmount,
      total_cash_deposits: parseFloat(session.total_cash_deposits || 0) + depositAmount,
      secondary_wallet: parseFloat(session.secondary_wallet || 0) + depositAmount,
    };

    if (isOnline) {
      // Add to Online Money (online_balance)
      sessionUpdates.online_balance = parseFloat(session.online_balance || 0) + depositAmount;
    } else {
      // Add to Cash in Hand (cash_balance)
      sessionUpdates.cash_balance = parseFloat(session.cash_balance || 0) + depositAmount;
    }

    await db.update(
      "tbl_daily_sessions",
      sessionUpdates,
      "session_id = ?",
      [session.session_id]
    );

    // ✅ Also update Store Balance (stored_chips) - both Cash and Online increase it
    await db.query(
      `UPDATE tbl_players SET stored_chips = COALESCE(stored_chips, 0) + ? WHERE player_id = ?`,
      [depositAmount, playerId]
    );

    // Get updated stored balance
    const updatedPlayer = await playerService.getPlayer(playerId);
    const totalStoredBalance = parseFloat(updatedPlayer.stored_chips || 0);

    const walletType = isOnline 
      ? `Online Money (${bankName})` 
      : 'Cash in Hand';

    return {
      transaction_id: result.insert_id,
      amount_deposited: depositAmount,
      payment_type: paymentType,
      payment_mode: paymentMode,
      wallet_type: walletType,
      total_stored_balance: totalStoredBalance,
      screenshot_url: screenshotUrl,
      screenshot_public_id: screenshotPublicId,
      message: `₹${depositAmount.toLocaleString("en-IN")} cash deposited successfully. Added to Secondary Wallet → ${walletType}. Store Balance increased to ₹${totalStoredBalance.toLocaleString("en-IN")}.`,
    };
  }

  /**
   * ✅ GET PLAYER'S CASH DEPOSITS
   * Returns the total cash deposits made by player (optionally for a specific session)
   */
  async getPlayerCashDeposits(playerId, sessionId = null) {
    if (!playerId) {
      throw new Error('Player ID is required');
    }

    let query = `
      SELECT 
        COALESCE(SUM(amount), 0) as cash_deposits,
        COUNT(*) as deposit_count
      FROM tbl_transactions
      WHERE player_id = ?
        AND transaction_type = 'deposit_cash'
    `;

    const params = [playerId];

    if (sessionId) {
      query += ` AND session_id = ?`;
      params.push(sessionId);
    }

    const result = await db.queryAll(query, params);
    const totalDeposits = result && result.length > 0 ? parseFloat(result[0].cash_deposits || 0) : 0;
    const depositCount = result && result.length > 0 ? parseInt(result[0].deposit_count || 0) : 0;

    return {
      cash_deposits: totalDeposits,
      deposit_count: depositCount,
      player_id: playerId,
      session_id: sessionId || null
    };
  }

  /**
   * ✅ RETURN CHIPS with breakdown
   */
  async createReturnChips(data, userId) {
    const session = await this.validateSession();
    const playerId = await this.getPlayerId(data);
    const player = await playerService.getPlayer(playerId);

    const balance = await this.getPlayerChipBalance(
      playerId,
      session.session_id
    );
    const requestedChips = parseFloat(data.chips_amount);

    if (requestedChips > parseFloat(balance.current_chip_balance)) {
      throw new Error(
        `Insufficient chips. Player has ₹${balance.current_chip_balance} in chips.`
      );
    }

    // ✅ CHIP BREAKDOWN IS MANDATORY
    if (!data.chip_breakdown) {
      throw new Error(
        "Chip breakdown is required. Please specify which chips the player is returning."
      );
    }

    // ✅ VALIDATE CHIP BREAKDOWN
    cashierService.validateChipBreakdown(data.chip_breakdown, requestedChips);

    const result = await db.insert("tbl_transactions", {
      session_id: session.session_id,
      transaction_type: "return_chips",
      player_id: playerId,
      player_name: player.player_name,
      amount: 0,
      chips_amount: requestedChips,
      payment_mode: null,

      // ✅ CHIP BREAKDOWN
      chips_100: data.chip_breakdown.chips_100 || 0,
      chips_500: data.chip_breakdown.chips_500 || 0,
      chips_1000: data.chip_breakdown.chips_1000 || 0,
      chips_5000: data.chip_breakdown.chips_5000 || 0,
      chips_10000: data.chip_breakdown.chips_10000 || 0,

      notes:
        data.notes ||
        `Player storing ₹${requestedChips} chips for next session (${this.formatChipBreakdown(
          data.chip_breakdown
        )})`,
      created_by: userId,
      created_at: new Date(),
    });

    const newStoredChips =
      parseFloat(balance.stored_chips || 0) + requestedChips;
    await this.updatePlayerChipBalance(playerId, session.session_id, {
      chips_returned: requestedChips,
      stored_chips: newStoredChips,
    });

    // ✅ UPDATE CHIP INVENTORY (chips received back)
    await cashierService.updateChipInventory(
      session.session_id,
      data.chip_breakdown,
      false
    );

    await db.update(
      "tbl_daily_sessions",
      {
        total_chips_out:
          parseFloat(session.total_chips_out || 0) - requestedChips,
      },
      "session_id = ?",
      [session.session_id]
    );

    return {
      transaction_id: result.insert_id,
      chips_stored: requestedChips,
      chip_breakdown: data.chip_breakdown,
      total_stored_chips: newStoredChips,
      message: `₹${requestedChips} chips stored (${this.formatChipBreakdown(
        data.chip_breakdown
      )}). Total stored: ₹${newStoredChips}`,
    };
  }

  /**
   * ✅ ISSUE CREDIT with chip breakdown
   */
  async issueCredit(data, userId) {
    const session = await this.validateSession();
    const creditAmount = parseFloat(
      data.credit_amount || data.requested_amount
    );

    // Validate chip breakdown
    if (!data.chip_breakdown) {
      throw new Error("Chip breakdown is required for credit issuance");
    }

    const chipsAmount = parseFloat(data.chips_amount || creditAmount);

    // ✅ VALIDATE CHIP INVENTORY - chips must be deducted from cashier inventory
    await this.validateChipInventoryAvailable(session.session_id, data.chip_breakdown);

    // ✅ Create credit record in database - MUST be marked as UNSETTLED
    // This credit will remain outstanding until explicitly settled during cash payout
    const creditResult = await db.insert("tbl_credits", {
      session_id: session.session_id,
      player_id: data.player_id,
      player_name: data.player_name || "",

      // Store chip breakdown for settlement tracking
      chips_100: data.chip_breakdown.chips_100 || 0,
      chips_500: data.chip_breakdown.chips_500 || 0,
      chips_1000: data.chip_breakdown.chips_1000 || 0,
      chips_5000: data.chip_breakdown.chips_5000 || 0,
      chips_10000: data.chip_breakdown.chips_10000 || 0,

      // ✅ CREDIT TRACKING: Mark as UNSETTLED (outstanding)
      credit_issued: parseFloat(creditAmount), // Total credit issued
      credit_settled: 0, // Nothing settled yet
      credit_outstanding: parseFloat(creditAmount), // Full amount is outstanding
      is_fully_settled: 0, // ✅ CRITICAL: Must be 0 to show as unsettled/outstanding
      credit_request_id: data.credit_request_id || null,
      issued_at: new Date(),
      // Note: settled_at will be set when credit is fully settled
    });

    // Create transaction record
    await db.insert("tbl_transactions", {
      session_id: session.session_id,
      transaction_type: "credit_issued",
      player_id: data.player_id,
      player_name: data.player_name || "",
      amount: creditAmount,
      chips_amount: chipsAmount,
      payment_mode: "credit",
      wallet_used: null, // ✅ NO wallet used for credit
      primary_amount: 0,
      secondary_amount: 0,

      // Store chip breakdown
      chips_100: data.chip_breakdown.chips_100 || 0,
      chips_500: data.chip_breakdown.chips_500 || 0,
      chips_1000: data.chip_breakdown.chips_1000 || 0,
      chips_5000: data.chip_breakdown.chips_5000 || 0,
      chips_10000: data.chip_breakdown.chips_10000 || 0,

      notes: data.notes || `Credit issued: ₹${creditAmount} mixed chips`,
      created_by: userId,
      created_at: new Date(),
    });

    // ✅ DEDUCT CHIPS FROM INVENTORY - chips are given to player
    await cashierService.updateChipInventory(
      session.session_id,
      data.chip_breakdown,
      true // isGivingOut = true (chips going out to player)
    );

    // ✅ FIX: Update player's chip balance - credit gives chips to player
    await this.updatePlayerChipBalance(data.player_id, session.session_id, {
      chips_received: chipsAmount, // Player receives chips on credit
      credit_taken: creditAmount, // Track credit taken
      credit_change: creditAmount, // Increase outstanding credit
    });

    // Update session outstanding credit tracking
    await db.update(
      "tbl_daily_sessions",
      {
        outstanding_credit:
          parseFloat(session.outstanding_credit || 0) + creditAmount,
      },
      "session_id = ?",
      [session.session_id]
    );

    // ✅ FIX: Update player's total_credits_issued in tbl_players
    await playerService.updatePlayerTransactionStats(
      data.player_id,
      "credit_issued",
      creditAmount
    );

    return {
      credit_id: creditResult.insert_id,
      credit_issued: creditAmount,
      chips_given: chipsAmount,
      chip_breakdown: data.chip_breakdown,
      message: `✅ Credit issued: ₹${creditAmount} (${this.formatChipBreakdown(
        data.chip_breakdown
      )}). Chips deducted from inventory.`,
    };
  }

  /**
   * ✅ Helper: Check if chip inventory has enough chips
   */
  async validateChipInventoryAvailable(sessionId, chipBreakdown) {
    const session = await db.select(
      "tbl_daily_sessions",
      "*",
      "session_id = ?",
      [sessionId]
    );

    const needed = {
      chips_100: chipBreakdown.chips_100 || 0,
      chips_500: chipBreakdown.chips_500 || 0,
      chips_1000: chipBreakdown.chips_1000 || 0,
      chips_5000: chipBreakdown.chips_5000 || 0,
      chips_10000: chipBreakdown.chips_10000 || 0,
    };

    const available = {
      chips_100: parseInt(session.chips_100_current),
      chips_500: parseInt(session.chips_500_current),
      chips_5000: parseInt(session.chips_5000_current),
      chips_10000: parseInt(session.chips_10000_current),
    };

    const insufficient = [];

    if (needed.chips_100 > available.chips_100) {
      insufficient.push(
        `₹100: need ${needed.chips_100}, have ${available.chips_100}`
      );
    }
    if (needed.chips_500 > available.chips_500) {
      insufficient.push(
        `₹500: need ${needed.chips_500}, have ${available.chips_500}`
      );
    }
    if (needed.chips_5000 > available.chips_5000) {
      insufficient.push(
        `₹5000: need ${needed.chips_5000}, have ${available.chips_5000}`
      );
    }
    if (needed.chips_10000 > available.chips_10000) {
      insufficient.push(
        `₹10000: need ${needed.chips_10000}, have ${available.chips_10000}`
      );
    }

    return {
      available: insufficient.length === 0,
      message:
        insufficient.length > 0
          ? insufficient.join(", ")
          : "All chips available",
    };
  }

  /**
   * ✅ Helper: Format chip breakdown for display
   */
  formatChipBreakdown(breakdown) {
    const parts = [];
    if (breakdown.chips_100) parts.push(`${breakdown.chips_100}×₹100`);
    if (breakdown.chips_500) parts.push(`${breakdown.chips_500}×₹500`);
    if (breakdown.chips_1000) parts.push(`${breakdown.chips_1000}×₹1,000`);
    if (breakdown.chips_5000) parts.push(`${breakdown.chips_5000}×₹5,000`);
    if (breakdown.chips_10000) parts.push(`${breakdown.chips_10000}×₹10,000`);
    return parts.length > 0 ? parts.join(", ") : "No chips";
  }

  /**
   * Generate readable chip breakdown note
   */
  generateChipBreakdownNote(breakdown, action = "given") {
    if (!breakdown) return null;
    const formatted = this.formatChipBreakdown(breakdown);
    return formatted !== "No chips" ? `Chips ${action}: ${formatted}` : null;
  }

  /**
   * ✅ Helper: Calculate optimal chip breakdown from amount
   * Uses largest denominations first for efficiency
   */
  calculateOptimalChipBreakdown(amount) {
    let remaining = parseInt(amount);
    const breakdown = {
      chips_10000: 0,
      chips_5000: 0,
      chips_1000: 0,
      chips_500: 0,
      chips_100: 0,
    };

    // Start with largest denomination
    breakdown.chips_10000 = Math.floor(remaining / 10000);
    remaining = remaining % 10000;

    breakdown.chips_5000 = Math.floor(remaining / 5000);
    remaining = remaining % 5000;

    breakdown.chips_1000 = Math.floor(remaining / 1000);
    remaining = remaining % 1000;

    breakdown.chips_500 = Math.floor(remaining / 500);
    remaining = remaining % 500;

    breakdown.chips_100 = Math.floor(remaining / 100);

    return breakdown;
  }

  async getPlayerCurrentStatus(playerId) {
    const session = await this.validateSession();
    const balance = await this.getPlayerChipBalance(
      playerId,
      session.session_id
    );
    const player = await playerService.getPlayer(playerId);

    const currentChipValue = parseFloat(balance.current_chip_balance);
    const outstandingCredit = parseFloat(balance.outstanding_credit);
    
    // ✅ Get global stored_chips from player table (not just session-level)
    // This is the actual stored balance available for chip issuance
    const globalStoredChips = parseFloat(player.stored_chips || 0);

    return {
      player_id: playerId,
      player_code: player.player_code,
      player_name: player.player_name,
      session_id: session.session_id,

      current_chip_balance: currentChipValue,
      chips_out: parseFloat(
        balance.chips_out || balance.outstanding_credit || 0
      ), // Total chips issued as credit
      stored_chips: globalStoredChips, // ✅ Use global stored_chips from player table
      outstanding_credit: outstandingCredit,
      total_bought_in: parseFloat(balance.total_bought_in),
      total_cashed_out: parseFloat(balance.total_cashed_out),

      can_cash_out: outstandingCredit === 0 && currentChipValue > 0,
      can_deposit: currentChipValue > 0,
      must_settle_credit_first: outstandingCredit > 0,

      note: "All amounts in ₹ VALUE. Player can cash out or deposit any amount up to current_chip_balance.",
    };
  }

  /**
   * Settle credit (unchanged)
   */
  async settleCredit(data, userId) {
    const session = await this.validateSession();
    const playerId = await this.getPlayerId(data);
    const player = await playerService.getPlayer(playerId);

    const balance = await this.getPlayerChipBalance(
      playerId,
      session.session_id
    );
    const settleAmount = parseFloat(data.settle_amount);

    if (parseFloat(balance.outstanding_credit) === 0) {
      throw new Error("No outstanding credit for this player");
    }

    if (settleAmount > parseFloat(balance.outstanding_credit)) {
      throw new Error(
        `Settlement amount exceeds outstanding credit. Outstanding: ₹${balance.outstanding_credit}`
      );
    }

    const validPaymentModes = [
      "cash",
      "online_sbi",
      "online_hdfc",
      "online_icici",
      "online_other",
    ];
    if (!validPaymentModes.includes(data.payment_mode)) {
      throw new Error("Invalid payment mode");
    }

    // ✅ FIX: Create transaction record
    const transResult = await db.insert("tbl_transactions", {
      session_id: session.session_id,
      transaction_type: "settle_credit",
      player_id: playerId,
      player_name: player.player_name,
      amount: settleAmount,
      chips_amount: 0, // No chips involved, just cash payment
      payment_mode: data.payment_mode,
      wallet_used: "secondary",
      primary_amount: 0,
      secondary_amount: settleAmount,
      screenshot_url: data.screenshot_url || null,
      screenshot_public_id: data.screenshot_public_id || null,
      notes: data.notes || `Credit settlement: ₹${settleAmount}`,
      created_by: userId,
      created_at: new Date(),
    });

    // ✅ Get and update credit records (handle multiple credit records)
    const credits = await db.queryAll(
      `SELECT 
        credit_id,
        credit_request_id,
        session_id,
        player_id,
        player_name,
        credit_issued,
        credit_settled,
        credit_outstanding,
        chips_100,
        chips_500,
        chips_1000,
        chips_5000,
        chips_10000,
        is_fully_settled,
        created_at,
        issued_at,
        settled_at,
        updated_at
       FROM tbl_credits 
       WHERE session_id = ? AND player_id = ? AND is_fully_settled = 0 
       ORDER BY credit_id ASC`,
      [session.session_id, playerId]
    );

    if (!credits || credits.length === 0) {
      throw new Error("No outstanding credit records found for this player");
    }

    // Settle credit across records (oldest first)
    let remainingToSettle = settleAmount;
    console.log(`[SettleCredit] Starting settlement:`, {
      player_id: playerId,
      settle_amount: settleAmount,
      credits_found: credits.length,
      credits_detail: credits.map(c => ({
        credit_id: c.credit_id,
        credit_issued: c.credit_issued,
        credit_settled: c.credit_settled,
        credit_outstanding: c.credit_outstanding,
        is_fully_settled: c.is_fully_settled
      }))
    });

    for (const credit of credits) {
      if (remainingToSettle <= 0) break;

            const creditOutstanding = parseFloat(credit.credit_outstanding || 0);
            const settleAmountForThisCredit = Math.min(remainingToSettle, creditOutstanding);

            const newSettled = parseFloat(credit.credit_settled || 0) + settleAmountForThisCredit;
            const newOutstanding = creditOutstanding - settleAmountForThisCredit;
            // ✅ CRITICAL: If outstanding becomes 0 or less, mark as fully settled
            const finalOutstanding = Math.max(0, newOutstanding);
            const isFullySettled = finalOutstanding <= 0.01 ? 1 : 0; // Use 0.01 to handle floating point precision

            // ✅ Handle credit_id = 0 by using multiple fields to identify the record
            const whereClause = credit.credit_id > 0 
              ? `credit_id = ?` 
              : `session_id = ? AND player_id = ? AND credit_issued = ? AND ABS(credit_settled - ?) < 0.01 AND ABS(credit_outstanding - ?) < 0.01 AND created_at = ?`;
            const whereParams = credit.credit_id > 0
              ? [credit.credit_id]
              : [
                  session.session_id, 
                  playerId, 
                  credit.credit_issued, 
                  credit.credit_settled, 
                  credit.credit_outstanding,
                  credit.created_at
                ];

            console.log(`[SettleCredit] Updating credit record:`, {
              credit_id: credit.credit_id,
              where_clause: whereClause,
              where_params: whereParams,
              old_outstanding: creditOutstanding,
              old_settled: credit.credit_settled,
              settle_amount: settleAmountForThisCredit,
              new_settled: newSettled,
              new_outstanding: finalOutstanding,
              is_fully_settled: isFullySettled
            });

            // ✅ CRITICAL: Use raw SQL to ensure atomic update
            await db.query(
              `UPDATE tbl_credits 
               SET credit_settled = ?, 
                   credit_outstanding = ?, 
                   is_fully_settled = ?,
                   settled_at = ?,
                   updated_at = NOW()
               WHERE ${whereClause}`,
              [
                newSettled,
                finalOutstanding,
                isFullySettled,
                isFullySettled ? new Date() : null,
                ...whereParams
              ]
            );

            // ✅ Verify the update worked
            const verifyCredit = await db.queryAll(
              `SELECT credit_outstanding, is_fully_settled FROM tbl_credits WHERE ${whereClause}`,
              whereParams
            );
            console.log(`[SettleCredit] Verification after update:`, {
              credit_id: credit.credit_id,
              verified_outstanding: verifyCredit?.[0]?.credit_outstanding,
              verified_is_fully_settled: verifyCredit?.[0]?.is_fully_settled
            });

      remainingToSettle -= settleAmountForThisCredit;
    }

    console.log(`[SettleCredit] Settlement complete. Remaining to settle: ${remainingToSettle}`);

    // ✅ Update credit_settled in balance table (don't use credit_change)
    await this.updatePlayerChipBalance(playerId, session.session_id, {
      credit_settled: settleAmount,
      // Don't use credit_change - we'll recalculate outstanding_credit from tbl_credits below
    });

    // ✅ Recalculate outstanding credit from tbl_credits (source of truth) after settlement
    // Calculate for CURRENT SESSION only (for session-level tracking)
    const remainingCreditsAfterSettlement = await db.queryAll(
      `SELECT * FROM tbl_credits 
       WHERE session_id = ? AND player_id = ? AND is_fully_settled = 0`,
      [session.session_id, playerId]
    );
    const playerOutstandingCreditForSession = (remainingCreditsAfterSettlement || []).reduce(
      (sum, credit) => sum + parseFloat(credit.credit_outstanding || 0),
      0
    );

    // ✅ VERIFY: Query again to ensure the update was applied correctly
    const verifyOutstanding = await db.queryAll(
      `SELECT SUM(credit_outstanding) as total_outstanding, COUNT(*) as count
       FROM tbl_credits 
       WHERE player_id = ? AND is_fully_settled = 0`,
      [playerId]
    );

    console.log(`[SettleCredit] After settlement recalculation:`, {
      player_id: playerId,
      session_id: session.session_id,
      remaining_credits_found: remainingCreditsAfterSettlement?.length || 0,
      remaining_credits_detail: remainingCreditsAfterSettlement?.map(c => ({
        credit_id: c.credit_id,
        credit_issued: c.credit_issued,
        credit_settled: c.credit_settled,
        credit_outstanding: c.credit_outstanding,
        is_fully_settled: c.is_fully_settled
      })),
      calculated_outstanding: playerOutstandingCreditForSession,
      verified_total_outstanding: parseFloat(verifyOutstanding?.[0]?.total_outstanding || 0),
      verified_count: verifyOutstanding?.[0]?.count || 0
    });

    // ✅ Update player balance table with recalculated outstanding credit (session-level)
    await db.update(
      "tbl_player_chip_balances",
      {
        outstanding_credit: playerOutstandingCreditForSession,
      },
      "session_id = ? AND player_id = ?",
      [session.session_id, playerId]
    );

    // ✅ Recalculate player's LIFETIME outstanding credit from ALL sessions (for tbl_players)
    const allPlayerCredits = await db.queryAll(
      `SELECT * FROM tbl_credits 
       WHERE player_id = ? AND is_fully_settled = 0`,
      [playerId]
    );
    const playerLifetimeOutstandingCredit = (allPlayerCredits || []).reduce(
      (sum, credit) => sum + parseFloat(credit.credit_outstanding || 0),
      0
    );

    // ✅ Update player's lifetime outstanding credit in tbl_players
    await db.update(
      "tbl_players",
      {
        outstanding_credit: Math.max(0, playerLifetimeOutstandingCredit), // Ensure never negative
      },
      "player_id = ?",
      [playerId]
    );

    // ✅ Recalculate session-level outstanding credit (sum of all players) from tbl_credits
    const allRemainingCreditsForSession = await db.queryAll(
      `SELECT * FROM tbl_credits 
       WHERE session_id = ? AND is_fully_settled = 0`,
      [session.session_id]
    );
    const sessionOutstandingCreditTotal = (allRemainingCreditsForSession || []).reduce(
      (sum, credit) => sum + parseFloat(credit.credit_outstanding || 0),
      0
    );

    // ✅ FIX: Cash comes IN to cash_balance (if cash) or online_balance (if online)
    const updates = {
      outstanding_credit: sessionOutstandingCreditTotal, // ✅ Use recalculated value from tbl_credits
      total_deposits: parseFloat(session.total_deposits || 0) + settleAmount,
    };

    // ✅ CRITICAL: Update cash_balance or online_balance based on payment mode
    if (data.payment_mode === "cash") {
      // Cash settlement → add to cash_balance (Cash in Hand) and secondary_wallet
      updates.cash_balance = parseFloat(session.cash_balance || 0) + settleAmount;
      updates.secondary_wallet = parseFloat(session.secondary_wallet || 0) + settleAmount;
      updates.secondary_wallet_deposits = parseFloat(session.secondary_wallet_deposits || 0) + settleAmount;
      updates.total_cash_deposits = parseFloat(session.total_cash_deposits || 0) + settleAmount;
      updates.total_online_deposits = parseFloat(session.total_online_deposits || 0);
    } else if (data.payment_mode && data.payment_mode.startsWith("online_")) {
      // Online settlement → add to online_balance (Online Money), NOT secondary_wallet
      updates.online_balance = parseFloat(session.online_balance || 0) + settleAmount;
      updates.total_online_deposits = parseFloat(session.total_online_deposits || 0) + settleAmount;
      updates.total_cash_deposits = parseFloat(session.total_cash_deposits || 0);
      // ✅ Note: secondary_wallet is NOT updated for online settlements (only for cash)
      // ✅ Note: SBI and HDFC deposits are calculated from transactions in dashboard service
    } else {
      // Default to cash if payment mode is unclear
      updates.cash_balance = parseFloat(session.cash_balance || 0) + settleAmount;
      updates.secondary_wallet = parseFloat(session.secondary_wallet || 0) + settleAmount;
      updates.secondary_wallet_deposits = parseFloat(session.secondary_wallet_deposits || 0) + settleAmount;
      updates.total_cash_deposits = parseFloat(session.total_cash_deposits || 0) + settleAmount;
      updates.total_online_deposits = parseFloat(session.total_online_deposits || 0);
    }

    await db.update(
      "tbl_daily_sessions",
      updates,
      "session_id = ?",
      [session.session_id]
    );

    await playerService.updatePlayerTransactionStats(
      playerId,
      "settle_credit",
      settleAmount
    );

    const paymentModeLabel = data.payment_mode === "cash" 
      ? "Cash in Hand" 
      : data.payment_mode?.startsWith("online_") 
        ? "Online Money" 
        : "wallet";

    // ✅ Use recalculated outstanding credit
    const isFullySettled = playerOutstandingCreditForSession <= 0;

    return {
      transaction_id: transResult.insert_id,
      settled_amount: settleAmount,
      remaining_credit: Math.max(0, playerOutstandingCreditForSession),
      fully_settled: isFullySettled ? 1 : 0,
      message: isFullySettled
        ? `✅ Credit fully settled! ₹${settleAmount} added to ${paymentModeLabel}.`
        : `✅ Credit partially settled! ₹${settleAmount} added to ${paymentModeLabel}. Remaining credit: ₹${Math.max(
            0,
            playerOutstandingCreditForSession
          ).toLocaleString("en-IN")}`,
    };
  }
  async createExpense(data, userId) {
    const session = await this.validateSession();

    const expenseAmount = parseFloat(data.amount);

    // Calculate available in each wallet
    const secondaryAvailable = parseFloat(session.secondary_wallet || 0);
    const primaryAvailable =
      parseFloat(session.opening_float || 0) +
      parseFloat(session.total_deposits || 0) -
      parseFloat(session.total_withdrawals || 0) -
      parseFloat(session.total_expenses || 0);

    const totalAvailable = secondaryAvailable + primaryAvailable;

    if (expenseAmount > totalAvailable) {
      throw new Error(
        `Insufficient funds for expense. Available: ₹${totalAvailable.toLocaleString(
          "en-IN"
        )}`
      );
    }

    // Calculate split: Secondary first, then Primary
    let fromSecondary = 0;
    let fromPrimary = 0;

    if (secondaryAvailable >= expenseAmount) {
      // Full expense from secondary
      fromSecondary = expenseAmount;
      fromPrimary = 0;
    } else {
      // Partial from secondary, rest from primary
      fromSecondary = secondaryAvailable;
      fromPrimary = expenseAmount - secondaryAvailable;
    }

    // Determine wallet_used label
    let walletUsed = "primary";
    if (fromSecondary > 0 && fromPrimary > 0) {
      walletUsed = "split";
    } else if (fromSecondary > 0) {
      walletUsed = "secondary";
    }

    // Build notes with breakdown
    let expenseNotes = data.notes || data.description || "";
    if (fromSecondary > 0 && fromPrimary > 0) {
      expenseNotes += ` [Split: ₹${fromSecondary.toLocaleString(
        "en-IN"
      )} from Secondary + ₹${fromPrimary.toLocaleString(
        "en-IN"
      )} from Primary]`;
    } else if (fromSecondary > 0) {
      expenseNotes += ` [From Secondary Wallet]`;
    } else {
      expenseNotes += ` [From Primary Wallet]`;
    }

    const result = await db.insert("tbl_transactions", {
      session_id: session.session_id,
      transaction_type: "expense",
      player_id: null,
      player_name: null,
      amount: expenseAmount,
      chips_amount: 0,
      payment_mode: "cash",
      wallet_used: walletUsed,
      primary_amount: fromPrimary,
      secondary_amount: fromSecondary,
      notes: expenseNotes,
      created_by: userId,
      created_at: new Date(),
    });

    // Update session - deduct from appropriate wallets
    const updateData = {};

    if (fromPrimary > 0) {
      updateData.total_expenses =
        parseFloat(session.total_expenses || 0) + fromPrimary;
    }

    if (fromSecondary > 0) {
      updateData.secondary_wallet =
        parseFloat(session.secondary_wallet || 0) - fromSecondary;
      updateData.secondary_wallet_withdrawals =
        parseFloat(session.secondary_wallet_withdrawals || 0) + fromSecondary;
    }

    await db.update("tbl_daily_sessions", updateData, "session_id = ?", [
      session.session_id,
    ]);

    return {
      transaction_id: result.insert_id,
      amount: expenseAmount,
      from_secondary: fromSecondary,
      from_primary: fromPrimary,
      wallet_used: walletUsed,
      message:
        fromSecondary > 0 && fromPrimary > 0
          ? `Expense recorded: ₹${fromSecondary.toLocaleString(
              "en-IN"
            )} from Secondary + ₹${fromPrimary.toLocaleString(
              "en-IN"
            )} from Primary`
          : fromSecondary > 0
          ? `Expense recorded: ₹${fromSecondary.toLocaleString(
              "en-IN"
            )} from Secondary Wallet`
          : `Expense recorded: ₹${fromPrimary.toLocaleString(
              "en-IN"
            )} from Primary Wallet`,
    };
  }

  /**
   * ✅ UPDATE TRANSACTION PLAYER NAME
   * Only updates player_name, marks as edited
   */
  async updateTransactionPlayerName(transactionId, newPlayerId, newPlayerName, userId) {
    const transaction = await db.select(
      "tbl_transactions",
      "*",
      "transaction_id = ?",
      [transactionId]
    );

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // ✅ RULE: Prevent editing transactions from other cashier's shift
    // Find which shift this transaction belongs to
    const cashierShiftService = require('../../cashier/services/cashier-shift.service');
    
    // Get all shifts for this session
    const allShifts = await db.selectAll(
      "tbl_cashier_shifts",
      "*",
      "session_id = ?",
      [transaction.session_id],
      "ORDER BY started_at ASC"
    );

    // Find the shift that was active when transaction was created
    let transactionShift = null;
    const transactionTime = new Date(transaction.created_at);
    
    for (const shift of allShifts || []) {
      const shiftStart = new Date(shift.started_at);
      const shiftEnd = shift.ended_at ? new Date(shift.ended_at) : new Date();
      
      if (transactionTime >= shiftStart && transactionTime <= shiftEnd) {
        transactionShift = shift;
        break;
      }
    }

    // If transaction belongs to a shift, check if current cashier can edit it
    if (transactionShift) {
      // Get current cashier's active shift
      const currentShift = await cashierShiftService.getActiveShift(transaction.session_id, userId);
      
      if (!currentShift || currentShift.shift_id !== transactionShift.shift_id) {
        const transactionCashierName = await cashierShiftService.getCashierName(transactionShift.cashier_id);
        throw new Error(
          `Cannot edit transaction. This transaction was created during ${transactionCashierName}'s shift. ` +
          `Only the cashier who created this transaction during their shift can edit it.`
        );
      }
    }

    // Store original player name if not already stored
    const originalPlayerName = transaction.original_player_name || transaction.player_name;

    // Update transaction with new player info
    await db.update(
      "tbl_transactions",
      {
        player_id: newPlayerId,
        player_name: newPlayerName,
        original_player_name: originalPlayerName,
        is_edited: 1,
        edited_at: new Date(),
        edited_by: userId,
      },
      "transaction_id = ?",
      [transactionId]
    );

    return {
      transaction_id: transactionId,
      message: "Player name updated successfully",
    };
  }

  async getPlayerCurrentStatus(playerId) {
    const session = await this.validateSession();
    const balance = await this.getPlayerChipBalance(
      playerId,
      session.session_id
    );

    // ✅ Calculate chips given out to this player (total amount issued, including credits)
    const totalChipsGiven = parseFloat(balance.total_chips_received || 0);

    // ✅ Calculate chips returned by player
    const totalChipsReturned = parseFloat(balance.total_chips_returned || 0);

    const currentChipValue = parseFloat(balance.current_chip_balance); // ₹ VALUE
    const outstandingCredit = parseFloat(balance.outstanding_credit); // ₹ VALUE

    return {
      player_id: playerId,
      session_id: session.session_id,

      // ✅ CHIP IN/OUT TRACKING (in ₹ value)
      chips_given: totalChipsGiven, // 📤 Total chips given to player (cash buyin + credit)
      chips_returned: totalChipsReturned, // 📥 Total chips returned by player
      chips_out: totalChipsGiven, // Same as chips_given (for legacy compatibility)

      // ✅ ALL VALUES IN RUPEES, NOT CHIP COUNT
      current_chip_balance: currentChipValue, // Total ₹ value of chips player currently has
      stored_chips: parseFloat(balance.stored_chips), // ₹ value of chips stored for next session
      outstanding_credit: outstandingCredit, // ₹ value of outstanding credit
      total_bought_in: parseFloat(balance.total_bought_in), // Total ₹ bought in via cash
      total_credit_taken: parseFloat(balance.total_credit_taken || 0), // Total ₹ credit issued
      total_cashed_out: parseFloat(balance.total_cashed_out), // Total ₹ cashed out

      // Status flags
      can_cash_out: outstandingCredit === 0 && currentChipValue > 0,
      must_settle_credit_first: outstandingCredit > 0,

      // ✅ Meta information for clarity
      note: "All chip amounts are in ₹ VALUE (rupee value), not chip count. chips_given = total chips issued to player (buy-in + credit)",
    };
  }

  async getPlayerTransactionHistory(playerId, sessionId = null) {
    let whereClause = "player_id = ?";
    let params = [playerId];

    if (sessionId) {
      whereClause += " AND session_id = ?";
      params.push(sessionId);
    }

    const transactions = await db.selectAll(
      "tbl_transactions",
      "*",
      whereClause,
      params,
      "ORDER BY created_at DESC"
    );

    return transactions || [];
  }

  async getCurrentSessionTransactions() {
    const session = await cashierService.getTodaySession();

    const transactions = await db.selectAll(
      "tbl_transactions",
      "*",
      "session_id = ?",
      [session.session_id],
      "ORDER BY created_at DESC"
    );

    return transactions || [];
  }

  async getOutstandingCredits() {
    const session = await this.validateSession();

    const credits = await db.selectAll(
      "tbl_credits",
      "*",
      "session_id = ? AND is_fully_settled = 0",
      [session.session_id],
      "ORDER BY credit_id DESC"
    );

    const creditsWithDetails = await Promise.all(
      (credits || []).map(async (credit) => {
        const player = await playerService.getPlayer(credit.player_id);
        return {
          ...credit,
          player_name: player.player_name,
          player_code: player.player_code,
          phone_number: player.phone_number,
          remaining_to_settle: parseFloat(credit.credit_outstanding),
        };
      })
    );

    return creditsWithDetails;
  }

  async getTransactionById(transactionId) {
    const transaction = await db.select(
      "tbl_transactions",
      "*",
      "transaction_id = ?",
      [transactionId]
    );

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    return transaction;
  }

  /**
   * ✅ ADD TRANSACTION NOTE
   */
  async addTransactionNote(transactionId, noteData, userId) {
    // Verify transaction exists
    const transaction = await db.select(
      "tbl_transactions",
      "transaction_id",
      "transaction_id = ?",
      [transactionId]
    );

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // ✅ Insert note with optional image
    const result = await db.insert("tbl_transaction_notes", {
      transaction_id: transactionId,
      note: noteData.note || noteData.text || "",
      image_url: noteData.image_url || null,
      image_public_id: noteData.image_public_id || null,
      is_resolved: 0,
      created_by: userId,
      created_at: new Date(),
    });

    return {
      note_id: result.insert_id,
      transaction_id: transactionId,
      message: "Note added successfully",
    };
  }

  /**
   * ✅ GET TRANSACTION NOTES
   */
  async getTransactionNotes(transactionId) {
    // Verify transaction exists
    const transaction = await db.select(
      "tbl_transactions",
      "transaction_id",
      "transaction_id = ?",
      [transactionId]
    );

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // Get all notes for this transaction
    const notes = await db.queryAll(
      `SELECT 
        tn.*,
        u.username,
        u.full_name,
        u.user_id
      FROM tbl_transaction_notes tn
      LEFT JOIN tbl_users u ON tn.created_by = u.user_id
      WHERE tn.transaction_id = ?
      ORDER BY tn.created_at DESC`,
      [transactionId]
    );

    return {
      transaction_id: transactionId,
      notes: notes || [],
      count: notes?.length || 0,
    };
  }

  /**
   * ✅ RESOLVE TRANSACTION NOTES
   */
  async resolveTransactionNotes(transactionId, userId) {
    // Verify transaction exists
    const transaction = await db.select(
      "tbl_transactions",
      "transaction_id",
      "transaction_id = ?",
      [transactionId]
    );

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    // Mark all notes as resolved
    await db.update(
      "tbl_transaction_notes",
      {
        is_resolved: 1,
        resolved_by: userId,
        resolved_at: new Date(),
      },
      "transaction_id = ? AND is_resolved = 0",
      [transactionId]
    );

    return {
      transaction_id: transactionId,
      message: "All notes resolved successfully",
    };
  }

  async getAllTransactions(filters = {}) {
    let whereClause = "1=1";
    let params = [];

    if (filters.session_id) {
      whereClause += " AND session_id = ?";
      params.push(filters.session_id);
    }

    if (filters.player_id) {
      whereClause += " AND player_id = ?";
      params.push(filters.player_id);
    }

    if (filters.transaction_type) {
      whereClause += " AND transaction_type = ?";
      params.push(filters.transaction_type);
    }

    if (filters.payment_mode) {
      whereClause += " AND payment_mode = ?";
      params.push(filters.payment_mode);
    }

    if (filters.date_from) {
      whereClause += " AND DATE(created_at) >= ?";
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      whereClause += " AND DATE(created_at) <= ?";
      params.push(filters.date_to);
    }

    const transactions = await db.selectAll(
      "tbl_transactions",
      "*",
      whereClause,
      params,
      "ORDER BY created_at DESC"
    );

    return transactions || [];
  }
}

module.exports = new TransactionService();
