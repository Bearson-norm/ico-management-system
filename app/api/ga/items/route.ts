import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { generateGaItemId } from '@/lib/utils-ga';

// POST /api/ga/items
export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  const { nama, uom, harga, lokasi, kategoriId } = body;

  if (!nama?.trim()) {
    return err('Nama barang wajib diisi', 400);
  }

  try {
    const id = await generateGaItemId(prismaGa);
    
    const item = await prismaGa.gaItem.create({
      data: {
        id,
        nama: nama.trim(),
        uom: uom?.trim() || 'Pcs',
        harga: harga ? Number(harga) : 0,
        lokasi: lokasi?.trim() || null,
        kategoriId: kategoriId ? Number(kategoriId) : null,
        minQty: 0,
        aktif: true,
      },
    });

    return ok({
      msg: 'Barang master GA berhasil ditambahkan!',
      data: item,
    });
  } catch (e: any) {
    console.error('[POST /api/ga/items]', e);
    return err(`Gagal membuat barang master: ${e.message}`, 500);
  }
}
