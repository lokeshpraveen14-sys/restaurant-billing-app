const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data } = await supabase.from('menu_items').select('*');
  const badItems = data.filter(d => d.base_price == null);
  console.log("Items with null base_price:", badItems.length);
  
  if (badItems.length > 0) {
    console.log(badItems.map(i => i.name));
  }
}
run();
