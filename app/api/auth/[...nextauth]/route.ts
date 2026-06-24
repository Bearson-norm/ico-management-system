import NextAuth from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { NextRequest } from 'next/server';

function determineTenant(req: NextRequest): 'mtc' | 'ga' {
  const referer = req.headers.get('referer') || '';
  if (referer.includes('/ga') || referer.includes('/api/ga')) {
    return 'ga';
  }
  if (referer.includes('/mtc') || referer.includes('/api/mtc')) {
    return 'mtc';
  }

  // Cek cookie mana yang ada
  const gaCookie = req.cookies.get('__Secure-next-auth.session-token.ga') || req.cookies.get('next-auth.session-token.ga');
  const mtcCookie = req.cookies.get('__Secure-next-auth.session-token.mtc') || req.cookies.get('next-auth.session-token.mtc');
  if (gaCookie && !mtcCookie) {
    return 'ga';
  }
  return 'mtc'; // default
}

export async function GET(req: NextRequest, context: any) {
  const tenant = determineTenant(req);
  return NextAuth(getAuthOptions(tenant))(req, context);
}

export async function POST(req: NextRequest, context: any) {
  const tenant = determineTenant(req);
  return NextAuth(getAuthOptions(tenant))(req, context);
}
