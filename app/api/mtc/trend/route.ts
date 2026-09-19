import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await requireMtcAuth().catch(() => null);

    const { searchParams } = new URL(req.url);
    const sparepartId = (searchParams.get('sparepartId') ?? '').trim();
    const period = searchParams.get('period') ?? 'all'; // '3m' | '6m' | '1y' | 'all'
    const kategori = searchParams.get('kategori') ?? 'Maintenance'; // 'Maintenance' | 'ALL'

    // 1. Ambil daftar ringkas semua sparepart aktif untuk dropdown selector
    const allSpareparts = await prisma.sparepart.findMany({
      where: { aktif: true },
      select: {
        id: true,
        nama: true,
        uom: true,
        harga: true,
        minQty: true,
        kategori: { select: { nama: true } },
      },
      orderBy: { nama: 'asc' },
    });

    // 2. Hitung tanggal batas berdasarkan filter period
    let dateLimit: Date | null = null;
    const now = new Date();
    if (period === '3m') {
      dateLimit = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    } else if (period === '6m') {
      dateLimit = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    } else if (period === '1y') {
      dateLimit = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    }

    // 3. Overview Top 10 Most Consumed Parts (jika dibutuhkan untuk overview dashboard)
    const topMovements = await prisma.stockMovement.findMany({
      where: {
        tipe: 'OUT',
        sparepartId: { not: null },
        NOT: [
          { keterangan: { contains: '[SILENT]' } },
          { keterangan: { contains: '[OPNAME]' } },
        ],
        ...(kategori === 'Maintenance'
          ? {
              OR: [
                { kategoriOut: 'Maintenance' },
                { kategoriOut: 'Maintenance Produksi' },
                { keterangan: { contains: '[Mesin:' } },
                { noReport: { not: null } },
              ],
            }
          : {}),
        ...(dateLimit ? { tanggal: { gte: dateLimit } } : {}),
      },
      select: {
        sparepartId: true,
        qty: true,
        harga: true,
        sparepart: { select: { nama: true, uom: true } },
      },
    });

    const partUsageMap: Record<string, { id: string; nama: string; uom: string; totalQty: number; totalBiaya: number }> = {};
    for (const m of topMovements) {
      if (!m.sparepartId) continue;
      if (!partUsageMap[m.sparepartId]) {
        partUsageMap[m.sparepartId] = {
          id: m.sparepartId,
          nama: m.sparepart?.nama || m.sparepartId,
          uom: m.sparepart?.uom || 'Pcs',
          totalQty: 0,
          totalBiaya: 0,
        };
      }
      const qty = Math.abs(m.qty);
      const price = Number(m.harga) || 0;
      partUsageMap[m.sparepartId].totalQty += qty;
      partUsageMap[m.sparepartId].totalBiaya += qty * price;
    }

    const topUsedParts = Object.values(partUsageMap)
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 10);

    // 4. Jika tidak ada sparepartId yang dipilih, gunakan default sparepartId pertama dari top used, atau fallback MTC-SP-099
    let targetSpId = sparepartId;
    if (!targetSpId) {
      targetSpId = topUsedParts.length > 0 ? topUsedParts[0].id : 'MTC-SP-099';
    }

    // 5. Ambil data detail untuk target sparepart
    const targetSp = await prisma.sparepart.findUnique({
      where: { id: targetSpId },
      include: {
        kategori: true,
        mesins: { select: { id: true, nama: true } },
        movements: {
          where: {
            tipe: { in: ['IN', 'OUT'] },
            OR: [{ purchaseType: null }, { purchaseType: { not: 'histori-sheets' } }],
          },
          select: { tipe: true, qty: true },
        },
      },
    });

    if (!targetSp) {
      return NextResponse.json({
        success: true,
        sparepartList: allSpareparts,
        topUsedParts,
        selectedPart: null,
      });
    }

    // Hitung stok aktual (In minus Out non-histori-sheets)
    const totalIn = targetSp.movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
    const totalOut = targetSp.movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + Math.abs(m.qty), 0);
    const currentStock = totalIn - totalOut;

    // 6. Ambil semua OUT movements untuk target part ini (termasuk histori sheets untuk tren akurat)
    const movements = await prisma.stockMovement.findMany({
      where: {
        sparepartId: targetSpId,
        tipe: 'OUT',
        NOT: [
          { keterangan: { contains: '[SILENT]' } },
          { keterangan: { contains: '[OPNAME]' } },
        ],
        ...(kategori === 'Maintenance'
          ? {
              OR: [
                { kategoriOut: 'Maintenance' },
                { kategoriOut: 'Maintenance Produksi' },
                { keterangan: { contains: '[Mesin:' } },
                { noReport: { not: null } },
              ],
            }
          : {}),
        ...(dateLimit ? { tanggal: { gte: dateLimit } } : {}),
      },
      include: {
        pic: { select: { nama: true } },
        report: { include: { mesin: true } },
      },
      orderBy: { tanggal: 'asc' },
    });

    // 7. Agregasi Tren Bulanan (Monthly Trend)
    const monthFormatter = new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
    const monthlyMap: Record<string, { monthKey: string; monthLabel: string; qty: number; totalBiaya: number; count: number; date: Date }> = {};

    for (const m of movements) {
      const d = new Date(m.tanggal);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${yyyy}-${mm}`;
      const label = monthFormatter.format(d);

      if (!monthlyMap[key]) {
        monthlyMap[key] = {
          monthKey: key,
          monthLabel: label,
          qty: 0,
          totalBiaya: 0,
          count: 0,
          date: new Date(yyyy, d.getMonth(), 1),
        };
      }

      const q = Math.abs(m.qty);
      const h = Number(m.harga) || Number(targetSp.harga) || 0;
      monthlyMap[key].qty += q;
      monthlyMap[key].totalBiaya += q * h;
      monthlyMap[key].count += 1;
    }

    // Sort bulan dari paling lampau ke paling baru
    const monthlyTrend = Object.values(monthlyMap).sort((a, b) => a.date.getTime() - b.date.getTime());

    // 8. Agregasi Breakdown Mesin (Machine Breakdown)
    const machineMap: Record<string, { name: string; qty: number; totalBiaya: number; count: number }> = {};
    let totalQtyAll = 0;
    let totalBiayaAll = 0;

    for (const m of movements) {
      let machineName = m.report?.mesin?.nama || '';
      if (!machineName && m.keterangan) {
        const match = m.keterangan.match(/\[Mesin:\s*([^\]]+)\]/i);
        if (match) machineName = match[1].trim();
      }
      if (!machineName) {
        machineName = 'Umum / Lainnya';
      }

      const q = Math.abs(m.qty);
      const h = Number(m.harga) || Number(targetSp.harga) || 0;
      const b = q * h;

      totalQtyAll += q;
      totalBiayaAll += b;

      if (!machineMap[machineName]) {
        machineMap[machineName] = { name: machineName, qty: 0, totalBiaya: 0, count: 0 };
      }
      machineMap[machineName].qty += q;
      machineMap[machineName].totalBiaya += b;
      machineMap[machineName].count += 1;
    }

    const machineBreakdown = Object.values(machineMap)
      .map((item) => ({
        ...item,
        percentage: totalQtyAll > 0 ? Math.round((item.qty / totalQtyAll) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.qty - a.qty);

    // 9. Perhitungan Run-Rate & Ketahanan Stok (Runway)
    // Hitung span bulan dari pergerakan pertama sampai sekarang (minimal 1 bulan)
    let monthsSpan = 1;
    if (movements.length > 0) {
      const firstDate = new Date(movements[0].tanggal);
      const lastDate = new Date();
      monthsSpan = Math.max(
        1,
        (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + (lastDate.getMonth() - firstDate.getMonth()) + 1
      );
    }
    const runRateMonthly = totalQtyAll > 0 ? Number((totalQtyAll / monthsSpan).toFixed(2)) : 0;
    const runwayMonths = runRateMonthly > 0 ? Number((currentStock / runRateMonthly).toFixed(1)) : 999;

    let reorderStatus: 'SAFE' | 'WARNING' | 'DANGER' = 'SAFE';
    if (currentStock <= 0) {
      reorderStatus = 'DANGER';
    } else if (currentStock <= targetSp.minQty || runwayMonths < 1.5) {
      reorderStatus = 'WARNING';
    }

    // 10. Daftar Riwayat Transaksi (terbaru di atas)
    const historyList = movements
      .map((m) => {
        let machineName = m.report?.mesin?.nama || '';
        if (!machineName && m.keterangan) {
          const match = m.keterangan.match(/\[Mesin:\s*([^\]]+)\]/i);
          if (match) machineName = match[1].trim();
        }

        const q = Math.abs(m.qty);
        const h = Number(m.harga) || Number(targetSp.harga) || 0;

        return {
          id: m.id,
          tanggal: new Date(m.tanggal).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }),
          rawTanggal: m.tanggal,
          waktu: new Date(m.tanggal).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }),
          qty: q,
          hargaSatuan: h,
          totalBiaya: q * h,
          pic: m.pic?.nama || '—',
          mesin: machineName || '—',
          keterangan: m.keterangan || '—',
          noReport: m.noReport || '—',
        };
      })
      .reverse(); // Terbaru di atas

    const lastUsedDate = historyList.length > 0 ? historyList[0].tanggal : 'Belum Ada';

    return NextResponse.json({
      success: true,
      sparepartList: allSpareparts,
      topUsedParts,
      selectedPart: {
        info: {
          id: targetSp.id,
          nama: targetSp.nama,
          kategori: targetSp.kategori?.nama || 'Umum',
          harga: Number(targetSp.harga),
          currentStock,
          minQty: targetSp.minQty,
          uom: targetSp.uom,
          lokasi: targetSp.lokasi || '—',
          mesins: targetSp.mesins.map((m) => m.nama),
        },
        kpis: {
          totalQty: totalQtyAll,
          totalBiaya: totalBiayaAll,
          runRateMonthly,
          runwayMonths: runwayMonths > 100 ? '12+' : runwayMonths,
          reorderStatus,
          totalEvents: movements.length,
          lastUsedDate,
        },
        monthlyTrend,
        machineBreakdown,
        historyList,
      },
    });
  } catch (err: any) {
    console.error('Error fetching trend analytics:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
