import type { PrismaClient } from '@/lib/generated/ga';

export type GaStockInitialImportRow = {
  kodeBarang: string;
  nama: string;
  qty: number;
};

export type ImportGaStockInitialIssue = {
  line: number;
  kode?: string;
  nama?: string;
  reason: string;
};

export type ImportGaStockInitialReport = {
  totalRows: number;
  physicalLines?: number;
  mergedLines?: number;
  imported: number;
  skipped: number;
  failed: number;
  skippedRows: ImportGaStockInitialIssue[];
  failedRows: ImportGaStockInitialIssue[];
  message: string;
};

export type GaStockInitialImportOptions = {
  tanggal: Date;
  picNama: string;
  keterangan?: string;
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

export function recordToGaStockInitialRow(row: Record<string, string>): GaStockInitialImportRow | null {
  const kodeBarang = cell(row, 'kode barang', 'KODE BARANG', 'kode_barang', 'kode', 'Kode Barang')?.trim();
  if (!kodeBarang) return null;

  const nama =
    cell(row, 'nama barang', 'NAMA BARANG', 'nama', 'Nama Barang', 'name')?.trim() || kodeBarang;
  const qtyRaw = cell(row, 'qty', 'Qty', 'QTY', 'quantity', 'Quantity', 'jumlah', 'Jumlah') ?? '';
  const qty = Math.floor(Number(String(qtyRaw).replace(/,/g, '')) || 0);

  return { kodeBarang, nama, qty };
}

function currentStock(movements: { tipe: string; qty: number }[]): number {
  const totalIn = movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
  const totalOut = movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + m.qty, 0);
  return totalIn - totalOut;
}

function formatMessage(report: Omit<ImportGaStockInitialReport, 'message'>): string {
  let msg = 'Import saldo awal GA selesai:\n';
  if (report.physicalLines != null && report.mergedLines != null) {
    msg += `Baris di paste: ${report.physicalLines} → setelah perbaikan pecahan: ${report.mergedLines}\n`;
  }
  msg +=
    `Baris data: ${report.totalRows}\n` +
    `Stok masuk: ${report.imported}\n` +
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

export async function importGaStockInitialBatch(
  prisma: PrismaClient,
  rawRecords: Record<string, string>[],
  options: GaStockInitialImportOptions,
  parseMeta?: { physicalLines: number; mergedLines: number }
): Promise<ImportGaStockInitialReport> {
  const skippedRows: ImportGaStockInitialIssue[] = [];
  const failedRows: ImportGaStockInitialIssue[] = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let totalRows = 0;

  const seenKode = new Set<string>();
  const skipIfHasStock = options.skipIfHasStock !== false;
  const keterangan = options.keterangan?.trim() || 'Saldo awal';

  for (let i = 0; i < rawRecords.length; i++) {
    const line = i + 2;
    const raw = rawRecords[i];
    const hasContent = Object.values(raw).some((v) => String(v ?? '').trim() !== '');
    if (!hasContent) continue;

    totalRows++;
    const row = recordToGaStockInitialRow(raw);
    if (!row) {
      skipped++;
      if (skippedRows.length < MAX_SAMPLES) {
        skippedRows.push({ line, reason: 'KODE BARANG kosong atau baris header tidak valid' });
      }
      continue;
    }

    if (row.qty <= 0) {
      skipped++;
      if (skippedRows.length < MAX_SAMPLES) {
        skippedRows.push({
          line,
          kode: row.kodeBarang,
          nama: row.nama,
          reason: 'Qty kosong atau 0',
        });
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
      const item = await prisma.gaItem.findFirst({
        where: { kodeBarang: { equals: row.kodeBarang, mode: 'insensitive' } },
        include: { movements: { where: { tipe: { in: ['IN', 'OUT'] } }, select: { tipe: true, qty: true } } },
      });

      if (!item) {
        failed++;
        if (failedRows.length < MAX_SAMPLES) {
          failedRows.push({
            line,
            kode: row.kodeBarang,
            nama: row.nama,
            reason: 'Kode barang tidak ditemukan di database — import master dulu lewat Database GA',
          });
        }
        continue;
      }

      const stock = currentStock(item.movements);
      if (skipIfHasStock && stock > 0) {
        skipped++;
        if (skippedRows.length < MAX_SAMPLES) {
          skippedRows.push({
            line,
            kode: row.kodeBarang,
            reason: `Sudah punya stok (${stock}) — dilewati agar tidak dobel`,
          });
        }
        continue;
      }

      await prisma.gaStockMovement.create({
        data: {
          tipe: 'IN',
          item: { connect: { id: item.id } },
          namaBarang: item.nama,
          qty: row.qty,
          qtyDiterima: row.qty,
          tanggalTerima: options.tanggal,
          tanggal: options.tanggal,
          harga: item.harga,
          picNama: options.picNama,
          keterangan,
        },
      });
      imported++;
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
    imported,
    skipped,
    failed,
    skippedRows,
    failedRows,
  };

  return { ...base, message: formatMessage(base) };
}
