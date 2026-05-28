import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaAuth } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { GA_STOCK_MOVEMENT_TIPES, computeStockFromMovements } from '@/lib/ga/stockQty';

export async function GET(req: NextRequest) {
  const session = await requireGaAuth();
  if (!session) return err('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const lokasi = searchParams.get('lokasi') ?? '';
  const kategoriIdRaw = searchParams.get('kategoriId') ?? '';
  const aktifParam = searchParams.get('aktif') ?? 'true';

  const kategoriId = kategoriIdRaw ? parseInt(kategoriIdRaw, 10) : NaN;

  const aktifWhere =
    aktifParam === 'all' ? {} : aktifParam === 'false' ? { aktif: false } : { aktif: true };

  const items = await prismaGa.gaItem.findMany({
    where: {
      ...aktifWhere,
      ...(search
        ? {
            OR: [
              { nama: { contains: search, mode: 'insensitive' } },
              { kodeBarang: { contains: search, mode: 'insensitive' } },
              { id: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(lokasi ? { lokasi: { contains: lokasi, mode: 'insensitive' } } : {}),
      ...(Number.isFinite(kategoriId) ? { kategoriId } : {}),
    },
    include: {
      kategori: true,
      movements: { where: { tipe: { in: [...GA_STOCK_MOVEMENT_TIPES] } }, select: { tipe: true, qty: true } },
    },
    orderBy: { nama: 'asc' },
  });

  const result = items.map((it) => {
    const totalIn = it.movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
    const totalOut = it.movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + m.qty, 0);
    const currentStock = computeStockFromMovements(it.movements);
    let stockStatus: 'safe' | 'low' | 'habis';
    if (currentStock <= 0) stockStatus = 'habis';
    else if (currentStock < it.minQty) stockStatus = 'low';
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
  }).filter((it) => {
    if (!status) return true;
    return it.status === status;
  });

  return ok(result);
}
