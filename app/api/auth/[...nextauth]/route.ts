import NextAuth from 'next-auth';
import { getAuthOptions } from '@/lib/auth';

export async function GET(req: Request, context: any) {
  return NextAuth(getAuthOptions())(req, context);
}

export async function POST(req: Request, context: any) {
  return NextAuth(getAuthOptions())(req, context);
}
