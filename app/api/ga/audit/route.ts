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
  const search = (searchParams.get('search') || '').trim();

  const snapshots = await prismaGa.gaAuditSnapshot.findMany({
    orderBy: { periode: 'desc' },
    select: {
      id: true,
      periode: true,
      generatedAt: true,
      cutoffAt: true,
      source: true,
      _count: { select: { lines: true } },
    },
  });

  if (!periode && snapshots.length === 0) {
    return ok({ snapshots: [], snapshot: null, lines: [] });
  }

  const targetPeriode = periode || snapshots[0]?.periode;
  const snapshot = targetPeriode
    ? await prismaGa.gaAuditSnapshot.findUnique({
        where: { periode: targetPeriode },
      })
    : null;

  if (!snapshot) {
    return ok({ snapshots, snapshot: null, lines: [] });
  }

  const lines = await prismaGa.gaAuditSnapshotLine.findMany({
    where: {
      snapshotId: snapshot.id,
      ...(search
        ? {
            OR: [
              { namaItem: { contains: search, mode: 'insensitive' } },
              { itemId: { contains: search, mode: 'insensitive' } },
              { lokasi: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { namaItem: 'asc' },
  });

  // Item dengan transaksi backdate: tanggal masuk periode snapshot, tetapi
  // dicatat setelah periode di-closing (createdAt melewati cutoff).
  const { monthStart } = monthBoundsJakarta(snapshot.periode);
  const backdatedMovements = await prismaGa.gaStockMovement.findMany({
    where: {
      itemId: { not: null },
      tipe: { in: [...GA_STOCK_MOVEMENT_TIPES] },
      tanggal: { gte: monthStart, lt: snapshot.cutoffAt },
      createdAt: { gt: snapshot.cutoffAt },
    },
    select: { itemId: true },
    distinct: ['itemId'],
  });
  const backdateItemIds = backdatedMovements
    .map((m) => m.itemId)
    .filter((id): id is string => id != null);

  return ok({
    snapshots,
    snapshot,
    lines,
    backdateItemIds,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireGaAdmin();
  if (!session) return err('Akses ditolak', 403);

  const periode = req.nextUrl.searchParams.get('periode') || '';
  if (!/^\d{4}-\d{2}$/.test(periode)) return err('Parameter periode (YYYY-MM) wajib diisi');

  const snapshot = await prismaGa.gaAuditSnapshot.findUnique({
    where: { periode },
    select: { id: true, _count: { select: { lines: true } } },
  });
  if (!snapshot) return err('Snapshot tidak ditemukan', 404);

  // Lines ikut terhapus via onDelete: Cascade.
  await prismaGa.gaAuditSnapshot.delete({ where: { id: snapshot.id } });

  return ok({
    periode,
    deletedLines: snapshot._count.lines,
    msg: `Snapshot ${periode} dihapus (${snapshot._count.lines} baris). Periode ini kembali terbuka untuk transaksi.`,
  });
}
