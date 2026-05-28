import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { GaStockInSchema } from '@/lib/validations/ga-stock';
import { generateGaItemId } from '@/lib/utils-ga';
import { ok, err } from '@/lib/utils';

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }

  const parsed = GaStockInSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }
  const p = parsed.data;
  const tanggal = new Date(p.tanggal + 'T12:00:00');

  try {
    if (p.jenis === 'existing') {
      await prismaGa.$transaction(async (tx) => {
        for (const it of p.items) {
          const row = await tx.gaItem.findUnique({ where: { id: it.itemId } });
          if (!row) throw new Error(`Item ${it.itemId} tidak ada`);
          await tx.gaStockMovement.create({
            data: {
              tipe: 'IN',
              item: { connect: { id: it.itemId } },
              namaBarang: row.nama,
              qty: it.qty,
              qtyDiterima: it.qty,
              tanggalTerima: tanggal,
              harga: it.harga ?? 0,
              tanggal,
              picNama: p.picNama,
              purchaseType: p.purchaseType || null,
              vendor: p.vendor || null,
              keterangan: p.keterangan || null,
            },
          });
          if (it.harga != null && it.harga >= 0) {
            await tx.gaItem.update({ where: { id: it.itemId }, data: { harga: it.harga } });
          }
        }
      });
      return ok({ msg: `Stok masuk: ${p.items.length} baris` });
    }

    const id = await generateGaItemId(prismaGa);
    await prismaGa.$transaction(async (tx) => {
      await tx.gaItem.create({
        data: {
          id,
          nama: p.nama,
          kategoriId: p.kategoriId ?? null,
          uom: p.uom || 'Pcs',
          lokasi: p.lokasi || null,
          kodeBarang: p.kodeBarang || null,
          harga: p.harga,
          minQty: p.minQty,
          maxQty: p.maxQty ?? null,
          aktif: true,
        },
      });
      await tx.gaStockMovement.create({
        data: {
          tipe: 'IN',
          item: { connect: { id } },
          namaBarang: p.nama,
          qty: p.qty,
          qtyDiterima: p.qty,
          tanggalTerima: tanggal,
          harga: p.harga,
          tanggal,
          picNama: p.picNama,
          purchaseType: p.purchaseType || null,
          vendor: p.vendor || null,
          keterangan: p.keterangan || null,
        },
      });
    });
    return ok({ msg: `Barang baru ${id} didaftarkan` });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : 'Gagal';
    return err(msg, 500);
  }
}
