import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { parseMtcStockInitialPaste } from '@/lib/import/parseMtcStockInitialPaste';
import { importMtcStockInitialBatch } from '@/lib/mtc/mtcStockInitialImport';

export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  try {
    const body = await req.json();
    const rawText = typeof body.rawText === 'string' ? body.rawText : '';
    const keterangan = typeof body.keterangan === 'string' ? body.keterangan : 'Saldo awal / stock report';
    const tanggalStr = typeof body.tanggal === 'string' ? body.tanggal : '';
    const skipIfHasStock = body.skipIfHasStock !== false;
    const syncMode = body.syncMode === true;

    if (!rawText.trim()) {
      return err('Data kosong. Copy dari Excel/CSV (termasuk baris header) lalu paste di sini.');
    }

    const tanggal = tanggalStr.match(/^\d{4}-\d{2}-\d{2}$/)
      ? new Date(tanggalStr + 'T12:00:00')
      : new Date(new Date().toISOString().split('T')[0] + 'T12:00:00');

    const parsed = parseMtcStockInitialPaste(rawText);
    if (parsed.records.length === 0) {
      return err('Format tidak dikenali. Pastikan header: id, Current Stock');
    }

    const report = await importMtcStockInitialBatch(
      prisma,
      parsed.records,
      {
        tanggal,
        keterangan,
        skipIfHasStock: syncMode ? false : skipIfHasStock,
      },
      {
        physicalLines: parsed.physicalLines,
        mergedLines: parsed.mergedLines,
      }
    );

    return ok(report);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return err('Terjadi kesalahan saat import: ' + message, 500);
  }
}
