// ============================================
// FILE: modules/rakeback/controllers/rakeback.controller.js
// Rakeback Controller - Handles HTTP requests
// ============================================

const rakebackService = require('../services/rakeback.service');

class RakebackController {
  // ==========================================
  // RAKEBACK TYPE MANAGEMENT
  // ==========================================

  /**
   * GET /api/rakeback/types
   * Get all active rakeback types
   */
  async getRakebackTypes(req, res) {
    try {
      const types = await rakebackService.getRakebackTypes();
      res.json({
        success: true,
        message: 'Rakeback types retrieved',
        data: types
      });
    } catch (error) {
      console.error('Error getting rakeback types:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get rakeback types',
        errors: null
      });
    }
  }

  /**
   * POST /api/rakeback/types
   * Create new rakeback type
   * Body: { required_hours, default_amount }
   */
  async createRakebackType(req, res) {
    try {
      const userId = req.user?.user_id || req.user?.id;
      const result = await rakebackService.createRakebackType(req.body, userId);
      res.json({
        success: true,
        message: result.message || 'Rakeback type created',
        data: result
      });
    } catch (error) {
      console.error('Error creating rakeback type:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create rakeback type',
        errors: null
      });
    }
  }

  /**
   * PUT /api/rakeback/types/:typeCode
   * Update rakeback type
   * Body: { required_hours?, default_amount? }
   */
  async updateRakebackType(req, res) {
    try {
      const { typeCode } = req.params;
      const userId = req.user?.user_id || req.user?.id;
      const result = await rakebackService.updateRakebackType(typeCode, req.body, userId);
      res.json({
        success: true,
        message: result.message || 'Rakeback type updated',
        data: result
      });
    } catch (error) {
      console.error('Error updating rakeback type:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update rakeback type',
        errors: null
      });
    }
  }

  /**
   * DELETE /api/rakeback/types/:typeCode
   * Delete (soft) rakeback type
   */
  async deleteRakebackType(req, res) {
    try {
      const { typeCode } = req.params;
      const userId = req.user?.user_id || req.user?.id;
      const result = await rakebackService.deleteRakebackType(typeCode, userId);
      res.json({
        success: true,
        message: result.message || 'Rakeback type deleted',
        data: result
      });
    } catch (error) {
      console.error('Error deleting rakeback type:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete rakeback type',
        errors: null
      });
    }
  }

  // ==========================================
  // PLAYER MANAGEMENT
  // ==========================================

  /**
   * GET /api/rakeback/active-players?sessionId=xxx
   * Get active seated players with rakeback session timers
   */
  async getActiveSeatedPlayers(req, res) {
    try {
      const sessionId = req.query.sessionId;
      if (sessionId === undefined || sessionId === null) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required',
          errors: null
        });
      }
      
      const players = await rakebackService.getActiveSeatedPlayers(sessionId);
      res.json({
        success: true,
        message: 'Active players retrieved',
        data: players
      });
    } catch (error) {
      console.error('Error getting active players:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get active players',
        errors: null
      });
    }
  }

  /**
   * GET /api/rakeback/eligible?sessionId=xxx
   * Get players eligible for rakeback
   */
  async getEligiblePlayers(req, res) {
    try {
      const sessionId = req.query.sessionId;
      if (sessionId === undefined || sessionId === null) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required',
          errors: null
        });
      }
      
      const players = await rakebackService.getEligiblePlayers(sessionId);
      res.json({
        success: true,
        message: 'Eligible players retrieved',
        data: players
      });
    } catch (error) {
      console.error('Error getting eligible players:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get eligible players',
        errors: null
      });
    }
  }

  // ==========================================
  // RAKEBACK ASSIGNMENT
  // ==========================================

  /**
   * POST /api/rakeback/assign
   * Assign rakeback to player
   * Body: { table_player_id, rakeback_type_code }
   */
  async assignRakeback(req, res) {
    try {
      const userId = req.user?.user_id || req.user?.id;
      const result = await rakebackService.assignRakeback(req.body, userId);
      res.json({
        success: true,
        message: result.message || 'Rakeback assigned',
        data: result
      });
    } catch (error) {
      console.error('Error assigning rakeback:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to assign rakeback',
        errors: null
      });
    }
  }

  /**
   * DELETE /api/rakeback/assignment/:assignmentId
   * Cancel rakeback assignment
   */
  async cancelAssignment(req, res) {
    try {
      const { assignmentId } = req.params;
      const userId = req.user?.user_id || req.user?.id;
      const result = await rakebackService.cancelAssignment(assignmentId, userId);
      res.json({
        success: true,
        message: result.message || 'Assignment cancelled',
        data: result
      });
    } catch (error) {
      console.error('Error cancelling assignment:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to cancel assignment',
        errors: null
      });
    }
  }

  // ==========================================
  // RAKEBACK PROCESSING
  // ==========================================

  /**
   * POST /api/rakeback/process
   * Process rakeback (give chips)
   * Body: { assignment_id, chip_breakdown }
   */
  async processRakeback(req, res) {
    try {
      const userId = req.user?.user_id || req.user?.id;
      const result = await rakebackService.processRakeback(req.body, userId);
      res.json({
        success: true,
        message: result.message || 'Rakeback processed',
        data: result
      });
    } catch (error) {
      console.error('Error processing rakeback:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to process rakeback',
        errors: null
      });
    }
  }

  /**
   * POST /api/rakeback/update-eligibility
   * Update eligibility for all active assignments
   */
  async updateEligibility(req, res) {
    try {
      // This could be a background job that updates all assignments
      res.json({
        success: true,
        message: 'Eligibility updated',
        data: {}
      });
    } catch (error) {
      console.error('Error updating eligibility:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update eligibility',
        errors: null
      });
    }
  }

  // ==========================================
  // HISTORY & REPORTS
  // ==========================================

  /**
   * GET /api/rakeback/session/:sessionId
   * Get all rakebacks for a session
   */
  async getRakebacksForSession(req, res) {
    try {
      const { sessionId } = req.params;
      const rakebacks = await rakebackService.getRakebacksForSession(sessionId);
      res.json({
        success: true,
        message: 'Rakebacks retrieved',
        data: rakebacks
      });
    } catch (error) {
      console.error('Error getting rakebacks for session:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get rakebacks',
        errors: null
      });
    }
  }

  /**
   * GET /api/rakeback/player/:playerId
   * Get rakeback history for a player
   */
  async getPlayerRakebackHistory(req, res) {
    try {
      const { playerId } = req.params;
      const history = await rakebackService.getPlayerRakebackHistory(playerId);
      res.json({
        success: true,
        message: 'Player rakeback history retrieved',
        data: history
      });
    } catch (error) {
      console.error('Error getting player rakeback history:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get player history',
        errors: null
      });
    }
  }
}

module.exports = new RakebackController();