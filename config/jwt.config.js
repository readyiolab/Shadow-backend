module.exports = {
    secret: process.env.JWT_SECRET || 'default-secret-key-change-me',
    expiresIn: process.env.JWT_EXPIRE || '24h'
  }