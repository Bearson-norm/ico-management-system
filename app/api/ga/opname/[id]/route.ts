import { NextRequest } from 'next/server';
import { requireGaAuth, requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { GaOpnameUpdateLinesSchema } from '@/lib/validations/ga-opname';
import { getOpnameSession, updateOpnameLines } from '@/lib/ga/opnameService';
import { prismaGa } from '@/lib/prisma-ga';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await requireGaAuth();
  if (!session) return err('Unauthorized', 401);

  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (!id) return err('ID tidak valid');

  const data = await getOpnameSession(id);
  if (!data) return err('Sesi tidak ditemukan', 404);
  return ok(data);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (!id) return err('ID tidak valid');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }

  const parsed = GaOpnameUpdateLinesSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }

  try {
    const data = await updateOpnameLines(id, parsed.data.lines);
    if (!data) return err('Sesi tidak ditemukan', 404);
    return ok(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal menyimpan';
    return err(msg, 400);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (!id) return err('ID tidak valid');

  try {
    const opname = await prismaGa.gaOpnameSession.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!opname) return err('Sesi tidak ditemukan', 404);
    if (opname.status !== 'draft') {
      return err('Hanya sesi dengan status draft yang dapat dihapus', 400);
    }

    await prismaGa.gaOpnameSession.delete({
      where: { id },
    });

    return ok({ message: 'Sesi opname berhasil dihapus' });
  } catch (e: any) {
    return err(e.message || 'Gagal menghapus sesi opname', 500);
  }
}
