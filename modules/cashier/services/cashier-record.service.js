// modules/cashier/services/cashier-record.service.js
// Service for managing individual cashier records (separate from user authentication)

const db = require("../../../config/database");

class CashierRecordService {
  /**
   * Get all cashiers
   */
  async getAllCashiers() {
    const cashiers = await db.queryAll(
      `SELECT * FROM tbl_cashiers ORDER BY created_at DESC`
    );
    return cashiers || [];
  }

  /**
   * Get active cashiers only
   */
  async getActiveCashiers() {
    const cashiers = await db.queryAll(
      `SELECT * FROM tbl_cashiers WHERE is_active = 1 ORDER BY full_name ASC`
    );
    return cashiers || [];
  }

  /**
   * Get cashier by ID
   */
  async getCashierById(cashierId) {
    const cashier = await db.select(
      "tbl_cashiers",
      "*",
      "cashier_id = ?",
      [cashierId]
    );
    return cashier;
  }

  /**
   * Create a new cashier record
   */
  async createCashier(data) {
    const { full_name, phone_number, email } = data;

    if (!full_name || !full_name.trim()) {
      throw new Error("Cashier name is required");
    }

    // Check phone uniqueness if provided
    if (phone_number) {
      const existing = await db.select(
        "tbl_cashiers",
        "cashier_id",
        "phone_number = ?",
        [phone_number]
      );
      if (existing) {
        throw new Error("Phone number already exists");
      }
    }

    // Check email uniqueness if provided
    if (email) {
      const existing = await db.select(
        "tbl_cashiers",
        "cashier_id",
        "email = ?",
        [email]
      );
      if (existing) {
        throw new Error("Email already exists");
      }
    }

    const result = await db.insert("tbl_cashiers", {
      full_name: full_name.trim(),
      phone_number: phone_number || null,
      email: email || null,
      is_active: 1,
      created_at: new Date(),
    });

    return {
      cashier_id: result.insert_id,
      full_name: full_name.trim(),
      phone_number: phone_number || null,
      email: email || null,
      is_active: 1,
    };
  }

  /**
   * Update cashier record
   */
  async updateCashier(cashierId, data) {
    const { full_name, phone_number, email } = data;

    const cashier = await this.getCashierById(cashierId);
    if (!cashier) {
      throw new Error("Cashier not found");
    }

    const updateData = {};

    if (full_name !== undefined) {
      if (!full_name || !full_name.trim()) {
        throw new Error("Cashier name is required");
      }
      updateData.full_name = full_name.trim();
    }

    if (phone_number !== undefined) {
      if (phone_number) {
        // Check if another cashier has this phone
        const existing = await db.select(
          "tbl_cashiers",
          "cashier_id",
          "phone_number = ? AND cashier_id != ?",
          [phone_number, cashierId]
        );
        if (existing) {
          throw new Error("Phone number already exists");
        }
      }
      updateData.phone_number = phone_number || null;
    }

    if (email !== undefined) {
      if (email) {
        // Check if another cashier has this email
        const existing = await db.select(
          "tbl_cashiers",
          "cashier_id",
          "email = ? AND cashier_id != ?",
          [email, cashierId]
        );
        if (existing) {
          throw new Error("Email already exists");
        }
      }
      updateData.email = email || null;
    }

    updateData.updated_at = new Date();

    await db.update(
      "tbl_cashiers",
      updateData,
      "cashier_id = ?",
      [cashierId]
    );

    return await this.getCashierById(cashierId);
  }

  /**
   * Activate cashier
   */
  async activateCashier(cashierId) {
    const cashier = await this.getCashierById(cashierId);
    if (!cashier) {
      throw new Error("Cashier not found");
    }

    await db.update(
      "tbl_cashiers",
      { is_active: 1, updated_at: new Date() },
      "cashier_id = ?",
      [cashierId]
    );

    return await this.getCashierById(cashierId);
  }

  /**
   * Deactivate cashier
   */
  async deactivateCashier(cashierId) {
    const cashier = await this.getCashierById(cashierId);
    if (!cashier) {
      throw new Error("Cashier not found");
    }

    await db.update(
      "tbl_cashiers",
      { is_active: 0, updated_at: new Date() },
      "cashier_id = ?",
      [cashierId]
    );

    return await this.getCashierById(cashierId);
  }

  /**
   * Delete cashier (soft delete by deactivating)
   * Note: Hard delete is not recommended as cashiers may have transaction history
   */
  async deleteCashier(cashierId) {
    return await this.deactivateCashier(cashierId);
  }
}

module.exports = new CashierRecordService();

