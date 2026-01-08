// modules/expense/controllers/expense.controller.js

const expenseService = require('../services/expense.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');

class ExpenseController {
  // ==========================================
  // PLAYER EXPENSES
  // ==========================================

  // Record player expense
  async recordPlayerExpense(req, res) {
    try {
      const result = await expenseService.recordPlayerExpense(req.body, req.user.user_id);
      sendSuccess(res, 'Player expense recorded successfully', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get player expenses for session
  async getPlayerExpensesForSession(req, res) {
    try {
      const expenses = await expenseService.getPlayerExpensesForSession(req.params.sessionId);
      sendSuccess(res, 'Player expenses retrieved', expenses);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // ==========================================
  // CLUB EXPENSES
  // ==========================================

  // Record club expense
  async recordClubExpense(req, res) {
    try {
      const result = await expenseService.recordClubExpense(req.body, req.user.user_id);
      sendSuccess(res, 'Club expense recorded successfully', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get club expenses for session
  async getClubExpensesForSession(req, res) {
    try {
      const expenses = await expenseService.getClubExpensesForSession(req.params.sessionId);
      sendSuccess(res, 'Club expenses retrieved', expenses);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get expense summary
  async getExpenseSummary(req, res) {
    try {
      const summary = await expenseService.getExpenseSummary(req.params.sessionId);
      sendSuccess(res, 'Expense summary retrieved', summary);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Upload attachment for expense
  async uploadAttachment(req, res) {
    try {
      if (!req.file) {
        return sendError(res, 'No attachment file uploaded', 400);
      }

      const { uploadToCloudinary } = require('../../../config/cloudinary.config');
      
      // Upload to Cloudinary
      const uploadResult = await uploadToCloudinary(req.file, 'royal-flush/expenses/attachments');
      
      if (!uploadResult.success) {
        return sendError(res, uploadResult.error || 'Failed to upload attachment to Cloudinary', 500);
      }

      return sendSuccess(
        res,
        'Attachment uploaded successfully',
        {
          url: uploadResult.url,
          public_id: uploadResult.public_id
        },
        200
      );
    } catch (error) {
      sendError(res, error.message || 'Failed to upload attachment');
    }
  }
}

module.exports = new ExpenseController();
