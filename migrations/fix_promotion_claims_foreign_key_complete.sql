-- ============================================
-- Complete Fix for Promotion Claims Foreign Key
-- ============================================

-- Step 1: Check column types and structure
-- Run these queries first:

-- Check claimed_by column
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tbl_promotion_claims'
  AND COLUMN_NAME = 'claimed_by';

-- Check user_id column in tbl_users
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tbl_users'
  AND COLUMN_NAME = 'user_id';

-- Step 2: Check if user_id is a primary key
SELECT 
  CONSTRAINT_NAME,
  CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tbl_users'
  AND CONSTRAINT_TYPE = 'PRIMARY KEY';

-- Step 3: Check for any existing foreign key on claimed_by
SELECT 
  CONSTRAINT_NAME,
  REFERENCED_TABLE_NAME,
  REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tbl_promotion_claims'
  AND COLUMN_NAME = 'claimed_by'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- Step 4: If there's an existing constraint, drop it (replace CONSTRAINT_NAME with actual name from Step 3)
-- ALTER TABLE `tbl_promotion_claims` DROP FOREIGN KEY `CONSTRAINT_NAME`;

-- Step 5: Ensure both columns have matching types (adjust if needed based on Step 1 results)
-- Make sure claimed_by is INT(11) NOT NULL
ALTER TABLE `tbl_promotion_claims`
  MODIFY COLUMN `claimed_by` INT(11) NOT NULL;

-- Step 6: Add the foreign key
ALTER TABLE `tbl_promotion_claims`
  ADD CONSTRAINT `fk_claim_user` 
  FOREIGN KEY (`claimed_by`) 
  REFERENCES `tbl_users`(`user_id`) 
  ON DELETE RESTRICT 
  ON UPDATE CASCADE;

