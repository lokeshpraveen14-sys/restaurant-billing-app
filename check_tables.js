import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  const { data, error } = await supabase.from('shifts').select('*').limit(1);
  if (error) {
    console.error('Shifts table does not exist or error:', error.message);
  } else {
    console.log('Shifts table EXISTS!');
  }
}
checkTables();
