import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireGaEditor } from '@/lib/auth';
import { getJakartaYmd } from '@/lib/ga/jakartaDate';
import {
  gaStockStatusLabel,
  listGaStockItems,
  parseGaStockListFilters,
} from '@/lib/ga/listStockItems';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return new NextResponse('Forbidden', { status: 403 });

  const filters = parseGaStockListFilters(new URL(req.url).searchParams);
  const items = await listGaStockItems(filters);

  const rows = items.map((it, i) => ({
    No: i + 1,
    Kode: it.kodeBarang || '—',
    'Nama Barang': it.nama,
    Lokasi: it.lokasi,
    Stok: it.currentStock,
    Harga: it.harga,
    Status: gaStockStatusLabel(it.status),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 40 },
    { wch: 18 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Daftar Barang');

  const { y, m, d } = getJakartaYmd();
  const pad = (n: number) => String(n).padStart(2, '0');
  const filename = `daftar-barang-ga-${y}-${pad(m)}-${pad(d)}.xlsx`;
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
