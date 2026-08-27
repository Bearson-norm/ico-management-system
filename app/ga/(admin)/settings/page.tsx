'use client';

import { FormEvent, useEffect, useState } from 'react';

const DEFAULT_THRESHOLD = 5;

export default function GaSettingsPage() {
  const [threshold, setThreshold] = useState(String(DEFAULT_THRESHOLD));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ga/settings')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const raw = json.data?.ga_slow_moving_threshold;
          if (raw != null && String(raw).trim() !== '') {
            setThreshold(String(raw));
          }
        } else {
          setError(json.error || 'Gagal memuat pengaturan');
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Gagal memuat pengaturan');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/ga/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ga_slow_moving_threshold: threshold }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage('Batas Slow Moving berhasil disimpan.');
      } else {
        setError(json.error || 'Gagal menyimpan pengaturan');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title">Konfigurasi</div>
            <div className="page-sub">Atur batas klasifikasi Fast Moving / Slow Moving</div>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ maxWidth: 560 }}>
          <div className="card-header">
            <div className="card-title">Klasifikasi pergerakan stok</div>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ padding: '20px 24px' }}>
              {loading ? (
                <p className="text-muted">Memuat pengaturan…</p>
              ) : (
                <div className="form-group">
                  <label className="form-label" htmlFor="slow-moving-threshold">
                    Batas Slow Moving <span className="req">*</span>
                  </label>
                  <input
                    id="slow-moving-threshold"
                    className="form-input"
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                  />
                  <p className="text-muted text-tiny" style={{ marginTop: 8, lineHeight: 1.5 }}>
                    Jumlah qty barang keluar dalam 30 hari terakhir. Jika kurang dari angka ini,
                    barang diklasifikasikan Slow Moving; sama dengan atau lebih dari angka ini menjadi
                    Fast Moving. Default: {DEFAULT_THRESHOLD}.
                  </p>
                </div>
              )}
              {message && (
                <div className="alert alert-grn" style={{ marginTop: 12 }}>
                  {message}
                </div>
              )}
              {error && (
                <div className="alert alert-red" style={{ marginTop: 12 }}>
                  {error}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid var(--ga-br)', padding: '16px 24px' }}>
              <button type="submit" className="btn btn-primary" disabled={loading || saving}>
                {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
