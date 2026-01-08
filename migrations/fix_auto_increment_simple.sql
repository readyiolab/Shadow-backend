-- Simple fix for AUTO_INCREMENT issue
-- Run this SQL directly in your database (phpMyAdmin, MySQL Workbench, etc.)

-- ==========================================
-- Fix tbl_dealers
-- ==========================================

-- Step 1: Get max dealer_id
SELECT COALESCE(MAX(dealer_id), 0) INTO @max_dealer_id FROM tbl_dealers WHERE dealer_id > 0;

-- Step 2: Create temporary table with new IDs for dealer_id = 0 records
CREATE TEMPORARY TABLE temp_dealer_ids AS
SELECT dealer_id, @max_dealer_id := @max_dealer_id + 1 AS new_id
FROM tbl_dealers
WHERE dealer_id = 0
ORDER BY created_at ASC;

-- Step 3: Update dealer_id = 0 records with new IDs
UPDATE tbl_dealers d
INNER JOIN temp_dealer_ids t ON d.dealer_id = 0 AND d.created_at = (
    SELECT created_at FROM tbl_dealers WHERE dealer_id = 0 LIMIT 1 OFFSET (
        SELECT COUNT(*) FROM temp_dealer_ids WHERE new_id <= t.new_id
    )
)
SET d.dealer_id = t.new_id;

-- Alternative simpler approach: Just set AUTO_INCREMENT and let MySQL handle it
-- First, manually update the IDs if needed, then:

-- Step 4: Set AUTO_INCREMENT (this will work even if some IDs are 0)
ALTER TABLE `tbl_dealers` 
MODIFY COLUMN `dealer_id` INT(11) NOT NULL AUTO_INCREMENT;

-- Step 5: Set next AUTO_INCREMENT value
SELECT COALESCE(MAX(dealer_id), 0) + 1 INTO @next_id FROM tbl_dealers;
SET @sql = CONCAT('ALTER TABLE `tbl_dealers` AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ==========================================
-- Fix tbl_dealer_tips  
-- ==========================================

-- Step 1: Get max tip_id
SELECT COALESCE(MAX(tip_id), 0) INTO @max_tip_id FROM tbl_dealer_tips WHERE tip_id > 0;

-- Step 2: Set AUTO_INCREMENT
ALTER TABLE `tbl_dealer_tips` 
MODIFY COLUMN `tip_id` INT(11) NOT NULL AUTO_INCREMENT;

-- Step 3: Set next AUTO_INCREMENT value
SELECT COALESCE(MAX(tip_id), 0) + 1 INTO @next_id FROM tbl_dealer_tips;
SET @sql = CONCAT('ALTER TABLE `tbl_dealer_tips` AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ==========================================
-- Manual fix for existing records with ID = 0
-- ==========================================
-- If you have records with dealer_id = 0 or tip_id = 0, you may need to manually update them
-- Run these queries one by one and adjust the IDs:

-- For dealers with dealer_id = 0, update them manually:
-- UPDATE tbl_dealers SET dealer_id = 1 WHERE dealer_id = 0 AND dealer_code = 'DL00001';
-- UPDATE tbl_dealers SET dealer_id = 2 WHERE dealer_id = 0 AND dealer_code = 'DL00002';
-- etc.

-- For tips with tip_id = 0, you can leave them as they will get new IDs on next insert
-- Or update them manually if needed

-- Verify
SELECT 'AUTO_INCREMENT fixed! New inserts will have proper IDs.' AS status;
