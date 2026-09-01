import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data, error } = await supabase.from('print_jobs').insert({
    printer_ip: '192.168.1.10',
    printer_port: 9100,
    receipt_data: 'test',
    status: 'pending'
  });
  
  console.log("Insert print_jobs error:", error);
  console.log("Insert print_jobs data:", data);
}

checkSchema();
