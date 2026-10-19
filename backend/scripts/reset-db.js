const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Basic env parser
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8').split('\n');
  envConfig.forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
      process.env[key.trim()] = values.join('=').trim().replace(/['"]/g, '');
    }
  });
}

async function run() {
  try {
    console.log(`Starting Full Database Wipe...`);

    // --- MONGODB WIPE ---
    console.log(`\nConnecting to MongoDB...`);
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    console.log(`Clearing MongoDB collections...`);
    await db.collection('transactions').deleteMany({});
    console.log(`- Cleared 'transactions' collection.`);
    await db.collection('csvuploads').deleteMany({});
    console.log(`- Cleared 'csvuploads' collection.`);
    
    await mongoose.disconnect();
    
    // --- SUPABASE WIPE ---
    console.log(`\nConnecting to Supabase...`);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    console.log(`Clearing Supabase tables (deleting facts first to avoid foreign key errors)...`);
    
    // Delete fact table
    let { error: factErr } = await supabase.from('fact_cross_channel_transactions').delete().neq('transaction_line_id', 'dummy');
    if (factErr) console.error(`Error clearing facts:`, factErr.message);
    else console.log(`- Cleared 'fact_cross_channel_transactions'`);

    // Delete dimensions
    const dims = [
      { table: 'date_dim', pk: 'date_id' },
      { table: 'channel_dim', pk: 'channel_id' },
      { table: 'business_segment_dim', pk: 'segment_id' },
      { table: 'product_dim', pk: 'product_id' },
      { table: 'service_dim', pk: 'service_id' }
    ];

    for (const dim of dims) {
      let { error } = await supabase.from(dim.table).delete().neq(dim.pk, 'dummy');
      if (error) console.error(`Error clearing ${dim.table}:`, error.message);
      else console.log(`- Cleared '${dim.table}'`);
    }

    console.log(`\nDatabase Wipe Complete! Ready for fresh upload.`);
  } catch (error) {
    console.error(`Wipe Failed:`, error);
  }
}

run();
