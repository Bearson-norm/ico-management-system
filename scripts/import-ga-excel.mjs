/**
 * scripts/import-ga-excel.mjs
 * ============================================================
 * Import data dari FormulatiInputDBInitGA (1).xlsx ke database GA.
 *
 * Sheet "DB Barang"  → GaItem (create) + stok awal ADJ
 * Sheet "LH Barang"  → GaItem (upsert LOKASI, Min Qty, Harga)
 * Sheet "Inbound"    → GaStockMovement tipe IN
 * Sheet "Outbound"   → GaStockMovement tipe OUT
 *
 * Idempoten: aman dijalankan berkali-kali.
 *
 * Jalankan:
 *   node scripts/import-ga-excel.mjs
 *   -- atau override path --
 *   EXCEL_PATH="C:\path\ke\file.xlsx" node scripts/import-ga-excel.mjs
 * ============================================================
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// Resolusi path absolut dari root project (satu level di atas folder scripts/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Load Prisma GA client dari generated path absolut
const { PrismaClient } = require(path.join(ROOT, 'lib', 'generated', 'ga', 'index.js'));
const prismaGa = new PrismaClient();

const EXCEL_PATH =
  process.env.EXCEL_PATH ||
  'C:\\Users\\Fooml\\Downloads\\FormulatiInputDBInitGA (1).xlsx';

// ── Helpers ────────────────────────────────────────────────────────────────────

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function num(v, fallback = 0) {
  const n = parseInt(String(v ?? fallback).replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? fallback : n;
}

function decimal(v) {
  const s = String(v ?? '0').replace(/[^0-9.,]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Konversi Excel serial date ke JS Date
function excelDate(v) {
  if (!v) return new Date();
  if (typeof v === 'number') {
    // Excel epoch: 1 Jan 1900 = 1, tapi ada bug "1900 leap year"
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms);
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? new Date() : d;
}

// ── LANGKAH 1: Import "DB Barang" → GaItem + stok awal ADJ ────────────────────
async function importDbBarang(rows) {
  console.log(`\n📦 Sheet "DB Barang" → Master Item + Stok Awal`);
  let created = 0, updated = 0, skipped = 0, adjCreated = 0;

  for (const row of rows) {
    const nama = str(row['NAMA BARANG']);
    const kode = str(row['KODE BARANG']);
    const qtyAwal = num(row['Qty'], 0);

    if (!nama || !kode) { skipped++; continue; }

    // ID = kode barang (A0001, A0002, dst)
    const itemId = kode.toUpperCase();

    const existing = await prismaGa.gaItem.findUnique({ where: { id: itemId } });

    if (!existing) {
      await prismaGa.gaItem.create({
        data: {
          id: itemId,
          nama: nama,
          kodeBarang: kode,
          uom: 'Pcs',    // default, akan diupdate jika ada info
          harga: 0,      // akan diisi dari sheet LH Barang
          minQty: 0,     // akan diisi dari sheet LH Barang
          aktif: true,
        },
      });
      created++;
    } else {
      updated++;
    }

    // Buat stok awal sebagai ADJ hanya jika qty != 0 dan belum pernah dibuat
    if (qtyAwal !== 0) {
      const existingAdj = await prismaGa.gaStockMovement.findFirst({
        where: {
          itemId,
          tipe: 'ADJ',
          keterangan: { contains: '[Stok Awal Import]' },
        },
      });
      if (!existingAdj) {
        await prismaGa.gaStockMovement.create({
          data: {
            tipe: 'ADJ',
            itemId,
            namaBarang: nama,
            qty: qtyAwal,
            tanggal: new Date('2025-01-01T00:00:00Z'),
            keterangan: '[Stok Awal Import] Migrasi data awal dari spreadsheet GA',
          },
        });
        adjCreated++;
      }
    }
  }

  console.log(`   ✅ Dibuat: ${created} | Sudah ada: ${updated} | Dilewati: ${skipped} | Stok awal ADJ: ${adjCreated}`);
}

// ── LANGKAH 2: Import "LH Barang" → Update LOKASI, Min Qty, Harga ─────────────
async function importLhBarang(rows) {
  console.log(`\n🏷  Sheet "LH Barang" → Update Lokasi, Min Qty, Harga`);
  let updated = 0, notFound = 0, skipped = 0;

  for (const row of rows) {
    const nama = str(row['NAMA BARANG']);
    const kode = str(row['KODE BARANG']);
    const lokasi = str(row['LOKASI']);
    const minQty = num(row['Min Qty'], 0);
    const harga = decimal(row['Harga']);

    if (!nama || !kode) { skipped++; continue; }

    const itemId = kode.toUpperCase();
    const existing = await prismaGa.gaItem.findUnique({ where: { id: itemId } });

    if (!existing) {
      // Barang tidak ada di DB Barang — buat baru dengan data lengkap
      await prismaGa.gaItem.create({
        data: {
          id: itemId,
          nama,
          kodeBarang: kode,
          uom: 'Pcs',
          lokasi: lokasi || null,
          harga,
          minQty,
          aktif: true,
        },
      });
      updated++;
    } else {
      // Update dengan data dari LH Barang (lebih lengkap)
      await prismaGa.gaItem.update({
        where: { id: itemId },
        data: {
          lokasi: lokasi || existing.lokasi,
          minQty: minQty > 0 ? minQty : existing.minQty,
          harga: harga > 0 ? harga : existing.harga,
        },
      });
      updated++;
    }
  }

  console.log(`   ✅ Diperbarui: ${updated} | Tidak ditemukan: ${notFound} | Dilewati: ${skipped}`);
}

// ── LANGKAH 3: Import "Inbound" → GaStockMovement IN ──────────────────────────
async function importInbound(rows) {
  console.log(`\n📥 Sheet "Inbound" → Stock IN`);
  let imported = 0, skipped = 0;

  for (const row of rows) {
    const nama = str(row['Nama Barang']);
    const qty = num(row['Quantity'], 0);
    const qtyDiterima = num(row['Sudah Diterima?'] ?? row['Quantity'], qty);
    const tanggal = excelDate(row['Tanggal terima']);
    const pic = str(row['Nama']);

    if (!nama || qty <= 0) { skipped++; continue; }

    // Cari item berdasarkan nama (case-insensitive)
    const item = await prismaGa.gaItem.findFirst({
      where: { nama: { equals: nama, mode: 'insensitive' } },
    });

    // Cek duplikat: nama + qty + tanggal + tipe IN
    const dupCheck = await prismaGa.gaStockMovement.findFirst({
      where: {
        tipe: 'IN',
        namaBarang: { equals: nama, mode: 'insensitive' },
        qty,
        tanggal: { gte: new Date(tanggal.getTime() - 86400000), lte: new Date(tanggal.getTime() + 86400000) },
        keterangan: { contains: '[Import Inbound]' },
      },
    });

    if (dupCheck) { skipped++; continue; }

    await prismaGa.gaStockMovement.create({
      data: {
        tipe: 'IN',
        itemId: item?.id ?? null,
        namaBarang: nama,
        qty,
        qtyDiterima,
        tanggalTerima: tanggal,
        tanggal,
        picNama: pic || null,
        harga: 0,
        keterangan: '[Import Inbound] Riwayat penerimaan dari spreadsheet GA',
      },
    });
    imported++;
  }

  console.log(`   ✅ Imported: ${imported} | Dilewati/Duplikat: ${skipped}`);
}

// ── LANGKAH 4: Import "Outbound" → GaStockMovement OUT ────────────────────────
async function importOutbound(rows) {
  console.log(`\n📤 Sheet "Outbound" → Stock OUT`);
  let imported = 0, skipped = 0;

  for (const row of rows) {
    const nama = str(row['Nama Barang']);
    const qty = num(row['Quantity'], 0);
    // Kolom tanggal ada spasi di depan: " Tanggal"
    const tanggalRaw = row[' Tanggal'] ?? row['Tanggal'] ?? row[' tanggal'];
    const tanggal = excelDate(tanggalRaw);
    const pic = str(row['NAMA'] ?? row['Nama'] ?? row['nama']);

    if (!nama || qty <= 0) { skipped++; continue; }

    // Cari item
    const item = await prismaGa.gaItem.findFirst({
      where: { nama: { equals: nama, mode: 'insensitive' } },
    });

    // Cek duplikat
    const dupCheck = await prismaGa.gaStockMovement.findFirst({
      where: {
        tipe: 'OUT',
        namaBarang: { equals: nama, mode: 'insensitive' },
        qty,
        tanggal: { gte: new Date(tanggal.getTime() - 86400000), lte: new Date(tanggal.getTime() + 86400000) },
        keterangan: { contains: '[Import Outbound]' },
      },
    });

    if (dupCheck) { skipped++; continue; }

    await prismaGa.gaStockMovement.create({
      data: {
        tipe: 'OUT',
        itemId: item?.id ?? null,
        namaBarang: nama,
        qty,
        tanggal,
        tanggalPakai: tanggal,
        picNama: pic || null,
        harga: 0,
        keterangan: '[Import Outbound] Riwayat pengeluaran dari spreadsheet GA',
      },
    });
    imported++;
  }

  console.log(`   ✅ Imported: ${imported} | Dilewati/Duplikat: ${skipped}`);
}

// ── MAIN ────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Import GA Excel → Database GA');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  File: ${EXCEL_PATH}`);

  const wb = XLSX.readFile(EXCEL_PATH, { raw: true });
  console.log(`  Sheet: ${wb.SheetNames.join(' | ')}`);

  const getSheet = (names) => {
    for (const n of names) {
      const found = wb.SheetNames.find(s => s.toLowerCase().trim() === n.toLowerCase());
      if (found) return XLSX.utils.sheet_to_json(wb.Sheets[found], { defval: '', raw: true })
        .filter(r => Object.values(r).some(v => str(v) !== ''));
    }
    return [];
  };

  const dbBarangRows = getSheet(['db barang', 'sheet1', 'db']);
  const lhBarangRows = getSheet(['lh barang', 'sheet2', 'lh']);
  const inboundRows  = getSheet(['inbound']);
  const outboundRows = getSheet(['outbound']);

  console.log(`\n  Data ditemukan:`);
  console.log(`  - DB Barang : ${dbBarangRows.length} baris`);
  console.log(`  - LH Barang : ${lhBarangRows.length} baris`);
  console.log(`  - Inbound   : ${inboundRows.length} baris`);
  console.log(`  - Outbound  : ${outboundRows.length} baris`);

  // Urutan penting: DB dulu → LH update → Inbound → Outbound
  await importDbBarang(dbBarangRows);
  await importLhBarang(lhBarangRows);
  await importInbound(inboundRows);
  await importOutbound(outboundRows);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Import selesai! Aman dijalankan ulang — tidak duplikat.');
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .catch(e => { console.error('\n❌ Error fatal:', e); process.exit(1); })
  .finally(() => prismaGa.$disconnect());
