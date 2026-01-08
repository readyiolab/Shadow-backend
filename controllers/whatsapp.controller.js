const creditRequestService = require('../modules/credit/services/creditRequest.service');
const whatsappService = require('../services/whatsapp.service');
const { sendSuccess } = require('../utils/response.util');
const { logAudit } = require('../utils/logger.util');

class WhatsAppController {
  
  /**
   * Webhook verification (required by WhatsApp)
   */
  verifyWebhook(req, res) {
    try {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'your_verify_token';

      console.log('Webhook verification attempt:', { mode, token: token ? '***' : 'missing', challenge: challenge ? '✓' : 'missing' });

      if (mode === 'subscribe' && token === verifyToken) {
        console.log('✅ Webhook verified successfully');
        return res.status(200).send(challenge);
      }

      console.log('❌ Webhook verification failed');
      return res.status(403).json({ error: 'Forbidden' });
    } catch (error) {
      console.error('Webhook verification error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Handle incoming WhatsApp messages and button clicks
   */
  async handleWebhook(req, res, next) {
    try {
      const body = req.body;

      // Log incoming webhook
      console.log('📨 Webhook received:', JSON.stringify(body, null, 2));

      // Quickly respond to WhatsApp (must be within 20 seconds)
      res.status(200).json({ status: 'received' });

      // Process the webhook asynchronously
      if (body.object === 'whatsapp_business_account') {
        const entries = body.entry || [];

        for (const entry of entries) {
          const changes = entry.changes || [];

          for (const change of changes) {
            if (change.field === 'messages') {
              const messages = change.value?.messages || [];

              if (messages.length > 0) {
                for (const message of messages) {
                  try {
                    await this.processMessage(message);
                  } catch (error) {
                    console.error('Error processing individual message:', error);
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
      // Already responded with 200, so just log the error
    }
  }

  /**
   * Process individual message
   */
  async processMessage(message) {
    try {
      const messageType = message.type;
      const from = message.from;

      console.log(`📬 Processing message type: ${messageType} from ${from}`);

      // Only process interactive button replies
      if (messageType === 'interactive') {
        const buttonReply = message.interactive?.button_reply;
        
        if (!buttonReply) {
          console.warn('No button reply found in interactive message');
          return;
        }

        const buttonId = buttonReply.id;
        console.log(`🔘 Button clicked: ${buttonId} by ${from}`);

        // Parse button ID (format: approve_123 or reject_123)
        const [action, requestId] = buttonId.split('_');

        if (!requestId || !['approve', 'reject'].includes(action)) {
          console.error('Invalid button ID format:', buttonId);
          return;
        }

        // Get the credit request details first
        let requestDetails;
        try {
          requestDetails = await creditRequestService.getRequestDetails(parseInt(requestId));
        } catch (error) {
          console.error(`Error fetching request details for ${requestId}:`, error);
          return;
        }

        if (!requestDetails) {
          console.error(`Credit request ${requestId} not found`);
          return;
        }

        // Find admin user (assuming phone number matches)
        let adminUser;
        try {
          adminUser = await this.getAdminByPhone(from);
        } catch (error) {
          console.error(`Error fetching admin for phone ${from}:`, error);
          return;
        }

        if (!adminUser) {
          console.error(`Admin user not found for phone: ${from}`);
          try {
            await whatsappService.sendTextMessage(
              from,
              '❌ Error: Your phone number is not registered as admin.',
              'error',
              requestId
            );
          } catch (error) {
            console.error('Failed to send error message:', error);
          }
          return;
        }

        // Process approval or rejection
        if (action === 'approve') {
          await this.handleApproval(requestId, adminUser.user_id, requestDetails, from);
        } else if (action === 'reject') {
          await this.handleRejection(requestId, adminUser.user_id, requestDetails, from);
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  /**
   * Handle credit approval via WhatsApp button
   */
  async handleApproval(requestId, adminId, requestDetails, fromPhone) {
    try {
      // Approve the credit request
      const result = await creditRequestService.approveCreditRequest(
        requestId,
        adminId,
        'Approved via WhatsApp'
      );

      // Log audit
      try {
        await logAudit(
          adminId,
          'APPROVE_CREDIT_REQUEST_WHATSAPP',
          'tbl_credit_requests',
          requestId,
          null,
          { approved_via: 'whatsapp', button_clicked: true },
          fromPhone
        );
      } catch (error) {
        console.error('Audit logging failed:', error);
      }

      // Send confirmation to admin
      await whatsappService.sendApprovalConfirmation({
        request_id: requestId,
        player_name: requestDetails.player_name,
        amount: requestDetails.requested_amount
      });

      console.log(`✅ Credit request ${requestId} approved by admin ${adminId}`);

    } catch (error) {
      console.error('Approval error:', error);
      
      // Send error message to admin
      try {
        await whatsappService.sendTextMessage(
          fromPhone,
          `❌ *Approval Failed*\n\nRequest #${requestId}\nError: ${error.message}`,
          'approval_error',
          requestId
        );
      } catch (sendError) {
        console.error('Failed to send approval error message:', sendError);
      }
    }
  }

  /**
   * Handle credit rejection via WhatsApp button
   */
  async handleRejection(requestId, adminId, requestDetails, fromPhone) {
    try {
      // Reject the credit request
      const result = await creditRequestService.rejectCreditRequest(
        requestId,
        adminId,
        'Rejected via WhatsApp'
      );

      // Log audit
      try {
        await logAudit(
          adminId,
          'REJECT_CREDIT_REQUEST_WHATSAPP',
          'tbl_credit_requests',
          requestId,
          null,
          { rejected_via: 'whatsapp', button_clicked: true },
          fromPhone
        );
      } catch (error) {
        console.error('Audit logging failed:', error);
      }

      // Send confirmation to admin
      await whatsappService.sendRejectionConfirmation({
        request_id: requestId,
        player_name: requestDetails.player_name,
        amount: requestDetails.requested_amount,
        reason: 'Rejected by admin via WhatsApp'
      });

      console.log(`❌ Credit request ${requestId} rejected by admin ${adminId}`);

    } catch (error) {
      console.error('Rejection error:', error);
      
      // Send error message to admin
      try {
        await whatsappService.sendTextMessage(
          fromPhone,
          `❌ *Rejection Failed*\n\nRequest #${requestId}\nError: ${error.message}`,
          'rejection_error',
          requestId
        );
      } catch (sendError) {
        console.error('Failed to send rejection error message:', sendError);
      }
    }
  }

  /**
   * Get admin user by phone number
   */
  async getAdminByPhone(phoneNumber) {
    const db = require('../config/database');
    
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Remove country code if present and format
    const cleanPhone = phoneNumber.replace(/^\+91/, '').replace(/^91/, '').trim();
    
    console.log(`🔍 Looking up admin with phone: ${cleanPhone}`);

    try {
      const admin = await db.select(
        'tbl_users',
        'user_id, username, full_name, role, phone_number',
        'phone_number = ? AND role = ? AND is_active = 1',
        [cleanPhone, 'admin']
      );

      if (admin && admin.length > 0) {
        console.log(`✅ Admin found: ${admin[0].username}`);
        return admin[0];
      }

      console.warn(`⚠️ No admin found for phone: ${cleanPhone}`);
      return null;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  /**
   * Manual test endpoint to simulate button click
   */
  async testButtonClick(req, res, next) {
    try {
      const { request_id, action } = req.body; // action: 'approve' or 'reject'

      if (!request_id || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid request_id or action' });
      }

      const requestDetails = await creditRequestService.getRequestDetails(request_id);

      if (!requestDetails) {
        return res.status(404).json({ error: 'Credit request not found' });
      }

      if (action === 'approve') {
        await this.handleApproval(request_id, req.user.user_id, requestDetails, req.ip);
      } else if (action === 'reject') {
        await this.handleRejection(request_id, req.user.user_id, requestDetails, req.ip);
      }

      return sendSuccess(res, `Credit request ${action}ed successfully`);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WhatsAppController();