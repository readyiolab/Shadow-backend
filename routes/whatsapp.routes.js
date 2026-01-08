// ============================================
// routes/whatsapp.routes.js
// ============================================
const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsapp.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');

// Webhook verification (GET) - No auth required
router.get('/webhook', whatsappController.verifyWebhook);

// Webhook for incoming messages (POST) - No auth required
router.post('/webhook', whatsappController.handleWebhook.bind(whatsappController));

// Test endpoint to simulate button click (for development)
router.post('/test-button', 
  verifyToken, 
  checkRole('admin'),
  whatsappController.testButtonClick.bind(whatsappController)
);

module.exports = router;