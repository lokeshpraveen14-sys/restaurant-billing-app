-- ============================================================
-- COMPLETE SETUP — New Supabase Project (nencdjwiglqhgvglfmtv)
-- Run this ONCE in the new project SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INTEGER NOT NULL,
  name TEXT,
  capacity INTEGER DEFAULT 4,
  status TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_tables" ON public.restaurant_tables FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.menu_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'food',
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_categories" ON public.menu_categories FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.menu_categories(id),
  category_name TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  is_veg BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  gst_rate NUMERIC DEFAULT 5,
  hsn_code TEXT,
  description TEXT,
  variants JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_menu_items" ON public.menu_items FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID,
  table_number INTEGER,
  order_type TEXT DEFAULT 'dine-in',
  status TEXT DEFAULT 'active',
  staff_name TEXT,
  staff_id TEXT,
  guest_count INTEGER DEFAULT 1,
  items JSONB DEFAULT '[]'::jsonb,
  kot_printed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

CREATE TABLE IF NOT EXISTS public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT UNIQUE,
  order_id UUID,
  table_id UUID,
  table_number INTEGER,
  order_type TEXT,
  items JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC DEFAULT 0,
  total_gst NUMERIC DEFAULT 0,
  cgst_amount NUMERIC DEFAULT 0,
  sgst_amount NUMERIC DEFAULT 0,
  igst_amount NUMERIC DEFAULT 0,
  service_charge NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  payments JSONB DEFAULT '[]'::jsonb,
  staff_name TEXT,
  status TEXT DEFAULT 'paid',
  voided_by TEXT,
  voided_at TIMESTAMPTZ,
  void_reason TEXT,
  guest_count INTEGER,
  customer_gstin TEXT,
  hsn_codes JSONB,
  place_of_supply TEXT,
  outlet_gstin TEXT,
  is_gst_bill BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
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
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_shifts" ON public.shifts FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;

CREATE TABLE IF NOT EXISTS public.staff_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'waiter',
  pin TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_staff" ON public.staff_users FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_id TEXT NOT NULL,
  printer_ip TEXT NOT NULL,
  printer_port INTEGER NOT NULL DEFAULT 9100,
  receipt_data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_print_jobs" ON public.print_jobs FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  account_number TEXT,
  bank_name TEXT,
  balance NUMERIC DEFAULT 0,
  reconciled_balance NUMERIC,
  last_reconciled_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_bank_accounts" ON public.bank_accounts FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  type TEXT NOT NULL,
  category TEXT,
  narration TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_ledger" ON public.ledger_transactions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact TEXT,
  gstin TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_vendors" ON public.vendors FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.salary_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID,
  staff_name TEXT,
  amount NUMERIC DEFAULT 0,
  month TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.salary_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_salary" ON public.salary_records FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  printers JSONB DEFAULT '[]'::jsonb,
  restaurant_info JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.app_settings (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.app_settings (id) VALUES ('roles') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;

CREATE TABLE IF NOT EXISTS public.invoice_counters (
  id TEXT PRIMARY KEY,
  counter INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_invoice_counters" ON public.invoice_counters FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION get_invoice_number_v2(p_prefix TEXT, p_fy TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE v_id TEXT; v_counter INTEGER; v_seq TEXT;
BEGIN
  v_id := p_prefix || '/' || p_fy;
  INSERT INTO invoice_counters (id, counter) VALUES (v_id, 1)
  ON CONFLICT (id) DO UPDATE SET counter = invoice_counters.counter + 1
  RETURNING counter INTO v_counter;
  v_seq := LPAD(v_counter::TEXT, 4, '0');
  RETURN p_prefix || '/' || p_fy || '/' || v_seq;
END;
$$;
GRANT EXECUTE ON FUNCTION get_invoice_number_v2(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_invoice_number_v2(TEXT, TEXT) TO authenticated;

-- DONE: All tables ready. Import old bills via Table Editor → bills → Import CSV
