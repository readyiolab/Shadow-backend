-- ============================================
-- Migration: Fix Promotion Claims Foreign Key
-- ============================================
-- Fix the foreign key constraint for claimed_by in tbl_promotion_claims

-- Step 1: Check if claimed_by column exists and its data type
-- Run: DESCRIBE tbl_promotion_claims;
-- Or: SHOW COLUMNS FROM tbl_promotion_claims LIKE 'claimed_by';

-- Step 2: Check tbl_users table structure
-- Run: DESCRIBE tbl_users;
-- Or: SHOW COLUMNS FROM tbl_users LIKE 'user_id';

-- Step 3: If there's an existing constraint on claimed_by, find and drop it
-- Run: SHOW CREATE TABLE tbl_promotion_claims;
-- Look for any FOREIGN KEY constraint on claimed_by column

-- Step 4: Make sure data types match
-- claimed_by should be INT(11) and user_id in tbl_users should also be INT(11)
-- If they don't match, we need to alter the column first

-- Step 5: Drop any existing constraint on claimed_by (replace CONSTRAINT_NAME with actual name)
-- ALTER TABLE `tbl_promotion_claims` DROP FOREIGN KEY `CONSTRAINT_NAME`;

-- Step 6: Ensure claimed_by column is the correct type
ALTER TABLE `tbl_promotion_claims`
  MODIFY COLUMN `claimed_by` INT(11) NOT NULL;

-- Step 7: Add the foreign key constraint
ALTER TABLE `tbl_promotion_claims`
  ADD CONSTRAINT `fk_claim_user` 
  FOREIGN KEY (`claimed_by`) 
  REFERENCES `tbl_users`(`user_id`) 
  ON DELETE RESTRICT 
  ON UPDATE CASCADE;
