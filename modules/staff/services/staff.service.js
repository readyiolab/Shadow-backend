// modules/staff/services/staff.service.js
// Staff Management Service - Cleaner, Watchman, etc.

const db = require('../../../config/database');

class StaffService {
  // Generate unique staff code (ST00001, ST00002, etc.)
  async generateStaffCode() {
    const lastStaff = await db.query(
      'SELECT staff_code FROM tbl_staff ORDER BY staff_id DESC LIMIT 1'
    );

    if (!lastStaff || !lastStaff.staff_code) {
      return 'ST00001';
    }

    const lastNumber = parseInt(lastStaff.staff_code.replace('ST', ''));
    const newNumber = lastNumber + 1;
    return `ST${String(newNumber).padStart(5, '0')}`;
  }

  // Create new staff member
  async createStaff(data, userId) {
    if (!data.staff_name || !data.staff_role) {
      throw new Error('Staff name and role are required');
    }

    const staffCode = await this.generateStaffCode();
    
    // Calculate daily rate from monthly salary
    const monthlySalary = parseFloat(data.monthly_salary) || 0;
    const dailyRate = monthlySalary / 30;

    const result = await db.insert('tbl_staff', {
      staff_code: staffCode,
      staff_name: data.staff_name,
      phone_number: data.phone_number || null,
      staff_role: data.staff_role,
      staff_role_label: data.staff_role_label || this.getRoleLabel(data.staff_role),
      monthly_salary: monthlySalary,
      daily_rate: dailyRate,
      date_of_joining: data.date_of_joining || new Date(),
      shift: data.shift || 'day',
      experience_years: parseInt(data.experience_years) || 0,
      notes: data.notes || null,
      created_by: userId
    });

    return {
      staff_id: result.insert_id,
      staff_code: staffCode,
      staff_name: data.staff_name,
      staff_role: data.staff_role,
      monthly_salary: monthlySalary,
      shift: data.shift || 'day',
      experience_years: parseInt(data.experience_years) || 0
    };
  }

  getRoleLabel(role) {
    const labels = {
      floor_manager: 'Floor Manager',
      dealer: 'Dealer',
      security: 'Security / Bouncer',
      housekeeping: 'Housekeeping',
      receptionist: 'Receptionist',
      marketing: 'Marketing',
      cleaner: 'Cleaner',
      washroom_cleaner: 'Washroom Cleaner',
      watchman: 'Watchman',
      manager: 'Manager',
      assistant: 'Assistant',
      other: 'Other'
    };
    return labels[role] || 'Staff';
  }

  // Get all staff
  async getAllStaff(filters = {}) {
    let whereClause = '1=1';
    let params = [];

    if (filters.is_active !== undefined) {
      whereClause += ' AND is_active = ?';
      params.push(filters.is_active);
    }

    if (filters.staff_role) {
      whereClause += ' AND staff_role = ?';
      params.push(filters.staff_role);
    }

    const staff = await db.selectAll(
      'tbl_staff',
      '*',
      whereClause,
      params,
      'ORDER BY staff_name ASC'
    );

    return staff || [];
  }

  // Get staff by ID
  async getStaff(staffId) {
    const staff = await db.select(
      'tbl_staff',
      '*',
      'staff_id = ?',
      [staffId]
    );

    if (!staff) {
      throw new Error('Staff not found');
    }

    return staff;
  }

  // Update staff
  async updateStaff(staffId, data, userId) {
    const staff = await this.getStaff(staffId);

    const updateData = {};
    if (data.staff_name) updateData.staff_name = data.staff_name;
    if (data.phone_number !== undefined) updateData.phone_number = data.phone_number;
    if (data.staff_role) {
      updateData.staff_role = data.staff_role;
      updateData.staff_role_label = data.staff_role_label || this.getRoleLabel(data.staff_role);
    }
    if (data.monthly_salary !== undefined) {
      updateData.monthly_salary = parseFloat(data.monthly_salary);
      updateData.daily_rate = updateData.monthly_salary / 30;
    }
    if (data.shift !== undefined) updateData.shift = data.shift;
    if (data.experience_years !== undefined) updateData.experience_years = parseInt(data.experience_years) || 0;
    if (data.date_of_joining !== undefined) updateData.date_of_joining = data.date_of_joining;
    if (data.notes !== undefined) updateData.notes = data.notes;

    await db.update('tbl_staff', updateData, 'staff_id = ?', [staffId]);

    return { ...staff, ...updateData };
  }

  // Deactivate staff
  async deactivateStaff(staffId) {
    await db.update('tbl_staff', { is_active: 0 }, 'staff_id = ?', [staffId]);
    return { message: 'Staff deactivated successfully' };
  }

  // Activate staff
  async activateStaff(staffId) {
    await db.update('tbl_staff', { is_active: 1 }, 'staff_id = ?', [staffId]);
    return { message: 'Staff activated successfully' };
  }

  // Delete staff
  async deleteStaff(staffId) {
    const staff = await this.getStaff(staffId);
    await db.query('DELETE FROM tbl_staff WHERE staff_id = ?', [staffId]);
    return { message: 'Staff deleted successfully' };
  }

  // ==========================================
  // ATTENDANCE MANAGEMENT
  // ==========================================

  // Mark attendance
  async markAttendance(staffId, data, userId) {
    const staff = await this.getStaff(staffId);
    const attendanceDate = data.attendance_date || new Date().toISOString().split('T')[0];

    // Check if attendance already marked
    const existing = await db.select(
      'tbl_staff_attendance',
      '*',
      'staff_id = ? AND attendance_date = ?',
      [staffId, attendanceDate]
    );

    let deductionAmount = 0;
    if (data.status === 'absent') {
      deductionAmount = staff.daily_rate;
    } else if (data.status === 'half_day') {
      deductionAmount = staff.daily_rate / 2;
    }

    if (existing) {
      // Update existing attendance
      await db.update('tbl_staff_attendance', {
        status: data.status,
        check_in_time: data.check_in_time || null,
        check_out_time: data.check_out_time || null,
        deduction_amount: deductionAmount,
        deduction_reason: data.deduction_reason || null,
        notes: data.notes || null,
        marked_by: userId
      }, 'attendance_id = ?', [existing.attendance_id]);

      return { attendance_id: existing.attendance_id, updated: true };
    } else {
      // Create new attendance
      const result = await db.insert('tbl_staff_attendance', {
        staff_id: staffId,
        attendance_date: attendanceDate,
        status: data.status || 'present',
        check_in_time: data.check_in_time || null,
        check_out_time: data.check_out_time || null,
        deduction_amount: deductionAmount,
        deduction_reason: data.deduction_reason || null,
        notes: data.notes || null,
        marked_by: userId
      });

      // Update staff absence count if absent
      if (data.status === 'absent') {
        await db.query(
          'UPDATE tbl_staff SET total_absences = total_absences + 1 WHERE staff_id = ?',
          [staffId]
        );
      }

      return { attendance_id: result.insert_id, created: true };
    }
  }

  // Get attendance for staff
  async getStaffAttendance(staffId, month = null) {
    let whereClause = 'staff_id = ?';
    let params = [staffId];

    if (month) {
      whereClause += ' AND DATE_FORMAT(attendance_date, "%Y-%m") = ?';
      params.push(month);
    }

    const attendance = await db.selectAll(
      'tbl_staff_attendance',
      '*',
      whereClause,
      params,
      'ORDER BY attendance_date DESC'
    );

    return attendance || [];
  }

  // Get all attendance for a date
  async getAttendanceByDate(date) {
    const attendance = await db.queryAll(`
      SELECT a.*, s.staff_name, s.staff_role, s.daily_rate
      FROM tbl_staff_attendance a
      JOIN tbl_staff s ON a.staff_id = s.staff_id
      WHERE a.attendance_date = ?
      ORDER BY s.staff_name
    `, [date]);

    return attendance || [];
  }

  // ==========================================
  // SALARY ADVANCE MANAGEMENT
  // ==========================================

  // Get remaining salary balance (monthly salary - advances taken this month)
  async getRemainingBalance(staffId) {
    const staff = await this.getStaff(staffId);
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // Get total advances for current month that are not yet deducted
    const advances = await db.selectAll(
      'tbl_salary_advances',
      'SUM(advance_amount) as total_advances',
      'staff_id = ? AND for_month = ? AND is_deducted = 0',
      [staffId, currentMonth]
    );
    
    const totalAdvances = parseFloat(advances?.[0]?.total_advances || 0);
    const monthlySalary = parseFloat(staff.monthly_salary);
    const remainingBalance = monthlySalary - totalAdvances;
    
    return {
      staff_id: staffId,
      staff_name: staff.staff_name,
      monthly_salary: monthlySalary,
      total_advances_this_month: totalAdvances,
      remaining_balance: remainingBalance,
      for_month: currentMonth
    };
  }

  // Give salary advance
  async giveSalaryAdvance(staffId, data, sessionId, userId) {
    const staff = await this.getStaff(staffId);
    const amount = parseFloat(data.advance_amount);

    if (!amount || amount <= 0) {
      throw new Error('Invalid advance amount');
    }

    const forMonth = data.for_month || new Date().toISOString().slice(0, 7);
    
    // Check remaining balance
    const balanceInfo = await this.getRemainingBalance(staffId);
    if (amount > balanceInfo.remaining_balance) {
      throw new Error(`Advance amount exceeds remaining balance. Available: ₹${balanceInfo.remaining_balance}`);
    }

    const result = await db.insert('tbl_salary_advances', {
      staff_id: staffId,
      session_id: sessionId,
      advance_amount: amount,
      for_month: forMonth,
      notes: data.notes || null,
      approved_by: userId
    });

    // Update staff total advances
    await db.query(
      'UPDATE tbl_staff SET total_advances_given = total_advances_given + ? WHERE staff_id = ?',
      [amount, staffId]
    );

    // Get updated balance
    const updatedBalance = await this.getRemainingBalance(staffId);

    return {
      advance_id: result.insert_id,
      staff_id: staffId,
      staff_name: staff.staff_name,
      advance_amount: amount,
      for_month: forMonth,
      remaining_balance: updatedBalance.remaining_balance
    };
  }

  // Get advance history for a staff member
  async getAdvanceHistory(staffId) {
    const advances = await db.selectAll(
      'tbl_salary_advances',
      '*',
      'staff_id = ?',
      [staffId],
      'ORDER BY created_at DESC'
    );
    
    return advances || [];
  }

  // Get staff advances
  async getStaffAdvances(staffId, onlyPending = false) {
    let whereClause = 'staff_id = ?';
    let params = [staffId];

    if (onlyPending) {
      whereClause += ' AND is_deducted = 0';
    }

    const advances = await db.selectAll(
      'tbl_salary_advances',
      '*',
      whereClause,
      params,
      'ORDER BY created_at DESC'
    );

    return advances || [];
  }

  // ==========================================
  // SALARY CALCULATION & PAYMENT
  // ==========================================

  // Calculate monthly salary
  async calculateMonthlySalary(staffId, month) {
    const staff = await this.getStaff(staffId);

    // Get attendance for the month
    const attendance = await this.getStaffAttendance(staffId, month);

    // Count days
    let daysPresent = 0;
    let daysAbsent = 0;
    let halfDays = 0;
    let totalDeductions = 0;

    attendance.forEach(record => {
      if (record.status === 'present') daysPresent++;
      else if (record.status === 'absent') daysAbsent++;
      else if (record.status === 'half_day') halfDays++;
      totalDeductions += parseFloat(record.deduction_amount || 0);
    });

    // Get pending advances
    const advances = await this.getStaffAdvances(staffId, true);
    let advancesToDeduct = 0;
    advances.forEach(adv => {
      if (adv.for_month <= month) {
        advancesToDeduct += parseFloat(adv.advance_amount);
      }
    });

    // Calculate
    const grossSalary = staff.monthly_salary;
    const netSalary = grossSalary - totalDeductions - advancesToDeduct;

    return {
      staff_id: staffId,
      staff_name: staff.staff_name,
      salary_month: month,
      base_salary: grossSalary,
      total_working_days: attendance.length,
      days_present: daysPresent,
      days_absent: daysAbsent,
      half_days: halfDays,
      gross_salary: grossSalary,
      deductions: totalDeductions,
      advances_adjusted: advancesToDeduct,
      net_salary: Math.max(0, netSalary),
      pending_advances: advances
    };
  }

  // Process salary payment
  async processSalaryPayment(staffId, month, paidAmount, userId) {
    const calculation = await this.calculateMonthlySalary(staffId, month);

    // Check if already processed
    const existing = await db.select(
      'tbl_staff_salary_records',
      '*',
      'staff_id = ? AND salary_month = ?',
      [staffId, month]
    );

    if (existing && existing.is_paid) {
      throw new Error('Salary already paid for this month');
    }

    const salaryData = {
      staff_id: staffId,
      salary_month: month,
      base_salary: calculation.base_salary,
      total_working_days: calculation.total_working_days,
      days_present: calculation.days_present,
      days_absent: calculation.days_absent,
      half_days: calculation.half_days,
      gross_salary: calculation.gross_salary,
      deductions: calculation.deductions,
      advances_adjusted: calculation.advances_adjusted,
      net_salary: calculation.net_salary,
      is_paid: 1,
      paid_amount: paidAmount || calculation.net_salary,
      paid_at: new Date(),
      paid_by: userId
    };

    if (existing) {
      await db.update('tbl_staff_salary_records', salaryData, 'salary_id = ?', [existing.salary_id]);
    } else {
      await db.insert('tbl_staff_salary_records', salaryData);
    }

    // Mark advances as deducted
    for (const advance of calculation.pending_advances) {
      if (advance.for_month <= month) {
        await db.update('tbl_salary_advances', {
          is_deducted: 1,
          deducted_in_month: month,
          deducted_at: new Date()
        }, 'advance_id = ?', [advance.advance_id]);
      }
    }

    // Update staff total salary paid
    await db.query(
      'UPDATE tbl_staff SET total_salary_paid = total_salary_paid + ? WHERE staff_id = ?',
      [paidAmount || calculation.net_salary, staffId]
    );

    return {
      ...calculation,
      paid_amount: paidAmount || calculation.net_salary,
      message: 'Salary processed successfully'
    };
  }

  // Get salary history
  async getSalaryHistory(staffId) {
    const records = await db.selectAll(
      'tbl_staff_salary_records',
      '*',
      'staff_id = ?',
      [staffId],
      'ORDER BY salary_month DESC'
    );

    return records || [];
  }
}

module.exports = new StaffService();
