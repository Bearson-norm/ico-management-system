import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth } from '@/lib/auth';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const session = await requireMtcAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipe = searchParams.get('tipe') ?? ''; // '', 'IN', 'OUT', 'LOG'
  const kategoriOut = searchParams.get('kategoriOut') ?? '';
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const format = searchParams.get('format') ?? 'xlsx'; // 'xlsx' | 'csv'

  let kategoriFilter = {};
  if (kategoriOut === 'UNCATEGORIZED' || kategoriOut === 'Belum Dikategorikan') {
    kategoriFilter = {
      OR: [
        { kategoriOut: null },
        { kategoriOut: '' },
      ],
    };
  } else if (kategoriOut) {
    kategoriFilter = { kategoriOut };
  }

  const where = {
    NOT: {
      keterangan: { contains: '[SILENT]' },
    },
    ...(tipe ? { tipe: tipe as 'IN' | 'OUT' | 'LOG' } : {}),
    ...kategoriFilter,
    ...(dateFrom || dateTo
      ? {
          tanggal: {
            ...(dateFrom ? { gte: new Date(dateFrom + 'T00:00:00') } : {}),
            ...(dateTo ? { lte: new Date(dateTo + 'T23:59:59') } : {}),
          },
        }
      : {}),
  };

  const data = await prisma.stockMovement.findMany({
    where,
    include: { sparepart: true, pic: true, report: { include: { mesin: true } } },
    orderBy: { tanggal: 'desc' },
  });

  // Build rows
  const rows = data.map((d, i) => {
    let mesinNama = d.report?.mesin?.nama ?? '';
    if (!mesinNama && d.keterangan) {
      const match = d.keterangan.match(/\[Mesin:\s*([^\]]+)\]/i);
      if (match) mesinNama = match[1].trim();
    }

    const hargaSatuan = d.harga ? Number(d.harga) : 0;
    const totalBiaya = hargaSatuan * d.qty;

    return {
      'No': i + 1,
      'Tanggal': new Date(d.tanggal).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }),
      'Waktu': new Date(d.createdAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }),
      'Tipe': d.tipe,
      'Kategori OUT': d.kategoriOut || (d.tipe === 'OUT' ? 'Belum Dikategorikan' : ''),
      'ID Sparepart': d.sparepartId ?? '',
      'Nama Item': d.sparepart?.nama ?? d.namaItem ?? '',
      'Qty': d.qty,
      'Harga Satuan (Rp)': hargaSatuan,
      'Total Biaya (Rp)': totalBiaya,
      'PIC': d.pic?.nama ?? '',
      'No Report': d.noReport ?? '',
      'Mesin': mesinNama,
      'Jenis Pembelian': d.purchaseType ?? '',
      'Vendor': d.vendor ?? '',
      'Keterangan': d.keterangan ?? '',
    };
  });

  // Build filename
  const tipeLabel = tipe || 'SEMUA';
  const catLabel = kategoriOut ? `_${kategoriOut.replace(/\s+/g, '-')}` : '';
  const fromLabel = dateFrom ? dateFrom.replace(/-/g, '') : 'awal';
  const toLabel = dateTo ? dateTo.replace(/-/g, '') : 'akhir';
  const filename = `StokHistory_${tipeLabel}${catLabel}_${fromLabel}-${toLabel}`;

  if (format === 'csv') {
    // CSV format
    if (rows.length === 0) {
      return new NextResponse(
        'No,Tanggal,Waktu,Tipe,Kategori OUT,ID Sparepart,Nama Item,Qty,Harga Satuan (Rp),Total Biaya (Rp),PIC,No Report,Mesin,Jenis Pembelian,Vendor,Keterangan\n',
        {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}.csv"`,
          },
        }
      );
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    return new NextResponse('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    });
  }

  // Excel format
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 5 },  // No
    { wch: 13 }, // Tanggal
    { wch: 8 },  // Waktu
    { wch: 6 },  // Tipe
    { wch: 22 }, // Kategori OUT
    { wch: 14 }, // ID SP
    { wch: 40 }, // Nama Item
    { wch: 6 },  // Qty
    { wch: 16 }, // Harga Satuan
    { wch: 18 }, // Total Biaya
    { wch: 14 }, // PIC
    { wch: 16 }, // No Report
    { wch: 25 }, // Mesin
    { wch: 14 }, // Jenis Pembelian
    { wch: 30 }, // Vendor
    { wch: 60 }, // Keterangan
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Transaksi');

  // Sheet 2: Rekap Mingguan OUT (Rekapitulasi Pengeluaran)
  const outRows = data.filter((d) => d.tipe === 'OUT');
  const catStats: Record<string, { count: number; qty: number; totalRp: number }> = {
    'Maintenance Produksi': { count: 0, qty: 0, totalRp: 0 },
    'Utility': { count: 0, qty: 0, totalRp: 0 },
    'WO': { count: 0, qty: 0, totalRp: 0 },
    'Belum Dikategorikan': { count: 0, qty: 0, totalRp: 0 },
  };

  let grandTotalRp = 0;
  let grandTotalQty = 0;

  for (const d of outRows) {
    const q = d.qty || 0;
    const h = d.harga ? Number(d.harga) : 0;
    const subtotal = q * h;
    grandTotalQty += q;
    grandTotalRp += subtotal;

    const cat = d.kategoriOut || 'Belum Dikategorikan';
    if (!catStats[cat]) {
      catStats[cat] = { count: 0, qty: 0, totalRp: 0 };
    }
    catStats[cat].count += 1;
    catStats[cat].qty += q;
    catStats[cat].totalRp += subtotal;
  }

  const recapData: any[] = [
    {
      'Kategori Pengeluaran': 'Maintenance Produksi',
      'Jml Transaksi': catStats['Maintenance Produksi'].count,
      'Total Qty': catStats['Maintenance Produksi'].qty,
      'Total Biaya (Rp)': catStats['Maintenance Produksi'].totalRp,
      'Persentase': grandTotalRp > 0 ? `${((catStats['Maintenance Produksi'].totalRp / grandTotalRp) * 100).toFixed(1)}%` : '0%',
    },
    {
      'Kategori Pengeluaran': 'Utility',
      'Jml Transaksi': catStats['Utility'].count,
      'Total Qty': catStats['Utility'].qty,
      'Total Biaya (Rp)': catStats['Utility'].totalRp,
      'Persentase': grandTotalRp > 0 ? `${((catStats['Utility'].totalRp / grandTotalRp) * 100).toFixed(1)}%` : '0%',
    },
    {
      'Kategori Pengeluaran': 'WO',
      'Jml Transaksi': catStats['WO'].count,
      'Total Qty': catStats['WO'].qty,
      'Total Biaya (Rp)': catStats['WO'].totalRp,
      'Persentase': grandTotalRp > 0 ? `${((catStats['WO'].totalRp / grandTotalRp) * 100).toFixed(1)}%` : '0%',
    },
  ];

  if (catStats['Belum Dikategorikan'].count > 0) {
    recapData.push({
      'Kategori Pengeluaran': 'Belum Dikategorikan ⚠️',
      'Jml Transaksi': catStats['Belum Dikategorikan'].count,
      'Total Qty': catStats['Belum Dikategorikan'].qty,
      'Total Biaya (Rp)': catStats['Belum Dikategorikan'].totalRp,
      'Persentase': grandTotalRp > 0 ? `${((catStats['Belum Dikategorikan'].totalRp / grandTotalRp) * 100).toFixed(1)}%` : '0%',
    });
  }

  recapData.push({
    'Kategori Pengeluaran': 'TOTAL PENGELUARAN (OUT)',
    'Jml Transaksi': outRows.length,
    'Total Qty': grandTotalQty,
    'Total Biaya (Rp)': grandTotalRp,
    'Persentase': '100%',
  });

  const wsRecap = XLSX.utils.json_to_sheet(recapData);
  wsRecap['!cols'] = [
    { wch: 28 }, // Kategori
    { wch: 15 }, // Jml Transaksi
    { wch: 14 }, // Total Qty
    { wch: 20 }, // Total Biaya
    { wch: 14 }, // Persentase
  ];
  XLSX.utils.book_append_sheet(wb, wsRecap, 'Rekapitulasi Mingguan OUT');

  // Add info sheet
  const infoData = [
    { 'Info': 'Diekspor pada', 'Nilai': new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) },
    { 'Info': 'Filter Tipe', 'Nilai': tipeLabel },
    { 'Info': 'Filter Kategori', 'Nilai': kategoriOut || 'Semua Kategori' },
    { 'Info': 'Periode Dari', 'Nilai': dateFrom ?? '(awal)' },
    { 'Info': 'Periode Sampai', 'Nilai': dateTo ?? '(akhir)' },
    { 'Info': 'Total Transaksi Diekspor', 'Nilai': rows.length },
    { 'Info': 'Total Pengeluaran OUT (Rp)', 'Nilai': grandTotalRp.toLocaleString('id-ID') },
    { 'Info': 'Total Qty OUT', 'Nilai': grandTotalQty },
  ];
  const wsInfo = XLSX.utils.json_to_sheet(infoData);
  wsInfo['!cols'] = [{ wch: 26 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Info Export');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  });
}
