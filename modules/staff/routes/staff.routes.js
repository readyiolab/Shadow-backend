// modules/staff/routes/staff.routes.js

const express = require('express');
const router = express.Router();
const staffController = require('../controllers/staff.controller');
const { verifyToken } = require('../../../middleware/auth.middleware');
const { checkRole } = require('../../../middleware/role.middleware');

// All routes require authentication
router.use(verifyToken);

// Staff CRUD - Admin only
router.post('/', checkRole('admin'), staffController.createStaff);
router.get('/', staffController.getAllStaff);
router.get('/:staffId', staffController.getStaff);
router.put('/:staffId', checkRole('admin'), staffController.updateStaff);
router.delete('/:staffId', checkRole('admin'), staffController.deleteStaff);
router.put('/:staffId/deactivate', checkRole('admin'), staffController.deactivateStaff);
router.put('/:staffId/activate', checkRole('admin'), staffController.activateStaff);

// Attendance
router.post('/:staffId/attendance', staffController.markAttendance);
router.get('/:staffId/attendance', staffController.getStaffAttendance);
router.get('/attendance/date/:date', staffController.getAttendanceByDate);

// Salary Advances
router.get('/:staffId/balance', staffController.getRemainingBalance);
router.post('/:staffId/advance', checkRole('admin'), staffController.giveSalaryAdvance);
router.get('/:staffId/advances', staffController.getStaffAdvances);
router.get('/:staffId/advance-history', staffController.getAdvanceHistory);

// Salary
router.get('/:staffId/salary/calculate', staffController.calculateMonthlySalary);
router.post('/:staffId/salary/pay', checkRole('admin'), staffController.processSalaryPayment);
router.get('/:staffId/salary/history', staffController.getSalaryHistory);

module.exports = router;
