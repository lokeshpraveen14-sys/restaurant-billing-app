-- ============================================================
-- FIX_REALTIME_REMAINING.sql
-- Fix REPLICA IDENTITY for remaining tables (all showing DEFAULT)
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE app_settings REPLICA IDENTITY FULL;
ALTER TABLE bank_accounts REPLICA IDENTITY FULL;
ALTER TABLE invoice_counters REPLICA IDENTITY FULL;
ALTER TABLE ledger_transactions REPLICA IDENTITY FULL;
ALTER TABLE menu_items REPLICA IDENTITY FULL;
ALTER TABLE print_jobs REPLICA IDENTITY FULL;
ALTER TABLE salary_records REPLICA IDENTITY FULL;
ALTER TABLE staff_users REPLICA IDENTITY FULL;
ALTER TABLE vendors REPLICA IDENTITY FULL;

-- Note: "ledger_transcations" may have a typo in DB — try both:
-- ALTER TABLE ledger_transcations REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';

-- Verify all — every row should now show 'FULL OK'
SELECT c.relname AS table_name,
       CASE c.relreplident
         WHEN 'f' THEN 'FULL OK'
         WHEN 'd' THEN 'DEFAULT - PROBLEM'
         WHEN 'n' THEN 'NOTHING - PROBLEM'
       END AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
