import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parseGaStockOutPaste } from '@/lib/import/parseGaStockOutPaste';
import { importGaStockOutBatch } from '@/lib/ga/gaStockOutImport';

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  try {
    const body = await req.json();
    const rawText = typeof body.rawText === 'string' ? body.rawText : '';
    const keterangan = typeof body.keterangan === 'string' ? body.keterangan : '';

    if (!rawText.trim()) {
      return err('Data kosong. Copy dari Excel lalu paste di sini.');
    }

    const parsed = parseGaStockOutPaste(rawText);
    if (parsed.records.length === 0) {
      return err('Format tidak dikenali. Pastikan kolom: NAMA BARANG, Qty, Tanggal (DD/MM/YYYY), PIC');
    }

    const report = await importGaStockOutBatch(
      prismaGa,
      parsed.records,
      { keterangan },
      { physicalLines: parsed.physicalLines, mergedLines: parsed.mergedLines }
    );

    return ok(report);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err('Terjadi kesalahan saat import: ' + message, 500);
  }
}
