import { supabase } from './src/lib/supabase';
async function test() {
  const { data, error } = await supabase.rpc('get_schema_info');
  console.log(data, error);
}
test();
