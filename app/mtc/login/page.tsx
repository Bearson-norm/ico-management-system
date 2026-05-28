'use client';
import { signIn } from 'next-auth/react';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';

export default function MtcLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', {
      username,
      password,
      tenant: 'mtc',
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      if (res.error === 'CredentialsSignin') {
        setError('Username atau password salah');
      } else {
        setError(`Login gagal (${res.error}). Jika di HTTPS, pastikan NEXTAUTH_URL di .env sama dengan URL ini (mis. https://domain.com) dan nginx mengirim X-Forwarded-Proto.`);
      }
      return;
    }
    const sessionRes = await fetch('/api/auth/session');
    const session = await sessionRes.json();
    const role = session?.user?.role;
    router.replace(role === 'editor' ? '/mtc/dashboard' : '/mtc/stock');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '20px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <Link href="/" style={{ fontSize: 13, color: 'var(--tx3)' }}>
            ← Kembali ke beranda
          </Link>
        </div>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🔧</div>
          <div style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-.3px', lineHeight: 1.25 }}>
            {BRAND_NAME}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--tx2)', marginTop: '8px' }}>
            Login modul MTC — maintenance & stock control
          </div>
        </div>

        <div className="card" style={{ padding: '28px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '20px' }}>Masuk</div>

          {error && (
            <div className="alert alert-red" style={{ marginBottom: '16px' }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? (
                <>
                  <div className="spinner" style={{ borderTopColor: '#fff' }} /> Memverifikasi...
                </>
              ) : (
                'Masuk'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
