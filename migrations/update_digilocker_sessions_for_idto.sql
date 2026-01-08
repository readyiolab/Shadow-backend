-- ============================================
-- Migration: Update tbl_digilocker_sessions for IDTO Integration
-- ============================================
-- This migration adds support for IDTO DigiLocker integration
-- which uses code_verifier and reference_key instead of state and access_token

-- Add code_verifier column (for PKCE flow)
ALTER TABLE `tbl_digilocker_sessions`
ADD COLUMN `code_verifier` VARCHAR(255) NULL AFTER `state`,
ADD COLUMN `reference_key` VARCHAR(255) NULL AFTER `code_verifier`,
ADD COLUMN `completed_at` TIMESTAMP NULL AFTER `expires_at`;

-- Add index on reference_key for faster lookups
CREATE INDEX `idx_reference_key` ON `tbl_digilocker_sessions` (`reference_key`);

-- Note: The following columns may already exist or may need to be kept for backward compatibility:
-- - state (can be kept for backward compatibility or removed if not needed)
-- - access_token (can be kept for backward compatibility or removed if not needed)
-- - refresh_token (can be kept for backward compatibility or removed if not needed)
-- - token_expires_at (can be kept for backward compatibility or removed if not needed)

-- If you want to keep the old columns for backward compatibility, leave them as is.
-- If you want to remove them, uncomment the following:
-- ALTER TABLE `tbl_digilocker_sessions`
-- DROP COLUMN IF EXISTS `state`,
-- DROP COLUMN IF EXISTS `access_token`,
-- DROP COLUMN IF EXISTS `refresh_token`,
-- DROP COLUMN IF EXISTS `token_expires_at`;

