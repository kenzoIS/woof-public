const fs = require('fs');
const file = 'backend/src/csv/etl.service.ts';
let code = fs.readFileSync(file, 'utf8');

// Insert helper method
const helper = `
  private getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return \`\${year}-\${month}-\${day}\`;
  }
`;
if (!code.includes('getLocalDateString')) {
    code = code.replace(/private getDateId\(date: Date\): number \{/, helper + '\n  private getDateId(date: Date): number {');
}

// Replace in uniqueDateStrings
code = code.replace(/orderDate\.toISOString\(\)\.slice\(0, 10\)/g, 'this.getLocalDateString(orderDate)');
code = code.replace(/dateBefore\.toISOString\(\)\.slice\(0, 10\)/g, 'this.getLocalDateString(dateBefore)');
code = code.replace(/dateAfter\.toISOString\(\)\.slice\(0, 10\)/g, 'this.getLocalDateString(dateAfter)');

// Replace in full_date
code = code.replace(/full_date: orderDate\.toISOString\(\),/, 'full_date: this.getLocalDateString(orderDate),');

fs.writeFileSync(file, code);
console.log('Fixed etl.service.ts');
