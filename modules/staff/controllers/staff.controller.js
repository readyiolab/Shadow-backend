// modules/staff/controllers/staff.controller.js

const staffService = require('../services/staff.service');
const { sendSuccess, sendError, sendNotFound } = require('../../../utils/response.util');

class StaffController {
  // Create staff
  async createStaff(req, res) {
    try {
      const result = await staffService.createStaff(req.body, req.user.user_id);
      sendSuccess(res, 'Staff created successfully', result, 201);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get all staff
  async getAllStaff(req, res) {
    try {
      const filters = {
        is_active: req.query.is_active !== undefined ? parseInt(req.query.is_active) : undefined,
        staff_role: req.query.staff_role
      };
      const staff = await staffService.getAllStaff(filters);
      sendSuccess(res, 'Staff retrieved', staff);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get staff by ID
  async getStaff(req, res) {
    try {
      const staff = await staffService.getStaff(req.params.staffId);
      sendSuccess(res, 'Staff retrieved', staff);
    } catch (error) {
      sendNotFound(res, error.message);
    }
  }

  // Update staff
  async updateStaff(req, res) {
    try {
      const result = await staffService.updateStaff(req.params.staffId, req.body, req.user.user_id);
      sendSuccess(res, 'Staff updated successfully', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Delete staff
  async deleteStaff(req, res) {
    try {
      await staffService.deleteStaff(req.params.staffId);
      sendSuccess(res, 'Staff deleted successfully');
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Deactivate staff
  async deactivateStaff(req, res) {
    try {
      const result = await staffService.deactivateStaff(req.params.staffId);
      sendSuccess(res, 'Staff deactivated', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Activate staff
  async activateStaff(req, res) {
    try {
      const result = await staffService.activateStaff(req.params.staffId);
      sendSuccess(res, 'Staff activated', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // ==========================================
  // ATTENDANCE
  // ==========================================

  // Mark attendance
  async markAttendance(req, res) {
    try {
      const result = await staffService.markAttendance(
        req.params.staffId,
        req.body,
        req.user.userId
      );
      sendSuccess(res, 'Attendance marked successfully', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get staff attendance
  async getStaffAttendance(req, res) {
    try {
      const attendance = await staffService.getStaffAttendance(
        req.params.staffId,
        req.query.month
      );
      sendSuccess(res, 'Attendance retrieved', attendance);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get attendance by date
  async getAttendanceByDate(req, res) {
    try {
      const date = req.params.date || new Date().toISOString().split('T')[0];
      const attendance = await staffService.getAttendanceByDate(date);
      sendSuccess(res, 'Attendance retrieved', attendance);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // ==========================================
  // SALARY ADVANCES
  // ==========================================

  // Get remaining balance for advance
  async getRemainingBalance(req, res) {
    try {
      const balance = await staffService.getRemainingBalance(req.params.staffId);
      sendSuccess(res, 'Balance retrieved', balance);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Give salary advance
  async giveSalaryAdvance(req, res) {
    try {
      const result = await staffService.giveSalaryAdvance(
        req.params.staffId,
        req.body,
        req.body.session_id,
        req.user.userId
      );
      sendSuccess(res, 'Salary advance given successfully', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get advance history
  async getAdvanceHistory(req, res) {
    try {
      const history = await staffService.getAdvanceHistory(req.params.staffId);
      sendSuccess(res, 'Advance history retrieved', history);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get staff advances
  async getStaffAdvances(req, res) {
    try {
      const onlyPending = req.query.pending === 'true';
      const advances = await staffService.getStaffAdvances(req.params.staffId, onlyPending);
      sendSuccess(res, 'Advances retrieved', advances);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // ==========================================
  // SALARY
  // ==========================================

  // Calculate monthly salary
  async calculateMonthlySalary(req, res) {
    try {
      const month = req.query.month || new Date().toISOString().slice(0, 7);
      const calculation = await staffService.calculateMonthlySalary(req.params.staffId, month);
      sendSuccess(res, 'Salary calculated', calculation);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Process salary payment
  async processSalaryPayment(req, res) {
    try {
      const result = await staffService.processSalaryPayment(
        req.params.staffId,
        req.body.month,
        req.body.paid_amount,
        req.user.userId
      );
      sendSuccess(res, 'Salary processed successfully', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get salary history
  async getSalaryHistory(req, res) {
    try {
      const history = await staffService.getSalaryHistory(req.params.staffId);
      sendSuccess(res, 'Salary history retrieved', history);
    } catch (error) {
      sendError(res, error.message);
    }
  }
}

module.exports = new StaffController();
