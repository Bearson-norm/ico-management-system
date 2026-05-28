import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { buildGaDashboardInsights } from '@/lib/ga/dashboardInsights';

export async function GET(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(7, parseInt(searchParams.get('days') ?? '90', 10) || 90));
  const limit = Math.min(20, Math.max(5, parseInt(searchParams.get('limit') ?? '10', 10) || 10));

  const items = await prismaGa.gaItem.findMany({
    where: { aktif: true },
    select: {
      id: true,
      nama: true,
      kodeBarang: true,
      lokasi: true,
      uom: true,
      minQty: true,
      movements: {
        where: { tipe: { in: ['IN', 'OUT', 'ADJ'] } },
        select: { tipe: true, qty: true, tanggal: true },
      },
    },
    orderBy: { nama: 'asc' },
  });

  const insights = buildGaDashboardInsights(items, { periodDays: days, limit });
  return ok(insights);
}
