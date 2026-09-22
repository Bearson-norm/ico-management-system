import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { generateItemId, ok, err } from '@/lib/utils';

// POST /api/mtc/stock/in-manual - Manual Remnant / Sisa Proyek Intake (Non-PO)
export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Body JSON tidak valid', 400);
  }

  const {
    sparepartId,
    panjang,
    asal,
    tanggalMasuk,
    nama,
    kategoriId,
    uom,
    lokasi,
    harga,
  } = body;

  const parsedPanjang = parseFloat(String(panjang));
  if (isNaN(parsedPanjang) || parsedPanjang <= 0) {
    return err('Panjang sisa fisik harus berupa angka lebih besar dari 0', 400);
  }

  const cleanAsal = String(asal || '').trim();
  if (!cleanAsal) {
    return err('Asal barang sisa (misal: "Sisa Project A") wajib diisi', 400);
  }

  const tglMasuk = tanggalMasuk ? new Date(tanggalMasuk) : new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      let sp = null;

      if (sparepartId && String(sparepartId).trim()) {
        sp = await tx.sparepart.findUnique({
          where: { id: String(sparepartId).trim() },
        });
      }

      // Jika sparepartId belum ada, buat otomatis master item baru
      if (!sp) {
        const generatedId = (sparepartId && String(sparepartId).trim()) 
          ? String(sparepartId).trim() 
          : await generateItemId(prisma);
        
        const cleanNama = (nama && String(nama).trim()) || `Barang Remnant (${cleanAsal})`;

        sp = await tx.sparepart.create({
          data: {
            id: generatedId,
            nama: cleanNama,
            kategoriId: kategoriId ? Number(kategoriId) : null,
            uom: (uom && String(uom).trim()) || 'Meter',
            lokasi: (lokasi && String(lokasi).trim()) || 'Gudang MTC',
            harga: harga != null && !isNaN(Number(harga)) ? Number(harga) : 0,
            aktif: true,
            tipeUkur: 'bulk',
            dapatDibeliUlang: false, // Default false untuk barang sisa proyek yang tidak direstock
          },
        });
      } else {
        // Jika sudah ada, pastikan tipeUkur disesuaikan ke bulk dan aktifkan jika nonaktif
        if (sp.tipeUkur !== 'bulk' || !sp.aktif) {
          sp = await tx.sparepart.update({
            where: { id: sp.id },
            data: {
              tipeUkur: 'bulk',
              aktif: true,
            },
          });
        }
      }

      // 1. Buat 1 baris PotonganFisik baru
      const potongan = await tx.potonganFisik.create({
        data: {
          sparepartId: sp.id,
          panjangAwal: parsedPanjang,
          panjangSisa: parsedPanjang,
          asal: cleanAsal,
          tanggalMasuk: tglMasuk,
          status: 'aktif',
        },
      });

      // 2. Buat 1 StockMovement tipe "IN" (Non-PO)
      const movement = await tx.stockMovement.create({
        data: {
          tipe: 'IN',
          sparepartId: sp.id,
          namaItem: sp.nama,
          qty: Math.round(parsedPanjang),
          harga: sp.harga ?? 0,
          lokasi: sp.lokasi ?? 'Gudang MTC',
          purchaseType: 'NON-PO',
          keterangan: `[Non-PO] Dari: ${cleanAsal}`,
          tanggal: tglMasuk,
        },
      });

      return { sp, potongan, movement };
    });

    return ok({
      sparepart: result.sp,
      potongan: result.potongan,
      movement: result.movement,
      msg: `✓ Berhasil memasukkan potongan sisa ${parsedPanjang} ${result.sp.uom} untuk "${result.sp.nama}" (Asal: ${cleanAsal})`,
    });
  } catch (e: any) {
    console.error('[POST /api/mtc/stock/in-manual]', e);
    return err('Gagal memasukkan barang sisa fisik: ' + e.message, 500);
  }
}
