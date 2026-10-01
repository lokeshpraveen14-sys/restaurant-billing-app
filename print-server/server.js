/**
 * Restaurant Billing – Cloud Print Queue Daemon
 * ------------------------------------------------
 * Listens to Supabase for new print jobs and routes them to local LAN printers.
 */
const { createClient } = require('@supabase/supabase-js');
const net = require('net');

const supabaseUrl = 'https://nencdjwiglqhgvglfmtv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbmNkandpZ2xxaGd2Z2xmbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MDU3OTUsImV4cCI6MjEwNjM4MTc5NX0.kq6gfZuYVUskXtWinXvtmOtKu48ZGStI2eyNN4erGZk';
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

  // 1. Process any missed jobs on startup (once only — no polling loop)
  pollPendingJobs();

  // 2. Subscribe to realtime inserts with exponential backoff
  let retryDelay = 5000;       // start at 5 seconds
  const MAX_RETRY = 300000;    // cap at 5 minutes

  function subscribeRealtime() {
    const channel = supabase
      .channel('public:print_jobs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'print_jobs' }, payload => {
        if (payload.new.status === 'pending') {
          // Reset backoff on successful message
          retryDelay = 5000;
          processJob(payload.new);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          retryDelay = 5000; // reset on success
          console.log('📡 Realtime connection established. Waiting for jobs...');
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          console.warn(`⚠️  Realtime disconnected (${status}). Retrying in ${retryDelay / 1000}s...`);
          supabase.removeChannel(channel);
          setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, MAX_RETRY); // exponential backoff
            subscribeRealtime();
          }, retryDelay);
        }
      });
  }

  subscribeRealtime();

  // NOTE: setInterval polling REMOVED — it was causing 259,200 DB reads/month
  // and burning egress quota. Realtime subscription handles new jobs instantly.
  // The startup pollPendingJobs() above handles any jobs that arrived while offline.
}

startDaemon();
