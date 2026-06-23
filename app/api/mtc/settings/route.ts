import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMtcEditor } from '@/lib/auth';
import { ok, err } from '@/lib/utils';

// GET /api/mtc/settings
export async function GET(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  try {
    const settingsList = await prisma.mtcSetting.findMany();
    const settingsObj = settingsList.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {} as Record<string, string>);

    return ok(settingsObj);
  } catch (e: any) {
    console.error('[GET /api/mtc/settings]', e);
    return err(`Gagal mengambil pengaturan: ${e.message}`, 500);
  }
}

// POST /api/mtc/settings
export async function POST(req: NextRequest) {
  const session = await requireMtcEditor();
  if (!session) return err('Akses ditolak', 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return err('Format JSON tidak valid', 400);
  }

  try {
    const results = await prisma.$transaction(
      Object.entries(body).map(([key, val]) => {
        const stringVal = val === null || val === undefined ? '' : String(val);
        return prisma.mtcSetting.upsert({
          where: { key },
          create: { key, value: stringVal },
          update: { value: stringVal },
        });
      })
    );

    return ok({ msg: 'Pengaturan berhasil disimpan!', data: results });
  } catch (e: any) {
    console.error('[POST /api/mtc/settings]', e);
    return err(`Gagal menyimpan pengaturan: ${e.message}`, 500);
  }
}
