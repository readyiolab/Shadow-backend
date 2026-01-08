// modules/admin/routes/user.routes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { verifyToken, requireRole } = require('../../../middleware/auth.middleware');

// All routes require admin authentication
router.use(verifyToken);
router.use(requireRole('admin'));

// User management routes
router.post('/', userController.createUser);
router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.put('/:id', userController.updateUser);
router.post('/:id/reset-password', userController.resetPassword);
router.post('/:id/deactivate', userController.deactivateUser);
router.post('/:id/activate', userController.activateUser);

module.exports = router;

