// ============================================
// 1. 2FA SERVICE - Email OTP Based
// ============================================
// 2fa.service.js

const crypto = require('crypto');
const db = require('../../../config/database');
const emailService = require('./email.service');

/**
 * Generate OTP and send via email
 */
const generateAndSendOTP = async (userId, email) => {
  try {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // OTP expires in 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    
    // Delete any existing OTP for this user
    await db.delete('tbl_2fa_otps', 'user_id = ?', [userId]);
    
    // Save OTP to database
    await db.insert('tbl_2fa_otps', {
      user_id: userId,
      otp_code: otp,
      expires_at: expiresAt,
      is_used: 0,
      created_at: new Date()
    });

    // Send OTP via email
    await emailService.send2FAOTPEmail(email, otp);

    return {
      message: 'OTP sent to your email',
      expiresIn: 300 // 5 minutes in seconds
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Verify OTP
 */
const verifyOTP = async (userId, otp) => {
  try {
    // Get OTP record
    const otpRecord = await db.select(
      'tbl_2fa_otps',
      '*',
      'user_id = ? AND is_used = 0',
      [userId]
    );

    if (!otpRecord) {
      throw new Error('No valid OTP found. Please request a new one.');
    }

    // Check if OTP is expired
    if (new Date() > new Date(otpRecord.expires_at)) {
      throw new Error('OTP has expired. Please request a new one.');
    }

    // Check if OTP matches
    if (otpRecord.otp_code !== otp) {
      throw new Error('Incorrect OTP');
    }

    // Mark OTP as used
    await db.update(
      'tbl_2fa_otps',
      { is_used: 1 },
      'user_id = ?',
      [userId]
    );

    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Resend OTP
 */
const resendOTP = async (userId, email) => {
  try {
    // Check if user requested OTP recently (within 30 seconds)
    const recent = await db.select(
      'tbl_2fa_otps',
      '*',
      'user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)',
      [userId]
    );

    if (recent && recent.length > 0) {
      throw new Error('Please wait 30 seconds before requesting another OTP');
    }

    return await generateAndSendOTP(userId, email);
  } catch (error) {
    throw error;
  }
};

/**
 * Enable 2FA for user (optional - saves preference)
 */
const enable2FA = async (userId) => {
  try {
    await db.update(
      'tbl_users',
      { is_2fa_enabled: 1 },
      'user_id = ?',
      [userId]
    );
    return true;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  generateAndSendOTP,
  verifyOTP,
  resendOTP,
  enable2FA
};