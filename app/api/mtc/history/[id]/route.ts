import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

interface RouteParams {
  params: { id: string };
}

// ─── PUT /api/mtc/history/[id] - Edit Riwayat Transaksi ──────────────────────
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await requireMtcAuth();
  if (!session) return err('Unauthorized', 401);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return err('ID transaksi tidak valid', 400);

  const body = await req.json();
  const { qty, picId, tanggal, keterangan, noReport, vendor, purchaseType, harga } = body;

  const movement = await prisma.stockMovement.findUnique({
    where: { id },
    include: { sparepart: true },
  });

  if (!movement) return err('Transaksi tidak ditemukan', 404);

  const newQty = qty !== undefined ? parseInt(String(qty), 10) : movement.qty;
  if (isNaN(newQty) || newQty <= 0) {
    return err('Qty harus angka bulat positif (> 0)', 400);
  }

  const oldQty = movement.qty;
  const qtyDiff = newQty - oldQty;
  const isQtyChanged = qtyDiff !== 0;

  let stockChange = 0;
  if (isQtyChanged && movement.sparepartId && movement.sparepart) {
    if (movement.tipe === 'OUT') {
      // old = 5, new = 3 -> stockChange = +2 (stok bertambah kembali 2)
      // old = 3, new = 5 -> stockChange = -2 (stok berkurang lagi 2)
      stockChange = oldQty - newQty;
    } else if (movement.tipe === 'IN') {
      // old = 5, new = 8 -> stockChange = +3 (stok bertambah 3)
      // old = 8, new = 5 -> stockChange = -3 (stok berkurang 3)
      stockChange = newQty - oldQty;
    }

    if (stockChange < 0) {
      const remaining = movement.sparepart.currentStock + stockChange;
      if (remaining < 0) {
        return err(
          `Gagal mengubah transaksi: stok barang (${movement.sparepart.nama}) tidak mencukupi. Sisa stok: ${movement.sparepart.currentStock}`,
          400
        );
      }
    }
  }

  const updateData: any = {
    qty: newQty,
    ...(picId !== undefined ? { picId: picId ? parseInt(String(picId), 10) : null } : {}),
    ...(tanggal ? { tanggal: new Date(tanggal + 'T00:00:00') } : {}),
    ...(keterangan !== undefined ? { keterangan: keterangan || null } : {}),
    ...(noReport !== undefined ? { noReport: noReport || null } : {}),
    ...(vendor !== undefined ? { vendor: vendor || null } : {}),
    ...(purchaseType !== undefined ? { purchaseType: purchaseType || null } : {}),
    ...(harga !== undefined ? { harga: parseFloat(String(harga)) || 0 } : {}),
  };

  const operations: any[] = [];

  // Update sparepart stock if change exists
  if (stockChange !== 0 && movement.sparepartId) {
    operations.push(
      prisma.sparepart.update({
        where: { id: movement.sparepartId },
        data: { currentStock: { increment: stockChange } },
      })
    );
  }

  // Update StockMovement
  operations.push(
    prisma.stockMovement.update({
      where: { id },
      data: updateData,
      include: { sparepart: true, pic: true },
    })
  );

  const results = await prisma.$transaction(operations);
  const updatedMovement = results[results.length - 1];

  return ok(updatedMovement);
}

// ─── DELETE /api/mtc/history/[id] - Hapus / Batalkan Transaksi ──────────────
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await requireMtcAuth();
  if (!session) return err('Unauthorized', 401);

  const id = parseInt(params.id, 10);
  if (isNaN(id)) return err('ID transaksi tidak valid', 400);

  const movement = await prisma.stockMovement.findUnique({
    where: { id },
    include: { sparepart: true },
  });

  if (!movement) return err('Transaksi tidak ditemukan', 404);

  let stockReversal = 0;
  if (movement.sparepartId && movement.sparepart) {
    if (movement.tipe === 'OUT') {
      // Membatalkan transaksi OUT = mengembalikan barang ke stok (+qty)
      stockReversal = movement.qty;
    } else if (movement.tipe === 'IN') {
      // Membatalkan transaksi IN = menarik barang dari stok (-qty)
      stockReversal = -movement.qty;

      if (movement.sparepart.currentStock + stockReversal < 0) {
        return err(
          `Gagal menghapus transaksi IN: stok barang (${movement.sparepart.nama}) saat ini (${movement.sparepart.currentStock}) lebih kecil dari Qty transaksi (${movement.qty}).`,
          400
        );
      }
    }
  }

  const operations: any[] = [];

  if (stockReversal !== 0 && movement.sparepartId) {
    operations.push(
      prisma.sparepart.update({
        where: { id: movement.sparepartId },
        data: { currentStock: { increment: stockReversal } },
      })
    );
  }

  operations.push(
    prisma.stockMovement.delete({
      where: { id },
    })
  );

  await prisma.$transaction(operations);

  return ok({ message: 'Transaksi berhasil dihapus dan stok telah disesuaikan', deletedId: id });
}
