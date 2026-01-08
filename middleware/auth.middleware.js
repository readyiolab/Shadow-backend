// ============================================
// MIDDLEWARE (middleware/auth.middleware.js)
// ============================================

const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt.config');
const db = require('../config/database');

/**
 * Verify JWT token
 */
const verifyToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, jwtConfig.secret);

    // Check if session exists and is valid
    const session = await db.select(
      'tbl_sessions',
      '*',
      'token = ? AND user_id = ? AND expires_at > NOW()',
      [token, decoded.user_id]
    );

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired session. Please login again.'
      });
    }

    // Attach user info to request
    req.user = {
      user_id: decoded.user_id,
      username: decoded.username,
      role: decoded.role
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

/**
 * Require specific role(s)
 * Usage: requireRole('admin') or requireRole(['admin', 'cashier'])
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
};

/**
 * Check if session is open (for cashier operations)
 */
const requireActiveSession = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const session = await db.select(
      'tbl_daily_sessions',
      '*',
      'session_date = ?',
      [today]
    );

    if (!session) {
      return res.status(400).json({
        success: false,
        message: 'No session opened for today. Please contact admin.'
      });
    }

    if (session.is_closed) {
      return res.status(400).json({
        success: false,
        message: 'Session is closed. No transactions allowed.'
      });
    }

    req.session = session;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error checking session status'
    });
  }
};

module.exports = {
  verifyToken,
  requireRole,
  requireActiveSession
};
