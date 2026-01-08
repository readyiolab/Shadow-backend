// modules/rakeback/index.js

const rakebackRoutes = require('./routes/rakeback.routes');
const rakebackService = require('./services/rakeback.service');

module.exports = {
  routes: rakebackRoutes,
  service: rakebackService
};
