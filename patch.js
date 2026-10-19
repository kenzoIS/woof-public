const fs = require('fs');
const path = '/Users/rico/Downloads/WOOF/WOOF_V1/backend/src/analytics/analytics.service.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(
  "if (mlResult.probabilityScore <= 0.70) {",
  "console.log('MLRESULT IS:', mlResult);\n    if (mlResult.probabilityScore <= 0.70) {"
);
fs.writeFileSync(path, content);
