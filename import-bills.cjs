/**
 * Import ALL bills from bills_export.json → new Supabase project
 * Uploads in batches of 200 (safe for upsert performance)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ── NEW project credentials ──────────────────────────────────
const NEW_URL = 'https://nencdjwiglqhgvglfmtv.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbmNkandpZ2xxaGd2Z2xmbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MDU3OTUsImV4cCI6MjEwNjM4MTc5NX0.kq6gfZuYVUskXtWinXvtmOtKu48ZGStI2eyNN4erGZk';

const supabase = createClient(NEW_URL, NEW_KEY);

const BATCH_SIZE = 200;

async function importBills() {
  const jsonFile = path.join(__dirname, 'bills_export.json');

  if (!fs.existsSync(jsonFile)) {
    console.error('❌ bills_export.json not found! Run export-bills.cjs first.');
    process.exit(1);
  }

  const allBills = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  console.log(`🔄 Starting import of ${allBills.length} bills to new project...`);
  console.log(`   URL: ${NEW_URL}\n`);

  let imported = 0;
  let errors = 0;

  // Columns that exist in new bills table (drop anything extra from old DB)
  const ALLOWED_COLUMNS = new Set([
    'id','invoice_number','order_id','table_id','table_number','order_type',
    'items','subtotal','total_gst','cgst_amount','sgst_amount','igst_amount',
    'service_charge','discount_amount','total_amount','payments','staff_name',
    'status','voided_by','voided_at','void_reason','guest_count',
    'customer_gstin','hsn_codes','place_of_supply','outlet_gstin','is_gst_bill','created_at'
  ]);

  for (let i = 0; i < allBills.length; i += BATCH_SIZE) {
    const batch = allBills.slice(i, i + BATCH_SIZE).map(row => {
      // Strip any columns not in the new schema
      const clean = {};
      for (const k of Object.keys(row)) {
        if (ALLOWED_COLUMNS.has(k)) clean[k] = row[k];
      }
      return clean;
    });

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allBills.length / BATCH_SIZE);

    process.stdout.write(`   Batch ${batchNum}/${totalBatches}: uploading ${batch.length} bills...`);

    const { error } = await supabase
      .from('bills')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`\n   ⚠️  Batch ${batchNum} error: ${error.message}`);
      errors++;
    } else {
      imported += batch.length;
      console.log(` ✅ (${imported}/${allBills.length})`);
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n✅ Import complete!`);
  console.log(`   Imported: ${imported} bills`);
  if (errors > 0) console.log(`   ⚠️  Batches with errors: ${errors} (those rows may need re-import)`);
  console.log('\n🎉 All done! Hard refresh your app to see the bills in Bill History.');
}

importBills().catch(console.error);
