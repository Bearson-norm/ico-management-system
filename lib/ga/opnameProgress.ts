export type LokasiProgress = {
  lokasi: string;
  total: number;
  counted: number;
  complete: boolean;
};

export const LOKASI_TANPA = '(Tanpa lokasi)';
export const LOKASI_ALL = '__all__';

export function normalizeLokasiKey(lokasi: string | null | undefined): string {
  const t = lokasi?.trim();
  if (!t || t === '—') return LOKASI_TANPA;
  return t;
}

export function buildLokasiProgress(
  lines: { lokasi: string; counted: boolean }[]
): LokasiProgress[] {
  const map = new Map<string, { total: number; counted: number }>();
  for (const l of lines) {
    const key = normalizeLokasiKey(l.lokasi);
    const cur = map.get(key) ?? { total: 0, counted: 0 };
    cur.total += 1;
    if (l.counted) cur.counted += 1;
    map.set(key, cur);
  }
  return Array.from(map.entries())
    .map(([lokasi, s]) => ({
      lokasi,
      total: s.total,
      counted: s.counted,
      complete: s.counted === s.total,
    }))
    .sort((a, b) => a.lokasi.localeCompare(b.lokasi, 'id'));
}

export function formatIncompleteLokasiMessage(progress: LokasiProgress[]): string {
  const pending = progress.filter((p) => !p.complete);
  if (pending.length === 0) return '';
  const parts = pending.map((p) => `${p.lokasi} (${p.counted}/${p.total})`);
  return `Gedung belum selesai: ${parts.join(', ')}`;
}
