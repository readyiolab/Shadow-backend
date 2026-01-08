// modules/admin/controllers/user.controller.js
const userService = require('../services/user.service');

class UserController {
  /**
   * Create a new user (cashier/floor_manager)
   */
  async createUser(req, res) {
    try {
      const result = await userService.createUser(req.body, req.user.user_id);
      res.status(201).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get all users (cashiers and floor managers)
   */
  async getAllUsers(req, res) {
    try {
      const { role } = req.query;
      const users = await userService.getUsersByRole(role);
      res.json({
        success: true,
        message: 'Users retrieved successfully',
        data: users
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(req, res) {
    try {
      const user = await userService.getUserById(req.params.id);
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Update user
   */
  async updateUser(req, res) {
    try {
      const result = await userService.updateUser(req.params.id, req.body, req.user.user_id);
      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Reset user password
   */
  async resetPassword(req, res) {
    try {
      const result = await userService.resetPassword(req.params.id, req.user.user_id);
      res.json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Deactivate user
   */
  async deactivateUser(req, res) {
    try {
      const result = await userService.deactivateUser(req.params.id, req.user.user_id);
      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Activate user
   */
  async activateUser(req, res) {
    try {
      const result = await userService.activateUser(req.params.id, req.user.user_id);
      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new UserController();

