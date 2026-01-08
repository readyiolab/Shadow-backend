const routes = require('./routes/2fa.routes');
const twoFAService = require('./services/2fa.service');
const emailService = require('./services/email.service');

module.exports = {
  routes,
  service: twoFAService,
  emailService
};