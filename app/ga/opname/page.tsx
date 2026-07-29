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

export default function GaOpnameStandalonePage() {
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

  if (loading && sessions.length === 0) return <div className="ga-loading" style={{ padding: 40, textAlign: 'center' }}>Memuat…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', background: '#0f172a', minHeight: '100vh', color: '#fff' }}>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title" style={{ fontSize: 20, fontWeight: 'bold' }}>Stock Opname GA</div>
            <div className="page-sub" style={{ fontSize: 12, color: '#94a3b8' }}>
              Satu sesi untuk semua gedung — isi per lokasi, posting setelah seluruh barang dihitung
            </div>
          </div>
          <div className="ga-page-actions">
            <button type="button" className="btn btn-primary" onClick={() => setModal(true)} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>
              + Sesi opname baru
            </button>
          </div>
        </div>
      </div>

      <div className="page-body" style={{ marginTop: 20 }}>
        {msg && <div className="ga-alert-error" style={{ marginBottom: 12, color: '#ef4444' }}>{msg}</div>}

        <div className="card" style={{ padding: 16, background: '#1e293b', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                  <th style={{ padding: 10 }}>Periode</th>
                  <th style={{ padding: 10 }}>Tanggal</th>
                  <th style={{ padding: 10 }}>Barang</th>
                  <th style={{ padding: 10 }}>Progress</th>
                  <th style={{ padding: 10 }}>Metode</th>
                  <th style={{ padding: 10 }}>Status</th>
                  <th style={{ padding: 10, textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                      Belum ada sesi opname. Buat sesi baru untuk mulai hitung stok fisik.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: 10 }}>
                        <strong>{s.periodeNama}</strong>
                      </td>
                      <td style={{ padding: 10 }}>{s.tanggal}</td>
                      <td style={{ padding: 10 }}>{s.lineCount}</td>
                      <td style={{ padding: 10 }}>
                        {s.status === 'posted' ? (
                          'Semua gedung'
                        ) : (
                          `${s.countedCount}/${s.lineCount}`
                        )}
                      </td>
                      <td style={{ padding: 10 }}>
                        {s.status === 'posted'
                          ? s.postMode === 'adj'
                            ? 'ADJ'
                            : 'IN/OUT'
                          : '—'}
                      </td>
                      <td style={{ padding: 10 }}>{statusBadge(s)}</td>
                      <td style={{ padding: 10, textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <Link
                            href={`/ga/opname/${s.id}/print`}
                            target="_blank"
                            style={{ padding: '4px 10px', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 4, textDecoration: 'none', fontSize: 12 }}
                            title="Cetak Form SO 4 TTD"
                          >
                            🖨️ Form SO
                          </Link>
                          <Link href={`/ga/opname/${s.id}`} style={{ padding: '4px 10px', background: '#2563eb', color: '#fff', borderRadius: 4, textDecoration: 'none', fontSize: 12 }}>
                            {s.status === 'posted' ? 'Lihat' : 'Lanjutkan'}
                          </Link>
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
    </div>
  );
}
