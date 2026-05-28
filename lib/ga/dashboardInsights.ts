export type GaDashboardItemRow = {
  id: string;
  nama: string;
  kodeBarang: string | null;
  lokasi: string;
  uom: string;
  minQty: number;
  currentStock: number;
  outQtyPeriod: number;
  outCountPeriod: number;
  status: 'safe' | 'low' | 'habis';
};

import { computeStockFromMovements } from '@/lib/ga/stockQty';

export type GaDashboardInsights = {
  periodDays: number;
  frequentOut: GaDashboardItemRow[];
  understock: GaDashboardItemRow[];
  rareOut: GaDashboardItemRow[];
};

type MovementSlice = { tipe: string; qty: number; tanggal: Date };

type ItemWithMovements = {
  id: string;
  nama: string;
  kodeBarang: string | null;
  lokasi: string | null;
  uom: string;
  minQty: number;
  movements: MovementSlice[];
};

function stockStatus(currentStock: number, minQty: number): 'safe' | 'low' | 'habis' {
  if (currentStock <= 0) return 'habis';
  if (currentStock < minQty) return 'low';
  return 'safe';
}

function toRow(
  it: ItemWithMovements,
  currentStock: number,
  outQtyPeriod: number,
  outCountPeriod: number
): GaDashboardItemRow {
  return {
    id: it.id,
    nama: it.nama,
    kodeBarang: it.kodeBarang,
    lokasi: it.lokasi ?? '—',
    uom: it.uom,
    minQty: it.minQty,
    currentStock,
    outQtyPeriod,
    outCountPeriod,
    status: stockStatus(currentStock, it.minQty),
  };
}

export function buildGaDashboardInsights(
  items: ItemWithMovements[],
  options?: { periodDays?: number; limit?: number }
): GaDashboardInsights {
  const periodDays = options?.periodDays ?? 90;
  const limit = options?.limit ?? 10;
  const since = new Date();
  since.setDate(since.getDate() - periodDays);
  since.setHours(0, 0, 0, 0);

  const enriched = items.map((it) => {
    let outQtyPeriod = 0;
    let outCountPeriod = 0;

    for (const m of it.movements) {
      if (m.tipe === 'OUT' && m.tanggal >= since) {
        outQtyPeriod += m.qty;
        outCountPeriod += 1;
      }
    }

    const currentStock = computeStockFromMovements(it.movements);
    return { it, currentStock, outQtyPeriod, outCountPeriod };
  });

  const frequentOut = enriched
    .filter((e) => e.outQtyPeriod > 0)
    .sort((a, b) => b.outQtyPeriod - a.outQtyPeriod || b.outCountPeriod - a.outCountPeriod)
    .slice(0, limit)
    .map((e) => toRow(e.it, e.currentStock, e.outQtyPeriod, e.outCountPeriod));

  const understock = enriched
    .filter((e) => e.currentStock < e.it.minQty)
    .sort(
      (a, b) =>
        a.currentStock - b.currentStock ||
        b.it.minQty - a.it.minQty - (a.currentStock - b.currentStock)
    )
    .slice(0, limit)
    .map((e) => toRow(e.it, e.currentStock, e.outQtyPeriod, e.outCountPeriod));

  const rareOut = enriched
    .sort(
      (a, b) =>
        a.outQtyPeriod - b.outQtyPeriod ||
        a.outCountPeriod - b.outCountPeriod ||
        b.currentStock - a.currentStock
    )
    .slice(0, limit)
    .map((e) => toRow(e.it, e.currentStock, e.outQtyPeriod, e.outCountPeriod));

  return { periodDays, frequentOut, understock, rareOut };
}
