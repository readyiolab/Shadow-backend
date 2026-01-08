// ============================================
// FILE: modules/floor-manager/controllers/table.controller.js
// HTTP request handlers for tables
// ============================================

const tableService = require('../services/table.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');
const { logAudit } = require('../../../utils/logger.util');

class TableController {
  async createTable(req, res) {
    try {
      const result = await tableService.createTable(req.body, req.user.user_id);
      return sendSuccess(res, result, 'Table created successfully', 201);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

async addPlayerToTable(req, res) {
    try {
      const result = await tableService.addPlayerToTable(req.body, req.user.user_id);
      return sendSuccess(res, result, "Player added successfully");
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }
  


  async getAllTables(req, res) {
    try {
      const session = await tableService.getCurrentSession();
      const tables = await tableService.getAllTables(session.session_id);
      return sendSuccess(res, 'Tables retrieved', tables);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async assignDealer(req, res) {
    try {
      const { table_id, dealer_id } = req.body;
      const result = await tableService.assignDealerToTable(
        table_id,
        dealer_id,
        req.user.user_id
      );
      return sendSuccess(res, 'Dealer assigned', result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async removeDealer(req, res) {
    try {
      const { tableId } = req.params;
      const result = await tableService.removeDealerFromTable(
        tableId,
        req.user.user_id
      );
      return sendSuccess(res, 'Dealer removed', result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getTableStatistics(req, res) {
    try {
      const { tableId } = req.params;
      const result = await tableService.getTableStatistics(tableId);
      return sendSuccess(res, 'Table statistics retrieved', result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async closeTable(req, res) {
    try {
      const { tableId } = req.params;
      const result = await tableService.closeTable(tableId, req.user.user_id);
      return sendSuccess(res, 'Table closed', result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }
}

module.exports = new TableController();
