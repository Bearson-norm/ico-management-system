import type { PrismaClient } from '@/lib/generated/mtc';
import { isRecognizedSparepartId } from '@/lib/sparepart/masterCsv';

export type MtcStockInitialImportRow = {
  sparepartId: string;
  qty: number;
};

export type ImportMtcStockInitialIssue = {
  line: number;
  id?: string;
  reason: string;
};

export type ImportMtcStockInitialReport = {
  totalRows: number;
  physicalLines?: number;
  mergedLines?: number;
  imported: number;
  adjusted: number;
  skipped: number;
  failed: number;
  skippedRows: ImportMtcStockInitialIssue[];
  failedRows: ImportMtcStockInitialIssue[];
  message: string;
};

export type MtcStockInitialImportOptions = {
  tanggal: Date;
  keterangan?: string;
  /** true = hanya isi barang yang stoknya masih 0 (saldo awal). false = sesuaikan ke qty di file. */
  skipIfHasStock?: boolean;
};

const MAX_SAMPLES = 30;

function cell(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim();
  }
  const map = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = map.get(key.toLowerCase());
    if (actual && String(row[actual]).trim() !== '') return String(row[actual]).trim();
  }
  return undefined;
}

export function recordToMtcStockInitialRow(row: Record<string, string>): MtcStockInitialImportRow | null {
  const sparepartId = cell(
    row,
    'id',
    'ID',
    'Item ID',
    'item id',
    'itemid',
    'item_id',
    'sparepartId',
    'sparepart_id',
    'kode',
    'Kode Barang'
  )?.trim();
  if (!sparepartId || !isRecognizedSparepartId(sparepartId)) return null;

  const qtyRaw =
    cell(
      row,
      'Current Stock',
      'current stock',
      'current_stock',
      'currentStock',
      'stock',
      'Stock',
      'qty',
      'Qty',
      'QTY',
      'jumlah',
      'Jumlah'
    ) ?? '0';
  const qty = Math.max(0, Math.floor(Number(String(qtyRaw).replace(/,/g, '.')) || 0));

  return { sparepartId, qty };
}

function currentStock(movements: { tipe: string; qty: number }[]): number {
  const totalIn = movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
  const totalOut = movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + m.qty, 0);
  return totalIn - totalOut;
}

function formatMessage(report: Omit<ImportMtcStockInitialReport, 'message'>): string {
  let msg = 'Import stok MTC selesai:\n';
  if (report.physicalLines != null && report.mergedLines != null) {
    msg += `Baris di paste: ${report.physicalLines} → setelah perbaikan pecahan: ${report.mergedLines}\n`;
  }
  msg +=
    `Baris data: ${report.totalRows}\n` +
    `Stok masuk baru: ${report.imported}\n` +
    `Penyesuaian (sync): ${report.adjusted}\n` +
    `Dilewati: ${report.skipped}\n` +
    `Gagal: ${report.failed}`;

  if (report.skippedRows.length) {
    msg += '\n\nDilewati:';
    for (const s of report.skippedRows.slice(0, 8)) {
      msg += `\n• Baris ${s.line}${s.id ? ` [${s.id}]` : ''}: ${s.reason}`;
    }
  }
  if (report.failedRows.length) {
    msg += '\n\nGagal:';
    for (const f of report.failedRows.slice(0, 5)) {
      msg += `\n• Baris ${f.line}${f.id ? ` [${f.id}]` : ''}: ${f.reason}`;
    }
  }
  return msg;
}

export async function importMtcStockInitialBatch(
  prisma: PrismaClient,
  rawRecords: Record<string, string>[],
  options: MtcStockInitialImportOptions,
  parseMeta?: { physicalLines: number; mergedLines: number }
): Promise<ImportMtcStockInitialReport> {
  const skippedRows: ImportMtcStockInitialIssue[] = [];
  const failedRows: ImportMtcStockInitialIssue[] = [];
  let imported = 0;
  let adjusted = 0;
  let skipped = 0;
  let failed = 0;
  let totalRows = 0;

  const seenId = new Set<string>();
  const skipIfHasStock = options.skipIfHasStock !== false;
  const keterangan = options.keterangan?.trim() || 'Saldo awal / stock report';

  for (let i = 0; i < rawRecords.length; i++) {
    const line = i + 2;
    const raw = rawRecords[i];
    const hasContent = Object.values(raw).some((v) => String(v ?? '').trim() !== '');
    if (!hasContent) continue;

    totalRows++;
    const row = recordToMtcStockInitialRow(raw);
    if (!row) {
      skipped++;
      if (skippedRows.length < MAX_SAMPLES) {
        skippedRows.push({ line, reason: 'Item ID kosong atau tidak valid (contoh: MTC-SP-001)' });
      }
      continue;
    }

    const idKey = row.sparepartId.toUpperCase();
    if (seenId.has(idKey)) {
      skipped++;
      if (skippedRows.length < MAX_SAMPLES) {
        skippedRows.push({ line, id: row.sparepartId, reason: 'ID duplikat dalam file yang sama' });
      }
      continue;
    }
    seenId.add(idKey);

    try {
      const sp = await prisma.sparepart.findUnique({
        where: { id: row.sparepartId },
        include: {
          movements: { where: { tipe: { in: ['IN', 'OUT'] } }, select: { tipe: true, qty: true } },
        },
      });

      if (!sp) {
        failed++;
        if (failedRows.length < MAX_SAMPLES) {
          failedRows.push({
            line,
            id: row.sparepartId,
            reason: 'Item ID tidak ditemukan di master sparepart — import master dulu',
          });
        }
        continue;
      }

      const stock = currentStock(sp.movements);

      if (skipIfHasStock) {
        if (stock > 0) {
          skipped++;
          if (skippedRows.length < MAX_SAMPLES) {
            skippedRows.push({
              line,
              id: row.sparepartId,
              reason: `Sudah punya stok (${stock}) — dilewati agar tidak dobel`,
            });
          }
          continue;
        }
        if (row.qty <= 0) {
          skipped++;
          if (skippedRows.length < MAX_SAMPLES) {
            skippedRows.push({ line, id: row.sparepartId, reason: 'Current Stock kosong atau 0' });
          }
          continue;
        }

        await prisma.stockMovement.create({
          data: {
            tipe: 'IN',
            sparepartId: sp.id,
            namaItem: sp.nama,
            qty: row.qty,
            harga: sp.harga,
            lokasi: sp.lokasi,
            keterangan,
            tanggal: options.tanggal,
          },
        });
        imported++;
        continue;
      }

      const delta = row.qty - stock;
      if (delta === 0) {
        skipped++;
        if (skippedRows.length < MAX_SAMPLES) {
          skippedRows.push({ line, id: row.sparepartId, reason: `Stok sudah sama (${stock})` });
        }
        continue;
      }

      await prisma.stockMovement.create({
        data: {
          tipe: delta > 0 ? 'IN' : 'OUT',
          sparepartId: sp.id,
          namaItem: sp.nama,
          qty: Math.abs(delta),
          harga: sp.harga,
          lokasi: sp.lokasi,
          keterangan: `${keterangan} (sync ${stock} → ${row.qty})`,
          tanggal: options.tanggal,
        },
      });
      adjusted++;
    } catch (e: unknown) {
      failed++;
      if (failedRows.length < MAX_SAMPLES) {
        failedRows.push({
          line,
          id: row.sparepartId,
          reason: e instanceof Error ? e.message : 'Gagal simpan',
        });
      }
    }
  }

  const base = {
    totalRows,
    physicalLines: parseMeta?.physicalLines,
    mergedLines: parseMeta?.mergedLines,
    imported,
    adjusted,
    skipped,
    failed,
    skippedRows,
    failedRows,
  };

  return { ...base, message: formatMessage(base) };
}
