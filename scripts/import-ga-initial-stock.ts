/**
 * Impor saldo awal stok GA dari TSV/CSV (paste Excel).
 *
 * Format kolom: NAMA BARANG, KODE BARANG, Qty
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/import-ga-initial-stock.ts "C:\path\to\saldo-awal.tsv"
 *   npx ts-node --project tsconfig.scripts.json scripts/import-ga-initial-stock.ts --pic "Admin GA" --date 2026-05-20 "file.tsv"
 *
 * Environment:
 *   GA_STOCK_INITIAL_CSV — path ke file jika tanpa argumen path
 *   DATABASE_URL_GA — koneksi database GA
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../lib/generated/ga';
import { parseGaStockInitialPaste } from '../lib/import/parseGaStockInitialPaste';
import { importGaStockInitialBatch } from '../lib/ga/gaStockInitialImport';

const root = path.resolve(__dirname, '..');

function tryLoadRootEnv() {
  if (process.env.DATABASE_URL_GA) return;
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
  let picNama = process.env.GA_STOCK_PIC || 'Import Script';
  let tanggal = process.env.GA_STOCK_DATE || new Date().toISOString().split('T')[0];
  let keterangan = 'Saldo awal';
  let skipIfHasStock = true;
  const paths: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pic' && argv[i + 1]) {
      picNama = argv[++i];
      continue;
    }
    if (a === '--date' && argv[i + 1]) {
      tanggal = argv[++i];
      continue;
    }
    if (a === '--keterangan' && argv[i + 1]) {
      keterangan = argv[++i];
      continue;
    }
    if (a === '--force') {
      skipIfHasStock = false;
      continue;
    }
    if (a.startsWith('-')) continue;
    paths.push(a);
  }

  return { picNama, tanggal, keterangan, skipIfHasStock, filePath: paths[0] };
}

async function main() {
  tryLoadRootEnv();

  const { picNama, tanggal, keterangan, skipIfHasStock, filePath: fromArgs } = parseArgs(process.argv.slice(2));
  const filePath = fromArgs || process.env.GA_STOCK_INITIAL_CSV;
  if (!filePath) {
    console.error('Usage: ts-node scripts/import-ga-initial-stock.ts [--pic "Nama"] [--date YYYY-MM-DD] [--force] <path-to.tsv>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File tidak ditemukan: ${filePath}`);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL_GA) {
    console.error('DATABASE_URL_GA belum di-set (.env atau environment).');
    process.exit(1);
  }

  const rawText = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseGaStockInitialPaste(rawText);
  if (parsed.records.length === 0) {
    console.error('Format tidak dikenali. Header wajib: NAMA BARANG, KODE BARANG, Qty');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const report = await importGaStockInitialBatch(
      prisma,
      parsed.records,
      {
        tanggal: new Date(tanggal + 'T12:00:00'),
        picNama,
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
