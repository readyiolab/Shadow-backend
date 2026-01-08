# Fix AUTO_INCREMENT for tbl_dealers and tbl_dealer_tips

## Problem
The `dealer_id` and `tip_id` columns are not auto-incrementing, causing all new records to have ID = 0.

## Solution

Run these SQL commands in your database (phpMyAdmin, MySQL Workbench, or command line):

### Step 1: Fix tbl_dealers

```sql
-- First, check if dealer_id is already a PRIMARY KEY
SHOW CREATE TABLE tbl_dealers;

-- Enable AUTO_INCREMENT with PRIMARY KEY
ALTER TABLE `tbl_dealers` 
MODIFY COLUMN `dealer_id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY;

-- OR if PRIMARY KEY already exists, just modify the column:
ALTER TABLE `tbl_dealers` 
MODIFY COLUMN `dealer_id` INT(11) NOT NULL AUTO_INCREMENT;

-- Set the next AUTO_INCREMENT value (adjust based on your max dealer_id)
ALTER TABLE `tbl_dealers` AUTO_INCREMENT = 100;
```

**Note:** Replace `100` with a number higher than your current max `dealer_id`. You can check with:
```sql
SELECT MAX(dealer_id) FROM tbl_dealers;
```

### Step 2: Fix tbl_dealer_tips

```sql
-- First, check if tip_id is already a PRIMARY KEY
SHOW CREATE TABLE tbl_dealer_tips;

-- Enable AUTO_INCREMENT with PRIMARY KEY
ALTER TABLE `tbl_dealer_tips` 
MODIFY COLUMN `tip_id` INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY;

-- OR if PRIMARY KEY already exists, just modify the column:
ALTER TABLE `tbl_dealer_tips` 
MODIFY COLUMN `tip_id` INT(11) NOT NULL AUTO_INCREMENT;

-- Set the next AUTO_INCREMENT value (adjust based on your max tip_id)
ALTER TABLE `tbl_dealer_tips` AUTO_INCREMENT = 100;
```

**Note:** Replace `100` with a number higher than your current max `tip_id`. You can check with:
```sql
SELECT MAX(tip_id) FROM tbl_dealer_tips;
```

### Step 3: (Optional) Fix existing records with ID = 0

If you have existing records with `dealer_id = 0` or `tip_id = 0`, you can manually update them:

```sql
-- For dealers (update one by one, adjust the IDs)
UPDATE tbl_dealers SET dealer_id = 1 WHERE dealer_id = 0 AND dealer_code = 'DL00001' LIMIT 1;
UPDATE tbl_dealers SET dealer_id = 2 WHERE dealer_id = 0 AND dealer_code = 'DL00002' LIMIT 1;
-- Continue for other dealers...

-- For tips, you can leave them as 0 or update them manually
-- They will get proper IDs on the next insert after fixing AUTO_INCREMENT
```

### Verify

After running the fixes, test by inserting a new record:

```sql
-- Test dealer insert (should get auto-incremented ID)
INSERT INTO tbl_dealers (dealer_code, dealer_name, dealer_status) 
VALUES ('DLTEST', 'Test Dealer', 'available');

-- Check the new dealer_id (should not be 0)
SELECT dealer_id, dealer_name FROM tbl_dealers WHERE dealer_code = 'DLTEST';

-- Delete test record
DELETE FROM tbl_dealers WHERE dealer_code = 'DLTEST';
```

## After Fix

Once AUTO_INCREMENT is enabled:
- New dealers will automatically get unique `dealer_id` values
- New dealer tips will automatically get unique `tip_id` values
- The deduplication logic in the code will work correctly
- The Expense Report will show proper grouping without duplicates
