-- Migration: Add chips_1000 column to tbl_credit_requests
-- This migration adds the chips_1000 column to support ₹1K chip denomination in credit requests

-- Check if the column already exists to prevent errors on re-run
DELIMITER //
CREATE PROCEDURE AddChips1000ToCreditRequests()
BEGIN
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'tbl_credit_requests'
                   AND COLUMN_NAME = 'chips_1000') THEN
        ALTER TABLE `tbl_credit_requests`
        ADD COLUMN `chips_1000` INT(11) DEFAULT 0 COMMENT 'Number of ₹1K chips' AFTER `chips_500`;
    END IF;
END //
DELIMITER ;

CALL AddChips1000ToCreditRequests();
DROP PROCEDURE AddChips1000ToCreditRequests;

