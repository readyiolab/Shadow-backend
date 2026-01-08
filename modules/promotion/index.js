// ============================================
// FILE: modules/promotion/index.js
// Main entry point for Promotion module
// ============================================

const express = require('express');
const router = express.Router();
const promotionRoutes = require('./routes/promotion.routes');

// Mount routes
router.use('/', promotionRoutes);

module.exports = router;

