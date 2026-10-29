-- ============================================================
-- Migration: Add optional customer_name and customer_phone
-- to the bills table.
-- Run once in the Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS customer_name  TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;
