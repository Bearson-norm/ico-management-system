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

  const {
    id,
    tanggalTerima,
    isStocked,
    harga,
    vendor,
    qtyPerPack,
    receivedParts,
    qty,
    isPackMode,
    uomPack,
    uomUnit,
  } = body;

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

    let isAlreadyInUnits = false;
    let existingPackMeta: any = null;
    if (tracking.linkedPartsJson) {
      try {
        existingPackMeta = JSON.parse(tracking.linkedPartsJson);
        if (existingPackMeta && (existingPackMeta.isConvertedToUnits || existingPackMeta.originalPackQty !== undefined)) {
          isAlreadyInUnits = true;
        }
      } catch {}
    }

    const packModeActive = Boolean(isPackMode) || (Number(qtyPerPack) > 1) || isAlreadyInUnits;
    const effectivePackMultiplier = Number(qtyPerPack) > 1 ? Number(qtyPerPack) : (Number(existingPackMeta?.qtyPerPack) || 1);
    const multiplier = packModeActive && !isAlreadyInUnits && effectivePackMultiplier > 1 ? effectivePackMultiplier : 1;
    const selectedUomPack = (uomPack || existingPackMeta?.uomPack || 'Pack').trim();
    const selectedUomUnit = (uomUnit || existingPackMeta?.uomUnit || 'Pcs').trim();

    const totalOrderedUnits = tracking.qty * multiplier;

    const rawQty = qty !== undefined && qty !== null ? Number(qty) : totalOrderedUnits;
    if (isNaN(rawQty) || rawQty <= 0) {
      return err('Jumlah (qty) diterima harus lebih besar dari 0', 400);
    }
    if (rawQty > totalOrderedUnits) {
      return err(`Jumlah diterima (${rawQty} ${selectedUomUnit}) tidak boleh melebihi total pesanan (${totalOrderedUnits} ${selectedUomUnit})`, 400);
    }

    const actualReceiveUnits = rawQty;
    const isPartial = actualReceiveUnits < totalOrderedUnits;
    const remainingUnits = totalOrderedUnits - actualReceiveUnits;

    const movementQty = actualReceiveUnits;
    const movementHarga = isAlreadyInUnits ? finalHarga : Number((finalHarga / multiplier).toFixed(2));

    const packMetadata = packModeActive
      ? JSON.stringify({
          type: 'pack',
          isPackMode: true,
          qtyPerPack: effectivePackMultiplier,
          uomPack: selectedUomPack,
          uomUnit: selectedUomUnit,
          originalPackQty: isAlreadyInUnits ? (existingPackMeta?.originalPackQty || tracking.qty) : tracking.qty,
          originalPackPrice: isAlreadyInUnits ? (existingPackMeta?.originalPackPrice || (finalHarga * effectivePackMultiplier)) : finalHarga,
          isConvertedToUnits: true,
        })
      : tracking.linkedPartsJson;

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

    // B. JIKA SATU ITEM (DENGAN KONVERSI KEMASAN & PENERIMAAN PARSIAL)

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

        // 1. Cek apakah StockMovement untuk pengadaan ini sudah pernah dibuat sebelumnya (Anti-Double strictly locked to tracking ID)
        const packLabel = packModeActive ? ` (Kemasan: 1 ${selectedUomPack} = ${multiplier} ${selectedUomUnit})` : '';
        const docKeteranganPrefix = `[Penerimaan Pengadaan #${tracking.id}${isPartial ? ` (Parsial: ${actualReceiveUnits}/${totalOrderedUnits} ${selectedUomUnit})` : ''} PR: ${tracking.nomorPr || '—'} / PO: ${tracking.nomorPo || '—'}]`;
        const fullKeterangan = docKeteranganPrefix + packLabel;

        const existingMov = await tx.stockMovement.findFirst({
          where: {
            sparepartId: sp.id,
            OR: [
              { keterangan: { contains: `[Penerimaan Pengadaan #${tracking.id}]` } },
              { keterangan: { contains: `[Penerimaan Pengadaan #${tracking.id} ` } },
              { keterangan: { contains: `[Penerimaan Paket #${tracking.id}]` } },
              { keterangan: { contains: `[Penerimaan Paket #${tracking.id} ` } },
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
              keterangan: fullKeterangan,
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
              keterangan: fullKeterangan,
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
        const newPurchasingQty = isPartial ? remainingUnits : 0;
        const newPurchasingStatus = isPartial && newPurchasingQty > 0 ? 'PO' : 'NONE';

        await tx.sparepart.update({
          where: { id: sp.id },
          data: {
            harga: movementHarga,
            purchasingStatus: newPurchasingStatus,
            purchasingQty: newPurchasingQty,
            ...(newPurchasingStatus === 'NONE' ? { prDate: null, poDate: null } : {}),
            avgLeadTime: calculatedAvgLeadTime,
            maxLeadTime: calculatedMaxLeadTime,
          },
        });

        // 3b. Jika Kemasan Roll atau Sparepart Bertipe Bulk, buat baris PotonganFisik per Roll
        const isRollOrBulk = selectedUomPack.toLowerCase() === 'roll' || sp.tipeUkur === 'bulk';
        if (isRollOrBulk) {
          if (sp.tipeUkur !== 'bulk' || (selectedUomUnit && sp.uom !== selectedUomUnit)) {
            await tx.sparepart.update({
              where: { id: sp.id },
              data: {
                tipeUkur: 'bulk',
                ...(selectedUomUnit ? { uom: selectedUomUnit } : {}),
              },
            });
          }

          // Bersihkan potongan fisik lama terkait tracking ini jika penerimaan diupdate (Idempotency)
          await tx.potonganFisik.deleteMany({
            where: {
              sparepartId: sp.id,
              asal: { contains: `#${tracking.id}` },
            },
          });

          if (packModeActive && multiplier > 1) {
            const rollLength = multiplier;
            const fullRolls = Math.floor(actualReceiveUnits / rollLength);
            const remainder = actualReceiveUnits % rollLength;

            for (let i = 1; i <= fullRolls; i++) {
              await tx.potonganFisik.create({
                data: {
                  sparepartId: sp.id,
                  panjangAwal: rollLength,
                  panjangSisa: rollLength,
                  asal: `PO ${tracking.nomorPo || '—'} #${tracking.id} (Roll ${i}/${fullRolls}${remainder > 0 ? '+sisa' : ''})`,
                  tanggalMasuk: tDate,
                  status: 'aktif',
                },
              });
            }

            if (remainder > 0) {
              await tx.potonganFisik.create({
                data: {
                  sparepartId: sp.id,
                  panjangAwal: remainder,
                  panjangSisa: remainder,
                  asal: `PO ${tracking.nomorPo || '—'} #${tracking.id} (Potongan Sisa ${remainder} ${selectedUomUnit})`,
                  tanggalMasuk: tDate,
                  status: 'aktif',
                },
              });
            }
          } else {
            await tx.potonganFisik.create({
              data: {
                sparepartId: sp.id,
                panjangAwal: actualReceiveUnits,
                panjangSisa: actualReceiveUnits,
                asal: `PO ${tracking.nomorPo || '—'} #${tracking.id} (${actualReceiveUnits} ${selectedUomUnit || sp.uom})`,
                tanggalMasuk: tDate,
                status: 'aktif',
              },
            });
          }
        }

        // 4. Update data pelacakan yang diterima
        await tx.procurementTracking.update({
          where: { id: tracking.id },
          data: {
            qty: actualReceiveUnits,
            tanggalTerima: tDate,
            isStocked: true,
            harga: movementHarga,
            vendor: finalVendor,
            linkedPartsJson: packMetadata,
          },
        });

        // 5. Jika Penerimaan Parsial (Sebagian), buat record sisa pesanan yang masih ditunggu
        if (isPartial) {
          await tx.procurementTracking.create({
            data: {
              fbIndex: tracking.fbIndex,
              originalName: tracking.originalName,
              sparepartId: tracking.sparepartId,
              keterangan: tracking.keterangan,
              penggunaanBulan: tracking.penggunaanBulan,
              kontrak3Bulan: tracking.kontrak3Bulan,
              tanggalList: tracking.tanggalList,
              qty: remainingUnits,
              productCategory: tracking.productCategory,
              reason: tracking.reason,
              urgency: tracking.urgency,
              linkReferences: tracking.linkReferences,
              vendor: finalVendor,
              harga: movementHarga,
              nomorPr: tracking.nomorPr,
              statusPr: tracking.statusPr,
              statusPa: tracking.statusPa,
              statusPo: tracking.statusPo,
              nomorPo: tracking.nomorPo,
              nomorTe: tracking.nomorTe,
              poApproved: tracking.poApproved,
              etaFoom: tracking.etaFoom,
              linkGr: null,
              tanggalTerima: null,
              isStocked: false,
              sheetId: tracking.sheetId,
              odooNotes: tracking.odooNotes
                ? `${tracking.odooNotes}\n[Penerimaan Parsial: ${actualReceiveUnits} diterima tgl ${tanggalTerima}, sisa ${remainingUnits} ${selectedUomUnit} menunggu]`
                : `[Penerimaan Parsial: ${actualReceiveUnits} diterima tgl ${tanggalTerima}, sisa ${remainingUnits} ${selectedUomUnit} menunggu]`,
              linkedPartsJson: packMetadata,
            },
          });
        }
      });

      const msg = isPartial
        ? `✓ Berhasil menerima sebagian: ${actualReceiveUnits} ${selectedUomUnit} ${tracking.originalName} ke dalam stok gudang MTC. Sisa ${remainingUnits} ${selectedUomUnit} tetap aktif dalam status PO.`
        : `✓ Berhasil menerima ${tracking.originalName} (${actualReceiveUnits} ${selectedUomUnit}) ke dalam stok gudang MTC.`;

      return ok({ msg });
    } else {
      // OPSI B: Langsung Pakai (Non-Stok)
      await prisma.$transaction(async (tx) => {
        const packLabel = packModeActive ? ` (Kemasan: 1 ${selectedUomPack} = ${multiplier} ${selectedUomUnit})` : '';
        const logKeterangan = `[Penerimaan Pengadaan #${tracking.id}${isPartial ? ` (Parsial: ${actualReceiveUnits}/${totalOrderedUnits} ${selectedUomUnit})` : ''} - Langsung Pakai]` +
          packLabel +
          ` Alasan: ${tracking.reason || 'Kebutuhan pemakaian langsung'}`;

        // Cek apakah StockMovement tipe LOG untuk pengadaan ini sudah pernah dibuat sebelumnya (Anti-Double)
        const existingLog = await tx.stockMovement.findFirst({
          where: {
            sparepartId: tracking.sparepartId || null,
            OR: [
              { keterangan: { contains: `[Penerimaan Pengadaan #${tracking.id}]` } },
              { keterangan: { contains: `[Penerimaan Pengadaan #${tracking.id} ` } },
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

            const newPurchasingQty = isPartial ? remainingUnits : 0;
            const newPurchasingStatus = isPartial && newPurchasingQty > 0 ? 'PO' : 'NONE';

            await tx.sparepart.update({
              where: { id: sp.id },
              data: {
                purchasingStatus: newPurchasingStatus,
                purchasingQty: newPurchasingQty,
                ...(newPurchasingStatus === 'NONE' ? { prDate: null, poDate: null } : {}),
                avgLeadTime: calculatedAvgLeadTime,
                maxLeadTime: calculatedMaxLeadTime,
              },
            });
          }
        }

        // 3. Update data pelacakan saat ini
        await tx.procurementTracking.update({
          where: { id: tracking.id },
          data: {
            qty: actualReceiveUnits,
            tanggalTerima: tDate,
            isStocked: false,
            harga: movementHarga,
            vendor: finalVendor,
            linkedPartsJson: packMetadata,
          },
        });

        // 4. Jika Penerimaan Parsial, buat record sisa pesanan yang masih ditunggu
        if (isPartial) {
          await tx.procurementTracking.create({
            data: {
              fbIndex: tracking.fbIndex,
              originalName: tracking.originalName,
              sparepartId: tracking.sparepartId,
              keterangan: tracking.keterangan,
              penggunaanBulan: tracking.penggunaanBulan,
              kontrak3Bulan: tracking.kontrak3Bulan,
              tanggalList: tracking.tanggalList,
              qty: remainingUnits,
              productCategory: tracking.productCategory,
              reason: tracking.reason,
              urgency: tracking.urgency,
              linkReferences: tracking.linkReferences,
              vendor: finalVendor,
              harga: movementHarga,
              nomorPr: tracking.nomorPr,
              statusPr: tracking.statusPr,
              statusPa: tracking.statusPa,
              statusPo: tracking.statusPo,
              nomorPo: tracking.nomorPo,
              nomorTe: tracking.nomorTe,
              poApproved: tracking.poApproved,
              etaFoom: tracking.etaFoom,
              linkGr: null,
              tanggalTerima: null,
              isStocked: false,
              sheetId: tracking.sheetId,
              odooNotes: tracking.odooNotes
                ? `${tracking.odooNotes}\n[Penerimaan Parsial: ${actualReceiveUnits} diterima tgl ${tanggalTerima}, sisa ${remainingUnits} ${selectedUomUnit} menunggu]`
                : `[Penerimaan Parsial: ${actualReceiveUnits} diterima tgl ${tanggalTerima}, sisa ${remainingUnits} ${selectedUomUnit} menunggu]`,
              linkedPartsJson: packMetadata,
            },
          });
        }
      });

      const msg = isPartial
        ? `✓ Berhasil menerima sebagian: ${actualReceiveUnits} ${selectedUomUnit} ${tracking.originalName} sebagai pemakaian langsung (Non-Stok). Sisa ${remainingUnits} ${selectedUomUnit} tetap aktif dalam status PO.`
        : `✓ Berhasil menerima ${tracking.originalName} (${actualReceiveUnits} ${selectedUomUnit}) sebagai pemakaian langsung (Non-Stok).`;

      return ok({ msg });
    }
  } catch (e: any) {
    console.error('[POST /api/mtc/procurement/receive]', e);
    return err(`Gagal memproses penerimaan: ${e.message}`, 500);
  }
}

// DELETE /api/mtc/procurement/receive (Batalkan Penerimaan Barang / Revert to PO)
export async function DELETE(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const idStr = searchParams.get('id');
  if (!idStr) return err('ID pengadaan wajib disertakan', 400);

  const id = Number(idStr);

  try {
    const tracking = await prisma.procurementTracking.findUnique({
      where: { id },
    });

    if (!tracking) {
      return err('Data pengadaan tidak ditemukan', 404);
    }

    await prisma.$transaction(async (tx) => {
      // 1. Hapus mutasi stok (StockMovement) terkait item pengadaan ini jika ada
      await tx.stockMovement.deleteMany({
        where: {
          OR: [
            { keterangan: { contains: `[Penerimaan Pengadaan #${tracking.id}` } },
            { keterangan: { contains: `[Penerimaan Paket #${tracking.id}` } },
            { keterangan: { contains: `[Penerimaan Langsung Pakai Pengadaan #${tracking.id}` } },
            ...(tracking.sparepartId && tracking.nomorPo ? [{
              sparepartId: tracking.sparepartId,
              keterangan: { contains: `[Odoo Sync Penerimaan PR: ${tracking.nomorPr || '—'} / PO: ${tracking.nomorPo}]` }
            }] : []),
          ]
        }
      });

      // 1b. Bersihkan potongan fisik terkait jika penerimaan dibatalkan
      await tx.potonganFisik.deleteMany({
        where: {
          asal: { contains: `#${tracking.id}` },
        },
      });

      // 2. Cari apakah ada sibling pending (sisa pecahan parsial yang belum diterima) untuk auto-merge
      const siblingPending = await tx.procurementTracking.findFirst({
        where: {
          id: { not: tracking.id },
          originalName: tracking.originalName,
          tanggalTerima: null,
          statusPo: { notIn: ['DONE', 'CANCELLED'] },
          statusPr: { notIn: ['CANCELLED', 'REJECTED'] },
          ...(tracking.nomorPo ? { nomorPo: tracking.nomorPo } : {}),
          ...(tracking.nomorPr ? { nomorPr: tracking.nomorPr } : {}),
        },
        orderBy: { id: 'desc' }
      });

      const targetStatusPo = tracking.nomorPo ? 'PO' : null;
      const targetStatusPr = tracking.statusPr === 'RECEIVED' ? (tracking.nomorPo ? 'PO' : 'APPROVED') : tracking.statusPr;

      if (siblingPending) {
        // Auto-merge: Satukan kembali kuantitas ke baris tracking ini dan hapus sibling pecahan
        const mergedQty = tracking.qty + siblingPending.qty;
        await tx.procurementTracking.update({
          where: { id: tracking.id },
          data: {
            qty: mergedQty,
            tanggalTerima: null,
            statusPo: targetStatusPo,
            statusPr: targetStatusPr,
            isStocked: false,
            linkGr: null,
          }
        });
        await tx.procurementTracking.delete({
          where: { id: siblingPending.id }
        });
      } else {
        await tx.procurementTracking.update({
          where: { id },
          data: {
            tanggalTerima: null,
            statusPo: targetStatusPo,
            statusPr: targetStatusPr,
            isStocked: false,
            linkGr: null,
          }
        });
      }

      // 3. Perbarui status master sparepart jika terhubung
      if (tracking.sparepartId) {
        const pendingItems = await tx.procurementTracking.findMany({
          where: {
            sparepartId: tracking.sparepartId,
            tanggalTerima: null,
            statusPo: { notIn: ['DONE', 'CANCELLED'] },
            statusPr: { notIn: ['CANCELLED', 'REJECTED'] }
          }
        });

        const totalPendingQty = pendingItems.reduce((sum: number, p: any) => sum + (p.qty || 0), 0);
        const hasPendingPo = pendingItems.some((p: any) => p.nomorPo);
        const firstPending = pendingItems[0];

        await tx.sparepart.update({
          where: { id: tracking.sparepartId },
          data: {
            purchasingStatus: totalPendingQty > 0 ? (hasPendingPo ? 'PO' : (firstPending?.statusPr || 'PR')) : 'NONE',
            purchasingNoPr: totalPendingQty > 0 ? firstPending?.nomorPr || null : null,
            purchasingNoPo: totalPendingQty > 0 ? pendingItems.find((p: any) => p.nomorPo)?.nomorPo || null : null,
            purchasingQty: totalPendingQty,
          }
        });
      }
    });

    return ok({
      msg: `✓ Penerimaan barang "${tracking.originalName}" berhasil dibatalkan. Status dikembalikan ke PO dan mutasi stok telah dibatalkan.`
    });
  } catch (e: any) {
    console.error('[DELETE /api/mtc/procurement/receive]', e);
    return err(`Gagal membatalkan penerimaan: ${e.message}`, 500);
  }
}

