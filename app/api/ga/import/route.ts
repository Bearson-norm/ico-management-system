import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parseTabularPaste } from '@/lib/import/parseTabularPaste';
import { parseGaItemPaste } from '@/lib/import/parseGaItemPaste';
import { importGaItemBatch } from '@/lib/ga/gaItemImport';

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  try {
    const body = await req.json();
    const rawText = typeof body.rawText === 'string' ? body.rawText : '';

    if (!rawText.trim()) {
      return err('Data kosong. Copy dari Excel (termasuk baris header) lalu paste di sini.');
    }

    const parsed = parseGaItemPaste(rawText);
    const records =
      parsed.records.length > 0 ? parsed.records : parseTabularPaste(rawText);

    if (records.length === 0) {
      return err('Format tidak dikenali. Pastikan header: NAMA BARANG, Min Qty, LOKASI, KODE BARANG, Harga');
    }

    const report = await importGaItemBatch(prismaGa, records, {
      physicalLines: parsed.physicalLines,
      mergedLines: parsed.mergedLines,
    });

    return ok(report);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err('Terjadi kesalahan saat import: ' + message, 500);
  }
}
