import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { GaItemUpdateSchema } from '@/lib/validations/ga-item';

type RouteCtx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { id } = await ctx.params;
  if (!id?.trim()) return err('ID item wajib');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }

  const parsed = GaItemUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }

  const p = parsed.data;
  const existing = await prismaGa.gaItem.findUnique({ where: { id } });
  if (!existing) return err('Barang tidak ditemukan', 404);

  const kodeTrim = p.kodeBarang.trim();
  const duplicate = await prismaGa.gaItem.findFirst({
    where: {
      kodeBarang: { equals: kodeTrim, mode: 'insensitive' },
      NOT: { id },
    },
  });
  if (duplicate) return err(`Kode barang "${kodeTrim}" sudah dipakai item lain`);

  try {
    const row = await prismaGa.gaItem.update({
      where: { id },
      data: {
        nama: p.nama.trim(),
        kodeBarang: kodeTrim,
        lokasi: p.lokasi?.trim() || null,
        uom: p.uom.trim() || 'Pcs',
        harga: p.harga,
        minQty: p.minQty,
        maxQty: p.maxQty ?? null,
        kategoriId: p.kategoriId ?? null,
        aktif: p.aktif ?? existing.aktif,
      },
      include: { kategori: true },
    });
    return ok({
      id: row.id,
      nama: row.nama,
      kodeBarang: row.kodeBarang,
      lokasi: row.lokasi,
      uom: row.uom,
      harga: Number(row.harga),
      minQty: row.minQty,
      maxQty: row.maxQty,
      kategoriId: row.kategoriId,
      kategori: row.kategori?.nama ?? null,
      aktif: row.aktif,
    });
  } catch (e) {
    console.error(e);
    return err('Gagal menyimpan perubahan', 500);
  }
}
