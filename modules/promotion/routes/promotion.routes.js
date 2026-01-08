// ============================================
// FILE: modules/promotion/routes/promotion.routes.js
// Promotion Management Routes
// ============================================

const express = require("express");
const router = express.Router();
const promotionController = require("../controllers/promotion.controller");
const { verifyToken } = require("../../../middleware/auth.middleware");

// All routes require authentication
router.use(verifyToken);

// Create promotion
router.post("/", promotionController.createPromotion.bind(promotionController));

// Get all promotions
router.get("/", promotionController.getAllPromotions.bind(promotionController));

// Get active promotions for deposit
router.get("/active", promotionController.getActivePromotionsForDeposit.bind(promotionController));

// Get promotion by ID
router.get("/:promotionId", promotionController.getPromotionById.bind(promotionController));

// Update promotion
router.put("/:promotionId", promotionController.updatePromotion.bind(promotionController));

// Delete promotion
router.delete("/:promotionId", promotionController.deletePromotion.bind(promotionController));

module.exports = router;

