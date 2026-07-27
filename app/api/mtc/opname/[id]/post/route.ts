import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, err } from '@/lib/utils';
import { requireMtcEditor } from '@/lib/auth';

// POST /api/mtc/opname/[id]/post - ACC & Post Stock Opname Adjustments
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await requireMtcEditor();
    if (!sessionUser) return err('Hanya Supervisor / Editor MTC yang diizinkan meng-ACC & Posting Stock Opname.', 403);

    const sessionId = parseInt(params.id);
    if (isNaN(sessionId)) return err('ID sesi tidak valid', 400);

    const session = await prisma.opnameSession.findUnique({
      where: { id: sessionId },
      include: { items: true }
    });

    if (!session) return err('Sesi Stock Opname tidak ditemukan', 404);
    if (session.status === 'POSTED') {
      return err('Sesi Stock Opname ini sudah di-ACC & di-posting sebelumnya.', 400);
    }

    const itemsToAdjust = session.items.filter(item => item.qtyFisik !== null && item.qtyFisik !== undefined && item.selisih !== 0);

    const auditorName = sessionUser.namaLengkap || sessionUser.username || 'Supervisor MTC';

    // Transaction to update session and post StockMovements
    await prisma.$transaction(async (tx) => {
      // 1. Mark OpnameSession as POSTED
      await tx.opnameSession.update({
        where: { id: sessionId },
        data: {
          status: 'POSTED',
          approvedBy: auditorName,
          approvedAt: new Date()
        }
      });

      // 2. Create StockMovement adjustments for items with variance
      for (const item of itemsToAdjust) {
        const isPlus = item.selisih > 0;
        const movementQty = Math.abs(item.selisih);

        await tx.stockMovement.create({
          data: {
            tipe: isPlus ? 'IN' : 'OUT',
            sparepartId: item.sparepartId || null,
            namaItem: item.namaItem,
            qty: movementQty,
            lokasi: item.lokasi || 'Gudang MTC',
            keterangan: `[OPNAME] Adjustment Hasil Audit Sesi #${sessionId} - "${session.judul}" (${isPlus ? '+' : '-'}${movementQty} ${item.uom})`,
            tanggal: new Date()
          }
        });
      }
    });

    return ok({
      msg: `✓ Sesi Stock Opname #${sessionId} ("${session.judul}") berhasil di-ACC & Di-Posting! Total ${itemsToAdjust.length} item penyesuaian stok telah diperbarui.`
    });
  } catch (e: any) {
    console.error('Error posting opname session:', e);
    return err('Gagal meng-ACC & posting Stock Opname: ' + e.message, 500);
  }
}
