import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor, requireGaAuth } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

export async function GET() {
  const session = await requireGaAuth();
  if (!session) return err('Unauthorized', 401);
  const data = await prismaGa.kategori.findMany({ orderBy: { nama: 'asc' } });
  return ok(data);
}

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);
  const { nama } = await req.json();
  if (!nama?.trim()) return err('Nama wajib');
  try {
    const row = await prismaGa.kategori.create({ data: { nama: nama.trim() } });
    return ok(row, 201);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') return err('Nama sudah ada');
    return err('Gagal', 500);
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);
  const { id, nama } = await req.json();
  if (!id) return err('ID wajib');
  const row = await prismaGa.kategori.update({
    where: { id: Number(id) },
    data: { nama: nama?.trim() ?? undefined },
  });
  return ok(row);
}
