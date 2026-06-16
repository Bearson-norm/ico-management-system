export type GaDashboardItemRow = {
  id: string;
  nama: string;
  kodeBarang: string | null;
  lokasi: string;
  uom: string;
  minQty: number;
  maxQty: number | null;
  currentStock: number;
  outQtyPeriod: number;
  outCountPeriod: number;
  status: 'safe' | 'low' | 'habis' | 'overstock';
};

import { computeStockFromMovements } from '@/lib/ga/stockQty';

export type GaDashboardInsights = {
  periodDays: number;
  frequentOut: GaDashboardItemRow[];
  understock: GaDashboardItemRow[];
  rareOut: GaDashboardItemRow[];
  depleted: GaDashboardItemRow[];
  summary: {
    totalItems: number;
    totalStock: number;
    totalValue: number;
    totalLowStock: number;
    totalInPeriod: number;
    totalOutPeriod: number;
  };
};

type MovementSlice = { tipe: string; qty: number; tanggal: Date };

type ItemWithMovements = {
  id: string;
  nama: string;
  kodeBarang: string | null;
  lokasi: string | null;
  uom: string;
  minQty: number;
  maxQty: number | null;
  harga?: any;
  movements: MovementSlice[];
};

function stockStatus(currentStock: number, minQty: number, maxQty: number | null): 'safe' | 'low' | 'habis' | 'overstock' {
  if (currentStock <= 0) return 'habis';
  if (currentStock < minQty) return 'low';
  if (maxQty !== null && currentStock > maxQty) return 'overstock';
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
    maxQty: it.maxQty,
    currentStock,
    outQtyPeriod,
    outCountPeriod,
    status: stockStatus(currentStock, it.minQty, it.maxQty),
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

  let totalInPeriod = 0;
  let totalOutPeriod = 0;

  const enriched = items.map((it) => {
    let outQtyPeriod = 0;
    let outCountPeriod = 0;

    for (const m of it.movements) {
      if (m.tanggal >= since) {
        if (m.tipe === 'OUT') {
          outQtyPeriod += m.qty;
          outCountPeriod += 1;
          totalOutPeriod += m.qty;
        } else if (m.tipe === 'IN') {
          totalInPeriod += m.qty;
        }
      }
    }

    const currentStock = computeStockFromMovements(it.movements);
    return { it, currentStock, outQtyPeriod, outCountPeriod };
  });

  const totalItems = enriched.length;
  let totalStock = 0;
  let totalValue = 0;
  let totalLowStock = 0;

  for (const e of enriched) {
    totalStock += e.currentStock;
    const price = Number(e.it.harga || 0);
    totalValue += e.currentStock * price;
    if (e.currentStock < e.it.minQty || e.currentStock <= 0) {
      totalLowStock++;
    }
  }

  const frequentOut = enriched
    .filter((e) => e.outQtyPeriod > 0)
    .sort((a, b) => b.outQtyPeriod - a.outQtyPeriod || b.outCountPeriod - a.outCountPeriod)
    .slice(0, limit)
    .map((e) => toRow(e.it, e.currentStock, e.outQtyPeriod, e.outCountPeriod));

  const understock = enriched
    .filter((e) => e.currentStock < e.it.minQty || e.currentStock <= 0)
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

  const depleted = enriched
    .filter((e) => e.currentStock <= 0)
    .sort((a, b) => a.it.nama.localeCompare(b.it.nama))
    .slice(0, 15)
    .map((e) => toRow(e.it, e.currentStock, e.outQtyPeriod, e.outCountPeriod));

  return {
    periodDays,
    frequentOut,
    understock,
    rareOut,
    depleted,
    summary: {
      totalItems,
      totalStock,
      totalValue,
      totalLowStock,
      totalInPeriod,
      totalOutPeriod,
    },
  };
}

