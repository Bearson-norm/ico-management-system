import { NextRequest } from 'next/server';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { GaOpnamePostSchema } from '@/lib/validations/ga-opname';
import { postOpnameSession } from '@/lib/ga/opnameService';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { id: raw } = await ctx.params;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) return err('ID tidak valid');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }

  const parsed = GaOpnamePostSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }

  try {
    const result = await postOpnameSession(id, parsed.data);
    const detail =
      result.postMode === 'adj'
        ? `${result.adjCount} penyesuaian (ADJ)`
        : `${result.inCount} masuk, ${result.outCount} keluar`;
    return ok({
      msg: `Posting selesai: ${detail} (${result.skipped} barang cocok)`,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal posting';
    return err(msg, 400);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { id: raw } = await ctx.params;
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) return err('ID tidak valid');

  try {
    const { unpostOpnameSession } = await import('@/lib/ga/opnameService');
    await unpostOpnameSession(id);
    return ok({ msg: '✓ Sesi opname berhasil di-reset / dibatalkan ACC-nya! Status kembali ke Draft.' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal membatalkan posting';
    return err(msg, 400);
  }
}
