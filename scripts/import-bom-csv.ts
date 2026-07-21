/**
 * Impor pemetaan BOM (Sparepart per Mesin) dari CSV.
 * Format CSV yang diharapkan: Nama Mesin,Item ID
 *
 * Contoh penggunaan:
 *   npx ts-node --project tsconfig.scripts.json scripts/import-bom-csv.ts "DB WEB MTC - DB Sparepart-Mesin.csv"
 *
 * Memuat `.env` / `.env.local` di root jika `DATABASE_URL_MTC` belum ada di environment.
 */
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '../lib/generated/mtc';

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

async function main() {
  tryLoadRootEnv();

  const args = process.argv.slice(2);
  const filePath = args[0] || 'DB WEB MTC - DB Sparepart-Mesin.csv';

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File tidak ditemukan: ${filePath}`);
    console.error('Silakan tentukan path file CSV Anda.');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL_MTC) {
    console.error('❌ DATABASE_URL_MTC belum di-set (.env atau environment).');
    process.exit(1);
  }

  console.log(`📖 Membaca file CSV: ${filePath}...`);
  const csvText = fs.readFileSync(filePath, 'utf-8');

  // Parse CSV
  let rows: any[] = [];
  try {
    rows = parse(csvText.trim(), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    });
  } catch (err: any) {
    console.error('❌ Gagal mem-parse file CSV:', err.message);
    process.exit(1);
  }

  console.log(`📦 Memproses ${rows.length} baris data pemetaan BOM...`);
  const prisma = new PrismaClient();

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2; // Baris data mulai dari 2 (baris 1 adalah header)

      // Ambil kolom dari CSV (bisa Nama Mesin / Nama / Mesin, dan Item ID / sparepartId / id)
      const mesinNama = row['Nama Mesin'] || row['nama mesin'] || row['Mesin'] || row['nama'] || row['mesin'];
      const sparepartId = row['Item ID'] || row['item id'] || row['id'] || row['sparepartId'] || row['sparepart_id'];

      // Jika mesinNama kosong atau sparepartId kosong, lewati
      if (!mesinNama || !mesinNama.trim() || !sparepartId || !sparepartId.trim()) {
        skippedCount++;
        continue;
      }

      const cleanMesinNama = mesinNama.trim();
      const cleanSparepartId = sparepartId.trim();

      try {
        // 1. Dapatkan atau buat mesin secara otomatis (upsert)
        const mesin = await prisma.mesin.upsert({
          where: { nama_tipe: { nama: cleanMesinNama, tipe: 'sparepart' } },
          update: {},
          create: {
            nama: cleanMesinNama,
            tipe: 'sparepart',
            aktif: true,
          },
        });

        // 2. Cek apakah sparepart ada
        const sparepart = await prisma.sparepart.findUnique({
          where: { id: cleanSparepartId },
        });

        if (!sparepart) {
          failedCount++;
          console.warn(`⚠️  Baris ${lineNum}: Sparepart "${cleanSparepartId}" tidak terdaftar di database.`);
          continue;
        }

        // 3. Hubungkan mesin dengan sparepart
        await prisma.sparepart.update({
          where: { id: cleanSparepartId },
          data: {
            mesins: {
              connect: { id: mesin.id },
            },
          },
        });

        successCount++;
      } catch (err: any) {
        failedCount++;
        console.error(`❌ Baris ${lineNum} Gagal:`, err.message);
      }
    }

    console.log('\n🎉 Selesai memproses pemetaan BOM!');
    console.log(`✅ Berhasil dipetakan: ${successCount}`);
    console.log(`⏭️  Dilewati (baris kosong/tidak lengkap): ${skippedCount}`);
    console.log(`❌ Gagal dipetakan (Sparepart tidak ada/error): ${failedCount}`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Terjadi kesalahan fatal:', e);
  process.exit(1);
});
