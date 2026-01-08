// ============================================
// FILE: server.js
// Server lifecycle only
// ============================================

require('dotenv').config();
const app = require('./app');
const db = require('./config/database');  // ✅ Import db
const { startKYCReminderCron } = require('./cron/kycReminderCron');

const PORT = process.env.PORT || 5000;

// ============================================
// START SERVER
// ============================================

const server = app.listen(PORT, () => {
  console.log(`🚀 Cashier API running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
});

// Start cron ONLY after server boot
startKYCReminderCron();

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const shutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received. Shutting down...`);

  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    // ✅ Close database pool
    try {
      await db.close();
    } catch (err) {
      console.error('Error closing database:', err);
    }
    
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⏰ Forced shutdown');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================
// GLOBAL ERRORS (DO NOT EXIT)
// ============================================

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});