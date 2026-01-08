-- Migration: Add referral_code, referred_by_type, and joining_date to tbl_players
-- Run this migration to add new fields for player referral tracking and joining date

-- Add referral_code column (VARCHAR(20) for codes like RF1234)
ALTER TABLE `tbl_players` 
ADD COLUMN `referral_code` VARCHAR(20) DEFAULT NULL COMMENT 'Referral code (e.g., RF1234)' AFTER `player_code`;

-- Add referred_by_type column (ENUM for player, club, owner)
ALTER TABLE `tbl_players` 
ADD COLUMN `referred_by_type` ENUM('player', 'club', 'owner') DEFAULT NULL COMMENT 'Type of referrer' AFTER `referral_code`;

-- Add referred_by_player_id column (for when referred_by_type is 'player')
ALTER TABLE `tbl_players` 
ADD COLUMN `referred_by_player_id` INT(11) DEFAULT NULL COMMENT 'ID of the player who referred this player' AFTER `referred_by_type`;

-- Add foreign key constraint (optional, for data integrity)
-- ALTER TABLE `tbl_players` 
-- ADD CONSTRAINT `fk_referred_by_player` 
-- FOREIGN KEY (`referred_by_player_id`) REFERENCES `tbl_players` (`player_id`) 
-- ON DELETE SET NULL ON UPDATE CASCADE;

-- Add joining_date column (DATE)
ALTER TABLE `tbl_players` 
ADD COLUMN `joining_date` DATE DEFAULT NULL COMMENT 'Date when player joined' AFTER `created_at`;

-- Update existing players to set joining_date to their created_at date
UPDATE `tbl_players` 
SET `joining_date` = DATE(`created_at`) 
WHERE `joining_date` IS NULL;

-- Add index on referral_code for faster lookups
CREATE INDEX `idx_referral_code` ON `tbl_players` (`referral_code`);

-- Add index on joining_date for date-based queries
CREATE INDEX `idx_joining_date` ON `tbl_players` (`joining_date`);

