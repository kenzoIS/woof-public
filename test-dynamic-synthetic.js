const { execSync } = require('child_process');
const dotenv = require('dotenv');
dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });

async function run() {
  const payload = {
    hour: 15,
    is_weekend: 0,
    temp: 30.0,
    traffic_drop: 45.0,
    discount_depth: 0.15,
    trainingSignature: "test-synth:1",
    trainingRows: []
  };

  const result = execSync('python3 backend/src/analytics/python/dynamic_promo.py', {
    input: JSON.stringify(payload),
    env: process.env,
    maxBuffer: 1024 * 1024 * 50
  });
  console.log(result.toString());
}
run();
