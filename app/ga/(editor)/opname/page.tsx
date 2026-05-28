'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type SessionRow = {
  id: number;
  periodeNama: string;
  lokasi: string | null;
  status: string;
  tanggal: string;
  lineCount: number;
  countedCount: number;
  varianceCount: number;
  postMode: 'in_out' | 'adj' | null;
};

export default function GaOpnameListPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [activeItemCount, setActiveItemCount] = useState<number | null>(null);
  const [form, setForm] = useState({
    periodeNama: '',
    tanggal: new Date().toISOString().split('T')[0],
  });

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/ga/opname');
      const j = await res.json();
      if (j.success) setSessions(j.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!modal) return;
    fetch('/api/ga/stock?aktif=true')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setActiveItemCount(j.data.length);
      });
  }, [modal]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.periodeNama.trim()) return alert('Nama periode wajib');
    setCreating(true);
    setMsg(null);
    const res = await fetch('/api/ga/opname', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const j = await res.json();
    setCreating(false);
    if (j.success) {
      setModal(false);
      setForm({ periodeNama: '', tanggal: form.tanggal });
      window.location.href = `/ga/opname/${j.data.session.id}`;
    } else {
      setMsg(j.error || 'Gagal membuat sesi');
    }
  }

  function statusBadge(s: SessionRow) {
    if (s.status === 'posted') return <span className="badge badge-grn">Selesai</span>;
    const pct = s.lineCount ? Math.round((s.countedCount / s.lineCount) * 100) : 0;
    return (
      <span className="badge badge-ylw">
        Draft · {s.countedCount}/{s.lineCount} ({pct}%)
      </span>
    );
  }

  if (loading && sessions.length === 0) return <div className="ga-loading">Memuat…</div>;

  return (
    <>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title">Stock Opname GA</div>
            <div className="page-sub">
              Satu sesi untuk semua gedung — isi per lokasi, posting setelah seluruh barang dihitung
            </div>
          </div>
          <div className="ga-page-actions">
            <button type="button" className="btn btn-primary" onClick={() => setModal(true)}>
              + Sesi opname baru
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {msg && <div className="ga-alert-error" style={{ marginBottom: 12 }}>{msg}</div>}

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Periode</th>
                  <th>Tanggal</th>
                  <th>Barang</th>
                  <th>Progress</th>
                  <th>Metode</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--ga-tx2)' }}>
                      Belum ada sesi opname. Buat sesi baru untuk mulai hitung stok fisik.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.periodeNama}</strong>
                      </td>
                      <td>{s.tanggal}</td>
                      <td>{s.lineCount}</td>
                      <td>
                        {s.status === 'posted' ? (
                          'Semua gedung'
                        ) : (
                          `${s.countedCount}/${s.lineCount}`
                        )}
                      </td>
                      <td>
                        {s.status === 'posted'
                          ? s.postMode === 'adj'
                            ? 'ADJ'
                            : 'IN/OUT'
                          : '—'}
                      </td>
                      <td>{statusBadge(s)}</td>
                      <td>
                        <Link href={`/ga/opname/${s.id}`} className="btn btn-ghost btn-sm">
                          {s.status === 'posted' ? 'Lihat' : 'Lanjutkan'}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">Sesi opname baru</div>
            </div>
            <form onSubmit={onCreate}>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--ga-tx2)', marginBottom: 16 }}>
                  Semua barang aktif masuk satu sesi. Setelah dibuat, pilih gedung/lokasi untuk mengisi qty fisik.
                  Posting selisih baru bisa dilakukan jika <strong>semua gedung</strong> sudah selesai dihitung.
                </p>
                {activeItemCount != null && (
                  <p style={{ fontSize: 13, marginBottom: 12, color: 'var(--ga-accent)' }}>
                    Akan memuat <strong>{activeItemCount}</strong> barang aktif
                  </p>
                )}
                <div className="form-group">
                  <label className="form-label">
                    Nama periode <span className="req">*</span>
                  </label>
                  <input
                    className="form-input"
                    placeholder="Mis. Opname Mei 2026"
                    value={form.periodeNama}
                    onChange={(e) => setForm({ ...form, periodeNama: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tanggal opname</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.tanggal}
                    onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Membuat…' : 'Buat sesi (semua gedung)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
