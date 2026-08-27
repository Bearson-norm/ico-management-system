import { prismaGa } from '@/lib/prisma-ga';
import { GA_STOCK_MOVEMENT_TIPES, computeStockFromMovements } from '@/lib/ga/stockQty';
import {
  classifyMovement,
  getQtyOutLast30DaysByItem,
  getSlowMovingThreshold,
  parseMovementClassParam,
  type GaMovementClass,
} from '@/lib/ga/movementClass';

export type GaStockStatus = 'safe' | 'low' | 'habis' | 'overstock';

export type GaStockItem = {
  id: string;
  nama: string;
  kodeBarang: string | null;
  kategoriId: number | null;
  kategori: string;
  lokasi: string;
  uom: string;
  harga: number;
  minQty: number;
  maxQty: number | null;
  aktif: boolean;
  totalIn: number;
  totalOut: number;
  currentStock: number;
  status: GaStockStatus;
  qtyOut30d: number;
  movementClass: GaMovementClass;
  slowMovingThreshold: number;
};

export type GaStockListFilters = {
  search: string;
  status: string;
  lokasi: string;
  kategoriId: number | undefined;
  aktif: string;
  movementClass: GaMovementClass | '';
};

export function parseGaStockListFilters(searchParams: URLSearchParams): GaStockListFilters {
  const kategoriIdRaw = searchParams.get('kategoriId') ?? '';
  const kategoriId = kategoriIdRaw ? parseInt(kategoriIdRaw, 10) : NaN;
  return {
    search: searchParams.get('search') ?? '',
    status: searchParams.get('status') ?? '',
    lokasi: searchParams.get('lokasi') ?? '',
    kategoriId: Number.isFinite(kategoriId) ? kategoriId : undefined,
    aktif: searchParams.get('aktif') ?? 'true',
    movementClass: parseMovementClassParam(searchParams.get('movementClass')),
  };
}

export function gaStockStatusLabel(status: GaStockStatus): string {
  if (status === 'habis') return 'Habis';
  if (status === 'low') return 'Understock';
  if (status === 'overstock') return 'Overstock';
  return 'Aman';
}

export async function listGaStockItems(filters: GaStockListFilters): Promise<GaStockItem[]> {
  const aktifWhere =
    filters.aktif === 'all' ? {} : filters.aktif === 'false' ? { aktif: false } : { aktif: true };

  const [items, threshold, qtyOutByItem] = await Promise.all([
    prismaGa.gaItem.findMany({
      where: {
        ...aktifWhere,
        ...(filters.search
          ? {
              OR: [
                { nama: { contains: filters.search, mode: 'insensitive' } },
                { kodeBarang: { contains: filters.search, mode: 'insensitive' } },
                { id: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(filters.lokasi ? { lokasi: { contains: filters.lokasi, mode: 'insensitive' } } : {}),
        ...(filters.kategoriId != null ? { kategoriId: filters.kategoriId } : {}),
      },
      include: {
        kategori: true,
        movements: { where: { tipe: { in: [...GA_STOCK_MOVEMENT_TIPES] } }, select: { tipe: true, qty: true } },
      },
      orderBy: { nama: 'asc' },
    }),
    getSlowMovingThreshold(),
    getQtyOutLast30DaysByItem(),
  ]);

  return items
    .map((it) => {
      const totalIn = it.movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
      const totalOut = it.movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + m.qty, 0);
      const currentStock = computeStockFromMovements(it.movements);
      let stockStatus: GaStockStatus;
      if (currentStock <= 0) stockStatus = 'habis';
      else if (currentStock < it.minQty) stockStatus = 'low';
      else if (it.maxQty !== null && currentStock > it.maxQty) stockStatus = 'overstock';
      else stockStatus = 'safe';
      const qtyOut30d = qtyOutByItem.get(it.id) ?? 0;
      const movementClass = classifyMovement(qtyOut30d, threshold);
      return {
        id: it.id,
        nama: it.nama,
        kodeBarang: it.kodeBarang,
        kategoriId: it.kategoriId,
        kategori: it.kategori?.nama ?? '—',
        lokasi: it.lokasi ?? '—',
        uom: it.uom,
        harga: Number(it.harga),
        minQty: it.minQty,
        maxQty: it.maxQty,
        aktif: it.aktif,
        totalIn,
        totalOut,
        currentStock,
        status: stockStatus,
        qtyOut30d,
        movementClass,
        slowMovingThreshold: threshold,
      };
    })
    .filter((it) => {
      if (filters.status) {
        if (filters.status === 'kritis') {
          if (!(it.status === 'low' || it.status === 'habis')) return false;
        } else if (it.status !== filters.status) {
          return false;
        }
      }
      if (filters.movementClass && it.movementClass !== filters.movementClass) return false;
      return true;
    });
}
