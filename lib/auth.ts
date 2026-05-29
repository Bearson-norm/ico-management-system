import { NextAuthOptions, getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { prismaGa } from '@/lib/prisma-ga';

export const authOptions: NextAuthOptions = {
  /** Wajib konsisten di VPS; tanpa ini cookie/CSRF di balik HTTPS bisa bermasalah. */
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 },

  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
        tenant: { label: 'Tenant', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        const tenant = (credentials.tenant === 'ga' ? 'ga' : 'mtc') as 'mtc' | 'ga';

        if (tenant === 'mtc') {
          const user = await prisma.user.findUnique({
            where: { username: credentials.username },
          });
          if (!user || !user.aktif) return null;
          const valid = await bcrypt.compare(credentials.password, user.passwordHash);
          if (!valid) return null;
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() },
          });
          return {
            id: String(user.id),
            name: user.namaLengkap,
            email: user.username,
            role: user.role,
            tenant: 'mtc' as const,
          };
        }

        const user = await prismaGa.user.findUnique({
          where: { username: credentials.username },
        });
        if (!user || !user.aktif) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
        await prismaGa.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });
        return {
          id: String(user.id),
          name: user.namaLengkap,
          email: user.username,
          role: user.role,
          tenant: 'ga' as const,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id;
        token.tenant = (user as { tenant: 'mtc' | 'ga' }).tenant;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.tenant = token.tenant as 'mtc' | 'ga';
      }
      return session;
    },
  },
};

export function isMtcTenant(session: { user?: { tenant?: string } } | null) {
  return session?.user?.tenant === 'mtc';
}

export function isGaTenant(session: { user?: { tenant?: string } } | null) {
  return session?.user?.tenant === 'ga';
}

/** MTC atau GA: harus login + tenant cocok */
export async function requireTenant(tenant: 'mtc' | 'ga') {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  if (session.user.tenant !== tenant) return null;
  return session;
}

export async function requireEditor() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  if (session.user.role !== 'editor') return null;
  return session;
}

/** Editor MTC saja */
export async function requireMtcEditor() {
  const session = await requireTenant('mtc');
  if (!session || session.user.role !== 'editor') return null;
  return session;
}

/** Session MTC (viewer atau editor) */
export async function requireMtcAuth() {
  return requireTenant('mtc');
}

/** Session GA */
export async function requireGaAuth() {
  return requireTenant('ga');
}

export async function requireGaEditor() {
  const session = await requireTenant('ga');
  if (!session || session.user.role !== 'editor') return null;
  return session;
}

export async function requireAuth() {
  const session = await getServerSession(authOptions);
  return session ?? null;
}

export function isQuickInBypassed(req: NextRequest) {
  const secretParam = req.nextUrl.searchParams.get('secret') || req.headers.get('x-secret-key');
  const allowedSecret = process.env.QUICK_IN_SECRET || 'MTCI';
  return secretParam === allowedSecret;
}

