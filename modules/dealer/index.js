// modules/dealer/index.js

const dealerRoutes = require('./routes/dealer.routes');
const dealerService = require('./services/dealer.service');

module.exports = {
  routes: dealerRoutes,
  service: dealerService
};
