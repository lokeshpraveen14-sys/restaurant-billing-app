import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrdersSelect() {
  const { data, error } = await supabase.from('orders').select('*').limit(5);
  console.log("Error:", error);
  console.log("Data count:", data?.length);
}

checkOrdersSelect();
