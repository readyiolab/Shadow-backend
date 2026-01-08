// ============================================
// modules/kyc/validators/kyc.validator.js
// ============================================
const { body, param } = require('express-validator');

const createKYCValidator = [
  body('id_type')
    .isIn(['aadhaar', 'pan', 'passport', 'driving_license', 'voter_id'])
    .withMessage('Invalid ID type'),
  body('id_number')
    .trim()
    .notEmpty()
    .withMessage('ID number is required')
    .isLength({ min: 5, max: 50 })
    .withMessage('ID number must be between 5 and 50 characters')
];

const uploadDocumentValidator = [
  body('document_type')
    .isIn(['id_front', 'id_back', 'address_proof', 'photo'])
    .withMessage('Invalid document type')
];

const reviewKYCValidator = [
  body('action')
    .isIn(['approve', 'reject'])
    .withMessage('Action must be either approve or reject'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must not exceed 1000 characters')
];

const registerDeviceValidator = [
  body('device_token')
    .trim()
    .notEmpty()
    .withMessage('Device token is required'),
  body('device_type')
    .isIn(['android', 'ios', 'web'])
    .withMessage('Invalid device type'),
  body('device_name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Device name must not exceed 100 characters'),
  body('device_model')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Device model must not exceed 100 characters')
];

module.exports = {
  createKYCValidator,
  uploadDocumentValidator,
  reviewKYCValidator,
  registerDeviceValidator
};