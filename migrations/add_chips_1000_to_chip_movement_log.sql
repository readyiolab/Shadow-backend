-- Migration: Add chips_1000 column to tbl_chip_movement_log
-- Date: 2026-01-06
-- Description: Add support for ₹1000 chip denomination in chip movement log

ALTER TABLE tbl_chip_movement_log 
ADD COLUMN chips_1000 INT DEFAULT 0 AFTER chips_500;

