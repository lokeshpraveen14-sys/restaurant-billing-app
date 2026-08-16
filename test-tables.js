import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  const { data, error } = await supabase.from('restaurant_tables').select('*');
  console.log("Error:", error?.message);
  console.log("Tables:", data?.length);
  if (data?.length > 0) {
    console.log("Example table:", data[0].id, data[0].table_number);
  }
}

checkTables();
