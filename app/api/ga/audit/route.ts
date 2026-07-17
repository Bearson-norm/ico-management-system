import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaAdmin } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const session = await requireGaAdmin();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = req.nextUrl;
  const periode = searchParams.get('periode') || '';
  const search = (searchParams.get('search') || '').trim();
  const status = searchParams.get('status') || ''; // cocok | selisih | belum_opname | ''

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

  const filtered = lines.filter((line) => {
    if (!status) return true;
    if (status === 'belum_opname') return line.qtyFisik == null;
    if (status === 'cocok') return line.qtyFisik != null && line.selisih === 0;
    if (status === 'selisih') return line.qtyFisik != null && line.selisih !== 0;
    return true;
  });

  return ok({
    snapshots,
    snapshot,
    lines: filtered,
  });
}
