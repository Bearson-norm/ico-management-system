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
          {
            href: '/ga/dashboard',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" />
                <rect x="14" y="3" width="7" height="5" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="16" width="7" height="5" />
              </svg>
            ),
            label: 'Dashboard',
            section: 'Overview'
          },
          {
            href: '/ga/po-pr',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            ),
            label: 'Pelacakan Pesanan',
            section: 'Overview'
          },
          {
            href: '/ga/database',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            ),
            label: 'Database Barang',
            section: 'Master'
          },
          {
            href: '/ga/stock-in',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 10 12 15 7 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
                <path d="M20 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
              </svg>
            ),
            label: 'Stock In',
            section: 'Inventory'
          },
          {
            href: '/ga/stock-out',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
                <path d="M20 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
              </svg>
            ),
            label: 'Stock Out',
            section: 'Inventory'
          },
          {
            href: '/ga/opname',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <line x1="9" y1="9" x2="15" y2="9" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="13" y2="17" />
              </svg>
            ),
            label: 'Stock Opname',
            section: 'Inventory'
          },
          {
            href: '/ga/history',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            ),
            label: 'Riwayat',
            section: 'Audit'
          },
          {
            href: '/ga/reports',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            ),
            label: 'Export CSV',
            section: 'Laporan'
          },
          {
            href: '/ga/github',
            icon: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            ),
            label: 'GitHub Deploy',
            section: 'System'
          },
        ]
      : []),
    {
      href: '/ga/stock',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
          <polygon points="12 22.08 12 12 3 6.92 3 17 12 22.08" />
          <polygon points="12 22.08 21 17 21 6.92 12 12 12 22.08" />
          <polygon points="12 12 21 6.92 12 1.84 3 6.92 12 12" />
        </svg>
      ),
      label: 'Stok & Lokasi',
      section: 'Inventory'
    },
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
              <span className="ga-module-tag" style={{ background: 'var(--ga-accent)', color: '#fff', padding: '2px 6px', fontWeight: '800', borderRadius: '4px' }}>GA</span>
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
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden>
                    {m.icon}
                  </span>
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
