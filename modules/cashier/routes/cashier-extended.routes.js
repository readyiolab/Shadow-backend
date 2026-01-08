// modules/cashier/routes/cashier-extended.routes.js
// Extended routes for Cashier Shift, Cashbook, Chip Ledger, Credit Register

const express = require("express");
const router = express.Router();
const cashierShiftService = require("../services/cashier-shift.service");
const cashbookService = require("../services/cashbook.service");
const cashierService = require("../services/cashier.service");
const cashierRecordService = require("../services/cashier-record.service");
const userService = require("../../admin/services/user.service");
const transactionService = require("../../transcation/services/transaction.service");
const { verifyToken } = require('../../../middleware/auth.middleware');
const { checkRole, isFloorManager } = require('../../../middleware/role.middleware');

router.use(verifyToken);
// ==========================================
// CASHIER SHIFT ROUTES
// ==========================================

// Get session cashiers info (for header: "3/2 cashiers")
router.get("/shift/session-info",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const session = await cashierService.getTodaySession();
    if (!session) {
      return res.json({
        success: true,
        data: {
          total_cashiers: 0,
          active_cashiers: 0,
          display_text: "No active session",
          cashiers: [],
        },
      });
    }

    const info = await cashierShiftService.getSessionCashiersInfo(
      session.session_id
    );
    res.json({ success: true, data: info });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Start shift (called when cashier opens session or takes over)
router.post("/shift/start",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const session = await cashierService.getTodaySession();
    if (!session) {
      return res
        .status(400)
        .json({ success: false, message: "No active session" });
    }

    const isOpener = req.body.is_opener || false;
    // Allow cashier_id to be specified (for assigning shifts to other cashiers)
    // If not provided, use the logged-in user's ID
    const cashierId = req.body.cashier_id || req.user.user_id;
    
    const result = await cashierShiftService.startShift(
      session.session_id,
      cashierId,
      isOpener
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get active shift for current cashier
router.get("/shift/active",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const session = await cashierService.getTodaySession();
    if (!session) {
      return res.json({ success: true, data: null });
    }

    const shift = await cashierShiftService.getActiveShift(
      session.session_id,
      req.user.user_id
    );

    res.json({ success: true, data: shift });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// End shift
router.post("/shift/end",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const { shift_id, handover_notes } = req.body;

    if (!shift_id) {
      return res
        .status(400)
        .json({ success: false, message: "Shift ID required" });
    }

    const result = await cashierShiftService.endShift(
      shift_id,
      handover_notes
    );

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all shifts for current session
router.get("/shift/all",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const session = await cashierService.getTodaySession();
    if (!session) {
      return res.json({ success: true, data: [] });
    }

    const shifts = await cashierShiftService.getSessionShifts(
      session.session_id
    );

    res.json({ success: true, data: shifts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Download shift report CSV
router.get("/shift/:shiftId/csv",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const csv = await cashierShiftService.generateShiftCSV(req.params.shiftId);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=shift_report_${req.params.shiftId}.csv`
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// DAILY CASHBOOK ROUTES
// ==========================================

// Get cashbook for today
router.get("/cashbook/today",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const data = await cashbookService.getCashbookByDate(today);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get cashbook for specific date
router.get("/cashbook/date/:date",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const data = await cashbookService.getCashbookByDate(req.params.date);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// EXPENSE REPORT ROUTES
// ==========================================

// Get expense report for today
router.get("/expenses/today", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const data = await cashbookService.getExpenseReportByDate(today);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get expense report for specific date
router.get("/expenses/date/:date", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const data = await cashbookService.getExpenseReportByDate(req.params.date);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get cashbook for date range
router.get("/cashbook/range", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ success: false, message: "Start and end dates required" });
    }

    const data = await cashbookService.getCashbookRange(start_date, end_date);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Export cashbook CSV
router.get("/cashbook/export",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ success: false, message: "Start and end dates required" });
    }

    const csv = await cashbookService.exportCashbookCSV(start_date, end_date);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=cashbook_${start_date}_to_${end_date}.csv`
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Email cashbook report
router.post("/cashbook/email",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const { start_date, end_date, recipients } = req.body;

    if (!start_date || !end_date || !recipients || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Start date, end date, and recipients required",
      });
    }

    // Generate CSV
    const csv = await cashbookService.exportCashbookCSV(start_date, end_date);

    // TODO: Implement actual email sending
    // For now, log the request
    await cashbookService.logEmailReport(
      "cashbook",
      start_date,
      end_date,
      recipients,
      req.user.user_id,
      "pending"
    );

    res.json({
      success: true,
      message: "Cashbook report email queued",
      data: { start_date, end_date, recipients },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// CHIP LEDGER ROUTES
// ==========================================

// Get chip ledger for today
router.get("/chip-ledger/today",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const data = await cashbookService.getChipLedgerByDate(today);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get chip ledger for specific date
router.get("/chip-ledger/date/:date", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const data = await cashbookService.getChipLedgerByDate(req.params.date);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Export chip ledger CSV
router.get("/chip-ledger/export",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ success: false, message: "Start and end dates required" });
    }

    const csv = await cashbookService.exportChipLedgerCSV(start_date, end_date);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=chip_ledger_${start_date}_to_${end_date}.csv`
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Email chip ledger report
router.post("/chip-ledger/email",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const { start_date, end_date, recipients } = req.body;

    if (!start_date || !end_date || !recipients || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Start date, end date, and recipients required",
      });
    }

    await cashbookService.logEmailReport(
      "chip_ledger",
      start_date,
      end_date,
      recipients,
      req.user.user_id,
      "pending"
    );

    res.json({
      success: true,
      message: "Chip ledger report email queued",
      data: { start_date, end_date, recipients },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// CREDIT REGISTER ROUTES
// ==========================================

// Get credit register for today
router.get("/credit-register/today",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const data = await cashbookService.getCreditRegisterByDate(today);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get credit register for specific date
router.get(
  "/credit-register/date/:date",
  checkRole('cashier', 'admin'),
  async (req, res) => {
    try {
      const data = await cashbookService.getCreditRegisterByDate(
        req.params.date
      );
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Get all outstanding credits
router.get(
  "/credit-register/outstanding",
  checkRole('cashier', 'admin'),
  async (req, res) => {
    try {
      const data = await cashbookService.getAllOutstandingCredits();
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// Export credit register CSV
router.get("/credit-register/export",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      return res
        .status(400)
        .json({ success: false, message: "Start and end dates required" });
    }

    const csv = await cashbookService.exportCreditRegisterCSV(
      start_date,
      end_date
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=credit_register_${start_date}_to_${end_date}.csv`
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Email credit register report
router.post("/credit-register/email",  checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const { start_date, end_date, recipients } = req.body;

    if (!start_date || !end_date || !recipients || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Start date, end date, and recipients required",
      });
    }

    await cashbookService.logEmailReport(
      "credit_register",
      start_date,
      end_date,
      recipients,
      req.user.user_id,
      "pending"
    );

    res.json({
      success: true,
      message: "Credit register report email queued",
      data: { start_date, end_date, recipients },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==========================================
// DELETE ALL ROUTES
// ==========================================

// Delete all transactions for a date (admin only)
router.delete(
  "/cashbook/delete-all/:date",
  checkRole('cashier', 'admin'),
  async (req, res) => {
    try {
      const result = await cashbookService.deleteAllTransactionsForDate(
        req.params.date,
        req.user.user_id
      );
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
);

// ==========================================
// CASHIER MANAGEMENT ROUTES (Cashier & Admin)
// ==========================================

// Get all cashiers (from tbl_cashiers, not tbl_users)
router.get("/cashiers", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const cashiers = await cashierRecordService.getAllCashiers();
    res.json({
      success: true,
      message: 'Cashiers retrieved successfully',
      data: cashiers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Create new cashier (in tbl_cashiers, not tbl_users)
router.post("/cashiers", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const result = await cashierRecordService.createCashier(req.body);
    res.status(201).json({
      success: true,
      message: 'Cashier created successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Get cashier by ID (from tbl_cashiers)
router.get("/cashiers/:id", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const cashier = await cashierRecordService.getCashierById(req.params.id);
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }
    res.json({
      success: true,
      data: cashier
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message
    });
  }
});

// Update cashier (in tbl_cashiers)
router.put("/cashiers/:id", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const result = await cashierRecordService.updateCashier(req.params.id, req.body);
    res.json({
      success: true,
      message: 'Cashier updated successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Deactivate cashier (in tbl_cashiers)
router.post("/cashiers/:id/deactivate", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const result = await cashierRecordService.deactivateCashier(req.params.id);
    res.json({
      success: true,
      message: 'Cashier deactivated successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Activate cashier (in tbl_cashiers)
router.post("/cashiers/:id/activate", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const result = await cashierRecordService.activateCashier(req.params.id);
    res.json({
      success: true,
      message: 'Cashier activated successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// ==========================================
// AUDIT LOG - REVERSALS ROUTES
// ==========================================
router.get("/reversals", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const filters = {
      date: req.query.date || null,
      category: req.query.category || 'all',
      search: req.query.search || null
    };
    const result = await cashbookService.getReversals(filters);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/reversals/:transactionId", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const { transactionId } = req.params;
    const reversal = await transactionService.getTransactionById(transactionId);
    
    if (!reversal || reversal.transaction_type !== 'reversal') {
      return res.status(404).json({ success: false, message: "Reversal not found" });
    }
    
    // Get original transaction
    const originalTransaction = reversal.original_transaction_id 
      ? await transactionService.getTransactionById(reversal.original_transaction_id)
      : null;
    
    res.json({ 
      success: true, 
      data: {
        reversal,
        originalTransaction
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all transactions for a specific cashier
router.get("/cashier/:cashier_id/transactions", checkRole('cashier', 'admin'), async (req, res) => {
  try {
    const { cashier_id } = req.params;
    const { session_id } = req.query; // Optional session filter
    
    const result = await cashierShiftService.getCashierTransactions(
      parseInt(cashier_id),
      session_id ? parseInt(session_id) : null
    );
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;