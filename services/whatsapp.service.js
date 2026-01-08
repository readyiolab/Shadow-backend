const axios = require('axios');
const db = require('../config/database');

class WhatsAppService {
  constructor() {
    // WhatsApp Business API Configuration
    this.apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
    this.webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;

    // Validate required config
    if (!this.phoneNumberId || !this.accessToken) {
      console.warn('⚠️ WhatsApp config incomplete - notifications will fail');
    }
  }

  /**
   * Send credit request notification with interactive buttons
   */
  async sendCreditRequestNotification(data) {
    const message = `🔔 *New Credit Request*

📋 Request ID: #${data.request_id}
👤 Player: ${data.player_name}
💰 Amount: ₹${this.formatAmount(data.requested_amount)}
📊 Available Float: ₹${this.formatAmount(data.available_float)}
📅 Date: ${data.session_date}

${data.requested_amount > data.available_float ? '⚠️ *WARNING: Request exceeds available float!*' : '✅ Float is sufficient'}`;

    // Create interactive buttons
    const interactiveMessage = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: this.adminPhone,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: message
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: `approve_${data.request_id}`,
                title: "✅ Approve"
              }
            },
            {
              type: "reply",
              reply: {
                id: `reject_${data.request_id}`,
                title: "❌ Reject"
              }
            }
          ]
        }
      }
    };

    return await this.sendInteractiveMessage(interactiveMessage, 'credit_request', data.request_id);
  }

  /**
   * Send interactive message with buttons
   */
  async sendInteractiveMessage(messagePayload, notificationType, referenceId) {
    let logId = null;
    try {
      // Log notification attempt
      logId = await this.logNotification(
        notificationType, 
        referenceId, 
        this.adminPhone, 
        JSON.stringify(messagePayload)
      );

      console.log(`📤 Sending interactive message (log: ${logId})...`);

      // Send via WhatsApp Business API
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        messagePayload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      // Update notification log as sent
      await db.update('tbl_whatsapp_notifications', {
        status: 'sent',
        response_data: JSON.stringify(response.data),
        sent_at: new Date()
      }, 'notification_id = ?', [logId]);

      console.log(`✅ Message sent successfully (WhatsApp ID: ${response.data.messages[0].id})`);

      return {
        success: true,
        message: 'WhatsApp notification sent successfully',
        notification_id: logId,
        whatsapp_message_id: response.data.messages[0].id
      };

    } catch (error) {
      console.error('❌ WhatsApp send error:', error.message);

      // Log as failed
      if (logId) {
        try {
          await db.update('tbl_whatsapp_notifications', {
            status: 'failed',
            response_data: JSON.stringify({ error: error.message })
          }, 'notification_id = ?', [logId]);
        } catch (updateError) {
          console.error('Failed to update notification log:', updateError);
        }
      }

      throw new Error(`Failed to send WhatsApp notification: ${error.message}`);
    }
  }

  /**
   * Send simple text message (for confirmations)
   */
  async sendTextMessage(phone, messageText, notificationType, referenceId) {
    let logId = null;
    try {
      logId = await this.logNotification(notificationType, referenceId, phone, messageText);

      const messagePayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: {
          body: messageText
        }
      };

      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        messagePayload,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      await db.update('tbl_whatsapp_notifications', {
        status: 'sent',
        response_data: JSON.stringify(response.data),
        sent_at: new Date()
      }, 'notification_id = ?', [logId]);

      return {
        success: true,
        message: 'Message sent successfully'
      };

    } catch (error) {
      console.error('❌ WhatsApp send error:', error.message);
      
      if (logId) {
        try {
          await db.update('tbl_whatsapp_notifications', {
            status: 'failed',
            response_data: JSON.stringify({ error: error.message })
          }, 'notification_id = ?', [logId]);
        } catch (updateError) {
          console.error('Failed to update notification log:', updateError);
        }
      }

      throw error;
    }
  }

  /**
   * Send approval confirmation
   */
  async sendApprovalConfirmation(data) {
    const message = `✅ *Credit Approved*

Request #${data.request_id} has been approved.
Player: ${data.player_name}
Amount: ₹${this.formatAmount(data.amount)}

Credit has been issued to the player.`;

    return await this.sendTextMessage(
      this.adminPhone, 
      message, 
      'approval_confirmation', 
      data.request_id
    );
  }

  /**
   * Send rejection confirmation
   */
  async sendRejectionConfirmation(data) {
    const message = `❌ *Credit Rejected*

Request #${data.request_id} has been rejected.
Player: ${data.player_name}
Amount: ₹${this.formatAmount(data.amount)}

${data.reason || 'Insufficient float or other reasons.'}`;

    return await this.sendTextMessage(
      this.adminPhone, 
      message, 
      'rejection_confirmation', 
      data.request_id
    );
  }

  /**
   * Send session closed notification
   */
  async sendSessionClosedNotification(data) {
    const message = `✅ *Daily Session Closed*

📅 Date: ${data.session_date}
💼 Owner Float: ₹${this.formatAmount(data.owner_float)}
💰 Closing Float: ₹${this.formatAmount(data.closing_float)}
📈 Net P/L: ₹${this.formatAmount(data.net_profit_loss)} ${data.net_profit_loss >= 0 ? '📈' : '📉'}

📊 Summary:
• Deposits: ₹${this.formatAmount(data.total_deposits)}
• Withdrawals: ₹${this.formatAmount(data.total_withdrawals)}
• Expenses: ₹${this.formatAmount(data.total_expenses)}
• Outstanding Credit: ₹${this.formatAmount(data.outstanding_credit)}
• Players: ${data.total_players}
• Transactions: ${data.total_transactions}`;

    return await this.sendTextMessage(
      this.adminPhone, 
      message, 
      'session_closed', 
      data.session_id
    );
  }

  /**
   * Log notification to database
   */
  async logNotification(notificationType, referenceId, phone, messageText) {
    try {
      const result = await db.insert('tbl_whatsapp_notifications', {
        notification_type: notificationType,
        reference_id: referenceId,
        recipient_phone: phone,
        message_text: messageText,
        status: 'pending',
        created_at: new Date()
      });

      return result.insert_id;
    } catch (error) {
      console.error('Failed to log notification:', error);
      throw error;
    }
  }

  /**
   * Format amount for display
   */
  formatAmount(amount) {
    return parseFloat(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}

module.exports = new WhatsAppService();