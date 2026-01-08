// modules/credit/services/player-credit.service.js
// Enhanced Player Credit Management - Per-Player Credit Limits

const db = require('../../../config/database');
const playerService = require('../../player/services/player.service');
const cashierService = require('../../cashier/services/cashier.service');

class PlayerCreditService {
  /**
   * Set credit limit for a specific player
   */
  async setPlayerCreditLimit(playerId, creditLimit, userId) {
    const player = await playerService.getPlayer(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    const limit = parseFloat(creditLimit);
    if (isNaN(limit) || limit < 0) {
      throw new Error('Invalid credit limit');
    }

    await db.update('tbl_players', {
      credit_limit_personal: limit,
      credit_limit_set_by: userId,
      credit_limit_set_at: new Date()
    }, 'player_id = ?', [playerId]);

    // Log the action
    const session = await cashierService.getTodaySession();
    if (session) {
      await db.insert('tbl_credit_usage_log', {
        player_id: playerId,
        session_id: session.session_id,
        credit_limit_at_time: limit,
        credit_used: 0,
        credit_remaining: limit,
        action_type: 'limit_updated',
        action_amount: limit,
        notes: `Credit limit set to ₹${limit}`,
        created_by: userId
      });
    }

    return {
      player_id: playerId,
      player_name: player.player_name,
      credit_limit: limit,
      message: `Credit limit for ${player.player_name} set to ₹${limit}`
    };
  }

  /**
   * Get player's credit status
   * Returns: limit, used, available, outstanding
   */
  async getPlayerCreditStatus(playerId, sessionId = null) {
    const player = await playerService.getPlayer(playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    // Get personal credit limit - check credit_limit_personal first, fallback to credit_limit
    // credit_limit_personal is set by cashier/admin specifically for this player
    // credit_limit is set during player creation
    const creditLimit = parseFloat(player.credit_limit_personal) || parseFloat(player.credit_limit) || 0;

    // Get total outstanding credit across all sessions
    const outstandingCredits = await db.queryAll(`
      SELECT SUM(credit_outstanding) as total_outstanding
      FROM tbl_credits
      WHERE player_id = ? AND is_fully_settled = 0
    `, [playerId]);

    const totalOutstanding = parseFloat(outstandingCredits?.[0]?.total_outstanding) || 0;

    // Get credit used in current session if provided
    let currentSessionUsed = 0;
    if (sessionId) {
      const sessionCredits = await db.queryAll(`
        SELECT SUM(credit_amount) as session_credit
        FROM tbl_credits
        WHERE player_id = ? AND session_id = ?
      `, [playerId, sessionId]);
      currentSessionUsed = parseFloat(sessionCredits?.[0]?.session_credit) || 0;
    }

    // Calculate available credit
    const availableCredit = Math.max(0, creditLimit - totalOutstanding);

    return {
      player_id: playerId,
      player_name: player.player_name,
      credit_limit: creditLimit,
      total_outstanding: totalOutstanding,
      available_credit: availableCredit,
      current_session_used: currentSessionUsed,
      can_get_credit: creditLimit > 0 && availableCredit > 0,
      must_clear_first: totalOutstanding >= creditLimit && creditLimit > 0
    };
  }

  /**
   * Check if player can get new credit
   * Returns true/false with reason
   */
  async canPlayerGetCredit(playerId, requestedAmount) {
    const status = await this.getPlayerCreditStatus(playerId);

    if (status.credit_limit === 0) {
      return {
        allowed: false,
        reason: 'No credit limit set for this player. Please contact admin to set a credit limit.',
        status
      };
    }

    if (status.must_clear_first) {
      return {
        allowed: false,
        reason: `Credit limit reached! Player has ₹${status.total_outstanding} outstanding credit. Please settle the outstanding credit first before taking new credit.`,
        status
      };
    }

    if (requestedAmount > status.available_credit) {
      return {
        allowed: false,
        reason: `Cannot issue ₹${requestedAmount} credit. Player has ₹${status.total_outstanding} outstanding (unsettled) credit. Available credit: ₹${status.available_credit}. Please settle outstanding credit first or request a smaller amount.`,
        available: status.available_credit,
        status
      };
    }

    return {
      allowed: true,
      reason: 'Credit approved',
      available: status.available_credit,
      status
    };
  }

  /**
   * Get all players with credit limits
   */
  async getPlayersWithCreditLimits() {
    const players = await db.queryAll(`
      SELECT 
        p.player_id,
        p.player_code,
        p.player_name,
        p.phone_number,
        p.credit_limit_personal,
        p.credit_limit_set_at,
        COALESCE(SUM(CASE WHEN c.is_fully_settled = 0 THEN c.credit_outstanding ELSE 0 END), 0) as total_outstanding
      FROM tbl_players p
      LEFT JOIN tbl_credits c ON p.player_id = c.player_id
      WHERE p.credit_limit_personal > 0
      GROUP BY p.player_id
      ORDER BY p.player_name
    `);

    return (players || []).map(p => ({
      ...p,
      available_credit: Math.max(0, parseFloat(p.credit_limit_personal) - parseFloat(p.total_outstanding))
    }));
  }

  /**
   * Get players with outstanding credit
   */
  async getPlayersWithOutstandingCredit() {
    const players = await db.queryAll(`
      SELECT 
        p.player_id,
        p.player_code,
        p.player_name,
        p.phone_number,
        p.credit_limit_personal,
        SUM(c.credit_outstanding) as total_outstanding,
        COUNT(c.credit_id) as credit_count,
        MAX(c.created_at) as last_credit_date
      FROM tbl_players p
      JOIN tbl_credits c ON p.player_id = c.player_id
      WHERE c.is_fully_settled = 0
      GROUP BY p.player_id
      HAVING total_outstanding > 0
      ORDER BY total_outstanding DESC
    `);

    return players || [];
  }

  /**
   * Get credit history for player
   */
  async getPlayerCreditHistory(playerId) {
    const credits = await db.queryAll(`
      SELECT 
        c.*,
        s.session_date
      FROM tbl_credits c
      JOIN tbl_daily_sessions s ON c.session_id = s.session_id
      WHERE c.player_id = ?
      ORDER BY c.created_at DESC
      LIMIT 50
    `, [playerId]);

    return credits || [];
  }

  /**
   * Get credit usage log for player
   */
  async getCreditUsageLog(playerId) {
    const logs = await db.selectAll(
      'tbl_credit_usage_log',
      '*',
      'player_id = ?',
      [playerId],
      'ORDER BY created_at DESC LIMIT 50'
    );

    return logs || [];
  }

  /**
   * Bulk set credit limits for multiple players
   */
  async bulkSetCreditLimits(players, defaultLimit, userId) {
    const results = [];

    for (const playerData of players) {
      try {
        const limit = parseFloat(playerData.credit_limit) || defaultLimit;
        const result = await this.setPlayerCreditLimit(playerData.player_id, limit, userId);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({
          success: false,
          player_id: playerData.player_id,
          error: error.message
        });
      }
    }

    return results;
  }
}

module.exports = new PlayerCreditService();
