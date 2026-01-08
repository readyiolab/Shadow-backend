const { body, param, query } = require('express-validator');

const createPlayerValidator = [
  body('player_name')
    .trim()
    .notEmpty().withMessage('Player name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be 2-100 characters'),
  
  body('phone_number')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .matches(/^[0-9]{10,15}$/).withMessage('Invalid phone number format'),
  
  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isEmail().withMessage('Invalid email format'),
  
  body('player_type')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['regular', 'vip', 'occasional']).withMessage('Invalid player type'),
  
  body('credit_limit')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Credit limit must be positive'),
  
  body('address')
    .optional({ nullable: true, checkFalsy: true })
    .trim(),
  
  body('notes')
    .optional({ nullable: true, checkFalsy: true })
    .trim(),
  
  body('referred_by_type')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['player', 'club', 'owner']).withMessage('Invalid referral type'),
  
  body('referred_by_player_id')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Invalid referred by player ID'),
  
  body('referral_code')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
];

const updatePlayerValidator = [
  param('player_id')
    .isInt({ min: 1 }).withMessage('Invalid player ID'),
  
  body('player_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Player name must be 2-100 characters'),
  
  body('phone_number')
    .optional()
    .trim()
    .matches(/^[0-9]{10,15}$/).withMessage('Invalid phone number format'),
  
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Invalid email format'),
  
  body('player_type')
    .optional()
    .isIn(['regular', 'vip', 'occasional']).withMessage('Invalid player type'),
  
  body('credit_limit')
    .optional()
    .isFloat({ min: 0 }).withMessage('Credit limit must be positive')
];

const blacklistPlayerValidator = [
  param('player_id')
    .isInt({ min: 1 }).withMessage('Invalid player ID'),
  
  body('reason')
    .trim()
    .notEmpty().withMessage('Blacklist reason is required')
    .isLength({ min: 10 }).withMessage('Reason must be at least 10 characters')
];

const addNoteValidator = [
  param('player_id')
    .isInt({ min: 1 }).withMessage('Invalid player ID'),
  
  body('note')
    .trim()
    .notEmpty().withMessage('Note is required')
    .isLength({ min: 5 }).withMessage('Note must be at least 5 characters'),
  
  body('note_type')
    .optional()
    .isIn(['general', 'warning', 'credit', 'behavior']).withMessage('Invalid note type')
];

const searchPlayersValidator = [
  query('q')
    .trim()
    .notEmpty().withMessage('Search term is required')
    .isLength({ min: 2 }).withMessage('Search term must be at least 2 characters')
];

module.exports = {
  createPlayerValidator,
  updatePlayerValidator,
  blacklistPlayerValidator,
  addNoteValidator,
  searchPlayersValidator
};
