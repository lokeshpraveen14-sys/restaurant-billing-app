-- ============================================================
-- SQL Update: Enable Realtime for Bills & Fix Invoice Numbering
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Ensure public.bills is added to the Supabase Realtime publication
--    This enables instantaneous cross-device sync (e.g. tablet cashier to laptop admin)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bills;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Table is already in publication, safe to continue
  END;
END $$;

-- 2. Fix the get_invoice_number_v2 function:
--    The previous version used LPAD(..., 4, '0'), which in PostgreSQL truncates
--    any number with 5 or more digits down to 4 characters (e.g., 11539 -> 1153).
--    GREATEST(4, LENGTH(v_counter::TEXT)) ensures it pads up to 4 digits minimum
--    WITHOUT EVER TRUNCATING larger numbers!
CREATE OR REPLACE FUNCTION get_invoice_number_v2(
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

  -- Format sequence: pad with zero to at least 4 digits, never truncate
  v_seq := LPAD(v_counter::TEXT, GREATEST(4, LENGTH(v_counter::TEXT)), '0');

  RETURN p_prefix || '/' || p_fy || '/' || v_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION get_invoice_number_v2(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_invoice_number_v2(TEXT, TEXT) TO authenticated;

-- Also update get_next_invoice_number to match
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

  INSERT INTO invoice_counters (id, counter)
  VALUES (v_id, 1)
  ON CONFLICT (id) DO UPDATE
    SET counter = invoice_counters.counter + 1
  RETURNING counter INTO v_counter;

  v_seq := LPAD(v_counter::TEXT, GREATEST(4, LENGTH(v_counter::TEXT)), '0');
  RETURN p_prefix || '/' || p_fy || '/' || v_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_invoice_number(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_next_invoice_number(TEXT, TEXT) TO authenticated;
