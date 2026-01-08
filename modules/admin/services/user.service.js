// modules/admin/services/user.service.js
// User Management Service - For Admin to create/manage cashiers and floor managers

const bcrypt = require('bcryptjs');
const db = require('../../../config/database');

class UserService {
  /**
   * Generate a random password
   */
  generatePassword(length = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Generate unique username based on role
   * Format: cashier_001, floormanager_001, etc.
   */
  async generateUsername(role) {
    const prefix = role === 'cashier' ? 'cashier' : role === 'floor_manager' ? 'floormanager' : role;
    
    // Get the last user with this role prefix
    const lastUser = await db.query(
      `SELECT username FROM tbl_users WHERE username LIKE ? ORDER BY user_id DESC LIMIT 1`,
      [`${prefix}_%`]
    );

    let number = 1;
    if (lastUser && lastUser.username) {
      const match = lastUser.username.match(/_(\d+)$/);
      if (match) {
        number = parseInt(match[1]) + 1;
      }
    }

    return `${prefix}_${String(number).padStart(3, '0')}`;
  }

  /**
   * Create a new user (cashier or floor_manager)
   */
  async createUser(data, adminId) {
    const { full_name, phone_number, email, role } = data;

    // Validate role
    const validRoles = ['cashier', 'floor_manager'];
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role. Must be cashier or floor_manager');
    }

    // Check phone uniqueness if provided
    if (phone_number) {
      const existingPhone = await db.select(
        'tbl_users',
        'user_id',
        'phone_number = ?',
        [phone_number]
      );
      if (existingPhone) {
        throw new Error('Phone number already exists');
      }
    }

    // Check email uniqueness if provided
    if (email) {
      const existingEmail = await db.select(
        'tbl_users',
        'user_id',
        'email = ?',
        [email]
      );
      if (existingEmail) {
        throw new Error('Email already exists');
      }
    }

    // Generate unique username
    const username = await this.generateUsername(role);

    // Generate random password
    const plainPassword = this.generatePassword(8);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    // Insert user
    const result = await db.insert('tbl_users', {
      username,
      password_hash: passwordHash,
      full_name,
      email: email || `${username}@royalflush.local`,
      phone_number: phone_number || null,
      role,
      is_2fa_enabled: 0, // Disable 2FA by default for easier first login
      is_active: 1,
      created_at: new Date()
    });

    return {
      user_id: result.insert_id,
      username,
      password: plainPassword, // Return plain password only once (admin should share with user)
      full_name,
      email: email || `${username}@royalflush.local`,
      phone_number,
      role,
      message: `${role === 'cashier' ? 'Cashier' : 'Floor Manager'} created successfully. Share the credentials securely.`
    };
  }

  /**
   * Get all users by role
   */
  async getUsersByRole(role = null) {
    let whereClause = "role IN ('cashier', 'floor_manager')";
    let params = [];

    if (role && ['cashier', 'floor_manager'].includes(role)) {
      whereClause = 'role = ?';
      params = [role];
    }

    const users = await db.selectAll(
      'tbl_users',
      'user_id, username, full_name, email, phone_number, role, is_active, is_2fa_enabled, created_at, updated_at',
      whereClause,
      params,
      'ORDER BY created_at DESC'
    );

    return users || [];
  }

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    const user = await db.select(
      'tbl_users',
      'user_id, username, full_name, email, phone_number, role, is_active, is_2fa_enabled, created_at, updated_at',
      'user_id = ?',
      [userId]
    );

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  /**
   * Update user
   */
  async updateUser(userId, data, adminId) {
    const user = await this.getUserById(userId);

    // Don't allow changing admin role
    if (user.role === 'admin') {
      throw new Error('Cannot modify admin users');
    }

    const updates = {};

    if (data.full_name) updates.full_name = data.full_name;
    if (data.phone_number) updates.phone_number = data.phone_number;
    if (data.email) updates.email = data.email;
    if (data.is_active !== undefined) updates.is_active = data.is_active ? 1 : 0;
    if (data.is_2fa_enabled !== undefined) updates.is_2fa_enabled = data.is_2fa_enabled ? 1 : 0;

    if (Object.keys(updates).length === 0) {
      throw new Error('No fields to update');
    }

    updates.updated_at = new Date();

    await db.update('tbl_users', updates, 'user_id = ?', [userId]);

    return {
      user_id: userId,
      ...updates,
      message: 'User updated successfully'
    };
  }

  /**
   * Reset user password
   */
  async resetPassword(userId, adminId) {
    const user = await this.getUserById(userId);

    // Don't allow resetting admin password
    if (user.role === 'admin') {
      throw new Error('Cannot reset admin password');
    }

    // Generate new password
    const plainPassword = this.generatePassword(8);
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    await db.update(
      'tbl_users',
      { password_hash: passwordHash, updated_at: new Date() },
      'user_id = ?',
      [userId]
    );

    return {
      user_id: userId,
      username: user.username,
      new_password: plainPassword,
      message: 'Password reset successfully. Share the new password securely.'
    };
  }

  /**
   * Deactivate user
   */
  async deactivateUser(userId, adminId) {
    const user = await this.getUserById(userId);

    if (user.role === 'admin') {
      throw new Error('Cannot deactivate admin users');
    }

    await db.update(
      'tbl_users',
      { is_active: 0, updated_at: new Date() },
      'user_id = ?',
      [userId]
    );

    return {
      user_id: userId,
      message: 'User deactivated successfully'
    };
  }

  /**
   * Activate user
   */
  async activateUser(userId, adminId) {
    const user = await this.getUserById(userId);

    await db.update(
      'tbl_users',
      { is_active: 1, updated_at: new Date() },
      'user_id = ?',
      [userId]
    );

    return {
      user_id: userId,
      message: 'User activated successfully'
    };
  }

  /**
   * Delete user (soft delete - just deactivate)
   */
  async deleteUser(userId, adminId) {
    return await this.deactivateUser(userId, adminId);
  }
}

module.exports = new UserService();

