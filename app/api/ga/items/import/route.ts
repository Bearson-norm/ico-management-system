import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parseGaItemPaste } from '@/lib/import/parseGaItemPaste';
import { importGaItemMinMax } from '@/lib/ga/importGaItemMinMax';

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  try {
    const body = await req.json();
    const rawText = typeof body.rawText === 'string' ? body.rawText : '';

    if (!rawText.trim()) {
      return err('Data kosong atau format salah. Paste ulang dari Excel (termasuk baris header).');
    }

    const parsed = parseGaItemPaste(rawText);
    if (parsed.records.length === 0) {
      return err('Data kosong atau format salah. Pastikan baris header: No, Kode, Nama Barang, Lokasi, Min, Max.');
    }

    const report = await importGaItemMinMax(prismaGa, parsed.records, {
      physicalLines: parsed.physicalLines,
      mergedLines: parsed.mergedLines,
    });

    return ok(report);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[POST /api/ga/items/import]', e);
    return err('Terjadi kesalahan saat import data: ' + message, 500);
  }
}
