-- ============================================================
-- Fix duplicate invoice numbers
-- Run this ONCE in Supabase SQL Editor
-- ============================================================

-- Step 1: Ensure the invoice_counters table exists
CREATE TABLE IF NOT EXISTS invoice_counters (
  id       TEXT PRIMARY KEY,   -- e.g. "INV/2026-27"
  counter  INTEGER NOT NULL DEFAULT 0
);

-- Step 2: Seed the counter to the current MAX invoice number from bills
-- This prevents the sequence from restarting at 1 and clashing with existing bills
INSERT INTO invoice_counters (id, counter)
SELECT 
  CONCAT(
    SPLIT_PART(invoice_number, '/', 1), '/',
    SPLIT_PART(invoice_number, '/', 2)
  ) AS id,
  MAX(
    CAST(
      NULLIF(
        REGEXP_REPLACE(SPLIT_PART(invoice_number, '/', 3), '[^0-9]', '', 'g'),
        ''
      ) AS INTEGER
    )
  ) AS counter
FROM bills
WHERE invoice_number LIKE '%/%/%'
  AND SPLIT_PART(invoice_number, '/', 3) ~ '^\d+'
GROUP BY 1
ON CONFLICT (id) DO UPDATE
  SET counter = GREATEST(invoice_counters.counter, EXCLUDED.counter);

-- Step 3: Ensure the RPC function is up to date
CREATE OR REPLACE FUNCTION get_next_invoice_number(
  p_prefix TEXT,
  p_fy     TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_id      TEXT;
  v_counter INTEGER;
  v_seq     TEXT;
BEGIN
  v_id := p_prefix || '/' || p_fy;

  -- Upsert: insert if not exists, then increment atomically
  INSERT INTO invoice_counters (id, counter)
  VALUES (v_id, 1)
  ON CONFLICT (id) DO UPDATE
    SET counter = invoice_counters.counter + 1
  RETURNING counter INTO v_counter;

  -- Zero-pad to 4 digits
  v_seq := LPAD(v_counter::TEXT, 4, '0');

  RETURN p_prefix || '/' || p_fy || '/' || v_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_invoice_number(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_next_invoice_number(TEXT, TEXT) TO authenticated;
