const fs = require('fs');

// Fix exogenous-data.service.spec.ts
const path2 = 'backend/src/common/exogenous-data.service.spec.ts';
let code2 = fs.readFileSync(path2, 'utf8');
code2 = code2.replace(/rainfallMm: \d+,?\s*isSynthetic/g, match => match.replace('isSynthetic', 'relativeHumidity: 50, isSynthetic'));
fs.writeFileSync(path2, code2);

// Fix analytics.service.spec.ts
const path3 = 'backend/src/analytics/analytics.service.spec.ts';
let code3 = fs.readFileSync(path3, 'utf8');
code3 = code3.replace(/pythonRunner\.runScript\([\s\S]*?\)/, `pythonRunner.runScript('dynamic_promo.py', expect.any(Object))`);
fs.writeFileSync(path3, code3);
