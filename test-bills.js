import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  const { data: bills, error: billsErr } = await supabase.from('bills').select('*').limit(5);
  const { data: shifts, error: shiftsErr } = await supabase.from('shifts').select('*').limit(5);

  console.log('Bills Error:', billsErr?.message);
  console.log('Bills Count:', bills?.length);
  console.log('Shifts Error:', shiftsErr?.message);
  console.log('Shifts Count:', shifts?.length);
}
checkData();
