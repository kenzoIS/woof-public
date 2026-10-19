const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found");
    process.exit(1);
  }

  try {
    const connStaging = await mongoose.createConnection(uri, { dbName: 'woof_staging' }).asPromise();
    const collections = await connStaging.db.listCollections().toArray();
    console.log("woof_staging collections:");
    for (const col of collections) {
      const count = await connStaging.collection(col.name).countDocuments();
      console.log(`- ${col.name}: ${count} documents`);
    }
    await connStaging.close();
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
