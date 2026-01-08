// modules/admin/index.js

const express = require('express');
const router = express.Router();

// Import routes
const sessionRoutes = require('./routes/session.routes');
const userRoutes = require('./routes/user.routes');

/**
 * Admin Module Routes
 * Base path: /api/admin
 */

// Session management routes
// POST   /api/admin/session/open          - Open daily session
// POST   /api/admin/session/close         - Close daily session
// GET    /api/admin/session/status        - Get current session status
// GET    /api/admin/session/summaries     - Get all session summaries
// GET    /api/admin/session/summary/:id   - Get specific session summary
// GET    /api/admin/session/:id/summary-data - Get session summary data
router.use('/session', sessionRoutes);

// User management routes (for creating cashiers and floor managers)
// POST   /api/admin/users                 - Create new user (cashier/floor_manager)
// GET    /api/admin/users                 - Get all users
// GET    /api/admin/users/:id             - Get user by ID
// PUT    /api/admin/users/:id             - Update user
// POST   /api/admin/users/:id/reset-password - Reset user password
// POST   /api/admin/users/:id/deactivate  - Deactivate user
// POST   /api/admin/users/:id/activate    - Activate user
router.use('/users', userRoutes);

// Export the router directly (not as an object)
module.exports = router;