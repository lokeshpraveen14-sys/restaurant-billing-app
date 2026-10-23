-- Fix orders table_number column to TEXT
-- This enables alphanumeric table numbers (e.g. C2, C4, C6, D1, D2, etc.) to be stored directly in Supabase orders table.

ALTER TABLE public.orders 
ALTER COLUMN table_number TYPE TEXT;
