import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, err, generateItemId } from '@/lib/utils';
import { requireMtcAuth } from '@/lib/auth';

// POST /api/mtc/opname/[id]/item - Add an unlisted physical item on-the-fly to an active SO session
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await requireMtcAuth();

    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) return err('ID sesi tidak valid', 400);

    const session = await prisma.opnameSession.findUnique({
      where: { id: sessionId }
    });
    if (!session) return err('Sesi Stock Opname tidak ditemukan', 404);
    if (session.status === 'POSTED') return err('Sesi sudah di-posting', 400);

    const body = await req.json();
    const { namaItem, kategori, lokasi, uom, qtyFisik, harga, catatan, createMaster } = body;

    if (!namaItem || !String(namaItem).trim()) {
      return err('Nama barang fisik wajib diisi', 400);
    }

    const cleanNama = String(namaItem).trim();
    const cleanKategori = kategori ? String(kategori).trim() : 'Umum';
    const cleanLokasi = lokasi ? String(lokasi).trim() : (session.lokasi || 'Gudang MTC');
    const cleanUom = uom ? String(uom).trim() : 'Pcs';
    const parsedQtyFisik = Math.max(0, parseInt(String(qtyFisik)) || 0);

    let sparepartId: string | null = null;

    // Optional: Auto-create in Master Data if requested
    if (createMaster) {
      // Find category ID
      let dbKat = await prisma.kategori.findFirst({
        where: { nama: { equals: cleanKategori, mode: 'insensitive' } }
      });
      if (!dbKat) {
        dbKat = await prisma.kategori.create({
          data: { nama: cleanKategori, tipe: 'umum' }
        });
      }

      // Generate ID matching Stock In (MTC-SP-XXX)
      const newSpId = await generateItemId(prisma);

      const newSp = await prisma.sparepart.create({
        data: {
          id: newSpId,
          nama: cleanNama,
          kategoriId: dbKat.id,
          uom: cleanUom,
          lokasi: cleanLokasi,
          harga: harga ? Number(harga) : 0,
          aktif: true
        }
      });
      sparepartId = newSp.id;
    }

    const auditorName = sessionUser?.user?.name || sessionUser?.user?.email || 'Teknisi MTC';

    // Create OpnameItem with isNewItem = true
    const newItem = await prisma.opnameItem.create({
      data: {
        sessionId,
        sparepartId,
        namaItem: cleanNama,
        kategori: cleanKategori,
        lokasi: cleanLokasi,
        uom: cleanUom,
        qtySistem: 0, // Unlisted physical item had 0 system stock
        qtyFisik: parsedQtyFisik,
        selisih: parsedQtyFisik, // Variance is +parsedQtyFisik
        catatan: catatan ? String(catatan).trim() : 'Barang fisik tidak terdaftar (Ditambahkan saat Opname)',
        auditedBy: auditorName,
        isNewItem: true
      }
    });

    return ok({
      item: newItem,
      msg: `Barang fisik "${cleanNama}" (Qty: ${parsedQtyFisik}) berhasil ditambahkan ke sesi Stock Opname!`
    });
  } catch (e: any) {
    console.error('Error adding unlisted opname item:', e);
    return err('Gagal menambahkan barang ke sesi opname: ' + e.message, 500);
  }
}

// DELETE /api/mtc/opname/[id]/item?itemId=123 - Delete an item from an active SO session
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) return err('ID sesi tidak valid', 400);

    const session = await prisma.opnameSession.findUnique({
      where: { id: sessionId }
    });
    if (!session) return err('Sesi Stock Opname tidak ditemukan', 404);
    if (session.status === 'POSTED') return err('Sesi sudah di-posting dan tidak dapat diubah', 400);

    const { searchParams } = new URL(req.url);
    const itemIdStr = searchParams.get('itemId');
    if (!itemIdStr) return err('Parameter itemId wajib diisi', 400);

    const itemId = parseInt(itemIdStr);
    if (isNaN(itemId)) return err('ID item tidak valid', 400);

    const opItem = await prisma.opnameItem.findFirst({
      where: { id: itemId, sessionId }
    });
    if (!opItem) return err('Item opname tidak ditemukan', 404);

    // If it was a newly created sparepart master that hasn't been used elsewhere, clean up
    if (opItem.isNewItem && opItem.sparepartId) {
      const spMoves = await prisma.stockMovement.count({
        where: { sparepartId: opItem.sparepartId }
      });
      if (spMoves === 0) {
        await prisma.sparepart.delete({
          where: { id: opItem.sparepartId }
        }).catch(() => {});
      }
    }

    await prisma.opnameItem.delete({
      where: { id: itemId }
    });

    return ok({ msg: `Item "${opItem.namaItem}" berhasil dihapus dari sesi Stock Opname!` });
  } catch (e: any) {
    console.error('Error deleting opname item:', e);
    return err('Gagal menghapus item dari sesi opname: ' + e.message, 500);
  }
}

// PATCH /api/mtc/opname/[id]/item - Edit an opname item's name/metadata
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) return err('ID sesi tidak valid', 400);

    const session = await prisma.opnameSession.findUnique({
      where: { id: sessionId }
    });
    if (!session) return err('Sesi Stock Opname tidak ditemukan', 404);
    if (session.status === 'POSTED') return err('Sesi sudah di-posting dan tidak dapat diubah', 400);

    const body = await req.json();
    const { itemId, namaItem, lokasi, kategori, uom } = body;

    if (!itemId || isNaN(parseInt(String(itemId)))) return err('ID item tidak valid', 400);
    if (!namaItem || !String(namaItem).trim()) return err('Nama item wajib diisi', 400);

    const cleanNama = String(namaItem).trim();

    const opItem = await prisma.opnameItem.findFirst({
      where: { id: parseInt(String(itemId)), sessionId }
    });
    if (!opItem) return err('Item opname tidak ditemukan', 404);

    // Update opnameItem
    const updated = await prisma.opnameItem.update({
      where: { id: opItem.id },
      data: {
        namaItem: cleanNama,
        ...(lokasi !== undefined ? { lokasi: String(lokasi).trim() } : {}),
        ...(kategori !== undefined ? { kategori: String(kategori).trim() } : {}),
        ...(uom !== undefined ? { uom: String(uom).trim() } : {})
      }
    });

    // Sync to sparepart master if created
    if (opItem.sparepartId) {
      await prisma.sparepart.update({
        where: { id: opItem.sparepartId },
        data: {
          nama: cleanNama,
          ...(lokasi !== undefined ? { lokasi: String(lokasi).trim() } : {}),
          ...(uom !== undefined ? { uom: String(uom).trim() } : {})
        }
      }).catch(() => {});
    }

    return ok({ item: updated, msg: `Nama barang berhasil diubah menjadi "${cleanNama}"!` });
  } catch (e: any) {
    console.error('Error updating opname item name:', e);
    return err('Gagal mengubah nama item: ' + e.message, 500);
  }
}
