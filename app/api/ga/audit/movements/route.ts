import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaAdmin } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { monthBoundsJakarta } from '@/lib/ga/auditSnapshot';
import { GA_STOCK_MOVEMENT_TIPES } from '@/lib/ga/stockQty';

export async function GET(req: NextRequest) {
  const session = await requireGaAdmin();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = req.nextUrl;
  const periode = searchParams.get('periode') || '';
  const itemId = searchParams.get('itemId') || '';

  if (!periode || !itemId) return err('periode dan itemId wajib diisi');

  const snapshot = await prismaGa.gaAuditSnapshot.findUnique({ where: { periode } });
  if (!snapshot) return err('Snapshot tidak ditemukan', 404);

  const { monthStart } = monthBoundsJakarta(periode);
  const cutoffAt = snapshot.cutoffAt;

  const movements = await prismaGa.gaStockMovement.findMany({
    where: {
      itemId,
      tipe: { in: [...GA_STOCK_MOVEMENT_TIPES] },
      tanggal: { gte: monthStart, lt: cutoffAt },
    },
    orderBy: { tanggal: 'asc' },
    select: {
      id: true,
      tipe: true,
      qty: true,
      tanggal: true,
      picNama: true,
      keterangan: true,
      purchaseType: true,
      vendor: true,
      namaBarang: true,
    },
  });

  return ok({
    periode,
    itemId,
    cutoffAt: cutoffAt.toISOString(),
    movements,
  });
}
