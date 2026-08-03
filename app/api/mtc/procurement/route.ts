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

    // 2. Jika ada scriptUrl, kirim data pengajuan ke Google Sheets dengan await agar koneksi diselesaikan sebelum response dikirim
    let sheetSuccess = true;
    let sheetError = null;

    if (scriptUrl && scriptUrl.trim()) {
      const scriptPayload = {
        originalName: originalName.trim(),
        mtcItemName: spName,
        keterangan: keterangan || '',
        penggunaanBulan: penggunaanBulan ? String(penggunaanBulan) : '',
        isStocked: isStocked ? 'TRUE' : 'FALSE',
        tanggalList: tDate.toLocaleDateString('id-ID'), // Format DD/MM/YYYY
        qty: String(qty),
        productCategory: productCategory || '',
        reason: reason || '',
        urgency: urgency === 'Urgent' ? 'Urgent' : '',
        linkReferences: linkReferences || '',
      };

      try {
        console.log('[Procurement API] Mengirim data ke Google Sheets Webhook:', scriptUrl.trim());
        const fetchRes = await fetch(scriptUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scriptPayload),
        });

        if (!fetchRes.ok) {
          sheetSuccess = false;
          sheetError = `HTTP error! status: ${fetchRes.status}`;
          console.error('[Google Apps Script Send Fail]', sheetError);
        } else {
          const fetchJson = await fetchRes.json().catch(() => null);
          console.log('[Google Apps Script Response]', fetchJson);
          if (fetchJson && fetchJson.success === false) {
            sheetSuccess = false;
            sheetError = fetchJson.error || 'Gagal diproses di dalam script Sheets';
            console.error('[Google Apps Script Internal Error]', sheetError);
          }
        }
      } catch (fetchErr: any) {
        sheetSuccess = false;
        sheetError = fetchErr.message || String(fetchErr);
        console.error('[Google Apps Script Send Exception]', fetchErr);
      }
    }

    if (!sheetSuccess) {
      return ok({
        msg: `Pengajuan PR berhasil disimpan lokal, namun GAGAL dikirim ke Google Sheets: ${sheetError}. Periksa kembali Apps Script URL Anda.`,
        data: tracking,
        sheetError,
      });
    }

    return ok({
      msg: 'Pengajuan PR berhasil disimpan lokal' + (scriptUrl ? ' & diteruskan ke Google Sheets!' : '!'),
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

  if (!id) return err('ID record wajib diisi', 400);

  try {
    const existing = await prisma.procurementTracking.findUnique({
      where: { id: Number(id) }
    });
    if (!existing) return err('Data pengadaan tidak ditemukan', 404);

    let finalHarga = harga !== undefined ? (harga ? Number(harga) : null) : existing.harga;
    let finalStatusPr = statusPr !== undefined ? statusPr : existing.statusPr;
    let finalVendor = vendor !== undefined ? (vendor?.trim() || null) : existing.vendor;

    // Jika sparepart baru saja dihubungkan, coba ambil harga dari master & vendor dari riwayat
    if (sparepartId && sparepartId !== existing.sparepartId) {
      const sp = await prisma.sparepart.findUnique({
        where: { id: sparepartId },
        select: { harga: true }
      });
      if (sp) {
        if (harga === undefined && sp.harga) {
          finalHarga = Number(sp.harga);
        }
      }
      
      const lastProc = await prisma.procurementTracking.findFirst({
        where: { sparepartId: sparepartId, vendor: { not: null } },
        orderBy: { tanggalList: 'desc' },
        select: { vendor: true }
      });
      if (lastProc && vendor === undefined) {
        finalVendor = lastProc.vendor;
      }
    }

    // Auto READY_ODOO logic: Jika status saat ini adalah draf/prep dan ada harga masuk > 0
    const isDraftStatus = (s: string | null | undefined) => !s || s === 'DRAFT' || s === 'WAITING_PRICE' || s === 'CONTINUE';
    if (isDraftStatus(finalStatusPr) && Number(finalHarga) > 0) {
      finalStatusPr = 'READY_ODOO';
    }

    const updated = await prisma.procurementTracking.update({
      where: { id: Number(id) },
      data: {
        nomorPr: nomorPr !== undefined ? (nomorPr?.trim() || null) : undefined,
        nomorPo: nomorPo !== undefined ? (nomorPo?.trim() || null) : undefined,
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

    // Sync StockMovement if changed after receipt or if sparepart was newly linked
    const isReceivedItem = !!(updated.tanggalTerima || updated.statusPo === 'DONE' || updated.linkGr);
    if (isReceivedItem && updated.sparepartId && (updated.isStocked || isStocked === undefined)) {
      const existingMov = await prisma.stockMovement.findFirst({
        where: {
          sparepartId: updated.sparepartId,
          tipe: 'IN',
          OR: [
            { keterangan: { contains: updated.nomorPo ? `PO: ${updated.nomorPo}` : 'Penerimaan' } },
            { keterangan: { contains: updated.nomorPr ? `PR: ${updated.nomorPr}` : 'Penerimaan' } }
          ]
        }
      });

      if (!existingMov) {
        const sp = await prisma.sparepart.findUnique({
          where: { id: updated.sparepartId }
        });
        if (sp) {
          const tDate = updated.tanggalTerima || new Date();
          await prisma.stockMovement.create({
            data: {
              tipe: 'IN',
              sparepartId: sp.id,
              namaItem: sp.nama,
              qty: updated.qty,
              harga: Number(updated.harga) || Number(sp.harga) || 0,
              lokasi: sp.lokasi,
              purchaseType: 'PO',
              vendor: updated.vendor || null,
              keterangan: `[Penerimaan Pengadaan PR: ${updated.nomorPr || '—'} / PO: ${updated.nomorPo || '—'}]`,
              tanggal: tDate,
            }
          });
        }
      } else if (isStocked !== undefined && Boolean(isStocked) !== existing.isStocked) {
        const targetTipe = Boolean(isStocked) ? 'IN' : 'LOG';
        let lokasiVal = null;
        if (targetTipe === 'IN' && updated.sparepartId) {
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

    // MTC PRO: Propagate status, nomor PR/PO, price, and chatter notes to Sparepart master database table
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


