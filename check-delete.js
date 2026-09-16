import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: tables } = await supabase.from('restaurant_tables').select('id, table_number').limit(1);
  if (!tables || tables.length === 0) { console.log('No tables found'); return; }
  
  const testId = tables[0].id;
  console.log('Trying to delete table:', testId);
  const { error } = await supabase.from('restaurant_tables').delete().eq('id', testId);
  console.log('Error:', error);
}
test();
