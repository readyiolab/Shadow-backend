// ============================================
// FILE: modules/floor-manager/services/waitlist.service.js
// Business logic for waitlist management
// ============================================

const db = require('../../../config/database');
const tableService = require('./table.service');

class WaitlistService {
  /**
   * ✅ ADD PLAYER TO WAITLIST
   */
  async addToWaitlist(data, userId) {
    try {
      const {
        player_name,
        player_phone,
        requested_table_id,
        requested_game_type,
        
      } = data;

      const session = await tableService.getCurrentSession();

      // Validate requested table if specific table requested
      if (requested_table_id) {
        const table = await db.select(
          'tbl_tables',
          '*',
          'table_id = ? AND table_status = "active"',
          [requested_table_id]
        );

        if (!table) {
          throw new Error('Requested table not found or inactive');
        }
      }

      // Add to waitlist
      const result = await db.insert('tbl_waitlist', {
        session_id: session.session_id,
        player_name,
        player_phone: player_phone || null,
        requested_table_id: requested_table_id || null,
        requested_game_type: requested_game_type || null,
        
        waitlist_status: 'waiting',
        created_by: userId,
        created_at: new Date()
      });

      return {
        waitlist_id: result.insert_id,
        player_name,
        wait_position: await this.getWaitPosition(result.insert_id),
        message: `${player_name} added to waitlist`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ GET ALL WAITING PLAYERS
   */
  async getWaitlist(sessionId) {
    try {
      const waitlist = await db.queryAll(
        `SELECT 
          w.*,
          t.table_number,
          t.table_name,
          TIMESTAMPDIFF(MINUTE, w.created_at, NOW()) as wait_time_minutes
        FROM tbl_waitlist w
        LEFT JOIN tbl_tables t ON w.requested_table_id = t.table_id
        WHERE w.session_id = ? AND w.waitlist_status = 'waiting'
        ORDER BY w.created_at ASC`,
        [sessionId]
      );

      return waitlist || [];
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ GET WAIT POSITION
   */
  async getWaitPosition(waitlistId) {
    try {
      const entry = await db.select(
        'tbl_waitlist',
        'created_at, session_id',
        'waitlist_id = ?',
        [waitlistId]
      );

      if (!entry) return null;

      const result = await db.query(
        `SELECT COUNT(*) + 1 as position
         FROM tbl_waitlist
         WHERE session_id = ?
           AND waitlist_status = 'waiting'
           AND created_at < ?`,
        [entry.session_id, entry.created_at]
      );

      return result?.position || 1;
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ SEAT PLAYER FROM WAITLIST
   * Automatically creates player if they don't exist
   */
  async seatFromWaitlist(waitlistId, tableId, seatNumber, userId) {
    try {
      const entry = await db.select(
        'tbl_waitlist',
        '*',
        'waitlist_id = ?',
        [waitlistId]
      );

      if (!entry) {
        throw new Error('Waitlist entry not found');
      }

      if (entry.waitlist_status !== 'waiting') {
        throw new Error('Player is not waiting');
      }

      // Use default buy-in from range if specified
      const buyInAmount = entry.buy_in_range_min || 500;

      // ✅ FIND OR CREATE PLAYER
      const playerServiceModule = require('../../player/services/player.service');
      let playerId = entry.player_id; // Use existing player_id if available
      
      if (!playerId) {
        // Try to find player by phone number first
        if (entry.player_phone) {
          try {
            const existingPlayer = await playerServiceModule.getPlayerByPhone(entry.player_phone);
            playerId = existingPlayer.player_id;
          } catch (err) {
            // Player not found by phone, will create new
          }
        }

        // If still no player_id, create new player
        if (!playerId) {
          const newPlayer = await playerServiceModule.createPlayer({
            player_name: entry.player_name,
            phone_number: entry.player_phone || null,
            player_type: 'occasional'
          }, userId);
          playerId = newPlayer.player_id;
        }
      }

      // Verify player exists
      const player = await db.select(
        'tbl_players',
        '*',
        'player_id = ?',
        [playerId]
      );

      if (!player) {
        throw new Error('Failed to create or find player');
      }

      // Add player to table (uses floor manager player service)
      const playerService = require('./player.service');
      const result = await playerService.addPlayerToTable({
        table_id: tableId,
        player_id: playerId,
        seat_number: seatNumber,
        buy_in_amount: buyInAmount
      }, userId);

      // Update waitlist entry - store player_id for future reference
      await db.update(
        'tbl_waitlist',
        {
          player_id: playerId, // Store player_id if not already stored
          waitlist_status: 'seated',
          seated_at: new Date(),
          seated_on_table_id: tableId
        },
        'waitlist_id = ?',
        [waitlistId]
      );

      return {
        success: true,
        ...result,
        message: `${entry.player_name} seated from waitlist`
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * ✅ CANCEL WAITLIST ENTRY
   */
  async cancelWaitlist(waitlistId, userId) {
    try {
      await db.update(
        'tbl_waitlist',
        { waitlist_status: 'cancelled' },
        'waitlist_id = ?',
        [waitlistId]
      );

      return {
        success: true,
        message: 'Waitlist entry cancelled'
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new WaitlistService();
