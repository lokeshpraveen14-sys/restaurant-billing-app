const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('get_triggers', { table_name: 'orders' });
  console.log('Triggers:', data, error);
}
run();
