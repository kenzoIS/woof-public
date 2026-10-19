const mongoose = require('mongoose');

async function run() {
  require('dotenv').config();
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not found in .env");

  await mongoose.connect(uri);
  console.log("Connected to MongoDB.");

  const db = mongoose.connection.db;
  
  const trRes = await db.collection('transactions').deleteMany({});
  const csvRes = await db.collection('csvuploads').deleteMany({});
  const roRes = await db.collection('raw_orders').deleteMany({});
  
  console.log(`Deleted ${trRes.deletedCount} transactions.`);
  console.log(`Deleted ${csvRes.deletedCount} csvuploads.`);
  console.log(`Deleted ${roRes.deletedCount} raw_orders.`);
  console.log("Successfully wiped data from MongoDB!");

  await mongoose.disconnect();
}

run().catch(console.error);
