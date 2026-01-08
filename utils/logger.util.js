const db = require('../config/database');

const logAudit = async (userId, action, tableName = null, recordId = null, oldData = null, newData = null, ipAddress = null) => {
  try {
    await db.insert('tbl_audit_logs', {
      user_id: userId,
      action,
      table_name: tableName,
      record_id: recordId,
      old_data: oldData ? JSON.stringify(oldData) : null,
      new_data: newData ? JSON.stringify(newData) : null,
      ip_address: ipAddress
    });
  } catch (error) {
    console.error('Audit log failed:', error);
  }
};

module.exports = { logAudit };