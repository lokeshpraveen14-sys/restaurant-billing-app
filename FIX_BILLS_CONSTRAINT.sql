-- Run this in the NEW project SQL Editor BEFORE re-running migration

-- 1. Drop the unique constraint on invoice_number
-- (bills are unique by their UUID `id`, not invoice_number —
--  old data had duplicate invoice numbers from the counter reset bug)
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_invoice_number_key;

-- 2. Verify constraint is gone
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'bills'::regclass
ORDER BY conname;
-- Should NOT show bills_invoice_number_key anymore
