import { supabase } from './src/lib/supabase';
async function test() {
  const { data, error } = await supabase.from('restaurant_tables').select('pos_x, pos_y').limit(1);
  console.log(data, error);
}
test();
