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

const args = process.argv.slice(2);

if (args.length < 1) {
  console.log(`
WOOF DB Inspector Tool
----------------------
Usage: 
  node inspect-db.js mongo <collection> [query_json]
  node inspect-db.js supabase <table> [query_json]

Examples:
  node inspect-db.js mongo transactions
  node inspect-db.js mongo transactions '{"channel": "POS"}'
  node inspect-db.js supabase fact_cross_channel_transactions
  node inspect-db.js supabase service_dim '{"limit": 5}'
  `);
  process.exit(1);
}

const [dbType, table, queryStr] = args;

async function run() {
  try {
    const query = queryStr ? JSON.parse(queryStr) : {};

    if (dbType === 'mongo') {
      console.log(`Connecting to MongoDB...`);
      await mongoose.connect(process.env.MONGODB_URI);
      console.log(`Connected to MongoDB database: ${mongoose.connection.name}`);
      
      const db = mongoose.connection.db;
      const collection = db.collection(table);
      
      const count = await collection.countDocuments(query);
      console.log(`\nTotal Documents in '${table}' matching query: ${count}`);
      
      const docs = await collection.find(query).limit(5).toArray();
      console.log(`\nSample Data (up to 5 records):`);
      console.log(JSON.stringify(docs, null, 2));
      
      await mongoose.disconnect();
      console.log(`\nDisconnected.`);

    } else if (dbType === 'supabase') {
      console.log(`Connecting to Supabase...`);
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      
      let q = supabase.from(table).select('*', { count: 'exact' });
      
      if (query.limit) {
          q = q.limit(query.limit);
      } else {
          q = q.limit(5); // default limit to avoid huge logs
      }

      const { data, error, count } = await q;
      
      if (error) {
        console.error(`Supabase Error:`, error);
        return;
      }
      
      console.log(`\nTotal Documents in '${table}': ${count} (ignoring query filters for total)`);
      console.log(`\nSample Data (up to ${query.limit || 5} records):`);
      console.log(JSON.stringify(data, null, 2));

    } else {
      console.log(`Unknown DB type: ${dbType}. Use 'mongo' or 'supabase'.`);
    }

  } catch (error) {
    console.error(`Error executing inspector:`, error);
  }
}

run();
