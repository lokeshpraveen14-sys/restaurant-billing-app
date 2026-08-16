-- Run this script in your Supabase SQL Editor to create the shifts table

CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  closing_balance NUMERIC,
  total_cash NUMERIC NOT NULL DEFAULT 0,
  total_upi NUMERIC NOT NULL DEFAULT 0,
  total_card NUMERIC NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_covers INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open'
);

-- Optional: Enable Realtime for the shifts table
ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;

-- Set up basic RLS (Row Level Security) - allow all operations for authenticated users (or public for demo)
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on shifts"
  ON public.shifts FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on shifts"
  ON public.shifts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on shifts"
  ON public.shifts FOR UPDATE
  USING (true);
