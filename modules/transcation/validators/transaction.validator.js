// modules/transaction/validators/transaction.validator.js


const { body } = require('express-validator');

const adjustBalanceValidator=[
  body('player_name').optional().trim(),
  body('phone_number').optional().trim().matches(/^\d{10}$/),
  body('player_id').optional().isInt(),
  body('adjustment_amount')
    .isFloat({ min: 0.01 }).withMessage('Adjustment amount must be greater than 0'),
  body('adjustment_type')
    .isIn(['winning', 'loss']).withMessage('Adjustment type must be "winning" or "loss"'),
  body('reason').optional().trim()
];
const depositChipsValidator = [
  body('player_name').trim().notEmpty().withMessage('Player name is required'),
  body('phone_number')
    .trim()
    .matches(/^\d{10}$/).withMessage('Valid 10-digit phone number is required'),
  body('chips_amount')
    .isFloat({ min: 1 }).withMessage('Chips amount must be greater than 0'),
  body('chip_breakdown').isObject().withMessage('Chip breakdown is required'),
  body('chip_breakdown.chips_100').optional().isInt({ min: 0 }),
  body('chip_breakdown.chips_500').optional().isInt({ min: 0 }),
  body('chip_breakdown.chips_1000').optional().isInt({ min: 0 }),
  body('chip_breakdown.chips_5000').optional().isInt({ min: 0 }),
  body('chip_breakdown.chips_10000').optional().isInt({ min: 0 })
];

// Helper: Validate chip breakdown structure
const chipBreakdownValidator = [
  body('chip_breakdown.chips_100')
    .optional()
    .isInt({ min: 0 }).withMessage('chips_100 must be non-negative integer'),
  body('chip_breakdown.chips_500')
    .optional()
    .isInt({ min: 0 }).withMessage('chips_500 must be non-negative integer'),
  body('chip_breakdown.chips_1000')
    .optional()
    .isInt({ min: 0 }).withMessage('chips_1000 must be non-negative integer'),
  body('chip_breakdown.chips_5000')
    .optional()
    .isInt({ min: 0 }).withMessage('chips_5000 must be non-negative integer'),
  body('chip_breakdown.chips_10000')
    .optional()
    .isInt({ min: 0 }).withMessage('chips_10000 must be non-negative integer')
];

// Helper: Validate chip breakdown matches amount
const validateChipBreakdownAmount = (req, res, next) => {
  const { chip_breakdown, amount, chips_amount } = req.body;
  
  if (!chip_breakdown) {
    return next(); // Optional, skip if not provided
  }

  const expectedAmount = parseFloat(chips_amount || amount);
  const calculatedAmount = 
    (parseInt(chip_breakdown.chips_100) || 0) * 100 +
    (parseInt(chip_breakdown.chips_500) || 0) * 500 +
    (parseInt(chip_breakdown.chips_1000) || 0) * 1000 +
    (parseInt(chip_breakdown.chips_5000) || 0) * 5000 +
    (parseInt(chip_breakdown.chips_10000) || 0) * 10000;

  if (calculatedAmount !== expectedAmount) {
    return res.status(400).json({
      success: false,
      error: `Chip breakdown (₹${calculatedAmount}) doesn't match transaction amount (₹${expectedAmount})`,
      provided_breakdown: chip_breakdown,
      calculated_value: calculatedAmount,
      expected_amount: expectedAmount
    });
  }

  next();
};

/**
 * ✅ BUY-IN VALIDATOR - With Chip Breakdown
 */
const buyInValidator = [
  // Player identification
  body('player_id')
    .optional()
    .isInt().withMessage('Player ID must be an integer'),
  body('player_code')
    .optional()
    .trim()
    .notEmpty().withMessage('Player code cannot be empty if provided'),
  body('player_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be 2-100 characters'),
  body('phone_number')
    .optional()
    .matches(/^[6-9]\d{9}$/).withMessage('Invalid Indian phone number'),

  // Transaction details
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 100 }).withMessage('Amount must be at least ₹100'),
  body('chips_amount')
    .optional()
    .isFloat({ min: 100 }).withMessage('Chips amount must be at least 100'),
  body('payment_mode')
    .notEmpty().withMessage('Payment mode is required')
    .isIn(['cash', 'online_sbi', 'online_hdfc', 'online_icici', 'online_other'])
    .withMessage('Invalid payment mode'),

  // ✅ Chip breakdown (optional but validated if provided)
  ...chipBreakdownValidator,
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),

  // Custom validator for chip breakdown amount
  validateChipBreakdownAmount
];

/**
 * ✅ CASH PAYOUT VALIDATOR - With Chip Breakdown
 */
const cashPayoutValidator = [
  // Player identification
  body('player_id')
    .optional()
    .isInt().withMessage('Player ID must be an integer'),
  body('player_code')
    .optional()
    .trim()
    .notEmpty().withMessage('Player code cannot be empty if provided'),
  body('player_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be 2-100 characters'),

  // Transaction details
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 100 }).withMessage('Amount must be at least ₹100'),
  body('chips_amount')
    .optional()
    .isFloat({ min: 100 }).withMessage('Chips amount must be at least 100'),

  // ✅ Chip breakdown (optional but validated if provided)
  ...chipBreakdownValidator,
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),

  validateChipBreakdownAmount
];

/**
 * ✅ RETURN CHIPS VALIDATOR - With Chip Breakdown
 */
const returnChipsValidator = [
  // Player identification
  body('player_id')
    .optional()
    .isInt().withMessage('Player ID must be an integer'),
  body('player_code')
    .optional()
    .trim()
    .notEmpty().withMessage('Player code cannot be empty if provided'),
  body('player_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be 2-100 characters'),

  // Transaction details
  body('chips_amount')
    .notEmpty().withMessage('Chips amount is required')
    .isFloat({ min: 100 }).withMessage('Chips amount must be at least 100'),

  // ✅ Chip breakdown (optional)
  ...chipBreakdownValidator,
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),

  // Custom validator
  (req, res, next) => {
    const { chip_breakdown, chips_amount } = req.body;
    
    if (!chip_breakdown) {
      return next();
    }

    const calculatedAmount = 
      (parseInt(chip_breakdown.chips_100) || 0) * 100 +
      (parseInt(chip_breakdown.chips_500) || 0) * 500 +
      (parseInt(chip_breakdown.chips_5000) || 0) * 5000 +
      (parseInt(chip_breakdown.chips_10000) || 0) * 10000;

    if (calculatedAmount !== parseFloat(chips_amount)) {
      return res.status(400).json({
        success: false,
        error: `Chip breakdown (₹${calculatedAmount}) doesn't match chips amount (₹${chips_amount})`
      });
    }

    next();
  }
];

/**
 * ✅ ISSUE CREDIT VALIDATOR - With Chip Breakdown
 */
const issueCreditValidator = [
  // Player identification
  body('player_id')
    .optional()
    .isInt().withMessage('Player ID must be an integer'),
  body('player_code')
    .optional()
    .trim()
    .notEmpty().withMessage('Player code cannot be empty if provided'),
  body('player_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be 2-100 characters'),

  // Credit details
  body('credit_amount')
    .notEmpty().withMessage('Credit amount is required')
    .isFloat({ min: 100 }).withMessage('Credit amount must be at least ₹100'),
  body('chips_amount')
    .optional()
    .isFloat({ min: 100 }).withMessage('Chips amount must be at least 100'),
  body('credit_request_id')
    .optional()
    .isInt().withMessage('Credit request ID must be an integer'),

  // ✅ Chip breakdown (optional)
  ...chipBreakdownValidator,
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters'),

  // Custom validator
  (req, res, next) => {
    const { chip_breakdown, chips_amount, credit_amount } = req.body;
    
    if (!chip_breakdown) {
      return next();
    }

    const expectedAmount = parseFloat(chips_amount || credit_amount);
    const calculatedAmount = 
      (parseInt(chip_breakdown.chips_100) || 0) * 100 +
      (parseInt(chip_breakdown.chips_500) || 0) * 500 +
      (parseInt(chip_breakdown.chips_1000) || 0) * 1000 +
      (parseInt(chip_breakdown.chips_5000) || 0) * 5000 +
      (parseInt(chip_breakdown.chips_10000) || 0) * 10000;

    if (calculatedAmount !== expectedAmount) {
      return res.status(400).json({
        success: false,
        error: `Chip breakdown (₹${calculatedAmount}) doesn't match credit amount (₹${expectedAmount})`
      });
    }

    next();
  }
];

/**
 * SETTLE CREDIT VALIDATOR (No chip breakdown needed)
 */
const settleCreditValidator = [
  body('player_id')
    .optional()
    .isInt().withMessage('Player ID must be an integer'),
  body('player_code')
    .optional()
    .trim()
    .notEmpty().withMessage('Player code cannot be empty if provided'),
  body('player_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be 2-100 characters'),

  body('settle_amount')
    .notEmpty().withMessage('Settlement amount is required')
    .isFloat({ min: 1 }).withMessage('Settlement amount must be at least ₹1'),
  body('payment_mode')
    .notEmpty().withMessage('Payment mode is required')
    .isIn(['cash', 'online_sbi', 'online_hdfc', 'online_icici', 'online_other'])
    .withMessage('Invalid payment mode'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

/**
 * EXPENSE VALIDATOR (No chip breakdown needed)
 */
const expenseValidator = [
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 1 }).withMessage('Amount must be at least ₹1'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

module.exports = {
  buyInValidator,
  cashPayoutValidator,
  returnChipsValidator,
  issueCreditValidator,
  settleCreditValidator,
  expenseValidator,
  chipBreakdownValidator,
  validateChipBreakdownAmount,
  depositChipsValidator,
  adjustBalanceValidator
};