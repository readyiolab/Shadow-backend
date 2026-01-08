// ============================================
// modules/player-dashboard/controllers/dashboard.controller.js
// ============================================
const dashboardService = require('../services/dashboard.service');
const kycService = require('../../kyc/services/kyc.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');

class PlayerDashboardController {
  // Get dashboard summary
  async getDashboard(req, res, next) {
    try {
      const playerId = req.player.player_id;

      const summary = await dashboardService.getDashboardSummary(playerId);

      return sendSuccess(res, 'Dashboard data retrieved', summary);
    } catch (error) {
      next(error);
    }
  }

  // Get player profile
  async getProfile(req, res, next) {
    try {
      const playerId = req.player.player_id;

      const profile = await dashboardService.getPlayerProfile(playerId);

      return sendSuccess(res, 'Profile retrieved', profile);
    } catch (error) {
      next(error);
    }
  }

  // Update player profile
  async updateProfile(req, res, next) {
    try {
      const playerId = req.player.player_id;

      const updatedProfile = await dashboardService.updatePlayerProfile(
        playerId,
        req.body
      );

      return sendSuccess(
        res,
        'Profile updated successfully',
        updatedProfile
      );
    } catch (error) {
      next(error);
    }
  }

  // Get player statistics
  async getStats(req, res, next) {
    try {
      const playerId = req.player.player_id;

      const stats = await dashboardService.getPlayerStats(playerId);

      return sendSuccess(res, 'Statistics retrieved', stats);
    } catch (error) {
      next(error);
    }
  }

  // Get KYC status
  async getKYCStatus(req, res, next) {
    try {
      const playerId = req.player.player_id;

      const kycStatus = await dashboardService.getPlayerKYCStatus(playerId);

      return sendSuccess(res, 'KYC status retrieved', kycStatus);
    } catch (error) {
      next(error);
    }
  }

  // Initiate DigiLocker KYC (player self-service)
  async initiateDigiLockerKYC(req, res, next) {
    try {
      const playerId = req.player.player_id;

      const result = await kycService.initiateDigiLockerKYC(
        playerId,
        playerId
      );

      return sendSuccess(
        res,
        'DigiLocker KYC initiated. Redirect to auth_url',
        result
      );
    } catch (error) {
      next(error);
    }
  }

  // Manual KYC: Create KYC record
  async createManualKYC(req, res, next) {
    try {
      const playerId = req.player.player_id;

      const kycId = await kycService.createKYC(
        playerId,
        req.body,
        playerId
      );

      return sendSuccess(res, 'KYC record created', { kyc_id: kycId }, 201);
    } catch (error) {
      next(error);
    }
  }

  // Manual KYC: Upload document
  async uploadKYCDocument(req, res, next) {
    try {
      const playerId = req.player.player_id;
      const { document_type } = req.body;

      if (!req.file) {
        return sendError(res, 'No file uploaded', 400);
      }

      const filePath = req.file.path;

      await kycService.uploadDocument(playerId, document_type, filePath, playerId);

      return sendSuccess(res, 'Document uploaded successfully', {
        file_path: filePath
      });
    } catch (error) {
      next(error);
    }
  }

  // Manual KYC: Submit for review
  async submitKYC(req, res, next) {
    try {
      const playerId = req.player.player_id;

      await kycService.submitKYC(playerId, playerId);

      return sendSuccess(res, 'KYC submitted for review');
    } catch (error) {
      next(error);
    }
  }

  // Get transactions/credits
  async getTransactions(req, res, next) {
    try {
      const playerId = req.player.player_id;
      const limit = parseInt(req.query.limit) || 20;

      const transactions = await dashboardService.getPlayerTransactions(
        playerId,
        limit
      );

      return sendSuccess(res, 'Transactions retrieved', transactions);
    } catch (error) {
      next(error);
    }
  }

  // Get notifications
  async getNotifications(req, res, next) {
    try {
      const playerId = req.player.player_id;
      const limit = parseInt(req.query.limit) || 10;

      const notifications = await dashboardService.getPlayerNotifications(
        playerId,
        limit
      );

      return sendSuccess(res, 'Notifications retrieved', notifications);
    } catch (error) {
      next(error);
    }
  }

  // Mark notification as read
  async markNotificationRead(req, res, next) {
    try {
      const playerId = req.player.player_id;
      const { notification_id } = req.params;

      await dashboardService.markNotificationRead(notification_id, playerId);

      return sendSuccess(res, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  }

  // Register device for push notifications
  async registerDevice(req, res, next) {
    try {
      const playerId = req.player.player_id;

      const deviceId = await kycService.registerDevice(playerId, req.body);

      return sendSuccess(res, 'Device registered', { device_id: deviceId }, 201);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PlayerDashboardController();