import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBills() {
  const { data, error } = await supabase.from('bills').select('*');
  if (error) {
    console.error('Error fetching bills:', error.message);
  } else {
    console.log('Bills fetched successfully. Count:', data?.length);
  }
}

checkBills();
