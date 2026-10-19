const { execSync } = require('child_process');
const dotenv = require('dotenv');
dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });

async function run() {
  const result = execSync('sed -i "" "s/random_state=42)/random_state=42, class_weight=\'balanced\')/g" backend/src/analytics/python/dynamic_promo.py');
  const out = execSync('node test-dynamic-stratified.js', { env: process.env, maxBuffer: 1024 * 1024 * 50 });
  console.log(out.toString());
  execSync('git checkout backend/src/analytics/python/dynamic_promo.py');
}
run();
