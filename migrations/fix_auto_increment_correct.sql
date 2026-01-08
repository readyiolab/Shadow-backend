-- Fix AUTO_INCREMENT for tbl_dealers and tbl_dealer_tips
-- This version ensures PRIMARY KEY is set correctly

-- ==========================================
-- Step 1: Check current table structure
-- ==========================================
SHOW CREATE TABLE tbl_dealers;
SHOW CREATE TABLE tbl_dealer_tips;

-- ==========================================
-- Step 2: Fix tbl_dealers
-- ==========================================

-- Option A: If dealer_id is NOT a PRIMARY KEY, add it:
-- First drop existing primary key if any (be careful!)
-- ALTER TABLE `tbl_dealers` DROP PRIMARY KEY;

-- Then add PRIMARY KEY with AUTO_INCREMENT
ALTER TABLE `tbl_dealers` 
MODIFY COLUMN `dealer_id` INT(11) NOT NULL AUTO_INCREMENT,
ADD PRIMARY KEY (`dealer_id`);

-- Option B: If dealer_id is already PRIMARY KEY, just modify:
-- ALTER TABLE `tbl_dealers` 
-- MODIFY COLUMN `dealer_id` INT(11) NOT NULL AUTO_INCREMENT;

-- Set the next AUTO_INCREMENT value
SELECT COALESCE(MAX(dealer_id), 0) + 1 INTO @next_dealer_id FROM tbl_dealers;
SET @sql = CONCAT('ALTER TABLE `tbl_dealers` AUTO_INCREMENT = ', @next_dealer_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ==========================================
-- Step 3: Fix tbl_dealer_tips
-- ==========================================

-- Option A: If tip_id is NOT a PRIMARY KEY, add it:
-- First drop existing primary key if any (be careful!)
-- ALTER TABLE `tbl_dealer_tips` DROP PRIMARY KEY;

-- Then add PRIMARY KEY with AUTO_INCREMENT
ALTER TABLE `tbl_dealer_tips` 
MODIFY COLUMN `tip_id` INT(11) NOT NULL AUTO_INCREMENT,
ADD PRIMARY KEY (`tip_id`);

-- Option B: If tip_id is already PRIMARY KEY, just modify:
-- ALTER TABLE `tbl_dealer_tips` 
-- MODIFY COLUMN `tip_id` INT(11) NOT NULL AUTO_INCREMENT;

-- Set the next AUTO_INCREMENT value
SELECT COALESCE(MAX(tip_id), 0) + 1 INTO @next_tip_id FROM tbl_dealer_tips;
SET @sql = CONCAT('ALTER TABLE `tbl_dealer_tips` AUTO_INCREMENT = ', @next_tip_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ==========================================
-- Step 4: Verify
-- ==========================================
SHOW CREATE TABLE tbl_dealers;
SHOW CREATE TABLE tbl_dealer_tips;

SELECT 'AUTO_INCREMENT fixed!' AS status;
