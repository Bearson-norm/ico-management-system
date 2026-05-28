import { parse } from 'csv-parse/sync';
import { detectDelimiter, normalizeNewlines } from './parseTabularPaste';

const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

function isGaStockOutHeaderLine(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    (lower.includes('quantity') || lower.includes('qty')) &&
    (lower.includes('tanggal') || lower.includes('pemakaian'))
  );
}

/** Baris data stock out: nama, qty, tanggal (DD/MM/YYYY), PIC */
function isGaStockOutNewRecordLine(line: string): boolean {
  if (isGaStockOutHeaderLine(line)) return true;
  const delimiter = line.includes('\t') ? '\t' : detectDelimiter(line);
  const parts = line.split(delimiter).map((p) => p.trim().replace(/^"|"$/g, ''));
  if (parts.length < 4) return false;
  return DATE_RE.test(parts[2] ?? '');
}

export function mergeGaStockOutBrokenLines(text: string): string {
  const lines = normalizeNewlines(text)
    .split('\n')
    .map((l) => l.trimEnd());

  const merged: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (merged.length === 0 || isGaStockOutNewRecordLine(trimmed)) {
      merged.push(trimmed);
    } else {
      const joiner = merged[merged.length - 1].includes('\t') ? '\t' : ' ';
      merged[merged.length - 1] += joiner + trimmed.replace(/\n/g, ' ');
    }
  }
  return merged.join('\n');
}

export function parseGaStockOutPaste(text: string): {
  records: Record<string, string>[];
  physicalLines: number;
  mergedLines: number;
} {
  const physicalLines = normalizeNewlines(text)
    .split('\n')
    .filter((l) => l.trim()).length;

  const mergedText = mergeGaStockOutBrokenLines(text);
  const mergedLines = mergedText.split('\n').filter((l) => l.trim()).length;
  const normalized = mergedText.trim();
  if (!normalized) {
    return { records: [], physicalLines, mergedLines: 0 };
  }

  const firstLine = normalized.split('\n')[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  const hasHeader = isGaStockOutHeaderLine(firstLine);

  const records = parse(normalized, {
    columns: hasHeader ? true : ['nama', 'qty', 'tanggal', 'picNama'],
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
    delimiter,
  }) as Record<string, string>[];

  return { records, physicalLines, mergedLines };
}
