-- ============================================================
-- SQL Update for Multi-Cashier Shifts & Separate Audit History
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Ensure bills table has shift and revision tracking columns
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS shift_id UUID;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS void_shift_id UUID;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS revised_by TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS revised_at TIMESTAMPTZ;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS revised_reason TEXT;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS staff_id TEXT;

-- 2. Safely add shifts table to realtime publication (ignore if already added)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Table is already in publication, safe to continue
  END;
END $$;

-- 3. Helpful indexes for shift bills and audit queries
CREATE INDEX IF NOT EXISTS idx_bills_shift_id ON public.bills(shift_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON public.bills(status);
CREATE INDEX IF NOT EXISTS idx_shifts_staff_id ON public.shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON public.shifts(status);
