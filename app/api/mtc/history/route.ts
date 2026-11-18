import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { historyOrderBy, parseHistorySort } from '@/lib/historySort';
import { buildMtcHistoryWhere } from '@/lib/mtc/stock-utils';

export async function GET(req: NextRequest) {
  const session = await requireMtcAuth();
  if (!session) return err('Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '30');
  const search = (searchParams.get('search') ?? '').trim();
  const tipe = searchParams.get('tipe') ?? '';
  const kategoriOut = searchParams.get('kategoriOut') ?? '';
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const sort = parseHistorySort(searchParams);

  const where = buildMtcHistoryWhere({
    tipe,
    kategoriOut,
    dateFrom,
    dateTo,
    search,
  });

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

  const formattedData = data.map((item) => {
    const isAdjustment = !!(item.keterangan && item.keterangan.includes('[OPNAME]'));
    let cat = item.kategoriOut;
    if (cat === 'Maintenance Produksi') {
      cat = 'Maintenance';
    }
    return {
      ...item,
      isAdjustment,
      displayTipe: isAdjustment ? 'ADJUSTMENT' : item.tipe,
      kategoriOut: cat,
    };
  });

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
      'Maintenance': { count: 0, qty: 0, totalRp: 0 },
      'Utility': { count: 0, qty: 0, totalRp: 0 },
      'WO': { count: 0, qty: 0, totalRp: 0 },
      'Produksi': { count: 0, qty: 0, totalRp: 0 },
      'Belum Dikategorikan': { count: 0, qty: 0, totalRp: 0 },
    };

    for (const m of outMovements) {
      const q = Math.abs(m.qty || 0);
      const h = m.harga ? Number(m.harga) : 0;
      const subtotal = q * h;
      totalOutQty += q;
      totalOutRp += subtotal;

      let cat = m.kategoriOut || 'Belum Dikategorikan';
      if (cat === 'Maintenance Produksi') cat = 'Maintenance';
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

  return ok({ data: formattedData, total, page, limit, summary });
}
