const fs = require('fs');
const path = '/Users/rico/Downloads/WOOF/WOOF_V1/backend/src/analytics/analytics.service.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  "console.log('MLRESULT IS:', mlResult);",
  "require('fs').writeFileSync('/tmp/mlresult.log', JSON.stringify(mlResult || {}));"
);
fs.writeFileSync(path, content);
