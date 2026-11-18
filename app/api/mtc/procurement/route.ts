import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err, generateItemId } from '@/lib/utils';
import {
  buildRestoredFromArchiveJson,
  getLocalPackMultiplier,
  isManuallyArchived,
} from '@/lib/mtc/procurement-utils';
import { syncSparepartProcurement } from '@/lib/mtc/procurement-server';

// GET /api/mtc/procurement
export async function GET(req: NextRequest) {
  // We can let viewers see the procurement list, but editor session is required for editing
  // Let's support optional bypass or just check editor session depending on permissions
  const { searchParams } = new URL(req.url);
  const archivedParam = searchParams.get('archived') || 'false';

  const whereClause: any = {};
  if (archivedParam === 'true') {
    whereClause.OR = [
      { statusPo: 'DONE' },
      { statusPr: 'RECEIVED' },
      { statusPr: 'CANCELLED' },
      { statusPr: 'REJECTED' },
      { statusPo: 'CANCELLED' },
    ];
  } else if (archivedParam === 'false') {
    whereClause.AND = [
      { OR: [{ statusPo: null }, { NOT: { statusPo: { in: ['DONE', 'CANCELLED'] } } }] },
      { NOT: { statusPr: { in: ['RECEIVED', 'CANCELLED', 'REJECTED'] } } },
    ];
  }

  try {
    const data = await prisma.procurementTracking.findMany({
      where: whereClause,
      include: {
        sparepart: {
          select: {
            id: true,
            nama: true,
            namaAlias: true,
            uom: true,
            lokasi: true,
            harga: true,
            minQty: true,
            linkReference: true,
            alasan: true,
            purchasingStatus: true,
          },
        },
      },
      orderBy: [
        { urgency: 'desc' },
        { fbIndex: 'desc' },
        { tanggalList: 'desc' },
      ],
    });

    return ok(data);
  } catch (e) {
    console.error('[GET /api/mtc/procurement]', e);
    return err('Gagal mengambil data pelacakan', 500);
  }
}

// POST /api/mtc/procurement
export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  const {
    originalName,
    sparepartId,
    keterangan,
    penggunaanBulan,
    kontrak3Bulan,
    qty,
    productCategory,
    reason,
    urgency,
    linkReferences,
    scriptUrl,
    isStocked,
    nomorPr,
    nomorTe,
    isPengadaanBaru,
    namaAlias,
    alasan,
    harga,
    vendor,
    sheetUrl,
  } = body;

  if (!originalName?.trim()) return err('Nama barang asli wajib diisi', 400);
  if (!qty || Number(qty) < 1) return err('Kuantitas wajib diisi dan minimal 1', 400);

  try {
    let finalSheetId = null;
    if (sheetUrl && sheetUrl.trim()) {
      const match = sheetUrl.trim().match(/\/d\/([a-zA-Z0-9-_]+)/);
      finalSheetId = match ? match[1] : sheetUrl.trim();
    }
    const tracking = await prisma.$transaction(async (tx) => {
      let finalSparepartId = sparepartId || null;
      let targetStatusPr = 'CONTINUE';
      let finalHarga = harga != null ? Number(harga) : null;
      let finalVendor = vendor || null;

      if (isPengadaanBaru) {
        const newSpId = await generateItemId(tx as any);
        const priceVal = harga != null ? Number(harga) : 0;
        const initialStatus = priceVal > 0 ? 'READY_ODOO' : 'WAITING_PRICE';

        await tx.sparepart.create({
          data: {
            id: newSpId,
            nama: originalName.trim(),
            namaAlias: namaAlias?.trim() || null,
            uom: 'Pcs',
            harga: priceVal,
            aktif: true,
            purchasingStatus: 'PR',
            purchasingQty: Number(qty) || 0,
            purchasingNoPr: nomorPr?.trim() || null,
            linkReference: linkReferences || null,
            alasan: alasan || reason || null,
          }
        });

        finalSparepartId = newSpId;
        targetStatusPr = initialStatus;
        finalHarga = priceVal;
      } else if (finalSparepartId) {
        const sp = await tx.sparepart.findUnique({
          where: { id: finalSparepartId },
          select: { nama: true, harga: true }
        });
        if (sp) {
          finalHarga = Number(sp.harga) || 0;
          const lastProc = await tx.procurementTracking.findFirst({
            where: { sparepartId: finalSparepartId, vendor: { not: null } },
            orderBy: { tanggalList: 'desc' },
            select: { vendor: true }
          });
          finalVendor = lastProc?.vendor || finalVendor;
        }
        targetStatusPr = 'READY_ODOO';
      }

      const tDate = new Date();
      const created = await tx.procurementTracking.create({
        data: {
          originalName: originalName.trim(),
          sparepartId: finalSparepartId,
          keterangan: keterangan || null,
          penggunaanBulan: penggunaanBulan ? Number(penggunaanBulan) : null,
          kontrak3Bulan: Boolean(kontrak3Bulan),
          tanggalList: tDate,
          qty: Number(qty),
          productCategory: productCategory || null,
          reason: reason || null,
          urgency: urgency || 'Normal',
          linkReferences: linkReferences || null,
          nomorPr: nomorPr?.trim() || null,
          statusPr: targetStatusPr,
          isStocked: isStocked !== undefined ? Boolean(isStocked) : false,
          harga: finalHarga,
          vendor: finalVendor,
          sheetId: finalSheetId,
        },
      });

      if (finalSparepartId) {
        await syncSparepartProcurement(tx, finalSparepartId);
      }

      return created;
    });

    return ok({
      msg: 'Pengajuan PR berhasil disimpan!',
      data: tracking,
    });
  } catch (e: any) {
    console.error('[POST /api/mtc/procurement]', e);
    return err(`Gagal membuat pengajuan pengadaan: ${e.message}`, 500);
  }
}

// PATCH /api/mtc/procurement
export async function PATCH(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  const {
    id,
    nomorPr,
    nomorPo,
    nomorTe,
    vendor,
    harga,
    etaFoom,
    linkGr,
    urgency,
    originalName,
    qty,
    productCategory,
    keterangan,
    reason,
    statusPr,
    odooNotes,
    sparepartId,
    isStocked,
    linkedPartsJson,
  } = body;

  if (!id) return err('ID pengadaan wajib disertakan', 400);

  try {
    const existing = await prisma.procurementTracking.findUnique({
      where: { id: Number(id) },
    });

    if (!existing) return err('Data pengadaan tidak ditemukan', 404);

    let finalHarga = harga !== undefined ? (harga != null ? Number(harga) : null) : undefined;
    let finalVendor = vendor !== undefined ? (vendor?.trim() || null) : undefined;
    let finalStatusPr = statusPr !== undefined ? statusPr : undefined;

    // Jika sparepartId baru dihubungkan secara manual:
    // Jangan menimpa harga PO/PR yang sudah ada di item pengadaan!
    // Hanya gunakan harga master sparepart sebagai fallback jika item belum punya PO dan harganya masih 0/kosong.
    if (sparepartId && sparepartId !== existing.sparepartId) {
      const hasExistingPrice = existing.harga !== null && existing.harga !== undefined && Number(existing.harga) > 0;
      if (harga === undefined && !hasExistingPrice && !existing.nomorPo) {
        const sp = await prisma.sparepart.findUnique({
          where: { id: sparepartId },
          select: { nama: true, harga: true, lokasi: true },
        });
        if (sp && Number(sp.harga) > 0) {
          finalHarga = Number(sp.harga);
        }
      }
    }

    let finalStatusPo: string | null | undefined = undefined;
    if (finalStatusPr !== undefined) {
      const upperStatus = String(finalStatusPr).toUpperCase();
      if (upperStatus === 'RECEIVED') {
        finalStatusPo = 'DONE';
      } else if (upperStatus === 'CANCELLED' || upperStatus === 'REJECTED') {
        finalStatusPo = 'CANCELLED';
      } else if (upperStatus === 'PO') {
        finalStatusPo = 'PO';
      } else if (upperStatus === 'RFQ' || upperStatus === 'TO_APPROVE') {
        finalStatusPo = upperStatus;
      } else {
        finalStatusPo = null;
      }
    }

    let nextLinkedPartsJson = linkedPartsJson !== undefined ? (linkedPartsJson || null) : undefined;
    if (
      nextLinkedPartsJson === undefined &&
      finalStatusPr !== undefined &&
      finalStatusPo !== 'CANCELLED' &&
      isManuallyArchived(existing.linkedPartsJson)
    ) {
      nextLinkedPartsJson = buildRestoredFromArchiveJson(existing.linkedPartsJson);
    }

    const updated = await prisma.procurementTracking.update({
      where: { id: Number(id) },
      data: {
        nomorPr: nomorPr !== undefined ? (nomorPr?.trim() || null) : undefined,
        nomorPo: nomorPo !== undefined ? (nomorPo?.trim() || null) : undefined,
        nomorTe: nomorTe !== undefined ? (nomorTe?.trim() || null) : undefined,
        vendor: vendor !== undefined ? finalVendor : (sparepartId && sparepartId !== existing.sparepartId ? finalVendor : undefined),
        harga: harga !== undefined ? finalHarga : (sparepartId && sparepartId !== existing.sparepartId ? finalHarga : undefined),
        etaFoom: etaFoom !== undefined ? (etaFoom ? new Date(etaFoom) : null) : undefined,
        linkGr: linkGr !== undefined ? (linkGr?.trim() || null) : undefined,
        urgency: urgency !== undefined ? (urgency || 'Normal') : undefined,
        originalName: originalName !== undefined ? (originalName?.trim() || undefined) : undefined,
        qty: qty !== undefined ? Number(qty) : undefined,
        productCategory: productCategory !== undefined ? (productCategory || null) : undefined,
        keterangan: keterangan !== undefined ? (keterangan || null) : undefined,
        reason: reason !== undefined ? (reason || null) : undefined,
        statusPr: finalStatusPr,
        statusPo: finalStatusPo,
        odooNotes: odooNotes !== undefined ? (odooNotes || null) : undefined,
        sparepartId: sparepartId !== undefined ? (sparepartId || null) : undefined,
        isStocked: isStocked !== undefined ? Boolean(isStocked) : (sparepartId ? true : undefined),
        linkedPartsJson: nextLinkedPartsJson,
      },
    });

    // Catatan Penting: Menghubungkan sparepart (Linking) TIDAK BOLEH membuat StockMovement baru!
    // Mutasi stok HANYA boleh dibuat melalui aksi "Terima Barang" (/api/mtc/procurement/receive).
    // Jika mutasi sudah ada sebelumnya dan user mengubah tipe stok (isStocked), baru update mutasi yang ada:
    if (isStocked !== undefined && existing.isStocked !== Boolean(isStocked)) {
      const existingMovs = await prisma.stockMovement.findMany({
        where: {
          OR: [
            { keterangan: { contains: `[Penerimaan Pengadaan #${updated.id}` } },
            { keterangan: { contains: `[Penerimaan Paket #${updated.id}` } },
            ...(updated.sparepartId
              ? [
                  {
                    sparepartId: updated.sparepartId,
                    OR: [
                      { keterangan: { contains: updated.nomorPo ? `PO: ${updated.nomorPo}` : 'Penerimaan' } },
                      { keterangan: { contains: updated.nomorPr ? `PR: ${updated.nomorPr}` : 'Penerimaan' } },
                    ],
                  },
                ]
              : []),
          ],
        },
        include: {
          sparepart: { select: { lokasi: true } },
        },
      });

      if (existingMovs.length > 0) {
        const targetTipe = Boolean(isStocked) ? 'IN' : 'LOG';
        for (const mov of existingMovs) {
          await prisma.stockMovement.update({
            where: { id: mov.id },
            data: {
              tipe: targetTipe,
              lokasi: targetTipe === 'IN' ? mov.sparepart?.lokasi || null : null,
            },
          });
        }
      }
    }

    // MTC PRO: Recalculate purchasing status, purchasingQty, PR/PO numbers, and price on linked Sparepart master
    if (updated.sparepartId) {
      const itemHarga = Number(updated.harga) || 0;
      const packM = getLocalPackMultiplier(updated.linkedPartsJson);
      const unitPrice = packM > 1 ? Number((itemHarga / packM).toFixed(2)) : itemHarga;
      await syncSparepartProcurement(prisma, updated.sparepartId, {
        odooNotes: updated.odooNotes,
        candidateHarga: unitPrice,
        allowHargaUpdate: unitPrice > 0 && !updated.tanggalTerima,
      });
    }
    if (existing.sparepartId && existing.sparepartId !== updated.sparepartId) {
      await syncSparepartProcurement(prisma, existing.sparepartId);
    }

    return ok({
      msg: 'Detail pelacakan berhasil diperbarui!',
      data: updated,
    });
  } catch (e: any) {
    console.error('[PATCH /api/mtc/procurement]', e);
    return err(`Gagal memperbarui data: ${e.message}`, 500);
  }
}

// DELETE /api/mtc/procurement
export async function DELETE(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const action = searchParams.get('action');

  try {
    if (action === 'clear_all' || action === 'clear_synced') {
      const deleted = await prisma.procurementTracking.deleteMany();
      return ok({ msg: `Berhasil menghapus ${deleted.count} data tracking procurement`, count: deleted.count });
    }

    if (id) {
      const existing = await prisma.procurementTracking.findUnique({
        where: { id: Number(id) },
        select: { id: true, sparepartId: true },
      });
      await prisma.procurementTracking.delete({
        where: { id: Number(id) }
      });
      if (existing?.sparepartId) {
        await syncSparepartProcurement(prisma, existing.sparepartId);
      }
      return ok({ msg: 'Item berhasil dihapus' });
    }

    return err('Parameter id atau action wajib diisi', 400);
  } catch (e: any) {
    console.error('[DELETE /api/mtc/procurement]', e);
    return err(`Gagal menghapus data: ${e.message}`, 500);
  }
}


