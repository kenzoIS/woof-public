const { execSync } = require('child_process');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });

async function run() {
  const result = execSync('curl -s http://localhost:3001/api/analytics/promos/quiet-periods');
  console.log(result.toString());
  
  // also check python call
  // wait we don't have direct access to the backend logs easily unless we grep them
}
run();
