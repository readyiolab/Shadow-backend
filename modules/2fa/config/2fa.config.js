//2fa config

module.exports = {
    issuer: process.env.TWO_FA_ISSUER || 'PokerClub Cashier',
    secretLength: 32,
    tokenWindow: parseInt(process.env.TWO_FA_WINDOW) || 2, // ±60 seconds
    backupCodesCount: 10,
    qrCodeSize: 200
  };