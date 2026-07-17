import { NextRequest } from 'next/server';
import { prismaGa } from '@/lib/prisma-ga';
import { requireGaAdmin } from '@/lib/auth';
import { ok, err } from '@/lib/utils';
import bcrypt from 'bcryptjs';

const VALID_ROLES = ['administrator', 'editor', 'viewer'] as const;

export async function GET() {
  const session = await requireGaAdmin();
  if (!session) return err('Akses ditolak', 403);

  const users = await prismaGa.user.findMany({
    select: {
      id: true,
      username: true,
      namaLengkap: true,
      role: true,
      aktif: true,
      createdAt: true,
      lastLogin: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  return ok(users);
}

export async function POST(req: NextRequest) {
  const session = await requireGaAdmin();
  if (!session) return err('Akses ditolak', 403);

  const { username, password, namaLengkap, role } = await req.json();
  if (!username?.trim()) return err('Username wajib diisi');
  if (!password || password.length < 6) return err('Password minimal 6 karakter');
  if (!namaLengkap?.trim()) return err('Nama lengkap wajib diisi');
  if (!VALID_ROLES.includes(role)) return err('Role tidak valid');

  try {
    const hash = await bcrypt.hash(password, 12);
    const user = await prismaGa.user.create({
      data: {
        username: username.trim(),
        passwordHash: hash,
        namaLengkap: namaLengkap.trim(),
        role,
      },
      select: { id: true, username: true, namaLengkap: true, role: true, aktif: true },
    });
    return ok(user, 201);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') return err('Username sudah dipakai');
    return err('Gagal membuat user', 500);
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireGaAdmin();
  if (!session) return err('Akses ditolak', 403);

  const currentUserId = session.user.id;
  const { id, namaLengkap, role, aktif, newPassword } = await req.json();
  if (!id) return err('ID wajib diisi');

  if (String(id) === currentUserId && aktif === false) {
    return err('Tidak bisa menonaktifkan akun sendiri');
  }
  if (String(id) === currentUserId && role !== undefined && role !== 'administrator') {
    return err('Tidak bisa menurunkan role akun sendiri');
  }
  if (role !== undefined && !VALID_ROLES.includes(role)) {
    return err('Role tidak valid');
  }

  const updateData: Record<string, unknown> = {};
  if (namaLengkap !== undefined) updateData.namaLengkap = namaLengkap.trim();
  if (role !== undefined) updateData.role = role;
  if (aktif !== undefined) updateData.aktif = aktif;
  if (newPassword) {
    if (newPassword.length < 6) return err('Password minimal 6 karakter');
    updateData.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  const user = await prismaGa.user.update({
    where: { id: parseInt(id, 10) },
    data: updateData,
    select: { id: true, username: true, namaLengkap: true, role: true, aktif: true },
  });
  return ok(user);
}
