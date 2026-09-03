import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

// POST /api/mtc/procurement/receive
export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  const { id, tanggalTerima, isStocked, harga, vendor, qtyPerPack, receivedParts } = body;

  if (!id) return err('ID pengadaan wajib diisi', 400);
  if (!tanggalTerima) return err('Tanggal terima wajib diisi', 400);

  const tDate = new Date(tanggalTerima + 'T12:00:00');

  try {
    const tracking = await prisma.procurementTracking.findUnique({
      where: { id: Number(id) },
    });

    if (!tracking) {
      return err('Data pengadaan tidak ditemukan', 404);
    }

    const finalHarga = harga !== undefined ? Number(harga) : Number(tracking.harga || 0);
    const finalVendor = vendor !== undefined ? vendor : tracking.vendor;

    // Hitung elapsed lead time dalam hari
    const elapsedMs = tDate.getTime() - new Date(tracking.tanggalList).getTime();
    const elapsedDays = Math.max(1, elapsedMs / (1000 * 60 * 60 * 24));

    // A. JIKA PAKETAN GABUNGAN (MULTI-ITEM)
    if (receivedParts && Array.isArray(receivedParts) && receivedParts.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const part of receivedParts) {
          const partSpId = part.sparepartId;
          const partQty = Number(part.qty) || 1;
          const partHarga = Number(part.harga) || 0;

          const sp = await tx.sparepart.findUnique({
            where: { id: partSpId },
          });

          if (!sp) throw new Error(`Master Suku Cadang '${partSpId}' tidak ditemukan.`);

          const partKeterangan = `[Penerimaan Paket #${tracking.id} PR: ${tracking.nomorPr || '—'} / PO: ${tracking.nomorPo || '—'}] Bagian dari paket: ${tracking.originalName}`;

          // Cek apakah mutasi untuk part ini pada pengadaan ini sudah pernah dibuat sebelumnya (Anti-Double)
          const existingPartMov = await tx.stockMovement.findFirst({
            where: {
              sparepartId: sp.id,
              OR: [
                { keterangan: { contains: `[Penerimaan Paket #${tracking.id}` } },
                { keterangan: { startsWith: `[Penerimaan Paket PR: ${tracking.nomorPr || '—'} / PO: ${tracking.nomorPo || '—'}]` } },
              ],
            },
          });

          if (existingPartMov) {
            await tx.stockMovement.update({
              where: { id: existingPartMov.id },
              data: {
                tipe: isStocked ? 'IN' : 'LOG',
                qty: partQty,
                harga: partHarga,
                lokasi: isStocked ? sp.lokasi : null,
                vendor: finalVendor,
                keterangan: partKeterangan,
                tanggal: tDate,
              },
            });
          } else {
            await tx.stockMovement.create({
              data: {
                tipe: isStocked ? 'IN' : 'LOG',
                sparepartId: sp.id,
                namaItem: sp.nama,
                qty: partQty,
                harga: partHarga,
                lokasi: isStocked ? sp.lokasi : null,
                purchaseType: 'PO',
                vendor: finalVendor,
                keterangan: partKeterangan,
                tanggal: tDate,
              },
            });
          }

          // 2. Hitung Lead Time Baru untuk Sparepart
          const calculatedAvgLeadTime = sp.avgLeadTime === 0
            ? elapsedDays
            : Number((sp.avgLeadTime * 0.8 + elapsedDays * 0.2).toFixed(2));
          const calculatedMaxLeadTime = Math.max(sp.maxLeadTime, Math.round(elapsedDays));

          // 3. Update Master Sparepart
          await tx.sparepart.update({
            where: { id: sp.id },
            data: {
              harga: partHarga,
              purchasingStatus: 'NONE',
              purchasingQty: 0,
              prDate: null,
              poDate: null,
              avgLeadTime: calculatedAvgLeadTime,
              maxLeadTime: calculatedMaxLeadTime,
            },
          });
        }

        // 4. Update data pelacakan utama
        await tx.procurementTracking.update({
          where: { id: tracking.id },
          data: {
            tanggalTerima: tDate,
            isStocked: Boolean(isStocked),
            harga: finalHarga,
            vendor: finalVendor,
          },
        });
      });

      return ok({ msg: `Berhasil menerima paket gabungan '${tracking.originalName}' ke dalam ${isStocked ? 'stok gudang' : 'pemakaian langsung'} MTC.` });
    }

    // B. JIKA SATU ITEM (BISA DENGAN KONVERSI KEMASAN)
    const multiplier = qtyPerPack && Number(qtyPerPack) > 0 ? Number(qtyPerPack) : 1;
    const movementQty = tracking.qty * multiplier;
    const movementHarga = finalHarga / multiplier;

    if (isStocked) {
      // OPSI A: Masukkan ke Stok Gudang
      if (!tracking.sparepartId) {
        return err('Barang ini belum dihubungkan ke Master Suku Cadang MTC. Silakan hubungkan terlebih dahulu sebelum memasukkannya ke stok.', 400);
      }

      await prisma.$transaction(async (tx) => {
        const sp = await tx.sparepart.findUnique({
          where: { id: tracking.sparepartId! },
        });

        if (!sp) throw new Error('Master Suku Cadang tidak ditemukan');

        // 1. Cek apakah StockMovement untuk pengadaan ini sudah pernah dibuat sebelumnya (Anti-Double)
        const docKeteranganPrefix = `[Penerimaan Pengadaan #${tracking.id} PR: ${tracking.nomorPr || '—'} / PO: ${tracking.nomorPo || '—'}]`;
        const existingMov = await tx.stockMovement.findFirst({
          where: {
            sparepartId: sp.id,
            OR: [
              { keterangan: { contains: `[Penerimaan Pengadaan #${tracking.id}` } },
              { keterangan: { startsWith: `[Penerimaan Pengadaan PR: ${tracking.nomorPr || '—'} / PO: ${tracking.nomorPo || '—'}]` } },
              ...(tracking.nomorPo ? [{
                tipe: 'IN',
                keterangan: { contains: `PO: ${tracking.nomorPo}` },
              }] : []),
            ],
          },
        });

        if (existingMov) {
          // Update mutasi yang sudah ada agar tidak terjadi double penerimaan
          await tx.stockMovement.update({
            where: { id: existingMov.id },
            data: {
              tipe: 'IN',
              qty: movementQty,
              harga: movementHarga,
              lokasi: sp.lokasi,
              vendor: finalVendor,
              keterangan: docKeteranganPrefix + (multiplier > 1 ? ` (Kemasan: ${tracking.qty} x ${multiplier})` : ''),
              tanggal: tDate,
            },
          });
        } else {
          // Buat StockMovement baru tipe IN jika belum ada
          await tx.stockMovement.create({
            data: {
              tipe: 'IN',
              sparepartId: sp.id,
              namaItem: sp.nama,
              qty: movementQty,
              harga: movementHarga,
              lokasi: sp.lokasi,
              purchaseType: 'PO',
              vendor: finalVendor,
              keterangan: docKeteranganPrefix + (multiplier > 1 ? ` (Kemasan: ${tracking.qty} x ${multiplier})` : ''),
              tanggal: tDate,
            },
          });
        }

        // 2. Hitung Lead Time Baru untuk Sparepart
        const calculatedAvgLeadTime = sp.avgLeadTime === 0
          ? elapsedDays
          : Number((sp.avgLeadTime * 0.8 + elapsedDays * 0.2).toFixed(2));
        const calculatedMaxLeadTime = Math.max(sp.maxLeadTime, Math.round(elapsedDays));

        // 3. Update Master Sparepart
        await tx.sparepart.update({
          where: { id: sp.id },
          data: {
            harga: movementHarga,
            purchasingStatus: 'NONE',
            purchasingQty: 0,
            prDate: null,
            poDate: null,
            avgLeadTime: calculatedAvgLeadTime,
            maxLeadTime: calculatedMaxLeadTime,
          },
        });

        // 4. Update data pelacakan
        await tx.procurementTracking.update({
          where: { id: tracking.id },
          data: {
            tanggalTerima: tDate,
            isStocked: true,
            harga: finalHarga,
            vendor: finalVendor,
          },
        });
      });

      return ok({ msg: `Berhasil menerima ${tracking.originalName} ke dalam stok gudang MTC.` });
    } else {
      // OPSI B: Langsung Pakai (Non-Stok)
      await prisma.$transaction(async (tx) => {
        const logKeterangan = `[Penerimaan Pengadaan #${tracking.id} - Langsung Pakai]` + (multiplier > 1 ? ` (Kemasan: ${tracking.qty} x ${multiplier})` : '') + ` Alasan: ${tracking.reason || 'Kebutuhan pemakaian langsung'}`;

        // Cek apakah StockMovement tipe LOG untuk pengadaan ini sudah pernah dibuat sebelumnya (Anti-Double)
        const existingLog = await tx.stockMovement.findFirst({
          where: {
            OR: [
              { keterangan: { contains: `[Penerimaan Pengadaan #${tracking.id}` } },
              {
                tipe: 'LOG',
                namaItem: tracking.originalName,
                keterangan: { startsWith: `[Penerimaan Pengadaan - Langsung Pakai]` },
              },
            ],
          },
        });

        if (existingLog) {
          await tx.stockMovement.update({
            where: { id: existingLog.id },
            data: {
              qty: movementQty,
              harga: movementHarga,
              vendor: finalVendor,
              keterangan: logKeterangan,
              tanggal: tDate,
            },
          });
        } else {
          // 1. Buat StockMovement tipe LOG jika belum ada
          await tx.stockMovement.create({
            data: {
              tipe: 'LOG',
              sparepartId: tracking.sparepartId || null,
              namaItem: tracking.originalName,
              qty: movementQty,
              harga: movementHarga,
              purchaseType: 'PO',
              vendor: finalVendor,
              keterangan: logKeterangan,
              tanggal: tDate,
            },
          });
        }

        // 2. Update Lead Time Sparepart jika terhubung
        if (tracking.sparepartId) {
          const sp = await tx.sparepart.findUnique({
            where: { id: tracking.sparepartId },
          });

          if (sp) {
            const calculatedAvgLeadTime = sp.avgLeadTime === 0
              ? elapsedDays
              : Number((sp.avgLeadTime * 0.8 + elapsedDays * 0.2).toFixed(2));
            const calculatedMaxLeadTime = Math.max(sp.maxLeadTime, Math.round(elapsedDays));

            await tx.sparepart.update({
              where: { id: sp.id },
              data: {
                purchasingStatus: 'NONE',
                purchasingQty: 0,
                prDate: null,
                poDate: null,
                avgLeadTime: calculatedAvgLeadTime,
                maxLeadTime: calculatedMaxLeadTime,
              },
            });
          }
        }

        // 3. Update data pelacakan
        await tx.procurementTracking.update({
          where: { id: tracking.id },
          data: {
            tanggalTerima: tDate,
            isStocked: false,
            harga: finalHarga,
            vendor: finalVendor,
          },
        });
      });

      return ok({ msg: `Berhasil menerima ${tracking.originalName} sebagai pemakaian langsung (Non-Stok).` });
    }
  } catch (e: any) {
    console.error('[POST /api/mtc/procurement/receive]', e);
    return err(`Gagal memproses penerimaan: ${e.message}`, 500);
  }
}
