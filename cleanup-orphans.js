const { MongoClient } = require('mongodb');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });

async function cleanup() {
  const mongoUri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'woof_staging';
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!mongoUri || !supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: uploads, error } = await supabase.from('csv_uploads').select('id');
  if (error) {
    console.error('Supabase error:', error);
    return;
  }

  const validIds = uploads.map(u => u.id);
  console.log(`Found ${validIds.length} valid uploads in Supabase.`);

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db(dbName);
  const collection = db.collection('transactions');

  const result = await collection.deleteMany({
    csvUploadId: { $nin: validIds }
  });

  console.log(`Deleted ${result.deletedCount} orphaned transactions from MongoDB (${dbName}).`);
  await client.close();
}

cleanup().catch(console.error);
