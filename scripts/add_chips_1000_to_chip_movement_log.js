// Script to add chips_1000 column to tbl_chip_movement_log
// Run: node scripts/add_chips_1000_to_chip_movement_log.js

const db = require('../config/database');

async function addChips1000Column() {
  try {
    console.log('🔄 Adding chips_1000 column to tbl_chip_movement_log...');
    
    // Check if column already exists
    const checkColumn = await db.queryAll(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'tbl_chip_movement_log' 
       AND COLUMN_NAME = 'chips_1000'`
    );

    if (checkColumn && checkColumn.length > 0) {
      console.log('✅ Column chips_1000 already exists in tbl_chip_movement_log');
      await db.close();
      process.exit(0);
    }

    // Add the column using raw query
    await new Promise((resolve, reject) => {
      db.pool.query(
        `ALTER TABLE tbl_chip_movement_log 
         ADD COLUMN chips_1000 INT DEFAULT 0 AFTER chips_500`,
        [],
        (err, result) => {
          if (err) {
            // If column already exists, that's okay
            if (err.code === 'ER_DUP_FIELDNAME') {
              console.log('✅ Column chips_1000 already exists');
              resolve();
            } else {
              reject(err);
            }
          } else {
            console.log('✅ Successfully added chips_1000 column to tbl_chip_movement_log');
            resolve();
          }
        }
      );
    });

    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding chips_1000 column:', error.message);
    await db.close();
    process.exit(1);
  }
}

addChips1000Column();

