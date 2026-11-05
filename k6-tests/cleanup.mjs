import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://czflketsnfyicpnfjfrb.supabase.co';
const ANON_KEY = 'sb_publishable_cLKyR5xgBQtajm4HfPHwgw_WBcFxx2F';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

const TEST_STAFF_NAME = 'K6_LOAD_TEST';
const TEST_TABLE_NUMBER = 'T-K6-TEST';
const TEST_INVOICE_PREFIX = 'INV-K6-%';

export async function cleanupTestData() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧹 RUNNING TEST DATA CLEANUP (Zero impact to production data)');
  console.log('═══════════════════════════════════════════════════════════════');

  // 1. Delete Test Bills
  console.log('Deleting test bills (staff_name = "K6_LOAD_TEST" or invoice_number LIKE "INV-K6-%")...');
  const { error: err1 } = await supabase
    .from('bills')
    .delete()
    .or(`staff_name.eq.${TEST_STAFF_NAME},invoice_number.like.${TEST_INVOICE_PREFIX}`);
  
  if (err1) {
    console.warn('  ⚠️ Note during bills delete:', err1.message);
  } else {
    console.log('  ✅ Test bills deleted.');
  }

  // 2. Delete Test Orders
  console.log('Deleting test orders (staff_name = "K6_LOAD_TEST" or table_number = "T-K6-TEST")...');
  const { error: err2 } = await supabase
    .from('orders')
    .delete()
    .or(`staff_name.eq.${TEST_STAFF_NAME},table_number.eq.${TEST_TABLE_NUMBER}`);

  if (err2) {
    console.warn('  ⚠️ Note during orders delete:', err2.message);
  } else {
    console.log('  ✅ Test orders deleted.');
  }

  // 3. Delete Test Shifts
  console.log('Deleting test shifts (staff_name = "K6_LOAD_TEST")...');
  const { error: err3 } = await supabase
    .from('shifts')
    .delete()
    .eq('staff_name', TEST_STAFF_NAME);

  if (err3) {
    console.warn('  ⚠️ Note during shifts delete:', err3.message);
  } else {
    console.log('  ✅ Test shifts deleted.');
  }

  // 4. Verification Check
  console.log('\n🔍 Verifying residual test data...');
  const { count: testBillsCount } = await supabase
    .from('bills')
    .select('*', { count: 'exact', head: true })
    .or(`staff_name.eq.${TEST_STAFF_NAME},invoice_number.like.${TEST_INVOICE_PREFIX}`);

  const { count: testOrdersCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .or(`staff_name.eq.${TEST_STAFF_NAME},table_number.eq.${TEST_TABLE_NUMBER}`);

  const { count: testShiftsCount } = await supabase
    .from('shifts')
    .select('*', { count: 'exact', head: true })
    .eq('staff_name', TEST_STAFF_NAME);

  console.log(`  Residual test bills:  ${testBillsCount ?? 0}`);
  console.log(`  Residual test orders: ${testOrdersCount ?? 0}`);
  console.log(`  Residual test shifts: ${testShiftsCount ?? 0}`);

  // 5. Total Production Counts Check
  const { count: totalBills } = await supabase.from('bills').select('*', { count: 'exact', head: true });
  const { count: totalShifts } = await supabase.from('shifts').select('*', { count: 'exact', head: true });

  console.log('\n📊 Production Data Integrity:');
  console.log(`  Total production bills:  ${totalBills}`);
  console.log(`  Total production shifts: ${totalShifts}`);

  if ((testBillsCount ?? 0) === 0 && (testOrdersCount ?? 0) === 0 && (testShiftsCount ?? 0) === 0) {
    console.log('\n✨ SUCCESS: All test data completely removed. Production data is 100% clean!');
  } else {
    console.error('\n⚠️ WARNING: Some test data may still be present.');
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

// Run directly if invoked from command line
if (process.argv[1]?.endsWith('cleanup.mjs')) {
  cleanupTestData().catch((err) => {
    console.error('Cleanup error:', err);
    process.exit(1);
  });
}
