'use client';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BRAND_NAME } from '@/lib/brand';

export default function GaShellLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const role = (session?.user as { role?: string })?.role || 'viewer';
  const name = session?.user?.name || 'User';
  const isEditor = role === 'editor';

  const menu = [
    ...(isEditor
      ? [
          { href: '/ga/dashboard', label: 'Dashboard', section: 'Overview' },
          { href: '/ga/database', label: 'Database Barang', section: 'Master' },
          { href: '/ga/stock-in', label: 'Stock In', section: 'Inventory' },
          { href: '/ga/stock-out', label: 'Stock Out', section: 'Inventory' },
          { href: '/ga/opname', label: 'Stock Opname', section: 'Inventory' },
          { href: '/ga/history', label: 'Riwayat', section: 'Audit' },
          { href: '/ga/reports', label: 'Export CSV', section: 'Laporan' },
        ]
      : []),
    { href: '/ga/stock', label: 'Stok & Lokasi', section: 'Inventory' },
  ];

  let currentSection = '';

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (navOpen) {
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.documentElement.style.overflow = prev;
      };
    }
    return undefined;
  }, [navOpen]);

  const closeNav = () => setNavOpen(false);

  return (
    <div className="app-shell">
      <div
        className={`sidebar-backdrop${navOpen ? ' sidebar-backdrop--visible' : ''}`}
        aria-hidden={!navOpen}
        onClick={closeNav}
        role="presentation"
      />

      <header className="mobile-topbar" aria-label="Navigasi GA">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-expanded={navOpen}
          aria-controls="sidebar-ga"
          onClick={() => setNavOpen((o) => !o)}
        >
          <span className="sr-only">{navOpen ? 'Tutup menu' : 'Buka menu'}</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {navOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </>
            )}
          </svg>
        </button>
        <span className="mobile-topbar-title">General Affairs</span>
        <span className="badge badge-blu hide-on-mobile-badge" style={{ flexShrink: 0, fontSize: 10, textTransform: 'uppercase' }}>
          {role}
        </span>
      </header>

      <aside id="sidebar-ga" className={`sidebar${navOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-logo">
          <div className="flex-between">
            <div>
              <div className="sidebar-logo-title" style={{ fontSize: 13, lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                {BRAND_NAME}
              </div>
              <div className="sidebar-logo-sub">Modul General Affairs</div>
              <span className="ga-module-tag">GA</span>
            </div>
            <span className="badge badge-blu hide-on-mobile-badge" style={{ fontSize: 10, textTransform: 'uppercase' }}>
              {role}
            </span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Menu GA">
          {menu.map((m) => {
            const isNew = m.section !== currentSection;
            if (isNew) currentSection = m.section;
            const active = pathname.startsWith(m.href);
            return (
              <div key={m.href}>
                {isNew && <div className="sidebar-section">{m.section}</div>}
                <Link href={m.href} className={`nav-item ${active ? 'active' : ''}`} onClick={closeNav}>
                  {m.label}
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{name.charAt(0).toUpperCase()}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{name}</div>
              <div className="sidebar-user-role">{isEditor ? 'Editor' : 'Viewer'}</div>
            </div>
            <button
              type="button"
              className="logout-btn"
              style={{ minWidth: 44, minHeight: 44 }}
              onClick={() => signOut({ callbackUrl: '/' })}
              title="Keluar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="main-content">{children}</div>
    </div>
  );
}
