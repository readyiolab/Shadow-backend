const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../../config/database');
const jwtConfig = require('../../../config/jwt.config');
const emailService = require('../../2fa/services/email.service');

class AuthService {
  /**
   * Register new user (Admin only can create users)
   */
  async register(userData) {
    const { username, password, full_name, email, phone_number, role } = userData;

    // Check username uniqueness
    const existingUsername = await db.select(
      'tbl_users',
      'user_id',
      'username = ?',
      [username]
    );
    if (existingUsername) {
      throw new Error('Username already exists');
    }

    // Check email uniqueness
    const existingEmail = await db.select(
      'tbl_users',
      'user_id',
      'email = ?',
      [email]
    );
    if (existingEmail) {
      throw new Error('Email already exists');
    }

    // Validate role
    const validRoles = ['admin', 'cashier', 'floor_manager', 'player'];
    if (role && !validRoles.includes(role)) {
      throw new Error('Invalid role specified');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Insert user
    const result = await db.insert('tbl_users', {
      username,
      password_hash: passwordHash,
      full_name,
      email,
      phone_number,
      role: role || 'player',
      is_2fa_enabled: ['admin', 'cashier', 'floor_manager'].includes(role) ? 1 : 0, // Auto-enable 2FA for admin/cashier/floor_manager
      is_active: 1,
      created_at: new Date()
    });

    // Get created user
    const newUser = await db.select(
      'tbl_users',
      'user_id, username, full_name, email, role, is_2fa_enabled, created_at',
      'user_id = ?',
      [result.insert_id]
    );

    return newUser;
  }

  /**
   * Login Step 1: Verify email/username and password
   * Returns user info if 2FA enabled, or token if 2FA disabled
   */
  async login(identifier, password) {
    // Get user by email OR username
    let user = await db.select(
      'tbl_users',
      'user_id, username, password_hash, full_name, email, role, is_active, is_2fa_enabled',
      'email = ? AND is_active = 1',
      [identifier]
    );

    // If not found by email, try username
    if (!user) {
      user = await db.select(
        'tbl_users',
        'user_id, username, password_hash, full_name, email, role, is_active, is_2fa_enabled',
        'username = ? AND is_active = 1',
        [identifier]
      );
    }

    if (!user) {
      throw new Error('Invalid username/email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid username/email or password');
    }

    // Remove password hash from response
    delete user.password_hash;

    // ✅ TEMPORARILY DISABLE 2FA - Skip OTP for now
    // If 2FA is enabled, send OTP
    // For now, just return token directly
    const skipOTP = true; // Set to false when you want to enable OTP
    
    if (user.is_2fa_enabled && !skipOTP) {
      await this.generateAndSendOTP(user.user_id, user.email);
      
      return {
        requiresOTP: true,
        user_id: user.user_id,
        email: user.email,
        role: user.role,
        message: 'OTP sent to your email. Please verify to continue.'
      };
    }

    // If 2FA disabled, generate token directly
    const token = await this.generateToken(user);
    
    return {
      requiresOTP: false,
      token,
      user
    };
  }

  /**
   * Login Step 2: Verify OTP and issue token
   */
  async verifyLoginOTP(userId, otp) {
    // Verify OTP
    const isValidOTP = await this.verifyOTP(userId, otp);
    
    if (!isValidOTP) {
      throw new Error('Invalid or expired OTP');
    }

    // Get user details
    const user = await db.select(
      'tbl_users',
      'user_id, username, full_name, email, role, is_2fa_enabled',
      'user_id = ? AND is_active = 1',
      [userId]
    );

    if (!user) {
      throw new Error('User not found');
    }

    // Generate and return token
    const token = await this.generateToken(user);

    return {
      token,
      user
    };
  }

  /**
   * Generate 6-digit OTP and send via email
   */
  async generateAndSendOTP(userId, email) {
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
  }

  /**
   * Verify OTP
   */
  async verifyOTP(userId, otp) {
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

    // Check expiration
    if (new Date() > new Date(otpRecord.expires_at)) {
      throw new Error('OTP has expired. Please request a new one.');
    }

    // Check OTP match
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
  }

  /**
   * Resend OTP
   */
  async resendOTP(userId) {
    // Get user email
    const user = await db.select('tbl_users', 'email', 'user_id = ?', [userId]);
    
    if (!user) {
      throw new Error('User not found');
    }

    // Check rate limiting (30 seconds)
    const recentOTP = await db.select(
      'tbl_2fa_otps',
      '*',
      'user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)',
      [userId]
    );

    if (recentOTP) {
      throw new Error('Please wait 30 seconds before requesting another OTP');
    }

    return await this.generateAndSendOTP(userId, user.email);
  }

  /**
   * Generate JWT token
   */
  async generateToken(user) {
    const payload = {
      user_id: user.user_id,
      username: user.username,
      role: user.role
    };

    const token = jwt.sign(payload, jwtConfig.secret, {
      expiresIn: jwtConfig.expiresIn
    });

    // Save session
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await db.insert('tbl_sessions', {
      user_id: user.user_id,
      token,
      expires_at: expiresAt,
      created_at: new Date()
    });

    return token;
  }

  /**
   * Logout user
   */
  async logout(userId, token) {
    await db.delete('tbl_sessions', 'user_id = ? AND token = ?', [userId, token]);
  }

  /**
   * Get user profile
   */
  async getProfile(userId) {
    const user = await db.select(
      'tbl_users',
      'user_id, username, full_name, email, phone_number, role, is_2fa_enabled, created_at',
      'user_id = ? AND is_active = 1',
      [userId]
    );

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }
}

module.exports = new AuthService();
