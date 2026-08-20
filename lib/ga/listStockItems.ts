import { prismaGa } from '@/lib/prisma-ga';
import { GA_STOCK_MOVEMENT_TIPES, computeStockFromMovements } from '@/lib/ga/stockQty';

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
};

export type GaStockListFilters = {
  search: string;
  status: string;
  lokasi: string;
  kategoriId: number | undefined;
  aktif: string;
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

  const items = await prismaGa.gaItem.findMany({
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
  });

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
      };
    })
    .filter((it) => {
      if (!filters.status) return true;
      if (filters.status === 'kritis') return it.status === 'low' || it.status === 'habis';
      return it.status === filters.status;
    });
}
