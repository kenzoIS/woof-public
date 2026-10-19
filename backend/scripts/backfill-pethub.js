require('dotenv').config();
const { MongoClient } = require('mongodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

async function runBackfill() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found in .env');
    return;
  }
  
  console.log('Connecting to MongoDB...');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'woof_staging');
  const collection = db.collection('transactions');

  console.log('Fetching PetHub transactions...');
  const transactions = await collection.find({ channel: 'PetHub' }).toArray();
  console.log(`Found ${transactions.length} PetHub transactions.`);

  if (transactions.length === 0) {
    console.log('No PetHub transactions to backfill.');
    await client.close();
    return;
  }

  // Group by csvUploadId (or transactionId if csvUploadId is empty/missing)
  const grouped = {};
  for (const t of transactions) {
    const groupId = t.csvUploadId || t.transactionId || 'unknown_upload';
    if (!grouped[groupId]) {
      grouped[groupId] = [];
    }
    grouped[groupId].push(t);
  }

  const s3 = new S3Client({
    region: 'ap-southeast-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  });

  console.log(`Grouped into ${Object.keys(grouped).length} unique uploads to archive.`);

  for (const [uploadId, txs] of Object.entries(grouped)) {
    // Get the date from the first transaction
    const date = new Date(txs[0].date);
    
    // Format YYYY/MM/DD
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const datePrefix = `${yyyy}/${mm}/${dd}`;

    const key = `raw/${datePrefix}/PetHub/backfill_${uploadId}.json`;
    const body = Buffer.from(JSON.stringify(txs, null, 2), 'utf-8');

    console.log(`Uploading ${key}...`);
    try {
      await s3.send(new PutObjectCommand({
        Bucket: 'woof-data-lake-lucena-prod-1786959360',
        Key: key,
        Body: body,
        ContentType: 'application/json',
      }));
      console.log(`  -> Success!`);
    } catch (e) {
      console.error(`  -> Failed: ${e.message}`);
    }
  }

  console.log('Backfill complete!');
  await client.close();
}

runBackfill().catch(console.error);
