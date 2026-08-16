import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testRealAppFlow() {
  const targetId = 'dbdc86b7-edf1-476b-b8d2-7623b45fa505';
  
  // 1. Fetch
  const { data: orderData, error: fetchErr } = await supabase.from('orders').select('*').eq('id', targetId).single();
  if (fetchErr) {
    console.log("Fetch err:", fetchErr);
    return;
  }
  
  console.log("Original status:", orderData.status);
  
  // 2. Upsert
  const { error: upsertErr } = await supabase.from('orders').upsert({
    id: orderData.id,
    local_id: orderData.local_id,
    table_id: orderData.table_id,
    table_number: orderData.table_number,
    order_type: orderData.order_type,
    status: 'kot_sent',
    staff_id: orderData.staff_id,
    staff_name: orderData.staff_name,
    items: orderData.items,
    guest_count: orderData.guest_count,
    cover_charge: orderData.cover_charge,
    created_at: orderData.created_at,
    updated_at: new Date().toISOString(),
    kot_printed_at: new Date().toISOString()
  });
  
  console.log("Upsert err:", upsertErr);
  
  // 3. Verify
  const { data: checkData } = await supabase.from('orders').select('status').eq('id', targetId).single();
  console.log("Final status:", checkData.status);
}

testRealAppFlow();
