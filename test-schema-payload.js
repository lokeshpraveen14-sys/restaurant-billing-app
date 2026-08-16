import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableInfo() {
  const { data, error } = await supabase.rpc('get_table_schema', { table_name: 'orders' });
  console.log("RPC Error (if any):", error?.message);
  
  // If no RPC, let's just insert and catch the specific error
  const testId = '12345678-1234-1234-1234-123456789012';
  
  // Let's create exactly what orderStore creates
  const mockOrder = {
    id: testId,
    localId: '12345678-1234-1234-1234-123456789012',
    tableId: 't1', // invalid uuid
    tableNumber: 'T1',
    orderType: 'dine-in',
    status: 'kot_sent',
    staffId: 'waiter1',
    staffName: 'waiter1',
    items: [{ id: 'item1', menuItemName: 'Roll', quantity: 1, unitPrice: 100, totalPrice: 100, status: 'pending' }],
    guestCount: 2,
    coverCharge: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    kotPrintedAt: new Date(),
  };

  const isValidUUID = (id) => id && id.length === 36;

  const upsertData = {
    id: mockOrder.id,
    local_id: mockOrder.localId,
    table_id: isValidUUID(mockOrder.tableId) ? mockOrder.tableId : null,
    table_number: mockOrder.tableNumber || null,
    order_type: mockOrder.orderType,
    status: mockOrder.status,
    staff_id: mockOrder.staffId,
    staff_name: mockOrder.staffName,
    items: mockOrder.items,
    created_at: new Date(mockOrder.createdAt).toISOString(),
    updated_at: new Date().toISOString(),
    kot_printed_at: mockOrder.kotPrintedAt ? new Date(mockOrder.kotPrintedAt).toISOString() : null,
  };

  console.log("Upserting:", JSON.stringify(upsertData, null, 2));

  const { error: upsertError } = await supabase.from('orders').upsert(upsertData);
  console.log("Upsert error:", upsertError);
}

checkTableInfo();
