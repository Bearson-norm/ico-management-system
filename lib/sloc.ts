export type ParsedSLOC = {
  rak: string;
  kolom: string;
  level: string;
  bin: string;
  valid: boolean;
};

const RACK_NUMBER_RE = /^[1-9]\d*$/;
const KOLOM_RE = /^[A-Za-z]+$/;
const SEGMENT_ALNUM_RE = /^[A-Za-z0-9]+$/;

/**
 * Parse SLOC formats:
 * - 4 segments: "1-A-1-1" -> rak: 1, kolom: A, level: 1, bin: 1
 * - 3 segments (no bin): "3-C-1" -> rak: 3, kolom: C, level: 1, bin: ""
 * - 2 segments (rack + kolom): "2-B" -> rak: 2, kolom: B, level: "", bin: ""
 * - 1 segment (numeric rack only): "2" -> rak: 2, kolom: "", level: "", bin: ""
 */
export function parseSLOC(sloc: string | null | undefined): ParsedSLOC {
  const raw = (sloc || '').trim();
  if (!raw) {
    return { rak: '?', kolom: '', level: '', bin: '', valid: false };
  }

  const p = raw.split('-').map((s) => s.trim());

  if (p.length >= 4 && p.slice(0, 4).every((seg) => SEGMENT_ALNUM_RE.test(seg))) {
    return {
      rak: p[0],
      kolom: p[1].toUpperCase(),
      level: p[2],
      bin: p[3],
      valid: true,
    };
  }

  if (
    p.length === 3 &&
    RACK_NUMBER_RE.test(p[0]) &&
    KOLOM_RE.test(p[1]) &&
    SEGMENT_ALNUM_RE.test(p[2])
  ) {
    return {
      rak: p[0],
      kolom: p[1].toUpperCase(),
      level: p[2],
      bin: '',
      valid: true,
    };
  }

  if (p.length === 2 && RACK_NUMBER_RE.test(p[0]) && KOLOM_RE.test(p[1])) {
    return {
      rak: p[0],
      kolom: p[1].toUpperCase(),
      level: '',
      bin: '',
      valid: true,
    };
  }

  if (p.length === 1 && RACK_NUMBER_RE.test(p[0])) {
    return {
      rak: p[0],
      kolom: '',
      level: '',
      bin: '',
      valid: true,
    };
  }

  return { rak: raw, kolom: '', level: '', bin: '', valid: false };
}

export function getRakGroupKey(lokasi: string | null | undefined, parsed?: ParsedSLOC): string {
  const p = parsed ?? parseSLOC(lokasi);
  return p.valid ? `Rak ${p.rak}` : (lokasi?.trim() || '(Tanpa Lokasi)');
}

export function getKolomGroupKey(parsed?: ParsedSLOC): string {
  return parsed?.valid && parsed.kolom ? `Kolom ${parsed.kolom}` : 'Lainnya';
}

export function countDistinctKolom(items: Array<{ _parsed?: ParsedSLOC }>): number {
  return new Set(items.map((i) => i._parsed?.kolom).filter(Boolean)).size;
}

export function compareRackSegment(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' });
}

export function compareParsedSLOC(
  pA?: ParsedSLOC,
  pB?: ParsedSLOC,
  rawA = '',
  rawB = ''
): number {
  if (!pA?.valid && !pB?.valid) return rawA.localeCompare(rawB, 'id');
  if (!pA?.valid) return 1;
  if (!pB?.valid) return -1;
  return (
    compareRackSegment(pA.rak, pB.rak) ||
    compareRackSegment(pA.kolom, pB.kolom) ||
    compareRackSegment(pA.level, pB.level) ||
    compareRackSegment(pA.bin, pB.bin)
  );
}
