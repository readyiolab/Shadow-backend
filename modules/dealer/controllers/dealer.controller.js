// modules/dealer/controllers/dealer.controller.js

const dealerService = require('../services/dealer.service');
const { sendSuccess, sendError, sendNotFound } = require('../../../utils/response.util');

class DealerController {
  // Create dealer
  async createDealer(req, res) {
    try {
      const result = await dealerService.createDealer(req.body, req.user.user_id);
      sendSuccess(res, 'Dealer created successfully', result, 201);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get all dealers
  async getAllDealers(req, res) {
    try {
      const filters = {
        is_active: req.query.is_active !== undefined ? parseInt(req.query.is_active) : undefined
      };
      const dealers = await dealerService.getAllDealers(filters);
      sendSuccess(res, 'Dealers retrieved', dealers);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get dealer by ID
  async getDealer(req, res) {
    try {
      const dealer = await dealerService.getDealer(req.params.dealerId);
      sendSuccess(res, 'Dealer retrieved', dealer);
    } catch (error) {
      sendNotFound(res, error.message);
    }
  }

  // Update dealer
  async updateDealer(req, res) {
    try {
      const result = await dealerService.updateDealer(req.params.dealerId, req.body, req.user.user_id);
      sendSuccess(res, 'Dealer updated successfully', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Deactivate dealer
  async deactivateDealer(req, res) {
    try {
      const result = await dealerService.deactivateDealer(req.params.dealerId);
      sendSuccess(res, 'Dealer deactivated', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Activate dealer
  async activateDealer(req, res) {
    try {
      const result = await dealerService.activateDealer(req.params.dealerId);
      sendSuccess(res, 'Dealer activated', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // ==========================================
  // TIPS
  // ==========================================

  // Record dealer tip
  async recordDealerTip(req, res) {
    try {
      const result = await dealerService.recordDealerTip(req.body, req.user.user_id);
      sendSuccess(res, 'Dealer tip recorded successfully', result);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get dealer tips for session
  async getDealerTipsForSession(req, res) {
    try {
      const tips = await dealerService.getDealerTipsForSession(req.params.sessionId);
      sendSuccess(res, 'Tips retrieved', tips);
    } catch (error) {
      sendError(res, error.message);
    }
  }

  // Get dealer tips summary
  async getDealerTipsSummary(req, res) {
    try {
      const summary = await dealerService.getDealerTipsSummary(
        req.params.dealerId,
        req.query.start_date,
        req.query.end_date
      );
      sendSuccess(res, 'Tips summary retrieved', summary);
    } catch (error) {
      sendError(res, error.message);
    }
  }
}

module.exports = new DealerController();
