import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkKDS() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('status', ['kot_sent', 'preparing', 'ready']);

  if (error) {
    console.error("Fetch error:", error);
    return;
  }
  
  console.log(`Found ${data.length} total orders in kitchen status in DB.`);
  
  const activeOrders = data.filter(o => ['kot_sent', 'preparing'].includes(o.status));
  console.log(`Of those, ${activeOrders.length} match KDS filter (kot_sent, preparing).`);
  
  if (activeOrders.length > 0) {
    const o = activeOrders[0];
    console.log(`Example active order: ID=${o.id}, Status=${o.status}, Table=${o.table_number}, Items=${o.items?.length}`);
    
    // Check if items themselves have weird statuses that filter them out?
    console.log("Items:", JSON.stringify(o.items, null, 2));
  }
}

checkKDS();
