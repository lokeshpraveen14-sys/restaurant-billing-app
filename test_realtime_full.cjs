const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const orderId = "3e039ce5-17a4-4cc4-b25c-59fc96f2a996";
  const tableId = "ea7f9f64-350a-4c20-8a49-7843e6d7f6c9";
  
  let events = [];
  
  const channel = supabase.channel('public:orders_test_2')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      if (payload.new && payload.new.id === orderId) {
        console.log('Order event:', payload.eventType, payload.new.status);
        events.push(payload.eventType);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, payload => {
      if (payload.new && payload.new.id === tableId) {
        console.log('Table event:', payload.eventType, payload.new.status);
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const payload = {
          id: orderId, 
          local_id: orderId,
          table_id: tableId,
          table_number: "A1",
          order_type: "dine_in",
          status: "open",
          staff_id: "1",
          staff_name: "Admin",
          items: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await supabase.from('orders').upsert(payload);
        await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', tableId);
        
        setTimeout(async () => {
          await supabase.from('orders').update({ status: 'void' }).eq('id', orderId);
          await supabase.from('restaurant_tables').update({ status: 'free' }).eq('id', tableId);
          
          setTimeout(() => {
             console.log('Events:', events);
             process.exit(0);
          }, 3000);
        }, 2000);
      }
    });
}
run();
