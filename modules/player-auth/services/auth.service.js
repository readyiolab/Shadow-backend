// ============================================
// modules/player-auth/services/auth.service.js
// 2FACTOR.IN OTP + Player Authentication
// ============================================
const db = require('../../../config/database');
const axios = require('axios');

const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY;
const TWOFACTOR_BASE_URL = 'https://2factor.in/API/V1';

class PlayerAuthService {
  // ============================================
  // STEP 1: SEND OTP
  // ============================================
  async sendOTP(phoneNumber) {
    try {
      console.log(`📱 Sending OTP to: ${phoneNumber}`);

      // Validate phone number
      if (!phoneNumber || phoneNumber.replace(/\D/g, '').length < 10) {
        throw new Error('Invalid phone number');
      }

      // Format phone number
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      // Call 2Factor.in API (AUTOGEN2 - 6 digit)
      const response = await axios.get(
        `${TWOFACTOR_BASE_URL}/${TWOFACTOR_API_KEY}/SMS/${formattedPhone}/AUTOGEN2/OTP1`
      );

      console.log('✅ 2Factor API Response:', response.data);

      if (response.data.Status !== 'Success') {
        throw new Error(`API Error: ${response.data.Details}`);
      }

      // Extract OTP
      const generatedOTP = response.data.OTP;

      console.log(`✅ OTP Generated: ${generatedOTP}`);

      // Calculate expiration (10 minutes)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      // Store/Update OTP in tbl_player_otp
      const existingOTP = await db.select(
        'tbl_player_otp',
        '*',
        'phone_number = ?',
        [phoneNumber]
      );

      let otpId;

      if (existingOTP) {
        // Update existing OTP
        await db.update(
          'tbl_player_otp',
          {
            otp_code: generatedOTP,
            is_used: 0,
            expires_at: expiresAt
          },
          'phone_number = ?',
          [phoneNumber]
        );
        otpId = existingOTP.otp_id;
      } else {
        // Insert new OTP
        const result = await db.insert('tbl_player_otp', {
          phone_number: phoneNumber,
          otp_code: generatedOTP,
          is_used: 0,
          expires_at: expiresAt
        });
        otpId = result.insert_id;
      }

      console.log(`✅ OTP stored in tbl_player_otp - ID: ${otpId}`);

      return {
        success: true,
        otp_id: otpId,
        phone_number: phoneNumber,
        otp: process.env.NODE_ENV === 'development' ? generatedOTP : undefined
      };
    } catch (error) {
      console.error('❌ OTP Send Error:', error.message);
      throw error;
    }
  }

  // ============================================
  // STEP 2: VERIFY OTP & LOGIN
  // ============================================
  async loginWithOTP(phoneNumber, otp) {
    try {
      console.log(`🔐 Login attempt for: ${phoneNumber}`);

      // Validate inputs
      if (!phoneNumber || !otp) {
        throw new Error('Phone number and OTP are required');
      }

      // Get OTP from database
      const otpRecord = await db.select(
        'tbl_player_otp',
        '*',
        'phone_number = ?',
        [phoneNumber]
      );

      if (!otpRecord) {
        throw new Error('OTP not found. Please request OTP first');
      }

      // Check if already used
      if (otpRecord.is_used === 1) {
        throw new Error('OTP already used');
      }

      // Check expiration
      const expirationTime = new Date(otpRecord.expires_at).getTime();
      const currentTime = new Date().getTime();

      if (currentTime > expirationTime) {
        throw new Error('OTP has expired. Request a new OTP');
      }

      // Verify OTP code
      if (otpRecord.otp_code !== otp.toString()) {
        throw new Error('Invalid OTP');
      }

      console.log('✅ OTP verified');

      // Mark OTP as used
      await db.update(
        'tbl_player_otp',
        { is_used: 1 },
        'phone_number = ?',
        [phoneNumber]
      );

      console.log('✅ OTP marked as used');

      // ============================================
      // GET EXISTING PLAYER OR CREATE NEW ONE
      // ============================================

      let player = await db.select(
        'tbl_players',
        '*',
        'phone_number = ?',
        [phoneNumber]
      );

      let isNewPlayer = false;

      if (!player) {
        console.log('👤 Player does not exist - Creating new player...');

        // Generate player code
        const playerCode = await this.generatePlayerCode();

        // Create new player
        const result = await db.insert('tbl_players', {
          player_code: playerCode,
          player_name: 'New Player',
          phone_number: phoneNumber,
          email: null,
          address: null,
          player_type: 'occasional',
          kyc_status: 'not_started',
          credit_limit: 0,
          total_buy_ins: 0,
          total_cash_outs: 0,
          total_credits_issued: 0,
          total_credits_settled: 0,
          outstanding_credit: 0,
          visit_count: 0,
          is_active: 1,
          is_blacklisted: 0,
          created_by: null
        });

        // Fetch created player
        player = await db.select(
          'tbl_players',
          '*',
          'player_id = ?',
          [result.insert_id]
        );

        isNewPlayer = true;

        console.log(`✅ New player created: ${playerCode}`);

        // Create KYC reminder schedule
        try {
          await db.insert('tbl_kyc_reminder_schedule', {
            player_id: player.player_id,
            next_reminder_scheduled: new Date(Date.now() + 24 * 60 * 60 * 1000),
            is_active: true,
            created_at: new Date()
          });

          console.log('✅ KYC reminder schedule created');
        } catch (err) {
          console.warn('⚠️ KYC reminder warning:', err.message);
        }

        // Send welcome notification
        try {
          await db.insert('tbl_kyc_notifications', {
            player_id: player.player_id,
            notification_type: 'kyc_pending',
            notification_title: 'Welcome to Royal Flush!',
            notification_message: 'Complete your KYC verification to access all features.',
            created_at: new Date()
          });

          console.log('✅ Welcome notification sent');
        } catch (err) {
          console.warn('⚠️ Notification warning:', err.message);
        }
      } else {
        console.log(`✅ Existing player found: ${player.player_code}`);
      }

      // Generate JWT token
      const token = this.generatePlayerToken(player.player_id, phoneNumber);

      console.log(`🎉 Login successful for: ${player.player_code}`);

      return {
        success: true,
        player_id: player.player_id,
        player_code: player.player_code,
        phone_number: player.phone_number,
        player_name: player.player_name,
        kyc_status: player.kyc_status,
        is_new_player: isNewPlayer,
        token: token
      };
    } catch (error) {
      console.error('❌ Login Error:', error.message);
      throw error;
    }
  }

  // ============================================
  // RESEND OTP
  // ============================================
  async resendOTP(phoneNumber) {
    try {
      console.log(`🔄 Resending OTP for: ${phoneNumber}`);

      // Rate limiting check (max 3 requests in 5 minutes)
      const recentOTPs = await db.queryAll(
        'SELECT * FROM tbl_player_otp WHERE phone_number = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)',
        [phoneNumber]
      );

      if (recentOTPs && recentOTPs.length >= 3) {
        throw new Error('Too many OTP requests. Try again after 5 minutes');
      }

      // Send new OTP
      return await this.sendOTP(phoneNumber);
    } catch (error) {
      console.error('❌ Resend Error:', error.message);
      throw error;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  // Format phone number
  formatPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    let formatted = cleaned.startsWith('0') ? cleaned.substring(1) : cleaned;

    if (!formatted.startsWith('91')) {
      formatted = '91' + formatted;
    }

    return formatted;
  }

  // Generate player code
  async generatePlayerCode() {
    const lastPlayer = await db.query(
      'SELECT player_code FROM tbl_players ORDER BY player_id DESC LIMIT 1'
    );

    if (!lastPlayer || !lastPlayer.player_code) {
      return 'PC00001';
    }

    const lastNumber = parseInt(lastPlayer.player_code.replace('PC', ''));
    const newNumber = lastNumber + 1;
    const paddedNumber = String(newNumber).padStart(5, '0');

    return `PC${paddedNumber}`;
  }

  // Generate JWT token
  generatePlayerToken(playerId, phoneNumber) {
    const jwt = require('jsonwebtoken');

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET not configured');
    }

    return jwt.sign(
      {
        player_id: playerId,
        phone_number: phoneNumber,
        type: 'player'
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
  }

  // Verify JWT token
  verifyPlayerToken(token) {
    try {
      const jwt = require('jsonwebtoken');

      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET not configured');
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.type !== 'player') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      throw new Error(`Invalid or expired token: ${error.message}`);
    }
  }

  // Logout
  async logoutPlayer(playerId) {
    console.log(`👋 Logout: ${playerId}`);
    return { success: true };
  }
}

module.exports = new PlayerAuthService();