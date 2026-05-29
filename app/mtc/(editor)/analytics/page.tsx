import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import AnalyticsClient from './AnalyticsClient';
import { requireMtcEditor } from '@/lib/auth';
import { redirect } from 'next/navigation';

export const revalidate = 0; // Disable caching to fetch live transactions

export default async function AnalyticsPage() {
  const session = await requireMtcEditor();
  if (!session || session.user.email !== 'admin') {
    redirect('/mtc/dashboard');
  }

  const now = new Date();
  
  // 1. Fetch Spareparts with all IN/OUT movements to calculate current stock, ROP, and averages
  const allSpareparts = await prisma.sparepart.findMany({
    where: { aktif: true },
    include: {
      kategori: true,
      mesins: { select: { id: true, nama: true } },
      movements: {
        where: { tipe: { in: ['IN', 'OUT'] } },
        orderBy: { tanggal: 'asc' },
      },
    },
  });

  // 2. Fetch all OUT movements in the last 12 months for Monthly & Quarterly usage breakdown
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  
  const outMovementsLastYear = await prisma.stockMovement.findMany({
    where: {
      tipe: 'OUT',
      tanggal: { gte: twelveMonthsAgo },
      NOT: { sparepartId: null },
    },
    orderBy: { tanggal: 'asc' },
  });

  // 3. Aggregate all LOG movements for financial reference if needed
  const totalLogMovements = await prisma.stockMovement.findMany({
    where: { tipe: 'LOG' },
  });

  // 4. Transform Spareparts data with ERP calculations
  const transformedSpareparts = allSpareparts.map((sp) => {
    // Current stock calculation
    const totalIn = sp.movements.filter((m) => m.tipe === 'IN').reduce((sum, m) => sum + m.qty, 0);
    const outMovements = sp.movements.filter((m) => m.tipe === 'OUT');
    const totalOut = outMovements.reduce((sum, m) => sum + m.qty, 0);
    const currentStock = totalIn - totalOut;

    // Daily consumption mapping (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const movementsLast90Days = outMovements.filter((m) => new Date(m.tanggal) >= ninetyDaysAgo);
    const totalQtyLast90Days = movementsLast90Days.reduce((sum, m) => sum + m.qty, 0);

    const usageByDate: Record<string, number> = {};
    movementsLast90Days.forEach((m) => {
      const dateStr = new Date(m.tanggal).toISOString().split('T')[0];
      usageByDate[dateStr] = (usageByDate[dateStr] || 0) + m.qty;
    });
    const dailyUsages = Object.values(usageByDate);
    
    // Average and Max daily demand rate (d)
    const elapsedDays = Math.max(30, Math.round((now.getTime() - new Date(sp.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
    const actualDaysWindow = Math.min(elapsedDays, 90);
    const avgDailyUsage = totalQtyLast90Days / actualDaysWindow;
    const maxDailyUsage = dailyUsages.length > 0 ? Math.max(...dailyUsages) : avgDailyUsage;

    // ERP Lead Time and Safety Stock (SS)
    const avgL = sp.avgLeadTime || 0;
    const maxL = sp.maxLeadTime || 0;
    
    let safetyStock = 0;
    let ssFormulaUsed = 'Standard Buffer (3 hari)';
    
    if (maxL > 0 && avgL > 0 && maxDailyUsage > 0) {
      safetyStock = Math.round((maxDailyUsage * maxL) - (avgDailyUsage * avgL));
      ssFormulaUsed = 'ERP Max-Max Formula';
    } else {
      safetyStock = Math.round(avgDailyUsage * 3);
    }
    if (safetyStock < 0) safetyStock = 0;

    // ERP Reorder Point (ROP)
    const calculatedROP = Math.round((avgDailyUsage * avgL) + safetyStock);
    
    // Use manual minQty as absolute safety floor for ROP
    const rop = Math.max(sp.minQty, calculatedROP);
    const isCritical = currentStock <= rop;

    // ERP Economic Order Quantity (EOQ)
    // Annual Demand D
    const annualDemand = Math.round(avgDailyUsage * 365);
    const orderingCost = 50000; // Fixed administrative order cost default (Rp 50,000)
    const holdingCostRate = 0.10; // Annual holding cost percentage (10% of unit price)
    const itemPrice = Number(sp.harga || 0);
    const annualHoldingCost = Math.max(100, itemPrice * holdingCostRate);

    let eoq = 0;
    if (annualDemand > 0 && itemPrice > 0) {
      eoq = Math.round(Math.sqrt((2 * annualDemand * orderingCost) / annualHoldingCost));
    }
    if (eoq < 1) eoq = 1; // Default minimum order of 1

    return {
      id: sp.id,
      nama: sp.nama,
      kategori: sp.kategori?.nama || '—',
      uom: sp.uom,
      lokasi: sp.lokasi || '—',
      harga: itemPrice,
      currentStock,
      avgLeadTime: sp.avgLeadTime,
      maxLeadTime: sp.maxLeadTime,
      prDate: sp.prDate,
      poDate: sp.poDate,
      purchasingStatus: sp.purchasingStatus,
      minQty: sp.minQty,
      avgDailyUsage,
      avgMonthlyUsage: avgDailyUsage * 30,
      safetyStock,
      ssFormulaUsed,
      rop,
      isCritical,
      eoq,
      annualDemand,
      mesins: sp.mesins.map(m => m.nama),
    };
  });

  // Calculate high level summaries
  const criticalItemsCount = transformedSpareparts.filter(sp => sp.isCritical).length;
  const avgLeadTimeVal = allSpareparts.filter(sp => sp.avgLeadTime > 0);
  const averageMtcLeadTime = avgLeadTimeVal.length > 0 
    ? Number((avgLeadTimeVal.reduce((sum, sp) => sum + sp.avgLeadTime, 0) / avgLeadTimeVal.length).toFixed(1))
    : 0;

  const totalPRActive = transformedSpareparts.filter(sp => sp.purchasingStatus === 'PR').length;
  const totalPOActive = transformedSpareparts.filter(sp => sp.purchasingStatus === 'PO').length;

  return (
    <AnalyticsClient 
      spareparts={transformedSpareparts}
      outMovements={outMovementsLastYear}
      criticalItemsCount={criticalItemsCount}
      averageMtcLeadTime={averageMtcLeadTime}
      totalPRActive={totalPRActive}
      totalPOActive={totalPOActive}
    />
  );
}
