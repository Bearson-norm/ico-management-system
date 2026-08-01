import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

const KLASIFIKASI_SORT_ORDER: Record<string, number> = {
  'KRITIS - STOK MINIMAL (asuransi)': 0,
  'KRITIS - STOK NORMAL': 1,
  'NORMAL - STOK IKUT PERMINTAAN': 2,
  'NON-STOK - BELI SAAT BUTUH': 3,
};

const ALASAN: Record<string, string> = {
  'KRITIS - STOK NORMAL':
    'Dipakai di mesin vital dan sering keluar. Aman pakai reorder point biasa — pastikan stok selalu tersedia.',
  'KRITIS - STOK MINIMAL (asuransi)':
    'Dipakai di mesin vital tapi jarang keluar. Wajib tetap stok minimal 1–2 unit sebagai buffer risiko downtime. JANGAN dinilai hanya dari frekuensi keluar.',
  'NORMAL - STOK IKUT PERMINTAAN':
    'Tidak di mesin vital, tapi cukup sering keluar. Boleh stok kecil untuk kepraktisan operasional.',
  'NON-STOK - BELI SAAT BUTUH':
    'Tidak di mesin vital dan jarang keluar. Tidak perlu distok — cukup jalur PR atau petty cash saat dibutuhkan.',
};

export async function GET(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const bulan = Math.max(1, parseInt(searchParams.get('bulan') || '12', 10));
  const threshold = Math.max(1, parseInt(searchParams.get('threshold') || '4', 10));

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - bulan);

  const spareparts = await prisma.sparepart.findMany({
    where: { aktif: true },
    select: {
      id: true,
      nama: true,
      mesins: {
        select: {
          id: true,
          nama: true,
          vital: true,
          aktif: true,
        },
      },
      movements: {
        where: {
          tipe: 'OUT',
          tanggal: { gte: startDate },
        },
        select: { id: true },
      },
    },
    orderBy: { nama: 'asc' },
  });

  const result = spareparts.map((sp) => {
    const freqOut = sp.movements.length;
    const vitalMesins = sp.mesins.filter((m) => m.vital);
    const isVital = vitalMesins.length > 0;
    const isSering = freqOut >= threshold;

    let klasifikasi: string;
    if (isVital && isSering) {
      klasifikasi = 'KRITIS - STOK NORMAL';
    } else if (isVital && !isSering) {
      klasifikasi = 'KRITIS - STOK MINIMAL (asuransi)';
    } else if (!isVital && isSering) {
      klasifikasi = 'NORMAL - STOK IKUT PERMINTAAN';
    } else {
      klasifikasi = 'NON-STOK - BELI SAAT BUTUH';
    }

    return {
      id: sp.id,
      nama: sp.nama,
      mesins: sp.mesins.map((m) => ({ id: m.id, nama: m.nama, vital: m.vital })),
      isVital,
      vitalMesins: vitalMesins.map((m) => m.nama),
      freqOut,
      klasifikasi,
      alasan: ALASAN[klasifikasi],
    };
  });

  // Sort: KRITIS STOK MINIMAL first, then by klasifikasi order, then by freqOut desc
  result.sort((a, b) => {
    const orderDiff = (KLASIFIKASI_SORT_ORDER[a.klasifikasi] ?? 9) - (KLASIFIKASI_SORT_ORDER[b.klasifikasi] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return b.freqOut - a.freqOut;
  });

  return ok(result);
}
