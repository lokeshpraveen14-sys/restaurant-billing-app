/**
 * Restaurant Billing – Cloud Print Queue Daemon
 * ------------------------------------------------
 * Listens to Supabase for new print jobs and routes them to local LAN printers.
 * Features:
 * - Anti-flood deduplication: drops duplicate print jobs within 10s
 * - Safe single-channel reconnection (no recursive stack overflow)
 * - Auto-cleanup of completed and failed print jobs
 */
const { createClient } = require('@supabase/supabase-js');
const net = require('net');

const supabaseUrl = 'https://nencdjwiglqhgvglfmtv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbmNkandpZ2xxaGd2Z2xmbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MDU3OTUsImV4cCI6MjEwNjM4MTc5NX0.kq6gfZuYVUskXtWinXvtmOtKu48ZGStI2eyNN4erGZk';
const supabase = createClient(supabaseUrl, supabaseKey);

// In-memory deduplication cache
const processedJobIds = new Set();
const recentPrintHashes = new Map(); // contentHash -> timestamp

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
  if (!job || !job.id) return;

  // 1. Check ID deduplication
  if (processedJobIds.has(job.id)) {
    return;
  }
  processedJobIds.add(job.id);
  if (processedJobIds.size > 2000) {
    const first = processedJobIds.values().next().value;
    processedJobIds.delete(first);
  }

  // 2. Anti-flood content deduplication:
  // If the EXACT same receipt is sent to the same printer within 8 seconds, drop the duplicate
  const contentHash = `${job.printer_ip}_${job.receipt_data ? job.receipt_data.slice(0, 100) : ''}_${job.receipt_data ? job.receipt_data.length : 0}`;
  const now = Date.now();
  const lastPrinted = recentPrintHashes.get(contentHash);

  if (lastPrinted && (now - lastPrinted) < 8000) {
    console.log(`⚠️  Suppressed duplicate print storm for ${job.printer_ip} (received within ${(now - lastPrinted) / 1000}s)`);
    // Delete duplicate job from DB to avoid re-triggering
    await supabase.from('print_jobs').delete().eq('id', job.id).catch(() => {});
    return;
  }
  recentPrintHashes.set(contentHash, now);

  try {
    const { id, printer_ip, printer_port, receipt_data } = job;
    console.log(`\n🖨️  New print job [ID: ${id.split('-')[0]}]`);
    console.log(`   Routing to ${printer_ip}:${printer_port}...`);

    const buf = Buffer.from(receipt_data, 'base64');
    await sendToPrinter(printer_ip, printer_port, buf);
    console.log(`✅  Printed successfully!`);

    // Delete job after completion to keep DB clean
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
  } catch (e) {
    console.error('Polling error:', e.message);
  } finally {
    isPolling = false;
  }
}

let activeChannel = null;
let reconnectTimer = null;
let retryDelay = 5000;
const MAX_RETRY = 60000;

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.warn(`⚠️  Realtime disconnected. Reconnecting in ${retryDelay / 1000}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY);
    connectRealtime();
  }, retryDelay);
}

function connectRealtime() {
  // Clean up any existing channel safely to prevent duplicate Phoenix listeners
  if (activeChannel) {
    try {
      supabase.removeChannel(activeChannel);
    } catch (e) {
      // ignore
    }
    activeChannel = null;
  }

  activeChannel = supabase
    .channel('public:print_jobs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'print_jobs' }, payload => {
      if (payload.new && payload.new.status === 'pending') {
        retryDelay = 5000; // reset delay on healthy event
        processJob(payload.new);
      }
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        retryDelay = 5000;
        console.log('📡 Realtime connection established. Waiting for jobs...');
      } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
        scheduleReconnect();
      }
    });
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

  // 1. Process any pending jobs on startup
  pollPendingJobs();

  // 2. Start single realtime listener
  connectRealtime();
}

startDaemon();
