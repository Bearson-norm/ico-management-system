import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth } from '@/lib/auth';
import * as XLSX from 'xlsx';

function isOpnameAdjustment(m: { keterangan?: string | null; purchaseType?: string | null }): boolean {
  if (m.purchaseType === 'opname_adjustment' || m.purchaseType === 'opname' || m.purchaseType === 'adjustment') {
    return true;
  }
  if (!m.keterangan) return false;
  const lower = m.keterangan.toLowerCase();
  return (
    lower.includes('[opname]') ||
    lower.includes('opname adjustment') ||
    lower.includes('hasil audit sesi') ||
    lower.includes('[adjust')
  );
}

export async function GET(req: NextRequest) {
  const session = await requireMtcAuth();
  if (!session) {
    return NextResponse.json({ error: 'Akses ditolak. Silakan login terlebih dahulu.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') ?? 'xlsx'; // 'xlsx' | 'csv'
  const mode = (searchParams.get('mode') || 'AUTO').toUpperCase(); // 12M | 6M | 3M | AUTO
  const slowThreshold = parseFloat(searchParams.get('slowThreshold') || '1.0');
  const search = (searchParams.get('search') ?? '').trim().toLowerCase();
  const filterJalur = (searchParams.get('filterJalur') ?? '').trim();
  const filterPeruntukan = (searchParams.get('filterPeruntukan') ?? 'ALL').trim();
  const onlyWajibPr = searchParams.get('onlyWajibPr') === 'true';

  const now = new Date();
  const startDate12m = new Date(now); startDate12m.setMonth(now.getMonth() - 12);
  const startDate6m  = new Date(now); startDate6m.setMonth(now.getMonth() - 6);
  const startDate3m  = new Date(now); startDate3m.setMonth(now.getMonth() - 3);
  const startDate1m  = new Date(now); startDate1m.setMonth(now.getMonth() - 1);

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
      kategori: { select: { nama: true } },
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
        },
        select: { tipe: true, qty: true, tanggal: true, keterangan: true, purchaseType: true },
      },
    },
    orderBy: { nama: 'asc' },
  });

  const processedData = spareparts.map((sp) => {
    const stockMovements = sp.movements.filter((m) => m.purchaseType !== 'histori-sheets');
    const totalIn = stockMovements.filter((m) => m.tipe === 'IN').reduce((sum, m) => sum + m.qty, 0);
    const totalOut = stockMovements.filter((m) => m.tipe === 'OUT').reduce((sum, m) => sum + m.qty, 0);
    const currentStock = totalIn - totalOut;

    const outMovements = sp.movements.filter((m) => m.tipe === 'OUT' && !isOpnameAdjustment(m));
    
    const totalOut12m = outMovements.filter((m) => new Date(m.tanggal) >= startDate12m).reduce((s, m) => s + m.qty, 0);
    const totalOut6m  = outMovements.filter((m) => new Date(m.tanggal) >= startDate6m).reduce((s, m) => s + m.qty, 0);
    const totalOut3m  = outMovements.filter((m) => new Date(m.tanggal) >= startDate3m).reduce((s, m) => s + m.qty, 0);
    const totalOut1m  = outMovements.filter((m) => new Date(m.tanggal) >= startDate1m).reduce((s, m) => s + m.qty, 0);

    const avgMonthly12m = Math.round((totalOut12m / 12) * 100) / 100;
    const avgMonthly6m  = Math.round((totalOut6m / 6) * 100) / 100;
    const avgMonthly3m  = Math.round((totalOut3m / 3) * 100) / 100;
    const avgMonthly1m  = Math.round(totalOut1m * 100) / 100;

    let avgMonthlyUsage: number;
    if (mode === '3M') {
      avgMonthlyUsage = avgMonthly3m;
    } else if (mode === '6M') {
      avgMonthlyUsage = avgMonthly6m;
    } else if (mode === '12M') {
      avgMonthlyUsage = avgMonthly12m;
    } else {
      avgMonthlyUsage = Math.max(avgMonthly12m, avgMonthly6m, avgMonthly3m);
    }
    const dailyUsage = avgMonthlyUsage / 30;

    const leadTime = sp.avgLeadTime > 0 ? Math.round(sp.avgLeadTime * 10) / 10 : 7;
    const isMesinProduksi = sp.mesins.length > 0;
    const vitalMesins = sp.mesins.filter((m) => m.vital);
    const isVital = isMesinProduksi && vitalMesins.length > 0;

    let tipePeruntukan: string;
    if (!isMesinProduksi) {
      tipePeruntukan = 'Consumable (Bukan Mesin)';
    } else if (isVital) {
      tipePeruntukan = 'Mesin Vital (Produksi)';
    } else {
      tipePeruntukan = 'Mesin Non-Vital';
    }

    const isJalurB = isVital && avgMonthlyUsage < slowThreshold;
    let jalur: 'Jalur A (Normal)' | 'Jalur B (Kritis-Slow)';
    let min: number;
    let max: number;
    let rop: number;
    let safetyStock: number = 0;

    const numMesins = sp.mesins.length;
    const intervalDays = totalOut12m > 0 ? (365 / totalOut12m) : 999;
    const isLongLeadTime = leadTime >= 30 || (intervalDays < 365 && leadTime > (intervalDays / 4));
    const isMultiMesin = numMesins > 1;

    if (isJalurB) {
      jalur = 'Jalur B (Kritis-Slow)';
      if (isMultiMesin) {
        min = Math.max(sp.minQty > 0 ? sp.minQty : 1, numMesins);
        max = min + 1;
        rop = min;
        safetyStock = min;
      } else if (isLongLeadTime) {
        min = Math.max(sp.minQty > 0 ? sp.minQty : 1, 2);
        max = min + 1;
        rop = min;
        safetyStock = min;
      } else {
        min = Math.max(sp.minQty > 0 ? sp.minQty : 1, 1);
        max = min + 1;
        rop = min;
        safetyStock = min;
      }
    } else {
      jalur = 'Jalur A (Normal)';
      const zScore = isVital ? 2.05 : 1.65;
      const stdDevMonthly = Math.sqrt(
        (Math.pow(avgMonthly3m - avgMonthlyUsage, 2) +
         Math.pow(avgMonthly6m - avgMonthlyUsage, 2) +
         Math.pow(avgMonthly12m - avgMonthlyUsage, 2)) / 3
      );
      const stdDevDaily = stdDevMonthly / 30;
      safetyStock = Math.ceil(zScore * stdDevDaily * Math.sqrt(leadTime));
      if (isVital && safetyStock < 1 && dailyUsage > 0) safetyStock = 1;

      rop = Math.ceil((dailyUsage * leadTime) + safetyStock);
      min = rop;
      max = Math.max(rop + 1, Math.ceil(rop + (avgMonthlyUsage * 2)));
    }

    const isWajibPr = currentStock <= rop;
    const hargaNum = Number(sp.harga) || 0;
    const totalNilaiStok = currentStock * hargaNum;

    return {
      id: sp.id,
      nama: sp.nama,
      kategori: sp.kategori?.nama || '-',
      uom: sp.uom || 'Pcs',
      lokasi: sp.lokasi || '-',
      harga: hargaNum,
      currentStock,
      totalNilaiStok,
      avgLeadTime: sp.avgLeadTime || 0,
      maxLeadTime: sp.maxLeadTime || 0,
      totalOut1m,
      avgMonthly1m,
      totalOut3m,
      avgMonthly3m,
      totalOut6m,
      avgMonthly6m,
      totalOut12m,
      avgMonthly12m,
      avgMonthlyUsage: Math.round(avgMonthlyUsage * 100) / 100,
      rop,
      safetyStock: Math.round(safetyStock * 100) / 100,
      min,
      max,
      isWajibPr,
      jalur,
      tipePeruntukan,
      mesinList: sp.mesins.map((m) => m.nama).join(', ') || '-',
      isVital: isVital ? 'Ya (Vital)' : 'Tidak',
    };
  });

  // Apply filters
  const filtered = processedData.filter((item) => {
    if (search) {
      const matchSearch =
        item.nama.toLowerCase().includes(search) ||
        item.id.toLowerCase().includes(search) ||
        item.kategori.toLowerCase().includes(search) ||
        item.lokasi.toLowerCase().includes(search) ||
        item.mesinList.toLowerCase().includes(search);
      if (!matchSearch) return false;
    }
    if (filterJalur) {
      if (filterJalur === 'JALUR_A' && !item.jalur.includes('A')) return false;
      if (filterJalur === 'JALUR_B' && !item.jalur.includes('B')) return false;
    }
    if (filterPeruntukan === 'MESIN' && item.tipePeruntukan.includes('Consumable')) return false;
    if (filterPeruntukan === 'BUKAN_MESIN' && !item.tipePeruntukan.includes('Consumable')) return false;
    if (onlyWajibPr && !item.isWajibPr) return false;
    return true;
  });

  // Build rows for export
  const exportRows = filtered.map((item, idx) => ({
    'No': idx + 1,
    'Item ID': item.id,
    'Nama Sparepart': item.nama,
    'Kategori': item.kategori,
    'UOM': item.uom,
    'Lokasi Rak': item.lokasi,
    'Harga Satuan (Rp)': item.harga,
    'Stok Saat Ini': item.currentStock,
    'Total Nilai Stok (Rp)': item.totalNilaiStok,
    'Avg Lead Time (Hari)': item.avgLeadTime,
    'Max Lead Time (Hari)': item.maxLeadTime,
    'Avg Consume 1 Bulan (1M)': item.avgMonthly1m,
    'Avg Consume 3 Bulan (3M)': item.avgMonthly3m,
    'Avg Consume 6 Bulan (6M)': item.avgMonthly6m,
    'Avg Consume 12 Bulan (12M)': item.avgMonthly12m,
    'Total Pakai 1 Bulan': item.totalOut1m,
    'Total Pakai 3 Bulan': item.totalOut3m,
    'Total Pakai 6 Bulan': item.totalOut6m,
    'Total Pakai 12 Bulan': item.totalOut12m,
    'Avg Monthly Usage (Acuan ROP)': item.avgMonthlyUsage,
    'Reorder Point (ROP)': item.rop,
    'Safety Stock': item.safetyStock,
    'Min Qty': item.min,
    'Max Qty': item.max,
    'Status Reorder': item.isWajibPr ? 'WAJIB REORDER / PR' : 'AMAN',
    'Klasifikasi Stok': item.jalur,
    'Tipe Peruntukan': item.tipePeruntukan,
    'Mesin Terkait': item.mesinList,
    'Mesin Vital': item.isVital,
  }));

  const nowJakarta = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/[/: ]/g, '-');
  const filename = `Analisis_LeadTime_dan_Konsumsi_Sparepart_${nowJakarta}`;

  if (format === 'csv') {
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    });
  }

  // Format XLSX
  const wb = XLSX.utils.book_new();
  const wsData = XLSX.utils.json_to_sheet(exportRows);

  // Set column widths
  wsData['!cols'] = [
    { wch: 5 },  // No
    { wch: 14 }, // Item ID
    { wch: 35 }, // Nama Sparepart
    { wch: 18 }, // Kategori
    { wch: 8 },  // UOM
    { wch: 14 }, // Lokasi Rak
    { wch: 16 }, // Harga Satuan
    { wch: 14 }, // Stok Saat Ini
    { wch: 20 }, // Total Nilai Stok
    { wch: 20 }, // Avg Lead Time (Hari)
    { wch: 20 }, // Max Lead Time (Hari)
    { wch: 24 }, // Avg Consume 1 Bulan
    { wch: 24 }, // Avg Consume 3 Bulan
    { wch: 24 }, // Avg Consume 6 Bulan
    { wch: 24 }, // Avg Consume 12 Bulan
    { wch: 18 }, // Total Pakai 1B
    { wch: 18 }, // Total Pakai 3B
    { wch: 18 }, // Total Pakai 6B
    { wch: 18 }, // Total Pakai 12B
    { wch: 26 }, // Avg Monthly Usage
    { wch: 18 }, // ROP
    { wch: 14 }, // Safety Stock
    { wch: 10 }, // Min
    { wch: 10 }, // Max
    { wch: 22 }, // Status Reorder
    { wch: 24 }, // Klasifikasi Stok
    { wch: 26 }, // Tipe Peruntukan
    { wch: 35 }, // Mesin Terkait
    { wch: 14 }, // Mesin Vital
  ];

  XLSX.utils.book_append_sheet(wb, wsData, 'Analisis Sparepart');

  // Sheet 2: Info & Ringkasan
  const totalItems = exportRows.length;
  const totalWajibPr = exportRows.filter((r) => r['Status Reorder'] === 'WAJIB REORDER / PR').length;
  const totalValuation = exportRows.reduce((sum, r) => sum + r['Total Nilai Stok (Rp)'], 0);

  const infoRows = [
    { 'Parameter': 'Judul Laporan', 'Nilai': 'Analisis Lead Time Pengadaan & Konsumsi Multi-Periode Sparepart' },
    { 'Parameter': 'Waktu Export', 'Nilai': new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) },
    { 'Parameter': 'Mode Perhitungan Konsumsi', 'Nilai': mode },
    { 'Parameter': 'Slow-Moving Threshold', 'Nilai': `${slowThreshold} unit/bulan` },
    { 'Parameter': 'Total Item Sparepart', 'Nilai': totalItems },
    { 'Parameter': 'Item Wajib PR / Reorder Segera', 'Nilai': totalWajibPr },
    { 'Parameter': 'Total Nilai Valuasi Stok', 'Nilai': `Rp ${totalValuation.toLocaleString('id-ID')}` },
    { 'Parameter': '', 'Nilai': '' },
    { 'Parameter': 'Keterangan Kolom Lead Time', 'Nilai': 'Dihitung secara riil dari tanggal submit PR di Odoo sampai tanggal selesai penerimaan GR (surat jalan).' },
    { 'Parameter': 'Keterangan Konsumsi 1M, 3M, 6M, 12M', 'Nilai': 'Rata-rata konsumsi per bulan dari transaksi mutasi keluar (OUT) aktual teknisi, mengecualikan selisih opname.' },
    { 'Parameter': 'Formula Reorder Point (ROP)', 'Nilai': 'ROP = (Konsumsi Harian * Lead Time Riil) + Safety Stock' },
  ];

  const wsInfo = XLSX.utils.json_to_sheet(infoRows);
  wsInfo['!cols'] = [{ wch: 32 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Info & Ringkasan');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  });
}
