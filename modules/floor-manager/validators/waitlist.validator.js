const { body, validationResult } = require('express-validator');

const validateWaitlist = [
  body('player_name')
    .notEmpty().withMessage('Player name is required')
    .isString().withMessage('Player name must be a string')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be 2-100 characters'),
  
  body('requested_table_id')
    .optional()
    .isInt().withMessage('Table ID must be an integer'),
  
  body('requested_game_type')
    .optional()
    .isString().withMessage('Game type must be a string')
    .trim(),
  
  
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

module.exports = {
  validateWaitlist
};