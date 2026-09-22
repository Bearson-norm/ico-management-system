import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { StockOutSchema } from '@/lib/validations/stock';
import { ok, err } from '@/lib/utils';

async function getCurrentStock(sparepartId: string): Promise<number> {
  const agg = await prisma.stockMovement.groupBy({
    by: ['tipe'],
    where: {
      sparepartId,
      tipe: { in: ['IN', 'OUT'] },
      OR: [{ purchaseType: null }, { purchaseType: { not: 'histori-sheets' } }],
    },
    _sum: { qty: true },
  });
  const totalIn = agg.find((r) => r.tipe === 'IN')?._sum.qty ?? 0;
  const totalOut = agg.find((r) => r.tipe === 'OUT')?._sum.qty ?? 0;
  return totalIn - totalOut;
}

export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }

  const parsed = StockOutSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }
  const p = parsed.data;
  const tanggal = new Date(p.tanggal + 'T12:00:00');

  try {
    await prisma.$transaction(async (tx) => {
      const details = await tx.sparepart.findMany({
        where: { id: { in: p.items.map((i) => i.sparepartId) } },
      });

      for (const it of p.items) {
        const sp = details.find((d) => d.id === it.sparepartId);
        if (!sp) {
          throw new Error(`Sparepart ID ${it.sparepartId} tidak ditemukan`);
        }

        let potonganTag = '';

        if (sp.tipeUkur === 'bulk') {
          // Kalau tipeUkur === 'bulk', wajib pilih potongan fisik spesifik
          if (!it.potonganId) {
            throw new Error(`Item "${sp.nama}" bertipe bulk/potongan: wajib pilih potongan fisik spesifik.`);
          }

          const pot = await tx.potonganFisik.findUnique({
            where: { id: it.potonganId },
          });

          if (!pot || pot.sparepartId !== sp.id || pot.status !== 'aktif') {
            throw new Error(`Potongan fisik #${it.potonganId} untuk "${sp.nama}" tidak ditemukan atau sudah habis.`);
          }

          if (pot.panjangSisa < it.qty) {
            throw new Error(
              `Panjang potongan fisik "${pot.asal}" tidak mencukupi (sisa: ${pot.panjangSisa} ${sp.uom}, diminta: ${it.qty} ${sp.uom}).`
            );
          }

          const newPanjangSisa = Math.round((pot.panjangSisa - it.qty) * 100) / 100;
          potonganTag = `[Potongan Asal: "${pot.asal}", Pakai: ${it.qty} ${sp.uom}, Sisa: ${Math.max(0, newPanjangSisa)} ${sp.uom}]`;

          // Kalau panjangSisa mencapai 0, status jadi "habis" dan baris dihapus
          if (newPanjangSisa <= 0) {
            await tx.potonganFisik.delete({
              where: { id: pot.id },
            });
          } else {
            await tx.potonganFisik.update({
              where: { id: pot.id },
              data: { panjangSisa: newPanjangSisa },
            });
          }

          // Otomatis set Sparepart.aktif = false jika semua potongan habis DAN dapatDibeliUlang === false
          if (!sp.dapatDibeliUlang) {
            const activePotonganCount = await tx.potonganFisik.count({
              where: { sparepartId: sp.id, status: 'aktif' },
            });
            if (activePotonganCount === 0) {
              await tx.sparepart.update({
                where: { id: sp.id },
                data: { aktif: false },
              });
            }
          }
        } else {
          // Item unit biasa: cek stok akumulasi
          const stok = await getCurrentStock(it.sparepartId);
          if (stok < it.qty) {
            throw new Error(`Stok ${sp.nama} tidak cukup (sisa: ${stok})`);
          }
        }

        const mesinTag = it.mesinNama?.trim() ? `[Mesin: ${it.mesinNama.trim()}]` : '';
        const userKet = it.keterangan?.trim() || p.keterangan?.trim() || '';
        const finalKeterangan = [mesinTag, potonganTag, userKet].filter(Boolean).join(' ') || null;
        const itemKategori = it.kategoriOut?.trim() || p.kategoriOut?.trim() || null;

        await tx.stockMovement.create({
          data: {
            tipe: 'OUT',
            sparepartId: it.sparepartId,
            namaItem: sp.nama,
            qty: Math.max(1, Math.round(it.qty)),
            harga: sp.harga ?? 0,
            lokasi: sp.lokasi ?? '',
            picId: p.picId,
            noReport: p.noReport || null,
            keterangan: finalKeterangan,
            kategoriOut: itemKategori,
            tanggal,
          },
        });
      }
    });

    return ok({ count: p.items.length });
  } catch (e: any) {
    console.error('[POST /api/mtc/stock/out]', e);
    return err(e.message || 'Gagal stock out', 400);
  }
}
