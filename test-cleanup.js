import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanOrders() {
  // Delete the known test orders
  const testIds = [
    '11111111-1111-1111-1111-111111111111',
    '00000000-0000-0000-0000-000000000000'
  ];
  
  console.log("Deleting specific test orders...");
  for (const id of testIds) {
    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) console.log(`Failed to delete ${id}:`, error.message);
    else console.log(`Deleted ${id}`);
  }
}

cleanOrders();
