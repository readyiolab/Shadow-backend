// ============================================
// FILE: modules/promotion/controllers/promotion.controller.js
// Promotion Management Controller
// ============================================

const promotionService = require("../services/promotion.service");
const { sendSuccess, sendError } = require("../../../utils/response.util");

class PromotionController {
  /**
   * Create new promotion
   */
  async createPromotion(req, res) {
    try {
      const result = await promotionService.createPromotion(
        req.body,
        req.user.user_id
      );
      return sendSuccess(res, "Promotion created successfully", result, 201);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  /**
   * Get all promotions
   */
  async getAllPromotions(req, res) {
    try {
      const promotions = await promotionService.getAllPromotions();
      return sendSuccess(res, "Promotions retrieved successfully", promotions);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  /**
   * Get promotion by ID
   */
  async getPromotionById(req, res) {
    try {
      const { promotionId } = req.params;
      const promotion = await promotionService.getPromotionById(promotionId);
      if (!promotion) {
        return sendError(res, "Promotion not found", 404);
      }
      return sendSuccess(res, "Promotion retrieved successfully", promotion);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  /**
   * Get active promotions for deposit amount
   */
  async getActivePromotionsForDeposit(req, res) {
    try {
      const { deposit_amount, player_id } = req.query;
      const depositAmount = parseFloat(deposit_amount);
      const playerId = player_id ? parseInt(player_id) : null;

      if (!depositAmount || depositAmount <= 0) {
        return sendError(res, "Invalid deposit amount", 400);
      }

      const promotions = await promotionService.getActivePromotionsForDeposit(
        depositAmount,
        playerId
      );
      return sendSuccess(res, "Active promotions retrieved successfully", promotions);
    } catch (error) {
      // If it's a restriction message, return it as an error
      if (error.message && (error.message.includes('already taken') || error.message.includes('limit reached'))) {
        return sendError(res, error.message, 400);
      }
      // For other errors, return empty array (no promotions available)
      return sendSuccess(res, "No active promotions available", []);
    }
  }

  /**
   * Update promotion
   */
  async updatePromotion(req, res) {
    try {
      const { promotionId } = req.params;
      const result = await promotionService.updatePromotion(
        promotionId,
        req.body,
        req.user.user_id
      );
      return sendSuccess(res, "Promotion updated successfully", result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  /**
   * Delete promotion
   */
  async deletePromotion(req, res) {
    try {
      const { promotionId } = req.params;
      const result = await promotionService.deletePromotion(promotionId);
      return sendSuccess(res, "Promotion deleted successfully", result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }
}

module.exports = new PromotionController();

