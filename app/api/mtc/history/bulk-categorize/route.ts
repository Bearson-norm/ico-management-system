import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcAuth, requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { KATEGORI_OUT_OPTIONS, isKategoriOut } from '@/lib/constants/stockOut';

export async function POST(req: NextRequest) {
  const session = (await requireMtcEditor()) || (await requireMtcAuth());
  if (!session) return err('Unauthorized', 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Body JSON tidak valid', 400);
  }

  const { ids, kategoriOut } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return err('Daftar ID transaksi harus berupa array dan tidak boleh kosong', 400);
  }

  const validIds = ids.map(id => parseInt(String(id), 10)).filter(id => !isNaN(id) && id > 0);
  if (validIds.length === 0) {
    return err('Tidak ada ID transaksi yang valid', 400);
  }

  const cleanKategori = kategoriOut ? String(kategoriOut).trim() : null;
  if (cleanKategori !== null && !isKategoriOut(cleanKategori)) {
    return err(`Kategori tidak valid. Pilih salah satu dari: ${KATEGORI_OUT_OPTIONS.join(', ')}`, 400);
  }

  try {
    const res = await prisma.stockMovement.updateMany({
      where: {
        id: { in: validIds },
        tipe: 'OUT',
      },
      data: {
        kategoriOut: cleanKategori,
      },
    });

    return ok({
      message: `Berhasil mengupdate kategori untuk ${res.count} transaksi OUT.`,
      count: res.count,
    });
  } catch (e) {
    console.error('[POST /api/mtc/history/bulk-categorize]', e);
    return err('Gagal mengupdate kategori transaksi secara massal', 500);
  }
}
