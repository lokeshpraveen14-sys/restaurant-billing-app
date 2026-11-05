-- ============================================================
-- FIX_REALTIME_ERRORS.sql  (v4 — final)
-- Tables are already in supabase_realtime publication.
-- Only REPLICA IDENTITY FULL is needed to fix the 470 errors.
-- ============================================================

-- Fix: Set REPLICA IDENTITY FULL so realtime UPDATE/DELETE
-- events carry complete row data (without this = 88% errors)
ALTER TABLE bills REPLICA IDENTITY FULL;
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE restaurant_tables REPLICA IDENTITY FULL;
ALTER TABLE shifts REPLICA IDENTITY FULL;

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';

-- Verify: all rows should show 'FULL OK'
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
