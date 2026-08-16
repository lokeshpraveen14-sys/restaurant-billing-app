/**
 * Restaurant Billing – Cloud Print Queue Daemon
 * ------------------------------------------------
 * Listens to Supabase for new print jobs and routes them to local LAN printers.
 */
const { createClient } = require('@supabase/supabase-js');
const net = require('net');

const supabaseUrl = 'https://dhsafujrmxsqrsxgoifi.supabase.co';
const supabaseKey = 'sb_publishable_wc50FKxA-mWJnyikDRT1wg_vIzFhkwD';
const supabase = createClient(supabaseUrl, supabaseKey);

function sendToPrinter(ip, port, rawBuffer) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(6000);
    socket.connect(port, ip, () => {
      socket.write(rawBuffer, () => {
        socket.destroy();
        resolve();
      });
    });
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Connection timeout')); });
    socket.on('error',   (err) => reject(err));
  });
}

async function processJob(job) {
  try {
    const { id, printer_ip, printer_port, receipt_data } = job;
    console.log(`\n🖨️  New print job received [ID: ${id.split('-')[0]}]`);
    console.log(`   Routing to ${printer_ip}:${printer_port}...`);

    const buf = Buffer.from(receipt_data, 'base64');
    await sendToPrinter(printer_ip, printer_port, buf);
    console.log(`✅  Printed successfully!`);

    // Delete job after completion to keep DB clean and fast
    await supabase.from('print_jobs').delete().eq('id', id);

  } catch (err) {
    console.error(`❌  Print failed for job ${job.id}:`, err.message);
    await supabase.from('print_jobs').update({ status: 'failed' }).eq('id', job.id);
  }
}

let isPolling = false;
async function pollPendingJobs() {
  if (isPolling) return;
  isPolling = true;
  try {
    const { data, error } = await supabase
      .from('print_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching pending jobs:', error.message);
      return;
    }
    for (const job of data || []) {
      await processJob(job);
    }
  } finally {
    isPolling = false;
  }
}

function startDaemon() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Restaurant Billing – Cloud Print Daemon             ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Status: Connected to Supabase Cloud                     ║');
  console.log('║  Listening for remote print jobs from all devices...     ║');
  console.log('║  Keep this window OPEN while billing.                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // 1. Process any missed jobs on startup
  pollPendingJobs();

  // 2. Subscribe to realtime inserts
  supabase
    .channel('public:print_jobs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'print_jobs' }, payload => {
      if (payload.new.status === 'pending') {
        processJob(payload.new);
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('📡 Realtime connection established. Waiting for jobs...');
      }
    });

  // 3. Fallback polling every 10 seconds just in case realtime drops
  setInterval(pollPendingJobs, 10000);
}

startDaemon();
