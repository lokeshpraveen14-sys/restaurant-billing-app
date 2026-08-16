import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecentOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error("Fetch error:", error);
    return;
  }
  
  console.log(`Latest 5 orders in DB:`);
  data.forEach((o, i) => {
    console.log(`\n[${i+1}] ID: ${o.id}`);
    console.log(`    Status: ${o.status}`);
    console.log(`    Table: ${o.table_number}`);
    console.log(`    Created At: ${o.created_at}`);
  });
}

checkRecentOrders();
