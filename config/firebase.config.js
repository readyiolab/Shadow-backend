// ============================================
// config/firebase.config.js
// Firebase Cloud Messaging Setup
// ============================================

const admin = require('firebase-admin');


// Initialize Firebase Admin SDK
// Download your service account key from Firebase Console
// Place it in: config/firebase-service-account.json

const serviceAccount = require('./firebase-service-account.json.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

// Get messaging instance
const messaging = admin.messaging();

// Send push notification function
async function sendPushNotification(deviceToken, title, message, data = {}) {
  try {
    const payload = {
      notification: {
        title: title,
        body: message
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        timestamp: new Date().toISOString()
      },
      token: deviceToken
    };

    const response = await messaging.send(payload);
    console.log('Push notification sent successfully:', response);
    return response;
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
}

// Send push notification to multiple devices
async function sendMulticastNotification(deviceTokens, title, message, data = {}) {
  try {
    const payload = {
      notification: {
        title: title,
        body: message
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        timestamp: new Date().toISOString()
      },
      tokens: deviceTokens
    };

    const response = await messaging.sendMulticast(payload);
    console.log(`${response.successCount} notifications sent successfully`);
    
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(deviceTokens[idx]);
        }
      });
      console.log('Failed tokens:', failedTokens);
    }
    
    return response;
  } catch (error) {
    console.error('Error sending multicast notification:', error);
    throw error;
  }
}

module.exports = {
  messaging,
  sendPushNotification,
  sendMulticastNotification
};

// ============================================
// SETUP INSTRUCTIONS
// ============================================

/*
1. Go to Firebase Console: https://console.firebase.google.com/
2. Create a new project or select existing project
3. Go to Project Settings > Service Accounts
4. Click "Generate New Private Key"
5. Save the JSON file as: config/firebase-service-account.json
6. Install firebase-admin: npm install firebase-admin

7. In your Android app (Flutter/React Native):
   - Add Firebase to your app
   - Get FCM token: 
     const token = await FirebaseMessaging.instance.getToken();
   - Send this token to backend when user logs in

8. Update kyc.service.js to use this:

const { sendPushNotification } = require('../../../config/firebase.config');

async sendPushNotification(deviceToken, deviceType, title, message) {
  try {
    const response = await sendPushNotification(deviceToken, title, message, {
      type: 'kyc_reminder',
      action: 'open_kyc_screen'
    });
    return response;
  } catch (error) {
    console.error('Failed to send push:', error);
    throw error;
  }
}

9. Test notification:
   POST /api/kyc/player/1/kyc/remind
   
10. For production:
    - Set up proper error handling
    - Handle token refresh
    - Implement retry logic
    - Add rate limiting
*/