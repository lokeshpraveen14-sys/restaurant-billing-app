/**
 * MIGRATE_DATA.mjs
 * ─────────────────────────────────────────────────────────────
 * Migrates ALL data from OLD Supabase → NEW Supabase project.
 * Run: node MIGRATE_DATA.mjs
 *
 * What it copies:
 *   staff_users, app_settings, restaurant_tables, menu_items,
 *   bank_accounts, vendors, shifts, bills,
 *   ledger_transactions, salary_records, invoice_counters
 * ─────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';

// ── OLD PROJECT (source) ──────────────────────────────────────
const OLD_URL = 'https://nencdjwiglqhgvglfmtv.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbmNkandpZ2xxaGd2Z2xmbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MDU3OTUsImV4cCI6MjEwNjM4MTc5NX0.kq6gfZuYVUskXtWinXvtmOtKu48ZGStI2eyNN4erGZk';

// ── NEW PROJECT (destination) ─────────────────────────────────
const NEW_URL = 'https://czflketsnfyicpnfjfrb.supabase.co';
const NEW_KEY = 'sb_publishable_cLKyR5xgBQtajm4HfPHwgw_WBcFxx2F';

const oldDb = createClient(OLD_URL, OLD_KEY);
const newDb = createClient(NEW_URL, NEW_KEY);

const BATCH = 500; // rows per upsert batch

async function fetchAll(client, table, orderCol = 'created_at') {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order(orderCol, { ascending: true })
      .range(from, from + BATCH - 1);

    if (error) {
      console.error(`  ✗ fetch error from ${table}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

async function upsertAll(client, table, rows, conflictCol = 'id') {
  if (rows.length === 0) return 0;
  let uploaded = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await client
      .from(table)
      .upsert(chunk, { onConflict: conflictCol, ignoreDuplicates: false });
    if (error) {
      console.error(`  ✗ upsert error to ${table} (batch ${i}–${i + chunk.length}):`, error.message);
    } else {
      uploaded += chunk.length;
      process.stdout.write(`\r  → ${uploaded}/${rows.length} rows upserted to ${table}  `);
    }
  }
  console.log('');
  return uploaded;
}

// Tables in dependency order (FK order matters)
const TABLES = [
  { name: 'staff_users',         conflict: 'id' },
  { name: 'app_settings',        conflict: 'id' },
  { name: 'restaurant_tables',   conflict: 'id' },
  { name: 'menu_items',          conflict: 'id' },
  { name: 'bank_accounts',       conflict: 'id' },
  { name: 'vendors',             conflict: 'id' },
  { name: 'shifts',              conflict: 'id' },
  { name: 'bills',               conflict: 'id' },
  { name: 'ledger_transactions', conflict: 'id' },
  { name: 'salary_records',      conflict: 'id' },
  { name: 'invoice_counters',    conflict: 'id' },
  { name: 'print_jobs',          conflict: 'id' },
];

async function migrate() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Railway Billing — Supabase Data Migration');
  console.log('═══════════════════════════════════════════════');
  console.log(' OLD:', OLD_URL);
  console.log(' NEW:', NEW_URL);
  console.log('───────────────────────────────────────────────\n');

  // Test NEW project connectivity first
  const { error: pingErr } = await newDb.from('app_settings').select('id').limit(1);
  if (pingErr) {
    console.error('✗ Cannot connect to NEW project:', pingErr.message);
    console.error('  → Run NEW_PROJECT_SCHEMA_FINAL.sql in the new project SQL Editor first!');
    process.exit(1);
  }
  console.log('✓ New project connection OK\n');

  const summary = [];

  for (const { name, conflict } of TABLES) {
    console.log(`📦 Migrating: ${name}`);
    const orderCol = name === 'invoice_counters' || name === 'app_settings' ? 'id' : 'created_at';

    // Fetch from old
    process.stdout.write(`  ← Fetching from old project...`);
    const rows = await fetchAll(oldDb, name, orderCol);
    console.log(` ${rows.length} rows found`);

    if (rows.length === 0) {
      summary.push({ table: name, fetched: 0, upserted: 0 });
      continue;
    }

    // Upsert to new
    const upserted = await upsertAll(newDb, name, rows, conflict);
    summary.push({ table: name, fetched: rows.length, upserted });
    console.log(`  ✓ Done: ${upserted}/${rows.length}\n`);
  }

  // Print summary
  console.log('\n═══════════════════════════════════════════════');
  console.log(' MIGRATION SUMMARY');
  console.log('═══════════════════════════════════════════════');
  let totalRows = 0;
  for (const { table, fetched, upserted } of summary) {
    const status = upserted === fetched ? '✓' : '⚠';
    console.log(`  ${status} ${table.padEnd(22)} ${String(fetched).padStart(5)} fetched  ${String(upserted).padStart(5)} upserted`);
    totalRows += upserted;
  }
  console.log('───────────────────────────────────────────────');
  console.log(`  Total rows migrated: ${totalRows}`);
  console.log('═══════════════════════════════════════════════\n');
  console.log('✅ Migration complete! Now update src/lib/supabase.ts with the new credentials.');
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
