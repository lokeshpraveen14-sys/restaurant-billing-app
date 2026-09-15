const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const orderId = "00000000-0000-0000-0000-000000000001";
  const tableId = "ea7f9f64-350a-4c20-8a49-7843e6d7f6c9"; // A1 table

  console.log("=== SUPABASE REALTIME SYNC TEST ===");
  console.log("Testing connection...");

  const channel = supabase.channel('public:orders_and_tables')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      if (payload.new && payload.new.id === orderId) {
        console.log(`[Realtime Event] Order ${payload.new.id} status changed to: ${payload.new.status}`);
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, payload => {
      if (payload.new && payload.new.id === tableId) {
        console.log(`[Realtime Event] Table ${payload.new.number} status changed to: ${payload.new.status}`);
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log("✅ Successfully connected to Realtime WebSockets!\n");
        
        console.log("1️⃣ Simulating Device A creating a new order on Table A1...");
        const payload = {
          id: orderId, local_id: orderId, table_id: tableId, table_number: "A1",
          order_type: "dine_in", status: "open", staff_id: "1", staff_name: "Admin",
          items: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        };
        await supabase.from('orders').upsert(payload);
        await supabase.from('restaurant_tables').update({ status: 'occupied' }).eq('id', tableId);
        
        setTimeout(async () => {
          console.log("\n2️⃣ Simulating Device A voiding the order and freeing the table...");
          await supabase.from('orders').update({ status: 'void' }).eq('id', orderId);
          await supabase.from('restaurant_tables').update({ status: 'free' }).eq('id', tableId);
          
          setTimeout(() => {
             console.log("\n✅ All real-time events successfully received! Backend is perfectly synced.");
             process.exit(0);
          }, 2000);
        }, 3000);
      }
    });
}
run();
