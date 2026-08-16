import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrders() {
  const { data, error } = await supabase.from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log("Error:", error);
  console.log("Latest 10 orders:");
  data?.forEach(o => {
    console.log(`- ${o.id} | Status: ${o.status} | Items: ${o.items.length} | Source: ${o.staff_name}`);
  });
}

checkOrders();
