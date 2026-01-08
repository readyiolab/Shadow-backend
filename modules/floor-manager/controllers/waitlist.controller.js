const waitlistService = require('../services/waitlist.service');
const tableService = require('../services/table.service');
const { sendSuccess, sendError } = require('../../../utils/response.util');
const { logAudit } = require('../../../utils/logger.util');

class WaitlistController {
  async addToWaitlist(req, res) {
    try {
      const result = await waitlistService.addToWaitlist(
        req.body,
        req.user.user_id
      );
      return sendSuccess(res, 'Player added to waitlist', result, 201);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async getWaitlist(req, res) {
    try {
      const session = await tableService.getCurrentSession();
      const waitlist = await waitlistService.getWaitlist(session.session_id);
      return sendSuccess(res, 'Waitlist retrieved', waitlist);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async seatFromWaitlist(req, res) {
    try {
      const { waitlistId } = req.params;
      const { table_id, seat_number } = req.body;
      
      const result = await waitlistService.seatFromWaitlist(
        waitlistId,
        table_id,
        seat_number,
        req.user.user_id
      );
      return sendSuccess(res, 'Player seated from waitlist', result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }

  async cancelWaitlist(req, res) {
    try {
      const { waitlistId } = req.params;
      const result = await waitlistService.cancelWaitlist(
        waitlistId,
        req.user.user_id
      );
      return sendSuccess(res, 'Waitlist entry cancelled', result);
    } catch (error) {
      return sendError(res, error.message, 400);
    }
  }
}

module.exports = new WaitlistController();