-- ============================================================
-- Accounting v2 Migration
-- Run once in Supabase SQL Editor
-- Safe: only ADDs columns / tables, never drops or renames
-- ============================================================

-- ── 1. bills: new GST columns ──────────────────────────────
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS customer_gstin     TEXT,
  ADD COLUMN IF NOT EXISTS hsn_codes          JSONB,        -- { menuItemId: hsnCode }
  ADD COLUMN IF NOT EXISTS cgst_amount        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS place_of_supply    TEXT,
  ADD COLUMN IF NOT EXISTS outlet_gstin       TEXT,
  ADD COLUMN IF NOT EXISTS is_gst_bill        BOOLEAN DEFAULT TRUE;

-- ── 2. bank_accounts: reconciliation columns ───────────────
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS reconciled_balance    NUMERIC,
  ADD COLUMN IF NOT EXISTS last_reconciled_date  DATE;

-- ── 3. invoice_counters: atomic per-FY sequence ────────────
CREATE TABLE IF NOT EXISTS invoice_counters (
  id       TEXT PRIMARY KEY,   -- e.g. "INV/2025-26"
  counter  INTEGER NOT NULL DEFAULT 0
);

-- ── 4. RPC: get_next_invoice_number ────────────────────────
--    Atomically increments the counter and returns the
--    formatted invoice number. Safe for concurrent devices.
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

-- Grant execute to anon and authenticated (adjust if you use RLS)
GRANT EXECUTE ON FUNCTION get_next_invoice_number(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_next_invoice_number(TEXT, TEXT) TO authenticated;
