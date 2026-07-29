'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { downloadOpnamePdf } from '@/lib/ga/downloadOpnamePdf';

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

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Apakah Anda yakin ingin menghapus sesi opname "${name}"? Semua data hitungan fisik dalam sesi ini akan dihapus permanen.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/ga/opname/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (j.success) {
        setMsg('Sesi opname berhasil dihapus');
        load();
      } else {
        alert(j.error || 'Gagal menghapus sesi');
      }
    } catch (e: any) {
      alert(e.message || 'Terjadi kesalahan');
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
      const sessionId = j.data.session.id as number;
      const pdfOk = await downloadOpnamePdf(sessionId);
      if (!pdfOk) {
        alert('Sesi berhasil dibuat, tetapi PDF lembar kerja gagal diunduh. Anda bisa unduh dari halaman detail opname.');
      }
      window.location.href = `/ga/opname/${sessionId}`;
    } else {
      setMsg(j.error || 'Gagal membuat sesi');
    }
  }

  function statusBadge(s: SessionRow) {
    if (s.status === 'posted') return <span className="badge badge-grn">✓ Selesai</span>;
    if (s.status === 'waiting_approval') {
      return (
        <span className="badge badge-ylw" style={{ background: 'rgba(217, 119, 6, 0.15)', color: '#d97706' }}>
          📤 Menunggu ACC
        </span>
      );
    }
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
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <Link
                            href={`/ga/opname/${s.id}/print`}
                            target="_blank"
                            className="btn btn-ghost btn-sm"
                            title="Cetak Form SO 4 TTD"
                          >
                            🖨️ Form SO
                          </Link>
                          <Link href={`/ga/opname/${s.id}`} className="btn btn-ghost btn-sm">
                            {s.status === 'posted' ? 'Lihat' : 'Lanjutkan'}
                          </Link>
                          {s.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => handleDelete(s.id, s.periodeNama)}
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--ga-red)', borderColor: 'rgba(224, 85, 85, 0.2)' }}
                            >
                              Hapus
                            </button>
                          )}
                        </div>
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
                <div className="alert alert-ylw" style={{ marginBottom: 16 }}>
                  <div style={{ flex: 1, fontSize: 12 }}>
                    <strong>Sebelum mulai opname:</strong> pastikan <strong>semua transaksi Stock In / Stock Out
                    sampai hari ini sudah diinput</strong>. Selisih hitung fisik vs sistem akan di-adjust saat
                    posting — transaksi yang baru diinput <em>setelah</em> opname diposting akan membuat stok
                    terkoreksi dobel.
                  </div>
                </div>
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
