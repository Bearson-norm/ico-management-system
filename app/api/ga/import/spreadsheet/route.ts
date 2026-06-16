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

function toDate(v: unknown): Date {
  if (!v) return new Date();
  // Excel serial date number
  if (typeof v === 'number') {
    return XLSX.SSF?.parse_date_code ? new Date((v - 25569) * 86400 * 1000) : new Date();
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? new Date() : d;
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

// Generate unique key to identify movements in memory to avoid redundant queries
function getMovementKey(tipe: string, itemId: string | null, namaBarang: string | null, qty: number, tanggal: Date) {
  const t = new Date(tanggal).getTime();
  return `${tipe}_${itemId || ''}_${namaBarang || ''}_${qty}_${t}`;
}

// Auto cleanup database duplicates (e.g. GA-SP-042 and A0042) to prevent duplicates and unique constraint violations
async function autoCleanupDuplicates() {
  const items = await prismaGa.gaItem.findMany();
  
  // Group items by kodeBarang (case-insensitive)
  const codeMap: { [code: string]: typeof items } = {};
  items.forEach(it => {
    if (it.kodeBarang) {
      const code = it.kodeBarang.toUpperCase().trim();
      if (!codeMap[code]) codeMap[code] = [];
      codeMap[code].push(it);
    }
  });

  for (const [code, list] of Object.entries(codeMap)) {
    if (list.length > 1) {
      let original = list.find(it => it.id.startsWith('GA-SP-') || it.id.startsWith('GA-ITEM-'));
      let duplicate = list.find(it => !it.id.startsWith('GA-SP-') && !it.id.startsWith('GA-ITEM-'));
      
      if (!original) {
        original = list[0];
        duplicate = list[1];
      } else if (!duplicate) {
        const origId = original.id;
        duplicate = list.find(it => it.id !== origId);
      }
      
      if (!original || !duplicate) continue;
      
      // 1. Move Stock Movements
      await prismaGa.gaStockMovement.updateMany({
        where: { itemId: duplicate.id },
        data: { itemId: original.id }
      });
      
      // 2. Move Procurements
      await prismaGa.gaProcurementTracking.updateMany({
        where: { itemId: duplicate.id },
        data: { itemId: original.id }
      });
      
      // 3. Move Opname Lines (handling unique constraint per session)
      const opnameLines = await prismaGa.gaOpnameLine.findMany({
        where: { itemId: duplicate.id }
      });
      for (const line of opnameLines) {
        const existingOriginalLine = await prismaGa.gaOpnameLine.findFirst({
          where: { sessionId: line.sessionId, itemId: original.id }
        });
        
        if (existingOriginalLine) {
          await prismaGa.gaOpnameLine.delete({
            where: { id: line.id }
          });
        } else {
          await prismaGa.gaOpnameLine.update({
            where: { id: line.id },
            data: { itemId: original.id }
          });
        }
      }
      
      // 4. Delete duplicate item
      await prismaGa.gaItem.delete({
        where: { id: duplicate.id }
      });
    }
  }
}

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  // Parse spreadsheet URL from body if provided, otherwise fallback to env
  let spreadsheetUrl = '';
  try {
    const body = await req.json();
    spreadsheetUrl = body?.spreadsheetUrl || '';
  } catch {
    // no body or invalid JSON is fine, fallback to env
  }

  let url = spreadsheetUrl || process.env.GA_SPREADSHEET_URL;
  if (!url) {
    return err('Silakan masukkan URL Google Sheets terlebih dahulu atau atur GA_SPREADSHEET_URL di file .env', 400);
  }

  // Auto-rewrite spreadsheet /edit or /view URLs to direct export XLSX format
  const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (sheetIdMatch) {
    const sheetId = sheetIdMatch[1];
    url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  }

  try {
    // Run self-healing database duplicates cleanup first
    await autoCleanupDuplicates();

    // 1. Fetch the published Google Sheet XLSX buffer
    const res = await fetch(url);
    if (!res.ok) {
      return err(`Gagal mengunduh spreadsheet: HTTP ${res.status}. Pastikan hak akses Google Sheets diatur ke "Siapa saja yang memiliki link dapat melihat" (Anyone with the link can view)`, 400);
    }
    const arrayBuffer = await res.arrayBuffer();

    // 2. Parse workbook in memory
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: false, raw: true });

    // 3. Load ALL existing items and movements from database into memory (Pre-caching)
    const [existingItems, existingMovements] = await Promise.all([
      prismaGa.gaItem.findMany(),
      prismaGa.gaStockMovement.findMany({
        select: {
          tipe: true,
          itemId: true,
          namaBarang: true,
          qty: true,
          tanggal: true,
          keterangan: true,
        }
      })
    ]);

    const itemMap = new Map(existingItems.map((it) => [it.id, it]));
    
    // Create a Set of unique keys for fast duplicate lookup
    const movementSet = new Set(
      existingMovements.map((m) => getMovementKey(m.tipe, m.itemId, m.namaBarang, m.qty, m.tanggal))
    );

    // Track statistics
    const stats = {
      master: { upserted: 0, skipped: 0, stockAdded: 0 },
      inbound: { imported: 0, skipped: 0 },
      outbound: { imported: 0, skipped: 0 },
    };

    // Arrays to hold database write operations
    const itemUpserts: Promise<any>[] = [];
    const newMovements: Prisma.GaStockMovementCreateManyInput[] = [];

    // Helper: Normalize header row keys
    const getRowValue = (row: Record<string, unknown>, candidates: string[]): unknown => {
      const keys = Object.keys(row);
      for (const c of candidates) {
        const k = keys.find((key) => key.toLowerCase().replace(/\s+/g, ' ').trim() === c.toLowerCase());
        if (k !== undefined) return row[k];
      }
      return '';
    };

    // ==========================================
    // PROCESS SHEETS 1 & 2: Master Barang (DB & LH)
    // ==========================================
    interface NormalizedItem {
      itemId: string;
      namaRaw: string;
      kode: string;
      qtyAwal: number;
      lokasi: string | null;
      uom: string;
      harga: Prisma.Decimal;
      minQty: number;
      maxQty: number | null;
      label: string;
    }

    const masterItemsMap = new Map<string, NormalizedItem>();

    const collectMasterItems = (sheetName: string, label: string) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return;

      const rows = sheetToRows(ws).filter((r) => Object.values(r).some((v) => toStr(v) !== ''));

      for (const row of rows) {
        const namaRaw = toStr(getRowValue(row, ['nama barang', 'nama', 'name', 'item name']));
        const kode = toStr(getRowValue(row, ['kode barang', 'kode', 'item code', 'code']));
        const qtyAwal = toInt(getRowValue(row, ['qty', 'quantity', 'stok', 'stock', 'jumlah']));
        const lokasi = toStr(getRowValue(row, ['lokasi', 'location', 'lokasi barang'])) || null;
        const uom = toStr(getRowValue(row, ['satuan', 'uom', 'unit', 'unit of measure'])) || 'Pcs';
        const harga = toDecimal(getRowValue(row, ['harga', 'price', 'harga satuan']));
        const minQty = toInt(getRowValue(row, ['min qty', 'min', 'minimum qty', 'reorder']));
        const maxQty = toInt(getRowValue(row, ['max qty', 'max', 'maximum qty'])) || null;

        if (!namaRaw) {
          stats.master.skipped++;
          continue;
        }

        let existing = null;
        if (kode) {
          existing = existingItems.find((it) => it.kodeBarang?.toUpperCase() === kode.toUpperCase());
        }
        if (!existing && namaRaw) {
          existing = existingItems.find((it) => it.nama.toLowerCase() === namaRaw.toLowerCase());
        }

        const itemId = existing
          ? existing.id
          : (kode
              ? kode.toUpperCase()
              : `GA-${namaRaw.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-').substring(0, 20)}`);

        masterItemsMap.set(itemId, {
          itemId,
          namaRaw,
          kode,
          qtyAwal,
          lokasi,
          uom,
          harga,
          minQty,
          maxQty,
          label,
        });
      }
    };

    const sheet1Name = detectSheetName(wb, ['db barang', 'db', 'database', 'master', 'sheet1']) || wb.SheetNames[0];
    if (sheet1Name) {
      collectMasterItems(sheet1Name, 'DB Barang');
    }

    const sheet2Name = detectSheetName(wb, ['lh barang', 'lh', 'laporan harian', 'live', 'sheet2']) || wb.SheetNames[1];
    if (sheet2Name && sheet2Name !== sheet1Name) {
      collectMasterItems(sheet2Name, 'LH Barang');
    }

    // Now process the unique gathered items
    for (const item of masterItemsMap.values()) {
      const existing = itemMap.get(item.itemId);

      if (existing) {
        // Compare fields to see if updates are actually needed
        const isSame =
          existing.nama === item.namaRaw &&
          existing.kodeBarang === (item.kode || null) &&
          existing.uom === item.uom &&
          existing.lokasi === item.lokasi &&
          Number(existing.harga) === Number(item.harga) &&
          existing.minQty === item.minQty &&
          existing.maxQty === item.maxQty;

        if (isSame) {
          stats.master.skipped++;
        } else {
          // Add update promise
          itemUpserts.push(
            prismaGa.gaItem.update({
              where: { id: item.itemId },
              data: {
                kodeBarang: item.kode || undefined,
                lokasi: item.lokasi || undefined,
                uom: item.uom !== 'Pcs' ? item.uom : undefined,
                harga: item.harga.gt(0) ? item.harga : undefined,
                minQty: item.minQty > 0 ? item.minQty : undefined,
                maxQty: item.maxQty ? item.maxQty : undefined,
              },
            })
          );
          stats.master.upserted++;
        }
      } else {
        // Add create promise
        itemUpserts.push(
          prismaGa.gaItem.create({
            data: {
              id: item.itemId,
              nama: item.namaRaw,
              kodeBarang: item.kode || null,
              uom: item.uom,
              lokasi: item.lokasi,
              harga: item.harga,
              minQty: item.minQty,
              maxQty: item.maxQty,
              aktif: true,
            },
          })
        );
        stats.master.upserted++;
      }

      // Handle historical initial stock
      if (item.qtyAwal !== 0) {
        const adjKey = getMovementKey('ADJ', item.itemId, item.namaRaw, item.qtyAwal, new Date('2025-01-01T00:00:00Z'));
        const existingAdj = existingMovements.find(
          (m) => m.itemId === item.itemId && m.tipe === 'ADJ' && m.keterangan?.includes(`[Import ${item.label}]`)
        );

        if (!existingAdj && !movementSet.has(adjKey)) {
          newMovements.push({
            tipe: 'ADJ',
            itemId: item.itemId,
            namaBarang: item.namaRaw,
            qty: item.qtyAwal,
            tanggal: new Date('2025-01-01T00:00:00Z'),
            keterangan: `[Import ${item.label}] Stok awal saat migrasi data`,
            harga: new Prisma.Decimal(0),
          });
          movementSet.add(adjKey);
          stats.master.stockAdded++;
        }
      }
    }

    // Run item database updates/inserts in parallel
    if (itemUpserts.length > 0) {
      await Promise.all(itemUpserts);
    }

    // ==========================================
    // PROCESS SHEET 3: Inbound (Stock IN)
    // ==========================================
    const sheet3Name = detectSheetName(wb, ['inbound', 'in', 'masuk', 'penerimaan', 'stock in', 'sheet3']) || wb.SheetNames[2];
    if (sheet3Name) {
      const rows = sheetToRows(wb.Sheets[sheet3Name]).filter((r) => Object.values(r).some((v) => toStr(v) !== ''));

      for (const row of rows) {
        const namaRaw = toStr(getRowValue(row, ['nama barang', 'nama', 'name', 'item name', 'barang']));
        const kode = toStr(getRowValue(row, ['kode barang', 'kode', 'item code', 'code']));
        const qty = toInt(getRowValue(row, ['qty', 'quantity', 'jumlah', 'qty terima', 'qty diterima']));
        const tanggalRaw = getRowValue(row, ['tanggal', 'date', 'tanggal terima', 'tgl terima', 'tgl masuk']);
        const tanggal = toDate(tanggalRaw);
        const vendor = toStr(getRowValue(row, ['vendor', 'supplier', 'pemasok']));
        const harga = toDecimal(getRowValue(row, ['harga', 'price', 'harga satuan']));
        const ket = toStr(getRowValue(row, ['keterangan', 'notes', 'note', 'catatan']));
        const pic = toStr(getRowValue(row, ['pic', 'penerima', 'nama pic']));
        const noPo = toStr(getRowValue(row, ['no po', 'nomor po', 'po', 'po number']));

        if (!namaRaw && !kode) { stats.inbound.skipped++; continue; }
        if (qty <= 0) { stats.inbound.skipped++; continue; }

        let itemId: string | null = null;
        if (kode) {
          const item = existingItems.find((it) => it.kodeBarang === kode);
          if (item) itemId = item.id;
        }
        if (!itemId && namaRaw) {
          const item = existingItems.find((it) => it.nama.toLowerCase() === namaRaw.toLowerCase());
          if (item) itemId = item.id;
        }

        const mKey = getMovementKey('IN', itemId, namaRaw, qty, tanggal);
        if (movementSet.has(mKey)) {
          stats.inbound.skipped++;
          continue;
        }

        const keterangan = [
          '[Import Inbound]',
          noPo ? `PO: ${noPo}` : null,
          ket || null,
        ].filter(Boolean).join(' | ');

        newMovements.push({
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
        });
        movementSet.add(mKey);
        stats.inbound.imported++;
      }
    }

    // ==========================================
    // PROCESS SHEET 4: Outbound (Stock OUT)
    // ==========================================
    const sheet4Name = detectSheetName(wb, ['outbound', 'out', 'keluar', 'pemakaian', 'stock out', 'sheet4']) || wb.SheetNames[3];
    if (sheet4Name) {
      const rows = sheetToRows(wb.Sheets[sheet4Name]).filter((r) => Object.values(r).some((v) => toStr(v) !== ''));

      for (const row of rows) {
        const namaRaw = toStr(getRowValue(row, ['nama barang', 'nama', 'name', 'item name', 'barang']));
        const kode = toStr(getRowValue(row, ['kode barang', 'kode', 'item code', 'code']));
        const qty = toInt(getRowValue(row, ['qty', 'quantity', 'jumlah', 'qty keluar', 'qty pakai']));
        const tanggalRaw = getRowValue(row, ['tanggal', 'date', 'tanggal pakai', 'tgl pakai', 'tgl keluar']);
        const tanggal = toDate(tanggalRaw);
        const pic = toStr(getRowValue(row, ['pic', 'penerima', 'peminta', 'dikeluarkan untuk', 'user', 'nama pic']));
        const ket = toStr(getRowValue(row, ['keterangan', 'notes', 'note', 'catatan', 'keperluan']));

        if (!namaRaw && !kode) { stats.outbound.skipped++; continue; }
        if (qty <= 0) { stats.outbound.skipped++; continue; }

        let itemId: string | null = null;
        if (kode) {
          const item = existingItems.find((it) => it.kodeBarang === kode);
          if (item) itemId = item.id;
        }
        if (!itemId && namaRaw) {
          const item = existingItems.find((it) => it.nama.toLowerCase() === namaRaw.toLowerCase());
          if (item) itemId = item.id;
        }

        const mKey = getMovementKey('OUT', itemId, namaRaw, qty, tanggal);
        if (movementSet.has(mKey)) {
          stats.outbound.skipped++;
          continue;
        }

        const keterangan = ['[Import Outbound]', ket || null].filter(Boolean).join(' | ');

        newMovements.push({
          tipe: 'OUT',
          itemId,
          namaBarang: namaRaw || null,
          qty,
          tanggal,
          tanggalPakai: tanggal,
          picNama: pic || null,
          keterangan,
          harga: new Prisma.Decimal(0),
        });
        movementSet.add(mKey);
        stats.outbound.imported++;
      }
    }

    // 4. Bulk insert all new movements in a single transaction (High Performance batching)
    if (newMovements.length > 0) {
      await prismaGa.gaStockMovement.createMany({
        data: newMovements,
      });
    }

    return ok(stats);
  } catch (e: any) {
    return err(`Gagal memproses sinkronisasi: ${e.message}`, 500);
  }
}
