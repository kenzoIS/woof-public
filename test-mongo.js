const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('woof_analytics');
  const count = await db.collection('transactions').countDocuments();
  console.log('Total transactions:', count);
  const sample = await db.collection('transactions').findOne();
  console.log('Sample transaction:', sample);
  await client.close();
}
run().catch(console.error);
