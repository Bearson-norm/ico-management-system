/**
 * Impor master sparepart dari CSV (format web: id,nama,kategori,uom,lokasi,harga,minQty).
 *
 * Usage:
 *   npx ts-node --project tsconfig.scripts.json scripts/import-sparepart-csv.ts "C:\path\to\file.csv"
 *   npx ts-node --project tsconfig.scripts.json scripts/import-sparepart-csv.ts --flush "C:\path\to\file.csv"
 *
 * Environment:
 *   SPAREPART_CSV — path ke CSV jika tanpa argumen path
 *   SPAREPART_FLUSH=true — hapus semua stock_movement + sparepart sebelum impor (ganti data dummy)
 *
 * Memuat `.env` / `.env.local` di root jika `DATABASE_URL_MTC` belum ada di environment.
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '../lib/generated/mtc';
import { importSparepartCsvContent } from '../lib/sparepart/importSpareparts';

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
  let flush =
    process.env.SPAREPART_FLUSH === '1' ||
    process.env.SPAREPART_FLUSH === 'true' ||
    process.env.SPAREPART_FLUSH === 'yes';
  const paths: string[] = [];
  for (const a of argv) {
    if (a === '--flush' || a === '-f') {
      flush = true;
      continue;
    }
    if (a.startsWith('-')) continue;
    paths.push(a);
  }
  return { flush, filePath: paths[0] };
}

async function main() {
  tryLoadRootEnv();

  const { flush, filePath: fromArgs } = parseArgs(process.argv.slice(2));
  const fromEnv = process.env.SPAREPART_CSV;
  const filePath = fromArgs || fromEnv;
  if (!filePath) {
    console.error('Usage: ts-node scripts/import-sparepart-csv.ts [--flush] <path-to.csv>');
    console.error('   or: SPAREPART_CSV=<path> [SPAREPART_FLUSH=true] ts-node scripts/import-sparepart-csv.ts');
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

  if (flush) {
    console.warn(
      '⚠️  Mode --flush: semua baris stock_movement dan sparepart akan dihapus sebelum impor.',
    );
  }

  const prisma = new PrismaClient();
  const csvText = fs.readFileSync(filePath, 'utf-8');

  try {
    const res = await importSparepartCsvContent(prisma, csvText, { flush });
    if (res.format === 'unknown') {
      console.error(
        'Format CSV tidak dikenali. Header yang diharapkan untuk master web: id,nama,kategori,uom,lokasi,harga,minQty',
      );
      process.exit(1);
    }
    if (res.flushed) console.log('Data sparepart & riwayat stok lama telah dikosongkan.');
    console.log(`Selesai: ${res.upserted} baris di-upsert, ${res.skipped} dilewati (tanpa id).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
