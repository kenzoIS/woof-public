const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found");
    process.exit(1);
  }

  try {
    // Clear woof_staging
    const connStaging = await mongoose.createConnection(uri, { dbName: process.env.MONGODB_DB || 'woof_staging' }).asPromise();
    await connStaging.collection('transactions').deleteMany({});
    await connStaging.collection('csvuploads').deleteMany({});
    console.log("Cleared transactions and csvuploads from woof_staging!");
    await connStaging.close();

    // Clear test (default)
    const connTest = await mongoose.createConnection(uri, { dbName: 'test' }).asPromise();
    await connTest.collection('transactions').deleteMany({});
    await connTest.collection('csvuploads').deleteMany({});
    console.log("Cleared transactions and csvuploads from test!");
    await connTest.close();
    
    console.log("MongoDB cleanup complete.");
  } catch (err) {
    console.error("Error during cleanup:", err);
  }
  process.exit(0);
}
run();
