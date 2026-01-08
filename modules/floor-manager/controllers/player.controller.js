// ============================================
// FILE: modules/floor-manager/controllers/player.controller.js
// HTTP request handlers for players
// ============================================

const playerService = require('../services/player.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');
const { logAudit } = require('../../../utils/logger.util');

class PlayerController {
  async addPlayer(req, res) {
    console.log("🔥🔥🔥 CONTROLLER: addPlayer called");
    console.log("🔥 Request body:", req.body);
    console.log("🔥 User ID:", req.user?.user_id);
    try {
      const result = await playerService.addPlayerToTable(
        req.body,
        req.user.user_id
      );
      return sendSuccess(res, 'Player added to table', result, 201);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async markBuyinCompleted(req, res) {
    try {
      const { tablePlayerId } = req.params;
      const result = await playerService.markBuyinCompleted(
        tablePlayerId,
        req.user.user_id
      );
      return sendSuccess(res, result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async addRebuy(req, res) {
    try {
      const result = await playerService.addRebuy(req.body, req.user.user_id);
      return sendSuccess(res, result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async setOnBreak(req, res) {
    try {
      const { tablePlayerId } = req.params;
      const result = await playerService.setPlayerOnBreak(
        tablePlayerId,
        req.user.user_id
      );
      return sendSuccess(res, result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async resumeBreak(req, res) {
    try {
      const { tablePlayerId } = req.params;
      const result = await playerService.resumeFromBreak(
        tablePlayerId,
        req.user.user_id
      );
      return sendSuccess(res, result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async callTime(req, res) {
    try {
      const { tablePlayerId } = req.params;
      const result = await playerService.callTime(
        tablePlayerId,
        req.user.user_id
      );
      return sendSuccess(res, result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async extendCallTime(req, res) {
    try {
      const { tablePlayerId } = req.params;
      const { additional_minutes } = req.body;
      const result = await playerService.extendCallTime(
        tablePlayerId,
        additional_minutes || 30,
        req.user.user_id
      );
      return sendSuccess(res, result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async removePlayer(req, res) {
    try {
      const { tablePlayerId } = req.params;
      const { reason } = req.query; // ✅ Changed from req.body to req.query
      const result = await playerService.removePlayer(
        tablePlayerId,
        req.user.user_id,
        reason
      );
      return sendSuccess(res, result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getPlayerTimeHistory(req, res) {
    try {
      const { tablePlayerId } = req.params;
      const history = await playerService.getPlayerTimeHistory(tablePlayerId);
      return sendSuccess(res, history);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async transferPlayer(req, res) {
    try {
      const { tablePlayerId } = req.params;
      const { new_table_id, new_seat_number } = req.body;

      if (!new_table_id || !new_seat_number) {
        return sendError(res, 'Destination table and seat are required', 400);
      }

      const result = await playerService.transferPlayer(
        tablePlayerId,
        new_table_id,
        new_seat_number,
        req.user.user_id
      );
      return sendSuccess(res, result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }
}

module.exports = new PlayerController();