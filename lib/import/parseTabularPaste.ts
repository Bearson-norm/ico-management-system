import { parse } from 'csv-parse/sync';

/** Baris data sparepart MTC dimulai dengan pola ini (bukan sisa kata terpotong). */
export const SPAREPART_ROW_START = /^MTC-SP-\d+\b/i;

export function normalizeNewlines(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

const TIPE_ONLY = /^(sparepart|perbaikan|keduanya|spare\s*part)$/i;

function isSparepartHeaderLine(line: string): boolean {
  const first = line.split('\t')[0]?.trim().toLowerCase() ?? '';
  return first === 'id' || first === 'item id' || first === 'itemid';
}

function isMesinHeaderLine(line: string): boolean {
  const first = line.split('\t')[0]?.trim().toLowerCase() ?? '';
  return first === 'nama' || first === 'name' || first === 'mesin';
}

function isMesinNewRecordLine(line: string): boolean {
  if (isMesinHeaderLine(line)) return true;
  if (!line.includes('\t')) return false;
  const first = line.split('\t')[0]?.trim() ?? '';
  if (!first || first.length < 2 || TIPE_ONLY.test(first)) return false;
  return true;
}

function isSparepartNewRecordLine(line: string): boolean {
  return (
    isSparepartHeaderLine(line) ||
    SPAREPART_ROW_START.test(line) ||
    (/^[A-Z0-9][A-Z0-9_-]*\t/i.test(line) && line.includes('\t'))
  );
}

export type PasteMergeKind = 'sparepart' | 'mesin';

/**
 * Gabungkan baris sisa wrap/pecahan ke baris sebelumnya.
 * Excel paste di textarea kadang memecah satu baris jadi 2+ baris fisik.
 */
export function mergeBrokenPasteLines(text: string, kind: PasteMergeKind = 'sparepart'): string {
  const lines = normalizeNewlines(text)
    .split('\n')
    .map((l) => l.trimEnd());

  const merged: string[] = [];
  const isNewRecord = kind === 'mesin' ? isMesinNewRecordLine : isSparepartNewRecordLine;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (merged.length === 0 || isNewRecord(trimmed)) {
      merged.push(trimmed);
    } else {
      const joiner = merged[merged.length - 1].includes('\t') ? '\t' : ' ';
      merged[merged.length - 1] += joiner + trimmed.replace(/\n/g, ' ');
    }
  }

  return merged.join('\n');
}

/** Deteksi pemisah — jika header pakai tab, selalu tab (harga Rp6,500,000 aman). */
export function detectDelimiter(headerLine: string): string {
  if (headerLine.includes('\t')) return '\t';
  const tabs = (headerLine.match(/\t/g) || []).length;
  const semis = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  if (tabs > 0 && tabs >= commas && tabs >= semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

export function parseTabularPaste(text: string): Record<string, string>[] {
  const normalized = normalizeNewlines(text).trim();
  if (!normalized) return [];

  const firstLine = normalized.split('\n')[0] ?? '';
  const delimiter = detectDelimiter(firstLine);

  try {
    return parse(normalized, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
      delimiter,
    }) as Record<string, string>[];
  } catch {
    const lines = normalized.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(delimiter).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(delimiter);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        if (values[i] !== undefined) obj[h] = values[i].trim();
      });
      return obj;
    });
  }
}

/** Parse khusus sparepart: gabung baris pecah + paksa tab bila header ber-tab. */
export function parseSparepartPaste(text: string): {
  records: Record<string, string>[];
  physicalLines: number;
  mergedLines: number;
} {
  const physicalLines = normalizeNewlines(text)
    .split('\n')
    .filter((l) => l.trim()).length;

  return parsePasteWithMerge(text, 'sparepart');
}

function parsePasteWithMerge(
  text: string,
  kind: PasteMergeKind
): {
  records: Record<string, string>[];
  physicalLines: number;
  mergedLines: number;
} {
  const physicalLines = normalizeNewlines(text)
    .split('\n')
    .filter((l) => l.trim()).length;

  const mergedText = mergeBrokenPasteLines(text, kind);
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

/** Parse paste master mesin: tab dari Excel, gabung baris pecah, area boleh ada spasi. */
export function parseMesinPaste(text: string): {
  records: Record<string, string>[];
  physicalLines: number;
  mergedLines: number;
} {
  return parsePasteWithMerge(text, 'mesin');
}
