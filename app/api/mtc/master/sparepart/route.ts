import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err, generateItemId } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') ?? '').trim();
  const simple = searchParams.get('simple') === 'true';

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
      ...(simple
        ? {}
        : {
            movements: {
              where: {
                tipe: { in: ['IN', 'OUT'] },
                purchaseType: { not: 'histori-sheets' },
              },
              select: { tipe: true, qty: true },
            },
          }),
    },
    orderBy: { nama: 'asc' },
    take: 1000,
  });

  const data = rows.map((sp) => {
    if (simple) {
      return { ...sp, currentStock: 0 };
    }
    const totalIn = sp.movements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
    const totalOut = sp.movements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + m.qty, 0);
    const { movements: _movements, ...rest } = sp;
    return { ...rest, currentStock: totalIn - totalOut };
  });

  return ok(data);
}

async function resolveValidKategoriId(kategoriId: any): Promise<number | null> {
  if (kategoriId === null || kategoriId === undefined || kategoriId === '' || kategoriId === '0' || kategoriId === 0) {
    return null;
  }

  const num = Number(kategoriId);
  if (!isNaN(num) && num > 0) {
    const existingById = await prisma.kategori.findUnique({ where: { id: num } });
    if (existingById) return num;
  }

  const strName = String(kategoriId).trim();
  if (strName.length > 0) {
    const existingByName = await prisma.kategori.findFirst({
      where: { nama: { equals: strName, mode: 'insensitive' } }
    });
    if (existingByName) return existingByName.id;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const body = await req.json();
  const {
    nama,
    namaAlias,
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
    linkReference,
    alasan,
  } = body;

  if (!nama?.trim()) return err('Nama sparepart resmi wajib diisi');

  const kid = await resolveValidKategoriId(kategoriId);
  const mesinIdNums = Array.isArray(mesinIds) ? mesinIds.map((x: string) => Number(x)) : [];

  try {
    const id = await generateItemId(prisma);
    const row = await prisma.sparepart.create({
      data: {
        id,
        nama: nama.trim(),
        namaAlias: namaAlias?.trim() || null,
        kategoriId: kid,
        uom: uom || 'Pcs',
        lokasi: lokasi || null,
        harga: harga != null ? Number(harga) : 0,
        minQty: minQty != null ? Number(minQty) : 0,
        maxLeadTime: maxLeadTime != null ? parseInt(String(maxLeadTime), 10) || 0 : 0,
        avgLeadTime: avgLeadTime != null ? parseFloat(String(avgLeadTime)) || 0 : 0,
        aktif: aktif !== undefined ? Boolean(aktif) : true,
        purchasingStatus: purchasingStatus || 'WAITING_PRICE',
        purchasingQty: purchasingQty != null ? Number(purchasingQty) : 0,
        linkReference: linkReference?.trim() || null,
        alasan: alasan?.trim() || null,
        mesins: mesinIdNums.length > 0 ? { connect: mesinIdNums.map((mid) => ({ id: mid })) } : undefined,
      },
      include: { kategori: true, mesins: true },
    });
    return ok(row);
  } catch (e: any) {
    console.error('[POST /api/mtc/master/sparepart]', e);
    return err(`Gagal membuat sparepart: ${e.message}`, 500);
  }
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
    namaAlias,
    linkReference,
    alasan,
  } = body;
  if (!id) return err('ID wajib');

  const kid = kategoriId === undefined ? undefined : await resolveValidKategoriId(kategoriId);
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
        ...(namaAlias !== undefined ? { namaAlias: namaAlias || null } : {}),
        ...(linkReference !== undefined ? { linkReference: linkReference || null } : {}),
        ...(alasan !== undefined ? { alasan: alasan || null } : {}),
        ...(mesinIdNums !== undefined ? { mesins: { set: mesinIdNums.map((mid) => ({ id: mid })) } } : {}),
      },
    });

    if (body.currentStock !== undefined && body.currentStock !== null && body.currentStock !== '' && !isNaN(Number(body.currentStock))) {
      const targetStock = Number(body.currentStock);
      const spMovements = await tx.stockMovement.findMany({
        where: { sparepartId: String(id), tipe: { in: ['IN', 'OUT'] }, purchaseType: { not: 'histori-sheets' } },
        select: { tipe: true, qty: true },
      });
      const totalIn = spMovements.filter((m) => m.tipe === 'IN').reduce((s, m) => s + m.qty, 0);
      const totalOut = spMovements.filter((m) => m.tipe === 'OUT').reduce((s, m) => s + m.qty, 0);
      const actualStock = totalIn - totalOut;
      const diff = targetStock - actualStock;

      if (diff !== 0) {
        const currentSpDetail = await tx.sparepart.findUnique({
          where: { id: String(id) },
          select: { nama: true, harga: true, lokasi: true },
        });

        if (diff > 0) {
          await tx.stockMovement.create({
            data: {
              tipe: 'IN',
              sparepartId: String(id),
              namaItem: currentSpDetail?.nama ?? '',
              qty: diff,
              harga: currentSpDetail?.harga ?? 0,
              lokasi: currentSpDetail?.lokasi ?? null,
              keterangan: '[SILENT] Penyesuaian Stok Master',
              tanggal: new Date(),
            },
          });
        } else {
          await tx.stockMovement.create({
            data: {
              tipe: 'OUT',
              sparepartId: String(id),
              namaItem: currentSpDetail?.nama ?? '',
              qty: Math.abs(diff),
              harga: currentSpDetail?.harga ?? 0,
              lokasi: currentSpDetail?.lokasi ?? null,
              keterangan: '[SILENT] Penyesuaian Stok Master',
              tanggal: new Date(),
            },
          });
        }
      }
    }

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
