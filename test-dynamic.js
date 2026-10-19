const { execSync } = require('child_process');

const payload = {
  hour: 15,
  is_weekend: 0,
  temp: 30.0,
  traffic_drop: 45.0,
  discount_depth: 0.15,
  trainingSignature: "test",
  trainingRows: []
};

const result = execSync('python3 backend/src/analytics/python/dynamic_promo.py', {
  input: JSON.stringify(payload),
  env: process.env
});
console.log(result.toString());
