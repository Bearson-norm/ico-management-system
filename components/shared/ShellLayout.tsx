'use client';
import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BRAND_NAME } from '@/lib/brand';

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const role = (session?.user as { role?: string })?.role || 'viewer';
  const name = session?.user?.name || 'User';

  const isEditor = role === 'editor';

  const menu = [
    ...(isEditor
      ? [
          { href: '/mtc/dashboard', icon: '📊', label: 'Dashboard', section: 'Overview' },
          { href: '/mtc/analytics', icon: '📈', label: 'ERP ROP & Analytics', section: 'Overview' },
          { href: '/mtc/report', icon: '📋', label: 'Report & SP', section: 'Maintenance' },
          { href: '/mtc/stock-out', icon: '📤', label: 'Stock Out', section: 'Inventory' },
          { href: '/mtc/stock-in', icon: '📥', label: 'Stock In', section: 'Inventory' },
          { href: '/mtc/inventory', icon: '📦', label: 'Stock Inventory', section: 'Inventory' },
          { href: '/mtc/history', icon: '🧾', label: 'History INOUT', section: 'Audit' },
          { href: '/mtc/master', icon: '⚙️', label: 'Master Data', section: 'System' },
          { href: '/mtc/users', icon: '👥', label: 'Manage Users', section: 'System' },
        ]
      : [{ href: '/mtc/stock', icon: '📦', label: 'Stock Inventory', section: 'Inventory' }]),
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
        onKeyDown={(e) => e.key === 'Escape' && closeNav()}
        role="presentation"
      />

      <header className="mobile-topbar" aria-label="Navigasi utama">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-expanded={navOpen}
          aria-controls="sidebar-mtc"
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
        <span className="mobile-topbar-title">Modul MTC</span>
        <div className="badge badge-pur" style={{ flexShrink: 0, fontSize: 10 }}>
          {role.toUpperCase()}
        </div>
      </header>

      <div id="sidebar-mtc" className={`sidebar${navOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-logo">
          <div className="flex-between">
            <div>
              <div
                className="sidebar-logo-title"
                style={{ fontSize: 13, lineHeight: 1.25, whiteSpace: 'normal', wordBreak: 'break-word' }}
              >
                {BRAND_NAME}
              </div>
              <div className="sidebar-logo-sub">Modul MTC • v3.0 • PostgreSQL</div>
            </div>
            <div className="badge badge-pur hide-on-mobile-badge">{role.toUpperCase()}</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Menu MTC">
          {menu.map((m) => {
            const isNewSection = m.section !== currentSection;
            if (isNewSection) currentSection = m.section;
            const active = pathname.startsWith(m.href);
            return (
              <div key={m.href}>
                {isNewSection && <div className="sidebar-section">{m.section}</div>}
                <Link href={m.href} className={`nav-item ${active ? 'active' : ''}`} onClick={closeNav}>
                  <span style={{ fontSize: '16px' }} aria-hidden>
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
              <div className="sidebar-user-role">{role === 'editor' ? 'Administrator' : 'Viewer Only'}</div>
            </div>
            <button
              type="button"
              className="logout-btn"
              style={{ minWidth: 44, minHeight: 44 }}
              onClick={() => signOut({ callbackUrl: '/' })}
              title="Logout"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="main-content">{children}</div>
    </div>
  );
}
