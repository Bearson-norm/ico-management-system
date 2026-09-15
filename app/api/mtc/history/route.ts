import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { historyOrderBy, parseHistorySort } from '@/lib/historySort';

export async function GET(req: NextRequest) {
  const session = await requireMtcAuth();
  if (!session) return err('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '30');
  const search = searchParams.get('search') ?? '';
  const tipe = searchParams.get('tipe') ?? '';
  const kategoriOut = searchParams.get('kategoriOut') ?? '';
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const sort = parseHistorySort(searchParams);

  let kategoriFilter = {};
  if (kategoriOut === 'UNCATEGORIZED' || kategoriOut === 'Belum Dikategorikan') {
    kategoriFilter = {
      OR: [
        { kategoriOut: null },
        { kategoriOut: '' },
      ],
    };
  } else if (kategoriOut) {
    kategoriFilter = { kategoriOut };
  }

  const where = {
    NOT: {
      keterangan: { contains: '[SILENT]' },
    },
    ...(tipe ? { tipe: tipe as 'IN' | 'OUT' | 'LOG' } : {}),
    ...kategoriFilter,
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
      orderBy: historyOrderBy(sort),
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  let summary: any = null;
  if (tipe === 'OUT') {
    const outMovements = await prisma.stockMovement.findMany({
      where,
      select: {
        id: true,
        qty: true,
        harga: true,
        kategoriOut: true,
      },
    });

    let totalOutRp = 0;
    let totalOutQty = 0;
    const byCategory: Record<string, { count: number; qty: number; totalRp: number }> = {
      'Maintenance Produksi': { count: 0, qty: 0, totalRp: 0 },
      'Utility': { count: 0, qty: 0, totalRp: 0 },
      'WO': { count: 0, qty: 0, totalRp: 0 },
      'Belum Dikategorikan': { count: 0, qty: 0, totalRp: 0 },
    };

    for (const m of outMovements) {
      const q = m.qty || 0;
      const h = m.harga ? Number(m.harga) : 0;
      const subtotal = q * h;
      totalOutQty += q;
      totalOutRp += subtotal;

      const cat = m.kategoriOut || 'Belum Dikategorikan';
      if (!byCategory[cat]) {
        byCategory[cat] = { count: 0, qty: 0, totalRp: 0 };
      }
      byCategory[cat].count += 1;
      byCategory[cat].qty += q;
      byCategory[cat].totalRp += subtotal;
    }

    summary = {
      totalOutRp,
      totalOutQty,
      totalCount: outMovements.length,
      byCategory,
    };
  }

  return ok({ data, total, page, limit, summary });
}
