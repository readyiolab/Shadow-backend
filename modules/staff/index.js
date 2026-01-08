// modules/staff/index.js

const staffRoutes = require('./routes/staff.routes');
const staffService = require('./services/staff.service');

module.exports = {
  routes: staffRoutes,
  service: staffService
};
