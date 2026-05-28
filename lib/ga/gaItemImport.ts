import type { PrismaClient } from '@/lib/generated/ga';
import { parseIdrRpToNumber } from '@/lib/sparepart/masterCsv';
import { generateGaItemId } from '@/lib/utils-ga';

export type GaItemImportRow = {
  kodeBarang: string;
  nama: string;
  lokasi: string | null;
  minQty: number;
  harga: number;
};

export type ImportGaItemIssue = {
  line: number;
  kode?: string;
  reason: string;
};

export type ImportGaItemReport = {
  totalRows: number;
  physicalLines?: number;
  mergedLines?: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  skippedRows: ImportGaItemIssue[];
  failedRows: ImportGaItemIssue[];
  message: string;
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

export function recordToGaImportRow(row: Record<string, string>): GaItemImportRow | null {
  const kodeBarang = cell(row, 'kode barang', 'KODE BARANG', 'kode_barang', 'kode', 'Kode Barang')?.trim();
  if (!kodeBarang) return null;

  const nama =
    cell(row, 'nama barang', 'NAMA BARANG', 'nama', 'Nama Barang', 'name')?.trim() || kodeBarang;
  const lokasi = cell(row, 'lokasi', 'LOKASI', 'Lokasi')?.trim() ?? null;
  const minRaw = cell(row, 'min qty', 'Min Qty', 'min_qty', 'minqty', 'reorder', 'Reorder Point') ?? '0';
  const minQty = Math.max(0, Math.floor(Number(String(minRaw).replace(/,/g, '')) || 0));
  const harga = parseIdrRpToNumber(cell(row, 'harga', 'Harga', 'price', 'Harga Satuan'));

  return { kodeBarang, nama, lokasi, minQty, harga };
}

function formatMessage(report: Omit<ImportGaItemReport, 'message'>): string {
  let msg = 'Import database GA selesai:\n';
  if (report.physicalLines != null && report.mergedLines != null) {
    msg += `Baris di paste: ${report.physicalLines} → setelah perbaikan pecahan: ${report.mergedLines}\n`;
  }
  msg +=
    `Baris data: ${report.totalRows}\n` +
    `Baru: ${report.created}\n` +
    `Diperbarui: ${report.updated}\n` +
    `Dilewati: ${report.skipped}\n` +
    `Gagal: ${report.failed}`;

  if (report.skippedRows.length) {
    msg += '\n\nDilewati:';
    for (const s of report.skippedRows.slice(0, 8)) {
      msg += `\n• Baris ${s.line}${s.kode ? ` [${s.kode}]` : ''}: ${s.reason}`;
    }
  }
  if (report.failedRows.length) {
    msg += '\n\nGagal:';
    for (const f of report.failedRows.slice(0, 5)) {
      msg += `\n• Baris ${f.line}${f.kode ? ` [${f.kode}]` : ''}: ${f.reason}`;
    }
  }
  return msg;
}

export async function importGaItemBatch(
  prisma: PrismaClient,
  rawRecords: Record<string, string>[],
  parseMeta?: { physicalLines: number; mergedLines: number }
): Promise<ImportGaItemReport> {
  const skippedRows: ImportGaItemIssue[] = [];
  const failedRows: ImportGaItemIssue[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let totalRows = 0;

  const seenKode = new Set<string>();

  for (let i = 0; i < rawRecords.length; i++) {
    const line = i + 2;
    const raw = rawRecords[i];
    const hasContent = Object.values(raw).some((v) => String(v ?? '').trim() !== '');
    if (!hasContent) continue;

    totalRows++;
    const row = recordToGaImportRow(raw);
    if (!row) {
      skipped++;
      if (skippedRows.length < MAX_SAMPLES) {
        skippedRows.push({ line, reason: 'KODE BARANG kosong atau baris header tidak valid' });
      }
      continue;
    }

    const kodeKey = row.kodeBarang.toUpperCase();
    if (seenKode.has(kodeKey)) {
      skipped++;
      if (skippedRows.length < MAX_SAMPLES) {
        skippedRows.push({ line, kode: row.kodeBarang, reason: 'Kode duplikat dalam file yang sama' });
      }
      continue;
    }
    seenKode.add(kodeKey);

    try {
      const existing = await prisma.gaItem.findFirst({
        where: { kodeBarang: { equals: row.kodeBarang, mode: 'insensitive' } },
      });

      if (existing) {
        await prisma.gaItem.update({
          where: { id: existing.id },
          data: {
            nama: row.nama,
            lokasi: row.lokasi,
            minQty: row.minQty,
            harga: row.harga,
            aktif: true,
          },
        });
        updated++;
      } else {
        const id = await generateGaItemId(prisma);
        await prisma.gaItem.create({
          data: {
            id,
            nama: row.nama,
            kodeBarang: row.kodeBarang,
            lokasi: row.lokasi,
            minQty: row.minQty,
            harga: row.harga,
            uom: 'Pcs',
            aktif: true,
          },
        });
        created++;
      }
    } catch (e: unknown) {
      failed++;
      if (failedRows.length < MAX_SAMPLES) {
        failedRows.push({
          line,
          kode: row.kodeBarang,
          reason: e instanceof Error ? e.message : 'Gagal simpan',
        });
      }
    }
  }

  const base = {
    totalRows,
    physicalLines: parseMeta?.physicalLines,
    mergedLines: parseMeta?.mergedLines,
    created,
    updated,
    skipped,
    failed,
    skippedRows,
    failedRows,
  };

  return { ...base, message: formatMessage(base) };
}
