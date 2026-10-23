-- Fix incorrect schema in the new project

DROP TABLE IF EXISTS public.menu_items;
DROP TABLE IF EXISTS public.menu_categories CASCADE;
DROP TABLE IF EXISTS public.restaurant_tables;
DROP TABLE IF EXISTS public.staff_users;

-- 1. Recreate menu_items to match old project EXACTLY
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id TEXT,
  description TEXT,
  base_price NUMERIC,
  is_veg BOOLEAN DEFAULT true,
  is_special BOOLEAN DEFAULT false,
  available BOOLEAN DEFAULT true,
  gst_rate NUMERIC DEFAULT 5,
  price_per_kg NUMERIC,
  variants JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  hsn_code TEXT
);
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_menu_items" ON public.menu_items FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;

-- 2. Recreate restaurant_tables to match old project EXACTLY
CREATE TABLE public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number TEXT,
  capacity INTEGER,
  section TEXT,
  status TEXT DEFAULT 'free',
  reserved_for TEXT,
  occupied_since TIMESTAMPTZ,
  pos_x INTEGER DEFAULT 0,
  pos_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 60,
  height INTEGER DEFAULT 60,
  shape TEXT DEFAULT 'square',
  rotation INTEGER DEFAULT 0,
  merged_into UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_tables" ON public.restaurant_tables FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;

-- 3. Recreate staff_users to match old project EXACTLY
CREATE TABLE public.staff_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'waiter',
  pin TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_staff" ON public.staff_users FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_users;

-- 4. Fix orders table_number to support alphanumeric table numbers (e.g. C2, C4, C6, D1)
ALTER TABLE public.orders ALTER COLUMN table_number TYPE TEXT;
