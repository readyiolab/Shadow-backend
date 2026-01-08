// modules/credit/services/creditRequest.service.js
// ✅ UPDATED - With Chip Breakdown Support + Player Credit Limit Enforcement

const db = require('../../../config/database');
const cashierService = require('../../cashier/services/cashier.service');
const transactionService = require('../../transcation/services/transaction.service'); 
const playerService = require('../../player/services/player.service');
const playerCreditService = require('./player-credit.service');
// const whatsappService = require('../../../services/whatsapp.service'); // ✅ DISABLED: WhatsApp service removed

class CreditRequestService {
  
  /**
   * SMART CREDIT REQUEST with CHIP BREAKDOWN
   * Logic:
   * 1. Check CASHIER CREDIT LIMIT first
   *    If requested_amount > cashier_limit → SEND TO ADMIN (needs approval)
   * 2. If within cashier limit:
   *    If requested_amount <= available_float → AUTO APPROVE (instant credit)
   *    If requested_amount > available_float → SEND TO ADMIN (needs approval)
   */
  async createCreditRequest(data, cashierId) {
    try {
      const session = await cashierService.getTodaySession();
      
      if (session.is_closed) {
        throw new Error('Cannot create credit request. Session is closed.');
      }

      // Get or create player
      let playerId = data.player_id;
      if (!playerId) {
        if (data.phone_number) {
          try {
            const player = await playerService.getPlayerByPhone(data.phone_number);
            playerId = player.player_id;
          } catch (error) {
            const newPlayer = await playerService.createPlayer({
              player_name: data.player_name,
              phone_number: data.phone_number,
              player_type: 'occasional'
            }, cashierId);
            playerId = newPlayer.player_id;
          }
        } else if (data.player_name) {
          const newPlayer = await playerService.createPlayer({
            player_name: data.player_name,
            player_type: 'occasional'
          }, cashierId);
          playerId = newPlayer.player_id;
        } else {
          throw new Error('Player information required');
        }
      }

      const player = await playerService.getPlayer(playerId);

      // ✅ Ensure player_name is available (fallback to data if getPlayer() didn't return it)
      if (!player.player_name && data.player_name) {
        player.player_name = data.player_name;
      }

      // ✅ VALIDATE CHIP BREAKDOWN (Required for tracking)
      if (!data.chip_breakdown) {
        throw new Error('Chip breakdown is required. Please specify which chips to give for credit.');
      }

      const requestedAmount = parseFloat(data.requested_amount);
      const chipsAmount = parseFloat(data.chips_amount || requestedAmount);

      // Validate chip breakdown matches amount
      cashierService.validateChipBreakdown(data.chip_breakdown, chipsAmount);

      // ✅ SIMPLE CREDIT LIMIT RULE: Player can only take credit up to their limit
      // Credit limit is set by cashier/admin for each player
      const creditCheck = await playerCreditService.canPlayerGetCredit(playerId, requestedAmount);
      if (!creditCheck.allowed) {
        throw new Error(creditCheck.reason);
      }

      // Get player's available credit
      const playerAvailableCredit = creditCheck.available || creditCheck.status?.available_credit || 0;
      const playerCreditLimit = parseFloat(player.credit_limit_personal || player.credit_limit || 0);
      const totalOutstanding = creditCheck.status?.total_outstanding || 0;

      // ✅ STRICT ENFORCEMENT: Requested amount must not exceed available credit
      if (requestedAmount > playerAvailableCredit) {
        throw new Error(
          `Cannot issue ₹${requestedAmount} credit. Player has ₹${totalOutstanding} outstanding credit. ` +
          `Credit limit: ₹${playerCreditLimit}. Available credit: ₹${playerAvailableCredit}. ` +
          `Please settle outstanding credit first or request a smaller amount.`
        );
      }

      // ✅ DEBUG: Log credit limit calculation
      console.log('🔍 Credit Limit Check:', {
        playerCreditLimit,
        totalOutstanding,
        playerAvailableCredit,
        requestedAmount,
        canIssue: requestedAmount <= playerAvailableCredit
      });

      // ✅ CHECK CHIP INVENTORY AVAILABILITY (Required for credit issuance)
      // transactionService is already imported at the top of the file
      let chipsAvailable = true;
      let chipInventoryError = null;
      try {
        await transactionService.validateChipInventoryAvailable(session.session_id, data.chip_breakdown);
      } catch (chipError) {
        chipsAvailable = false;
        chipInventoryError = chipError.message;
      }

      // ✅ CALCULATE AVAILABLE FUNDS (Primary + Secondary Wallets) - For informational purposes only
      const dashboardData = await cashierService.getDashboardData();
      const primaryAvailable = dashboardData.wallets.primary.current || 0;
      const secondaryAvailable = dashboardData.wallets.secondary.current || 0;
      const outstandingCredit = dashboardData.outstanding_credit || 0;
      const availableFunds = (primaryAvailable + secondaryAvailable) - outstandingCredit;

      // ✅ SMART LOGIC: Auto-approve if chips are available
      // Credit doesn't require cash upfront - it's given on credit
      // Only check: player credit limit ✓, cashier credit limit ✓, chips available ✓
      if (chipsAvailable) {
        // ✅ AUTO-APPROVE: Player has credit limit, cashier has limit, chips are available
        return await this.instantApproveCredit(
          session,
          playerId,
          player,
          requestedAmount,
          chipsAmount,
          availableFunds,
          data,
          cashierId
        );
      } else {
        // ✅ SEND TO ADMIN: Chips not available in inventory
        return await this.createPendingCreditRequest(
          session,
          playerId,
          player,
          requestedAmount,
          chipsAmount,
          availableFunds,
          data,
          cashierId,
          chipInventoryError || 'Insufficient chips in inventory'
        );
      }
    } catch (error) {
      console.error('Error in createCreditRequest:', error);
      throw error;
    }
  }

  /**
   * SCENARIO 1: AUTO APPROVE CREDIT with CHIP BREAKDOWN
   */
  async instantApproveCredit(session, playerId, player, requestedAmount, chipsAmount, availableFunds, data, cashierId) {
    try {
      // Create credit request record
      const requestResult = await db.insert('tbl_credit_requests', {
        session_id: session.session_id,
        player_id: playerId,
        player_name: player.player_name,
        requested_amount: requestedAmount,
        chips_amount: chipsAmount,
        
        // ✅ Store chip breakdown in request
        chips_100: data.chip_breakdown.chips_100 || 0,
        chips_500: data.chip_breakdown.chips_500 || 0,
        chips_1000: data.chip_breakdown.chips_1000 || 0,
        chips_5000: data.chip_breakdown.chips_5000 || 0,
        chips_10000: data.chip_breakdown.chips_10000 || 0,
        
        request_status: 'approved',
        approval_type: 'auto',
        requested_by: cashierId,
        approved_by: cashierId,
        approval_notes: `Auto-approved - Available funds: ₹${availableFunds}. Chips: ${this.formatChipBreakdown(data.chip_breakdown)}`,
        whatsapp_sent: 0,
        created_at: new Date(),
        processed_at: new Date()
      });

      const requestId = requestResult.insert_id;

      // ✅ USE TRANSACTION SERVICE to issue credit with chip breakdown
      const result = await transactionService.issueCredit({
        player_id: playerId,
        player_name: player.player_name,
        credit_amount: requestedAmount,
        chips_amount: chipsAmount,
        chip_breakdown: data.chip_breakdown,  // ✅ Pass chip breakdown
        credit_request_id: requestId,
        notes: data.notes || `Auto-approved credit request #${requestId}. Chips: ${this.formatChipBreakdown(data.chip_breakdown)}`
      }, cashierId);

      return {
        request_id: requestId,
        transaction_id: result.transaction_id,
        status: 'approved',
        approval_type: 'instant',
        message: `✅ Credit instantly approved! ${player.player_name} received ${chipsAmount} chips on credit (${this.formatChipBreakdown(data.chip_breakdown)})`,
        details: {
          player_name: player.player_name,
          credit_amount: requestedAmount,
          chips_amount: chipsAmount,
          chip_breakdown: data.chip_breakdown,
          available_funds: availableFunds,
          approved_by: 'System (Auto-Approved)',
          approval_reason: 'Player has available credit limit and chips are available in inventory'
        }
      };
    } catch (error) {
      console.error('Error in instantApproveCredit:', error);
      throw error;
    }
  }

  /**
   * SCENARIO 2: PENDING CREDIT REQUEST (Need Admin Approval)
   */
  async createPendingCreditRequest(
    session,
    playerId,
    player,
    requestedAmount,
    chipsAmount,
    availableFunds,
    data,
    cashierId,
    reason = null
  ) {
    try {
      const shortfall = requestedAmount - availableFunds;
      const pendingReason = reason || `Insufficient funds. Need ₹${shortfall} more.`;

      const requestResult = await db.insert('tbl_credit_requests', {
        session_id: session.session_id,
        player_id: playerId,
        player_name: player.player_name,
        requested_amount: requestedAmount,
        chips_amount: chipsAmount,
        
        // ✅ Store chip breakdown in request
        chips_100: data.chip_breakdown.chips_100 || 0,
        chips_500: data.chip_breakdown.chips_500 || 0,
        chips_1000: data.chip_breakdown.chips_1000 || 0,
        chips_5000: data.chip_breakdown.chips_5000 || 0,
        chips_10000: data.chip_breakdown.chips_10000 || 0,
        
        request_status: 'pending',
        approval_type: null,
        requested_by: cashierId,
        approved_by: null,
        approval_notes: null,
        whatsapp_sent: 0,
        created_at: new Date()
      });

      const requestId = requestResult.insert_id;

      // ✅ DISABLED: WhatsApp notification removed
      // Send WhatsApp notification to admin
      // try {
      //   await whatsappService.sendCreditRequestNotification({
      //     request_id: requestId,
      //     player_name: player.player_name,
      //     requested_amount: requestedAmount,
      //     chips_breakdown: this.formatChipBreakdown(data.chip_breakdown),
      //     available_funds: availableFunds,
      //     shortfall: shortfall,
      //     session_date: session.session_date,
      //     urgent: true
      //   });

      //   await db.update('tbl_credit_requests', {
      //     whatsapp_sent: 1,
      //     whatsapp_sent_at: new Date()
      //   }, 'request_id = ?', [requestId]);
      // } catch (error) {
      //   console.error('Failed to send WhatsApp notification:', error);
      // }

      return {
        request_id: requestId,
        status: 'pending',
        approval_type: 'admin_required',
        message: `⏳ Credit request sent to admin for approval. Waiting for decision...`,
        details: {
          player_name: player.player_name,
          requested_amount: requestedAmount,
          chips_amount: chipsAmount,
          chip_breakdown: data.chip_breakdown,
          available_funds: availableFunds,
          shortfall: shortfall,
          admin_notification_sent: true,
          reason: pendingReason
        }
      };
    } catch (error) {
      console.error('Error in createPendingCreditRequest:', error);
      throw error;
    }
  }

  /**
   * Approve pending credit request (by admin)
   */
  async approveCreditRequest(requestId, adminId, approvalNotes = null) {
    try {
      const request = await db.select(
        'tbl_credit_requests',
        '*',
        'request_id = ?',
        [requestId]
      );

      if (!request) {
        throw new Error('Credit request not found');
      }

      if (request.request_status !== 'pending') {
        throw new Error(`Credit request already ${request.request_status}`);
      }

      // ✅ CHECK PLAYER'S PERSONAL CREDIT LIMIT BEFORE APPROVING
      const creditCheck = await playerCreditService.canPlayerGetCredit(
        request.player_id, 
        parseFloat(request.requested_amount)
      );
      if (!creditCheck.allowed) {
        throw new Error(`Cannot approve: ${creditCheck.reason}`);
      }

      const session = await db.select(
        'tbl_daily_sessions',
        '*',
        'session_id = ?',
        [request.session_id]
      );

      if (session.is_closed) {
        throw new Error('Cannot approve credit. Session is closed.');
      }

      // Update request status to approved
      await db.update('tbl_credit_requests', {
        request_status: 'approved',
        approval_type: 'admin',
        approved_by: adminId,
        approval_notes: approvalNotes || 'Approved by admin',
        processed_at: new Date()
      }, 'request_id = ?', [requestId]);

      // ✅ USE TRANSACTION SERVICE to issue credit WITH chip breakdown from request
      const chipBreakdown = {
        chips_100: request.chips_100 || 0,
        chips_500: request.chips_500 || 0,
        chips_1000: request.chips_1000 || 0,
        chips_5000: request.chips_5000 || 0,
        chips_10000: request.chips_10000 || 0
      };

      const result = await transactionService.issueCredit({
        player_id: request.player_id,
         player_name: request.player_name,
        credit_amount: request.requested_amount,
        chips_amount: request.chips_amount,
        chip_breakdown: chipBreakdown,  // ✅ Use stored chip breakdown
        credit_request_id: requestId,
        notes: `Admin-approved credit request #${requestId}${approvalNotes ? ': ' + approvalNotes : ''}. Chips: ${this.formatChipBreakdown(chipBreakdown)}`
      }, adminId);

      return {
        request_id: requestId,
        transaction_id: result.transaction_id,
        status: 'approved',
        approval_type: 'admin',
        chip_breakdown: chipBreakdown,
        message: `Credit approved and issued to player by admin. Chips: ${this.formatChipBreakdown(chipBreakdown)}`
      };
    } catch (error) {
      console.error('Error in approveCreditRequest:', error);
      throw error;
    }
  }

  /**
   * Reject credit request (by admin)
   */
  async rejectCreditRequest(requestId, adminId, rejectionNotes = null) {
    try {
      const request = await db.select(
        'tbl_credit_requests',
        '*',
        'request_id = ?',
        [requestId]
      );

      if (!request) {
        throw new Error('Credit request not found');
      }

      if (request.request_status !== 'pending') {
        throw new Error(`Credit request already ${request.request_status}`);
      }

      await db.update('tbl_credit_requests', {
        request_status: 'rejected',
        approved_by: adminId,
        approval_notes: rejectionNotes || 'Rejected by admin',
        processed_at: new Date()
      }, 'request_id = ?', [requestId]);

      return {
        request_id: requestId,
        status: 'rejected',
        message: 'Credit request rejected'
      };
    } catch (error) {
      console.error('Error in rejectCreditRequest:', error);
      throw error;
    }
  }

  /**
   * Get all pending credit requests
   */
  async getPendingRequests(sessionId = null) {
    try {
      let whereClause = 'request_status = ?';
      let params = ['pending'];

      if (sessionId) {
        whereClause += ' AND session_id = ?';
        params.push(sessionId);
      }

      const requests = await db.selectAll(
        'tbl_credit_requests',
        '*',
        whereClause,
        params,
        'ORDER BY request_id DESC'
      );

      return (requests || []).map(req => ({
        ...req,
        chip_breakdown: {
          chips_100: req.chips_100 || 0,
          chips_500: req.chips_500 || 0,
          chips_1000: req.chips_1000 || 0,
          chips_5000: req.chips_5000 || 0,
          chips_10000: req.chips_10000 || 0
        },
        chip_breakdown_display: this.formatChipBreakdown({
          chips_100: req.chips_100,
          chips_500: req.chips_500,
          chips_1000: req.chips_1000,
          chips_5000: req.chips_5000,
          chips_10000: req.chips_10000
        })
      }));
    } catch (error) {
      console.error('Error in getPendingRequests:', error);
      throw error;
    }
  }

  /**
   * Get all auto-approved credit requests
   */
  async getAutoApprovedRequests(sessionId = null) {
    try {
      let whereClause = 'request_status = ? AND approval_type = ?';
      let params = ['approved', 'auto'];

      if (sessionId) {
        whereClause += ' AND session_id = ?';
        params.push(sessionId);
      }

      const requests = await db.selectAll(
        'tbl_credit_requests',
        '*',
        whereClause,
        params,
        'ORDER BY request_id DESC'
      );

      return (requests || []).map(req => ({
        ...req,
        chip_breakdown: {
          chips_100: req.chips_100 || 0,
          chips_500: req.chips_500 || 0,
          chips_1000: req.chips_1000 || 0,
          chips_5000: req.chips_5000 || 0,
          chips_10000: req.chips_10000 || 0
        },
        chip_breakdown_display: this.formatChipBreakdown({
          chips_100: req.chips_100,
          chips_500: req.chips_500,
          chips_1000: req.chips_1000,
          chips_5000: req.chips_5000,
          chips_10000: req.chips_10000
        })
      }));
    } catch (error) {
      console.error('Error in getAutoApprovedRequests:', error);
      throw error;
    }
  }

  /**
   * Get ALL credit requests (pending, approved, rejected) for admin view
   */
  async getAllRequests(sessionId = null) {
    try {
      let whereClause = '1=1';
      let params = [];

      if (sessionId) {
        whereClause += ' AND session_id = ?';
        params.push(sessionId);
      }

      const requests = await db.selectAll(
        'tbl_credit_requests',
        '*',
        whereClause,
        params,
        'ORDER BY request_id DESC'
      );

      return (requests || []).map(req => ({
        ...req,
        chip_breakdown: {
          chips_100: req.chips_100 || 0,
          chips_500: req.chips_500 || 0,
          chips_1000: req.chips_1000 || 0,
          chips_5000: req.chips_5000 || 0,
          chips_10000: req.chips_10000 || 0
        },
        chip_breakdown_display: this.formatChipBreakdown({
          chips_100: req.chips_100,
          chips_500: req.chips_500,
          chips_1000: req.chips_1000,
          chips_5000: req.chips_5000,
          chips_10000: req.chips_10000
        })
      }));
    } catch (error) {
      console.error('Error in getAllRequests:', error);
      throw error;
    }
  }

  /**
   * Get session credit requests
   */
  async getSessionRequests(sessionId) {
    try {
      const requests = await db.selectAll(
        'tbl_credit_requests',
        '*',
        'session_id = ?',
        [sessionId],
        'ORDER BY request_id DESC'
      );

      return (requests || []).map(req => ({
        ...req,
        chip_breakdown: {
          chips_100: req.chips_100 || 0,
          chips_500: req.chips_500 || 0,
          chips_1000: req.chips_1000 || 0,
          chips_5000: req.chips_5000 || 0,
          chips_10000: req.chips_10000 || 0
        },
        chip_breakdown_display: this.formatChipBreakdown({
          chips_100: req.chips_100,
          chips_500: req.chips_500,
          chips_1000: req.chips_1000,
          chips_5000: req.chips_5000,
          chips_10000: req.chips_10000
        })
      }));
    } catch (error) {
      console.error('Error in getSessionRequests:', error);
      throw error;
    }
  }

  /**
   * Get credit request details
   */
  async getRequestDetails(requestId) {
    try {
      const request = await db.select(
        'tbl_credit_requests',
        '*',
        'request_id = ?',
        [requestId]
      );

      if (!request) {
        throw new Error('Credit request not found');
      }

      const player = await playerService.getPlayer(request.player_id);
      const cashier = await db.select(
        'tbl_users',
        'user_id, username, full_name',
        'user_id = ?',
        [request.requested_by]
      );

      let approver = null;
      if (request.approved_by) {
        approver = await db.select(
          'tbl_users',
          'user_id, username, full_name',
          'user_id = ?',
          [request.approved_by]
        );
      }

      return {
        ...request,
        player,
        cashier,
        approver,
        chip_breakdown: {
          chips_100: request.chips_100 || 0,
          chips_500: request.chips_500 || 0,
          chips_1000: request.chips_1000 || 0,
          chips_5000: request.chips_5000 || 0,
          chips_10000: request.chips_10000 || 0
        },
        chip_breakdown_display: this.formatChipBreakdown({
          chips_100: request.chips_100,
          chips_500: request.chips_500,
          chips_1000: request.chips_1000,
          chips_5000: request.chips_5000,
          chips_10000: request.chips_10000
        })
      };
    } catch (error) {
      console.error('Error in getRequestDetails:', error);
      throw error;
    }
  }

  async getStats(sessionId) {
    try {
      const requests = await this.getSessionRequests(sessionId);
      
      const stats = {
        total: requests.length,
        pending: requests.filter(r => r.request_status === 'pending').length,
        approved: requests.filter(r => r.request_status === 'approved').length,
        rejected: requests.filter(r => r.request_status === 'rejected').length,
        auto_approved: requests.filter(r => r.approval_type === 'auto').length,
        admin_approved: requests.filter(r => r.approval_type === 'admin').length,
        total_amount_requested: requests.reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0),
        total_amount_approved: requests
          .filter(r => r.request_status === 'approved')
          .reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0),
        total_amount_pending: requests
          .filter(r => r.request_status === 'pending')
          .reduce((sum, r) => sum + parseFloat(r.requested_amount || 0), 0)
      };

      return stats;
    } catch (error) {
      console.error('Error in getStats:', error);
      throw error;
    }
  }

  /**
   * ✅ NEW: Get all players with chip holdings in a session
   */
  async getPlayerChipHoldingsBySession(sessionId) {
    try {
      // Query: Get credit data with player info from tbl_credits
      const sql = `
        SELECT 
          p.player_id,
          p.player_name,
          p.phone_number,
          c.session_id,
          c.credit_id,
          c.credit_issued,
          c.credit_settled,
          c.credit_outstanding,
          c.chips_100,
          c.chips_500,
          c.chips_5000,
          c.chips_10000,
          c.is_fully_settled,
          c.created_at,
          c.issued_at
        FROM tbl_credits c
        JOIN tbl_players p ON c.player_id = p.player_id
        WHERE c.session_id = ?
        ORDER BY c.credit_id DESC
      `;

      const results = await db.queryAll(sql, [sessionId]);
      
      // Map fields to match frontend expectations
      return (results || []).map(r => ({
        player_id: r.player_id,
        player_name: r.player_name,
        phone_number: r.phone_number,
        session_id: r.session_id,
        credit_id: r.credit_id,
        // Map to expected field names
        issued_amount: parseFloat(r.credit_issued) || 0,
        current_chip_balance: parseFloat(r.credit_outstanding) || 0,
        credit_settled: parseFloat(r.credit_settled) || 0,
        is_fully_settled: r.is_fully_settled,
        last_updated: r.issued_at || r.created_at,
        chip_breakdown: {
          chips_100: r.chips_100 || 0,
          chips_500: r.chips_500 || 0,
          chips_5000: r.chips_5000 || 0,
          chips_10000: r.chips_10000 || 0
        }
      }));
    } catch (error) {
      console.error('Error in getPlayerChipHoldingsBySession:', error);
      throw error;
    }
  }

  /**
   * ✅ NEW: Get single player's chip holding details
   */
  async getPlayerChipDetail(playerId, sessionId) {
    try {
      const sql = `
        SELECT 
          p.player_id,
          p.player_name,
          p.phone_number,
          c.session_id,
          c.credit_id,
          c.credit_issued,
          c.credit_settled,
          c.credit_outstanding,
          c.chips_100,
          c.chips_500,
          c.chips_5000,
          c.chips_10000,
          c.is_fully_settled,
          c.created_at,
          c.issued_at,
          cr.requested_amount,
          cr.request_status,
          cr.approval_type,
          cr.created_at as request_created_at
        FROM tbl_credits c
        JOIN tbl_players p ON c.player_id = p.player_id
        LEFT JOIN tbl_credit_requests cr ON c.credit_request_id = cr.request_id
        WHERE c.player_id = ? AND c.session_id = ?
        ORDER BY c.credit_id DESC
        LIMIT 1
      `;

      const result = await db.query(sql, [playerId, sessionId]);
      
      if (!result) {
        return null;
      }
      
      return {
        player_id: result.player_id,
        player_name: result.player_name,
        phone_number: result.phone_number,
        session_id: result.session_id,
        credit_id: result.credit_id,
        // Map to expected field names
        issued_amount: parseFloat(result.credit_issued) || 0,
        current_chip_balance: parseFloat(result.credit_outstanding) || 0,
        credit_settled: parseFloat(result.credit_settled) || 0,
        is_fully_settled: result.is_fully_settled,
        last_updated: result.issued_at || result.created_at,
        requested_amount: result.requested_amount,
        request_status: result.request_status,
        approval_type: result.approval_type,
        chip_breakdown: {
          chips_100: result.chips_100 || 0,
          chips_500: result.chips_500 || 0,
          chips_5000: result.chips_5000 || 0,
          chips_10000: result.chips_10000 || 0
        }
      };
    } catch (error) {
      console.error('Error in getPlayerChipDetail:', error);
      throw error;
    }
  }

  /**
   * ✅ FIXED: Get total credit already issued in this session
   * Count from tbl_credits (actual issued credits) not just requests
   */
  async getTotalCreditIssuedInSession(sessionId) {
    try {
      // Count actual credits issued (from tbl_credits table)
      const creditsSql = `
        SELECT COALESCE(SUM(credit_issued), 0) as total
        FROM tbl_credits
        WHERE session_id = ?
      `;
      const creditsResult = await db.query(creditsSql, [sessionId]);
      const creditsTotal = parseFloat(creditsResult?.total || 0);

      return creditsTotal;
    } catch (error) {
      console.error('Error getting total credit issued:', error);
      return 0; // Default to 0 if error
    }
  }

  /**
   * Helper: Format chip breakdown for display
   */
  formatChipBreakdown(breakdown) {
    if (!breakdown) return 'No chips';
    
    const parts = [];
    if (breakdown.chips_100) parts.push(`${breakdown.chips_100}×₹100`);
    if (breakdown.chips_500) parts.push(`${breakdown.chips_500}×₹500`);
    if (breakdown.chips_1000) parts.push(`${breakdown.chips_1000}×₹1K`);
    if (breakdown.chips_5000) parts.push(`${breakdown.chips_5000}×₹5000`);
    if (breakdown.chips_10000) parts.push(`${breakdown.chips_10000}×₹10000`);
    return parts.length > 0 ? parts.join(', ') : 'No chips';
  }
}

module.exports = new CreditRequestService();