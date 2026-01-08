const { body, param } = require('express-validator');

/**
 * ✅ Open Session Validator
 */
const openSessionValidator = [
  body('owner_float')
    .notEmpty()
    .withMessage('Owner float is required')
    .isFloat({ min: 1 })
    .withMessage('Owner float must be a positive number')
];

/**
 * ✅ Set Chip Inventory Validator
 */
const setChipInventoryValidator = [
  body('chips_100')
    .optional()
    .isInt({ min: 0 })
    .withMessage('chips_100 must be a non-negative integer'),
  body('chips_500')
    .optional()
    .isInt({ min: 0 })
    .withMessage('chips_500 must be a non-negative integer'),
  body('chips_5000')
    .optional()
    .isInt({ min: 0 })
    .withMessage('chips_5000 must be a non-negative integer'),
  body('chips_10000')
    .optional()
    .isInt({ min: 0 })
    .withMessage('chips_10000 must be a non-negative integer')
];

/**
 * ✅ Update Chip Inventory Adjustment Validator
 */
const updateChipInventoryValidator = [
  body('chips_100')
    .optional()
    .isInt()
    .withMessage('chips_100 must be an integer'),
  body('chips_500')
    .optional()
    .isInt()
    .withMessage('chips_500 must be an integer'),
  body('chips_5000')
    .optional()
    .isInt()
    .withMessage('chips_5000 must be an integer'),
  body('chips_10000')
    .optional()
    .isInt()
    .withMessage('chips_10000 must be an integer'),
  body('adjustment_reason')
    .notEmpty()
    .withMessage('Adjustment reason is required')
    .isString()
    .withMessage('Adjustment reason must be a string')
];

/**
 * ✅ Add Cash Float Validator
 */
const addCashFloatValidator = [
  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .isFloat({ min: 1 })
    .withMessage('Amount must be a positive number'),
  body('notes')
    .optional()
    .isString()
    .withMessage('Notes must be a string'),
  body('chip_breakdown')
    .optional()
    .isObject()
    .withMessage('Chip breakdown must be an object'),
  body('chip_breakdown.chips_100')
    .optional()
    .isInt({ min: 0 })
    .withMessage('chips_100 must be a non-negative integer'),
  body('chip_breakdown.chips_500')
    .optional()
    .isInt({ min: 0 })
    .withMessage('chips_500 must be a non-negative integer'),
  body('chip_breakdown.chips_5000')
    .optional()
    .isInt({ min: 0 })
    .withMessage('chips_5000 must be a non-negative integer'),
  body('chip_breakdown.chips_10000')
    .optional()
    .isInt({ min: 0 })
    .withMessage('chips_10000 must be a non-negative integer')
];

/**
 * ✅ Set Credit Limit Validator
 */
const setCreditLimitValidator = [
  body('session_id')
    .notEmpty()
    .withMessage('Session ID is required')
    .isInt({ min: 1 })
    .withMessage('Session ID must be a valid positive integer'),
  body('credit_limit')
    .notEmpty()
    .withMessage('Credit limit is required')
    .isFloat({ min: 0 })
    .withMessage('Credit limit must be a non-negative number')
];

/**
 * ✅ Session ID Param Validator
 */
const sessionIdValidator = [
  param('session_id')
    .notEmpty()
    .withMessage('Session ID is required')
    .isInt({ min: 1 })
    .withMessage('Session ID must be a valid positive integer')
];

/**
 * ✅ Date Param Validator
 */
const dateValidator = [
  param('date')
    .notEmpty()
    .withMessage('Date is required')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('Date must be in YYYY-MM-DD format')
];

module.exports = {
  openSessionValidator,
  setChipInventoryValidator,
  updateChipInventoryValidator,
  addCashFloatValidator,
  setCreditLimitValidator,
  sessionIdValidator,
  dateValidator
};