export const KATEGORI_OUT_OPTIONS = [
  'Maintenance Produksi',
  'Utility',
  'WO',
] as const;

export type KategoriOut = (typeof KATEGORI_OUT_OPTIONS)[number];

export function isKategoriOut(val: unknown): val is KategoriOut {
  return typeof val === 'string' && (KATEGORI_OUT_OPTIONS as readonly string[]).includes(val);
}
