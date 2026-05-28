import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaAuth, requireGaEditor } from '@/lib/auth';
import { computeStockFromMovements } from '@/lib/ga/stockQty';

function csvEscape(s: string) {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** ?type=inbound|outbound|report */
export async function GET(req: NextRequest) {
  const session = await requireGaAuth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'inbound';

  if (type === 'report') {
    const ed = await requireGaEditor();
    if (!ed) return new Response('Forbidden', { status: 403 });
    const items = await prismaGa.gaItem.findMany({
      where: { aktif: true },
      include: {
        movements: {
          where: { tipe: { in: ['IN', 'OUT', 'ADJ'] } },
          select: { tipe: true, qty: true },
        },
      },
    });
    const header =
      'NAMA BARANG,Beginning,Inbound,Outbound,Stock on Hand,Satuan,Reorder Point,LOKASI,KODE BARANG,Harga\n';
    const lines = items.map((it) => {
      const inn = it.movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
      const out = it.movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + m.qty, 0);
      const hand = computeStockFromMovements(it.movements);
      return [
        csvEscape(it.nama),
        '0',
        String(inn),
        String(out),
        String(hand),
        csvEscape(it.uom),
        String(it.minQty),
        csvEscape(it.lokasi ?? ''),
        csvEscape(it.kodeBarang ?? ''),
        String(Number(it.harga)),
      ].join(',');
    });
    return new Response(header + lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ga-stock-report.csv"',
      },
    });
  }

  if (type === 'outbound') {
    const ed = await requireGaEditor();
    if (!ed) return new Response('Forbidden', { status: 403 });
    const rows = await prismaGa.gaStockMovement.findMany({
      where: { tipe: 'OUT' },
      orderBy: { tanggal: 'desc' },
      take: 5000,
    });
    const header = 'Nama Barang,Quantity,Tanggal Pemakaian,NAMA\n';
    const body = rows
      .map((r) =>
        [csvEscape(r.namaBarang ?? ''), String(r.qty), new Date(r.tanggalPakai ?? r.tanggal).toLocaleDateString('id-ID'), csvEscape(r.picNama ?? '')].join(
          ','
        )
      )
      .join('\n');
    return new Response(header + body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ga-outbound.csv"',
      },
    });
  }

  const ed = await requireGaEditor();
  if (!ed) return new Response('Forbidden', { status: 403 });
  const rows = await prismaGa.gaStockMovement.findMany({
    where: { tipe: 'IN' },
    orderBy: { tanggal: 'desc' },
    take: 5000,
  });
  const header = 'Nama Barang,Quantity,Sudah Diterima?,Tanggal terima,Nama\n';
  const body = rows
    .map((r) =>
      [
        csvEscape(r.namaBarang ?? ''),
        String(r.qty),
        String(r.qtyDiterima ?? r.qty),
        r.tanggalTerima ? new Date(r.tanggalTerima).toLocaleDateString('id-ID') : '',
        csvEscape(r.picNama ?? ''),
      ].join(',')
    )
    .join('\n');
  return new Response(header + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ga-inbound.csv"',
    },
  });
}
