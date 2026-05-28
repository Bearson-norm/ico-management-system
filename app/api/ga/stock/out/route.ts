import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { GaStockOutSchema } from '@/lib/validations/ga-stock';
import { ok, err } from '@/lib/utils';
import { getGaCurrentStock } from '@/lib/ga/stockQty';

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }
  const parsed = GaStockOutSchema.safeParse(body);
  if (!parsed.success) return err(parsed.error.errors.map((e) => e.message).join(', '));
  const p = parsed.data;
  const tanggal = new Date(p.tanggal + 'T12:00:00');

  const usageByItem = new Map<string, number>();
  for (const it of p.items) {
    usageByItem.set(it.itemId, (usageByItem.get(it.itemId) ?? 0) + it.qty);
  }

  for (const [itemId, needed] of usageByItem) {
    const st = await getGaCurrentStock(prismaGa, itemId);
    if (st < needed) {
      const row = await prismaGa.gaItem.findUnique({ where: { id: itemId } });
      return err(`Stok ${row?.nama ?? itemId} tidak cukup (sisa: ${st}, butuh: ${needed})`);
    }
  }

  await prismaGa.$transaction(async (tx) => {
    const rows = await tx.gaItem.findMany({ where: { id: { in: p.items.map((i) => i.itemId) } } });
    for (const it of p.items) {
      const row = rows.find((r) => r.id === it.itemId);
      await tx.gaStockMovement.create({
        data: {
          tipe: 'OUT',
          item: { connect: { id: it.itemId } },
          namaBarang: row?.nama ?? it.itemId,
          qty: it.qty,
          harga: row?.harga ?? 0,
          tanggal,
          tanggalPakai: tanggal,
          picNama: it.picNama,
          keterangan: p.keterangan || null,
        },
      });
    }
  });

  return ok({ count: p.items.length });
}
