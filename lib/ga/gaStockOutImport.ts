import type { PrismaClient } from '@/lib/generated/ga';
import { getGaCurrentStockMap } from '@/lib/ga/stockQty';

export type GaStockOutImportRow = {
  nama: string;
  qty: number;
  tanggal: Date;
  picNama: string;
};

export type ImportGaStockOutIssue = {
  line: number;
  nama?: string;
  reason: string;
};

export type ImportGaStockOutReport = {
  totalRows: number;
  physicalLines?: number;
  mergedLines?: number;
  imported: number;
  skipped: number;
  failed: number;
  skippedRows: ImportGaStockOutIssue[];
  failedRows: ImportGaStockOutIssue[];
  message: string;
};

export type GaStockOutImportOptions = {
  keterangan?: string;
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

/** Parse tanggal DD/MM/YYYY, D/M/YYYY, atau YYYY-MM-DD */
export function parseGaStockOutDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s + 'T12:00:00');
  }

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const dt = new Date(year, month - 1, day, 12, 0, 0);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }
  return dt;
}

export function recordToGaStockOutRow(row: Record<string, string>): GaStockOutImportRow | null {
  const nama =
    cell(row, '', 'nama barang', 'NAMA BARANG', 'barang', 'item')?.trim() ||
    Object.values(row).find((v) => String(v ?? '').trim() !== '')?.trim();
  if (!nama) return null;

  const qtyRaw = cell(row, 'quantity', 'Quantity', 'qty', 'Qty', 'QTY') ?? '';
  const qty = Math.floor(Number(String(qtyRaw).replace(/,/g, '')) || 0);

  const tanggalRaw = cell(row, 'tanggal pemakaian', 'Tanggal Pemakaian', 'tanggal', 'Tanggal') ?? '';
  const tanggal = parseGaStockOutDate(tanggalRaw);

  const picNama = cell(row, 'picNama', 'nama', 'NAMA', 'pic', 'PIC', 'penerima')?.trim() ?? '';

  if (!tanggal || qty <= 0 || !picNama) return null;

  return { nama, qty, tanggal, picNama };
}

function normalizeName(nama: string): string {
  return nama.trim().replace(/\s+/g, ' ').toUpperCase();
}

function formatMessage(report: Omit<ImportGaStockOutReport, 'message'>): string {
  let msg = 'Import stock out GA selesai:\n';
  if (report.physicalLines != null && report.mergedLines != null) {
    msg += `Baris di paste: ${report.physicalLines} → setelah perbaikan pecahan: ${report.mergedLines}\n`;
  }
  msg +=
    `Baris data: ${report.totalRows}\n` +
    `Stok keluar: ${report.imported}\n` +
    `Dilewati: ${report.skipped}\n` +
    `Gagal: ${report.failed}`;

  if (report.skippedRows.length) {
    msg += '\n\nDilewati:';
    for (const s of report.skippedRows.slice(0, 8)) {
      msg += `\n• Baris ${s.line}${s.nama ? ` [${s.nama}]` : ''}: ${s.reason}`;
    }
  }
  if (report.failedRows.length) {
    msg += '\n\nGagal:';
    for (const f of report.failedRows.slice(0, 5)) {
      msg += `\n• Baris ${f.line}${f.nama ? ` [${f.nama}]` : ''}: ${f.reason}`;
    }
  }
  return msg;
}

export async function importGaStockOutBatch(
  prisma: PrismaClient,
  rawRecords: Record<string, string>[],
  options: GaStockOutImportOptions = {},
  parseMeta?: { physicalLines: number; mergedLines: number }
): Promise<ImportGaStockOutReport> {
  const skippedRows: ImportGaStockOutIssue[] = [];
  const failedRows: ImportGaStockOutIssue[] = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let totalRows = 0;

  const keterangan = options.keterangan?.trim() || '';

  type ResolvedRow = { line: number; row: GaStockOutImportRow; itemId: string; harga: number; namaBarang: string };
  const resolved: ResolvedRow[] = [];

  const allItems = await prisma.gaItem.findMany({
    where: { aktif: true },
    select: { id: true, nama: true, harga: true },
  });
  const byName = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const key = normalizeName(item.nama);
    const list = byName.get(key) ?? [];
    list.push(item);
    byName.set(key, list);
  }

  for (let i = 0; i < rawRecords.length; i++) {
    const displayLine = i + 2;
    const raw = rawRecords[i];
    const hasContent = Object.values(raw).some((v) => String(v ?? '').trim() !== '');
    if (!hasContent) continue;

    totalRows++;
    const row = recordToGaStockOutRow(raw);
    if (!row) {
      skipped++;
      if (skippedRows.length < MAX_SAMPLES) {
        skippedRows.push({
          line: displayLine,
          reason: 'Format baris tidak valid — pastikan: NAMA, Qty, Tanggal (DD/MM/YYYY), PIC',
        });
      }
      continue;
    }

    const matches = byName.get(normalizeName(row.nama));
    if (!matches?.length) {
      failed++;
      if (failedRows.length < MAX_SAMPLES) {
        failedRows.push({
          line: displayLine,
          nama: row.nama,
          reason: 'Barang tidak ditemukan di database — cek nama atau import master dulu',
        });
      }
      continue;
    }
    if (matches.length > 1) {
      failed++;
      if (failedRows.length < MAX_SAMPLES) {
        failedRows.push({
          line: displayLine,
          nama: row.nama,
          reason: `Nama barang ambigu (${matches.length} barang cocok) — gunakan nama persis dari database`,
        });
      }
      continue;
    }

    const item = matches[0];
    resolved.push({
      line: displayLine,
      row,
      itemId: item.id,
      harga: Number(item.harga) || 0,
      namaBarang: item.nama,
    });
  }

  if (resolved.length === 0) {
    const base = {
      totalRows,
      physicalLines: parseMeta?.physicalLines,
      mergedLines: parseMeta?.mergedLines,
      imported: 0,
      skipped,
      failed,
      skippedRows,
      failedRows,
    };
    return { ...base, message: formatMessage(base) };
  }

  const itemIds = [...new Set(resolved.map((r) => r.itemId))];
  const stockTracker = await getGaCurrentStockMap(prisma, itemIds);

  for (const r of resolved) {
    const available = stockTracker.get(r.itemId) ?? 0;
    if (available < r.row.qty) {
      failed++;
      if (failedRows.length < MAX_SAMPLES) {
        failedRows.push({
          line: r.line,
          nama: r.row.nama,
          reason: `Stok tidak cukup (sisa: ${available}, butuh: ${r.row.qty})`,
        });
      }
      continue;
    }

    try {
      await prisma.gaStockMovement.create({
        data: {
          tipe: 'OUT',
          item: { connect: { id: r.itemId } },
          namaBarang: r.namaBarang,
          qty: r.row.qty,
          harga: r.harga,
          tanggal: r.row.tanggal,
          tanggalPakai: r.row.tanggal,
          picNama: r.row.picNama,
          keterangan: keterangan || null,
        },
      });
      stockTracker.set(r.itemId, available - r.row.qty);
      imported++;
    } catch (e: unknown) {
      failed++;
      if (failedRows.length < MAX_SAMPLES) {
        failedRows.push({
          line: r.line,
          nama: r.row.nama,
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
    skipped,
    failed,
    skippedRows,
    failedRows,
  };

  return { ...base, message: formatMessage(base) };
}
