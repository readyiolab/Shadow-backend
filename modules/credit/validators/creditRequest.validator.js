// modules/credit/validators/creditRequest.validator.js

const { body, param } = require('express-validator');

/**
 * Validator for creating credit requests
 */
const creditRequestValidator = [
  // Player identification - at least one is required
  body('player_id')
    .optional()
    .isInt()
    .withMessage('Player ID must be an integer'),

  body('player_name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Player name cannot be empty')
    .isLength({ min: 2, max: 100 })
    .withMessage('Player name must be between 2 and 100 characters'),

  body('phone_number')
    .optional()
    .trim()
    .matches(/^[0-9]{10}$/)
    .withMessage('Phone number must be 10 digits'),

  // Required amount fields
  body('requested_amount')
    .exists()
    .withMessage('Requested amount is required')
    .isFloat({ min: 1 })
    .withMessage('Requested amount must be greater than 0')
    .toFloat(),

  body('chips_amount')
    .optional()
    .isFloat({ min: 1 })
    .withMessage('Chips amount must be greater than 0')
    .toFloat(),

  // Optional notes
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),

  // Custom validation: Ensure at least one player identifier
  body().custom((value) => {
    if (!value.player_id && !value.player_name && !value.phone_number) {
      throw new Error('At least one player identifier (player_id, player_name, or phone_number) is required');
    }
    return true;
  })
];

/**
 * Validator for approval/rejection actions
 */
const approvalValidator = [
  param('request_id')
    .isInt()
    .withMessage('Request ID must be an integer')
    .toInt(),

  body('approval_notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Approval notes cannot exceed 500 characters'),

  body('rejection_notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Rejection notes cannot exceed 500 characters')
];

module.exports = {
  creditRequestValidator,
  approvalValidator
};