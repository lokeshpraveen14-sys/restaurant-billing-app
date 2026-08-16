import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanOrders() {
  console.log("Fetching all orders currently in kitchen...");
  
  // Find all orders that are kot_sent or preparing
  const { data: kitchenOrders, error: fetchError } = await supabase
    .from('orders')
    .select('id, table_number, status')
    .in('status', ['open', 'kot_sent', 'preparing', 'ready']);
    
  if (fetchError) {
    console.error("Error fetching:", fetchError);
    return;
  }
  
  if (!kitchenOrders || kitchenOrders.length === 0) {
    console.log("No active orders found in database.");
    return;
  }
  
  console.log(`Found ${kitchenOrders.length} active orders to delete.`);
  
  for (const order of kitchenOrders) {
    const { error } = await supabase.from('orders').delete().eq('id', order.id);
    if (error) console.log(`Failed to delete ${order.id}:`, error.message);
    else console.log(`Deleted order for Table ${order.table_number} (${order.status})`);
  }
}

cleanOrders();
