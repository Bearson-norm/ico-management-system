import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err, generateItemId } from '@/lib/utils';

// GET /api/mtc/procurement
export async function GET(req: NextRequest) {
  // We can let viewers see the procurement list, but editor session is required for editing
  // Let's support optional bypass or just check editor session depending on permissions
  const { searchParams } = new URL(req.url);
  const archivedParam = searchParams.get('archived') || 'false';

  const whereClause: any = {};
  if (archivedParam === 'true') {
    whereClause.statusPo = 'DONE';
  } else if (archivedParam === 'false') {
    whereClause.OR = [
      { statusPo: null },
      { NOT: { statusPo: 'DONE' } },
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
            odooNotes: true,
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
    let finalSparepartId = sparepartId || null;
    let spName = '';
    let targetStatusPr = 'CONTINUE'; // Default status PR
    let finalHarga = harga != null ? Number(harga) : null;
    let finalVendor = vendor || null;

    if (isPengadaanBaru) {
      // 1. Jalankan Penomoran ID Sparepart Baru secara otomatis
      const newSpId = await generateItemId(prisma);
      
      const priceVal = harga != null ? Number(harga) : 0;
      const initialStatus = priceVal > 0 ? 'READY_ODOO' : 'WAITING_PRICE';

      // 2. Buat Sparepart di database master berstatus WAITING_PRICE atau READY_ODOO
      const newSp = await prisma.sparepart.create({
        data: {
          id: newSpId,
          nama: originalName.trim(),
          namaAlias: namaAlias?.trim() || null,
          uom: 'Pcs',
          harga: priceVal,
          aktif: true,
          purchasingStatus: initialStatus,
          purchasingQty: Number(qty) || 0,
          purchasingNoPr: nomorPr?.trim() || null,
          linkReference: linkReferences || null,
          alasan: alasan || reason || null,
        }
      });

      finalSparepartId = newSpId;
      spName = originalName.trim();
      targetStatusPr = initialStatus;
      finalHarga = priceVal;
    } else if (finalSparepartId) {
      // Repeat Order: Lock Harga dari Database & Set Status READY_ODOO
      const sp = await prisma.sparepart.findUnique({
        where: { id: finalSparepartId },
        select: { nama: true, harga: true }
      });
      if (sp) {
        spName = sp.nama;
        finalHarga = Number(sp.harga) || 0;
        
        // Cari vendor terakhir dari riwayat pengadaan tim
        const lastProc = await prisma.procurementTracking.findFirst({
          where: { sparepartId: finalSparepartId, vendor: { not: null } },
          orderBy: { tanggalList: 'desc' },
          select: { vendor: true }
        });
        finalVendor = lastProc?.vendor || finalVendor;
      }
      targetStatusPr = 'READY_ODOO';

      // Update Sparepart status di database master
      await prisma.sparepart.update({
        where: { id: finalSparepartId },
        data: {
          purchasingStatus: 'READY_ODOO',
          purchasingQty: Number(qty) || 0,
          purchasingNoPr: nomorPr?.trim() || null,
        }
      });
    }

    const tDate = new Date();

    // 3. Simpan di Database lokal PostgreSQL
    const tracking = await prisma.procurementTracking.create({
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

    // Jika sparepartId baru dihubungkan secara manual
    if (sparepartId && sparepartId !== existing.sparepartId) {
      const sp = await prisma.sparepart.findUnique({
        where: { id: sparepartId },
        select: { nama: true, harga: true, lokasi: true },
      });
      if (sp) {
        if (harga === undefined && Number(sp.harga) > 0) {
          finalHarga = Number(sp.harga);
        }
      }
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
        odooNotes: odooNotes !== undefined ? (odooNotes || null) : undefined,
        sparepartId: sparepartId !== undefined ? (sparepartId || null) : undefined,
        isStocked: isStocked !== undefined ? Boolean(isStocked) : (sparepartId ? true : undefined),
        linkedPartsJson: linkedPartsJson !== undefined ? (linkedPartsJson || null) : undefined,
      },
    });

    // Catatan Penting: Menghubungkan sparepart (Linking) TIDAK BOLEH membuat StockMovement baru!
    // Mutasi stok HANYA boleh dibuat melalui aksi "Terima Barang" (/api/mtc/procurement/receive).
    // Jika mutasi sudah ada sebelumnya dan user mengubah tipe stok (isStocked), baru update mutasi yang ada:
    if (isStocked !== undefined && existing.isStocked !== Boolean(isStocked) && updated.sparepartId) {
      const existingMov = await prisma.stockMovement.findFirst({
        where: {
          sparepartId: updated.sparepartId,
          OR: [
            { keterangan: { contains: updated.nomorPo ? `PO: ${updated.nomorPo}` : 'Penerimaan' } },
            { keterangan: { contains: updated.nomorPr ? `PR: ${updated.nomorPr}` : 'Penerimaan' } }
          ]
        }
      });

      if (existingMov) {
        const targetTipe = Boolean(isStocked) ? 'IN' : 'LOG';
        let lokasiVal = null;
        if (targetTipe === 'IN') {
          const sp = await prisma.sparepart.findUnique({
            where: { id: updated.sparepartId },
            select: { lokasi: true },
          });
          lokasiVal = sp?.lokasi || null;
        }

        await prisma.stockMovement.update({
          where: { id: existingMov.id },
          data: {
            tipe: targetTipe,
            lokasi: lokasiVal,
          },
        });
      }
    }

    // MTC PRO: Propagate status, nomor PR/PO, price, and chatter notes to Sparepart master database tableable
    if (updated.sparepartId) {
      const spUpdateData: any = {};
      if (updated.statusPr) spUpdateData.purchasingStatus = updated.statusPr;
      if (updated.nomorPr !== undefined) spUpdateData.purchasingNoPr = updated.nomorPr;
      if (updated.nomorPo !== undefined) spUpdateData.purchasingNoPo = updated.nomorPo;
      if (updated.odooNotes !== undefined) spUpdateData.odooNotes = updated.odooNotes;
      if (updated.harga !== null && updated.harga !== undefined) {
        spUpdateData.harga = updated.harga;
      }

      if (Object.keys(spUpdateData).length > 0) {
        await prisma.sparepart.update({
          where: { id: updated.sparepartId },
          data: spUpdateData
        });
      }
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
      await prisma.procurementTracking.delete({
        where: { id: Number(id) }
      });
      return ok({ msg: 'Item berhasil dihapus' });
    }

    return err('Parameter id atau action wajib diisi', 400);
  } catch (e: any) {
    console.error('[DELETE /api/mtc/procurement]', e);
    return err(`Gagal menghapus data: ${e.message}`, 500);
  }
}


