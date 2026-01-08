-- Migration: Add cash_balance and online_balance columns to tbl_daily_sessions
-- Purpose: Enable strict balance separation for cash vs online buy-ins
-- Date: 2026-01-05

-- Add cash_balance column (for cash buy-ins only)
ALTER TABLE `tbl_daily_sessions` 
ADD COLUMN `cash_balance` DECIMAL(15, 2) DEFAULT 0.00 COMMENT 'Cash balance from cash buy-ins only' AFTER `secondary_wallet_withdrawals`;

-- Add online_balance column (for online buy-ins only, never used for cash payout)
ALTER TABLE `tbl_daily_sessions` 
ADD COLUMN `online_balance` DECIMAL(15, 2) DEFAULT 0.00 COMMENT 'Online balance from online buy-ins only, never used for cash payout' AFTER `cash_balance`;

-- Update existing sessions to have 0 balance (they should be calculated from transactions)
UPDATE `tbl_daily_sessions` 
SET `cash_balance` = 0.00, `online_balance` = 0.00 
WHERE `cash_balance` IS NULL OR `online_balance` IS NULL;

