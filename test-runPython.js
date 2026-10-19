const { execSync } = require('child_process');

try {
  const result = execSync('curl -s http://localhost:3001/api/analytics/promos/quiet-periods');
  console.log('Result:', result.toString());
} catch (e) {
  console.log('Error:', e);
}
