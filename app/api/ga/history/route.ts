import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaAuth } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const session = await requireGaAuth();
  if (!session) return err('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = parseInt(searchParams.get('limit') ?? '30', 10);
  const search = searchParams.get('search') ?? '';
  const tipe = searchParams.get('tipe') ?? '';
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const sort = searchParams.get('sort') === 'asc' ? 'asc' : 'desc';

  const where = {
    ...(tipe ? { tipe: tipe as 'IN' | 'OUT' | 'ADJ' } : {}),
    ...(dateFrom || dateTo
      ? {
          tanggal: {
            ...(dateFrom ? { gte: new Date(dateFrom + 'T00:00:00') } : {}),
            ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59') } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { namaBarang: { contains: search, mode: 'insensitive' as const } },
            { picNama: { contains: search, mode: 'insensitive' as const } },
            { vendor: { contains: search, mode: 'insensitive' as const } },
            { purchaseType: { contains: search, mode: 'insensitive' as const } },
            { keterangan: { contains: search, mode: 'insensitive' as const } },
            { item: { nama: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prismaGa.gaStockMovement.findMany({
      where,
      include: { item: true },
      orderBy: [{ tanggal: sort }, { createdAt: sort }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prismaGa.gaStockMovement.count({ where }),
  ]);

  return ok({ data, total, page, limit });
}
