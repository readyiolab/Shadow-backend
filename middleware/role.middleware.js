const { sendError } = require('../utils/response.util');

/**
 * Check if user has required role
 * @param  {...string} allowedRoles - Roles that are allowed
 */
const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Unauthorized - No user found', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, 'Access denied - Insufficient permissions', 403);
    }

    next();
  };
};

/**
 * Check if user is admin
 */
const isAdmin = checkRole('admin');

/**
 * Check if user is cashier or admin
 */
const isCashier = checkRole('cashier', 'admin');

/**
 * Check if user is floor manager, cashier, or admin
 * Floor managers have access to floor management features
 */
const isFloorManager = checkRole('floor_manager', 'cashier', 'admin');

/**
 * Check if user can access floor manager routes
 * Only floor_manager and admin roles
 */
const isFloorManagerOnly = checkRole('floor_manager', 'admin');

module.exports = { 
  checkRole,
  isAdmin,
  isCashier,
  isFloorManager,
  isFloorManagerOnly
};