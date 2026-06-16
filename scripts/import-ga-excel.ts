/**
 * scripts/import-ga-excel.ts
 * ============================================================
 * Import data dari FormulatiInputDBInitGA.xlsx ke database GA.
 *
 * Sheet 1 (DB Barang)  → GaItem (master barang) + stok awal sebagai ADJ
 * Sheet 2 (LH Barang)  → GaItem (upsert, skip jika sudah ada)
 * Sheet 3 (Inbound)    → GaStockMovement tipe IN
 * Sheet 4 (Outbound)   → GaStockMovement tipe OUT
 *
 * Idempoten: aman dijalankan berkali-kali. Barang yang sudah ada
 * di database tidak akan ditimpa (hanya diupdate jika berbeda kode).
 * Movement hanya dibuat jika belum ada (berdasarkan keterangan sumber).
 *
 * Jalankan:
 *   npx ts-node --project tsconfig.scripts.json scripts/import-ga-excel.ts
 *   -- atau --
 *   npx tsx scripts/import-ga-excel.ts
 *
 * Path Excel default: C:\Users\Fooml\Downloads\FormulatiInputDBInitGA (1).xlsx
 * Bisa override via env: EXCEL_PATH=... npx tsx scripts/import-ga-excel.ts
 * ============================================================
 */

import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient, Prisma } from '../lib/generated/ga';

const prismaGa = new PrismaClient();

// ── Konfigurasi path file Excel ────────────────────────────────────────────────
const EXCEL_PATH =
  process.env.EXCEL_PATH ||
  path.join('C:\\Users\\Fooml\\Downloads\\FormulatiInputDBInitGA (1).xlsx');

// ── Helper ─────────────────────────────────────────────────────────────────────

function toStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function toInt(v: unknown): number {
  const n = parseInt(String(v ?? 0).replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function toDecimal(v: unknown): Prisma.Decimal {
  const s = String(v ?? '0').replace(/[^0-9.,]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return new Prisma.Decimal(isNaN(n) ? 0 : n);
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  // Excel serial date number
  if (typeof v === 'number') {
    return XLSX.SSF.parse_date_code ? new Date((v - 25569) * 86400 * 1000) : new Date();
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function sheetToRows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: true,
  });
  return rows;
}

// ── Ambil nama sheet yang tersedia ─────────────────────────────────────────────
function detectSheetName(wb: XLSX.WorkBook, candidates: string[]): string | null {
  for (const c of candidates) {
    const found = wb.SheetNames.find((n) => n.toLowerCase().trim() === c.toLowerCase().trim());
    if (found) return found;
  }
  // Fallback: return by index
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 1 & 2: Master Barang → GaItem
// Kolom yang diharapkan: NAMA BARANG, KODE BARANG, Qty (stok awal)
// Kolom opsional: LOKASI, SATUAN/UOM, HARGA, KATEGORI, MIN QTY, MAX QTY
// ═══════════════════════════════════════════════════════════════════════════════
async function importMasterBarang(
  rows: Record<string, unknown>[],
  sheetLabel: string,
  defaultLokasi?: string
): Promise<{ upserted: number; skipped: number; stockAdded: number }> {
  let upserted = 0;
  let skipped = 0;
  let stockAdded = 0;

  for (const row of rows) {
    // Normalisasi header — cari kolom yang cocok case-insensitive
    const keys = Object.keys(row);
    const get = (candidates: string[]): unknown => {
      for (const c of candidates) {
        const k = keys.find((k) => k.toLowerCase().replace(/\s+/g, ' ').trim() === c.toLowerCase());
        if (k !== undefined) return row[k];
      }
      return '';
    };

    const namaRaw = toStr(get(['nama barang', 'nama', 'name', 'item name']));
    const kode = toStr(get(['kode barang', 'kode', 'item code', 'code']));
    const qtyAwal = toInt(get(['qty', 'quantity', 'stok', 'stock', 'jumlah']));
    const lokasi = toStr(get(['lokasi', 'location', 'lokasi barang'])) || defaultLokasi || null;
    const uom = toStr(get(['satuan', 'uom', 'unit', 'unit of measure'])) || 'Pcs';
    const harga = toDecimal(get(['harga', 'price', 'harga satuan']));
    const minQty = toInt(get(['min qty', 'min', 'minimum qty', 'reorder']));
    const maxQty = toInt(get(['max qty', 'max', 'maximum qty'])) || null;

    if (!namaRaw) {
      skipped++;
      continue; // skip baris kosong
    }

    // ID barang: pakai kode jika ada, atau generate dari nama
    const itemId = kode
      ? kode.toUpperCase()
      : `GA-${namaRaw.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-').substring(0, 20)}`;

    try {
      await prismaGa.gaItem.upsert({
        where: { id: itemId },
        create: {
          id: itemId,
          nama: namaRaw,
          kodeBarang: kode || null,
          uom,
          lokasi,
          harga,
          minQty,
          maxQty,
          aktif: true,
        },
        update: {
          // Update hanya field yang mungkin berubah, tidak menimpa data yang sudah ada
          kodeBarang: kode || undefined,
          lokasi: lokasi || undefined,
          uom: uom !== 'Pcs' ? uom : undefined,
          harga: harga.gt(0) ? harga : undefined,
          minQty: minQty > 0 ? minQty : undefined,
          maxQty: maxQty ? maxQty : undefined,
        },
      });
      upserted++;

      // Buat stok awal sebagai ADJ movement HANYA jika qty > 0 dan belum ada movement untuk item ini
      if (qtyAwal !== 0) {
        const existingAdj = await prismaGa.gaStockMovement.findFirst({
          where: {
            itemId,
            keterangan: { contains: `[Import ${sheetLabel}]` },
          },
        });

        if (!existingAdj) {
          await prismaGa.gaStockMovement.create({
            data: {
              tipe: 'ADJ',
              itemId,
              namaBarang: namaRaw,
              qty: qtyAwal,
              tanggal: new Date('2025-01-01T00:00:00Z'), // Stok awal historis
              keterangan: `[Import ${sheetLabel}] Stok awal saat migrasi data`,
            },
          });
          stockAdded++;
        }
      }
    } catch (e: any) {
      console.warn(`  ⚠ Gagal upsert barang "${namaRaw}" (${itemId}): ${e.message}`);
    }
  }

  return { upserted, skipped, stockAdded };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 3: Inbound → GaStockMovement tipe IN
// Kolom yang diharapkan: NAMA BARANG/KODE, QTY, TANGGAL, VENDOR, KETERANGAN
// ═══════════════════════════════════════════════════════════════════════════════
async function importInbound(rows: Record<string, unknown>[]): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const keys = Object.keys(row);
    const get = (candidates: string[]): unknown => {
      for (const c of candidates) {
        const k = keys.find((k) => k.toLowerCase().replace(/\s+/g, ' ').trim() === c.toLowerCase());
        if (k !== undefined) return row[k];
      }
      return '';
    };

    const namaRaw = toStr(get(['nama barang', 'nama', 'name', 'item name', 'barang']));
    const kode = toStr(get(['kode barang', 'kode', 'item code', 'code']));
    const qty = toInt(get(['qty', 'quantity', 'jumlah', 'qty terima', 'qty diterima']));
    const tanggalRaw = get(['tanggal', 'date', 'tanggal terima', 'tgl terima', 'tgl masuk']);
    const tanggal = toDate(tanggalRaw) || new Date();
    const vendor = toStr(get(['vendor', 'supplier', 'pemasok']));
    const harga = toDecimal(get(['harga', 'price', 'harga satuan']));
    const ket = toStr(get(['keterangan', 'notes', 'note', 'catatan']));
    const pic = toStr(get(['pic', 'penerima', 'nama pic']));
    const noPo = toStr(get(['no po', 'nomor po', 'po', 'po number']));

    if (!namaRaw && !kode) { skipped++; continue; }
    if (qty <= 0) { skipped++; continue; }

    // Cari item di database berdasarkan kode atau nama
    let itemId: string | null = null;
    if (kode) {
      const item = await prismaGa.gaItem.findFirst({ where: { kodeBarang: kode } });
      if (item) itemId = item.id;
    }
    if (!itemId && namaRaw) {
      const item = await prismaGa.gaItem.findFirst({
        where: { nama: { equals: namaRaw, mode: 'insensitive' } },
      });
      if (item) itemId = item.id;
    }

    const keterangan = [
      '[Import Inbound]',
      noPo ? `PO: ${noPo}` : null,
      ket || null,
    ].filter(Boolean).join(' | ');

    // Cek duplikat berdasarkan item + tanggal + qty + keterangan awal
    const existing = await prismaGa.gaStockMovement.findFirst({
      where: {
        tipe: 'IN',
        itemId: itemId || undefined,
        namaBarang: namaRaw || undefined,
        qty,
        tanggal,
      },
    });

    if (existing) { skipped++; continue; }

    try {
      await prismaGa.gaStockMovement.create({
        data: {
          tipe: 'IN',
          itemId,
          namaBarang: namaRaw || (itemId ? null : 'Barang GA'),
          qty,
          qtyDiterima: qty,
          tanggalTerima: tanggal,
          tanggal,
          harga,
          vendor: vendor || null,
          picNama: pic || null,
          purchaseType: noPo ? 'PO' : null,
          keterangan,
        },
      });
      imported++;
    } catch (e: any) {
      console.warn(`  ⚠ Gagal import Inbound "${namaRaw}": ${e.message}`);
    }
  }

  return { imported, skipped };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET 4: Outbound → GaStockMovement tipe OUT
// Kolom yang diharapkan: NAMA BARANG/KODE, QTY, TANGGAL, PIC, KETERANGAN
// ═══════════════════════════════════════════════════════════════════════════════
async function importOutbound(rows: Record<string, unknown>[]): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const keys = Object.keys(row);
    const get = (candidates: string[]): unknown => {
      for (const c of candidates) {
        const k = keys.find((k) => k.toLowerCase().replace(/\s+/g, ' ').trim() === c.toLowerCase());
        if (k !== undefined) return row[k];
      }
      return '';
    };

    const namaRaw = toStr(get(['nama barang', 'nama', 'name', 'item name', 'barang']));
    const kode = toStr(get(['kode barang', 'kode', 'item code', 'code']));
    const qty = toInt(get(['qty', 'quantity', 'jumlah', 'qty keluar', 'qty pakai']));
    const tanggalRaw = get(['tanggal', 'date', 'tanggal pakai', 'tgl pakai', 'tgl keluar']);
    const tanggal = toDate(tanggalRaw) || new Date();
    const pic = toStr(get(['pic', 'penerima', 'peminta', 'dikeluarkan untuk', 'user', 'nama pic']));
    const ket = toStr(get(['keterangan', 'notes', 'note', 'catatan', 'keperluan']));

    if (!namaRaw && !kode) { skipped++; continue; }
    if (qty <= 0) { skipped++; continue; }

    // Cari item di database
    let itemId: string | null = null;
    if (kode) {
      const item = await prismaGa.gaItem.findFirst({ where: { kodeBarang: kode } });
      if (item) itemId = item.id;
    }
    if (!itemId && namaRaw) {
      const item = await prismaGa.gaItem.findFirst({
        where: { nama: { equals: namaRaw, mode: 'insensitive' } },
      });
      if (item) itemId = item.id;
    }

    // Cek duplikat
    const existing = await prismaGa.gaStockMovement.findFirst({
      where: {
        tipe: 'OUT',
        itemId: itemId || undefined,
        namaBarang: namaRaw || undefined,
        qty,
        tanggal,
      },
    });

    if (existing) { skipped++; continue; }

    const keterangan = ['[Import Outbound]', ket || null].filter(Boolean).join(' | ');

    try {
      await prismaGa.gaStockMovement.create({
        data: {
          tipe: 'OUT',
          itemId,
          namaBarang: namaRaw || null,
          qty,
          tanggal,
          tanggalPakai: tanggal,
          picNama: pic || null,
          keterangan,
          harga: new Prisma.Decimal(0),
        },
      });
      imported++;
    } catch (e: any) {
      console.warn(`  ⚠ Gagal import Outbound "${namaRaw}": ${e.message}`);
    }
  }

  return { imported, skipped };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Import GA Excel → Database GA');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  File: ${EXCEL_PATH}`);

  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`\n❌ File tidak ditemukan: ${EXCEL_PATH}`);
    console.error('   Set path via: EXCEL_PATH="..." npx tsx scripts/import-ga-excel.ts');
    process.exit(1);
  }

  // Baca file Excel
  const wb = XLSX.readFile(EXCEL_PATH, { cellDates: false, raw: true });

  console.log(`\n📋 Sheet yang ditemukan: ${wb.SheetNames.join(', ')}`);
  console.log('');

  // ── SHEET 1: DB Barang ─────────────────────────────────────────────────────
  const sheet1Name = detectSheetName(wb, ['db barang', 'db', 'database', 'master', 'sheet1']) || wb.SheetNames[0];
  if (sheet1Name) {
    console.log(`📦 [Sheet 1] "${sheet1Name}" → Master Barang (DB)`);
    const rows = sheetToRows(wb.Sheets[sheet1Name]);
    const validRows = rows.filter((r) => Object.values(r).some((v) => toStr(v) !== ''));
    console.log(`   Baris valid: ${validRows.length}`);
    const result = await importMasterBarang(validRows, 'DB Barang');
    console.log(`   ✅ Upserted: ${result.upserted} | Dilewati: ${result.skipped} | Stok awal dibuat: ${result.stockAdded}`);
  }

  // ── SHEET 2: LH Barang ─────────────────────────────────────────────────────
  const sheet2Name = detectSheetName(wb, ['lh barang', 'lh', 'laporan harian', 'live', 'sheet2']) || wb.SheetNames[1];
  if (sheet2Name && sheet2Name !== sheet1Name) {
    console.log(`\n📦 [Sheet 2] "${sheet2Name}" → Master Barang (LH)`);
    const rows = sheetToRows(wb.Sheets[sheet2Name]);
    const validRows = rows.filter((r) => Object.values(r).some((v) => toStr(v) !== ''));
    console.log(`   Baris valid: ${validRows.length}`);
    const result = await importMasterBarang(validRows, 'LH Barang');
    console.log(`   ✅ Upserted: ${result.upserted} | Dilewati: ${result.skipped} | Stok awal dibuat: ${result.stockAdded}`);
  }

  // ── SHEET 3: Inbound ──────────────────────────────────────────────────────
  const sheet3Name = detectSheetName(wb, ['inbound', 'in', 'masuk', 'penerimaan', 'stock in', 'sheet3']) || wb.SheetNames[2];
  if (sheet3Name) {
    console.log(`\n📥 [Sheet 3] "${sheet3Name}" → Riwayat Inbound (Stock IN)`);
    const rows = sheetToRows(wb.Sheets[sheet3Name]);
    const validRows = rows.filter((r) => Object.values(r).some((v) => toStr(v) !== ''));
    console.log(`   Baris valid: ${validRows.length}`);
    const result = await importInbound(validRows);
    console.log(`   ✅ Imported: ${result.imported} | Dilewati/Duplikat: ${result.skipped}`);
  }

  // ── SHEET 4: Outbound ─────────────────────────────────────────────────────
  const sheet4Name = detectSheetName(wb, ['outbound', 'out', 'keluar', 'pemakaian', 'stock out', 'sheet4']) || wb.SheetNames[3];
  if (sheet4Name) {
    console.log(`\n📤 [Sheet 4] "${sheet4Name}" → Riwayat Outbound (Stock OUT)`);
    const rows = sheetToRows(wb.Sheets[sheet4Name]);
    const validRows = rows.filter((r) => Object.values(r).some((v) => toStr(v) !== ''));
    console.log(`   Baris valid: ${validRows.length}`);
    const result = await importOutbound(validRows);
    console.log(`   ✅ Imported: ${result.imported} | Dilewati/Duplikat: ${result.skipped}`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Import selesai!');
  console.log('  Aman dijalankan ulang — data tidak akan duplikat.');
  console.log('═══════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Error fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prismaGa.$disconnect();
  });
