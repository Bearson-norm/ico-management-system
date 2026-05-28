import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { StockOutSchema } from '@/lib/validations/stock';
import { ok, err } from '@/lib/utils';

async function getCurrentStock(sparepartId: string): Promise<number> {
  const agg = await prisma.stockMovement.groupBy({
    by: ['tipe'],
    where: { sparepartId, tipe: { in: ['IN', 'OUT'] } },
    _sum: { qty: true },
  });
  const totalIn = agg.find((r) => r.tipe === 'IN')?._sum.qty ?? 0;
  const totalOut = agg.find((r) => r.tipe === 'OUT')?._sum.qty ?? 0;
  return totalIn - totalOut;
}

export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }

  const parsed = StockOutSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }
  const p = parsed.data;
  const tanggal = new Date(p.tanggal + 'T12:00:00');

  for (const it of p.items) {
    const stok = await getCurrentStock(it.sparepartId);
    if (stok < it.qty) {
      const item = await prisma.sparepart.findUnique({ where: { id: it.sparepartId } });
      return err(`Stok ${item?.nama ?? it.sparepartId} tidak cukup (sisa: ${stok})`);
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const details = await tx.sparepart.findMany({
        where: { id: { in: p.items.map((i) => i.sparepartId) } },
      });
      for (const it of p.items) {
        const sp = details.find((d) => d.id === it.sparepartId);
        await tx.stockMovement.create({
          data: {
            tipe: 'OUT',
            sparepartId: it.sparepartId,
            namaItem: sp?.nama ?? it.sparepartId,
            qty: it.qty,
            harga: sp?.harga ?? 0,
            lokasi: sp?.lokasi ?? '',
            picId: p.picId,
            noReport: p.noReport || null,
            keterangan: p.keterangan || null,
            tanggal,
          },
        });
      }
    });
    return ok({ count: p.items.length });
  } catch (e) {
    console.error('[POST /api/mtc/stock/out]', e);
    return err('Gagal stock out', 500);
  }
}
