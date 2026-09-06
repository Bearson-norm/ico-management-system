import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth } from '@/lib/auth';
import * as XLSX from 'xlsx';

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
}

function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

export async function GET(req: NextRequest) {
  const session = await requireMtcAuth();
  if (!session) {
    return NextResponse.json({ error: 'Akses ditolak. Silakan login terlebih dahulu.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab') ?? 'sparepart'; // 'sparepart' | 'mesin' | 'teknisi' | 'kategori' | 'bom' | 'all'
  const format = searchParams.get('format') ?? 'xlsx'; // 'xlsx' | 'csv'
  const search = (searchParams.get('search') ?? '').trim();
  const kategoriFilter = (searchParams.get('kategori') ?? '').trim();
  const mesinFilter = (searchParams.get('mesin') ?? '').trim();
  const statusFilter = (searchParams.get('status') ?? '').trim(); // 'aktif' | 'nonaktif'
  const pengadaanFilter = (searchParams.get('pengadaan') ?? '').trim(); // 'PR' | 'PO' | 'NONE'
  const tipeMesinFilter = (searchParams.get('tipeMesin') ?? '').trim();

  const nowJakarta = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }).replace(/[/: ]/g, '-');

  // Helper to fetch sparepart data
  const fetchSpareparts = async () => {
    const where: any = {};
    if (search) {
      where.OR = [
        { nama: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        { lokasi: { contains: search, mode: 'insensitive' } },
        { kategori: { nama: { contains: search, mode: 'insensitive' } } },
        { mesins: { some: { nama: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    if (kategoriFilter) {
      where.kategori = { nama: kategoriFilter };
    }
    if (mesinFilter) {
      where.mesins = { some: { nama: mesinFilter } };
    }
    if (statusFilter === 'aktif') {
      where.aktif = true;
    } else if (statusFilter === 'nonaktif') {
      where.aktif = false;
    }
    if (pengadaanFilter) {
      where.purchasingStatus = pengadaanFilter;
    }

    const rows = await prisma.sparepart.findMany({
      where,
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
      orderBy: { id: 'asc' },
    });

    return rows.map((sp, idx) => {
      const totalIn = sp.movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
      const totalOut = sp.movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + m.qty, 0);
      const currentStock = totalIn - totalOut;
      const hargaNum = Number(sp.harga) || 0;
      const totalNilai = currentStock * hargaNum;

      return {
        'No': idx + 1,
        'Item ID': sp.id,
        'Nama Sparepart': sp.nama,
        'Nama Alias': sp.namaAlias || '',
        'Kategori': sp.kategori?.nama || '',
        'UOM': sp.uom || 'Pcs',
        'Lokasi Rak': sp.lokasi || '',
        'Stok Saat Ini': currentStock,
        'Min Qty': sp.minQty ?? 0,
        'Harga Satuan (Rp)': hargaNum,
        'Total Nilai Stok (Rp)': totalNilai,
        'Status': sp.aktif ? 'Aktif' : 'Nonaktif',
        'Mesin Terkait': sp.mesins.map((m) => m.nama).join(', '),
        'Status Pengadaan': sp.purchasingStatus || 'NONE',
        'Qty Pengadaan': sp.purchasingQty || 0,
        'No PR': sp.purchasingNoPr || '',
        'Tanggal PR': formatDate(sp.prDate),
        'No PO': sp.purchasingNoPo || '',
        'Tanggal PO': formatDate(sp.poDate),
        'Max Lead Time (Hari)': sp.maxLeadTime || 0,
        'Avg Lead Time (Hari)': sp.avgLeadTime || 0,
        'Link Referensi': sp.linkReference || '',
        'Alasan / Catatan': sp.alasan || '',
      };
    });
  };

  // Helper to fetch mesin data
  const fetchMesins = async () => {
    const where: any = {};
    if (search) {
      where.OR = [
        { nama: { contains: search, mode: 'insensitive' } },
        { area: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (statusFilter === 'aktif') {
      where.aktif = true;
    } else if (statusFilter === 'nonaktif') {
      where.aktif = false;
    }
    if (tipeMesinFilter) {
      where.tipe = tipeMesinFilter;
    }

    const rows = await prisma.mesin.findMany({
      where,
      include: {
        spareparts: { select: { id: true, nama: true } },
        reports: { select: { id: true } },
      },
      orderBy: { nama: 'asc' },
    });

    return rows.map((m, idx) => ({
      'No': idx + 1,
      'ID Mesin': m.id,
      'Nama Mesin': m.nama,
      'Area / Lokasi': m.area || '-',
      'Tipe Mesin': m.tipe || 'perbaikan',
      'Mesin Vital (Jalur Utama)': m.vital ? 'Ya' : 'Tidak',
      'Status': m.aktif ? 'Aktif' : 'Nonaktif',
      'Jumlah Sparepart Terdaftar': m.spareparts.length,
      'Jumlah Riwayat Maintenance': m.reports.length,
      'Daftar Sparepart': m.spareparts.map((sp) => sp.nama).join(', '),
      'Tanggal Terdaftar': formatDate(m.createdAt),
    }));
  };

  // Helper to fetch teknisi data
  const fetchTeknisis = async () => {
    const where: any = {};
    if (search) {
      where.nama = { contains: search, mode: 'insensitive' };
    }
    if (statusFilter === 'aktif') {
      where.aktif = true;
    } else if (statusFilter === 'nonaktif') {
      where.aktif = false;
    }

    const rows = await prisma.teknisi.findMany({
      where,
      include: {
        reports: { select: { id: true } },
        movements: { select: { id: true } },
      },
      orderBy: { nama: 'asc' },
    });

    return rows.map((t, idx) => ({
      'No': idx + 1,
      'ID Teknisi': t.id,
      'Nama Teknisi': t.nama,
      'Status': t.aktif ? 'Aktif' : 'Nonaktif',
      'Total Laporan Maintenance': t.reports.length,
      'Total Transaksi Stok': t.movements.length,
      'Tanggal Dibuat': formatDate(t.createdAt),
    }));
  };

  // Helper to fetch kategori data
  const fetchKategoris = async () => {
    const where: any = {};
    if (search) {
      where.nama = { contains: search, mode: 'insensitive' };
    }

    const rows = await prisma.kategori.findMany({
      where,
      include: {
        spareparts: { select: { id: true } },
        reports: { select: { id: true } },
      },
      orderBy: { nama: 'asc' },
    });

    return rows.map((k, idx) => ({
      'No': idx + 1,
      'ID Kategori': k.id,
      'Nama Kategori': k.nama,
      'Tipe Kategori': k.tipe || 'umum',
      'Jumlah Sparepart': k.spareparts.length,
      'Jumlah Laporan Maintenance': k.reports.length,
      'Tanggal Dibuat': formatDate(k.createdAt),
    }));
  };

  // Helper to fetch BOM data (BOM per Mesin)
  const fetchBom = async () => {
    const where: any = {
      ...(search
        ? {
            OR: [
              { nama: { contains: search, mode: 'insensitive' } },
              { area: { contains: search, mode: 'insensitive' } },
              { spareparts: { some: { nama: { contains: search, mode: 'insensitive' } } } },
              { spareparts: { some: { id: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const mesins = await prisma.mesin.findMany({
      where,
      include: {
        spareparts: {
          include: {
            kategori: true,
            movements: {
              where: {
                tipe: { in: ['IN', 'OUT'] },
                OR: [{ purchaseType: null }, { purchaseType: { not: 'histori-sheets' } }],
              },
              select: { tipe: true, qty: true },
            },
          },
          orderBy: { nama: 'asc' },
        },
      },
      orderBy: { nama: 'asc' },
    });

    const rows: any[] = [];
    let counter = 1;

    for (const m of mesins) {
      if (m.spareparts.length === 0) {
        rows.push({
          'No': counter++,
          'ID Mesin': m.id,
          'Nama Mesin': m.nama,
          'Area Mesin': m.area || '-',
          'Tipe Mesin': m.tipe,
          'Mesin Vital': m.vital ? 'Ya' : 'Tidak',
          'Item ID Sparepart': '-',
          'Nama Sparepart': '(Belum ada sparepart terdaftar)',
          'Nama Alias': '-',
          'Kategori': '-',
          'UOM': '-',
          'Stok Saat Ini': 0,
          'Min Qty': 0,
          'Lokasi Rak': '-',
          'Harga Satuan (Rp)': 0,
          'Status Sparepart': '-',
        });
      } else {
        for (const sp of m.spareparts) {
          const totalIn = sp.movements.filter((mv) => mv.tipe === 'IN').reduce((s, mv) => s + mv.qty, 0);
          const totalOut = sp.movements.filter((mv) => mv.tipe === 'OUT').reduce((s, mv) => s + mv.qty, 0);
          const currentStock = totalIn - totalOut;

          rows.push({
            'No': counter++,
            'ID Mesin': m.id,
            'Nama Mesin': m.nama,
            'Area Mesin': m.area || '-',
            'Tipe Mesin': m.tipe,
            'Mesin Vital': m.vital ? 'Ya' : 'Tidak',
            'Item ID Sparepart': sp.id,
            'Nama Sparepart': sp.nama,
            'Nama Alias': sp.namaAlias || '',
            'Kategori': sp.kategori?.nama || '',
            'UOM': sp.uom || 'Pcs',
            'Stok Saat Ini': currentStock,
            'Min Qty': sp.minQty ?? 0,
            'Lokasi Rak': sp.lokasi || '',
            'Harga Satuan (Rp)': Number(sp.harga) || 0,
            'Status Sparepart': sp.aktif ? 'Aktif' : 'Nonaktif',
          });
        }
      }
    }

    return rows;
  };

  // Helper to set column widths
  const applyColWidths = (ws: XLSX.WorkSheet, colWidths: number[]) => {
    ws['!cols'] = colWidths.map((w) => ({ wch: w }));
  };

  // Case 1: All tabs combined into multi-sheet Excel
  if (tab === 'all') {
    const wb = XLSX.utils.book_new();

    const [sparepartsData, mesinsData, teknisisData, kategorisData, bomData] = await Promise.all([
      fetchSpareparts(),
      fetchMesins(),
      fetchTeknisis(),
      fetchKategoris(),
      fetchBom(),
    ]);

    // 1. Sparepart Sheet
    const wsSparepart = XLSX.utils.json_to_sheet(sparepartsData);
    applyColWidths(wsSparepart, [5, 16, 35, 25, 20, 8, 14, 14, 10, 18, 22, 10, 30, 16, 14, 18, 14, 18, 14, 15, 15, 30, 30]);
    XLSX.utils.book_append_sheet(wb, wsSparepart, 'Master Sparepart');

    // 2. Mesin Sheet
    const wsMesin = XLSX.utils.json_to_sheet(mesinsData);
    applyColWidths(wsMesin, [5, 10, 30, 20, 15, 15, 12, 18, 18, 40, 16]);
    XLSX.utils.book_append_sheet(wb, wsMesin, 'Master Mesin');

    // 3. Teknisi Sheet
    const wsTeknisi = XLSX.utils.json_to_sheet(teknisisData);
    applyColWidths(wsTeknisi, [5, 12, 30, 12, 20, 20, 16]);
    XLSX.utils.book_append_sheet(wb, wsTeknisi, 'Master Teknisi');

    // 4. Kategori Sheet
    const wsKategori = XLSX.utils.json_to_sheet(kategorisData);
    applyColWidths(wsKategori, [5, 12, 25, 15, 18, 20, 16]);
    XLSX.utils.book_append_sheet(wb, wsKategori, 'Master Kategori');

    // 5. BOM Sheet
    const wsBom = XLSX.utils.json_to_sheet(bomData);
    applyColWidths(wsBom, [5, 10, 25, 18, 15, 12, 16, 32, 20, 18, 8, 14, 10, 14, 18, 12]);
    XLSX.utils.book_append_sheet(wb, wsBom, 'BOM Mesin');

    // 6. Metadata / Info Sheet
    const user = session.user as any;
    const userName = user?.name ? `${user.name} (${user.email || ''})` : (user?.email || 'User');
    const infoRows = [
      { 'Keterangan': 'Dokumen', 'Nilai': 'Seluruh Master Data MTC (Multi-Sheet)' },
      { 'Keterangan': 'Waktu Export', 'Nilai': formatDateTime(new Date()) },
      { 'Keterangan': 'Diekspor Oleh', 'Nilai': userName },
      { 'Keterangan': 'Role User', 'Nilai': user?.role || 'User' },
      { 'Keterangan': 'Total Data Sparepart', 'Nilai': sparepartsData.length },
      { 'Keterangan': 'Total Data Mesin', 'Nilai': mesinsData.length },
      { 'Keterangan': 'Total Data Teknisi', 'Nilai': teknisisData.length },
      { 'Keterangan': 'Total Data Kategori', 'Nilai': kategorisData.length },
      { 'Keterangan': 'Total Hubungan BOM', 'Nilai': bomData.length },
    ];
    const wsInfo = XLSX.utils.json_to_sheet(infoRows);
    applyColWidths(wsInfo, [28, 45]);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Info Export');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `Master_Data_MTC_Semua_${nowJakarta}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  // Case 2: Specific tab export
  let rows: any[] = [];
  let sheetName = 'Data';
  let filePrefix = 'Master';
  let colWidths: number[] = [];

  if (tab === 'sparepart') {
    rows = await fetchSpareparts();
    sheetName = 'Master Sparepart';
    filePrefix = 'Master_Sparepart';
    colWidths = [5, 16, 35, 25, 20, 8, 14, 14, 10, 18, 22, 10, 30, 16, 14, 18, 14, 18, 14, 15, 15, 30, 30];
  } else if (tab === 'mesin') {
    rows = await fetchMesins();
    sheetName = 'Master Mesin';
    filePrefix = 'Master_Mesin';
    colWidths = [5, 10, 30, 20, 15, 15, 12, 18, 18, 40, 16];
  } else if (tab === 'teknisi') {
    rows = await fetchTeknisis();
    sheetName = 'Master Teknisi';
    filePrefix = 'Master_Teknisi';
    colWidths = [5, 12, 30, 12, 20, 20, 16];
  } else if (tab === 'kategori') {
    rows = await fetchKategoris();
    sheetName = 'Master Kategori';
    filePrefix = 'Master_Kategori';
    colWidths = [5, 12, 25, 15, 18, 20, 16];
  } else if (tab === 'bom') {
    rows = await fetchBom();
    sheetName = 'BOM Mesin';
    filePrefix = 'BOM_Mesin';
    colWidths = [5, 10, 25, 18, 15, 12, 16, 32, 20, 18, 8, 14, 10, 14, 18, 12];
  } else {
    return NextResponse.json({ error: 'Tab tidak valid' }, { status: 400 });
  }

  const filename = `${filePrefix}_${nowJakarta}`;

  // CSV Output
  if (format === 'csv') {
    if (rows.length === 0) {
      return new NextResponse('Tidak ada data yang sesuai dengan filter.\n', {
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

  // XLSX Output
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  applyColWidths(ws, colWidths);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Info sheet
  const filterDesc: string[] = [];
  if (search) filterDesc.push(`Pencarian: "${search}"`);
  if (kategoriFilter) filterDesc.push(`Kategori: ${kategoriFilter}`);
  if (mesinFilter) filterDesc.push(`Mesin: ${mesinFilter}`);
  if (statusFilter) filterDesc.push(`Status: ${statusFilter}`);
  if (pengadaanFilter) filterDesc.push(`Pengadaan: ${pengadaanFilter}`);
  if (tipeMesinFilter) filterDesc.push(`Tipe Mesin: ${tipeMesinFilter}`);

  const user = session.user as any;
  const userName = user?.name ? `${user.name} (${user.email || ''})` : (user?.email || 'User');
  const infoRows = [
    { 'Keterangan': 'Kategori Data', 'Nilai': sheetName },
    { 'Keterangan': 'Waktu Export', 'Nilai': formatDateTime(new Date()) },
    { 'Keterangan': 'Total Baris Data', 'Nilai': rows.length },
    { 'Keterangan': 'Filter yang Digunakan', 'Nilai': filterDesc.length > 0 ? filterDesc.join(' | ') : 'Semua Data (Tanpa Filter)' },
    { 'Keterangan': 'Diekspor Oleh', 'Nilai': userName },
    { 'Keterangan': 'Role User', 'Nilai': user?.role || 'User' },
  ];
  const wsInfo = XLSX.utils.json_to_sheet(infoRows);
  applyColWidths(wsInfo, [25, 50]);
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Info Export');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
    },
  });
}
