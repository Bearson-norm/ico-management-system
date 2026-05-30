import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

// GET /api/mtc/procurement
export async function GET(req: NextRequest) {
  // We can let viewers see the procurement list, but editor session is required for editing
  // Let's support optional bypass or just check editor session depending on permissions
  const { searchParams } = new URL(req.url);
  const showArchived = searchParams.get('archived') === 'true';

  try {
    const data = await prisma.procurementTracking.findMany({
      where: {
        ...(showArchived
          ? { statusPo: 'DONE' }
          : {
              OR: [
                { statusPo: null },
                { NOT: { statusPo: 'DONE' } },
              ],
            }),
      },
      include: {
        sparepart: {
          select: {
            id: true,
            nama: true,
            uom: true,
            lokasi: true,
            harga: true,
            minQty: true,
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
  } = body;

  if (!originalName?.trim()) return err('Nama barang asli wajib diisi', 400);
  if (!qty || Number(qty) < 1) return err('Kuantitas wajib diisi dan minimal 1', 400);

  try {
    let spName = '';
    if (sparepartId) {
      const sp = await prisma.sparepart.findUnique({
        where: { id: sparepartId },
        select: { nama: true },
      });
      if (sp) {
        spName = sp.nama;
      }
    }

    const tDate = new Date();

    // 1. Simpan di Database lokal PostgreSQL
    const tracking = await prisma.procurementTracking.create({
      data: {
        originalName: originalName.trim(),
        sparepartId: sparepartId || null,
        keterangan: keterangan || null,
        penggunaanBulan: penggunaanBulan ? Number(penggunaanBulan) : null,
        kontrak3Bulan: Boolean(kontrak3Bulan),
        tanggalList: tDate,
        qty: Number(qty),
        productCategory: productCategory || null,
        reason: reason || null,
        urgency: urgency || 'Normal',
        linkReferences: linkReferences || null,
        statusPr: 'CONTINUE', // Default langsung aktif diajukan
        isStocked: isStocked !== undefined ? Boolean(isStocked) : false,
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
        kontrak3Bulan: kontrak3Bulan ? 'TRUE' : 'FALSE',
        tanggalList: tDate.toLocaleDateString('id-ID'), // Format DD/MM/YYYY
        qty: String(qty),
        productCategory: productCategory || '',
        reason: reason || '',
        urgency: urgency || 'Normal',
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
  } = body;

  if (!id) return err('ID record wajib diisi', 400);

  try {
    const updated = await prisma.procurementTracking.update({
      where: { id: Number(id) },
      data: {
        nomorPr: nomorPr !== undefined ? (nomorPr?.trim() || null) : undefined,
        nomorPo: nomorPo !== undefined ? (nomorPo?.trim() || null) : undefined,
        vendor: vendor !== undefined ? (vendor?.trim() || null) : undefined,
        harga: harga !== undefined ? (harga ? Number(harga) : null) : undefined,
        etaFoom: etaFoom !== undefined ? (etaFoom ? new Date(etaFoom) : null) : undefined,
        linkGr: linkGr !== undefined ? (linkGr?.trim() || null) : undefined,
        urgency: urgency !== undefined ? (urgency || 'Normal') : undefined,
        originalName: originalName !== undefined ? (originalName?.trim() || undefined) : undefined,
        qty: qty !== undefined ? Number(qty) : undefined,
        productCategory: productCategory !== undefined ? (productCategory || null) : undefined,
        keterangan: keterangan !== undefined ? (keterangan || null) : undefined,
        reason: reason !== undefined ? (reason || null) : undefined,
      },
    });

    return ok({
      msg: 'Detail pelacakan berhasil diperbarui!',
      data: updated,
    });
  } catch (e: any) {
    console.error('[PATCH /api/mtc/procurement]', e);
    return err(`Gagal memperbarui data: ${e.message}`, 500);
  }
}


