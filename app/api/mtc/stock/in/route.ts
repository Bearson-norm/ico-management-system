import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor, isQuickInBypassed } from '@/lib/auth';
import { StockInSchema } from '@/lib/validations/stock';
import { generateItemId, ok, err } from '@/lib/utils';

export async function POST(req: NextRequest) {
  const isBypassed = isQuickInBypassed(req);
  if (!isBypassed) {
    const session = await requireMtcEditor();
    if (!session) return err('Akses ditolak', 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }

  const parsed = StockInSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }
  const p = parsed.data;
  const tanggal = new Date(p.tanggal + 'T12:00:00');

  try {
    if (p.jenis === 'existing') {
      await prisma.$transaction(async (tx) => {
        for (const it of p.items) {
          const sp = await tx.sparepart.findUnique({ where: { id: it.sparepartId } });
          if (!sp) throw new Error(`Sparepart ${it.sparepartId} tidak ditemukan`);
          
          await tx.stockMovement.create({
            data: {
              tipe: 'IN',
              sparepartId: it.sparepartId,
              namaItem: sp.nama,
              qty: it.qty,
              harga: it.harga ?? 0,
              lokasi: sp.lokasi,
              purchaseType: p.purchaseType || null,
              vendor: p.vendor || null,
              tanggal,
            },
          });

          let calculatedAvgLeadTime = sp.avgLeadTime;
          let calculatedMaxLeadTime = sp.maxLeadTime;
          if (sp.prDate) {
            const elapsedMs = tanggal.getTime() - new Date(sp.prDate).getTime();
            const elapsedDays = Math.max(1, elapsedMs / (1000 * 60 * 60 * 24));
            
            calculatedAvgLeadTime = sp.avgLeadTime === 0
              ? elapsedDays
              : Number((sp.avgLeadTime * 0.8 + elapsedDays * 0.2).toFixed(2));
            calculatedMaxLeadTime = Math.max(sp.maxLeadTime, Math.round(elapsedDays));
          }

          await tx.sparepart.update({
            where: { id: it.sparepartId },
            data: {
              ...(it.harga != null && it.harga >= 0 ? { harga: it.harga } : {}),
              purchasingStatus: 'NONE',
              prDate: null,
              poDate: null,
              avgLeadTime: calculatedAvgLeadTime,
              maxLeadTime: calculatedMaxLeadTime,
            },
          });
        }
      });
      return ok({ msg: `Stok masuk: ${p.items.length} jenis barang` });
    }

    if (p.jenis === 'new') {
      const id = await generateItemId(prisma);
      await prisma.$transaction(async (tx) => {
        await tx.sparepart.create({
          data: {
            id,
            nama: p.nama,
            kategoriId: p.kategoriId ?? null,
            uom: 'Pcs',
            lokasi: p.lokasi || null,
            harga: p.harga,
            minQty: p.minQty,
            aktif: true,
            ...(p.mesinIds && p.mesinIds.length > 0 ? {
              mesins: {
                connect: p.mesinIds.map((mid: string) => ({ id: Number(mid) }))
              }
            } : {})
          },
        });
        await tx.stockMovement.create({
          data: {
            tipe: 'IN',
            sparepartId: id,
            namaItem: p.nama,
            qty: p.qty,
            harga: p.harga,
            lokasi: p.lokasi || null,
            purchaseType: p.purchaseType || null,
            vendor: p.vendor || null,
            tanggal,
          },
        });
      });
      return ok({ msg: `Barang baru ${id} didaftarkan & stok awal masuk` });
    }

    // log
    await prisma.stockMovement.create({
      data: {
        tipe: 'LOG',
        sparepartId: null,
        namaItem: p.nama,
        qty: p.qty,
        harga: p.harga,
        purchaseType: p.purchaseType || null,
        vendor: p.vendor || null,
        tanggal,
      },
    });
    return ok({ msg: 'Transaksi log (non-stok) tercatat' });
  } catch (e) {
    console.error('[POST /api/mtc/stock/in]', e);
    const msg = e instanceof Error ? e.message : 'Gagal menyimpan';
    return err(msg, 500);
  }
}
