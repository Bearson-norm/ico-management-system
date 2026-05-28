import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

/** Opsi filter untuk halaman database (lokasi unik). */
export async function GET() {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const rows = await prismaGa.gaItem.findMany({
    where: { lokasi: { not: null } },
    select: { lokasi: true },
    distinct: ['lokasi'],
    orderBy: { lokasi: 'asc' },
  });

  const lokasi = rows
    .map((r) => r.lokasi?.trim())
    .filter((l): l is string => Boolean(l));

  return ok({ lokasi });
}
