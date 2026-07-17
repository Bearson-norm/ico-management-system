import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaAdmin } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import { generateGaAuditSnapshot } from '@/lib/ga/auditSnapshot';

function isCronAuthorized(req: NextRequest): boolean {
  const cronToken = process.env.CRON_TOKEN;
  if (!cronToken) return false;
  const authHeader = req.headers.get('Authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const queryToken = req.nextUrl.searchParams.get('token');
  return bearer === cronToken || queryToken === cronToken;
}

export async function POST(req: NextRequest) {
  const cronOk = isCronAuthorized(req);
  let force = false;
  let source: 'cron' | 'manual' = cronOk ? 'cron' : 'manual';

  if (!cronOk) {
    const session = await requireGaAdmin();
    if (!session) return err('Akses ditolak', 403);
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.force === true && !cronOk) force = true;
    if (body?.source === 'manual' || body?.source === 'cron') source = body.source;
    if (cronOk) source = 'cron';

    const result = await generateGaAuditSnapshot(prismaGa, {
      periode: typeof body?.periode === 'string' ? body.periode : undefined,
      source,
      force,
    });
    return ok(result, 201);
  } catch (e: unknown) {
    const errObj = e as { code?: string; message?: string; snapshotId?: number };
    if (errObj.code === 'SNAPSHOT_EXISTS') {
      return err(
        errObj.message || 'Snapshot periode sudah ada. Gunakan force=true untuk regenerate.',
        409
      );
    }
    console.error('[GA Audit Generate]', e);
    return err(errObj.message || 'Gagal generate audit snapshot', 500);
  }
}
