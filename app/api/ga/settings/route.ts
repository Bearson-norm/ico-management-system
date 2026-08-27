import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import {
  parseSlowMovingThresholdInput,
  SLOW_MOVING_THRESHOLD_KEY,
} from '@/lib/ga/movementClass';

// GET /api/ga/settings
export async function GET(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  try {
    const settingsList = await prismaGa.gaSetting.findMany();
    const settingsObj = settingsList.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    return ok(settingsObj);
  } catch (e: any) {
    console.error('[GET /api/ga/settings]', e);
    return err(`Gagal mengambil pengaturan GA: ${e.message}`, 500);
  }
}

// POST /api/ga/settings
export async function POST(req: NextRequest) {
  const session = await requireGaEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  if (Object.prototype.hasOwnProperty.call(body, SLOW_MOVING_THRESHOLD_KEY)) {
    if (session.user.role !== 'administrator') {
      return err('Hanya administrator yang dapat mengubah batas Slow Moving', 403);
    }
    const parsed = parseSlowMovingThresholdInput(body[SLOW_MOVING_THRESHOLD_KEY]);
    if (parsed === null) {
      return err('Batas Slow Moving harus bilangan bulat ≥ 0', 400);
    }
    body[SLOW_MOVING_THRESHOLD_KEY] = String(parsed);
  }

  try {
    const results = await prismaGa.$transaction(
      Object.entries(body).map(([key, val]) => {
        const stringVal = val === null || val === undefined ? '' : String(val);
        return prismaGa.gaSetting.upsert({
          where: { key },
          create: { key, value: stringVal },
          update: { value: stringVal },
        });
      })
    );

    return ok({ msg: 'Pengaturan GA berhasil disimpan!', data: results });
  } catch (e: any) {
    console.error('[POST /api/ga/settings]', e);
    return err(`Gagal menyimpan pengaturan GA: ${e.message}`, 500);
  }
}
