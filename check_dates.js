const fs = require('fs');
const df = fs.readFileSync('/Users/rico/Downloads/WOOF/WOOF_V1/HappyTailsPC_Fixed.csv', 'utf8').split('\n');
let invalid = 0;
for (let i = 1; i < df.length; i++) {
  if (!df[i]) continue;
  const parts = df[i].split(',');
  const dateStr = parts[0];
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    invalid++;
    console.log('Invalid date:', dateStr, 'at line', i);
    if (invalid > 5) break;
  }
}
console.log('Total invalid:', invalid);
