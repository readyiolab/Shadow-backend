// Script to add image_url and image_public_id columns to tbl_transaction_notes
// Run: node scripts/add_image_to_transaction_notes.js

const db = require('../config/database');

async function addImageColumns() {
  try {
    console.log('🔄 Adding image columns to tbl_transaction_notes...');
    
    // Check if columns already exist
    const checkColumns = await db.queryAll(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'tbl_transaction_notes' 
       AND COLUMN_NAME IN ('image_url', 'image_public_id')`
    );

    const existingColumns = checkColumns.map(c => c.COLUMN_NAME);
    
    if (existingColumns.includes('image_url') && existingColumns.includes('image_public_id')) {
      console.log('✅ Columns image_url and image_public_id already exist in tbl_transaction_notes');
      await db.close();
      process.exit(0);
    }

    // Add columns if they don't exist
    if (!existingColumns.includes('image_url')) {
      await new Promise((resolve, reject) => {
        db.pool.query(
          `ALTER TABLE tbl_transaction_notes 
           ADD COLUMN image_url VARCHAR(500) NULL AFTER note`,
          [],
          (err, result) => {
            if (err) {
              if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('✅ Column image_url already exists');
                resolve();
              } else {
                reject(err);
              }
            } else {
              console.log('✅ Successfully added image_url column to tbl_transaction_notes');
              resolve();
            }
          }
        );
      });
    }

    if (!existingColumns.includes('image_public_id')) {
      await new Promise((resolve, reject) => {
        db.pool.query(
          `ALTER TABLE tbl_transaction_notes 
           ADD COLUMN image_public_id VARCHAR(255) NULL AFTER image_url`,
          [],
          (err, result) => {
            if (err) {
              if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('✅ Column image_public_id already exists');
                resolve();
              } else {
                reject(err);
              }
            } else {
              console.log('✅ Successfully added image_public_id column to tbl_transaction_notes');
              resolve();
            }
          }
        );
      });
    }

    await db.close();
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding image columns:', error.message);
    await db.close();
    process.exit(1);
  }
}

addImageColumns();

