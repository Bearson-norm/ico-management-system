import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '../generated/mtc';
import { flushSparepartMasterData, importSparepartCsvContent } from '../sparepart/importSpareparts';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Memulai Migrasi Data dari CSV...');

  const exportsDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportsDir)) {
    console.error('❌ Folder "exports" tidak ditemukan. Buat folder exports/ di root dan taruh CSV hasil download dari Google Sheets ke dalamnya.');
    process.exit(1);
  }

  // Helper read CSV
  const readCSV = (filename: string) => {
    const p = path.join(exportsDir, filename);
    if (!fs.existsSync(p)) {
      console.warn(`⚠️ File ${filename} tidak ditemukan, skip migrasi tabel ini.`);
      return null;
    }
    const content = fs.readFileSync(p, 'utf-8');
    return parse(content, { columns: true, skip_empty_lines: true });
  };

  // 1. MASTER OTHERS
  const others = readCSV('Master - Others.csv');
  if (others) {
    console.log('🔄 Migrate Teknisi & Mesin...');
    for (const row of others) {
      if (row.Teknisi) {
        await prisma.teknisi.upsert({
          where: { nama: row.Teknisi.trim() },
          update: {}, create: { nama: row.Teknisi.trim() }
        });
      }
      if (row.Mesin) {
        // Ekstrak area (kata terakhir) seperti di logic lama
        const parts = row.Mesin.trim().split(/\s+/);
        const area = parts.length > 1 ? parts[parts.length - 1] : null;
        await prisma.mesin.upsert({
          where: { nama: row.Mesin.trim() },
          update: {}, create: { nama: row.Mesin.trim(), area }
        });
      }
      if (row.Kategori) {
        await prisma.kategori.upsert({
          where: { nama: row.Kategori.trim() },
          update: {}, create: { nama: row.Kategori.trim(), tipe: 'umum' }
        });
      }
    }
  }

  const sparepartFlush =
    process.env.SPAREPART_FLUSH === '1' ||
    process.env.SPAREPART_FLUSH === 'true' ||
    process.env.SPAREPART_FLUSH === 'yes';
  if (sparepartFlush) {
    console.warn('⚠️ SPAREPART_FLUSH aktif: menghapus semua stock_movement + sparepart sebelum impor master.');
  }

  // 2. MASTER SPAREPART (legacy Google Sheets ATAU export web: id,nama,kategori,uom,lokasi,harga,minQty)
  const spareparts = readCSV('Master_Sparepart.csv');
  if (spareparts) {
    console.log(`🔄 Migrate ${spareparts.length} Sparepart...`);
    const spareCsvPath = path.join(exportsDir, 'Master_Sparepart.csv');
    const rawCsv = fs.readFileSync(spareCsvPath, 'utf-8');
    const webImport = await importSparepartCsvContent(prisma, rawCsv, { flush: sparepartFlush });

    if (webImport.format === 'web') {
      if (webImport.flushed) console.log('🗑️ Data sparepart & stok lama sudah dikosongkan.');
      console.log(`✅ ${webImport.upserted} Sparepart (format web MTC) di-upsert.`);
      if (webImport.skipped) console.log(`   (${webImport.skipped} baris tanpa id dilewati)`);
    } else {
      if (sparepartFlush) {
        await flushSparepartMasterData(prisma);
        console.log('🗑️ Data sparepart & stok lama sudah dikosongkan (format legacy).');
      }
      const kats = await prisma.kategori.findMany();
      const katMap = new Map(kats.map((k: { nama: string; id: number }) => [k.nama, k.id]));

      let created = 0;
      for (const row of spareparts) {
        if (!row['Item ID']) continue;

        const katName = row['Item Category']?.trim() || row.Kategori?.trim();
        let kId = katName ? katMap.get(katName) : undefined;
        if (katName && !kId) {
          const newK = await prisma.kategori.create({ data: { nama: katName, tipe: 'sparepart' } });
          kId = newK.id;
          katMap.set(newK.nama, newK.id);
        }

        await prisma.sparepart.upsert({
          where: { id: row['Item ID'].trim() },
          update: {
            nama: row['Name Item']?.trim() || row.Nama?.trim() || 'Tanpa Nama',
            kategoriId: kId || null,
            uom: row.UoM?.trim() || 'Pcs',
            lokasi: row.SLOC?.trim() || row.Lokasi?.trim() || null,
            harga: parseFloat(row.Harga || '0'),
            minQty: parseInt(row['Min Qty'] || '0', 10),
          },
          create: {
            id: row['Item ID'].trim(),
            nama: row['Name Item']?.trim() || row.Nama?.trim() || 'Tanpa Nama',
            kategoriId: kId || null,
            uom: row.UoM?.trim() || 'Pcs',
            lokasi: row.SLOC?.trim() || row.Lokasi?.trim() || null,
            harga: parseFloat(row.Harga || '0'),
            minQty: parseInt(row['Min Qty'] || '0', 10),
          },
        });
        created++;
      }
      console.log(`✅ ${created} Sparepart sukses di-migrate (format legacy).`);
    }
  }

  console.log('✅ Migrasi Selesai! (Stock INOUT dan LOG MTC belum diimplementasi di script ini untuk menghindari duplicate massal, cukup master data dulu)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
