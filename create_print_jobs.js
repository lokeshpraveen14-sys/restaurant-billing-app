import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const query = `
CREATE TABLE IF NOT EXISTS public.print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    printer_ip TEXT NOT NULL,
    printer_port INTEGER DEFAULT 9100,
    receipt_data TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users only" ON public.print_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon users" ON public.print_jobs FOR ALL USING (true) WITH CHECK (true);
`;
// Can't run raw SQL from anon key easily unless using an RPC.
console.log("Need to run this SQL in Supabase dashboard or via RPC.");
