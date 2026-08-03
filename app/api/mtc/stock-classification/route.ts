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
  const bulan = Math.max(1, parseInt(searchParams.get('bulan') || '12', 10));
  const slowThreshold = parseFloat(searchParams.get('slowThreshold') || '1.0');

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - bulan);

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
        select: { tipe: true, qty: true, tanggal: true },
      },
    },
    orderBy: { nama: 'asc' },
  });

  const result = spareparts.map((sp) => {
    // 1. Current physical stock
    const totalIn = sp.movements.filter((m) => m.tipe === 'IN').reduce((sum, m) => sum + m.qty, 0);
    const totalOut = sp.movements.filter((m) => m.tipe === 'OUT').reduce((sum, m) => sum + m.qty, 0);
    const currentStock = totalIn - totalOut;

    // 2. Movements OUT within analysis period (last N months)
    const periodOutMovements = sp.movements.filter(
      (m) => m.tipe === 'OUT' && new Date(m.tanggal) >= startDate
    );
    const totalOutPeriod = periodOutMovements.reduce((sum, m) => sum + m.qty, 0);
    const freqOutPeriod = periodOutMovements.length;

    // 3. Avg Monthly & Daily Usage
    const avgMonthlyUsage = totalOutPeriod / bulan;
    const dailyUsage = avgMonthlyUsage / 30;

    // 4. Lead time (default 7 days if avgLeadTime <= 0)
    const leadTime = sp.avgLeadTime > 0 ? Math.round(sp.avgLeadTime * 10) / 10 : 7;

    // 5. Machine Vitality / Downtime Impact
    const vitalMesins = sp.mesins.filter((m) => m.vital);
    const isVital = vitalMesins.length > 0;
    const dampakDowntime = isVital ? 'STOP_TOTAL' : 'KURANGI_PRODUKTIVITAS';

    // 6. Pathway Logic: Jalur A (Normal) vs Jalur B (Kritis-Jaranger Keluar)
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

    // 7. Reorder Alert Trigger: Stock <= ROP
    const isWajibPr = currentStock <= rop;

    return {
      id: sp.id,
      nama: sp.nama,
      uom: sp.uom,
      lokasi: sp.lokasi || '-',
      harga: Number(sp.harga || 0),
      currentStock,
      mesins: sp.mesins.map((m) => ({ id: m.id, nama: m.nama, vital: m.vital })),
      isVital,
      vitalMesins: vitalMesins.map((m) => m.nama),
      dampakDowntime,
      freqOutPeriod,
      totalOutPeriod,
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
