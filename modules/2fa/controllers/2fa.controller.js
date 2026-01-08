// 2fa.controller.js

const twoFAService = require('../services/2fa.service');
const bcrypt = require('bcryptjs');
const db = require('../../../config/database');

/**
 * Setup 2FA for authenticated user
 * POST /api/2fa/setup
 */
const setup = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const username = req.user.username;
    
    // Get user email
    const user = await db.select('tbl_users', 'email', 'user_id = ?', [userId]);
    
    if (!user || !user.email) {
      return res.status(400).json({
        success: false,
        message: 'User email not found'
      });
    }

    const result = await twoFAService.setup(userId, username, user.email);

    return res.status(200).json({
      success: true,
      message: '2FA setup successful. Please scan the QR code with your authenticator app.',
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to setup 2FA'
    });
  }
};

/**
 * Verify 2FA token
 * POST /api/2fa/verify
 */
const verify = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    await twoFAService.verify(userId, token);

    return res.status(200).json({
      success: true,
      message: '2FA verified successfully'
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Invalid 2FA token'
    });
  }
};

/**
 * Disable 2FA
 * POST /api/2fa/disable
 */
const disable = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { password, token } = req.body;

    if (!password || !token) {
      return res.status(400).json({
        success: false,
        message: 'Password and 2FA token are required'
      });
    }

    // Verify password
    const user = await db.select('tbl_users', 'password_hash, email', 'user_id = ?', [userId]);
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    // Verify 2FA token
    await twoFAService.verify(userId, token);

    // Disable 2FA
    await twoFAService.disable(userId, user.email);

    return res.status(200).json({
      success: true,
      message: '2FA has been disabled'
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to disable 2FA'
    });
  }
};

/**
 * Get 2FA status
 * GET /api/2fa/status
 */
const getStatus = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const status = await twoFAService.getStatus(userId);

    return res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to get 2FA status'
    });
  }
};

/**
 * Regenerate backup codes
 * POST /api/2fa/regenerate-backup-codes
 */
const regenerateBackupCodes = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: '2FA token is required'
      });
    }

    // Verify 2FA token
    await twoFAService.verify(userId, token);

    // Get user email
    const user = await db.select('tbl_users', 'email', 'user_id = ?', [userId]);

    // Regenerate codes
    const newCodes = await twoFAService.regenerateBackupCodes(userId, user.email);

    return res.status(200).json({
      success: true,
      message: 'Backup codes regenerated successfully',
      data: {
        backupCodes: newCodes
      }
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to regenerate backup codes'
    });
  }
};

module.exports = {
  setup,
  verify,
  disable,
  getStatus,
  regenerateBackupCodes
};