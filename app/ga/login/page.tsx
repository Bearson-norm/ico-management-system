'use client';
import { signIn } from 'next-auth/react';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BRAND_NAME } from '@/lib/brand';

export default function GaLoginPage() {
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
      tenant: 'ga',
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      if (res.error === 'CredentialsSignin') {
        setError('Username atau password salah');
      } else {
        setError(
          `Login gagal (${res.error}). Jika di HTTPS, pastikan NEXTAUTH_URL di .env sama dengan URL ini dan nginx mengirim X-Forwarded-Proto.`
        );
      }
      return;
    }
    const sessionRes = await fetch('/api/auth/session');
    const session = await sessionRes.json();
    const role = session?.user?.role;
    router.replace(role === 'editor' ? '/ga/dashboard' : '/ga/stock');
  }

  return (
    <div className="ga-login-wrap">
      <div className="ga-login-card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--ga-tx2)', marginBottom: 8 }}>{BRAND_NAME}</div>
          <Link href="/" className="ga-login-back">
            ← Beranda
          </Link>
        </div>
        <div className="card" style={{ padding: 28 }}>
          <h1>Login modul General Affairs</h1>
          <p style={{ fontSize: 13, color: 'var(--ga-tx2)', marginBottom: 20 }}>Akun terpisah dari modul MTC.</p>
          {error && <div className="ga-login-error">{error}</div>}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              className="form-input"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
            <input
              className="form-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
              {loading ? 'Memuat…' : 'Masuk'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
