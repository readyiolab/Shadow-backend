-- Migration: Add chips_1000 column to tbl_player_expenses
-- Date: 2026-01-06
-- Description: Add support for ₹1000 chip denomination in player expenses

ALTER TABLE tbl_player_expenses 
ADD COLUMN chips_1000 INT DEFAULT 0 AFTER chips_500;

