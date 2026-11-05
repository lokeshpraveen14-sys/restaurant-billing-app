/**
 * MIGRATE_SHIFTS_ONLY.mjs
 * Migrates ONLY shifts — run after bills migration
 * node MIGRATE_SHIFTS_ONLY.mjs
 */

import { createClient } from '@supabase/supabase-js';

const OLD_URL = 'https://nencdjwiglqhgvglfmtv.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbmNkandpZ2xxaGd2Z2xmbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MDU3OTUsImV4cCI6MjEwNjM4MTc5NX0.kq6gfZuYVUskXtWinXvtmOtKu48ZGStI2eyNN4erGZk';
const NEW_URL = 'https://czflketsnfyicpnfjfrb.supabase.co';
const NEW_KEY = 'sb_publishable_cLKyR5xgBQtajm4HfPHwgw_WBcFxx2F';

const oldDb = createClient(OLD_URL, OLD_KEY);
const newDb = createClient(NEW_URL, NEW_KEY);

async function run() {
  console.log('Fetching shifts from old project...');
  const { data, error } = await oldDb.from('shifts').select('*').order('opened_at', { ascending: true }).limit(5000);

  if (error) {
    console.error('✗ Could not fetch shifts:', error.message);
    console.log('  The old project quota may be fully exhausted.');
    return;
  }
  console.log(`Found ${data?.length || 0} shifts`);
  if (!data || data.length === 0) return;

  const { error: upErr } = await newDb.from('shifts').upsert(data, { onConflict: 'id' });
  if (upErr) console.error('✗ Upsert error:', upErr.message);
  else console.log(`✅ ${data.length} shifts migrated!`);
}

run();
