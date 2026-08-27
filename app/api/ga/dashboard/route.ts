import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { computeStockFromMovements } from '@/lib/ga/stockQty';
import {
  classifyMovement,
  getSlowMovingThreshold,
  last30DaysStartJakarta,
  sumQtyOutSince,
} from '@/lib/ga/movementClass';

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
    const since30d = last30DaysStartJakarta();

    const [
      allGaItems,
      recentMovements,
      recentOpnameSessions,
      topUsedMovements,
      totalDraftOpnameCount,
      totalKategoriCount,
      activeOrderCount,
      slowMovingThreshold,
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
      getSlowMovingThreshold(),
    ]);

    // Hitung stock, valuation, dan kritis
    let totalStockValuation = 0;
    let totalOutboundValuation = 0;
    let totalStockCount = 0;
    let totalKritisCount = 0;
    let totalOverstockCount = 0;
    let totalFastCount = 0;
    let totalSlowCount = 0;

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
      const isOverstock = it.maxQty !== null && currentStock > it.maxQty;
      if (isKritis) {
        totalKritisCount++;
      }
      if (isOverstock) {
        totalOverstockCount++;
      }

      const qtyOut30d = sumQtyOutSince(it.movements, since30d);
      const movementClass = classifyMovement(qtyOut30d, slowMovingThreshold);
      if (movementClass === 'fast') totalFastCount++;
      else totalSlowCount++;

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
        isOverstock,
        qtyOut30d,
        movementClass,
      };
    });

    const lowStockItems = itemsWithStock
      .filter((it) => it.isKritis)
      .sort((a, b) => a.currentStock - b.currentStock)
      .slice(0, 5);

    const overstockItems = itemsWithStock
      .filter((it) => it.isOverstock)
      .sort((a, b) => b.currentStock - a.currentStock)
      .slice(0, 5);

    const toMovementRow = (it: (typeof itemsWithStock)[number]) => ({
      id: it.id,
      nama: it.nama,
      kodeBarang: it.kodeBarang,
      lokasi: it.lokasi,
      uom: it.uom,
      currentStock: it.currentStock,
      qtyOut30d: it.qtyOut30d,
    });

    const slowMovingItems = itemsWithStock
      .filter((it) => it.movementClass === 'slow')
      .sort((a, b) => a.qtyOut30d - b.qtyOut30d)
      .slice(0, 5)
      .map(toMovementRow);

    const fastMovingItems = itemsWithStock
      .filter((it) => it.movementClass === 'fast')
      .sort((a, b) => b.qtyOut30d - a.qtyOut30d)
      .slice(0, 5)
      .map(toMovementRow);

    return ok({
      totalStockValuation,
      totalOutboundValuation,
      totalItemsCount: allGaItems.length,
      totalStockCount,
      totalKritisCount,
      totalOverstockCount,
      slowMovingThreshold,
      totalFastCount,
      totalSlowCount,
      slowMovingItems,
      fastMovingItems,
      totalDraftOpnameCount,
      totalKategoriCount,
      activeOrderCount,
      lowStockItems,
      overstockItems,
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
