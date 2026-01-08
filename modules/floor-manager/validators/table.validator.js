const { body, validationResult } = require('express-validator');

const validateTableCreate = [
  body('table_number')
    .notEmpty().withMessage('Table number is required')
    .isString().withMessage('Table number must be a string')
    .trim(),
  
  body('table_name')
    .notEmpty().withMessage('Table name is required')
    .isString().withMessage('Table name must be a string')
    .trim(),
  
  body('game_type')
    .notEmpty().withMessage('Game type is required')
    .isIn(['Texas Hold\'em', 'Omaha', '7 Card Stud', 'Mixed Games'])
    .withMessage('Invalid game type'),
  
  body('stakes')
    .notEmpty().withMessage('Stakes are required')
    .isString().withMessage('Stakes must be a string')
    .trim(),
  
  body('max_seats')
    .notEmpty().withMessage('Max seats is required')
    .isInt({ min: 2, max: 10 }).withMessage('Max seats must be between 2 and 10'),
  
  body('dealer_id')
    .optional()
    .isInt().withMessage('Dealer ID must be an integer'),
  
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

const validateDealerAssign = [
  body('table_id')
    .notEmpty().withMessage('Table ID is required')
    .isInt().withMessage('Table ID must be an integer'),
  
  body('dealer_id')
    .notEmpty().withMessage('Dealer ID is required')
    .isInt().withMessage('Dealer ID must be an integer'),
  
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
  validateTableCreate,
  validateDealerAssign
};
