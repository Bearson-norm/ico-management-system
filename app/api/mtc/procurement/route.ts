import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

// GET /api/mtc/procurement
export async function GET(req: NextRequest) {
  // We can let viewers see the procurement list, but editor session is required for editing
  // Let's support optional bypass or just check editor session depending on permissions
  const { searchParams } = new URL(req.url);
  const showArchived = searchParams.get('archived') === 'true';

  try {
    const data = await prisma.procurementTracking.findMany({
      where: {
        ...(showArchived
          ? { statusPo: 'DONE' }
          : { NOT: { statusPo: 'DONE' } }),
      },
      include: {
        sparepart: {
          select: {
            id: true,
            nama: true,
            uom: true,
            lokasi: true,
            harga: true,
            minQty: true,
          },
        },
      },
      orderBy: [
        { urgency: 'desc' },
        { fbIndex: 'desc' },
        { tanggalList: 'desc' },
      ],
    });

    return ok(data);
  } catch (e) {
    console.error('[GET /api/mtc/procurement]', e);
    return err('Gagal mengambil data pelacakan', 500);
  }
}
