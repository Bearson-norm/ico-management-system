import { NextRequest } from 'next/server';
import { requireGaAuth } from '@/lib/auth';
import { getOpnameSession } from '@/lib/ga/opnameService';
import { buildOpnamePdf, opnamePdfFilename } from '@/lib/ga/opnamePdf';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string) {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireGaAuth();
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const { id: raw } = await ctx.params;
  const id = parseId(raw);
  if (!id) return new Response('ID tidak valid', { status: 400 });

  const data = await getOpnameSession(id);
  if (!data) return new Response('Sesi tidak ditemukan', { status: 404 });

  const pdf = await buildOpnamePdf(data.session, data.lines, auth.user.name);
  const filename = opnamePdfFilename(data.session);

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdf.length),
    },
  });
}
