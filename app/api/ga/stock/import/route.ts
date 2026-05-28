import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parseGaStockInitialPaste } from '@/lib/import/parseGaStockInitialPaste';
import { importGaStockInitialBatch } from '@/lib/ga/gaStockInitialImport';

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  try {
    const body = await req.json();
    const rawText = typeof body.rawText === 'string' ? body.rawText : '';
    const picNama = typeof body.picNama === 'string' ? body.picNama.trim() : '';
    const keterangan = typeof body.keterangan === 'string' ? body.keterangan : 'Saldo awal';
    const tanggalStr = typeof body.tanggal === 'string' ? body.tanggal : '';
    const skipIfHasStock = body.skipIfHasStock !== false;

    if (!rawText.trim()) {
      return err('Data kosong. Copy dari Excel (termasuk baris header) lalu paste di sini.');
    }
    if (!picNama) {
      return err('PIC penerima wajib diisi');
    }

    const tanggal = tanggalStr.match(/^\d{4}-\d{2}-\d{2}$/)
      ? new Date(tanggalStr + 'T12:00:00')
      : new Date(new Date().toISOString().split('T')[0] + 'T12:00:00');

    const parsed = parseGaStockInitialPaste(rawText);
    if (parsed.records.length === 0) {
      return err('Format tidak dikenali. Pastikan header: NAMA BARANG, KODE BARANG, Qty');
    }

    const report = await importGaStockInitialBatch(prismaGa, parsed.records, {
      tanggal,
      picNama,
      keterangan,
      skipIfHasStock,
    }, {
      physicalLines: parsed.physicalLines,
      mergedLines: parsed.mergedLines,
    });

    return ok(report);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err('Terjadi kesalahan saat import: ' + message, 500);
  }
}
