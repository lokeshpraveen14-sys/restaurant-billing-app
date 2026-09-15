const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Subscribing to realtime...');
  
  const channel = supabase.channel('public:orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      console.log('Received realtime event!', payload.eventType, payload.new.id);
    })
    .subscribe(status => {
      console.log('Subscribe status:', status);
      
      if (status === 'SUBSCRIBED') {
        console.log('Triggering upsert...');
        setTimeout(async () => {
          const payload = {
            id: "3e039ce5-17a4-4cc4-b25c-59fc96f2a992", 
            local_id: "3e039ce5-17a4-4cc4-b25c-59fc96f2a992",
            table_id: "ea7f9f64-350a-4c20-8a49-7843e6d7f6c9",
            table_number: "A1",
            order_type: "dine_in",
            status: "open",
            staff_id: "1",
            staff_name: "Admin",
            seats: [1],
            items: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            kot_printed_at: null
          };
          const { error } = await supabase.from('orders').upsert(payload);
          console.log('Upsert done, error:', error);
          
          setTimeout(() => {
             console.log('Test complete');
             process.exit(0);
          }, 3000);
        }, 1000);
      }
    });
}
run();
