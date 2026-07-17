import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parseGaOpnamePaste } from '@/lib/import/parseGaOpnamePaste';
import { importGaOpnameBatch } from '@/lib/ga/gaOpnameImport';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (!id) return err('ID tidak valid');

  try {
    const body = await req.json();
    const rawText = typeof body.rawText === 'string' ? body.rawText : '';

    if (!rawText.trim()) {
      return err('Data kosong. Copy dari Excel lalu paste di sini.');
    }

    const parsed = parseGaOpnamePaste(rawText);
    if (parsed.records.length === 0) {
      return err(
        'Format tidak dikenali. Pastikan urutan: baris periode (opsional), header Nama Barang | Quantity | PIC, lalu data.'
      );
    }

    const opnameSession = await prismaGa.gaOpnameSession.findUnique({
      where: { id },
      select: { periodeNama: true },
    });
    if (!opnameSession) return err('Sesi opname tidak ditemukan', 404);

    const report = await importGaOpnameBatch(prismaGa, id, parsed.records, {
      periodeNama: parsed.periodeNama,
      sessionPeriodeNama: opnameSession.periodeNama,
      physicalLines: parsed.physicalLines,
      mergedLines: parsed.mergedLines,
    });

    return ok(report);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err('Terjadi kesalahan saat import: ' + message, 500);
  }
}
