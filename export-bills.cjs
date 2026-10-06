/**
 * Export ALL bills from old Supabase project via DIRECT PostgreSQL connection
 * Bypasses the REST API quota restriction completely
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const OLD_PG_URL = 'postgresql://postgres:RailwayKitchen@23$@db.dhsafujrmxsqrsxgoifi.supabase.co:5432/postgres';

const BATCH_SIZE = 5000;

async function exportAllBills() {
  console.log('🔄 Connecting directly to old PostgreSQL database...');
  
  const client = new Client({
    connectionString: OLD_PG_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('✅ Connected!\n');

  // Get total count first
  const countRes = await client.query('SELECT COUNT(*) FROM public.bills');
  const total = parseInt(countRes.rows[0].count);
  console.log(`📊 Total bills to export: ${total}`);

  let allBills = [];
  let offset = 0;
  let batchNum = 1;

  while (offset < total) {
    process.stdout.write(`   Batch ${batchNum}: fetching rows ${offset}–${Math.min(offset + BATCH_SIZE - 1, total - 1)}...`);
    
    const res = await client.query(
      'SELECT * FROM public.bills ORDER BY created_at ASC LIMIT $1 OFFSET $2',
      [BATCH_SIZE, offset]
    );

    allBills = allBills.concat(res.rows);
    console.log(` ✅ ${res.rows.length} rows (total: ${allBills.length}/${total})`);

    offset += BATCH_SIZE;
    batchNum++;
  }

  await client.end();
  console.log('\n✅ Export complete!');

  // Save JSON
  const jsonFile = path.join(__dirname, 'bills_export.json');
  fs.writeFileSync(jsonFile, JSON.stringify(allBills, null, 2));
  const sizeMB = (fs.statSync(jsonFile).size / 1024 / 1024).toFixed(2);
  console.log(`📄 JSON saved: ${jsonFile} (${sizeMB} MB)`);

  console.log('\n🚀 Now run: node import-bills.cjs');
}

exportAllBills().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
