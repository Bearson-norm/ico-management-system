import { NextRequest } from 'next/server';
import { requireGaEditor } from '@/lib/auth';
import { prismaGa } from '@/lib/prisma-ga';
import { Prisma } from '@/lib/generated/ga';
import { ok, err } from '@/lib/utils';
import * as XLSX from 'xlsx';

// Helper functions for parsing
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
    return XLSX.SSF?.parse_date_code ? new Date((v - 25569) * 86400 * 1000) : new Date();
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

function detectSheetName(wb: XLSX.WorkBook, candidates: string[]): string | null {
  for (const c of candidates) {
    const found = wb.SheetNames.find((n) => n.toLowerCase().trim() === c.toLowerCase().trim());
    if (found) return found;
  }
  return null;
}

// Data processing logic matching scripts/import-ga-excel.ts

async function importMasterBarang(
  rows: Record<string, unknown>[],
  sheetLabel: string
): Promise<{ upserted: number; skipped: number; stockAdded: number }> {
  let upserted = 0;
  let skipped = 0;
  let stockAdded = 0;

  for (const row of rows) {
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
    const lokasi = toStr(get(['lokasi', 'location', 'lokasi barang'])) || null;
    const uom = toStr(get(['satuan', 'uom', 'unit', 'unit of measure'])) || 'Pcs';
    const harga = toDecimal(get(['harga', 'price', 'harga satuan']));
    const minQty = toInt(get(['min qty', 'min', 'minimum qty', 'reorder']));
    const maxQty = toInt(get(['max qty', 'max', 'maximum qty'])) || null;

    if (!namaRaw) {
      skipped++;
      continue;
    }

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
          kodeBarang: kode || undefined,
          lokasi: lokasi || undefined,
          uom: uom !== 'Pcs' ? uom : undefined,
          harga: harga.gt(0) ? harga : undefined,
          minQty: minQty > 0 ? minQty : undefined,
          maxQty: maxQty ? maxQty : undefined,
        },
      });
      upserted++;

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
              tanggal: new Date('2025-01-01T00:00:00Z'),
              keterangan: `[Import ${sheetLabel}] Stok awal saat migrasi data`,
            },
          });
          stockAdded++;
        }
      }
    } catch (e: any) {
      console.warn(`[Spreadsheet Sync] Gagal upsert barang "${namaRaw}" (${itemId}): ${e.message}`);
    }
  }

  return { upserted, skipped, stockAdded };
}

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
      console.warn(`[Spreadsheet Sync] Gagal import Inbound "${namaRaw}": ${e.message}`);
    }
  }

  return { imported, skipped };
}

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
      console.warn(`[Spreadsheet Sync] Gagal import Outbound "${namaRaw}": ${e.message}`);
    }
  }

  return { imported, skipped };
}

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const url = process.env.GA_SPREADSHEET_URL;
  if (!url) {
    return err('Variabel lingkungan GA_SPREADSHEET_URL belum dikonfigurasi di file .env', 400);
  }

  try {
    // 1. Fetch the published Google Sheet XLSX buffer
    const res = await fetch(url);
    if (!res.ok) {
      return err(`Gagal mengunduh spreadsheet: HTTP ${res.status}`, 400);
    }
    const arrayBuffer = await res.arrayBuffer();

    // 2. Parse workbook in memory
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false, raw: true });

    let masterResult = { upserted: 0, skipped: 0, stockAdded: 0 };
    let inboundResult = { imported: 0, skipped: 0 };
    let outboundResult = { imported: 0, skipped: 0 };

    // -- Sheet 1: DB Barang (Master)
    const sheet1Name = detectSheetName(wb, ['db barang', 'db', 'database', 'master', 'sheet1']) || wb.SheetNames[0];
    if (sheet1Name) {
      const rows = sheetToRows(wb.Sheets[sheet1Name]);
      const validRows = rows.filter((r) => Object.values(r).some((v) => toStr(v) !== ''));
      masterResult = await importMasterBarang(validRows, 'DB Barang');
    }

    // -- Sheet 2: LH Barang (Master updates)
    const sheet2Name = detectSheetName(wb, ['lh barang', 'lh', 'laporan harian', 'live', 'sheet2']) || wb.SheetNames[1];
    if (sheet2Name && sheet2Name !== sheet1Name) {
      const rows = sheetToRows(wb.Sheets[sheet2Name]);
      const validRows = rows.filter((r) => Object.values(r).some((v) => toStr(v) !== ''));
      const result2 = await importMasterBarang(validRows, 'LH Barang');
      masterResult.upserted += result2.upserted;
      masterResult.skipped += result2.skipped;
      masterResult.stockAdded += result2.stockAdded;
    }

    // -- Sheet 3: Inbound (IN movements)
    const sheet3Name = detectSheetName(wb, ['inbound', 'in', 'masuk', 'penerimaan', 'stock in', 'sheet3']) || wb.SheetNames[2];
    if (sheet3Name) {
      const rows = sheetToRows(wb.Sheets[sheet3Name]);
      const validRows = rows.filter((r) => Object.values(r).some((v) => toStr(v) !== ''));
      inboundResult = await importInbound(validRows);
    }

    // -- Sheet 4: Outbound (OUT movements)
    const sheet4Name = detectSheetName(wb, ['outbound', 'out', 'keluar', 'pemakaian', 'stock out', 'sheet4']) || wb.SheetNames[3];
    if (sheet4Name) {
      const rows = sheetToRows(wb.Sheets[sheet4Name]);
      const validRows = rows.filter((r) => Object.values(r).some((v) => toStr(v) !== ''));
      outboundResult = await importOutbound(validRows);
    }

    return ok({
      master: masterResult,
      inbound: inboundResult,
      outbound: outboundResult,
    });
  } catch (e: any) {
    return err(`Gagal memproses sinkronisasi: ${e.message}`, 500);
  }
}
