import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function dumpSchema() {
  const { data, error } = await supabase.from('orders').upsert({
    id: '12345678-1234-1234-1234-123456789012',
    local_id: '12345678-1234-1234-1234-123456789012',
    table_id: null,
    table_number: 'T1',
    order_type: 'dine-in',
    status: 'open',
    staff_id: 'waiter1',
    staff_name: 'waiter1',
    items: [],
  });
  
  console.log("Upsert 2 error:", error?.message);
}

dumpSchema();
