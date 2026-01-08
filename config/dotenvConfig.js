// ============================================
// FILE: config/dotenvConfig.js
// Centralized environment variable config
// ============================================

require('dotenv').config();

const dotenvConfig = {
  // App
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,

  // Database
  // Database
dbHost: process.env.DB_HOST,
dbUser: process.env.DB_USER,
dbPass: process.env.DB_PASS,
dbName: process.env.DB_NAME,
dbPort: process.env.DB_PORT || 3306,

  

  // JWT
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',

  // OTP / SMS
  otpExpiryMinutes: process.env.OTP_EXPIRY_MINUTES || 5,

  // Frontend
  frontendUrl: process.env.FRONTEND_URL,

  // WhatsApp / SMS (if used)
  whatsappToken: process.env.WHATSAPP_TOKEN,

  // Cloudinary
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,

  // CEO Email for notifications
  ceoEmail: process.env.CEO_EMAIL || 'psurya162@gmail.com',
};

module.exports = dotenvConfig;
