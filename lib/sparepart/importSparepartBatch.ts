import type { PrismaClient } from '../generated/mtc';
import { recordToWebMasterRow, type SparepartWebMasterRow } from './masterCsv';

export type ImportRowIssue = {
  line: number;
  id?: string;
  reason: string;
};

export type ImportSparepartReport = {
  totalRows: number;
  /** Baris fisik di textarea sebelum digabung */
  physicalLines?: number;
  /** Baris setelah menggabungkan pecahan wrap */
  mergedLines?: number;
  success: number;
  skipped: number;
  failed: number;
  skippedRows: ImportRowIssue[];
  failedRows: ImportRowIssue[];
};

const MAX_SAMPLES = 30;

function peekIdFromRaw(row: Record<string, string>): string | undefined {
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase();
    if (k.includes('id') || k.includes('kode')) {
      const v = String(row[key] ?? '').trim();
      if (v) return v;
    }
  }
  return undefined;
}

function formatReportMessage(report: ImportSparepartReport): string {
  const { totalRows, success, skipped, failed } = report;
  let msg = 'Import selesai:\n';
  if (report.physicalLines != null && report.mergedLines != null) {
    msg += `📋 Baris di paste: ${report.physicalLines} → setelah perbaikan pecahan: ${report.mergedLines}\n`;
  }
  msg +=
    `📦 Baris data (ID valid): ${totalRows}\n` +
    `✅ Berhasil: ${success}\n` +
    `⏭️ Dilewati: ${skipped}\n` +
    `❌ Gagal: ${failed}`;

  if (report.skippedRows.length > 0) {
    msg += '\n\nContoh baris dilewati:';
    for (const s of report.skippedRows.slice(0, 8)) {
      msg += `\n• Baris ${s.line}${s.id ? ` [${s.id}]` : ''}: ${s.reason}`;
    }
    if (skipped > report.skippedRows.length) {
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

async function resolveKategoriId(
  prisma: PrismaClient,
  katMap: Map<string, number>,
  row: SparepartWebMasterRow,
  raw: Record<string, string>
): Promise<number | null> {
  const catName = row.kategoriNama;
  const catIdRaw =
    raw.kategoriid ??
    raw.kategori_id ??
    raw['kategori id'] ??
    raw.categoryid;

  if (catIdRaw && /^\d+$/.test(String(catIdRaw).trim())) {
    return parseInt(String(catIdRaw).trim(), 10);
  }

  if (!catName) return null;

  let kid = katMap.get(catName);
  if (kid == null) {
    const created = await prisma.kategori.create({
      data: { nama: catName, tipe: 'sparepart' },
    });
    kid = created.id;
    katMap.set(created.nama, created.id);
  }
  return kid;
}

export async function importSparepartBatch(
  prisma: PrismaClient,
  rawRecords: Record<string, string>[],
  parseMeta?: { physicalLines: number; mergedLines: number }
): Promise<ImportSparepartReport & { message: string }> {
  const kats = await prisma.kategori.findMany();
  const katMap = new Map(kats.map((k) => [k.nama, k.id]));

  const skippedRows: ImportRowIssue[] = [];
  const failedRows: ImportRowIssue[] = [];
  let success = 0;

  for (let i = 0; i < rawRecords.length; i++) {
    const line = i + 2;
    const raw = rawRecords[i];
    const hasContent = Object.values(raw).some((v) => String(v ?? '').trim() !== '');
    if (!hasContent) continue;

    const row = recordToWebMasterRow(raw);
    if (!row) {
      skippedRows.push({
        line,
        id: peekIdFromRaw(raw),
        reason:
          'Bukan baris data sparepart (ID harus format MTC-SP-001 atau serupa). Sering terjadi jika baris terpotong saat paste — coba paste ulang dari Excel.',
      });
      continue;
    }

    try {
      const kategoriId = await resolveKategoriId(prisma, katMap, row, raw);

      await prisma.sparepart.upsert({
        where: { id: row.id },
        create: {
          id: row.id,
          nama: row.nama || row.id,
          kategoriId,
          uom: row.uom,
          lokasi: row.lokasi,
          harga: row.harga,
          minQty: row.minQty,
          maxLeadTime: row.maxLeadTime,
          avgLeadTime: row.avgLeadTime,
        },
        update: {
          nama: row.nama || row.id,
          kategoriId,
          uom: row.uom,
          lokasi: row.lokasi,
          harga: row.harga,
          minQty: row.minQty,
          maxLeadTime: row.maxLeadTime,
          avgLeadTime: row.avgLeadTime,
        },
      });
      success++;
    } catch (e: unknown) {
      const reason =
        e instanceof Error ? e.message : typeof e === 'string' ? e : 'Error tidak diketahui';
      failedRows.push({ line, id: row.id, reason });
    }
  }

  const report: ImportSparepartReport = {
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
