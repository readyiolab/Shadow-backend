// ============================================
// FILE: modules/floor-manager/index.js
// Main entry point for Floor Manager module
// ============================================

const express = require('express');
const router = express.Router();

// Import all route files
const tableRoutes = require('./routes/table.routes');
const playerRoutes = require('./routes/player.routes');
const dealerRoutes = require('./routes/dealer.routes');
const waitlistRoutes = require('./routes/waitlist.route');

// Mount routes
router.use('/tables', tableRoutes);
router.use('/players', playerRoutes);
router.use('/dealers', dealerRoutes);
router.use('/waitlist', waitlistRoutes);

module.exports = router;
