-- Step 1: Check if PRIMARY KEY exists on dealer_id
SELECT 
    COLUMN_NAME,
    COLUMN_KEY,
    EXTRA,
    COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tbl_dealers'
  AND COLUMN_NAME = 'dealer_id';

-- Step 2: Check if PRIMARY KEY exists on tip_id
SELECT 
    COLUMN_NAME,
    COLUMN_KEY,
    EXTRA,
    COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tbl_dealer_tips'
  AND COLUMN_NAME = 'tip_id';

-- Step 3: Check for existing PRIMARY KEY constraints
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('tbl_dealers', 'tbl_dealer_tips')
  AND CONSTRAINT_NAME = 'PRIMARY';

-- ==========================================
-- FIX BASED ON RESULTS ABOVE
-- ==========================================

-- If dealer_id has COLUMN_KEY = 'PRI' (Primary Key), use this:
ALTER TABLE `tbl_dealers` 
MODIFY COLUMN `dealer_id` INT(11) NOT NULL AUTO_INCREMENT;

-- If dealer_id does NOT have PRIMARY KEY, use this:
-- ALTER TABLE `tbl_dealers` 
-- MODIFY COLUMN `dealer_id` INT(11) NOT NULL AUTO_INCREMENT,
-- ADD PRIMARY KEY (`dealer_id`);

-- If tip_id has COLUMN_KEY = 'PRI' (Primary Key), use this:
ALTER TABLE `tbl_dealer_tips` 
MODIFY COLUMN `tip_id` INT(11) NOT NULL AUTO_INCREMENT;

-- If tip_id does NOT have PRIMARY KEY, use this:
-- ALTER TABLE `tbl_dealer_tips` 
-- MODIFY COLUMN `tip_id` INT(11) NOT NULL AUTO_INCREMENT,
-- ADD PRIMARY KEY (`tip_id`);

-- Set AUTO_INCREMENT values
SELECT COALESCE(MAX(dealer_id), 0) + 1 INTO @next_dealer_id FROM tbl_dealers;
SET @sql = CONCAT('ALTER TABLE `tbl_dealers` AUTO_INCREMENT = ', @next_dealer_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COALESCE(MAX(tip_id), 0) + 1 INTO @next_tip_id FROM tbl_dealer_tips;
SET @sql = CONCAT('ALTER TABLE `tbl_dealer_tips` AUTO_INCREMENT = ', @next_tip_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
