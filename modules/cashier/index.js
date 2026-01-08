const routes = require("./routes/cashier.routes");
const cashierService = require("./services/cashier.service")
const confirmationRoutes  = require("./routes/confirmation.routes");
const extendedRoutes = require("./routes/cashier-extended.routes");


module.exports={
    routes,
    cashierService,
    confirmationRoutes,
    extendedRoutes
}