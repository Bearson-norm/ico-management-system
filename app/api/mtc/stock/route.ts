import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok } from '@/lib/utils';

// GET /api/mtc/stock — publik (viewer tanpa login), sama seperti V2
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search    = (searchParams.get('search') ?? '').trim();
  const status    = searchParams.get('status') ?? ''; // safe | low | habis
  const kategoriId = searchParams.get('kategoriId');

  // Ambil semua sparepart aktif beserta stok (aggregate dari movements)
  const spareparts = await prisma.sparepart.findMany({
    where: {
      aktif: true,
      ...(search ? { nama: { contains: search, mode: 'insensitive' } } : {}),
      ...(kategoriId ? { kategoriId: parseInt(kategoriId) } : {}),
    },
    include: {
      kategori: true,
      mesins: { select: { id: true, nama: true } },
      movements: {
        where: { tipe: { in: ['IN', 'OUT'] } },
        select: { tipe: true, qty: true },
      },
    },
    orderBy: { nama: 'asc' },
  });

  const result = spareparts
    .map((sp) => {
      const totalIn  = sp.movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
      const totalOut = sp.movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + Math.abs(m.qty), 0);
      const currentStock = totalIn - totalOut;

      let stockStatus: 'safe' | 'low' | 'habis';
      if (currentStock <= 0)          stockStatus = 'habis';
      else if (currentStock < sp.minQty) stockStatus = 'low';
      else                               stockStatus = 'safe';

      return {
        id:           sp.id,
        nama:         sp.nama,
        kategori:     sp.kategori?.nama ?? '—',
        kategoriId:   sp.kategoriId,
        mesins:       sp.mesins,
        lokasi:       sp.lokasi ?? '—',
        uom:          sp.uom,
        harga:        Number(sp.harga),
        minQty:       sp.minQty,
        totalIn,
        totalOut,
        currentStock,
        status:       stockStatus,
        purchasingStatus: sp.purchasingStatus || 'NONE',
      };
    })
    .filter((sp) => {
      if (!status) return true;
      return sp.status === status;
    });

  return ok(result);
}
