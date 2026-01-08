-- Migration: Add screenshot_path column to tbl_transactions
-- Purpose: Store local file path for transaction screenshots (for deposit cash online payments)
-- Date: 2026-01-XX

-- Add screenshot_path column to tbl_transactions
-- If column already exists, you'll get an error - that's okay, just ignore it
ALTER TABLE `tbl_transactions` 
ADD COLUMN `screenshot_path` VARCHAR(500) NULL DEFAULT NULL COMMENT 'Local file path for screenshot (for online deposits)' AFTER `notes`;

