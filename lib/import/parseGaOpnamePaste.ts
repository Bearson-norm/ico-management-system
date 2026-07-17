import { parse } from 'csv-parse/sync';
import { detectDelimiter, normalizeNewlines } from './parseTabularPaste';

export type GaOpnamePasteRow = {
  nama: string;
  qty: number;
  picNama: string;
};

export type ParseGaOpnamePasteResult = {
  periodeNama: string | null;
  records: GaOpnamePasteRow[];
  physicalLines: number;
  mergedLines: number;
};

function isOpnameHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes('nama barang') &&
    (lower.includes('quantity') || lower.includes('qty')) &&
    lower.includes('pic')
  );
}

/** Baris data: Nama Barang | Quantity | PIC */
function isOpnameDataLine(line: string): boolean {
  if (isOpnameHeaderLine(line)) return false;
  const delimiter = line.includes('\t') ? '\t' : detectDelimiter(line);
  const parts = line.split(delimiter).map((p) => p.trim().replace(/^"|"$/g, ''));
  if (parts.length < 3) return false;
  const qtyRaw = parts[1] ?? '';
  if (qtyRaw === '' || !/^-?\d+$/.test(qtyRaw.replace(/,/g, ''))) return false;
  return Boolean(parts[2]?.trim());
}

function isOpnameNewRecordLine(line: string): boolean {
  return isOpnameHeaderLine(line) || isOpnameDataLine(line);
}

function isOpnamePeriodLine(line: string): boolean {
  if (isOpnameHeaderLine(line) || isOpnameDataLine(line)) return false;
  const first = line.split('\t')[0]?.trim().replace(/^"|"$/g, '');
  return Boolean(first);
}

export function mergeGaOpnameBrokenLines(text: string): string {
  const lines = normalizeNewlines(text)
    .split('\n')
    .map((l) => l.trimEnd());

  const merged: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (merged.length === 0 || isOpnameNewRecordLine(trimmed)) {
      merged.push(trimmed);
    } else {
      const joiner = merged[merged.length - 1].includes('\t') ? '\t' : ' ';
      merged[merged.length - 1] += joiner + trimmed.replace(/\n/g, ' ');
    }
  }
  return merged.join('\n');
}

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

function recordToOpnameRow(row: Record<string, string>): GaOpnamePasteRow | null {
  const nama =
    cell(row, 'Nama Barang', 'nama barang', 'NAMA BARANG', 'nama', 'barang')?.trim() ||
    Object.values(row).find((v) => String(v ?? '').trim() !== '')?.trim();
  if (!nama) return null;

  const qtyRaw = cell(row, 'Quantity', 'quantity', 'qty', 'Qty', 'QTY') ?? '';
  const qty = Math.max(0, Math.floor(Number(String(qtyRaw).replace(/,/g, '')) || 0));

  const picNama = cell(row, 'PIC', 'pic', 'Pic', 'NAMA', 'nama pic')?.trim();
  if (!picNama) return null;

  return { nama, qty, picNama };
}

export function parseGaOpnamePaste(text: string): ParseGaOpnamePasteResult {
  const physicalLines = normalizeNewlines(text)
    .split('\n')
    .filter((l) => l.trim()).length;

  const mergedText = mergeGaOpnameBrokenLines(text);
  const mergedLinesArr = mergedText.split('\n').filter((l) => l.trim());
  const mergedLines = mergedLinesArr.length;

  if (mergedLines === 0) {
    return { periodeNama: null, records: [], physicalLines, mergedLines: 0 };
  }

  let periodeNama: string | null = null;
  let startIdx = 0;

  if (isOpnamePeriodLine(mergedLinesArr[0])) {
    periodeNama =
      mergedLinesArr[0].split('\t')[0]?.trim().replace(/^"|"$/g, '') || null;
    startIdx = 1;
  }

  while (startIdx < mergedLinesArr.length && !isOpnameHeaderLine(mergedLinesArr[startIdx])) {
    if (isOpnameDataLine(mergedLinesArr[startIdx])) break;
    startIdx++;
  }

  const body = mergedLinesArr.slice(startIdx).join('\n').trim();
  if (!body) {
    return { periodeNama, records: [], physicalLines, mergedLines };
  }

  const firstLine = body.split('\n')[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const hasHeader = isOpnameHeaderLine(firstLine);

  const rawRecords = parse(body, {
    columns: hasHeader ? true : ['nama', 'qty', 'picNama'],
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    delimiter,
  }) as Record<string, string>[];

  const records: GaOpnamePasteRow[] = [];
  for (const row of rawRecords) {
    const parsed = recordToOpnameRow(row);
    if (parsed) records.push(parsed);
  }

  return { periodeNama, records, physicalLines, mergedLines };
}

/** Contoh format paste untuk modal import opname */
export const GA_OPNAME_IMPORT_SAMPLE = `April 2026
Nama Barang\tQuantity\tPIC
LABEL NIIMBOT D11 UKURAN 12 X 22 MM \t17\tSHERLY
PLASTIK KLIP UKURAN 25X16 ISI 100PCS\t0\tSHERLY
LABEL TOM & JERRY BULAT NO. 113 WARNA BIRU (PACK)\t25\tSHERLY
LABEL TOM & JERRY BULAT NO. 113 WARNA MERAH (PACK)\t25\tSHERLY
LABEL TOM & JERRY BULAT NO. 113 WARNA ORANGE (PACK)\t25\tSHERLY`;
