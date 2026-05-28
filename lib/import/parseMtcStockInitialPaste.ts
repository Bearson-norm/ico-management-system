import { parse } from 'csv-parse/sync';
import { detectDelimiter, normalizeNewlines } from './parseTabularPaste';

function isHeaderLine(line: string): boolean {
  const first = line.split('\t')[0]?.trim().toLowerCase() ?? '';
  return first === 'id' || first === 'item id' || first === 'itemid';
}

function isNewRecordLine(line: string): boolean {
  if (isHeaderLine(line)) return true;
  return /^MTC-SP-\d+/i.test(line.trim());
}

export function mergeMtcStockInitialBrokenLines(text: string): string {
  const lines = normalizeNewlines(text)
    .split('\n')
    .map((l) => l.trimEnd());

  const merged: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (merged.length === 0 || isNewRecordLine(trimmed)) {
      merged.push(trimmed);
    } else {
      const joiner = merged[merged.length - 1].includes('\t') ? '\t' : ' ';
      merged[merged.length - 1] += joiner + trimmed.replace(/\n/g, ' ');
    }
  }
  return merged.join('\n');
}

export function parseMtcStockInitialPaste(text: string): {
  records: Record<string, string>[];
  physicalLines: number;
  mergedLines: number;
} {
  const physicalLines = normalizeNewlines(text)
    .split('\n')
    .filter((l) => l.trim()).length;

  const mergedText = mergeMtcStockInitialBrokenLines(text);
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
