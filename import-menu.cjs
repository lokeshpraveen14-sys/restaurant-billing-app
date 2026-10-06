/**
 * Import menu items, tables, and staff to new Supabase project
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const NEW_URL = 'https://nencdjwiglqhgvglfmtv.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbmNkandpZ2xxaGd2Z2xmbXR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4MDU3OTUsImV4cCI6MjEwNjM4MTc5NX0.kq6gfZuYVUskXtWinXvtmOtKu48ZGStI2eyNN4erGZk';

const supabase = createClient(NEW_URL, NEW_KEY);

async function importData() {
  const jsonFile = path.join(__dirname, 'menu_export.json');
  if (!fs.existsSync(jsonFile)) {
    console.error('❌ menu_export.json not found!');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  
  console.log(`🔄 Importing ${data.items.length} menu items...`);
  if (data.items.length > 0) {
    const { error } = await supabase.from('menu_items').upsert(data.items, { onConflict: 'id' });
    if (error) console.error('Error importing menu_items:', error.message);
    else console.log('✅ Menu items imported');
  }

  console.log(`🔄 Importing ${data.tables.length} tables...`);
  if (data.tables.length > 0) {
    const { error } = await supabase.from('restaurant_tables').upsert(data.tables, { onConflict: 'id' });
    if (error) console.error('Error importing restaurant_tables:', error.message);
    else console.log('✅ Tables imported');
  }

  console.log(`🔄 Importing ${data.staff.length} staff users...`);
  if (data.staff.length > 0) {
    const { error } = await supabase.from('staff_users').upsert(data.staff, { onConflict: 'id' });
    if (error) console.error('Error importing staff_users:', error.message);
    else console.log('✅ Staff imported');
  }

  console.log('🎉 Done!');
}

importData().catch(console.error);
