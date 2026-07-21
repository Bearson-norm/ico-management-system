import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '../lib/generated/mtc';

const prisma = new PrismaClient();

function cleanPrice(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/Rp/gi, '').replace(/\./g, '').replace(/,/g, '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

async function main() {
  console.log('🔄 Import, Stock Sync, & Relink Spareparts to BOM Mesins...');

  const rootDownloads = 'C:\\Users\\Fooml\\Downloads';
  const spCsvPath = path.join(rootDownloads, 'DB WEB MTC - DB Sparepart.csv');
  const bomCsvPath = path.join(rootDownloads, 'DB WEB MTC - DB Sparepart-Mesin.csv');
  const stockCsvPath = path.join(rootDownloads, 'DB WEB MTC - Stock Sparepart.csv');

  // 1. Import Master Spareparts
  if (fs.existsSync(spCsvPath)) {
    console.log(`📖 Membaca file spareparts: ${spCsvPath}...`);
    const spText = fs.readFileSync(spCsvPath, 'utf-8');
    const spRows = parse(spText.trim(), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    });

    console.log(`📦 Memproses ${spRows.length} master spareparts...`);
    for (const row of spRows) {
      const id = row.id?.trim();
      const nama = row.nama?.trim();
      if (!id || !nama) continue;

      const kategoriNama = row.kategori?.trim();
      let kategoriId: number | null = null;
      if (kategoriNama) {
        const kat = await prisma.kategori.upsert({
          where: { nama: kategoriNama },
          update: {},
          create: { nama: kategoriNama, tipe: 'sparepart' },
        });
        kategoriId = kat.id;
      }

      await prisma.sparepart.upsert({
        where: { id },
        update: {
          nama,
          kategoriId,
          uom: row.uom?.trim() || 'Pcs',
          lokasi: row.lokasi?.trim() || null,
          harga: cleanPrice(row.harga || ''),
          minQty: parseInt(row.minQty || '0', 10) || 0,
          aktif: true,
        },
        create: {
          id,
          nama,
          kategoriId,
          uom: row.uom?.trim() || 'Pcs',
          lokasi: row.lokasi?.trim() || null,
          harga: cleanPrice(row.harga || ''),
          minQty: parseInt(row.minQty || '0', 10) || 0,
          aktif: true,
        },
      });
    }
  }

  // 2. Relink BOM (Sparepart-Mesin)
  if (fs.existsSync(bomCsvPath)) {
    console.log(`\n📖 Membaca file BOM (Sparepart-Mesin): ${bomCsvPath}...`);
    const bomText = fs.readFileSync(bomCsvPath, 'utf-8');
    const bomRows = parse(bomText.trim(), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    });

    console.log(`🔗 Memproses ${bomRows.length} baris pemetaan BOM...`);
    let successCount = 0;
    let skippedCount = 0;

    for (const row of bomRows) {
      const mesinNama = row['Nama Mesin'] || row['nama mesin'] || row['Mesin'] || row['nama'];
      const sparepartId = row['Item ID'] || row['item id'] || row['id'] || row['sparepartId'];

      if (!mesinNama || !mesinNama.trim() || !sparepartId || !sparepartId.trim()) {
        skippedCount++;
        continue;
      }

      const cleanMesinNama = mesinNama.trim();
      const cleanSparepartId = sparepartId.trim();

      // Find or create MESIN (tipe: sparepart / BOM)
      const mesin = await prisma.mesin.upsert({
        where: { nama_tipe: { nama: cleanMesinNama, tipe: 'sparepart' } },
        update: {},
        create: {
          nama: cleanMesinNama,
          tipe: 'sparepart',
          aktif: true,
        },
      });

      // Check if sparepart exists
      const sp = await prisma.sparepart.findUnique({ where: { id: cleanSparepartId } });
      if (!sp) {
        skippedCount++;
        continue;
      }

      // Connect sparepart to mesin
      await prisma.sparepart.update({
        where: { id: cleanSparepartId },
        data: {
          mesins: {
            connect: { id: mesin.id },
          },
        },
      });
      successCount++;
    }

    console.log(`✅ Berhasil menghubungkan ${successCount} relasi BOM (dilewati: ${skippedCount})`);
  }

  // 3. Stock Sync (Initial Stock IN)
  if (fs.existsSync(stockCsvPath)) {
    console.log(`\n📖 Membaca file Stok Sparepart: ${stockCsvPath}...`);
    const stockText = fs.readFileSync(stockCsvPath, 'utf-8');
    const stockRows = parse(stockText.trim(), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    });

    console.log(`📊 Memproses stok awal untuk ${stockRows.length} spareparts...`);
    let stockUpdatedCount = 0;

    for (const row of stockRows) {
      const id = row.id?.trim();
      const targetStock = parseInt(row['Current Stock'] || row['currentStock'] || '0', 10) || 0;
      if (!id || targetStock <= 0) continue;

      const sp = await prisma.sparepart.findUnique({ where: { id } });
      if (!sp) continue;

      // Calculate current stock in DB
      const movements = await prisma.stockMovement.findMany({
        where: { sparepartId: id, tipe: { in: ['IN', 'OUT'] } },
        select: { tipe: true, qty: true },
      });

      const totalIn = movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
      const totalOut = movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + m.qty, 0);
      const currentStock = totalIn - totalOut;

      const diff = targetStock - currentStock;
      if (diff > 0) {
        await prisma.stockMovement.create({
          data: {
            tipe: 'IN',
            sparepartId: id,
            namaItem: sp.nama,
            qty: diff,
            harga: sp.harga,
            lokasi: sp.lokasi || '',
            keterangan: 'Stok awal dari CSV Master',
          },
        });
        stockUpdatedCount++;
      }
    }
    console.log(`✅ Berhasil update/tambah stok awal untuk ${stockUpdatedCount} spareparts`);
  }

  // Summary
  const totalSp = await prisma.sparepart.count();
  const linkedSp = await prisma.sparepart.count({ where: { mesins: { some: {} } } });
  const totalMesin = await prisma.mesin.count();

  console.log('\n=== SUMMARY STATUS DATABASE AKHIR ===');
  console.log(`Total Sparepart: ${totalSp}`);
  console.log(`Sparepart Terhubung ke Mesin (BOM): ${linkedSp}`);
  console.log(`Total Mesin: ${totalMesin}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
