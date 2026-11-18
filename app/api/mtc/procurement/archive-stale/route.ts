import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { archiveOrReopenProcurementItems } from '@/lib/mtc/procurement-server';

// POST /api/mtc/procurement/archive-stale
export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  const action = body?.action === 'reopen' ? 'reopen' : body?.action === 'archive' ? 'archive' : null;
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  const reason = typeof body?.reason === 'string' ? body.reason : undefined;

  if (!action) {
    return err('Action wajib bernilai archive atau reopen', 400);
  }
  if (ids.length === 0) {
    return err('Pilih minimal 1 item untuk diproses', 400);
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => archiveOrReopenProcurementItems(tx, { action, ids, reason }),
      { timeout: 30000, maxWait: 10000 }
    );

    const verb = action === 'archive' ? 'ditutup / diarsipkan' : 'dipulihkan ke daftar aktif';
    return ok({
      msg: `${result.processedIds.length} item berhasil ${verb}${
        result.skippedIds.length > 0 ? ` (${result.skippedIds.length} dilewati)` : ''
      }.`,
      ...result,
    });
  } catch (e: any) {
    console.error('[POST /api/mtc/procurement/archive-stale]', e);
    return err(`Gagal memproses arsip item: ${e.message}`, 500);
  }
}
