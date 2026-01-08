-- Migration: Add attachment fields to tbl_club_expenses
-- Date: 2026-01-03

ALTER TABLE `tbl_club_expenses`
  ADD COLUMN `attachment_url` VARCHAR(500) NULL DEFAULT NULL AFTER `bill_number`,
  ADD COLUMN `attachment_public_id` VARCHAR(255) NULL DEFAULT NULL AFTER `attachment_url`;

