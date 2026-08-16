import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Listening for changes on 'orders' table...");
  const channel = supabase.channel('public:orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      console.log('REALTIME EVENT RECEIVED:', payload);
    })
    .subscribe((status) => {
      console.log('Subscription status:', status);
    });

  setTimeout(async () => {
    console.log("Triggering an upsert to see if we get the event...");
    const { data, error } = await supabase.from('orders').upsert({
      id: '00000000-0000-0000-0000-000000000000',
      local_id: 'test-local-id',
      order_type: 'dine-in',
      status: 'open',
      staff_id: '123',
      staff_name: 'test',
      items: []
    });
    console.log("Upsert result:", error ? error.message : "Success");
  }, 2000);

  setTimeout(() => {
    console.log("Done waiting.");
    process.exit(0);
  }, 10000);
}

test();
