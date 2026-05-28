import type { PrismaClient } from '../generated/mtc';

export type MesinImportRow = {
  nama: string;
  tipe: string;
  area: string | null;
};

export type ImportRowIssue = {
  line: number;
  id?: string;
  reason: string;
};

export type ImportMesinReport = {
  totalRows: number;
  physicalLines?: number;
  mergedLines?: number;
  success: number;
  skipped: number;
  failed: number;
  skippedRows: ImportRowIssue[];
  failedRows: ImportRowIssue[];
  message: string;
};

const MAX_SAMPLES = 30;

const TIPE_ONLY = /^(sparepart|perbaikan|keduanya|spare\s*part)$/i;

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

/** Normalisasi tipe mesin ke nilai schema: sparepart | perbaikan | keduanya */
export function normalizeMesinTipe(raw: string | undefined): string {
  const t = (raw ?? '').trim().toLowerCase();
  if (!t) return 'keduanya';
  if (t === 'sparepart' || t === 'spare part' || t === 'sp') return 'sparepart';
  if (t === 'perbaikan' || t === 'repair' || t === 'maintenance' || t === 'mtc') return 'perbaikan';
  if (t === 'keduanya' || t === 'both' || t === 'semua' || t === 'all') return 'keduanya';
  return 'keduanya';
}

export function recordToMesinRow(row: Record<string, string>): MesinImportRow | null {
  const nama = cell(row, 'nama', 'Nama', 'name', 'mesin', 'Mesin', 'nama mesin')?.trim();
  if (!nama || nama.length < 2 || TIPE_ONLY.test(nama)) return null;

  const tipeRaw = cell(row, 'tipe', 'Tipe', 'type', 'jenis', 'Jenis');
  if (
    (nama.toLowerCase() === 'nama' || nama.toLowerCase() === 'name') &&
    (!tipeRaw || tipeRaw.toLowerCase() === 'tipe' || tipeRaw.toLowerCase() === 'type')
  ) {
    return null;
  }

  const areaRaw = cell(row, 'area', 'Area', 'lokasi', 'Lokasi', 'gedung', 'Gedung');

  return {
    nama,
    tipe: normalizeMesinTipe(tipeRaw),
    area: areaRaw?.trim() || null,
  };
}

function formatReportMessage(report: Omit<ImportMesinReport, 'message'>): string {
  let msg = 'Import mesin selesai:\n';
  if (report.physicalLines != null && report.mergedLines != null) {
    msg += `📋 Baris di paste: ${report.physicalLines} → setelah perbaikan pecahan: ${report.mergedLines}\n`;
  }
  msg +=
    `📦 Baris data: ${report.totalRows}\n` +
    `✅ Berhasil: ${report.success}\n` +
    `⏭️ Dilewati: ${report.skipped}\n` +
    `❌ Gagal: ${report.failed}`;

  if (report.skippedRows.length > 0) {
    msg += '\n\nContoh baris dilewati:';
    for (const s of report.skippedRows.slice(0, 8)) {
      msg += `\n• Baris ${s.line}${s.id ? ` [${s.id}]` : ''}: ${s.reason}`;
    }
  }
  if (report.failedRows.length > 0) {
    msg += '\n\nContoh baris gagal:';
    for (const f of report.failedRows.slice(0, 5)) {
      msg += `\n• Baris ${f.line}${f.id ? ` [${f.id}]` : ''}: ${f.reason}`;
    }
  }
  return msg;
}

export async function importMesinBatch(
  prisma: PrismaClient,
  rawRecords: Record<string, string>[],
  parseMeta?: { physicalLines: number; mergedLines: number }
): Promise<ImportMesinReport> {
  const skippedRows: ImportRowIssue[] = [];
  const failedRows: ImportRowIssue[] = [];
  let success = 0;

  for (let i = 0; i < rawRecords.length; i++) {
    const line = i + 2;
    const raw = rawRecords[i];
    const hasContent = Object.values(raw).some((v) => String(v ?? '').trim() !== '');
    if (!hasContent) continue;

    const row = recordToMesinRow(raw);
    if (!row) {
      const peek = cell(raw, 'nama', 'Nama', 'name') ?? Object.values(raw)[0];
      skippedRows.push({
        line,
        id: peek,
        reason: 'Kolom nama kosong atau tidak valid. Pastikan format: nama [tab] tipe [tab] area',
      });
      continue;
    }

    try {
      await prisma.mesin.upsert({
        where: { nama: row.nama },
        update: {
          area: row.area,
          tipe: row.tipe,
          aktif: true,
        },
        create: {
          nama: row.nama,
          area: row.area,
          tipe: row.tipe,
          aktif: true,
        },
      });
      success++;
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : 'Gagal simpan';
      failedRows.push({ line, id: row.nama, reason });
    }
  }

  const report = {
    totalRows: rawRecords.length,
    physicalLines: parseMeta?.physicalLines,
    mergedLines: parseMeta?.mergedLines,
    success,
    skipped: skippedRows.length,
    failed: failedRows.length,
    skippedRows: skippedRows.slice(0, MAX_SAMPLES),
    failedRows: failedRows.slice(0, MAX_SAMPLES),
  };

  return { ...report, message: formatReportMessage(report) };
}
