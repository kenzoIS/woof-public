require('dotenv').config({ path: './.env' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const connectionString = process.env.DATABASE_URL;
  const migrationPath = process.argv[2];

  if (!connectionString) {
    throw new Error('DATABASE_URL must be set; never place database credentials in source code.');
  }
  if (!migrationPath) {
    throw new Error('Usage: node run_migration.js <migration.sql>');
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query(fs.readFileSync(path.resolve(migrationPath), 'utf8'));
    console.log('Migration executed');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
