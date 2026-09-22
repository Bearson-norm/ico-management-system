import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

// GET /api/mtc/stock/potongan?sparepartId=...&status=aktif
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sparepartId = searchParams.get('sparepartId');
  const status = searchParams.get('status') || 'aktif';

  if (!sparepartId) return err('Parameter sparepartId wajib diisi', 400);

  const potongans = await prisma.potonganFisik.findMany({
    where: {
      sparepartId: String(sparepartId),
      ...(status !== 'all' ? { status } : {}),
    },
    orderBy: [{ tanggalMasuk: 'asc' }, { id: 'asc' }],
  });

  return ok(potongans);
}

// DELETE /api/mtc/stock/potongan?id=... - Hapus atau tandai habis potongan
export async function DELETE(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const idStr = searchParams.get('id');
  if (!idStr) return err('Parameter id wajib diisi', 400);

  const id = parseInt(idStr);
  if (isNaN(id)) return err('ID tidak valid', 400);

  try {
    const potongan = await prisma.potonganFisik.findUnique({
      where: { id },
      include: { sparepart: true },
    });
    if (!potongan) return err('Potongan fisik tidak ditemukan', 404);

    await prisma.$transaction(async (tx) => {
      // Hapus baris potongan fisik
      await tx.potonganFisik.delete({ where: { id } });

      // Jika sparepart tidak dapat dibeli ulang dan sudah tidak punya potongan aktif lagi,
      // otomatis nonaktifkan sparepart (aktif = false)
      if (potongan.sparepart && !potongan.sparepart.dapatDibeliUlang) {
        const remainingActive = await tx.potonganFisik.count({
          where: { sparepartId: potongan.sparepartId, status: 'aktif' },
        });
        if (remainingActive === 0) {
          await tx.sparepart.update({
            where: { id: potongan.sparepartId },
            data: { aktif: false },
          });
        }
      }
    });

    return ok({ msg: 'Potongan fisik berhasil dihapus' });
  } catch (e: any) {
    console.error('[DELETE /api/mtc/stock/potongan]', e);
    return err('Gagal menghapus potongan fisik: ' + e.message, 500);
  }
}
