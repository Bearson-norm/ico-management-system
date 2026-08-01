import { NextRequest } from 'next/server';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { GaOpnameRecalculateSchema } from '@/lib/validations/ga-opname';
import {
  previewRecalculateOpnameSession,
  recalculateOpnameSession,
} from '@/lib/ga/opnameService';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string) {
  const id = parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (id == null) return err('ID tidak valid');

  try {
    const preview = await previewRecalculateOpnameSession(id);
    return ok(preview);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal preview recalculate';
    return err(msg, 400);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (id == null) return err('ID tidak valid');

  let body: unknown = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return err('Body tidak valid');
  }

  const parsed = GaOpnameRecalculateSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }

  try {
    const preview = await previewRecalculateOpnameSession(id);
    if (preview.blockedByNewerOpname) {
      return err(preview.blockedByNewerOpname, 400);
    }

    const result = await recalculateOpnameSession(id, parsed.data);
    const detail =
      result.postMode === 'adj'
        ? `${result.adjCount} penyesuaian (ADJ)`
        : `${result.inCount} masuk, ${result.outCount} keluar`;

    return ok({
      msg:
        `Recalculate selesai: ${detail}, ${result.skipped} barang cocok` +
        (result.backdateCount > 0
          ? ` (memperhitungkan ${result.backdateCount} transaksi backdate).`
          : '.') +
        ' Jika bulan ini sudah closing, regenerate snapshot audit bila perlu.',
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal recalculate';
    return err(msg, 400);
  }
}
