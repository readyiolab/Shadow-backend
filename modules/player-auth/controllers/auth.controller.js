// ============================================
// modules/player-auth/controllers/auth.controller.js
// OTP Request & Login
// ============================================
const authService = require('../services/auth.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');

class PlayerAuthController {
  // ============================================
  // REQUEST OTP (Step 1)
  // ============================================
  async requestOTP(req, res, next) {
    try {
      const { phone_number } = req.body;

      // Validate input
      if (!phone_number) {
        return sendError(res, 'Phone number is required', 400);
      }

      // Validate phone format
      const cleanPhone = phone_number.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        return sendError(res, 'Invalid phone number format (minimum 10 digits)', 400);
      }

      console.log(`📱 Requesting OTP for: ${phone_number}`);

      // Send OTP via 2Factor.in
      const result = await authService.sendOTP(phone_number);

      return sendSuccess(res, 'OTP sent successfully', {
        otp_id: result.otp_id,
        phone_number: result.phone_number,
        message: `OTP sent to ${phone_number}. Valid for 10 minutes`,
        otp: result.otp // Only in development
      });
    } catch (error) {
      console.error('❌ Request OTP Error:', error.message);
      return sendError(res, error.message || 'Failed to send OTP', 400);
    }
  }

  // ============================================
  // VERIFY OTP & LOGIN (Step 2)
  // ============================================
  async verifyOTP(req, res, next) {
    try {
      const { phone_number, otp } = req.body;

      // Validate input
      if (!phone_number || !otp) {
        return sendError(res, 'Phone number and OTP are required', 400);
      }

      if (otp.toString().length !== 6) {
        return sendError(res, 'OTP must be 6 digits', 400);
      }

      console.log(`🔐 Verifying OTP for: ${phone_number}`);

      // Verify OTP and login
      const result = await authService.loginWithOTP(phone_number, otp);

      return sendSuccess(res, 'Login successful', {
        token: result.token,
        player_id: result.player_id,
        player_code: result.player_code,
        phone_number: result.phone_number,
        player_name: result.player_name,
        kyc_status: result.kyc_status,
        is_new_player: result.is_new_player,
        message: result.is_new_player 
          ? `Welcome ${result.player_code}! Please update your profile` 
          : `Welcome back ${result.player_code}!`
      });
    } catch (error) {
      console.error('❌ Verify OTP Error:', error.message);
      return sendError(res, error.message || 'Login failed', 400);
    }
  }

  // ============================================
  // RESEND OTP
  // ============================================
  async resendOTP(req, res, next) {
    try {
      const { phone_number } = req.body;

      // Validate input
      if (!phone_number) {
        return sendError(res, 'Phone number is required', 400);
      }

      console.log(`🔄 Resending OTP for: ${phone_number}`);

      // Resend OTP
      const result = await authService.resendOTP(phone_number);

      return sendSuccess(res, 'OTP resent successfully', {
        otp_id: result.otp_id,
        phone_number: result.phone_number,
        message: `New OTP sent to ${phone_number}. Valid for 10 minutes`,
        otp: result.otp // Only in development
      });
    } catch (error) {
      console.error('❌ Resend OTP Error:', error.message);
      return sendError(res, error.message || 'Failed to resend OTP', 400);
    }
  }

  // ============================================
  // LOGOUT
  // ============================================
  async logout(req, res, next) {
    try {
      const playerId = req.player?.player_id;

      if (!playerId) {
        return sendError(res, 'Not authenticated', 401);
      }

      await authService.logoutPlayer(playerId);

      return sendSuccess(res, 'Logged out successfully', {
        success: true
      });
    } catch (error) {
      console.error('❌ Logout Error:', error.message);
      return sendError(res, error.message || 'Logout failed', 400);
    }
  }
}

module.exports = new PlayerAuthController();