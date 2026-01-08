const { body, validationResult } = require('express-validator');

class TwoFactorAuthValidator {
  /**
   * Validation middleware runner
   */
  validate(validations) {
    return async (req, res, next) => {
      await Promise.all(validations.map(validation => validation.run(req)));

      const errors = validationResult(req);
      if (errors.isEmpty()) {
        return next();
      }

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    };
  }

  /**
   * Verify token validation
   */
  get verifyToken() {
    return this.validate([
      body('token')
        .notEmpty()
        .withMessage('Token is required')
        .isString()
        .withMessage('Token must be a string')
        .trim()
    ]);
  }

  /**
   * Disable 2FA validation
   */
  get disable() {
    return this.validate([
      body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isString()
        .withMessage('Password must be a string'),
      body('token')
        .notEmpty()
        .withMessage('2FA token is required')
        .isString()
        .withMessage('Token must be a string')
        .trim()
    ]);
  }
}

module.exports = new TwoFactorAuthValidator();