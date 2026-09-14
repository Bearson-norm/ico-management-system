import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth } from '@/lib/auth';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const session = await requireMtcAuth();
  if (!session) {
    return NextResponse.json({ error: 'Akses ditolak. Silakan login terlebih dahulu.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') ?? 'xlsx'; // 'xlsx' | 'csv'
  const filterStatus = searchParams.get('status'); // e.g. 'PO' | 'DONE' | null

  try {
    const whereClause: any = {
      nomorPo: {
        not: null,
      },
    };

    if (filterStatus) {
      whereClause.statusPo = filterStatus;
    }

    const items = await prisma.procurementTracking.findMany({
      where: whereClause,
      orderBy: [
        { nomorPo: 'desc' },
        { id: 'asc' },
      ],
    });

    // Saring yang nomorPo bukan string kosong
    const validItems = items.filter((it) => it.nomorPo && it.nomorPo.trim() !== '');

    const mapItemToRow = (it: typeof items[0], idx: number) => ({
      No: idx + 1,
      'Nomor PO': it.nomorPo?.trim() || '-',
      'Nomor PR': it.nomorPr?.trim() || '-',
      'Nomor TE': it.nomorTe?.trim() || '-',
      Vendor: it.vendor?.trim() || '-',
      'Status PO': it.statusPo?.trim() || 'DRAFT',
      'Status PR': it.statusPr?.trim() || 'DRAFT',
      'Nama Barang': it.originalName?.trim() || '-',
      Qty: it.qty,
      'Harga Satuan (Rp)': Number(it.harga) || 0,
      'Total Biaya (Rp)': (Number(it.harga) || 0) * it.qty,
      'Tgl Pengajuan': it.tanggalList ? it.tanggalList.toISOString().split('T')[0] : '-',
      'Tgl Terima': it.tanggalTerima ? it.tanggalTerima.toISOString().split('T')[0] : '-',
      'Link GR Odoo': it.linkGr || '-',
    });

    const ongoingItems = validItems.filter((it) => it.statusPo === 'PO');
    const allRows = validItems.map(mapItemToRow);
    const ongoingRows = ongoingItems.map(mapItemToRow);

    const nowStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const filename = `Rekap_PO_PR_TE_MTC_${nowStr}`;

    if (format === 'csv') {
      const targetRows = filterStatus === 'PO' ? ongoingRows : allRows;
      const ws = XLSX.utils.json_to_sheet(targetRows);
      const csv = XLSX.utils.sheet_to_csv(ws);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      });
    }

    // Default: XLSX with 2 Sheets
    const wb = XLSX.utils.book_new();

    // Sheet 1: PO On-Going (khusus bahan Follow Up)
    const wsOngoing = XLSX.utils.json_to_sheet(ongoingRows);
    const colWidths = [
      { wch: 6 },  // No
      { wch: 14 }, // Nomor PO
      { wch: 14 }, // Nomor PR
      { wch: 14 }, // Nomor TE
      { wch: 32 }, // Vendor
      { wch: 12 }, // Status PO
      { wch: 12 }, // Status PR
      { wch: 45 }, // Nama Barang
      { wch: 8 },  // Qty
      { wch: 18 }, // Harga Satuan
      { wch: 20 }, // Total Biaya
      { wch: 14 }, // Tgl Pengajuan
      { wch: 14 }, // Tgl Terima
      { wch: 30 }, // Link GR
    ];
    wsOngoing['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, wsOngoing, 'PO On-Going (Follow Up)');

    // Sheet 2: Semua Rekap PO
    const wsAll = XLSX.utils.json_to_sheet(allRows);
    wsAll['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, wsAll, 'Semua Rekap PO');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Error generating PO-PR-TE export:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
