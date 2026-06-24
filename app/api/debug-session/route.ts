import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const referer = req.headers.get('referer') || '';
    const cookiesList = req.headers.get('cookie') || '';
    
    console.log('[DEBUG-SESSION] Referer:', referer);
    console.log('[DEBUG-SESSION] NEXTAUTH_URL:', process.env.NEXTAUTH_URL);
    
    const session = await getServerSession(getAuthOptions('mtc'));
    
    return NextResponse.json({
      success: true,
      session,
      referer,
      nextauthUrl: process.env.NEXTAUTH_URL,
      nodeEnv: process.env.NODE_ENV,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      stack: err.stack,
    }, { status: 500 });
  }
}
