import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

export async function GET() {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);
  const data = await prisma.teknisi.findMany({ orderBy: { nama: 'asc' } });
  return ok(data);
}

export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);
  const { nama, aktif } = await req.json();
  if (!nama?.trim()) return err('Nama wajib');
  try {
    const row = await prisma.teknisi.create({
      data: { nama: nama.trim(), aktif: aktif !== false },
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
  const { id, nama, aktif } = await req.json();
  if (!id) return err('ID wajib');
  const row = await prisma.teknisi.update({
    where: { id: Number(id) },
    data: {
      nama: nama?.trim(),
      aktif: aktif === undefined ? undefined : Boolean(aktif),
    },
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
    await prisma.teknisi.delete({
      where: { id: Number(id) }
    });
    return ok({ msg: 'Teknisi berhasil dihapus' });
  } catch (e: unknown) {
    return err('Gagal menghapus teknisi. Pastikan tidak ada data laporan atau transaksi yang terhubung.', 500);
  }
}
