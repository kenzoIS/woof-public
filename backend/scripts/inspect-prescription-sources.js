const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const mongoose = require('mongoose');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equals = trimmed.indexOf('=');
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function summarize(rows) {
  const statuses = {};
  for (const row of rows || []) {
    const status = row.status || '(none)';
    statuses[status] = (statuses[status] || 0) + 1;
  }
  return { rows: rows?.length || 0, statuses };
}

async function readSupabaseTable(supabase, table) {
  const { data, error } = await supabase.from(table).select('*').limit(1000);
  if (error) return { error: error.message, code: error.code };
  return summarize(data || []);
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  loadEnv(path.resolve(backendDir, '.env'));
  loadEnv(path.resolve(backendDir, '..', '.env'));

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const result = {
    supabase: {},
    mongo: {},
  };

  for (const table of [
    'campaign_drafts',
    'bundle_archives',
    'dynamic_promos',
    'prescription_drafts',
    'active_prescriptions',
    'recommendation_feedback',
  ]) {
    result.supabase[table] = await readSupabaseTable(supabase, table);
  }

  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || 'woof_staging',
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    const db = mongoose.connection.db;
    const collectionNames = (await db.listCollections().toArray()).map(
      (item) => item.name,
    );
    const collection =
      collectionNames.find((name) => name === 'campaignactivations') ||
      collectionNames.find((name) => /campaign.*activation/i.test(name));
    if (collection) {
      const rows = await db.collection(collection).find({}).limit(1000).toArray();
      result.mongo[collection] = summarize(rows);
    }
    await mongoose.disconnect();
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
