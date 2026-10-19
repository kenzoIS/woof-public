const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found");
    process.exit(1);
  }

  try {
    const connTest = await mongoose.createConnection(uri, { dbName: 'test' }).asPromise();
    await connTest.dropDatabase();
    console.log("Successfully dropped the entire 'test' database and freed up space!");
    await connTest.close();
  } catch (err) {
    console.error("Error dropping database:", err);
  }
  process.exit(0);
}
run();
