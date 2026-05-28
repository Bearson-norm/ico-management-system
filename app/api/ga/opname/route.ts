import { NextRequest } from 'next/server';
import { requireGaEditor, requireGaAuth } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { GaOpnameCreateSchema } from '@/lib/validations/ga-opname';
import { createOpnameSession, listOpnameSessions } from '@/lib/ga/opnameService';

export async function GET() {
  const session = await requireGaAuth();
  if (!session) return err('Unauthorized', 401);

  const data = await listOpnameSessions();
  return ok(data);
}

export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err('Body tidak valid');
  }

  const parsed = GaOpnameCreateSchema.safeParse(body);
  if (!parsed.success) {
    return err(parsed.error.errors.map((e) => e.message).join(', '));
  }

  try {
    const data = await createOpnameSession({
      periodeNama: parsed.data.periodeNama,
      tanggal: parsed.data.tanggal,
    });
    return ok(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal membuat sesi';
    return err(msg, 400);
  }
}
