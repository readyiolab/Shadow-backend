-- Migration: Add referred_by_player_id column to tbl_players
-- This column was missing from the previous migration

-- Check if column already exists before adding
SET @dbname = DATABASE();
SET @tablename = "tbl_players";
SET @columnname = "referred_by_player_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  "SELECT 'Column already exists.' AS result;",
  CONCAT("ALTER TABLE ", @tablename, " ADD COLUMN ", @columnname, " INT(11) DEFAULT NULL COMMENT 'ID of the player who referred this player' AFTER `referred_by_type`;")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS `idx_referred_by_player_id` ON `tbl_players` (`referred_by_player_id`);

