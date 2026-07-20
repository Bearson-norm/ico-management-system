import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { GaStockInSchema } from '@/lib/validations/ga-stock';
import { generateGaItemId } from '@/lib/utils-ga';
import { ok, err } from '@/lib/utils';
import { findSnapshotForDate } from '@/lib/ga/auditSnapshot';
import { findPostedOpnameOnOrAfterDate } from '@/lib/ga/opnameService';

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }

  const parsed = GaStockInSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }
  const p = parsed.data;
  const tanggal = new Date(p.tanggal + 'T12:00:00');

  // Soft lock: butuh konfirmasi eksplisit jika tanggal transaksi jatuh di
  // periode yang sudah di-closing atau sudah tertutup opname posted.
  if (!p.overrideLockedPeriod) {
    const warnings: string[] = [];
    const [lockedSnapshot, coveringOpname] = await Promise.all([
      findSnapshotForDate(prismaGa, tanggal),
      findPostedOpnameOnOrAfterDate(tanggal),
    ]);
    if (coveringOpname) {
      const tglOpname = coveringOpname.tanggal.toISOString().slice(0, 10);
      warnings.push(
        `PERHATIAN: opname "${coveringOpname.periodeNama}" (${tglOpname}) sudah diposting untuk tanggal ini atau sesudahnya. ` +
          'Selisih stok pada tanggal tersebut sudah ter-adjust oleh opname — mencatat transaksi susulan akan membuat stok terkoreksi DOBEL. ' +
          'Lanjutkan hanya jika transaksi ini memang belum terwakili di hasil hitung opname.'
      );
    }
    if (lockedSnapshot) {
      warnings.push(
        `Periode ${lockedSnapshot.periode} sudah di-closing (snapshot audit sudah digenerate). ` +
          'Transaksi tetap bisa dicatat, tetapi akan ditandai sebagai backdate di halaman audit.'
      );
    }
    if (warnings.length > 0) {
      return err(warnings.join('\n\n'), 409);
    }
  }

  try {
    if (p.jenis === 'existing') {
      await prismaGa.$transaction(async (tx) => {
        for (const it of p.items) {
          const row = await tx.gaItem.findUnique({ where: { id: it.itemId } });
          if (!row) throw new Error(`Item ${it.itemId} tidak ada`);
          await tx.gaStockMovement.create({
            data: {
              tipe: 'IN',
              item: { connect: { id: it.itemId } },
              namaBarang: row.nama,
              qty: it.qty,
              qtyDiterima: it.qty,
              tanggalTerima: tanggal,
              harga: it.harga ?? 0,
              tanggal,
              picNama: p.picNama,
              purchaseType: p.purchaseType || null,
              vendor: p.vendor || null,
              keterangan: p.keterangan || null,
            },
          });
          if (it.harga != null && it.harga >= 0) {
            await tx.gaItem.update({ where: { id: it.itemId }, data: { harga: it.harga } });
          }
        }
      });
      return ok({ msg: `Stok masuk: ${p.items.length} baris` });
    }

    const id = await generateGaItemId(prismaGa);
    await prismaGa.$transaction(async (tx) => {
      await tx.gaItem.create({
        data: {
          id,
          nama: p.nama,
          kategoriId: p.kategoriId ?? null,
          uom: p.uom || 'Pcs',
          lokasi: p.lokasi || null,
          kodeBarang: p.kodeBarang || null,
          harga: p.harga,
          minQty: p.minQty,
          maxQty: p.maxQty ?? null,
          aktif: true,
        },
      });
      await tx.gaStockMovement.create({
        data: {
          tipe: 'IN',
          item: { connect: { id } },
          namaBarang: p.nama,
          qty: p.qty,
          qtyDiterima: p.qty,
          tanggalTerima: tanggal,
          harga: p.harga,
          tanggal,
          picNama: p.picNama,
          purchaseType: p.purchaseType || null,
          vendor: p.vendor || null,
          keterangan: p.keterangan || null,
        },
      });
    });
    return ok({ msg: `Barang baru ${id} didaftarkan` });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : 'Gagal';
    return err(msg, 500);
  }
}
