// modules/admin/controllers/session.controller.js
// ✅ FIXED: Admin only handles money, no chip inventory

const adminSessionService = require('../services/session.service');
const { validationResult } = require('express-validator');

class SessionController {
  /**
   * Open daily session - Admin provides ONLY cash float
   * POST /api/admin/session/open
   * Body: { owner_float: number }
   */
  async openDailySession(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { owner_float } = req.body;
      const userId = req.user.user_id;

      // ✅ Validate owner_float
      if (!owner_float || owner_float <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Owner float must be greater than 0'
        });
      }

      try {
        const result = await adminSessionService.openDailySession(owner_float, userId);

        return res.status(201).json({
          success: true,
          message: result.message,
          data: result
        });
      } catch (error) {
        // If session already exists, return current session status
        if (error.message?.includes('Session already opened')) {
          const currentStatus = await adminSessionService.getCurrentSessionStatus();
          
          if (currentStatus.has_active_session) {
            return res.status(200).json({
              success: true,
              message: 'Session already open for today',
              data: currentStatus.session,
              isExisting: true
            });
          }
        }
        
        throw error;
      }
    } catch (error) {
      console.error('Error opening session:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to open session'
      });
    }
  }

  /**
   * Close daily session
   * POST /api/admin/session/close
   */
  async closeDailySession(req, res) {
    try {
      const userId = req.user.user_id;

      const result = await adminSessionService.closeDailySession(userId);

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      console.error('Error closing session:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to close session'
      });
    }
  }

  /**
   * Get current session status
   * GET /api/admin/session/status
   */
  async getCurrentSessionStatus(req, res) {
    try {
      const status = await adminSessionService.getCurrentSessionStatus();

      return res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Error fetching session status:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch session status'
      });
    }
  }

  /**
   * Get all session summaries (history)
   * GET /api/admin/session/summaries
   */
  async getAllSessionSummaries(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 30;

      if (limit < 1 || limit > 100) {
        return res.status(400).json({
          success: false,
          message: 'Limit must be between 1 and 100'
        });
      }

      const summaries = await adminSessionService.getAllSessionSummaries(limit);

      return res.status(200).json({
        success: true,
        data: summaries,
        count: summaries.length
      });
    } catch (error) {
      console.error('Error fetching session summaries:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch session summaries'
      });
    }
  }

  /**
   * Get specific session summary
   * GET /api/admin/session/summary/:sessionId
   */
  async getSessionSummary(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { sessionId } = req.params;
      const summary = await adminSessionService.getSessionSummary(sessionId);

      return res.status(200).json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error fetching session summary:', error);
      return res.status(404).json({
        success: false,
        message: error.message || 'Session summary not found'
      });
    }
  }

  /**
   * Get session summary data (for calculations)
   * GET /api/admin/session/:sessionId/summary-data
   */
  async getSessionSummaryData(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { sessionId } = req.params;
      const summaryData = await adminSessionService.calculateSessionSummary(sessionId);

      return res.status(200).json({
        success: true,
        data: summaryData
      });
    } catch (error) {
      console.error('Error calculating session summary:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to calculate session summary'
      });
    }
  }
}

module.exports = new SessionController();