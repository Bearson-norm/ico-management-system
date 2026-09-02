import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, err } from '@/lib/utils';
import { requireMtcEditor } from '@/lib/auth';

// GET /api/mtc/opname/[id] - Get details of a single Stock Opname session
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await requireMtcEditor();
    if (!sessionUser) return err('Unauthorized: Hanya editor yang dapat mengakses Stock Opname', 403);

    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) return err('ID sesi tidak valid', 400);

    const session = await prisma.opnameSession.findUnique({
      where: { id: sessionId },
      include: {
        items: {
          orderBy: [{ lokasi: 'asc' }, { namaItem: 'asc' }],
          include: {
            sparepart: {
              select: { harga: true, uom: true, lokasi: true }
            }
          }
        }
      }
    });

    if (!session) return err('Sesi Stock Opname tidak ditemukan', 404);

    // Calculate detailed statistics
    const totalItems = session.items.length;
    const countedItems = session.items.filter(i => i.qtyFisik !== null && i.qtyFisik !== undefined).length;
    const progressPct = totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0;

    let totalPlusQty = 0;
    let totalMinusQty = 0;
    let totalMatchingCount = 0;
    let totalPlusValue = 0;
    let totalMinusValue = 0;

    const locationsSet = new Set<string>();

    const itemsWithCalc = session.items.map(item => {
      if (item.lokasi) locationsSet.add(item.lokasi);

      const isCounted = item.qtyFisik !== null && item.qtyFisik !== undefined;
      const price = item.sparepart?.harga ? Number(item.sparepart.harga) : 0;
      const selisih = isCounted ? (item.qtyFisik! - item.qtySistem) : 0;
      const nilaiVarian = selisih * price;

      if (isCounted) {
        if (selisih > 0) {
          totalPlusQty += selisih;
          totalPlusValue += nilaiVarian;
        } else if (selisih < 0) {
          totalMinusQty += Math.abs(selisih);
          totalMinusValue += Math.abs(nilaiVarian);
        } else {
          totalMatchingCount++;
        }
      }

      return {
        ...item,
        isCounted,
        selisih,
        harga: price,
        nilaiVarian
      };
    });

    const locations = Array.from(locationsSet).sort();

    const masterKategori = await prisma.kategori.findMany({
      select: { nama: true },
      orderBy: { nama: 'asc' }
    });
    const categoriesSet = new Set<string>(masterKategori.map(k => k.nama));
    session.items.forEach(i => { if (i.kategori) categoriesSet.add(i.kategori); });
    const categories = Array.from(categoriesSet).sort();

    return ok({
      session: {
        id: session.id,
        judul: session.judul,
        status: session.status,
        lokasi: session.lokasi,
        catatan: session.catatan,
        approvedBy: session.approvedBy,
        approvedAt: session.approvedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      },
      stats: {
        totalItems,
        countedItems,
        progressPct,
        totalPlusQty,
        totalMinusQty,
        totalMatchingCount,
        totalPlusValue,
        totalMinusValue,
        netVarianceValue: totalPlusValue - totalMinusValue,
        accuracyPct: countedItems > 0 ? Math.round((totalMatchingCount / countedItems) * 1000) / 10 : 0
      },
      locations,
      categories,
      items: itemsWithCalc
    });
  } catch (e: any) {
    console.error('Error fetching opname detail:', e);
    return err('Gagal memuat detail Stock Opname: ' + e.message, 500);
  }
}

// PATCH /api/mtc/opname/[id] - Update single/bulk item count or submit status
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await requireMtcEditor();
    if (!sessionUser) return err('Unauthorized: Hanya editor yang dapat mengubah Stock Opname', 403);

    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) return err('ID sesi tidak valid', 400);

    const body = await req.json();
    const { action, itemId, qtyFisik, auditedBy, catatan, status, bulkUpdates } = body;

    const session = await prisma.opnameSession.findUnique({
      where: { id: sessionId }
    });
    if (!session) return err('Sesi Stock Opname tidak ditemukan', 404);

    // If session is already POSTED, block edits
    if (session.status === 'POSTED') {
      return err('Sesi Stock Opname ini sudah di-posting dan tidak dapat diubah lagi.', 400);
    }

    const defaultAuditor = auditedBy ? String(auditedBy).trim() : (sessionUser?.user?.name || sessionUser?.user?.email || 'Teknisi MTC');

    // ACTION A: Update status (e.g. submit for WAITING_APPROVAL or CANCELLED)
    if (action === 'update_status' || status) {
      const targetStatus = status || body.status;
      if (!['DRAFT', 'WAITING_APPROVAL', 'CANCELLED'].includes(targetStatus)) {
        return err('Status tidak valid', 400);
      }

      const updatedSession = await prisma.opnameSession.update({
        where: { id: sessionId },
        data: { status: targetStatus }
      });

      return ok({
        session: updatedSession,
        msg: targetStatus === 'WAITING_APPROVAL'
          ? '✓ Stock Opname berhasil diajukan ke Supervisor/Manager (Menunggu ACC).'
          : `Status sesi diperbarui menjadi ${targetStatus}.`
      });
    }

    // ACTION B: Bulk Match Uncounted Items (Samakan semua item yang belum dihitung dengan stok sistem)
    if (action === 'bulk_match_uncounted') {
      const uncountedItems = await prisma.opnameItem.findMany({
        where: { sessionId, qtyFisik: null }
      });

      if (uncountedItems.length === 0) {
        return ok({ msg: 'Semua item sudah memiliki data hitungan fisik.' });
      }

      await prisma.$transaction(
        uncountedItems.map(item =>
          prisma.opnameItem.update({
            where: { id: item.id },
            data: {
              qtyFisik: item.qtySistem,
              selisih: 0,
              auditedBy: defaultAuditor
            }
          })
        )
      );

      return ok({
        count: uncountedItems.length,
        msg: `✓ Berhasil menyamakan ${uncountedItems.length} item yang belum dihitung sesuai stok sistem.`
      });
    }

    // ACTION C: Bulk Updates array [{ itemId, qtyFisik, catatan }]
    if (Array.isArray(bulkUpdates) && bulkUpdates.length > 0) {
      await prisma.$transaction(
        bulkUpdates.map(u => {
          const itemNum = parseInt(String(u.itemId));
          const parsedQty = (u.qtyFisik === '' || u.qtyFisik === null || u.qtyFisik === undefined)
            ? null
            : Math.max(0, parseInt(String(u.qtyFisik)) || 0);

          return prisma.opnameItem.update({
            where: { id: itemNum },
            data: {
              qtyFisik: parsedQty,
              selisih: parsedQty !== null ? (parsedQty - (u.qtySistem ?? 0)) : 0,
              ...(u.catatan !== undefined ? { catatan: u.catatan ? String(u.catatan).trim() : null } : {}),
              auditedBy: parsedQty !== null ? defaultAuditor : undefined
            }
          });
        })
      );

      return ok({ msg: `✓ Berhasil memperbarui ${bulkUpdates.length} item.` });
    }

    // ACTION D: Atomic Single Item Count Update
    if (itemId) {
      const itemNum = parseInt(String(itemId));
      const targetItem = await prisma.opnameItem.findUnique({
        where: { id: itemNum }
      });
      if (!targetItem || targetItem.sessionId !== sessionId) {
        return err('Item opname tidak ditemukan', 404);
      }

      const parsedQtyFisik = (qtyFisik === '' || qtyFisik === null || qtyFisik === undefined)
        ? null
        : Math.max(0, parseInt(String(qtyFisik)) || 0);

      const selisih = parsedQtyFisik !== null ? (parsedQtyFisik - targetItem.qtySistem) : 0;

      const updatedItem = await prisma.opnameItem.update({
        where: { id: itemNum },
        data: {
          qtyFisik: parsedQtyFisik,
          selisih,
          catatan: catatan !== undefined ? (catatan ? String(catatan).trim() : null) : targetItem.catatan,
          auditedBy: parsedQtyFisik !== null ? defaultAuditor : targetItem.auditedBy
        }
      });

      return ok({
        item: updatedItem,
        msg: `Item "${targetItem.namaItem}" berhasil diperbarui (Stok Fisik: ${parsedQtyFisik ?? 'Belum dihitung'}).`
      });
    }

    return err('Tindakan tidak valid', 400);
  } catch (e: any) {
    console.error('Error updating opname item:', e);
    return err('Gagal memperbarui item opname: ' + e.message, 500);
  }
}

// DELETE /api/mtc/opname/[id] - Delete/cancel draft session
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await requireMtcEditor();
    if (!sessionUser) return err('Unauthorized: Hanya editor yang dapat menghapus Stock Opname', 403);

    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) return err('ID sesi tidak valid', 400);

    const session = await prisma.opnameSession.findUnique({
      where: { id: sessionId }
    });
    if (!session) return err('Sesi Stock Opname tidak ditemukan', 404);

    if (session.status === 'POSTED') {
      return err('Sesi yang sudah di-posting tidak dapat dihapus', 400);
    }

    await prisma.opnameSession.delete({
      where: { id: sessionId }
    });

    return ok({ msg: `Sesi Stock Opname #${sessionId} berhasil dihapus.` });
  } catch (e: any) {
    console.error('Error deleting opname session:', e);
    return err('Gagal menghapus sesi opname: ' + e.message, 500);
  }
}
