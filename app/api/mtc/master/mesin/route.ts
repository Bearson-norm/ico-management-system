import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const includeSpareparts = searchParams.get('include') === 'spareparts';

  const data = await prisma.mesin.findMany({
    where: { aktif: true },
    orderBy: { nama: 'asc' },
    include: includeSpareparts
      ? {
          spareparts: {
            where: { aktif: true },
            select: { id: true, nama: true, uom: true, lokasi: true },
            orderBy: { nama: 'asc' },
          },
        }
      : { spareparts: { select: { id: true } } },
  });

  const result = data.map((m) => ({
    ...m,
    _sparepartCount: m.spareparts.length,
    spareparts: includeSpareparts ? m.spareparts : undefined,
  }));

  return ok(result);
}

export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);
  const { nama, area, tipe, aktif } = await req.json();
  if (!nama?.trim()) return err('Nama wajib');
  try {
    const row = await prisma.mesin.create({
      data: {
        nama: nama.trim(),
        area: area || null,
        tipe: tipe || 'keduanya',
        aktif: aktif !== false,
      },
    });
    return ok(row, 201);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') return err('Nama sudah ada');
    return err('Gagal simpan', 500);
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);
  const { id, nama, area, tipe, aktif } = await req.json();
  if (!id) return err('ID wajib');
  const row = await prisma.mesin.update({
    where: { id: Number(id) },
    data: {
      ...(nama !== undefined ? { nama: nama.trim() } : {}),
      ...(area !== undefined ? { area: area || null } : {}),
      ...(tipe !== undefined ? { tipe: tipe || 'keduanya' } : {}),
      ...(aktif === undefined ? {} : { aktif: Boolean(aktif) }),
    },
  });
  return ok(row);
}
