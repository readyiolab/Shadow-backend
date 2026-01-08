-- Migration: Add activity_type, activity_id, and attachment_url to tbl_transactions
-- Date: 2026-01-03

-- Add activity_type and activity_id for linking to specific activity records (club_expense, dealer_tip, etc.)
ALTER TABLE `tbl_transactions`
  ADD COLUMN IF NOT EXISTS `activity_type` VARCHAR(50) NULL DEFAULT NULL AFTER `transaction_type`,
  ADD COLUMN IF NOT EXISTS `activity_id` INT(11) NULL DEFAULT NULL AFTER `activity_type`,
  ADD KEY IF NOT EXISTS `idx_activity_type` (`activity_type`),
  ADD KEY IF NOT EXISTS `idx_activity_id` (`activity_id`);

-- Add attachment_url and attachment_public_id for club expense attachments
ALTER TABLE `tbl_transactions`
  ADD COLUMN IF NOT EXISTS `attachment_url` VARCHAR(500) NULL DEFAULT NULL AFTER `screenshot_public_id`,
  ADD COLUMN IF NOT EXISTS `attachment_public_id` VARCHAR(255) NULL DEFAULT NULL AFTER `attachment_url`;

