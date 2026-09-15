import { supabase } from './src/lib/supabase';
async function test() {
  const { data, error } = await supabase.from('orders').select('*').limit(1);
  console.log(data?.[0]);
}
test();
