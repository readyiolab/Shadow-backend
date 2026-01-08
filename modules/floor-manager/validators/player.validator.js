const { body, validationResult } = require('express-validator');

const validateAddPlayer = [
  body('table_id')
    .notEmpty().withMessage('Table ID is required')
    .isInt().withMessage('Table ID must be an integer'),
  
  body('player_name')
    .notEmpty().withMessage('Player name is required')
    .isString().withMessage('Player name must be a string')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be 2-100 characters'),
  
  body('seat_number')
    .notEmpty().withMessage('Seat number is required')
    .isInt({ min: 1, max: 10 }).withMessage('Seat number must be between 1 and 10'),
  
  body('buy_in_amount')
    .notEmpty().withMessage('Buy-in amount is required')
    .isFloat({ min: 0 }).withMessage('Buy-in amount must be a positive number'),
  
  body('player_phone')
    .optional()
    .isMobilePhone().withMessage('Invalid phone number'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateRebuy = [
  body('table_player_id')
    .notEmpty().withMessage('Table player ID is required')
    .isInt().withMessage('Table player ID must be an integer'),
  
  body('rebuy_amount')
    .notEmpty().withMessage('Rebuy amount is required')
    .isFloat({ min: 0 }).withMessage('Rebuy amount must be a positive number'),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  validateAddPlayer,
  validateRebuy
};