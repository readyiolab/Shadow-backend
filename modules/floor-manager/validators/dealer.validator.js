const { body, validationResult } = require('express-validator');

const validateDealer = [
  body('dealer_name')
    .notEmpty().withMessage('Dealer name is required')
    .isString().withMessage('Dealer name must be a string')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Dealer name must be 2-100 characters'),
  
  body('dealer_phone')
    .optional()
    .isMobilePhone().withMessage('Invalid phone number'),
  
  body('dealer_email')
    .optional()
    .isEmail().withMessage('Invalid email address'),
  
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
  validateDealer
};

