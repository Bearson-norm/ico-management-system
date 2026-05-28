import type { PrismaClient as GaClient } from '@/lib/generated/ga';

type Tx = Omit<GaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export const GA_STOCK_MOVEMENT_TIPES = ['IN', 'OUT', 'ADJ'] as const;
export type GaStockMovementTipe = (typeof GA_STOCK_MOVEMENT_TIPES)[number];

export type GaMovementQty = { tipe: string; qty: number };

/** Stok = IN − OUT + ADJ (qty ADJ bertanda: + surplus, − shortage) */
export function computeStockFromMovements(movements: GaMovementQty[]): number {
  let stock = 0;
  for (const m of movements) {
    if (m.tipe === 'IN') stock += m.qty;
    else if (m.tipe === 'OUT') stock -= m.qty;
    else if (m.tipe === 'ADJ') stock += m.qty;
  }
  return stock;
}

/** Stok saat ini dari agregasi gerakan */
export async function getGaCurrentStock(db: Tx | GaClient, itemId: string): Promise<number> {
  const rows = await db.gaStockMovement.findMany({
    where: { itemId, tipe: { in: [...GA_STOCK_MOVEMENT_TIPES] } },
    select: { tipe: true, qty: true },
  });
  return computeStockFromMovements(rows);
}

export async function getGaCurrentStockMap(
  db: Tx | GaClient,
  itemIds: string[]
): Promise<Map<string, number>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db.gaStockMovement.findMany({
    where: { itemId: { in: itemIds }, tipe: { in: [...GA_STOCK_MOVEMENT_TIPES] } },
    select: { itemId: true, tipe: true, qty: true },
  });
  const map = new Map<string, number>();
  for (const id of itemIds) map.set(id, 0);
  const byItem = new Map<string, GaMovementQty[]>();
  for (const row of rows) {
    if (!row.itemId) continue;
    const list = byItem.get(row.itemId) ?? [];
    list.push({ tipe: row.tipe, qty: row.qty });
    byItem.set(row.itemId, list);
  }
  for (const [id, movs] of byItem) {
    map.set(id, computeStockFromMovements(movs));
  }
  return map;
}
