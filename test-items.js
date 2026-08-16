import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrders() {
  const { data, error } = await supabase.from('orders').select('*').eq('status', 'kot_sent');
  console.log("Error:", error);
  if (data && data.length > 0) {
    console.log("Found kot_sent order!");
    console.log("Items:", JSON.stringify(data[0].items, null, 2));
  } else {
    console.log("No kot_sent orders found in DB!");
  }
}

checkOrders();
