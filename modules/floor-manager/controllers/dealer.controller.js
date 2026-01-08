// ============================================
// FILE: modules/floor-manager/controllers/dealer.controller.js
// HTTP request handlers for dealers
// ============================================

const dealerService = require('../services/dealer.service');
const tableService = require('../services/table.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');
const { logAudit } = require('../../../utils/logger.util');

class DealerController {
  async getAllDealers(req, res) {
    try {
      const session = await tableService.getCurrentSession();
      const dealers = await dealerService.getAllDealers(session.session_id);
      return sendSuccess(res, 'Dealers retrieved', dealers);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async createDealer(req, res) {
    try {
      const result = await dealerService.createDealer(
        req.body,
        req.user.user_id
      );

      // Audit log
      await logAudit(
        req.user.user_id,
        "create_dealer",
        "tbl_dealers",
        result?.dealer_id ?? null,
        null,
        req.body,
        req.ip
      );

      return sendSuccess(res, "Dealer created successfully", result, 201);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async sendDealerOnBreak(req, res) {
    try {
      const { dealerId } = req.params;

      // Fetch old dealer state
      const oldData = await dealerService.getDealerById(dealerId);

      const result = await dealerService.sendDealerOnBreak(
        dealerId,
        req.user.user_id
      );

      // Audit log
      await logAudit(
        req.user.user_id,
        "dealer_break",
        "tbl_dealers",
        dealerId,
        oldData,
        { status: "on_break" },
        req.ip
      );

      return sendSuccess(res, 'Dealer sent on break', result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async markDealerAvailable(req, res) {
    try {
      const { dealerId } = req.params;

      // Fetch old dealer state
      const oldData = await dealerService.getDealerById(dealerId);

      const result = await dealerService.markDealerAvailable(
        dealerId,
        req.user.user_id
      );

      // Audit log
      await logAudit(
        req.user.user_id,
        "dealer_available",
        "tbl_dealers",
        dealerId,
        oldData,
        { status: "available" },
        req.ip
      );

      return sendSuccess(res, 'Dealer marked available', result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }
}

module.exports = new DealerController();
