import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

// POST /api/ga/procurement/receive
export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  const { id, tanggalTerima, isStocked, harga, vendor, qty } = body;

  if (!id) return err('ID pengadaan wajib diisi', 400);
  if (!tanggalTerima) return err('Tanggal terima wajib diisi', 400);

  const tDate = new Date(tanggalTerima + 'T12:00:00');

  try {
    const tracking = await prismaGa.gaProcurementTracking.findUnique({
      where: { id: Number(id) },
    });

    if (!tracking) {
      return err('Data pengadaan tidak ditemukan', 404);
    }

    const finalHarga = harga !== undefined && harga !== null ? Number(harga) : Number(tracking.harga || 0);
    const finalVendor = vendor !== undefined ? vendor : tracking.vendor;
    const finalQty = qty !== undefined && qty !== null ? Number(qty) : tracking.qty;
    const finalIsStocked = isStocked !== undefined ? Boolean(isStocked) : tracking.isStocked;

    await prismaGa.$transaction(async (tx) => {
      // 1. Update status tracking ke RECEIVED
      // grDone tetap false — menandakan barang sudah diterima fisik tapi GR di Odoo belum dikonfirmasi.
      // Flag ini akan otomatis berubah true saat sinkronisasi Odoo mendeteksi GR selesai.
      await tx.gaProcurementTracking.update({
        where: { id: tracking.id },
        data: {
          status: 'RECEIVED',
          tanggalTerima: tDate,
          harga: finalHarga,
          vendor: finalVendor,
          isStocked: finalIsStocked,
          grDone: false,
        },
      });

      // 2. Jika disetel masuk ke Stok Gudang dan barang terhubung ke Master Item
      if (finalIsStocked && tracking.itemId) {
        const item = await tx.gaItem.findUnique({
          where: { id: tracking.itemId },
        });

        if (item) {
          // Buat StockMovement tipe IN
          await tx.gaStockMovement.create({
            data: {
              tipe: 'IN',
              itemId: item.id,
              namaBarang: item.nama,
              qty: finalQty,
              qtyDiterima: finalQty,
              tanggalTerima: tDate,
              tanggal: tDate,
              harga: finalHarga,
              vendor: finalVendor,
              purchaseType: 'PO',
              keterangan: `[Penerimaan Pesanan GA]${tracking.nomorPo ? ` PO: ${tracking.nomorPo}` : ''}${tracking.keterangan ? ` - ${tracking.keterangan}` : ''}`,
            },
          });

          // Update harga di Master Barang GA
          await tx.gaItem.update({
            where: { id: item.id },
            data: {
              harga: finalHarga,
            },
          });
        }
      } else {
        // Jika Pemakaian Langsung (Non-Stok), buat StockMovement tipe OUT/ADJ
        await tx.gaStockMovement.create({
          data: {
            tipe: 'OUT',
            itemId: tracking.itemId || null,
            namaBarang: tracking.originalName,
            qty: finalQty,
            qtyDiterima: finalQty,
            tanggalTerima: tDate,
            tanggal: tDate,
            harga: finalHarga,
            vendor: finalVendor,
            purchaseType: 'PO',
            keterangan: `[Penerimaan Langsung - Non-Stok]${tracking.nomorPo ? ` PO: ${tracking.nomorPo}` : ''} Alasan: ${tracking.keterangan || 'Kebutuhan langsung'}`,
          },
        });

        // Update harga di Master Barang GA jika terhubung
        if (tracking.itemId) {
          await tx.gaItem.update({
            where: { id: tracking.itemId },
            data: {
              harga: finalHarga,
            },
          });
        }
      }
    });

    return ok({ msg: `Berhasil mencatat penerimaan pesanan '${tracking.originalName}'.` });
  } catch (e: any) {
    console.error('[POST /api/ga/procurement/receive]', e);
    return err(`Gagal memproses penerimaan: ${e.message}`, 500);
  }
}
