// email.config

module.exports = {
    smtp: {
        host: "smtp.gmail.com",
        port: 465,          // For SSL (recommended)
        secure: true,       // true for 465
        auth: {
          user: "psurya162@gmail.com",
          pass: "qtgq zuxb nexq csvo"   // Gmail App Password
        }
      },
    from: {
      email: process.env.EMAIL_FROM || 'noreply@pokerclub.com',
      name: process.env.EMAIL_FROM_NAME || 'PokerClub Cashier'
    },
    templates: {
      setup: {
        subject: 'Two-Factor Authentication Setup',
        priority: 'high'
      },
      disabled: {
        subject: 'Two-Factor Authentication Disabled',
        priority: 'high'
      },
      backupCodes: {
        subject: 'Your Backup Codes',
        priority: 'high'
      }
    }
  };