import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  const { error } = await supabase.from('bills').insert({
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    invoice_number: 'TEST-123',
    order_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
    table_id: null,
    table_number: null,
    order_type: 'dine-in',
    items: [],
    subtotal: 100,
    total_gst: 5,
    service_charge: 0,
    discount_amount: 0,
    total_amount: 105,
    payments: [],
    staff_name: 'Test',
    status: 'paid',
    guest_count: 2,
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error('Insert Error:', error);
  } else {
    console.log('Insert Success!');
  }
}
testInsert();
