-- Migration: Add image_url and image_public_id columns to tbl_transaction_notes
-- Date: 2026-01-07
-- Description: Add support for image attachments in transaction notes

ALTER TABLE tbl_transaction_notes 
ADD COLUMN image_url VARCHAR(500) NULL AFTER note,
ADD COLUMN image_public_id VARCHAR(255) NULL AFTER image_url;

