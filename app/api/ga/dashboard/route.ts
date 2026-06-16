import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { computeStockFromMovements } from '@/lib/ga/stockQty';

export async function GET(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const daysParam = searchParams.get('days') || '7';
  const days = parseInt(daysParam, 10) || 7;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  try {
    const [
      allGaItems,
      recentMovements,
      recentOpnameSessions,
      topUsedMovements,
      totalDraftOpnameCount,
      totalKategoriCount,
      activeOrderCount,
    ] = await Promise.all([
      prismaGa.gaItem.findMany({
        where: { aktif: true },
        select: {
          id: true,
          nama: true,
          kodeBarang: true,
          lokasi: true,
          uom: true,
          minQty: true,
          maxQty: true,
          harga: true,
          movements: {
            where: { tipe: { in: ['IN', 'OUT', 'ADJ'] } },
            select: { tipe: true, qty: true, tanggal: true },
          },
        },
      }),
      prismaGa.gaStockMovement.findMany({
        where: {
          tanggal: {
            gte: startDate,
          },
        },
        take: 100,
        orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          tipe: true,
          itemId: true,
          namaBarang: true,
          qty: true,
          tanggal: true,
          picNama: true,
          keterangan: true,
        },
      }),
      prismaGa.gaOpnameSession.findMany({
        take: 5,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          periodeNama: true,
          status: true,
          tanggal: true,
          postMode: true,
          postedAt: true,
          _count: { select: { lines: true } },
        },
      }),
      prismaGa.gaStockMovement.groupBy({
        by: ['itemId', 'namaBarang'],
        where: { tipe: 'OUT', NOT: { itemId: null } },
        _sum: { qty: true },
        orderBy: { _sum: { qty: 'desc' } },
        take: 5,
      }),
      prismaGa.gaOpnameSession.count({ where: { status: 'draft' } }),
      prismaGa.kategori.count(),
      prismaGa.gaProcurementTracking.count({ where: { status: 'ORDERED' } }),
    ]);

    // Hitung stock, valuation, dan kritis
    let totalStockValuation = 0;
    let totalOutboundValuation = 0;
    let totalStockCount = 0;
    let totalKritisCount = 0;

    const itemsWithStock = allGaItems.map((it) => {
      const currentStock = computeStockFromMovements(it.movements);
      const price = Number(it.harga || 0);

      if (currentStock > 0) {
        totalStockValuation += currentStock * price;
      }

      const totalOut = it.movements
        .filter((m) => m.tipe === 'OUT')
        .reduce((sum, m) => sum + m.qty, 0);
      totalOutboundValuation += totalOut * price;

      totalStockCount += currentStock;

      const isKritis = currentStock < it.minQty || currentStock <= 0;
      if (isKritis) {
        totalKritisCount++;
      }

      return {
        id: it.id,
        nama: it.nama,
        kodeBarang: it.kodeBarang,
        lokasi: it.lokasi ?? '—',
        uom: it.uom,
        minQty: it.minQty,
        maxQty: it.maxQty,
        harga: price,
        currentStock,
        isKritis,
      };
    });

    const lowStockItems = itemsWithStock
      .filter((it) => it.isKritis)
      .sort((a, b) => a.currentStock - b.currentStock)
      .slice(0, 5);

    return ok({
      totalStockValuation,
      totalOutboundValuation,
      totalItemsCount: allGaItems.length,
      totalStockCount,
      totalKritisCount,
      totalDraftOpnameCount,
      totalKategoriCount,
      activeOrderCount,
      lowStockItems,
      topUsedMovements: topUsedMovements.map((m) => ({
        itemId: m.itemId,
        namaBarang: m.namaBarang,
        qty: m._sum.qty || 0,
      })),
      recentOpnameSessions: recentOpnameSessions.map((s) => ({
        id: s.id,
        periodeNama: s.periodeNama,
        status: s.status,
        tanggal: s.tanggal,
        postMode: s.postMode,
        postedAt: s.postedAt,
        lineCount: s._count.lines,
      })),
      recentMovements,
    });
  } catch (e: any) {
    console.error('[GET /api/ga/dashboard] Error:', e);
    return err(`Gagal memuat dashboard: ${e.message}`, 500);
  }
}
