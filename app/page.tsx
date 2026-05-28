import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';

export default function HomePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 720, width: '100%' }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            marginBottom: 8,
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {BRAND_NAME}
        </h1>
        <p style={{ color: 'var(--tx2)', textAlign: 'center', marginBottom: 32 }}>
          Pilih modul — autentikasi terpisah per database.
        </p>
        <div className="home-pick-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Link
            href="/mtc/login"
            className="card"
            style={{
              padding: 28,
              textAlign: 'center',
              borderColor: 'var(--pur-b)',
              transition: 'transform .15s',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔧</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Modul MTC</div>
            <div style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 8 }}>
              Maintenance & sparepart stock
            </div>
          </Link>
          <Link
            href="/ga/login"
            className="card"
            style={{
              padding: 28,
              textAlign: 'center',
              borderColor: 'var(--blu-b)',
              transition: 'transform .15s',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>General Affairs</div>
            <div style={{ fontSize: 13, color: 'var(--tx2)', marginTop: 8 }}>
              GA inventory & laporan
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
