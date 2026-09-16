import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth, requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

type RouteCtx = { params: Promise<{ id: string }> | { id: string } };

async function calculateCurrentStock(sparepartId: string, excludeMovementId?: number): Promise<number> {
  const movements = await prisma.stockMovement.findMany({
    where: {
      sparepartId,
      tipe: { in: ['IN', 'OUT'] },
      OR: [{ purchaseType: null }, { purchaseType: { not: 'histori-sheets' } }],
      ...(excludeMovementId ? { id: { not: excludeMovementId } } : {}),
    },
    select: { tipe: true, qty: true },
  });

  const totalIn = movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
  const totalOut = movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + Math.abs(m.qty), 0);
  return totalIn - totalOut;
}

// ─── PUT /api/mtc/history/[id] - Edit Riwayat Transaksi ──────────────────────
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const session = (await requireMtcEditor()) || (await requireMtcAuth());
  if (!session) return err('Akses ditolak / Unauthorized', 401);

  const resolvedParams = await ctx.params;
  const id = parseInt(resolvedParams.id, 10);
  if (isNaN(id)) return err('ID transaksi tidak valid', 400);

  const body = await req.json();
  const { qty, picId, tanggal, keterangan, noReport, vendor, purchaseType, harga, kategoriOut, sparepartId, namaItem } = body;

  const movement = await prisma.stockMovement.findUnique({
    where: { id },
    include: { sparepart: true },
  });

  if (!movement) return err('Transaksi tidak ditemukan', 404);

  const newQty = qty !== undefined ? parseInt(String(qty), 10) : movement.qty;
  if (isNaN(newQty) || newQty <= 0) {
    return err('Qty harus angka bulat positif (> 0)', 400);
  }

  let targetSparepart = movement.sparepart;
  let newSparepartId: string | null = movement.sparepartId;

  if (sparepartId !== undefined) {
    const rawTarget = sparepartId ? String(sparepartId).trim() : '';
    newSparepartId = rawTarget || null;

    if (newSparepartId !== movement.sparepartId) {
      // 1. If old sparepart exists and movement was IN, ensure removing it doesn't make old sparepart stock negative
      if (movement.sparepartId && movement.sparepart && movement.tipe === 'IN') {
        const oldStockWithoutThis = await calculateCurrentStock(movement.sparepartId, movement.id);
        if (oldStockWithoutThis < 0) {
          return err(
            `Gagal memindahkan sparepart: Melepas stok dari ${movement.sparepart.nama} menyebabkan stoknya menjadi minus (${oldStockWithoutThis}).`,
            400
          );
        }
      }

      // 2. If new sparepart is specified, check that it exists
      if (newSparepartId) {
        const found = await prisma.sparepart.findUnique({ where: { id: newSparepartId } });
        if (!found) return err(`Sparepart ${newSparepartId} tidak ditemukan`, 404);
        targetSparepart = found;

        // If movement is OUT, ensure new sparepart has enough stock
        if (movement.tipe === 'OUT') {
          const newStockWithoutThis = await calculateCurrentStock(newSparepartId, movement.id);
          const projected = newStockWithoutThis - newQty;
          if (projected < 0) {
            return err(
              `Gagal mengubah transaksi: Stok ${found.nama} tidak mencukupi untuk pengeluaran ${newQty} Pcs (Stok saat ini: ${newStockWithoutThis} Pcs).`,
              400
            );
          }
        }
      } else {
        targetSparepart = null;
      }
    }
  }

  // If sparepart is set and unchanged, check standard boundaries
  if (newSparepartId && targetSparepart && newSparepartId === movement.sparepartId) {
    const stockWithoutThis = await calculateCurrentStock(newSparepartId, movement.id);

    let projectedStock = stockWithoutThis;
    if (movement.tipe === 'IN') {
      projectedStock += newQty;
    } else if (movement.tipe === 'OUT') {
      projectedStock -= newQty;
    }

    if (projectedStock < 0) {
      return err(
        `Gagal mengubah transaksi: Qty baru (${newQty}) menyebabkan stok barang (${targetSparepart.nama}) menjadi minus (${projectedStock}).`,
        400
      );
    }
  }

  const updateData: any = {
    qty: newQty,
    ...(sparepartId !== undefined
      ? {
          sparepartId: newSparepartId,
          ...(targetSparepart
            ? {
                namaItem: targetSparepart.nama,
                ...(targetSparepart.lokasi ? { lokasi: targetSparepart.lokasi } : {}),
              }
            : {}),
        }
      : {}),
    ...(namaItem ? { namaItem: String(namaItem).trim() } : {}),
    ...(picId !== undefined ? { picId: picId ? parseInt(String(picId), 10) : null } : {}),
    ...(tanggal ? { tanggal: new Date(tanggal + 'T00:00:00') } : {}),
    ...(keterangan !== undefined ? { keterangan: keterangan || null } : {}),
    ...(noReport !== undefined ? { noReport: noReport || null } : {}),
    ...(vendor !== undefined ? { vendor: vendor || null } : {}),
    ...(purchaseType !== undefined ? { purchaseType: purchaseType || null } : {}),
    ...(harga !== undefined ? { harga: parseFloat(String(harga)) || 0 } : {}),
    ...(kategoriOut !== undefined ? { kategoriOut: kategoriOut ? String(kategoriOut).trim() : null } : {}),
  };

  const updatedMovement = await prisma.stockMovement.update({
    where: { id },
    data: updateData,
    include: { sparepart: true, pic: true },
  });

  return ok(updatedMovement);
}

// ─── DELETE /api/mtc/history/[id] - Hapus / Batalkan Transaksi ──────────────
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const session = (await requireMtcEditor()) || (await requireMtcAuth());
  if (!session) return err('Akses ditolak / Unauthorized', 401);

  const resolvedParams = await ctx.params;
  const id = parseInt(resolvedParams.id, 10);
  if (isNaN(id)) return err('ID transaksi tidak valid', 400);

  const movement = await prisma.stockMovement.findUnique({
    where: { id },
    include: { sparepart: true },
  });

  if (!movement) return err('Transaksi tidak ditemukan', 404);

  // If deleting an IN movement, check if remaining stock stays non-negative
  if (movement.sparepartId && movement.sparepart && movement.tipe === 'IN') {
    const stockWithoutThis = await calculateCurrentStock(movement.sparepartId, movement.id);
    if (stockWithoutThis < 0) {
      return err(
        `Gagal menghapus transaksi IN: menghapus transaksi ini akan menyebabkan sisa stok barang (${movement.sparepart.nama}) menjadi minus (${stockWithoutThis}).`,
        400
      );
    }
  }

  await prisma.stockMovement.delete({
    where: { id },
  });

  return ok({ message: 'Transaksi berhasil dihapus dan stok telah disesuaikan', deletedId: id });
}
