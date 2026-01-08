-- Fix AUTO_INCREMENT for tbl_dealers and tbl_dealer_tips
-- This migration ensures dealer_id and tip_id auto-increment properly

-- 1. Fix tbl_dealers dealer_id AUTO_INCREMENT
-- First, check if there are any existing records with dealer_id = 0
-- If so, we need to reassign them proper IDs

-- Get the max dealer_id
SET @max_dealer_id = (SELECT COALESCE(MAX(dealer_id), 0) FROM tbl_dealers WHERE dealer_id > 0);

-- Update dealer_id = 0 records to have proper sequential IDs
SET @counter = @max_dealer_id + 1;
UPDATE tbl_dealers 
SET dealer_id = (@counter := @counter + 1) 
WHERE dealer_id = 0 
ORDER BY created_at ASC;

-- Now alter the table to set AUTO_INCREMENT
ALTER TABLE `tbl_dealers` 
MODIFY COLUMN `dealer_id` INT(11) NOT NULL AUTO_INCREMENT;

-- Set the AUTO_INCREMENT value to be higher than the current max
SET @new_auto_increment = (SELECT COALESCE(MAX(dealer_id), 0) + 1 FROM tbl_dealers);
SET @sql = CONCAT('ALTER TABLE `tbl_dealers` AUTO_INCREMENT = ', @new_auto_increment);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Fix tbl_dealer_tips tip_id AUTO_INCREMENT
-- First, check if there are any existing records with tip_id = 0
-- If so, we need to reassign them proper IDs

-- Get the max tip_id
SET @max_tip_id = (SELECT COALESCE(MAX(tip_id), 0) FROM tbl_dealer_tips WHERE tip_id > 0);

-- Update tip_id = 0 records to have proper sequential IDs
SET @counter = @max_tip_id + 1;
UPDATE tbl_dealer_tips 
SET tip_id = (@counter := @counter + 1) 
WHERE tip_id = 0 
ORDER BY created_at ASC;

-- Now alter the table to set AUTO_INCREMENT
ALTER TABLE `tbl_dealer_tips` 
MODIFY COLUMN `tip_id` INT(11) NOT NULL AUTO_INCREMENT;

-- Set the AUTO_INCREMENT value to be higher than the current max
SET @new_auto_increment = (SELECT COALESCE(MAX(tip_id), 0) + 1 FROM tbl_dealer_tips);
SET @sql = CONCAT('ALTER TABLE `tbl_dealer_tips` AUTO_INCREMENT = ', @new_auto_increment);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verify the changes
SELECT 'Migration completed. Verifying AUTO_INCREMENT settings...' AS status;
SHOW CREATE TABLE tbl_dealers;
SHOW CREATE TABLE tbl_dealer_tips;
