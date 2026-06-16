import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const EXCEL_PATH = process.env.EXCEL_PATH ||
  'C:\\Users\\Fooml\\Downloads\\FormulatiInputDBInitGA (1).xlsx';

const wb = XLSX.readFile(EXCEL_PATH, { raw: true });

console.log('═══════════════════════════════════════════');
console.log('  PREVIEW FILE EXCEL GA');
console.log('═══════════════════════════════════════════');
console.log(`File: ${EXCEL_PATH}`);
console.log(`Sheet: ${wb.SheetNames.join(' | ')}`);
console.log('');

for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  const validRows = rows.filter(r => Object.values(r).some(v => String(v).trim() !== ''));

  console.log(`─── Sheet: "${sheetName}" (${validRows.length} baris valid) ───`);

  if (validRows.length === 0) {
    console.log('  (kosong)');
    continue;
  }

  // Tampilkan header (nama kolom)
  console.log('  Kolom:', Object.keys(validRows[0]).join(' | '));

  // Tampilkan 3 baris pertama sebagai sample
  console.log('  Sample data (3 baris pertama):');
  for (const row of validRows.slice(0, 3)) {
    console.log('   ', JSON.stringify(row));
  }
  console.log('');
}
