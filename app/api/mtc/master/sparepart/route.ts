import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? '';

  const rows = await prisma.sparepart.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { nama: { contains: search, mode: 'insensitive' } },
              { id: { contains: search, mode: 'insensitive' } },
              { lokasi: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      kategori: true,
      mesins: { select: { id: true, nama: true } },
      movements: { where: { tipe: { in: ['IN', 'OUT'] } }, select: { tipe: true, qty: true } },
    },
    orderBy: { nama: 'asc' },
    take: 100,
  });

  const data = rows.map((sp) => {
    const totalIn = sp.movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
    const totalOut = sp.movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + m.qty, 0);
    const { movements: _movements, ...rest } = sp;
    return { ...rest, currentStock: totalIn - totalOut };
  });

  return ok(data);
}

export async function PUT(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const body = await req.json();
  const {
    id,
    nama,
    kategoriId,
    uom,
    lokasi,
    harga,
    minQty,
    maxLeadTime,
    avgLeadTime,
    aktif,
    mesinIds,
    purchasingStatus,
  } = body;
  if (!id) return err('ID wajib');

  const kid = kategoriId === '' || kategoriId === undefined ? null : Number(kategoriId);
  const mesinIdNums = Array.isArray(mesinIds) ? mesinIds.map((x: string) => Number(x)) : [];

  await prisma.$transaction(async (tx) => {
    await tx.sparepart.update({
      where: { id: String(id) },
      data: {
        ...(nama !== undefined ? { nama: nama.trim() } : {}),
        kategoriId: kid,
        ...(uom !== undefined ? { uom: uom || 'Pcs' } : {}),
        ...(lokasi !== undefined ? { lokasi: lokasi || null } : {}),
        ...(harga != null ? { harga: Number(harga) } : {}),
        ...(minQty != null ? { minQty: Number(minQty) } : {}),
        ...(maxLeadTime !== undefined
          ? { maxLeadTime: parseInt(String(maxLeadTime), 10) || 0 }
          : {}),
        ...(avgLeadTime !== undefined
          ? { avgLeadTime: parseFloat(String(avgLeadTime)) || 0 }
          : {}),
        ...(aktif === undefined ? {} : { aktif: Boolean(aktif) }),
        ...(purchasingStatus !== undefined ? { purchasingStatus: String(purchasingStatus) } : {}),
        mesins: { set: mesinIdNums.map((mid) => ({ id: mid })) },
      },
    });
  });

  const row = await prisma.sparepart.findUnique({
    where: { id: String(id) },
    include: { kategori: true, mesins: true },
  });
  return ok(row);
}

export async function DELETE(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);
  
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return err('ID wajib');
  
  try {
    await prisma.sparepart.delete({
      where: { id: String(id) }
    });
    return ok({ msg: 'Sparepart berhasil dihapus' });
  } catch (e: unknown) {
    return err('Gagal menghapus sparepart. Pastikan tidak ada histori transaksi yang terhubung.', 500);
  }
}
