// ============================================
// modules/player-dashboard/services/dashboard.service.js
// ============================================
const db = require('../../../config/database');

class PlayerDashboardService {
  // Get player profile
  async getPlayerProfile(playerId) {
    const player = await db.select(
      'tbl_players',
      '*',
      'player_id = ?',
      [playerId]
    );

    if (!player) {
      throw new Error('Player not found');
    }

    return {
      player_id: player.player_id,
      player_code: player.player_code,
      player_name: player.player_name,
      phone_number: player.phone_number,
      email: player.email,
      address: player.address,
      kyc_status: player.kyc_status,
      kyc_completed_at: player.kyc_completed_at,
      last_visit_date: player.last_visit_date,
      visit_count: player.visit_count,
      total_buy_ins: player.total_buy_ins,
      total_cash_outs: player.total_cash_outs,
      outstanding_credit: player.outstanding_credit,
      is_active: player.is_active,
      created_at: player.created_at
    };
  }

  // Update player profile (except phone number and player code)
  async updatePlayerProfile(playerId, data) {
    const player = await this.getPlayerProfile(playerId);

    // Prevent updating phone number and player code
    if (data.phone_number || data.player_code) {
      throw new Error('Cannot update phone number or player code');
    }

    const updateData = {};

    if (data.player_name) {
      updateData.player_name = data.player_name;
    }

    if (data.email !== undefined) {
      // Check if email already exists (for other players)
      if (data.email && data.email !== player.email) {
        const existingEmail = await db.select(
          'tbl_players',
          'player_id',
          'email = ? AND player_id != ?',
          [data.email, playerId]
        );
        if (existingEmail) {
          throw new Error('Email already registered');
        }
      }
      updateData.email = data.email || null;
    }

    if (data.address !== undefined) {
      updateData.address = data.address || null;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('No valid fields to update');
    }

    await db.update('tbl_players', updateData, 'player_id = ?', [playerId]);

    return await this.getPlayerProfile(playerId);
  }

  // Get player statistics
  async getPlayerStats(playerId) {
    const player = await db.select(
      'tbl_players',
      '*',
      'player_id = ?',
      [playerId]
    );

    if (!player) {
      throw new Error('Player not found');
    }

    // Get recent visits
    const visits = await db.queryAll(
      `SELECT * FROM tbl_player_visits 
       WHERE player_id = ? 
       ORDER BY visit_date DESC 
       LIMIT 10`,
      [playerId]
    );

    return {
      total_visits: player.visit_count || 0,
      total_buy_ins: parseFloat(player.total_buy_ins) || 0,
      total_cash_outs: parseFloat(player.total_cash_outs) || 0,
      net_result: parseFloat(player.total_cash_outs - player.total_buy_ins) || 0,
      outstanding_credit: parseFloat(player.outstanding_credit) || 0,
      kyc_status: player.kyc_status,
      last_visit: player.last_visit_date,
      recent_visits: visits
    };
  }

  // Get player KYC status and details
  async getPlayerKYCStatus(playerId) {
    const player = await db.select(
      'tbl_players',
      '*',
      'player_id = ?',
      [playerId]
    );

    if (!player) {
      throw new Error('Player not found');
    }

    const kyc = await db.select(
      'tbl_player_kyc',
      '*',
      'player_id = ?',
      [playerId]
    );

    return {
      player_id: playerId,
      kyc_status: player.kyc_status,
      kyc_completed_at: player.kyc_completed_at,
      kyc_record: kyc || null,
      pending_documents: this.getPendingDocuments(kyc)
    };
  }

  // Helper: Determine which documents are pending
  getPendingDocuments(kyc) {
    if (!kyc) {
      return ['id_document_front', 'photo']; // Required documents
    }

    const pending = [];

    if (!kyc.id_document_front) pending.push('id_document_front');
    if (!kyc.photo) pending.push('photo');
    if (!kyc.id_document_back && kyc.kyc_method === 'manual') {
      pending.push('id_document_back');
    }

    return pending;
  }

  // Get player notes and history
  async getPlayerNotes(playerId) {
    const notes = await db.queryAll(
      `SELECT pn.*, u.username, u.full_name 
       FROM tbl_player_notes pn
       LEFT JOIN tbl_users u ON pn.created_by = u.user_id
       WHERE pn.player_id = ?
       ORDER BY pn.created_at DESC`,
      [playerId]
    );

    return notes || [];
  }

  // Get player transactions/credits
  async getPlayerTransactions(playerId, limit = 20) {
    const transactions = await db.queryAll(
      `SELECT * FROM tbl_transactions 
       WHERE player_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [playerId, limit]
    );

    return transactions || [];
  }

  // Get unread notifications count
  async getUnreadNotificationsCount(playerId) {
    const result = await db.query(
      `SELECT COUNT(*) as unread FROM tbl_kyc_notifications 
       WHERE player_id = ? AND is_read = 0`,
      [playerId]
    );

    return result?.unread || 0;
  }

  // Get player notifications
  async getPlayerNotifications(playerId, limit = 10) {
    const notifications = await db.queryAll(
      `SELECT * FROM tbl_kyc_notifications 
       WHERE player_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [playerId, limit]
    );

    return notifications || [];
  }

  // Mark notification as read
  async markNotificationRead(notificationId, playerId) {
    const notification = await db.select(
      'tbl_kyc_notifications',
      '*',
      'notification_id = ? AND player_id = ?',
      [notificationId, playerId]
    );

    if (!notification) {
      throw new Error('Notification not found');
    }

    await db.update(
      'tbl_kyc_notifications',
      {
        is_read: true,
        read_at: new Date()
      },
      'notification_id = ?',
      [notificationId]
    );

    return true;
  }

  // Dashboard summary
  async getDashboardSummary(playerId) {
    const profile = await this.getPlayerProfile(playerId);
    const stats = await this.getPlayerStats(playerId);
    const kycStatus = await this.getPlayerKYCStatus(playerId);
    const unreadNotifications = await this.getUnreadNotificationsCount(playerId);

    return {
      profile: {
        player_id: profile.player_id,
        player_code: profile.player_code,
        player_name: profile.player_name,
        phone_number: profile.phone_number,
        email: profile.email,
        address: profile.address
      },
      kyc: {
        status: kycStatus.kyc_status,
        completed_at: kycStatus.kyc_completed_at,
        pending_documents: kycStatus.pending_documents
      },
      stats: {
        total_visits: stats.total_visits,
        total_buy_ins: stats.total_buy_ins,
        total_cash_outs: stats.total_cash_outs,
        net_result: stats.net_result,
        outstanding_credit: stats.outstanding_credit
      },
      notifications: {
        unread_count: unreadNotifications
      }
    };
  }
}

module.exports = new PlayerDashboardService();