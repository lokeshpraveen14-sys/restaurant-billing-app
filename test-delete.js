import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteTest() {
  const { error } = await supabase.from('bills').delete().eq('id', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
  if (error) console.error('Delete error:', error);
  else console.log('Deleted test bill!');
}
deleteTest();
