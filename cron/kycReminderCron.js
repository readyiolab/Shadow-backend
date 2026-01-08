// ============================================
// cron/kycReminderCron.js
// ============================================
const cron = require('node-cron');
const kycService = require('../modules/kyc/services/kyc.service');

// Run every day at 10:00 AM
const startKYCReminderCron = () => {
  cron.schedule('0 10 * * *', async () => {
    console.log('Running KYC reminder cron job...');
    
    try {
      const result = await kycService.sendKYCReminders();
      
      console.log(`✓ KYC reminders sent to ${result.length} players`);
      
      if (result.length > 0) {
        console.log('Players notified:');
        result.forEach(player => {
          console.log(`  - ${player.player_name} (ID: ${player.player_id}, Reminder #${player.reminder_count})`);
        });
      }
    } catch (error) {
      console.error('✗ Error sending KYC reminders:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata" // Set your timezone
  });

  console.log('✓ KYC reminder cron job scheduled (Daily at 10:00 AM)');
};

module.exports = { startKYCReminderCron };