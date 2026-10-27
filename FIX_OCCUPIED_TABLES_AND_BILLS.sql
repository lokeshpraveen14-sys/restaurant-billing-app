-- ============================================================
-- SQL SCRIPT: FIX OCCUPIED TABLES, BILLS, AND ORDER PURGE
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
-- ============================================================

-- 1. Ensure table_number columns are TEXT in both bills and orders
--    This prevents 22P02 integer conversion errors for alphanumeric tables (C1-C8, D1-D8)
ALTER TABLE public.bills ALTER COLUMN table_number TYPE TEXT;
ALTER TABLE public.orders ALTER COLUMN table_number TYPE TEXT;

-- 2. Mark any open orders that already have bills as 'paid'
UPDATE public.orders 
SET status = 'paid', updated_at = now()
WHERE id IN (
  SELECT order_id FROM public.bills WHERE order_id IS NOT NULL AND status != 'void'
);

-- 3. Delete all paid and void orders from the orders table
DELETE FROM public.orders 
WHERE status IN ('paid', 'void');

-- 4. Reset restaurant_tables to 'free' for any table that has no active open orders
UPDATE public.restaurant_tables
SET status = 'free', occupied_since = NULL, reserved_for = NULL
WHERE id NOT IN (
  SELECT DISTINCT table_id 
  FROM public.orders 
  WHERE status IN ('open', 'kot_sent', 'preparing', 'ready') 
    AND table_id IS NOT NULL
);

-- 5. Ensure full CRUD and DELETE permission on orders table for anon users
DROP POLICY IF EXISTS "public_all_orders" ON public.orders;
CREATE POLICY "public_all_orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);

-- 6. Emergency Full Reset (uncomment ONLY if you want to clear ALL tables to free right now):
-- UPDATE public.restaurant_tables SET status = 'free', occupied_since = NULL, reserved_for = NULL;
-- DELETE FROM public.orders;
