-- ============================================
-- Migration: Add Promotion System and Screenshot Fields
-- ============================================

-- 1. Create promotions table
CREATE TABLE IF NOT EXISTS `tbl_promotions` (
  `promotion_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promotion_name` VARCHAR(255) NOT NULL,
  `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
  `start_date` DATETIME NOT NULL,
  `end_date` DATETIME NOT NULL,
  `user_type` ENUM('all_players') NOT NULL DEFAULT 'all_players',
  `player_limit_24h` INT(11) NOT NULL DEFAULT 0 COMMENT '0 = unlimited',
  `claims_per_user_per_day` INT(11) NOT NULL DEFAULT 1,
  `created_by` INT(11) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NULL,
  PRIMARY KEY (`promotion_id`),
  KEY `idx_status_dates` (`status`, `start_date`, `end_date`),
  KEY `idx_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Create promotion bonus tiers table
CREATE TABLE IF NOT EXISTS `tbl_promotion_bonus_tiers` (
  `tier_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promotion_id` INT(11) NOT NULL,
  `min_deposit` DECIMAL(10,2) NOT NULL,
  `max_deposit` DECIMAL(10,2) NOT NULL,
  `flat_bonus_amount` DECIMAL(10,2) NOT NULL,
  `created_at` DATETIME NOT NULL,
  PRIMARY KEY (`tier_id`),
  KEY `idx_promotion_id` (`promotion_id`),
  KEY `idx_deposit_range` (`min_deposit`, `max_deposit`),
  FOREIGN KEY (`promotion_id`) REFERENCES `tbl_promotions`(`promotion_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Create promotion claims table
CREATE TABLE IF NOT EXISTS `tbl_promotion_claims` (
  `claim_id` INT(11) NOT NULL AUTO_INCREMENT,
  `promotion_id` INT(11) NOT NULL,
  `player_id` INT(11) NOT NULL,
  `transaction_id` INT(11) NOT NULL,
  `deposit_amount` DECIMAL(10,2) NOT NULL,
  `bonus_amount` DECIMAL(10,2) NOT NULL,
  `tier_id` INT(11) NOT NULL,
  `claimed_at` DATETIME NOT NULL,
  `claimed_by` INT(11) NOT NULL,
  PRIMARY KEY (`claim_id`),
  KEY `idx_promotion_id` (`promotion_id`),
  KEY `idx_player_id` (`player_id`),
  KEY `idx_transaction_id` (`transaction_id`),
  KEY `idx_claimed_at` (`claimed_at`),
  FOREIGN KEY (`promotion_id`) REFERENCES `tbl_promotions`(`promotion_id`) ON DELETE CASCADE,
  FOREIGN KEY (`player_id`) REFERENCES `tbl_players`(`player_id`) ON DELETE CASCADE,
  FOREIGN KEY (`transaction_id`) REFERENCES `tbl_transactions`(`transaction_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Add chips_1000 fields to tbl_daily_sessions
ALTER TABLE `tbl_daily_sessions`
  ADD COLUMN IF NOT EXISTS `chips_1000_opening` INT(11) NOT NULL DEFAULT 0 AFTER `chips_500_opening`,
  ADD COLUMN IF NOT EXISTS `chips_1000_current` INT(11) NOT NULL DEFAULT 0 AFTER `chips_500_current`,
  ADD COLUMN IF NOT EXISTS `chips_1000_out` INT(11) NOT NULL DEFAULT 0 AFTER `chips_500_out`;

-- 5. Add chips_1000 field to tbl_transactions
ALTER TABLE `tbl_transactions`
  ADD COLUMN IF NOT EXISTS `chips_1000` INT(11) NOT NULL DEFAULT 0 AFTER `chips_500`;

-- 6. Add screenshot fields to tbl_transactions
ALTER TABLE `tbl_transactions`
  ADD COLUMN IF NOT EXISTS `screenshot_url` VARCHAR(500) NULL AFTER `notes`,
  ADD COLUMN IF NOT EXISTS `screenshot_public_id` VARCHAR(255) NULL AFTER `screenshot_url`;

-- 7. Add edited fields to tbl_transactions for player name edits
ALTER TABLE `tbl_transactions`
  ADD COLUMN IF NOT EXISTS `is_edited` TINYINT(1) NOT NULL DEFAULT 0 AFTER `screenshot_public_id`,
  ADD COLUMN IF NOT EXISTS `edited_at` DATETIME NULL AFTER `is_edited`,
  ADD COLUMN IF NOT EXISTS `edited_by` INT(11) NULL AFTER `edited_at`,
  ADD COLUMN IF NOT EXISTS `original_player_name` VARCHAR(255) NULL AFTER `edited_by`,
  ADD KEY IF NOT EXISTS `idx_is_edited` (`is_edited`);

-- 8. Add chips_1000 to tbl_session_float_additions
ALTER TABLE `tbl_session_float_additions`
  ADD COLUMN IF NOT EXISTS `chips_1000` INT(11) NOT NULL DEFAULT 0 AFTER `chips_500`;

-- 9. Add chips_1000 to tbl_dealer_tips
ALTER TABLE `tbl_dealer_tips`
  ADD COLUMN IF NOT EXISTS `chips_1000` INT(11) NOT NULL DEFAULT 0 AFTER `chips_500`;

-- 10. Add chips_1000 to tbl_credits
ALTER TABLE `tbl_credits`
  ADD COLUMN IF NOT EXISTS `chips_1000` INT(11) NOT NULL DEFAULT 0 AFTER `chips_500`;

