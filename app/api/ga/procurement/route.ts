import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

// GET /api/ga/procurement
export async function GET(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status') || 'ORDERED';

  const whereClause: any = {};
  if (statusParam === 'ORDERED') {
    whereClause.status = 'ORDERED';
  } else if (statusParam === 'RECEIVED') {
    whereClause.status = 'RECEIVED';
  }

  try {
    const data = await prismaGa.gaProcurementTracking.findMany({
      where: whereClause,
      include: {
        item: {
          select: {
            id: true,
            nama: true,
            uom: true,
            lokasi: true,
            harga: true,
            minQty: true,
            maxQty: true,
          },
        },
      },
      orderBy: {
        tanggalPesan: 'desc',
      },
    });

    return ok(data);
  } catch (e) {
    console.error('[GET /api/ga/procurement]', e);
    return err('Gagal mengambil data pelacakan pengadaan GA', 500);
  }
}

// POST /api/ga/procurement
export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  const {
    originalName,
    itemId,
    qty,
    harga,
    vendor,
    nomorPr,
    nomorPo,
    isStocked,
    keterangan,
  } = body;

  if (!originalName?.trim()) return err('Nama barang wajib diisi', 400);
  if (!qty || Number(qty) < 1) return err('Kuantitas wajib diisi dan minimal 1', 400);

  try {
    let finalItemId = itemId || null;
    let finalName = originalName.trim();
    let finalHarga = harga != null ? Number(harga) : null;

    if (finalItemId) {
      const item = await prismaGa.gaItem.findUnique({
        where: { id: finalItemId },
        select: { nama: true, harga: true },
      });
      if (item) {
        finalName = item.nama;
        if (harga === undefined || harga === null) {
          finalHarga = Number(item.harga) || 0;
        }
      }
    }

    const tracking = await prismaGa.gaProcurementTracking.create({
      data: {
        originalName: finalName,
        itemId: finalItemId,
        qty: Number(qty),
        harga: finalHarga,
        vendor: vendor || null,
        nomorPr: nomorPr?.trim() || null,
        nomorPo: nomorPo?.trim() || null,
        status: 'ORDERED',
        isStocked: isStocked !== undefined ? Boolean(isStocked) : true,
        keterangan: keterangan || null,
      },
    });

    return ok({
      msg: 'Pengajuan pesanan berhasil ditambahkan ke daftar pelacakan!',
      data: tracking,
    });
  } catch (e: any) {
    console.error('[POST /api/ga/procurement]', e);
    return err(`Gagal membuat data pelacakan: ${e.message}`, 500);
  }
}

// PATCH /api/ga/procurement
export async function PATCH(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  const {
    id,
    originalName,
    itemId,
    qty,
    harga,
    vendor,
    nomorPr,
    nomorPo,
    isStocked,
    keterangan,
  } = body;

  if (!id) return err('ID record wajib diisi', 400);

  try {
    const existing = await prismaGa.gaProcurementTracking.findUnique({
      where: { id: Number(id) },
    });
    if (!existing) return err('Data pelacakan tidak ditemukan', 404);

    let finalItemId = itemId !== undefined ? (itemId || null) : existing.itemId;
    let finalName = originalName !== undefined ? originalName.trim() : existing.originalName;
    let finalHarga = harga !== undefined ? (harga ? Number(harga) : null) : existing.harga;

    if (itemId && itemId !== existing.itemId) {
      const item = await prismaGa.gaItem.findUnique({
        where: { id: itemId },
        select: { nama: true, harga: true },
      });
      if (item) {
        finalName = item.nama;
        if (harga === undefined) {
          finalHarga = Number(item.harga) || 0;
        }
      }
    }

    const updated = await prismaGa.gaProcurementTracking.update({
      where: { id: Number(id) },
      data: {
        originalName: finalName,
        itemId: finalItemId,
        qty: qty !== undefined ? Number(qty) : undefined,
        harga: finalHarga,
        vendor: vendor !== undefined ? (vendor || null) : undefined,
        nomorPr: nomorPr !== undefined ? (nomorPr?.trim() || null) : undefined,
        nomorPo: nomorPo !== undefined ? (nomorPo?.trim() || null) : undefined,
        isStocked: isStocked !== undefined ? Boolean(isStocked) : undefined,
        keterangan: keterangan !== undefined ? (keterangan || null) : undefined,
      },
    });

    return ok({
      msg: 'Data pelacakan pesanan berhasil diperbarui!',
      data: updated,
    });
  } catch (e: any) {
    console.error('[PATCH /api/ga/procurement]', e);
    return err(`Gagal memperbarui data: ${e.message}`, 500);
  }
}
