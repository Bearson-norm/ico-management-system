import { parse } from 'csv-parse/sync';
import * as fs from 'fs';

const csvPath = 'MTC PRO/FLG_FORM_PROC_003-00 Tracking Item SCM - Maintenance.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const records = parse(content, {
  skip_empty_lines: true,
  trim: true,
  relax_quotes: true,
}) as string[][];

const row = records.find(r => r[0] === '213');
if (row) {
  row.forEach((val, idx) => {
    console.log(`${idx}: ${val === '' ? 'EMPTY' : val}`);
  });
} else {
  console.log('Row 213 not found');
}
