-- Run this script in your Supabase SQL Editor to create the app_settings table
-- This stores shared printer configuration across all devices

CREATE TABLE IF NOT EXISTS public.app_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  printers JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default row
INSERT INTO public.app_settings (id, printers) VALUES ('default', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;

-- RLS policies (open for this demo app)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on app_settings"
  ON public.app_settings FOR SELECT USING (true);

CREATE POLICY "Allow public update on app_settings"
  ON public.app_settings FOR UPDATE USING (true);

CREATE POLICY "Allow public insert on app_settings"
  ON public.app_settings FOR INSERT WITH CHECK (true);
