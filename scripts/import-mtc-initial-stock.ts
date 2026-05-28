/**
 * Impor saldo awal / stock report stok MTC dari TSV/CSV.
 *
 * Format kolom: id, Current Stock
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/import-mtc-initial-stock.ts "C:\path\to\stock.csv"
 *   npx ts-node --project tsconfig.scripts.json scripts/import-mtc-initial-stock.ts --sync "file.csv"
 *
 * Environment:
 *   MTC_STOCK_INITIAL_CSV — path ke file jika tanpa argumen path
 *   DATABASE_URL_MTC — koneksi database MTC
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../lib/generated/mtc';
import { parseMtcStockInitialPaste } from '../lib/import/parseMtcStockInitialPaste';
import { importMtcStockInitialBatch } from '../lib/mtc/mtcStockInitialImport';

const root = path.resolve(__dirname, '..');

function tryLoadRootEnv() {
  if (process.env.DATABASE_URL_MTC) return;
  for (const name of ['.env.local', '.env']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

function parseArgs(argv: string[]) {
  let tanggal = process.env.MTC_STOCK_DATE || new Date().toISOString().split('T')[0];
  let keterangan = 'Saldo awal / stock report';
  let skipIfHasStock = true;
  const paths: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--date' && argv[i + 1]) {
      tanggal = argv[++i];
      continue;
    }
    if (a === '--keterangan' && argv[i + 1]) {
      keterangan = argv[++i];
      continue;
    }
    if (a === '--sync' || a === '--force') {
      skipIfHasStock = false;
      continue;
    }
    if (a.startsWith('-')) continue;
    paths.push(a);
  }

  return { tanggal, keterangan, skipIfHasStock, filePath: paths[0] };
}

async function main() {
  tryLoadRootEnv();

  const { tanggal, keterangan, skipIfHasStock, filePath: fromArgs } = parseArgs(process.argv.slice(2));
  const filePath = fromArgs || process.env.MTC_STOCK_INITIAL_CSV;
  if (!filePath) {
    console.error('Usage: ts-node scripts/import-mtc-initial-stock.ts [--date YYYY-MM-DD] [--sync] <path-to.csv>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File tidak ditemukan: ${filePath}`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL_MTC) {
    console.error('DATABASE_URL_MTC belum di-set (.env atau environment).');
    process.exit(1);
  }

  const rawText = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseMtcStockInitialPaste(rawText);
  if (parsed.records.length === 0) {
    console.error('Format tidak dikenali. Header wajib: id, Current Stock');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const report = await importMtcStockInitialBatch(
      prisma,
      parsed.records,
      {
        tanggal: new Date(tanggal + 'T12:00:00'),
        keterangan,
        skipIfHasStock,
      },
      { physicalLines: parsed.physicalLines, mergedLines: parsed.mergedLines }
    );
    console.log(report.message);
    if (report.failed > 0) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
