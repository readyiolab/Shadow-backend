// ============================================
// middleware/player-auth.middleware.js
// ============================================
const authService = require('../modules/player-auth/services/auth.service');
const { sendError } = require('../utils/response.util');

// Verify player token
const verifyPlayerToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return sendError(res, 'Authorization token required', 401);
    }

    const decoded = authService.verifyPlayerToken(token);

    req.player = decoded;
    next();
  } catch (error) {
    return sendError(res, error.message || 'Unauthorized', 401);
  }
};

// Check if player has complete profile (name required)
const checkProfileComplete = (req, res, next) => {
  try {
    const playerName = req.player?.player_name;

    if (!playerName) {
      return sendError(
        res,
        'Please complete your profile first',
        400
      );
    }

    next();
  } catch (error) {
    return sendError(res, 'Unauthorized', 401);
  }
};

// Rate limiting for OTP requests
const otpRateLimit = {};

const limitOTPRequests = (req, res, next) => {
  const phoneNumber = req.body.phone_number;
  const now = Date.now();
  const window = 60 * 1000; // 1 minute
  const maxRequests = 3;

  if (!otpRateLimit[phoneNumber]) {
    otpRateLimit[phoneNumber] = [];
  }

  // Clean old requests
  otpRateLimit[phoneNumber] = otpRateLimit[phoneNumber].filter(
    (time) => now - time < window
  );

  if (otpRateLimit[phoneNumber].length >= maxRequests) {
    return sendError(
      res,
      'Too many OTP requests. Please try again later.',
      429
    );
  }

  otpRateLimit[phoneNumber].push(now);
  next();
};

module.exports = {
  verifyPlayerToken,
  checkProfileComplete,
  limitOTPRequests
};