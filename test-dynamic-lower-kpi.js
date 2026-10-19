const { execSync } = require('child_process');
const dotenv = require('dotenv');
dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });

async function run() {
  const result = execSync('sed -i "" "s/sales_lift\\\"] >= 0.05/sales_lift\\\"] >= 0.0/g" backend/src/analytics/python/dynamic_promo.py');
  const result2 = execSync('sed -i "" "s/quantity_lift\\\"] >= 0.15/quantity_lift\\\"] >= 0.10/g" backend/src/analytics/python/dynamic_promo.py');
  const out = execSync('node test-dynamic-stratified.js', { env: process.env, maxBuffer: 1024 * 1024 * 50 });
  console.log(out.toString());
  execSync('git checkout backend/src/analytics/python/dynamic_promo.py');
}
run();
