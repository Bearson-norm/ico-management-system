import { prismaGa } from '@/lib/prisma-ga';
import { getJakartaYmd, jakartaDateTime } from '@/lib/ga/jakartaDate';

export const SLOW_MOVING_THRESHOLD_KEY = 'ga_slow_moving_threshold';
export const DEFAULT_SLOW_MOVING_THRESHOLD = 5;

export type GaMovementClass = 'slow' | 'fast';

/** Awal hari Jakarta 29 hari lalu — jendela 30 hari kalender termasuk hari ini. */
export function last30DaysStartJakarta(now: Date = new Date()): Date {
  const { y, m, d } = getJakartaYmd(now);
  const todayStart = jakartaDateTime(y, m, d);
  return new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
}

export function parseSlowMovingThreshold(raw: string | null | undefined): number {
  if (raw == null || String(raw).trim() === '') return DEFAULT_SLOW_MOVING_THRESHOLD;
  const n = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_SLOW_MOVING_THRESHOLD;
  return n;
}

/** Validasi input admin: bilangan bulat ≥ 0, atau null jika tidak valid. */
export function parseSlowMovingThresholdInput(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < 0) return null;
    return raw;
  }
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export async function getSlowMovingThreshold(): Promise<number> {
  const row = await prismaGa.gaSetting.findUnique({
    where: { key: SLOW_MOVING_THRESHOLD_KEY },
  });
  return parseSlowMovingThreshold(row?.value);
}

export function classifyMovement(qtyOut30d: number, threshold: number): GaMovementClass {
  return qtyOut30d < threshold ? 'slow' : 'fast';
}

export function parseMovementClassParam(raw: string | null | undefined): GaMovementClass | '' {
  if (raw === 'slow' || raw === 'fast') return raw;
  return '';
}

export function gaMovementClassLabel(movementClass: GaMovementClass): string {
  return movementClass === 'slow' ? 'Slow Moving' : 'Fast Moving';
}

export function sumQtyOutSince(
  movements: { tipe: string; qty: number; tanggal: Date }[],
  since: Date
): number {
  return movements
    .filter((m) => m.tipe === 'OUT' && m.tanggal >= since)
    .reduce((sum, m) => sum + m.qty, 0);
}

export async function getQtyOutLast30DaysByItem(): Promise<Map<string, number>> {
  const since = last30DaysStartJakarta();
  const rows = await prismaGa.gaStockMovement.groupBy({
    by: ['itemId'],
    where: { tipe: 'OUT', itemId: { not: null }, tanggal: { gte: since } },
    _sum: { qty: true },
  });
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.itemId) map.set(row.itemId, row._sum.qty || 0);
  }
  return map;
}
