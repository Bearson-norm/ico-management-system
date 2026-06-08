import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err, generateItemId } from '@/lib/utils';

// POST /api/mtc/procurement/batch
export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  const { items, nomorPr, scriptUrl, sheetUrl } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return err('Daftar item keranjang wajib dikirim dan tidak boleh kosong', 400);
  }

  try {
    let finalSheetId = null;
    if (sheetUrl && sheetUrl.trim()) {
      const match = sheetUrl.trim().match(/\/d\/([a-zA-Z0-9-_]+)/);
      finalSheetId = match ? match[1] : sheetUrl.trim();
    }
    const tDate = new Date();
    const createdRecords: any[] = [];
    const sheetSyncErrors: string[] = [];

    // 1. Simpan semua data pengadaan ke database lokal PostgreSQL dalam satu transaksi Prisma
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        if (!item.originalName?.trim()) {
          throw new Error('Nama barang asli pada salah satu item wajib diisi');
        }
        if (!item.qty || Number(item.qty) < 1) {
          throw new Error('Jumlah (Qty) minimal harus 1');
        }

        let finalSparepartId = item.sparepartId || null;
        let targetStatusPr = 'CONTINUE';
        let finalHarga = item.harga ? Number(item.harga) : null;
        let finalVendor = item.vendor || null;

        if (item.isPengadaanBaru) {
          // A. Jalankan Penomoran ID Sparepart Baru secara otomatis di dalam transaksi
          const newSpId = await generateItemId(tx as any);
          const priceVal = item.harga ? Number(item.harga) : 0;
          const initialStatus = priceVal > 0 ? 'READY_ODOO' : 'WAITING_PRICE';

          // B. Buat Sparepart di database master berstatus WAITING_PRICE atau READY_ODOO
          const newSp = await tx.sparepart.create({
            data: {
              id: newSpId,
              nama: item.originalName.trim(),
              namaAlias: item.namaAlias?.trim() || null,
              uom: 'Pcs',
              harga: priceVal,
              aktif: true,
              purchasingStatus: initialStatus,
              purchasingQty: Number(item.qty) || 0,
              purchasingNoPr: nomorPr?.trim() || null,
              linkReference: item.linkReferences || null,
              alasan: item.alasan || item.reason || null,
            }
          });

          finalSparepartId = newSpId;
          targetStatusPr = initialStatus;
          finalHarga = priceVal;
        } else if (finalSparepartId) {
          // Repeat Order: Lock Harga dari Database & Set Status READY_ODOO
          const sp = await tx.sparepart.findUnique({
            where: { id: finalSparepartId },
            select: { nama: true, harga: true }
          });
          if (sp) {
            finalHarga = Number(sp.harga) || 0;
            
            // Cari vendor terakhir dari riwayat pengadaan tim
            const lastProc = await tx.procurementTracking.findFirst({
              where: { sparepartId: finalSparepartId, vendor: { not: null } },
              orderBy: { tanggalList: 'desc' },
              select: { vendor: true }
            });
            finalVendor = lastProc?.vendor || finalVendor;
          }
          targetStatusPr = 'READY_ODOO';

          // Update Sparepart status di database master
          await tx.sparepart.update({
            where: { id: finalSparepartId },
            data: {
              purchasingStatus: 'READY_ODOO',
              purchasingQty: Number(item.qty) || 0,
              purchasingNoPr: nomorPr?.trim() || null,
            }
          });
        }

        // Auto READY_ODOO logic: jika ada harga > 0, otomatis READY_ODOO
        if (finalHarga && Number(finalHarga) > 0) {
          targetStatusPr = 'READY_ODOO';
        }

        const created = await tx.procurementTracking.create({
          data: {
            originalName: item.originalName.trim(),
            sparepartId: finalSparepartId,
            keterangan: item.keterangan || null,
            penggunaanBulan: item.penggunaanBulan ? Number(item.penggunaanBulan) : null,
            kontrak3Bulan: Boolean(item.kontrak3Bulan),
            tanggalList: tDate,
            qty: Number(item.qty),
            productCategory: item.productCategory || null,
            reason: item.reason || null,
            urgency: item.urgency || 'Normal',
            linkReferences: item.linkReferences || null,
            vendor: finalVendor,
            harga: finalHarga,
            nomorPr: nomorPr?.trim() || null,
            statusPr: targetStatusPr,
            isStocked: item.isStocked !== undefined ? Boolean(item.isStocked) : false,
            sheetId: finalSheetId,
          },
        });
        createdRecords.push(created);
      }
    });

    // 2. Hubungkan ke Google Sheets jika Apps Script Webhook dikonfigurasi
    if (scriptUrl && scriptUrl.trim()) {
      console.log(`[Batch Procurement API] Menghubungi Google Sheets untuk ${items.length} item...`);

      // Kita jalankan request paralel menggunakan Promise.all agar proses cepat dan responsif
      await Promise.all(
        createdRecords.map(async (record) => {
          let spName = '';
          if (record.sparepartId) {
            const sp = await prisma.sparepart.findUnique({
              where: { id: record.sparepartId },
              select: { nama: true },
            });
            if (sp) spName = sp.nama;
          }

          const scriptPayload = {
            originalName: record.originalName,
            mtcItemName: spName,
            keterangan: record.keterangan || '',
            penggunaanBulan: record.penggunaanBulan ? String(record.penggunaanBulan) : '',
            isStocked: record.isStocked ? 'TRUE' : 'FALSE',
            tanggalList: record.tanggalList.toLocaleDateString('id-ID'), // Format DD/MM/YYYY
            qty: String(record.qty),
            productCategory: record.productCategory || '',
            reason: record.reason || '',
            urgency: record.urgency === 'Urgent' ? 'Urgent' : '',
            linkReferences: record.linkReferences || '',
          };

          try {
            const fetchRes = await fetch(scriptUrl.trim(), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(scriptPayload),
            });

            if (!fetchRes.ok) {
              sheetSyncErrors.push(`[${record.originalName}] HTTP error ${fetchRes.status}`);
            } else {
              const fetchJson = await fetchRes.json().catch(() => null);
              if (fetchJson && fetchJson.success === false) {
                sheetSyncErrors.push(`[${record.originalName}] ${fetchJson.error || 'Gagal internal script'}`);
              }
            }
          } catch (fetchErr: any) {
            sheetSyncErrors.push(`[${record.originalName}] ${fetchErr.message || String(fetchErr)}`);
          }
        })
      );
    }

    if (sheetSyncErrors.length > 0) {
      return ok({
        msg: `Batch PR berhasil disimpan lokal (${createdRecords.length} item), namun ada kendala sinkronisasi Google Sheets pada sebagian item:\n` + sheetSyncErrors.join('\n'),
        data: createdRecords,
        partialError: true,
      });
    }

    return ok({
      msg: `Berhasil mengajukan ${createdRecords.length} item PR secara masal!` + (scriptUrl ? ' & tersinkronisasi ke Google Sheets.' : ''),
      data: createdRecords,
    });
  } catch (e: any) {
    console.error('[POST /api/mtc/procurement/batch] Error:', e);
    return err(`Gagal memproses pengajuan batch: ${e.message}`, 500);
  }
}
