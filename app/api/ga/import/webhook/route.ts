import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { Prisma } from '@/lib/generated/ga';
import { ok, err } from '@/lib/utils';

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

function toDate(v: unknown): Date {
  if (!v) return new Date();
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? new Date() : d;
}

// Import logic functions matching import-ga-excel.ts

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
      console.warn(`[Webhook Sync] Gagal upsert barang "${namaRaw}" (${itemId}): ${e.message}`);
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
    const tanggal = toDate(tanggalRaw);
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
      console.warn(`[Webhook Sync] Gagal import Inbound "${namaRaw}": ${e.message}`);
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
    const tanggal = toDate(tanggalRaw);
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
      console.warn(`[Webhook Sync] Gagal import Outbound "${namaRaw}": ${e.message}`);
    }
  }

  return { imported, skipped };
}

// POST endpoint handler
export async function POST(req: NextRequest) {
  // 1. Authenticate using API Token
  const tokenHeader = req.headers.get('X-GA-Sync-Token');
  const configuredToken = process.env.GA_SYNC_TOKEN || 'ga_secret_default_token_2026';

  if (!tokenHeader || tokenHeader !== configuredToken) {
    return err('Unauthorized. Invalid X-GA-Sync-Token.', 401);
  }

  // 2. Parse request body
  let body: { sheetName: string; rows: Record<string, unknown>[] };
  try {
    body = await req.json();
  } catch {
    return err('Invalid JSON body', 400);
  }

  const { sheetName, rows } = body;
  if (!sheetName || !Array.isArray(rows)) {
    return err('Missing sheetName or rows array in body', 400);
  }

  const normalizedSheet = sheetName.toLowerCase().trim();

  try {
    // 3. Match sheet name and execute appropriate import function
    if (['db barang', 'db', 'database', 'master', 'sheet1'].includes(normalizedSheet)) {
      const result = await importMasterBarang(rows, 'DB Barang');
      return ok({
        message: `Sheet "${sheetName}" processed.`,
        result
      });
    }

    if (['lh barang', 'lh', 'laporan harian', 'live', 'sheet2'].includes(normalizedSheet)) {
      const result = await importMasterBarang(rows, 'LH Barang');
      return ok({
        message: `Sheet "${sheetName}" processed.`,
        result
      });
    }

    if (['inbound', 'in', 'masuk', 'penerimaan', 'stock in', 'sheet3'].includes(normalizedSheet)) {
      const result = await importInbound(rows);
      return ok({
        message: `Sheet "${sheetName}" processed.`,
        result
      });
    }

    if (['outbound', 'out', 'keluar', 'pemakaian', 'stock out', 'sheet4'].includes(normalizedSheet)) {
      const result = await importOutbound(rows);
      return ok({
        message: `Sheet "${sheetName}" processed.`,
        result
      });
    }

    return err(`Unsupported sheetName: "${sheetName}"`, 400);
  } catch (e: any) {
    return err(`Error processing sheet sync: ${e.message}`, 500);
  }
}
