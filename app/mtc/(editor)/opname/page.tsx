'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function MtcOpnameDashboardPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states for new session
  const [judul, setJudul] = useState('');
  const [lokasi, setLokasi] = useState('');
  const [catatan, setCatatan] = useState('');

  useEffect(() => {
    fetchSessions();
  }, []);

  async function fetchSessions() {
    setLoading(true);
    try {
      const res = await fetch('/api/mtc/opname');
      const json = await res.json();
      if (json.success) {
        setSessions(json.data || []);
      }
    } catch (e) {
      console.error('Gagal mengambil daftar opname:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!judul.trim()) {
      alert('Judul sesi Stock Opname wajib diisi!');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/mtc/opname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judul: judul.trim(),
          lokasi: lokasi.trim() || null,
          catatan: catatan.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreateModal(false);
        setJudul('');
        setLokasi('');
        setCatatan('');
        await fetchSessions();
        alert(json.data.msg || 'Sesi Stock Opname berhasil dibuat!');
      } else {
        alert(`Gagal membuat sesi: ${json.error}`);
      }
    } catch (e) {
      alert('Terjadi kesalahan koneksi jaringan.');
    } finally {
      setSubmitting(false);
    }
  }

  // Stats calculation
  const totalDraft = sessions.filter(s => s.status === 'DRAFT').length;
  const totalWaiting = sessions.filter(s => s.status === 'WAITING_APPROVAL').length;
  const totalPosted = sessions.filter(s => s.status === 'POSTED').length;

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: 16,
        padding: '24px 28px',
        marginBottom: 24,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 28 }}>📋</span>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Stock Opname MTC</h1>
            <span className="badge badge-pur" style={{ fontSize: 11, padding: '4px 10px', fontWeight: 700 }}>
              Multi-User Collaborative
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--tx2)', fontSize: 13, maxWidth: 600 }}>
            Audit stok fisik suku cadang gudang MTC secara *real-time* dari HP atau Laptop bersama tim teknisi.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
          style={{
            padding: '12px 20px',
            fontSize: 14,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
            boxShadow: '0 4px 14px rgba(168, 85, 247, 0.4)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <span>➕</span> Buat Sesi Stock Opname Baru
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        <div className="card" style={{ padding: 18, borderLeft: '4px solid var(--ylw)' }}>
          <div style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase' }}>Sedang Dihitung (Draft)</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--ylw)', marginTop: 4 }}>{totalDraft} <span style={{ fontSize: 12, fontWeight: 500 }}>Sesi</span></div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid #a855f7' }}>
          <div style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase' }}>Menunggu ACC Manager</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#a855f7', marginTop: 4 }}>{totalWaiting} <span style={{ fontSize: 12, fontWeight: 500 }}>Sesi</span></div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid var(--grn)' }}>
          <div style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase' }}>Selesai / Ter-posting</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--grn)', marginTop: 4 }}>{totalPosted} <span style={{ fontSize: 12, fontWeight: 500 }}>Sesi</span></div>
        </div>

        <div className="card" style={{ padding: 18, borderLeft: '4px solid var(--blu)' }}>
          <div style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase' }}>Total Seluruh Audit</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--tx1)', marginTop: 4 }}>{sessions.length} <span style={{ fontSize: 12, fontWeight: 500 }}>Sesi</span></div>
        </div>
      </div>

      {/* Sessions List */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📑</span> Daftar Sesi Audit Stock Opname
        </h3>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)' }}>
            ⏳ Memuat daftar sesi Stock Opname...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', border: '2px dashed var(--bdr)', borderRadius: 12 }}>
            <span style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>📋</span>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Belum ada sesi Stock Opname</div>
            <p style={{ color: 'var(--tx3)', fontSize: 13, margin: '6px 0 16px 0' }}>
              Klik tombol di bawah untuk membuat sesi audit stok fisik baru bersama tim teknisi.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary btn-sm"
            >
              ➕ Buat Sesi Opname Pertama
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map(s => {
              let statusBadge = (
                <span className="badge badge-ylw" style={{ padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>
                  ⏳ DRAFT (Sedang Dihitung)
                </span>
              );

              if (s.status === 'WAITING_APPROVAL') {
                statusBadge = (
                  <span className="badge badge-pur" style={{ padding: '4px 10px', fontSize: 11, fontWeight: 800, background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7' }}>
                    📤 MENUNGGU ACC MANAGER
                  </span>
                );
              } else if (s.status === 'POSTED') {
                statusBadge = (
                  <span className="badge badge-grn" style={{ padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>
                    ✓ TER-POSTING (SELESAI)
                  </span>
                );
              } else if (s.status === 'CANCELLED') {
                statusBadge = (
                  <span className="badge badge-red" style={{ padding: '4px 10px', fontSize: 11, fontWeight: 800 }}>
                    ❌ DIBATALKAN
                  </span>
                );
              }

              return (
                <div
                  key={s.id}
                  style={{
                    background: 'var(--bg2)',
                    border: '1px solid var(--bdr)',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 16
                  }}
                >
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx1)' }}>{s.judul}</span>
                      <span style={{ fontSize: 11, color: 'var(--tx3)' }}>#{s.id}</span>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--tx2)', display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                      <span>📍 Lokasi: <strong>{s.lokasi || 'Semua Rak Gudang'}</strong></span>
                      <span>🗓️ Dibuat: {new Date(s.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {s.approvedBy && <span>✓ ACC: <strong>{s.approvedBy}</strong></span>}
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginTop: 10, maxWidth: 400 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: 'var(--tx3)', marginBottom: 2 }}>
                        <span>Progres Audit: {s.countedItems}/{s.totalItems} Item</span>
                        <span>{s.progressPct}%</span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${s.progressPct}%`,
                          height: '100%',
                          background: s.progressPct === 100 ? 'var(--grn)' : 'linear-gradient(90deg, #a855f7, #3b82f6)',
                          borderRadius: 3,
                          transition: 'width 0.3s'
                        }} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    {statusBadge}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link
                        href={`/mtc/opname/${s.id}`}
                        className="btn btn-primary btn-sm"
                        style={{ padding: '8px 14px', fontSize: 12, fontWeight: 800 }}
                      >
                        📱 Buka Form Hitung
                      </Link>

                      <Link
                        href={`/mtc/opname/${s.id}/print`}
                        target="_blank"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '8px 12px', fontSize: 12 }}
                      >
                        🖨️ Cetak
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 500, padding: 24, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>➕ Buat Sesi Stock Opname Baru</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 16 }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSession}>
              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>
                  Judul Sesi Opname <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Audit Stok Akhir Bulan Juli 2026"
                  value={judul}
                  onChange={e => setJudul(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>
                  Filter Lokasi Rak / Area (Opsional)
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Kosongkan untuk SEMUA rak, atau ketik nama rak (misal: Rak A1)"
                  value={lokasi}
                  onChange={e => setLokasi(e.target.value)}
                />
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>
                  Jika diisi, sesi ini hanya akan memuat sparepart yang berada di rak tersebut.
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>
                  Catatan / Keterangan (Opsional)
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Keterangan tambahan untuk tim audit..."
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-ghost"
                  disabled={submitting}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', border: 'none' }}
                  disabled={submitting}
                >
                  {submitting ? '⏳ Membuat Sesi...' : '🚀 Mulai Sesi Opname'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
