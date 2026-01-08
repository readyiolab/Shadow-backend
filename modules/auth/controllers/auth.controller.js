const authService = require('../services/auth.service');

class AuthController {
  /**
   * Register new user
   * POST /api/auth/register
   */
  async register(req, res) {
    try {
      const newUser = await authService.register(req.body);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: newUser
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Registration failed'
      });
    }
  }

  /**
   * Login - Step 1: Email & Password
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);

      if (result.requiresOTP) {
        // 2FA enabled - OTP sent
        return res.status(200).json({
          success: true,
          requiresOTP: true,
          user_id: result.user_id,
          role: result.role,
          message: result.message
        });
      } else {
        // 2FA disabled - return token
        return res.status(200).json({
          success: true,
          requiresOTP: false,
          token: result.token,
          user: result.user,
          message: 'Login successful'
        });
      }
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message || 'Login failed'
      });
    }
  }

  /**
   * Verify OTP - Step 2: Complete login
   * POST /api/auth/verify-otp
   */
  async verifyOTP(req, res) {
    try {
      const { user_id, otp } = req.body;
      const result = await authService.verifyLoginOTP(user_id, otp);

      return res.status(200).json({
        success: true,
        token: result.token,
        user: result.user,
        message: 'Login successful'
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message || 'OTP verification failed'
      });
    }
  }

  /**
   * Resend OTP
   * POST /api/auth/resend-otp
   */
  async resendOTP(req, res) {
    try {
      const { user_id } = req.body;
      const result = await authService.resendOTP(user_id);

      return res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to resend OTP'
      });
    }
  }

  /**
   * Logout
   * POST /api/auth/logout
   */
  async logout(req, res) {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      await authService.logout(req.user.user_id, token);

      return res.status(200).json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Logout failed'
      });
    }
  }

  /**
   * Get Profile
   * GET /api/auth/profile
   */
  async getProfile(req, res) {
    try {
      const user = await authService.getProfile(req.user.user_id);

      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'User not found'
      });
    }
  }
}

module.exports = new AuthController();
