const { sendError } = require('../utils/response.util');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error Stack:', err.stack);
  console.error('Error Details:', {
    message: err.message,
    name: err.name,
    code: err.code
  });

  // Handle validation errors
  if (err.name === 'ValidationError') {
    return sendError(res, err.message, 400);
  }

  // Handle duplicate entry errors (MySQL)
  if (err.code === 'ER_DUP_ENTRY') {
    return sendError(res, 'Duplicate entry - Record already exists', 409);
  }

  // Handle foreign key constraint errors
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return sendError(res, 'Invalid reference - Related record not found', 400);
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return sendError(res, 'Invalid token', 401);
  }

  if (err.name === 'TokenExpiredError') {
    return sendError(res, 'Token expired', 401);
  }

  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  
  return sendError(res, message, statusCode);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  return sendError(res, `Route ${req.originalUrl} not found`, 404);
};

module.exports = { 
  errorHandler,
  notFoundHandler
};