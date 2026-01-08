// ============================================
// modules/kyc/index.js
// ============================================
const express = require('express');
const router = express.Router();
const kycRoutes = require('./routes/kyc.routes');

// Mount KYC routes
router.use('/', kycRoutes);

module.exports = router;