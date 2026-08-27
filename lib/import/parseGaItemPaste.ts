import { parse } from 'csv-parse/sync';
import { detectDelimiter, normalizeNewlines } from './parseTabularPaste';

function isGaHeaderLine(line: string): boolean {
  const delimiter = line.includes('\t') ? '\t' : detectDelimiter(line);
  const cells = line.split(delimiter).map((c) => c.trim().toLowerCase());
  const first = cells[0] ?? '';
  if (
    first === 'nama barang' ||
    first === 'kode barang' ||
    first === 'nama' ||
    first === 'no' ||
    first === 'kode'
  ) {
    return true;
  }
  return cells.some((c) => c === 'kode' || c === 'kode barang') &&
    cells.some((c) => c === 'min' || c === 'min qty' || c === 'nama' || c === 'nama barang');
}

/** Baris data GA: header, tab-separated, atau CSV min/max (No, Kode, Nama, Lokasi, Min, Max) */
function isGaNewRecordLine(line: string): boolean {
  if (isGaHeaderLine(line)) return true;
  const tabs = (line.match(/\t/g) || []).length;
  if (tabs >= 3) return true;
  if (/\t[A-Z0-9]{3,}\t/i.test(line)) return true;
  const delimiter = detectDelimiter(line);
  if (delimiter !== '\t') {
    const parts = line.split(delimiter).map((p) => p.trim());
    if (parts.length >= 5) return true;
  }
  return false;
}

export function mergeGaBrokenPasteLines(text: string): string {
  const lines = normalizeNewlines(text)
    .split('\n')
    .map((l) => l.trimEnd());

  const merged: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (merged.length === 0 || isGaNewRecordLine(trimmed)) {
      merged.push(trimmed);
    } else {
      const joiner = merged[merged.length - 1].includes('\t') ? '\t' : ' ';
      merged[merged.length - 1] += joiner + trimmed.replace(/\n/g, ' ');
    }
  }
  return merged.join('\n');
}

export function parseGaItemPaste(text: string): {
  records: Record<string, string>[];
  physicalLines: number;
  mergedLines: number;
} {
  const physicalLines = normalizeNewlines(text)
    .split('\n')
    .filter((l) => l.trim()).length;

  const mergedText = mergeGaBrokenPasteLines(text);
  const mergedLines = mergedText.split('\n').filter((l) => l.trim()).length;
  const normalized = mergedText.trim();
  if (!normalized) {
    return { records: [], physicalLines, mergedLines: 0 };
  }

  const firstLine = normalized.split('\n')[0] ?? '';
  const delimiter = detectDelimiter(firstLine);

  const records = parse(normalized, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    delimiter,
  }) as Record<string, string>[];

  return { records, physicalLines, mergedLines };
}

export type GaItemMinMaxRow = {
  kode: string;
  nama: string;
  lokasi: string | null;
  minQty: number;
  maxQty: number | null;
};

export type GaItemMinMaxParseResult =
  | { kind: 'empty' }
  | { kind: 'no_kode' }
  | { kind: 'invalid'; kode?: string; reason: string }
  | { kind: 'ok'; data: GaItemMinMaxRow };

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

function parseNonNegInt(raw: string): number | null {
  const cleaned = String(raw).replace(/,/g, '').replace(/\s/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Math.floor(Number(cleaned));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function parseGaMinMaxRecord(row: Record<string, string>): GaItemMinMaxParseResult {
  const hasContent = Object.values(row).some((v) => String(v ?? '').trim() !== '');
  if (!hasContent) return { kind: 'empty' };

  const kode = cell(row, 'Kode', 'kode', 'Kode Barang', 'kode barang', 'kode_barang')?.trim();
  if (!kode) return { kind: 'no_kode' };

  const nama = cell(row, 'Nama Barang', 'Nama', 'nama barang', 'nama')?.trim();
  if (!nama) {
    return { kind: 'invalid', kode, reason: 'Nama barang wajib diisi' };
  }

  const lokasiRaw = cell(row, 'Lokasi', 'lokasi')?.trim();
  const lokasi = lokasiRaw ? lokasiRaw : null;

  const minRaw = cell(row, 'Min', 'Min Qty', 'minQty', 'min_qty', 'min qty', 'Reorder', 'Reorder Point');
  if (minRaw == null || minRaw === '') {
    return { kind: 'invalid', kode, reason: 'Min wajib diisi' };
  }
  const minQty = parseNonNegInt(minRaw);
  if (minQty == null) {
    return { kind: 'invalid', kode, reason: `Min tidak valid: "${minRaw}"` };
  }

  const maxRaw = cell(row, 'Max', 'Max Qty', 'maxQty', 'max_qty', 'max qty');
  let maxQty: number | null = null;
  if (maxRaw != null && maxRaw !== '') {
    const parsedMax = parseNonNegInt(maxRaw);
    if (parsedMax == null) {
      return { kind: 'invalid', kode, reason: `Max tidak valid: "${maxRaw}"` };
    }
    maxQty = parsedMax;
  }

  if (maxQty != null && maxQty < minQty) {
    return { kind: 'invalid', kode, reason: `Max (${maxQty}) harus ≥ Min (${minQty})` };
  }

  return { kind: 'ok', data: { kode, nama, lokasi, minQty, maxQty } };
}
