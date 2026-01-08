-- ============================================
-- Fix: Make claimed_by nullable to avoid foreign key issues
-- ============================================
-- Since claimed_by is just for tracking who created the claim,
-- we can make it nullable to avoid foreign key constraint issues

-- Make claimed_by nullable (remove NOT NULL constraint)
ALTER TABLE `tbl_promotion_claims`
  MODIFY COLUMN `claimed_by` INT(11) NULL;

-- If there's an existing foreign key constraint, drop it
-- (This will fail if no constraint exists, that's okay)
ALTER TABLE `tbl_promotion_claims` 
  DROP FOREIGN KEY IF EXISTS `fk_claim_staff`;

