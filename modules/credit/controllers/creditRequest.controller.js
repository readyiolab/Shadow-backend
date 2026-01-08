// modules/credit/controllers/creditRequest.controller.js

const creditRequestService = require('../services/creditRequest.service');
const { validationResult } = require('express-validator');

class CreditRequestController {

  /**
 * Get credit statistics for a session
 * GET /api/credit/stats/session/:session_id
 */
async  getStats(req, res) {
  try {
    const { session_id } = req.params;

    // Get all credit requests for this session
    const requests = await creditRequestService.getSessionRequests(session_id);

    // Get outstanding credits from tbl_credits
    const credits = await db.selectAll(
      'tbl_credits',
      '*',
      'session_id = ? AND is_fully_settled = 0',
      [session_id]
    );

    // Calculate statistics
    const stats = {
      // Request stats
      total_requests: requests.length,
      pending_count: requests.filter(r => r.request_status === 'pending').length,
      approved_count: requests.filter(r => r.request_status === 'approved').length,
      rejected_count: requests.filter(r => r.request_status === 'rejected').length,
      auto_approved_count: requests.filter(r => 
        r.request_status === 'approved' && 
        r.approval_notes?.includes('Auto-approved')
      ).length,

      // Amount stats
      total_requested: requests.reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0),
      pending_amount: requests
        .filter(r => r.request_status === 'pending')
        .reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0),
      approved_amount: requests
        .filter(r => r.request_status === 'approved')
        .reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0),

      // Outstanding credits
      total_issued: credits.reduce((sum, c) => sum + parseFloat(c.credit_issued || 0), 0),
      total_settled: credits.reduce((sum, c) => sum + parseFloat(c.credit_settled || 0), 0),
      total_outstanding: credits.reduce((sum, c) => sum + parseFloat(c.credit_outstanding || 0), 0),
      
      // Player count
      unique_players: [...new Set(requests.map(r => r.player_id))].length
    };

    res.json({
      success: true,
      message: 'Credit statistics retrieved',
      data: stats
    });

  } catch (error) {
    console.error('Error in getStats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve credit statistics',
      errors: error.message
    });
  }
}

  /**
   * CREATE CREDIT REQUEST
   * Smart logic: Auto vs Pending
   */
  async createRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const result = await creditRequestService.createCreditRequest(
        req.body,
        req.user.user_id
      );

      // Different status codes based on approval type
      const statusCode = result.approval_type === 'instant' ? 201 : 202;

      return res.status(statusCode).json({
        success: true,
        data: result,
        message: result.message
      });
    } catch (error) {
      console.error('Error creating credit request:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create credit request'
      });
    }
  }

  /**
   * GET PENDING CREDIT REQUESTS
   * (Only requests awaiting admin approval)
   */
  async getPendingRequests(req, res) {
    try {
      const sessionId = req.query.session_id;
      
      const requests = await creditRequestService.getPendingRequests(sessionId);

      return res.status(200).json({
        success: true,
        data: requests,
        count: requests.length,
        message: requests.length > 0 
          ? `${requests.length} pending request(s) awaiting approval`
          : 'No pending requests'
      });
    } catch (error) {
      console.error('Error fetching pending requests:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch pending requests'
      });
    }
  }

  /**
   * GET AUTO-APPROVED CREDIT REQUESTS
   * (Instantly approved, no admin action)
   */
  async getAutoApprovedRequests(req, res) {
    try {
      const sessionId = req.query.session_id;
      
      const requests = await creditRequestService.getAutoApprovedRequests(sessionId);

      return res.status(200).json({
        success: true,
        data: requests,
        count: requests.length,
        message: requests.length > 0
          ? `${requests.length} auto-approved request(s)`
          : 'No auto-approved requests'
      });
    } catch (error) {
      console.error('Error fetching auto-approved requests:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch auto-approved requests'
      });
    }
  }

  /**
   * GET ALL CREDIT REQUESTS (Admin)
   * Returns pending, approved, and rejected requests
   */
  async getAllRequests(req, res) {
    try {
      const sessionId = req.query.session_id;
      
      const requests = await creditRequestService.getAllRequests(sessionId);

      // Separate by status
      const pending = requests.filter(r => r.request_status === 'pending');
      const approved = requests.filter(r => r.request_status === 'approved');
      const rejected = requests.filter(r => r.request_status === 'rejected');

      return res.status(200).json({
        success: true,
        data: {
          all: requests,
          pending,
          approved,
          rejected
        },
        summary: {
          total: requests.length,
          pending_count: pending.length,
          approved_count: approved.length,
          rejected_count: rejected.length,
          pending_amount: pending.reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0),
          approved_amount: approved.reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0),
          rejected_amount: rejected.reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0)
        },
        message: `Found ${requests.length} credit request(s)`
      });
    } catch (error) {
      console.error('Error fetching all requests:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch credit requests'
      });
    }
  }

  /**
   * APPROVE PENDING CREDIT REQUEST
   */
  async approveRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { request_id } = req.params;
      const { approval_notes } = req.body;

      const result = await creditRequestService.approveCreditRequest(
        request_id,
        req.user.user_id,
        approval_notes
      );

      return res.status(200).json({
        success: true,
        data: result,
        message: result.message
      });
    } catch (error) {
      console.error('Error approving credit request:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to approve credit request'
      });
    }
  }

  /**
   * REJECT PENDING CREDIT REQUEST
   */
  async rejectRequest(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { request_id } = req.params;
      const { rejection_notes } = req.body;

      const result = await creditRequestService.rejectCreditRequest(
        request_id,
        req.user.user_id,
        rejection_notes
      );

      return res.status(200).json({
        success: true,
        data: result,
        message: result.message
      });
    } catch (error) {
      console.error('Error rejecting credit request:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to reject credit request'
      });
    }
  }

  /**
   * GET SESSION CREDIT REQUESTS
   * (All types: pending + auto-approved)
   */
  async getSessionRequests(req, res) {
    try {
      const { session_id } = req.params;

      const requests = await creditRequestService.getSessionRequests(session_id);

      const pendingCount = requests.filter(r => r.request_status === 'pending').length;
      const approvedCount = requests.filter(r => r.request_status === 'approved').length;
      const rejectedCount = requests.filter(r => r.request_status === 'rejected').length;

      return res.status(200).json({
        success: true,
        data: requests,
        summary: {
          total: requests.length,
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount
        }
      });
    } catch (error) {
      console.error('Error fetching session requests:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch session requests'
      });
    }
  }

  /**
   * GET SPECIFIC CREDIT REQUEST DETAILS
   */
  async getRequestDetails(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { request_id } = req.params;

      const details = await creditRequestService.getRequestDetails(request_id);

      return res.status(200).json({
        success: true,
        data: details
      });
    } catch (error) {
      console.error('Error fetching request details:', error);
      return res.status(404).json({
        success: false,
        message: error.message || 'Request not found'
      });
    }
  }

  /**
   * GET CREDIT REQUEST STATISTICS
   */
  async getStats(req, res) {
    try {
      const { session_id } = req.params;

      // Get all requests for session
      const allRequests = await creditRequestService.getSessionRequests(session_id);
      
      // Get pending only
      const pendingRequests = await creditRequestService.getPendingRequests(session_id);
      
      // Get auto-approved only
      const autoApprovedRequests = await creditRequestService.getAutoApprovedRequests(session_id);

      // Calculate totals
      const totalRequested = allRequests.reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0);
      const pendingAmount = pendingRequests.reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0);
      const autoApprovedAmount = autoApprovedRequests.reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0);

      return res.status(200).json({
        success: true,
        data: {
          summary: {
            total_requests: allRequests.length,
            total_amount_requested: totalRequested,
            approval_breakdown: {
              pending: pendingRequests.length,
              pending_amount: pendingAmount,
              auto_approved: autoApprovedRequests.length,
              auto_approved_amount: autoApprovedAmount,
              rejected: allRequests.filter(r => r.request_status === 'rejected').length
            }
          },
          pending_requests: pendingRequests,
          auto_approved_requests: autoApprovedRequests
        }
      });
    } catch (error) {
      console.error('Error fetching statistics:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch statistics'
      });
    }
  }

  /**
   * ✅ NEW: Get all players with chip holdings in a session
   * GET /api/credit/player-chip-holdings
   */
  async getPlayerChipHoldings(req, res) {
    try {
      const { session_id } = req.query;

      if (!session_id) {
        return res.status(400).json({
          success: false,
          message: 'session_id is required'
        });
      }

      const holdings = await creditRequestService.getPlayerChipHoldingsBySession(session_id);

      return res.json({
        success: true,
        message: 'Player chip holdings retrieved',
        data: holdings
      });
    } catch (error) {
      console.error('Error getting player chip holdings:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get player chip holdings'
      });
    }
  }

  /**
   * ✅ NEW: Get single player's chip details in a session
   * GET /api/credit/player-chips/:player_id
   */
  async getPlayerChipDetail(req, res) {
    try {
      const { player_id } = req.params;
      const { session_id } = req.query;

      if (!session_id) {
        return res.status(400).json({
          success: false,
          message: 'session_id is required'
        });
      }

      const detail = await creditRequestService.getPlayerChipDetail(player_id, session_id);

      return res.json({
        success: true,
        message: 'Player chip detail retrieved',
        data: detail
      });
    } catch (error) {
      console.error('Error getting player chip detail:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get player chip detail'
      });
    }
  }
}

module.exports = new CreditRequestController();