-- Fix AUTO_INCREMENT for tbl_club_expenses expense_id
-- This ensures club expenses get unique IDs and avoid duplicates

-- Step 1: Check if PRIMARY KEY exists on expense_id
SELECT 
    COLUMN_NAME,
    COLUMN_KEY,
    EXTRA,
    COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tbl_club_expenses'
  AND COLUMN_NAME = 'expense_id';

-- Step 2: Check for existing PRIMARY KEY constraints
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME
FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'tbl_club_expenses'
  AND CONSTRAINT_NAME = 'PRIMARY';

-- ==========================================
-- FIX BASED ON RESULTS ABOVE
-- ==========================================

-- If expense_id has COLUMN_KEY = 'PRI' (Primary Key), use this:
ALTER TABLE `tbl_club_expenses` 
MODIFY COLUMN `expense_id` INT(11) NOT NULL AUTO_INCREMENT;

-- If expense_id does NOT have PRIMARY KEY, use this:
-- ALTER TABLE `tbl_club_expenses` 
-- MODIFY COLUMN `expense_id` INT(11) NOT NULL AUTO_INCREMENT,
-- ADD PRIMARY KEY (`expense_id`);

-- Set AUTO_INCREMENT value
SELECT COALESCE(MAX(expense_id), 0) + 1 INTO @next_expense_id FROM tbl_club_expenses;
SET @sql = CONCAT('ALTER TABLE `tbl_club_expenses` AUTO_INCREMENT = ', @next_expense_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verify
SHOW CREATE TABLE tbl_club_expenses;
SELECT 'AUTO_INCREMENT fixed for tbl_club_expenses!' AS status;
