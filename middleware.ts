import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

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

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
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

  // Deteksi tenant berdasarkan path untuk menentukan nama cookie
  const isMtc = pathname.startsWith('/mtc') || pathname.startsWith('/api/mtc');
  const isSecure = process.env.NEXTAUTH_URL?.startsWith('https://') ?? false;
  const cookiePrefix = isSecure ? '__Secure-' : '';
  const tenantType = isMtc ? 'mtc' : 'ga';
  const cookieName = `${cookiePrefix}next-auth.session-token.${tenantType}`;

  // Ambil token secara manual dengan cookieName dinamis
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName,
  });

  const tenant = (token?.tenant as string) || '';

  if (pathname.startsWith('/api/mtc')) {
    // Stok viewer publik (tanpa login), sama seperti V2 /api/stock
    if (req.method === 'GET' && pathname === '/api/mtc/stock') {
      return NextResponse.next();
    }
    
    // Cron auto-sync bypass
    if (pathname === '/api/mtc/odoo/sync') {
      const authHeader = req.headers.get('Authorization');
      const queryToken = req.nextUrl.searchParams.get('token');
      const reqToken = (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null) || queryToken;
      if (reqToken && process.env.CRON_TOKEN && reqToken === process.env.CRON_TOKEN) {
        return NextResponse.next();
      }
    }
    
    const secret = req.nextUrl.searchParams.get('secret');
    const allowedSecret = process.env.QUICK_IN_SECRET || 'MTCI';
    if (secret === allowedSecret) {
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
    // Bypass untuk cleanup endpoint (internal admin tool)
    if (pathname === '/api/ga/procurement/cleanup') {
      const secret = req.nextUrl.searchParams.get('secret');
      if (secret === 'ga-cleanup-2026') return NextResponse.next();
    }
    
    // Cron auto-sync / audit-generate bypass
    if (pathname === '/api/ga/odoo/sync' || pathname === '/api/ga/audit/generate') {
      const authHeader = req.headers.get('Authorization');
      const queryToken = req.nextUrl.searchParams.get('token');
      const reqToken = (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null) || queryToken;
      if (reqToken && process.env.CRON_TOKEN && reqToken === process.env.CRON_TOKEN) {
        return NextResponse.next();
      }
    }

    // GA Spreadsheet Import Webhook bypass (pakai auth X-GA-Sync-Token sendiri).
    // Hanya di-bypass jika webhook diaktifkan lewat env; jika mati, biarkan lolos
    // ke route handler yang akan membalas 410 (tanpa perlu session GA).
    if (pathname === '/api/ga/import/webhook') {
      if (process.env.GA_WEBHOOK_ENABLED === 'true') {
        return NextResponse.next();
      }
      return NextResponse.json(
        { success: false, error: 'Webhook GA dinonaktifkan (GA_WEBHOOK_ENABLED tidak di-set).' },
        { status: 410 }
      );
    }

    if (!token || tenant !== 'ga') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const role = (token.role as string) || 'viewer';

    // User Management + Audit Trail: hanya administrator
    const isAdminOnlyApi =
      pathname.startsWith('/api/ga/users') ||
      (pathname.startsWith('/api/ga/audit') && pathname !== '/api/ga/audit/generate');
    if (isAdminOnlyApi && role !== 'administrator') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    // Generate audit: admin session ATAU sudah di-bypass cron di atas
    if (pathname === '/api/ga/audit/generate' && role !== 'administrator') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

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
      pathname === '/mtc/stock' || pathname === '/mtc/stock/' || pathname === '/mtc/quick-in';
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

    // User Management + Cek Audit Trail: hanya administrator
    if (
      (pathname.startsWith('/ga/users') || pathname.startsWith('/ga/audit')) &&
      role !== 'administrator'
    ) {
      return NextResponse.redirect(new URL('/ga/dashboard', origin));
    }

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
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
