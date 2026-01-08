// ============================================
// FILE: app.js
// Express app only (NO listen here)
// ============================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authModule = require('./modules/auth');
const adminModule = require('./modules/admin');
const twoFAModule = require('./modules/2fa');
const cashierModule = require('./modules/cashier');
const transactionModule = require('./modules/transcation');
const playerModule = require('./modules/player');
const creditModule = require('./modules/credit');
const kycModule = require('./modules/kyc');

const staffModule = require('./modules/staff');
const dealerModule = require('./modules/dealer');
const rakebackModule = require('./modules/rakeback');
const expenseModule = require('./modules/expense');
const floorManagerModule = require('./modules/floor-manager');
const promotionModule = require('./modules/promotion');

const playerRoutes = require('./modules/player-auth/routes/player.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const { errorHandler } = require('./middleware/error.middleware');

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:8081',
  'https://gamestechindia.com',
  'https://www.gamestechindia.com'
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// ROUTES
// ============================================

app.use('/api/auth', authModule.routes);
app.use('/api/admin', adminModule);
app.use('/api/2fa', twoFAModule.routes);
app.use('/api/cashier', cashierModule.routes);
app.use('/api/cashier/confirmations', cashierModule.confirmationRoutes);
app.use('/api/cashier', cashierModule.extendedRoutes);
app.use('/api/transactions', transactionModule.routes);
app.use('/api/players', playerModule.routes);
app.use('/api/credit', creditModule.routes);
app.use('/api/kyc', kycModule);

app.use('/api/staff', staffModule.routes);
app.use('/api/dealers', dealerModule.routes);
app.use('/api/rakeback', rakebackModule.routes);
app.use('/api/expenses', expenseModule.routes);
app.use('/api/floor-manager', floorManagerModule);
app.use('/api/promotions', promotionModule);

app.use('/api/player', playerRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// ============================================
// HEALTH
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Royal Flush API is running',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// ERRORS
// ============================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

app.use(errorHandler);

module.exports = app;
