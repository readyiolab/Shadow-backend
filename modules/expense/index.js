// modules/expense/index.js

const expenseRoutes = require('./routes/expense.routes');
const expenseService = require('./services/expense.service');

module.exports = {
  routes: expenseRoutes,
  service: expenseService
};
