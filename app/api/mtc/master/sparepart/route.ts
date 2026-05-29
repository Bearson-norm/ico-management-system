import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') ?? '').trim();

  const rows = await prisma.sparepart.findMany({
    where: {
      ...(search
        ? {
            OR: [
              { nama: { contains: search, mode: 'insensitive' } },
              { id: { contains: search, mode: 'insensitive' } },
              { lokasi: { contains: search, mode: 'insensitive' } },
              { kategori: { nama: { contains: search, mode: 'insensitive' } } },
              { mesins: { some: { nama: { contains: search, mode: 'insensitive' } } } },
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
    take: 1000,
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
    purchasingQty,
    purchasingNoPr,
    purchasingNoPo,
    prDate,
    poDate,
  } = body;
  if (!id) return err('ID wajib');

  const kid = kategoriId === '' ? null : (kategoriId === undefined ? undefined : Number(kategoriId));
  const mesinIdNums = Array.isArray(mesinIds) ? mesinIds.map((x: string) => Number(x)) : undefined;

  await prisma.$transaction(async (tx) => {
    const currentSp = await tx.sparepart.findUnique({
      where: { id: String(id) },
      select: { purchasingStatus: true, prDate: true, poDate: true, purchasingNoPr: true, purchasingNoPo: true },
    });

    let prDateVal: Date | null | undefined = undefined;
    let poDateVal: Date | null | undefined = undefined;

    if (purchasingStatus !== undefined && currentSp) {
      const newStatus = String(purchasingStatus);
      if (newStatus === 'PR') {
        prDateVal = prDate ? new Date(prDate) : (currentSp.prDate || new Date());
        poDateVal = null;
      } else if (newStatus === 'PO') {
        prDateVal = prDate ? new Date(prDate) : (currentSp.prDate || new Date());
        poDateVal = poDate ? new Date(poDate) : (currentSp.poDate || new Date());
      } else {
        prDateVal = null;
        poDateVal = null;
      }
    } else {
      if (prDate !== undefined) {
        prDateVal = prDate ? new Date(prDate) : null;
      }
      if (poDate !== undefined) {
        poDateVal = poDate ? new Date(poDate) : null;
      }
    }

    await tx.sparepart.update({
      where: { id: String(id) },
      data: {
        ...(nama !== undefined ? { nama: nama.trim() } : {}),
        ...(kid !== undefined ? { kategoriId: kid } : {}),
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
        ...(purchasingStatus !== undefined ? { 
          purchasingStatus: String(purchasingStatus),
          ...(purchasingStatus === 'NONE' ? { purchasingQty: 0, purchasingNoPr: null, purchasingNoPo: null } : {})
        } : {}),
        ...(purchasingQty !== undefined && purchasingStatus !== 'NONE' ? { purchasingQty: Number(purchasingQty) || 0 } : {}),
        ...(purchasingNoPr !== undefined && purchasingStatus !== 'NONE' ? { purchasingNoPr: purchasingNoPr || null } : {}),
        ...(purchasingNoPo !== undefined && purchasingStatus !== 'NONE' ? { purchasingNoPo: purchasingNoPo || null } : {}),
        ...(prDateVal !== undefined ? { prDate: prDateVal } : {}),
        ...(poDateVal !== undefined ? { poDate: poDateVal } : {}),
        ...(mesinIdNums !== undefined ? { mesins: { set: mesinIdNums.map((mid) => ({ id: mid })) } } : {}),
      },
    });

    const currentNoPr = purchasingNoPr !== undefined ? purchasingNoPr : currentSp?.purchasingNoPr;
    const finalNoPo = purchasingNoPo !== undefined ? purchasingNoPo : null;

    if (purchasingStatus === 'PO' && currentNoPr && finalNoPo) {
      const relatedSps = await tx.sparepart.findMany({
        where: {
          purchasingNoPr: currentNoPr,
          purchasingStatus: 'PR',
          id: { not: String(id) }
        }
      });

      if (relatedSps.length > 0) {
        await tx.sparepart.updateMany({
          where: {
            id: { in: relatedSps.map(sp => sp.id) }
          },
          data: {
            purchasingStatus: 'PO',
            purchasingNoPo: finalNoPo,
            poDate: poDateVal || new Date()
          }
        });
      }
    }
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
