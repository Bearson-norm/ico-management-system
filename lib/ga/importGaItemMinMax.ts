import type { PrismaClient } from '@/lib/generated/ga';
import { parseGaMinMaxRecord } from '@/lib/import/parseGaItemPaste';

export type ImportRowIssue = {
  line: number;
  id?: string;
  reason: string;
};

export type ImportGaItemMinMaxReport = {
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

function formatReportMessage(report: Omit<ImportGaItemMinMaxReport, 'message'>): string {
  const { totalRows, success, skipped, failed } = report;
  let msg = 'Import selesai:\n';
  if (report.physicalLines != null && report.mergedLines != null) {
    msg += `📋 Baris di paste: ${report.physicalLines} → setelah perbaikan pecahan: ${report.mergedLines}\n`;
  }
  msg +=
    `📦 Baris data: ${totalRows}\n` +
    `✅ Berhasil diupdate: ${success}\n` +
    `⏭️ Dilewati: ${skipped}\n` +
    `❌ Gagal: ${failed}`;

  if (report.skippedRows.length > 0) {
    msg += '\n\nContoh baris dilewati:';
    for (const s of report.skippedRows.slice(0, 8)) {
      msg += `\n• Baris ${s.line}${s.id ? ` [${s.id}]` : ''}: ${s.reason}`;
    }
    if (skipped > Math.min(skipped, 8)) {
      msg += `\n… dan ${skipped - Math.min(skipped, 8)} lainnya (lihat konsol browser).`;
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

export async function importGaItemMinMax(
  prisma: PrismaClient,
  rawRecords: Record<string, string>[],
  parseMeta?: { physicalLines: number; mergedLines: number }
): Promise<ImportGaItemMinMaxReport> {
  const items = await prisma.gaItem.findMany({
    where: { kodeBarang: { not: null } },
    select: { id: true, kodeBarang: true },
  });

  const byKode = new Map<string, { id: string; kodeBarang: string }[]>();
  for (const it of items) {
    const key = (it.kodeBarang ?? '').trim().toLowerCase();
    if (!key) continue;
    const list = byKode.get(key) ?? [];
    list.push({ id: it.id, kodeBarang: it.kodeBarang ?? '' });
    byKode.set(key, list);
  }

  const skippedRows: ImportRowIssue[] = [];
  const failedRows: ImportRowIssue[] = [];
  let success = 0;
  let dataRows = 0;

  for (let i = 0; i < rawRecords.length; i++) {
    const line = i + 2;
    const parsed = parseGaMinMaxRecord(rawRecords[i]);
    if (parsed.kind === 'empty') continue;
    dataRows++;

    if (parsed.kind === 'no_kode') {
      skippedRows.push({ line, reason: 'Kolom Kode kosong' });
      continue;
    }

    if (parsed.kind === 'invalid') {
      failedRows.push({ line, id: parsed.kode, reason: parsed.reason });
      continue;
    }

    const { data } = parsed;
    const matches = byKode.get(data.kode.trim().toLowerCase()) ?? [];

    if (matches.length === 0) {
      skippedRows.push({
        line,
        id: data.kode,
        reason: `Kode "${data.kode}" tidak ditemukan di database`,
      });
      continue;
    }

    if (matches.length > 1) {
      skippedRows.push({
        line,
        id: data.kode,
        reason: `Kode "${data.kode}" tidak unik (${matches.length} barang)`,
      });
      continue;
    }

    try {
      await prisma.gaItem.update({
        where: { id: matches[0].id },
        data: {
          nama: data.nama,
          lokasi: data.lokasi,
          minQty: data.minQty,
          maxQty: data.maxQty,
        },
      });
      success++;
    } catch (e: unknown) {
      const reason =
        e instanceof Error ? e.message : typeof e === 'string' ? e : 'Error tidak diketahui';
      failedRows.push({ line, id: data.kode, reason });
    }
  }

  const reportBody = {
    totalRows: dataRows,
    physicalLines: parseMeta?.physicalLines,
    mergedLines: parseMeta?.mergedLines,
    success,
    skipped: skippedRows.length,
    failed: failedRows.length,
    skippedRows: skippedRows.slice(0, MAX_SAMPLES),
    failedRows: failedRows.slice(0, MAX_SAMPLES),
  };

  return { ...reportBody, message: formatReportMessage(reportBody) };
}
