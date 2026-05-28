import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

export async function GET() {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);
  const data = await prisma.kategori.findMany({ orderBy: { nama: 'asc' } });
  return ok(data);
}

export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);
  const { nama, tipe } = await req.json();
  if (!nama?.trim()) return err('Nama wajib');
  try {
    const row = await prisma.kategori.create({
      data: { nama: nama.trim(), tipe: tipe || 'umum' },
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
  const { id, nama, tipe } = await req.json();
  if (!id) return err('ID wajib');
  const row = await prisma.kategori.update({
    where: { id: Number(id) },
    data: { nama: nama?.trim(), tipe: tipe ?? undefined },
  });
  return ok(row);
}
