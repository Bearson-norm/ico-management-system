import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth } from '@/lib/auth';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const session = await requireMtcAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipe = searchParams.get('tipe') ?? ''; // '', 'IN', 'OUT', 'LOG'
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const format = searchParams.get('format') ?? 'xlsx'; // 'xlsx' | 'csv'

  const where = {
    ...(tipe ? { tipe: tipe as 'IN' | 'OUT' | 'LOG' } : {}),
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

    return {
      'No': i + 1,
      'Tanggal': new Date(d.tanggal).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }),
      'Waktu': new Date(d.createdAt).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }),
      'Tipe': d.tipe,
      'ID Sparepart': d.sparepartId ?? '',
      'Nama Item': d.sparepart?.nama ?? d.namaItem ?? '',
      'Qty': d.qty,
      'Harga (Rp)': d.harga ? Number(d.harga) : 0,
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
  const fromLabel = dateFrom ? dateFrom.replace(/-/g, '') : 'awal';
  const toLabel = dateTo ? dateTo.replace(/-/g, '') : 'akhir';
  const filename = `StokHistory_${tipeLabel}_${fromLabel}-${toLabel}`;

  if (format === 'csv') {
    // CSV format
    if (rows.length === 0) {
      return new NextResponse('No,Tanggal,Waktu,Tipe,ID Sparepart,Nama Item,Qty,Harga (Rp),PIC,No Report,Jenis Pembelian,Vendor,Keterangan\n', {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      });
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
    { wch: 14 }, // ID SP
    { wch: 40 }, // Nama Item
    { wch: 6 },  // Qty
    { wch: 16 }, // Harga
    { wch: 14 }, // PIC
    { wch: 16 }, // No Report
    { wch: 25 }, // Mesin
    { wch: 14 }, // Jenis Pembelian
    { wch: 30 }, // Vendor
    { wch: 60 }, // Keterangan
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Stok');

  // Add info sheet
  const infoData = [
    { 'Info': 'Diekspor pada', 'Nilai': new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) },
    { 'Info': 'Filter Tipe', 'Nilai': tipeLabel },
    { 'Info': 'Periode Dari', 'Nilai': dateFrom ?? '(awal)' },
    { 'Info': 'Periode Sampai', 'Nilai': dateTo ?? '(akhir)' },
    { 'Info': 'Total Data', 'Nilai': rows.length },
  ];
  const wsInfo = XLSX.utils.json_to_sheet(infoData);
  wsInfo['!cols'] = [{ wch: 20 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Info Export');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  });
}
