import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

const KLASIFIKASI_SORT_ORDER: Record<string, number> = {
  'KRITIS - STOK MINIMAL (asuransi)': 0,
  'KRITIS - STOK NORMAL': 1,
  'NORMAL - STOK IKUT PERMINTAAN': 2,
  'NON-STOK - BELI SAAT BUTUH': 3,
};

const ALASAN: Record<string, string> = {
  'KRITIS - STOK NORMAL':
    'Dipakai di mesin vital dan sering keluar. Aman pakai reorder point biasa — pastikan stok selalu tersedia.',
  'KRITIS - STOK MINIMAL (asuransi)':
    'Dipakai di mesin vital tapi jarang keluar. Wajib tetap stok minimal 1–2 unit sebagai buffer risiko downtime. JANGAN dinilai hanya dari frekuensi keluar.',
  'NORMAL - STOK IKUT PERMINTAAN':
    'Tidak di mesin vital, tapi cukup sering keluar. Boleh stok kecil untuk kepraktisan operasional.',
  'NON-STOK - BELI SAAT BUTUH':
    'Tidak di mesin vital dan jarang keluar. Tidak perlu distok — cukup jalur PR atau petty cash saat dibutuhkan.',
};

export async function GET(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const mode = (searchParams.get('mode') || 'AUTO').toUpperCase(); // 12M | 6M | 3M | AUTO
  const slowThreshold = parseFloat(searchParams.get('slowThreshold') || '1.0');

  const now = new Date();
  const startDate12m = new Date(now); startDate12m.setMonth(now.getMonth() - 12);
  const startDate6m  = new Date(now); startDate6m.setMonth(now.getMonth() - 6);
  const startDate3m  = new Date(now); startDate3m.setMonth(now.getMonth() - 3);

  const spareparts = await prisma.sparepart.findMany({
    where: { aktif: true },
    select: {
      id: true,
      nama: true,
      minQty: true,
      avgLeadTime: true,
      maxLeadTime: true,
      uom: true,
      lokasi: true,
      harga: true,
      mesins: {
        select: {
          id: true,
          nama: true,
          vital: true,
          aktif: true,
        },
      },
      movements: {
        where: {
          tipe: { in: ['IN', 'OUT'] },
          OR: [{ purchaseType: null }, { purchaseType: { not: 'histori-sheets' } }],
        },
        select: { tipe: true, qty: true, tanggal: true, keterangan: true },
      },
    },
    orderBy: { nama: 'asc' },
  });

  const result = spareparts.map((sp) => {
    // 1. Current physical stock
    const totalIn = sp.movements.filter((m) => m.tipe === 'IN').reduce((sum, m) => sum + m.qty, 0);
    const totalOut = sp.movements.filter((m) => m.tipe === 'OUT').reduce((sum, m) => sum + m.qty, 0);
    const currentStock = totalIn - totalOut;

    // 2. Multi-period OUT movements (12m, 6m, 3m)
    const outMovements = sp.movements.filter((m) => m.tipe === 'OUT');
    
    const totalOut12m = outMovements.filter((m) => new Date(m.tanggal) >= startDate12m).reduce((s, m) => s + m.qty, 0);
    const totalOut6m  = outMovements.filter((m) => new Date(m.tanggal) >= startDate6m).reduce((s, m) => s + m.qty, 0);
    const totalOut3m  = outMovements.filter((m) => new Date(m.tanggal) >= startDate3m).reduce((s, m) => s + m.qty, 0);

    const avgMonthly12m = Math.round((totalOut12m / 12) * 100) / 100;
    const avgMonthly6m  = Math.round((totalOut6m / 6) * 100) / 100;
    const avgMonthly3m  = Math.round((totalOut3m / 3) * 100) / 100;

    // 2b. Build 12-month month-by-month usage breakdown
    const monthNamesIndo = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agus', 'Sep', 'Okt', 'Nov', 'Des'];
    const monthlyMap = new Map<string, { monthKey: string; monthLabel: string; year: number; qty: number; transactions: { tanggal: string; qty: number; keterangan: string | null }[] }>();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const monthIdx = d.getMonth();
      const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
      const monthLabel = `${monthNamesIndo[monthIdx]} '${String(year).slice(-2)}`;
      monthlyMap.set(monthKey, { monthKey, monthLabel, year, qty: 0, transactions: [] });
    }

    outMovements.forEach((m) => {
      const dt = new Date(m.tanggal);
      const mKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap.has(mKey)) {
        const item = monthlyMap.get(mKey)!;
        item.qty += m.qty;
        item.transactions.push({
          tanggal: dt.toISOString().split('T')[0],
          qty: m.qty,
          keterangan: m.keterangan || null,
        });
      }
    });

    const monthlyBreakdown = Array.from(monthlyMap.values());
    let maxMonth = monthlyBreakdown[0];
    monthlyBreakdown.forEach((mb) => {
      if (mb.qty > maxMonth.qty) maxMonth = mb;
    });
    const peakMonthInfo = maxMonth && maxMonth.qty > 0 ? `${maxMonth.monthLabel} (${maxMonth.qty} ${sp.uom})` : '—';

    // 3. Spike & Trend Detection (Comparing 3m trend to 12m baseline)
    let spikeTrend: 'SPIKE_UP' | 'TREND_DOWN' | 'STABLE' = 'STABLE';
    let spikePercentage: string = '0%';

    if (avgMonthly12m > 0) {
      const ratio = avgMonthly3m / avgMonthly12m;
      if (ratio >= 1.4 && avgMonthly3m >= 0.5) {
        spikeTrend = 'SPIKE_UP';
        spikePercentage = `+${Math.round((ratio - 1) * 100)}%`;
      } else if (ratio <= 0.6) {
        spikeTrend = 'TREND_DOWN';
        spikePercentage = `-${Math.round((1 - ratio) * 100)}%`;
      }
    } else if (avgMonthly3m > 0) {
      spikeTrend = 'SPIKE_UP';
      spikePercentage = 'Baru Lonjak';
    }

    // 4. Select Effective Monthly Usage Based on Mode
    let avgMonthlyUsage: number;
    if (mode === '3M') {
      avgMonthlyUsage = avgMonthly3m;
    } else if (mode === '6M') {
      avgMonthlyUsage = avgMonthly6m;
    } else if (mode === '12M') {
      avgMonthlyUsage = avgMonthly12m;
    } else {
      // AUTO (Safety Anti-Spike): Pick the highest average among 12m, 6m, 3m
      avgMonthlyUsage = Math.max(avgMonthly12m, avgMonthly6m, avgMonthly3m);
    }
    const dailyUsage = avgMonthlyUsage / 30;

    // 5. Lead time (default 7 days if avgLeadTime <= 0)
    const leadTime = sp.avgLeadTime > 0 ? Math.round(sp.avgLeadTime * 10) / 10 : 7;

    // 6. Machine Vitality / Downtime Impact
    const isMesinProduksi = sp.mesins.length > 0;
    const vitalMesins = sp.mesins.filter((m) => m.vital);
    const isVital = isMesinProduksi && vitalMesins.length > 0;

    let dampakDowntime: 'STOP_TOTAL' | 'KURANGI_PRODUKTIVITAS' | 'CONSUMABLE';
    let tipePeruntukan: string;

    if (!isMesinProduksi) {
      dampakDowntime = 'CONSUMABLE';
      tipePeruntukan = 'Consumable (Bukan Mesin)';
    } else if (isVital) {
      dampakDowntime = 'STOP_TOTAL';
      tipePeruntukan = 'Mesin Vital (Produksi)';
    } else {
      dampakDowntime = 'KURANGI_PRODUKTIVITAS';
      tipePeruntukan = 'Mesin Non-Vital';
    }

    // 7. Pathway Logic: Jalur A (Normal) vs Jalur B (Kritis-Jaranger Keluar)
    const isJalurB = isVital && avgMonthlyUsage < slowThreshold;

    let jalur: 'Jalur A (Normal)' | 'Jalur B (Kritis-Slow)';
    let min: number;
    let max: number;
    let rop: number;
    let safetyStock: number = 0;
    let catatan: string | null = null;

    if (isJalurB) {
      jalur = 'Jalur B (Kritis-Slow)';
      min = sp.minQty > 0 ? sp.minQty : 1;
      max = min + 1;
      rop = min; // Begitu terpakai 1 unit, langsung reorder
      if (leadTime >= 14) {
        catatan = 'Pertimbangkan kontrak/blanket PO ke vendor';
      }
    } else {
      jalur = 'Jalur A (Normal)';
      safetyStock = dailyUsage * (0.20 * leadTime);
      rop = Math.ceil((dailyUsage * leadTime) + safetyStock);
      min = rop;
      max = Math.max(rop + 1, Math.ceil(rop + (avgMonthlyUsage * 2)));
    }

    // 8. Reorder Alert Trigger: Stock <= ROP
    const isWajibPr = currentStock <= rop;

    return {
      id: sp.id,
      nama: sp.nama,
      uom: sp.uom,
      lokasi: sp.lokasi || '-',
      harga: Number(sp.harga || 0),
      currentStock,
      isMesinProduksi,
      tipePeruntukan,
      mesins: sp.mesins.map((m) => ({ id: m.id, nama: m.nama, vital: m.vital })),
      isVital,
      vitalMesins: vitalMesins.map((m) => m.nama),
      dampakDowntime,
      totalOut12m,
      totalOut6m,
      totalOut3m,
      avgMonthly12m,
      avgMonthly6m,
      avgMonthly3m,
      spikeTrend,
      spikePercentage,
      monthlyBreakdown,
      peakMonthInfo,
      avgMonthlyUsage: Math.round(avgMonthlyUsage * 100) / 100,
      dailyUsage: Math.round(dailyUsage * 1000) / 1000,
      leadTime,
      jalur,
      min,
      max,
      rop,
      safetyStock: Math.round(safetyStock * 100) / 100,
      isWajibPr,
      catatan,
    };
  });

  // Sort: Wajib PR first, then Jalur B, then by avgMonthlyUsage desc
  result.sort((a, b) => {
    if (a.isWajibPr !== b.isWajibPr) return a.isWajibPr ? -1 : 1;
    if (a.jalur !== b.jalur) return a.jalur.includes('B') ? -1 : 1;
    return b.avgMonthlyUsage - a.avgMonthlyUsage;
  });

  return ok(result);
}
