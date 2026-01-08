const playerService = require('../services/player.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');
const { logAudit } = require('../../../utils/logger.util');

class PlayerController {
  // Create new player
  async createPlayer(req, res, next) {
    try {
      const result = await playerService.createPlayer(req.body, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'CREATE_PLAYER',
        'tbl_players',
        result.player_id,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(res, 'Player created successfully', result, 201);
    } catch (error) {
      next(error);
    }
  }

  // Get player by ID or code
  async getPlayer(req, res, next) {
    try {
      const { identifier } = req.params; // Can be player_id or player_code
      
      const player = await playerService.getPlayer(identifier);
      
      return sendSuccess(res, 'Player retrieved', player);
    } catch (error) {
      next(error);
    }
  }

  // Search players
  async searchPlayers(req, res, next) {
    try {
      const { q } = req.query; // Search term
      const filters = {
        player_type: req.query.player_type,
        is_active: req.query.is_active,
        is_blacklisted: req.query.is_blacklisted
      };

      if (!q) {
        return sendError(res, 'Search term is required', 400);
      }

      const players = await playerService.searchPlayers(q, filters);
      
      return sendSuccess(res, 'Players retrieved', players);
    } catch (error) {
      next(error);
    }
  }

  // Get all players with pagination
  async getAllPlayers(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const filters = {
        player_type: req.query.player_type,
        is_active: req.query.is_active,
        is_blacklisted: req.query.is_blacklisted
      };

      const result = await playerService.getAllPlayers(page, limit, filters);
      
      return sendSuccess(res, 'Players retrieved', result);
    } catch (error) {
      next(error);
    }
  }

  // Get all players WITH KYC documents (NEW)
  async getAllPlayersWithKYC(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const filters = {
        player_type: req.query.player_type,
        is_active: req.query.is_active,
        is_blacklisted: req.query.is_blacklisted
      };

      const result = await playerService.getAllPlayersWithKYC(page, limit, filters);
      
      return sendSuccess(res, 'Players with KYC retrieved', result);
    } catch (error) {
      next(error);
    }
  }

  // Update player
  async updatePlayer(req, res, next) {
    try {
      const { player_id } = req.params;
      
      const oldPlayer = await playerService.getPlayer(player_id);
      const updatedPlayer = await playerService.updatePlayer(player_id, req.body, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'UPDATE_PLAYER',
        'tbl_players',
        player_id,
        oldPlayer,
        updatedPlayer,
        req.ip
      );

      return sendSuccess(res, 'Player updated successfully', updatedPlayer);
    } catch (error) {
      next(error);
    }
  }

  // Toggle house player status
  async toggleHousePlayer(req, res, next) {
    try {
      const { player_id } = req.params;
      
      const oldPlayer = await playerService.getPlayer(player_id);
      const updatedPlayer = await playerService.toggleHousePlayer(player_id, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'TOGGLE_HOUSE_PLAYER',
        'tbl_players',
        player_id,
        oldPlayer,
        updatedPlayer,
        req.ip
      );

      return sendSuccess(res, `Player ${updatedPlayer.is_house_player ? 'marked as' : 'removed from'} house player`, updatedPlayer);
    } catch (error) {
      next(error);
    }
  }

  // Deactivate player
  async deactivatePlayer(req, res, next) {
    try {
      const { player_id } = req.params;
      
      await playerService.deactivatePlayer(player_id, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'DEACTIVATE_PLAYER',
        'tbl_players',
        player_id,
        null,
        null,
        req.ip
      );

      return sendSuccess(res, 'Player deactivated successfully');
    } catch (error) {
      next(error);
    }
  }

  // Activate player
  async activatePlayer(req, res, next) {
    try {
      const { player_id } = req.params;
      
      await playerService.activatePlayer(player_id, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'ACTIVATE_PLAYER',
        'tbl_players',
        player_id,
        null,
        null,
        req.ip
      );

      return sendSuccess(res, 'Player activated successfully');
    } catch (error) {
      next(error);
    }
  }

  // Blacklist player
  async blacklistPlayer(req, res, next) {
    try {
      const { player_id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return sendError(res, 'Blacklist reason is required', 400);
      }
      
      await playerService.blacklistPlayer(player_id, reason, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'BLACKLIST_PLAYER',
        'tbl_players',
        player_id,
        null,
        { reason },
        req.ip
      );

      return sendSuccess(res, 'Player blacklisted successfully');
    } catch (error) {
      next(error);
    }
  }

  // Remove from blacklist
  async unblacklistPlayer(req, res, next) {
    try {
      const { player_id } = req.params;
      
      await playerService.unblacklistPlayer(player_id, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'UNBLACKLIST_PLAYER',
        'tbl_players',
        player_id,
        null,
        null,
        req.ip
      );

      return sendSuccess(res, 'Player removed from blacklist');
    } catch (error) {
      next(error);
    }
  }

  // Get player statistics
  async getPlayerStats(req, res, next) {
    try {
      const { player_id } = req.params;
      
      const stats = await playerService.getPlayerStats(player_id);
      
      return sendSuccess(res, 'Player statistics retrieved', stats);
    } catch (error) {
      next(error);
    }
  }

  // Add note to player
  async addPlayerNote(req, res, next) {
    try {
      const { player_id } = req.params;
      
      const noteId = await playerService.addPlayerNote(player_id, req.body, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'ADD_PLAYER_NOTE',
        'tbl_player_notes',
        noteId,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(res, 'Note added successfully', { note_id: noteId }, 201);
    } catch (error) {
      next(error);
    }
  }

  // Get player notes
  async getPlayerNotes(req, res, next) {
    try {
      const { player_id } = req.params;
      
      const notes = await playerService.getPlayerNotes(player_id);
      
      return sendSuccess(res, 'Player notes retrieved', notes);
    } catch (error) {
      next(error);
    }
  }

  // Get player bonus
  async getPlayerBonus(req, res, next) {
    try {
      const { player_id } = req.params;
      
      const bonus = await playerService.getPlayerBonus(player_id);
      
      return sendSuccess(res, 'Player bonus retrieved', bonus);
    } catch (error) {
      next(error);
    }
  }

  // Get players with outstanding credit
  async getPlayersWithCredit(req, res, next) {
    try {
      const players = await playerService.getPlayersWithOutstandingCredit();
      
      return sendSuccess(res, 'Players with outstanding credit retrieved', players);
    } catch (error) {
      next(error);
    }
  }

  // Get top players
  async getTopPlayers(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      
      const players = await playerService.getTopPlayers(limit);
      
      return sendSuccess(res, 'Top players retrieved', players);
    } catch (error) {
      next(error);
    }
  }

  // Get player by phone (quick lookup)
  async getPlayerByPhone(req, res, next) {
    try {
      const { phone_number } = req.params;
      
      const player = await playerService.getPlayerByPhone(phone_number);
      
      return sendSuccess(res, 'Player retrieved', player);
    } catch (error) {
      next(error);
    }
  }

  // ✅ Set player credit limit
  async setPlayerCreditLimit(req, res, next) {
    try {
      const { player_id } = req.params;
      const { credit_limit } = req.body;
      
      if (credit_limit === undefined || credit_limit === null) {
        return sendError(res, 'Credit limit is required', 400);
      }

      const playerCreditService = require('../../credit/services/player-credit.service');
      const result = await playerCreditService.setPlayerCreditLimit(
        player_id, 
        credit_limit, 
        req.user.user_id
      );

      await logAudit(
        req.user.user_id,
        'SET_CREDIT_LIMIT',
        'tbl_players',
        player_id,
        null,
        { credit_limit },
        req.ip
      );

      return sendSuccess(res, result.message, result);
    } catch (error) {
      next(error);
    }
  }

  // ✅ Get player credit status
  async getPlayerCreditStatus(req, res, next) {
    try {
      const { player_id } = req.params;
      const { session_id } = req.query;
      
      const playerCreditService = require('../../credit/services/player-credit.service');
      const status = await playerCreditService.getPlayerCreditStatus(player_id, session_id);

      return sendSuccess(res, 'Player credit status retrieved', status);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PlayerController();