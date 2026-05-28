import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Origin untuk Location redirect — harus domain publik, bukan 127.0.0.1:1325,
 * saat Next.js di balik nginx (pakai X-Forwarded-Host / X-Forwarded-Proto).
 */
function publicOrigin(req: NextRequest): string {
  const xfHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const xfProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const hostHeader = req.headers.get('host')?.split(',')[0]?.trim();
  const host = xfHost || hostHeader;
  if (host) {
    const proto =
      xfProto || (req.nextUrl.protocol === 'https:' ? 'https' : 'http');
    return `${proto}://${host}`;
  }
  return req.nextUrl.origin;
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;
    const tenant = (token?.tenant as string) || '';
    const origin = publicOrigin(req);

    if (pathname === '/' || pathname.startsWith('/api/auth')) {
      return NextResponse.next();
    }

    // URL pendek: /stock → modul MTC (stok viewer)
    if (pathname === '/stock' || pathname === '/stock/') {
      return NextResponse.redirect(new URL('/mtc/stock', origin));
    }

    if (pathname.startsWith('/mtc/login') || pathname.startsWith('/ga/login')) {
      return NextResponse.next();
    }

    if (pathname.startsWith('/api/mtc')) {
      // Stok viewer publik (tanpa login), sama seperti V2 /api/stock
      if (req.method === 'GET' && pathname === '/api/mtc/stock') {
        return NextResponse.next();
      }
      if (!token || tenant !== 'mtc') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
      const role = (token.role as string) || 'viewer';
      if (role === 'viewer') {
        const method = req.method;
        if (!(method === 'GET' && pathname === '/api/mtc/stock')) {
          return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }
      }
      return NextResponse.next();
    }

    if (pathname.startsWith('/api/ga')) {
      if (!token || tenant !== 'ga') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
      const role = (token.role as string) || 'viewer';
      if (role === 'viewer') {
        const method = req.method;
        const viewerOk =
          method === 'GET' &&
          (pathname === '/api/ga/stock' || pathname.startsWith('/api/ga/export'));
        if (!viewerOk) {
          return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }
      }
      return NextResponse.next();
    }

    if (pathname.startsWith('/mtc')) {
      // Halaman stok publik — /stock dan /mtc/stock (bukan /mtc/stock-in|out)
      const isPublicStockPage =
        pathname === '/mtc/stock' || pathname === '/mtc/stock/';
      if (isPublicStockPage) {
        return NextResponse.next();
      }
      if (!token) {
        return NextResponse.redirect(new URL('/mtc/login', origin));
      }
      if (tenant !== 'mtc') {
        return NextResponse.redirect(new URL('/mtc/login', origin));
      }
      const role = (token.role as string) || 'viewer';
      if (role === 'viewer') {
        const allowed = ['/mtc/stock'];
        const okPath = allowed.some((p) => pathname.startsWith(p));
        if (!okPath) {
          return NextResponse.redirect(new URL('/mtc/stock', origin));
        }
      }
      return NextResponse.next();
    }

    if (pathname.startsWith('/ga')) {
      if (!token) {
        return NextResponse.redirect(new URL('/ga/login', origin));
      }
      if (tenant !== 'ga') {
        return NextResponse.redirect(new URL('/ga/login', origin));
      }
      const role = (token.role as string) || 'viewer';
      if (role === 'viewer') {
        const allowed = ['/ga/stock'];
        const okPath = allowed.some((p) => pathname.startsWith(p));
        if (!okPath) {
          return NextResponse.redirect(new URL('/ga/stock', origin));
        }
      }
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL('/', origin));
  },
  {
    callbacks: {
      authorized: () => true,
    },
  }
);

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
