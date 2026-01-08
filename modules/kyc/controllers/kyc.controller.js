// ============================================
// modules/kyc/controllers/kyc.controller.js
// UPDATED WITH DIGILOCKER - OPTION 2 (Mobile handles IDTO)
// ============================================
const kycService = require('../services/kyc.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');
const { logAudit } = require('../../../utils/logger.util');

class KYCController {
  // ============================================
  // DIGILOCKER KYC ENDPOINTS
  // ============================================

  // Check DigiLocker account (Player self-service)
  async checkAccount(req, res, next) {
    try {
      const { mobile } = req.body;
      
      console.log('📱 KYCController: checkAccount called with mobile:', mobile);
      
      if (!mobile) {
        return sendError(res, 'Mobile number is required', 400);
      }

      // Validate mobile number format (10 digits)
      const mobileRegex = /^[6-9]\d{9}$/;
      if (!mobileRegex.test(mobile)) {
        return sendError(res, 'Invalid mobile number format. Please enter a valid 10-digit mobile number.', 400);
      }

      const result = await kycService.verifyDigiLockerAccount(mobile);
      
      console.log('✅ KYCController: Account check result:', JSON.stringify(result, null, 2));
      
      return sendSuccess(res, 'Account check completed', result);
    } catch (error) {
      console.error('❌ KYCController: Error in checkAccount:', error);
      next(error);
    }
  }

  // Get KYC status (Player self-service)
  async getKYCSelf(req, res, next) {
    try {
      const playerId = req.player.player_id;
      
      if (!playerId) {
        return sendError(res, 'Player ID not found in token', 401);
      }
      
      const kyc = await kycService.getKYC(playerId);
      
      if (!kyc) {
        return sendSuccess(res, 'KYC record not found', { kyc_status: 'not_started' });
      }

      return sendSuccess(res, 'KYC details retrieved', kyc);
    } catch (error) {
      next(error);
    }
  }

  // ============================================
  // OPTION 2: Mobile handles IDTO, Backend stores data
  // ============================================

  // Submit DigiLocker KYC data from mobile app
  async submitDigiLockerKYC(req, res, next) {
    try {
      const playerId = req.player.player_id;
      const userId = req.player.player_id;
      
      const {
        reference_key,
        aadhaar_data,
        pan_data,
        user_details
      } = req.body;

      console.log('📱 Received DigiLocker KYC data from mobile app');
      console.log('👤 Player ID:', playerId);
      console.log('🔑 Reference key:', reference_key || 'Not provided');
      console.log('📄 Aadhaar data:', aadhaar_data ? 'Provided' : 'Not provided');
      console.log('📄 PAN data:', pan_data ? 'Provided' : 'Not provided');
      console.log('👤 User details:', user_details ? 'Provided' : 'Not provided');

      // Validate - at least one document or user details should be provided
      if (!aadhaar_data && !pan_data && !user_details) {
        return sendError(res, 'No KYC data provided. Please provide aadhaar_data, pan_data, or user_details.', 400);
      }

      // Store the KYC data
      const result = await kycService.storeDigiLockerKYC(
        playerId,
        userId,
        {
          reference_key,
          aadhaar_data,
          pan_data,
          user_details
        }
      );

      await logAudit(
        userId,
        'DIGILOCKER_KYC_SUBMITTED_MOBILE',
        'tbl_player_kyc',
        playerId,
        null,
        result.data,
        req.ip
      );

      return sendSuccess(res, 'KYC data stored successfully', result);
    } catch (error) {
      console.error('❌ Error storing DigiLocker KYC:', error);
      next(error);
    }
  }

  // ============================================
  // LEGACY ENDPOINTS (kept for backward compatibility)
  // ============================================

  // Initiate DigiLocker KYC (Player self-service) - LEGACY
  async initiateDigiLockerSelf(req, res, next) {
    try {
      const playerId = req.player.player_id;
      const userId = req.player.player_id;
      
      const mobileNumber = req.body?.mobile_number || req.player?.phone_number || null;
      
      console.log('🚀 Initiating DigiLocker for player:', playerId);
      console.log('📱 Mobile number:', mobileNumber || 'Not provided');

      const result = await kycService.initiateDigiLockerKYC(
        playerId,
        userId,
        mobileNumber
      );

      return sendSuccess(res, 'DigiLocker session initiated', result);
    } catch (error) {
      console.error('Error initiating DigiLocker:', error);
      return sendError(res, error.message);
    }
  }

  // Initiate DigiLocker KYC (Staff/Admin for other players)
  async initiateDigiLocker(req, res, next) {
    try {
      const { player_id } = req.params;
      
      const result = await kycService.initiateDigiLockerKYC(player_id, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'INITIATE_DIGILOCKER_KYC',
        'tbl_player_kyc',
        player_id,
        null,
        { kyc_id: result.kyc_id },
        req.ip
      );

      return sendSuccess(res, 'DigiLocker KYC initiated. Redirect user to auth_url', result);
    } catch (error) {
      next(error);
    }
  }

  // Handle DigiLocker callback using IDTO (Web flow)
  async digiLockerCallback(req, res, next) {
    try {
      const { code, code_verifier, player_id } = req.query;
      
      if (!code || !code_verifier) {
        const errorUrl = process.env.MOBILE_DEEP_LINK_URL 
          ? `${process.env.MOBILE_DEEP_LINK_URL}?error=Missing+authorization+code+or+code_verifier`
          : `${process.env.FRONTEND_URL}/kyc/error?message=Missing+authorization+code+or+code_verifier`;
        return res.redirect(errorUrl);
      }

      if (!player_id) {
        const errorUrl = process.env.MOBILE_DEEP_LINK_URL 
          ? `${process.env.MOBILE_DEEP_LINK_URL}?error=Missing+player_id`
          : `${process.env.FRONTEND_URL}/kyc/error?message=Missing+player_id`;
        return res.redirect(errorUrl);
      }

      const result = await kycService.handleDigiLockerCallback(code, code_verifier, player_id);
      
      const aadhaarResult = await kycService.fetchAndStoreAadhaarData(
        result.player_id,
        result.reference_key,
        result.player_id
      );

      await logAudit(
        result.player_id,
        'DIGILOCKER_KYC_COMPLETED',
        'tbl_player_kyc',
        result.player_id,
        null,
        aadhaarResult.data,
        req.ip
      );

      const successUrl = process.env.MOBILE_DEEP_LINK_URL 
        ? `${process.env.MOBILE_DEEP_LINK_URL}?success=true&player_id=${result.player_id}`
        : `${process.env.FRONTEND_URL}/kyc/success?player_id=${result.player_id}`;
      
      return res.redirect(successUrl);
    } catch (error) {
      console.error('DigiLocker callback error:', error);
      const errorUrl = process.env.MOBILE_DEEP_LINK_URL 
        ? `${process.env.MOBILE_DEEP_LINK_URL}?error=${encodeURIComponent(error.message)}`
        : `${process.env.FRONTEND_URL}/kyc/error?message=${encodeURIComponent(error.message)}`;
      return res.redirect(errorUrl);
    }
  }

  // Handle DigiLocker callback from mobile app (LEGACY - with reference key)
  async digiLockerCallbackMobile(req, res, next) {
    try {
      const { player_id } = req.params;
      const { 
        reference_key, 
        user_details, 
        issued_documents,
        aadhaar_xml,
        pan_xml 
      } = req.body;

      if (req.player.player_id !== parseInt(player_id)) {
        return sendError(res, 'Unauthorized: Player ID mismatch', 403);
      }

      if (!reference_key) {
        return sendError(res, 'Reference key is required', 400);
      }

      console.log('📱 Mobile DigiLocker callback received:', {
        player_id,
        reference_key: reference_key.substring(0, 20) + '...',
        has_user_details: !!user_details,
        has_aadhaar_xml: !!aadhaar_xml,
        has_pan_xml: !!pan_xml,
      });

      const result = await kycService.fetchAndStoreAadhaarData(
        parseInt(player_id),
        reference_key,
        parseInt(player_id),
        {
          user_details,
          issued_documents,
          aadhaar_xml,
          pan_xml,
        }
      );

      await logAudit(
        parseInt(player_id),
        'DIGILOCKER_KYC_COMPLETED_MOBILE',
        'tbl_player_kyc',
        parseInt(player_id),
        null,
        result.data,
        req.ip
      );

      return sendSuccess(res, 'DigiLocker verification completed successfully', result);
    } catch (error) {
      console.error('❌ Mobile DigiLocker callback error:', error);
      next(error);
    }
  }

  // Fetch PAN data (optional) using IDTO
  async fetchPANData(req, res, next) {
    try {
      const { player_id } = req.params;
      const { reference_key } = req.body;
      
      if (!reference_key) {
        return sendError(res, 'Reference key is required', 400);
      }
      
      const panData = await kycService.fetchAndStorePANData(player_id, reference_key, req.user.user_id);
      
      return sendSuccess(res, 'PAN data fetched successfully', panData);
    } catch (error) {
      next(error);
    }
  }

  // ============================================
  // MANUAL KYC ENDPOINTS
  // ============================================

  async createKYC(req, res, next) {
    try {
      const { player_id } = req.params;
      
      const kycId = await kycService.createKYC(player_id, req.body, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'CREATE_KYC',
        'tbl_player_kyc',
        kycId,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(res, 'KYC record created successfully', { kyc_id: kycId }, 201);
    } catch (error) {
      next(error);
    }
  }

  async getKYC(req, res, next) {
    try {
      const { player_id } = req.params;
      
      const kyc = await kycService.getKYC(player_id);
      
      if (!kyc) {
        return sendError(res, 'KYC record not found', 404);
      }

      return sendSuccess(res, 'KYC details retrieved', kyc);
    } catch (error) {
      next(error);
    }
  }

  async uploadDocument(req, res, next) {
    try {
      const { player_id } = req.params;
      const { document_type } = req.body;
      
      if (!req.file) {
        return sendError(res, 'No file uploaded', 400);
      }

      const filePath = req.file.path;
      
      const uploadResult = await kycService.uploadDocument(player_id, document_type, filePath, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'UPLOAD_KYC_DOCUMENT',
        'tbl_player_kyc',
        player_id,
        null,
        { 
          document_type, 
          cloudinary_id: uploadResult.cloudinary_id,
          file_size: uploadResult.file_size
        },
        req.ip
      );

      return sendSuccess(res, 'Document uploaded successfully to Cloudinary', uploadResult);
    } catch (error) {
      next(error);
    }
  }

  async submitKYC(req, res, next) {
    try {
      const { player_id } = req.params;
      
      await kycService.submitKYC(player_id, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        'SUBMIT_KYC',
        'tbl_player_kyc',
        player_id,
        null,
        null,
        req.ip
      );

      return sendSuccess(res, 'KYC submitted successfully for review');
    } catch (error) {
      next(error);
    }
  }

  async reviewKYC(req, res, next) {
    try {
      const { player_id } = req.params;
      const { action, notes } = req.body;
      
      if (!action || !['approve', 'reject'].includes(action)) {
        return sendError(res, 'Invalid action. Use "approve" or "reject"', 400);
      }

      if (action === 'reject' && !notes) {
        return sendError(res, 'Rejection notes are required', 400);
      }

      await kycService.reviewKYC(player_id, action, notes, req.user.user_id);
      
      await logAudit(
        req.user.user_id,
        `KYC_${action.toUpperCase()}`,
        'tbl_player_kyc',
        player_id,
        null,
        { action, notes },
        req.ip
      );

      return sendSuccess(res, `KYC ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
    } catch (error) {
      next(error);
    }
  }

  async getPendingKYCs(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      
      const result = await kycService.getPendingKYCs(page, limit);
      
      return sendSuccess(res, 'Pending KYCs retrieved', result);
    } catch (error) {
      next(error);
    }
  }

  async getAllKYCs(req, res, next) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const filters = {
        kyc_status: req.query.kyc_status,
        kyc_method: req.query.kyc_method,
        search: req.query.search
      };
      
      const result = await kycService.getAllKYCs(filters, page, limit);
      
      return sendSuccess(res, 'KYCs retrieved', result);
    } catch (error) {
      next(error);
    }
  }

  async registerDevice(req, res, next) {
    try {
      const { player_id } = req.params;
      
      const deviceId = await kycService.registerDevice(player_id, req.body);
      
      return sendSuccess(res, 'Device registered successfully', { device_id: deviceId }, 201);
    } catch (error) {
      next(error);
    }
  }

  async getNotifications(req, res, next) {
    try {
      const { player_id } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      
      const notifications = await kycService.getPlayerNotifications(player_id, page, limit);
      
      return sendSuccess(res, 'Notifications retrieved', notifications);
    } catch (error) {
      next(error);
    }
  }

  async markNotificationRead(req, res, next) {
    try {
      const { notification_id } = req.params;
      
      await kycService.markNotificationRead(notification_id);
      
      return sendSuccess(res, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  }

  async getKYCStats(req, res, next) {
    try {
      const stats = await kycService.getKYCStats();
      
      return sendSuccess(res, 'KYC statistics retrieved', stats);
    } catch (error) {
      next(error);
    }
  }

  async sendManualReminder(req, res, next) {
    try {
      const { player_id } = req.params;
      
      await kycService.sendKYCNotification(
        player_id,
        'kyc_reminder',
        'Complete Your KYC',
        'This is a reminder to complete your KYC verification.'
      );
      
      return sendSuccess(res, 'Reminder sent successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new KYCController();