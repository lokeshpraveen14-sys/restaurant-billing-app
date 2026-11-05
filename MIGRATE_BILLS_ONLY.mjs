/**
 * MIGRATE_BILLS_ONLY.mjs
 * ─────────────────────────────────────────────────────────────
 * Migrates ONLY bills from OLD → NEW Supabase.
 * Fixes:
 *   1. No timeout (uses plain fetch, not the 20s timeout version)
 *   2. Small batch size (100 rows) — bills have huge JSONB items
 *   3. Checks new DB first to skip already-migrated bills
 *   4. Per-row fallback for failed batches
 *   5. Resumes where it left off automatically
 *
 * RUN FIRST in Supabase SQL Editor: FIX_BILLS_CONSTRAINT.sql
 * Then: node MIGRATE_BILLS_ONLY.mjs
 * ─────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';

// ── OLD PROJECT (source) ──────────────────────────────────────
const OLD_URL = 'https://nencdjwiglqhgvglfmtv.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbmNkandpZ2xxaGd2Z2xmbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MDU3OTUsImV4cCI6MjEwNjM4MTc5NX0.kq6gfZuYVUskXtWinXvtmOtKu48ZGStI2eyNN4erGZk';

// ── NEW PROJECT (destination) ─────────────────────────────────
const NEW_URL = 'https://czflketsnfyicpnfjfrb.supabase.co';
const NEW_KEY = 'sb_publishable_cLKyR5xgBQtajm4HfPHwgw_WBcFxx2F';

// Plain clients — NO custom timeout (migration needs time for 60K rows)
const oldDb = createClient(OLD_URL, OLD_KEY);
const newDb = createClient(NEW_URL, NEW_KEY);

const FETCH_BATCH = 500;  // rows fetched from old DB per request
const UPSERT_BATCH = 100; // rows upserted to new DB per request (small — bills have big JSONB)
const MAX_RETRIES = 3;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchAllBills() {
  console.log('← Fetching ALL bills from old project...');
  let all = [];
  let from = 0;
  let page = 1;
  while (true) {
    process.stdout.write(`\r  Page ${page}: fetched ${all.length} bills so far...`);
    const { data, error } = await oldDb
      .from('bills')
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + FETCH_BATCH - 1);

    if (error) {
      console.error(`\n  ✗ Fetch error at page ${page}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < FETCH_BATCH) break;
    from += FETCH_BATCH;
    page++;
    // Small pause between fetch pages to avoid rate limits on old project
    await sleep(100);
  }
  console.log(`\n  ✓ Fetched ${all.length} bills total from old project`);
  return all;
}

async function getExistingBillIds() {
  console.log('← Checking which bills already exist in new project...');
  const ids = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await newDb
      .from('bills')
      .select('id')
      .order('created_at', { ascending: true })
      .range(from, from + 1000 - 1);
    if (error || !data || data.length === 0) break;
    data.forEach(r => ids.add(r.id));
    if (data.length < 1000) break;
    from += 1000;
  }
  console.log(`  ✓ ${ids.size} bills already in new project (will skip these)`);
  return ids;
}

async function upsertBatch(rows, batchIndex, total) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await newDb
      .from('bills')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });

    if (!error) return { success: rows.length, failed: 0 };

    if (attempt < MAX_RETRIES) {
      await sleep(500 * attempt); // back-off before retry
      continue;
    }

    // Final attempt failed — try one-by-one to rescue as many as possible
    let success = 0, failed = 0;
    for (const row of rows) {
      try {
        const { error: rowErr } = await newDb
          .from('bills')
          .upsert(row, { onConflict: 'id', ignoreDuplicates: false });
        if (rowErr) {
          failed++;
        } else {
          success++;
        }
      } catch (_) {
        failed++;
      }
    }
    return { success, failed };
  }
}

async function migrateBills() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Bills-Only Migration (Resume Mode)');
  console.log('═══════════════════════════════════════════════\n');

  // 1. Get all bills from old project
  const allBills = await fetchAllBills();
  if (allBills.length === 0) {
    console.log('⚠ No bills found in old project. Quota may be exhausted.');
    console.log('  Try again later or export via Supabase Dashboard → Table Editor → Download CSV');
    process.exit(0);
  }

  // 2. Check what already exists in new project (skip those)
  const existingIds = await getExistingBillIds();
  const toMigrate = allBills.filter(b => !existingIds.has(b.id));
  console.log(`\n→ ${toMigrate.length} bills to migrate (${existingIds.size} already done)\n`);

  if (toMigrate.length === 0) {
    console.log('✅ All bills already migrated!');
    process.exit(0);
  }

  // 3. Upsert in small batches
  let totalSuccess = existingIds.size;
  let totalFailed = 0;
  const grandTotal = allBills.length;

  for (let i = 0; i < toMigrate.length; i += UPSERT_BATCH) {
    const chunk = toMigrate.slice(i, i + UPSERT_BATCH);
    const { success, failed } = await upsertBatch(chunk, i, toMigrate.length);
    totalSuccess += success;
    totalFailed += failed;
    process.stdout.write(
      `\r  → ${totalSuccess}/${grandTotal} migrated, ${totalFailed} failed  `
    );
    // Small pause every 1000 rows to avoid overloading new project
    if (i > 0 && i % 1000 === 0) await sleep(300);
  }

  console.log('\n\n═══════════════════════════════════════════════');
  console.log(' BILLS MIGRATION COMPLETE');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Total bills in old project : ${grandTotal}`);
  console.log(`  Successfully migrated      : ${totalSuccess}`);
  console.log(`  Failed (skipped)           : ${totalFailed}`);
  console.log('═══════════════════════════════════════════════');

  if (totalFailed > 0) {
    console.log('\n⚠ Some bills failed. This is usually due to duplicate invoice numbers.');
    console.log('  Make sure you ran FIX_BILLS_CONSTRAINT.sql in the new project first!');
  } else {
    console.log('\n✅ All bills migrated successfully!');
  }
}

migrateBills().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
