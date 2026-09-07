import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// read .env.local
const env = fs.readFileSync(path.resolve('.env.local'), 'utf8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function run() {
  const { count, error } = await supabase.from('bills').select('*', { count: 'exact', head: true });
  console.log('Total bills:', count, error);
}
run();
