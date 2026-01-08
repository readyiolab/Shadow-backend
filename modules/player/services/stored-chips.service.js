// modules/player/services/stored-chips.service.js
// Player Stored Chips Service - Deposit chips for future use

const db = require('../../../config/database');
const cashierService = require('../../cashier/services/cashier.service');
const playerService = require('./player.service');

class StoredChipsService {
  /**
   * Get player's stored chips balance
   */
  async getStoredChipsBalance(playerId) {
    let stored = await db.select(
      'tbl_player_stored_chips',
      '*',
      'player_id = ?',
      [playerId]
    );

    if (!stored) {
      // Create empty record if not exists
      await db.insert('tbl_player_stored_chips', {
        player_id: playerId,
        chips_100: 0,
        chips_500: 0,
        chips_5000: 0,
        chips_10000: 0,
        total_chips: 0,
        total_value: 0
      });

      stored = {
        player_id: playerId,
        chips_100: 0,
        chips_500: 0,
        chips_5000: 0,
        chips_10000: 0,
        total_chips: 0,
        total_value: 0
      };
    }

    return stored;
  }

  /**
   * Deposit chips to storage
   * Player returns chips but doesn't want cash - stores for future
   */
  async depositChips(data, userId) {
    // Validate session
    const session = await cashierService.getTodaySession();
    if (!session) {
      throw new Error('No active session found');
    }

    // Get player
    const player = await playerService.getPlayer(data.player_id);
    if (!player) {
      throw new Error('Player not found');
    }

    // Validate chip breakdown
    const chipBreakdown = data.chip_breakdown || {};
    if (!chipBreakdown.chips_100 && !chipBreakdown.chips_500 && 
        !chipBreakdown.chips_5000 && !chipBreakdown.chips_10000) {
      throw new Error('Chip breakdown is required');
    }

    // Calculate values
    const chips100 = chipBreakdown.chips_100 || 0;
    const chips500 = chipBreakdown.chips_500 || 0;
    const chips5000 = chipBreakdown.chips_5000 || 0;
    const chips10000 = chipBreakdown.chips_10000 || 0;

    const totalChips = chips100 + chips500 + chips5000 + chips10000;
    const totalValue = (chips100 * 100) + (chips500 * 500) + (chips5000 * 5000) + (chips10000 * 10000);

    // Get current stored balance
    const currentStored = await this.getStoredChipsBalance(data.player_id);

    // Update stored chips
    const newChips100 = currentStored.chips_100 + chips100;
    const newChips500 = currentStored.chips_500 + chips500;
    const newChips5000 = currentStored.chips_5000 + chips5000;
    const newChips10000 = currentStored.chips_10000 + chips10000;
    const newTotalChips = newChips100 + newChips500 + newChips5000 + newChips10000;
    const newTotalValue = (newChips100 * 100) + (newChips500 * 500) + (newChips5000 * 5000) + (newChips10000 * 10000);

    await db.update('tbl_player_stored_chips', {
      chips_100: newChips100,
      chips_500: newChips500,
      chips_5000: newChips5000,
      chips_10000: newChips10000,
      total_chips: newTotalChips,
      total_value: newTotalValue,
      last_deposit_at: new Date()
    }, 'player_id = ?', [data.player_id]);

    // Create history record
    await db.insert('tbl_player_stored_chips_history', {
      player_id: data.player_id,
      session_id: session.session_id,
      transaction_type: 'deposit',
      chips_100: chips100,
      chips_500: chips500,
      chips_5000: chips5000,
      chips_10000: chips10000,
      total_chips: totalChips,
      total_value: totalValue,
      notes: data.notes || null,
      created_by: userId
    });

    // Update chip inventory (chips returned to cashier)
    await cashierService.updateChipInventory(
      session.session_id,
      chipBreakdown,
      false // receiving chips back
    );

    // Log chip movement
    await this.logChipMovement(session.session_id, {
      movement_type: 'stored_deposit',
      direction: 'in',
      player_id: data.player_id,
      chip_breakdown: chipBreakdown,
      total_value: totalValue,
      notes: `Player ${player.player_name} deposited chips for storage`,
      created_by: userId
    });

    return {
      player_id: data.player_id,
      player_name: player.player_name,
      deposited: {
        chips_100: chips100,
        chips_500: chips500,
        chips_5000: chips5000,
        chips_10000: chips10000,
        total_chips: totalChips,
        total_value: totalValue
      },
      new_balance: {
        chips_100: newChips100,
        chips_500: newChips500,
        chips_5000: newChips5000,
        chips_10000: newChips10000,
        total_chips: newTotalChips,
        total_value: newTotalValue
      },
      message: `Deposited ${totalChips} chips (₹${totalValue}) to storage. New balance: ${newTotalChips} chips (₹${newTotalValue})`
    };
  }

  /**
   * Withdraw chips from storage
   * Player wants to use stored chips for a buy-in
   */
  async withdrawChips(data, userId) {
    // Validate session
    const session = await cashierService.getTodaySession();
    if (!session) {
      throw new Error('No active session found');
    }

    // Get player
    const player = await playerService.getPlayer(data.player_id);
    if (!player) {
      throw new Error('Player not found');
    }

    // Get current stored balance
    const currentStored = await this.getStoredChipsBalance(data.player_id);

    // Validate chip breakdown and availability
    const chipBreakdown = data.chip_breakdown || {};
    const chips100 = chipBreakdown.chips_100 || 0;
    const chips500 = chipBreakdown.chips_500 || 0;
    const chips5000 = chipBreakdown.chips_5000 || 0;
    const chips10000 = chipBreakdown.chips_10000 || 0;

    // Check availability
    const issues = [];
    if (chips100 > currentStored.chips_100) {
      issues.push(`₹100: need ${chips100}, stored ${currentStored.chips_100}`);
    }
    if (chips500 > currentStored.chips_500) {
      issues.push(`₹500: need ${chips500}, stored ${currentStored.chips_500}`);
    }
    if (chips5000 > currentStored.chips_5000) {
      issues.push(`₹5000: need ${chips5000}, stored ${currentStored.chips_5000}`);
    }
    if (chips10000 > currentStored.chips_10000) {
      issues.push(`₹10000: need ${chips10000}, stored ${currentStored.chips_10000}`);
    }

    if (issues.length > 0) {
      throw new Error(`Insufficient stored chips: ${issues.join('; ')}`);
    }

    // Check if cashier has these chips in inventory
    const inventoryCheck = await cashierService.validateChipInventoryAvailable(session.session_id, chipBreakdown);
    if (!inventoryCheck.available) {
      throw new Error(`Insufficient chips in cashier inventory: ${inventoryCheck.message}`);
    }

    const totalChips = chips100 + chips500 + chips5000 + chips10000;
    const totalValue = (chips100 * 100) + (chips500 * 500) + (chips5000 * 5000) + (chips10000 * 10000);

    // Update stored chips
    const newChips100 = currentStored.chips_100 - chips100;
    const newChips500 = currentStored.chips_500 - chips500;
    const newChips5000 = currentStored.chips_5000 - chips5000;
    const newChips10000 = currentStored.chips_10000 - chips10000;
    const newTotalChips = newChips100 + newChips500 + newChips5000 + newChips10000;
    const newTotalValue = (newChips100 * 100) + (newChips500 * 500) + (newChips5000 * 5000) + (newChips10000 * 10000);

    await db.update('tbl_player_stored_chips', {
      chips_100: newChips100,
      chips_500: newChips500,
      chips_5000: newChips5000,
      chips_10000: newChips10000,
      total_chips: newTotalChips,
      total_value: newTotalValue,
      last_withdrawal_at: new Date()
    }, 'player_id = ?', [data.player_id]);

    // Create history record
    await db.insert('tbl_player_stored_chips_history', {
      player_id: data.player_id,
      session_id: session.session_id,
      transaction_type: 'withdrawal',
      chips_100: chips100,
      chips_500: chips500,
      chips_5000: chips5000,
      chips_10000: chips10000,
      total_chips: totalChips,
      total_value: totalValue,
      notes: data.notes || null,
      created_by: userId
    });

    // Update chip inventory (chips given to player)
    await cashierService.updateChipInventory(
      session.session_id,
      chipBreakdown,
      true // giving out chips
    );

    // Log chip movement
    await this.logChipMovement(session.session_id, {
      movement_type: 'stored_withdrawal',
      direction: 'out',
      player_id: data.player_id,
      chip_breakdown: chipBreakdown,
      total_value: totalValue,
      notes: `Player ${player.player_name} withdrew stored chips`,
      created_by: userId
    });

    return {
      player_id: data.player_id,
      player_name: player.player_name,
      withdrawn: {
        chips_100: chips100,
        chips_500: chips500,
        chips_5000: chips5000,
        chips_10000: chips10000,
        total_chips: totalChips,
        total_value: totalValue
      },
      remaining_balance: {
        chips_100: newChips100,
        chips_500: newChips500,
        chips_5000: newChips5000,
        chips_10000: newChips10000,
        total_chips: newTotalChips,
        total_value: newTotalValue
      },
      message: `Withdrew ${totalChips} chips (₹${totalValue}) from storage. Remaining: ${newTotalChips} chips (₹${newTotalValue})`
    };
  }

  /**
   * Get stored chips history for player
   */
  async getStoredChipsHistory(playerId) {
    const history = await db.selectAll(
      'tbl_player_stored_chips_history',
      '*',
      'player_id = ?',
      [playerId],
      'ORDER BY created_at DESC'
    );

    return history || [];
  }

  /**
   * Get all players with stored chips
   */
  async getPlayersWithStoredChips() {
    const players = await db.queryAll(`
      SELECT s.*, p.player_name, p.player_code, p.phone_number
      FROM tbl_player_stored_chips s
      JOIN tbl_players p ON s.player_id = p.player_id
      WHERE s.total_chips > 0
      ORDER BY s.total_value DESC
    `);

    return players || [];
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

module.exports = new StoredChipsService();
