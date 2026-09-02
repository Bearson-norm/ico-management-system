import type { PrismaClient } from '@/lib/generated/ga';
import type { GaOpnamePasteRow } from '@/lib/import/parseGaOpnamePaste';
import { updateOpnameLines } from '@/lib/ga/opnameService';

export type ImportGaOpnameIssue = {
  line: number;
  nama?: string;
  reason: string;
};

export type ImportGaOpnameReport = {
  totalRows: number;
  physicalLines?: number;
  mergedLines?: number;
  periodeNama: string | null;
  periodeMismatch: boolean;
  imported: number;
  skipped: number;
  failed: number;
  skippedRows: ImportGaOpnameIssue[];
  failedRows: ImportGaOpnameIssue[];
  message: string;
};

const MAX_SAMPLES = 30;

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

type LineRef = { id: number; nama: string };

function pushIndex(map: Map<string, LineRef[]>, raw: string | null | undefined, ref: LineRef) {
  const key = raw ? normalizeName(raw) : '';
  if (!key) return;
  const list = map.get(key) ?? [];
  list.push(ref);
  map.set(key, list);
}

/** Urutan: itemId, lalu kodeBarang, lalu nama (dinormalisasi). */
function resolveLineMatches(
  row: GaOpnamePasteRow,
  byItemId: Map<string, LineRef[]>,
  byKode: Map<string, LineRef[]>,
  byName: Map<string, LineRef[]>
): LineRef[] | undefined {
  const tokens = [row.kode, row.nama].filter((s): s is string => Boolean(s?.trim()));
  for (const raw of tokens) {
    const hits = byItemId.get(normalizeName(raw));
    if (hits?.length) return hits;
  }
  for (const raw of tokens) {
    const hits = byKode.get(normalizeName(raw));
    if (hits?.length) return hits;
  }
  return byName.get(normalizeName(row.nama));
}

function formatMessage(report: Omit<ImportGaOpnameReport, 'message'>): string {
  let msg = 'Import opname selesai:\n';
  if (report.physicalLines != null && report.mergedLines != null) {
    msg += `Baris di paste: ${report.physicalLines} → setelah perbaikan pecahan: ${report.mergedLines}\n`;
  }
  if (report.periodeNama) {
    msg += `Periode di paste: ${report.periodeNama}`;
    if (report.periodeMismatch) msg += ' (tidak cocok dengan sesi ini)';
    msg += '\n';
  }
  msg +=
    `Baris data: ${report.totalRows}\n` +
    `Diisi: ${report.imported}\n` +
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

export async function importGaOpnameBatch(
  prisma: PrismaClient,
  sessionId: number,
  rows: GaOpnamePasteRow[],
  meta?: {
    periodeNama?: string | null;
    sessionPeriodeNama?: string;
    physicalLines?: number;
    mergedLines?: number;
  }
): Promise<ImportGaOpnameReport> {
  const session = await prisma.gaOpnameSession.findUnique({
    where: { id: sessionId },
    select: { status: true, periodeNama: true },
  });
  if (!session) throw new Error('Sesi opname tidak ditemukan');
  if (session.status === 'posted') throw new Error('Sesi sudah diposting, tidak bisa import');

  const lineRows = await prisma.gaOpnameLine.findMany({
    where: { sessionId },
    include: { item: { select: { nama: true, kodeBarang: true } } },
  });

  const byItemId = new Map<string, LineRef[]>();
  const byKode = new Map<string, LineRef[]>();
  const byName = new Map<string, LineRef[]>();
  for (const line of lineRows) {
    const ref: LineRef = { id: line.id, nama: line.item.nama };
    pushIndex(byItemId, line.itemId, ref);
    pushIndex(byKode, line.item.kodeBarang, ref);
    pushIndex(byName, line.item.nama, ref);
  }

  const skippedRows: ImportGaOpnameIssue[] = [];
  const failedRows: ImportGaOpnameIssue[] = [];
  const updates: { id: number; qtyFisik: number; picNama: string }[] = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  const pastePeriode = meta?.periodeNama?.trim() || null;
  const sessionPeriode = meta?.sessionPeriodeNama ?? session.periodeNama;
  const periodeMismatch = Boolean(
    pastePeriode &&
      normalizeName(pastePeriode) !== normalizeName(sessionPeriode)
  );

  for (let i = 0; i < rows.length; i++) {
    const lineNo = i + 1;
    const row = rows[i];
    const matches = resolveLineMatches(row, byItemId, byKode, byName);

    if (!matches?.length) {
      skipped++;
      if (skippedRows.length < MAX_SAMPLES) {
        skippedRows.push({
          line: lineNo,
          nama: row.nama,
          reason: 'Barang tidak ditemukan di sesi opname ini (nama/kode/ID)',
        });
      }
      continue;
    }

    if (matches.length > 1) {
      skipped++;
      if (skippedRows.length < MAX_SAMPLES) {
        skippedRows.push({
          line: lineNo,
          nama: row.nama,
          reason: 'Barang ambigu (lebih dari 1 item di sesi)',
        });
      }
      continue;
    }

    updates.push({
      id: matches[0].id,
      qtyFisik: row.qty,
      picNama: row.picNama.trim(),
    });
    imported++;
  }

  if (updates.length > 0) {
    try {
      await updateOpnameLines(
        sessionId,
        updates.map((u) => ({
          id: u.id,
          qtyFisik: u.qtyFisik,
          picNama: u.picNama,
        }))
      );
    } catch (e: unknown) {
      failed = updates.length;
      imported = 0;
      if (failedRows.length < MAX_SAMPLES) {
        failedRows.push({
          line: 0,
          reason: e instanceof Error ? e.message : 'Gagal menyimpan ke database',
        });
      }
    }
  }

  const base = {
    totalRows: rows.length,
    physicalLines: meta?.physicalLines,
    mergedLines: meta?.mergedLines,
    periodeNama: pastePeriode,
    periodeMismatch,
    imported,
    skipped,
    failed,
    skippedRows,
    failedRows,
  };

  return { ...base, message: formatMessage(base) };
}
