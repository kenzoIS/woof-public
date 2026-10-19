const fs = require('fs');
const path = '/Users/rico/Downloads/WOOF/WOOF_V1/backend/src/analytics/analytics.service.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  "if (error || !Array.isArray(data)) {",
  "require('fs').writeFileSync('/tmp/supacount.log', 'Data length: ' + (data ? data.length : 0));\n    if (error || !Array.isArray(data)) {"
);
fs.writeFileSync(path, content);
