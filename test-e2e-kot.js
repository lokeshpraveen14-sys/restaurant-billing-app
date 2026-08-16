import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

// Simulate the KITCHEN device — listen for changes
const channel = supabase.channel('public:orders')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
    console.log(`\n🔔 KITCHEN DEVICE received event:`);
    console.log(`   Type: ${payload.eventType}`);
    if (payload.new) {
      console.log(`   Order ID: ${payload.new.id}`);
      console.log(`   Status: ${payload.new.status}`);
      console.log(`   Table: ${payload.new.table_number}`);
      console.log(`   Items count: ${payload.new.items?.length}`);
    }
  })
  .subscribe(async (status) => {
    console.log(`Kitchen subscription status: ${status}`);
    if (status === 'SUBSCRIBED') {
      console.log('\n✅ Kitchen is listening. Now simulating waiter sending KOT...\n');

      const testId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1';

      // Step 1: Create open order  
      const { error: e1 } = await supabase.from('orders').upsert({
        id: testId,
        local_id: 'test-kot-local',
        table_number: 'T1',
        order_type: 'dine-in',
        status: 'open',
        staff_id: 'waiter-1',
        staff_name: 'Test Waiter',
        items: [{ id: 'item1', menuItemName: 'Chicken Roll', quantity: 1, unitPrice: 120, totalPrice: 120, status: 'pending' }],
      });
      console.log('Waiter: Created order. Error:', e1?.message || 'none');

      // Step 2: KOT after 2 seconds
      await new Promise(r => setTimeout(r, 2000));
      console.log('Waiter: Pressing KOT...');
      const { error: e2 } = await supabase.from('orders').upsert({
        id: testId,
        local_id: 'test-kot-local',
        table_number: 'T1',
        order_type: 'dine-in',
        status: 'kot_sent',
        staff_id: 'waiter-1',
        staff_name: 'Test Waiter',
        items: [{ id: 'item1', menuItemName: 'Chicken Roll', quantity: 1, unitPrice: 120, totalPrice: 120, status: 'pending' }],
        kot_printed_at: new Date().toISOString(),
      });
      console.log('Waiter: KOT sent. Error:', e2?.message || 'none');

      // Wait then cleanup
      await new Promise(r => setTimeout(r, 4000));
      await supabase.from('orders').delete().eq('id', testId);
      console.log('\n🧹 Cleaned up.');
      process.exit(0);
    }
  });
