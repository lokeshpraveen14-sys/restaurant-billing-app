import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRLS() {
  const id = '11111111-1111-1111-1111-111111111111';
  console.log("Creating test order...");
  let res = await supabase.from('orders').upsert({
    id,
    local_id: 'test_local',
    order_type: 'dine-in',
    status: 'open',
    staff_id: 'test',
    staff_name: 'test',
    items: []
  });
  console.log("Insert error:", res.error);

  console.log("Updating test order to kot_sent...");
  // Use upsert to simulate what the app actually does!
  res = await supabase.from('orders').upsert({
    id,
    local_id: 'test_local',
    order_type: 'dine-in',
    status: 'kot_sent',
    staff_id: 'test',
    staff_name: 'test',
    items: []
  });
  console.log("Update error:", res.error);
  
  const { data } = await supabase.from('orders').select('status').eq('id', id).single();
  console.log("Current status in DB:", data?.status);
}

checkRLS();
