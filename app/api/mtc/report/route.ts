import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ReportSchema } from '@/lib/validations/report';
import { calcDurasiMenit, generateNoReport, ok, err } from '@/lib/utils';

export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }

  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }
  const p = parsed.data;

  for (const sp of p.spareparts) {
    const stok = await getCurrentStock(sp.sparepartId);
    if (stok < sp.qty) {
      const item = await prisma.sparepart.findUnique({ where: { id: sp.sparepartId } });
      return err(`Stok ${item?.nama ?? sp.sparepartId} tidak cukup (sisa: ${stok})`);
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const noReport = await generateNoReport(tx, p.tipe);
      const durasiMenit = calcDurasiMenit(p.start, p.finish);

      const report = await tx.maintenanceReport.create({
        data: {
          noReport,
          tipe: p.tipe,
          tanggal: new Date(p.tanggal + 'T00:00:00'),
          startTime: p.start,
          finishTime: p.finish,
          durasiMenit,
          shift: p.shift ?? null,
          mesinId: p.mesinId,
          keluhan: p.keluhan,
          issue: p.issue,
          actionTaken: p.action,
          kategoriId: p.kategoriId ?? null,
          picId: p.picId,
        },
      });

      if (p.spareparts.length > 0) {
        const sparepartDetails = await tx.sparepart.findMany({
          where: { id: { in: p.spareparts.map((s) => s.sparepartId) } },
        });

        await tx.stockMovement.createMany({
          data: p.spareparts.map((sp) => {
            const detail = sparepartDetails.find((d) => d.id === sp.sparepartId);
            return {
              tipe: 'OUT' as const,
              sparepartId: sp.sparepartId,
              namaItem: detail?.nama ?? sp.sparepartId,
              qty: sp.qty,
              harga: detail?.harga ?? 0,
              lokasi: detail?.lokasi ?? '',
              picId: p.picId,
              noReport: report.noReport,
              tanggal: new Date(p.tanggal + 'T00:00:00'),
            };
          }),
        });
      }

      return { noReport: report.noReport, spCount: p.spareparts.length };
    });

    return ok(result, 201);
  } catch (e) {
    console.error('[POST /api/mtc/report]', e);
    return err('Gagal menyimpan report', 500);
  }
}

export async function GET(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '20');
  const tipe = searchParams.get('tipe');
  const q = searchParams.get('q');

  const where = {
    ...(tipe ? { tipe: tipe as 'CM' | 'PM' | 'OH' } : {}),
    ...(q
      ? {
          OR: [
            { noReport: { contains: q, mode: 'insensitive' as const } },
            { keluhan: { contains: q, mode: 'insensitive' as const } },
            { mesin: { nama: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.maintenanceReport.findMany({
      where,
      include: { mesin: true, pic: true, kategori: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.maintenanceReport.count({ where }),
  ]);

  return ok({ data, total, page, limit });
}

async function getCurrentStock(sparepartId: string): Promise<number> {
  const agg = await prisma.stockMovement.groupBy({
    by: ['tipe'],
    where: { sparepartId, tipe: { in: ['IN', 'OUT'] } },
    _sum: { qty: true },
  });
  const totalIn = agg.find((r) => r.tipe === 'IN')?._sum.qty ?? 0;
  const totalOut = agg.find((r) => r.tipe === 'OUT')?._sum.qty ?? 0;
  return totalIn - totalOut;
}
