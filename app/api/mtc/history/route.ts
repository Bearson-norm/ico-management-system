import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const session = await requireMtcAuth();
  if (!session) return err('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '30');
  const search = searchParams.get('search') ?? '';
  const tipe = searchParams.get('tipe') ?? '';
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const where = {
    ...(tipe ? { tipe: tipe as 'IN' | 'OUT' | 'LOG' } : {}),
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
            { namaItem: { contains: search, mode: 'insensitive' as const } },
            { noReport: { contains: search, mode: 'insensitive' as const } },
            { keterangan: { contains: search, mode: 'insensitive' as const } },
            { sparepart: { nama: { contains: search, mode: 'insensitive' as const } } },
            { pic: { nama: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: { sparepart: true, pic: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return ok({ data, total, page, limit });
}
