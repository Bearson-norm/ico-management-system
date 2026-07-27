import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function MtcOpnameStandaloneDashboardPage() {
  const { data: sessionData } = useSession();
  const isEditor = (sessionData?.user as any)?.role === 'editor';

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
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg1, #0f172a)',
      color: 'var(--tx1, #f8fafc)',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '16px 20px 80px 20px'
    }}>
      {/* Top Navbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 16,
        marginBottom: 20,
        borderBottom: '1px solid var(--bdr, rgba(255,255,255,0.1))'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>📋</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em' }}>Stock Opname MTC</div>
            <div style={{ fontSize: 11, color: 'var(--tx3, #94a3b8)' }}>Form Publik Hitung Fisik Gudang</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isEditor && (
            <Link
              href="/mtc/dashboard"
              style={{
                color: '#a855f7',
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 800,
                background: 'rgba(168, 85, 247, 0.15)',
                padding: '6px 14px',
                borderRadius: 20,
                border: '1px solid rgba(168, 85, 247, 0.3)'
              }}
            >
              📊 Dashboard Editor
            </Link>
          )}

          <Link
            href="/mtc/stock"
            style={{
              color: 'var(--tx2, #cbd5e1)',
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 700,
              background: 'var(--bg2, rgba(255,255,255,0.05))',
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid var(--bdr, rgba(255,255,255,0.1))'
            }}
          >
            📦 Stok Inventory
          </Link>
        </div>
      </div>

      {/* Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.18) 0%, rgba(59, 130, 246, 0.18) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.3)',
        borderRadius: 16,
        padding: '20px 24px',
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Audit Fisik Gudang MTC</h1>
            <span style={{
              background: 'rgba(168, 85, 247, 0.25)',
              color: '#c084fc',
              fontSize: 10,
              fontWeight: 800,
              padding: '3px 8px',
              borderRadius: 12
            }}>
              Akses Terbuka Tim Audit
            </span>
          </div>
          <p style={{ margin: 0, color: 'var(--tx2, #cbd5e1)', fontSize: 13, maxWidth: 540 }}>
            Semua tim teknisi & petugas audit dapat membuka link ini langsung di HP masing-masing untuk menghitung stok fisik secara *real-time*.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '12px 20px',
            fontSize: 13,
            fontWeight: 800,
            background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(168, 85, 247, 0.4)',
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <span>➕</span> Buat Sesi Opname Baru
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
        marginBottom: 20
      }}>
        <div style={{ background: 'var(--bg2, rgba(255,255,255,0.03))', border: '1px solid var(--bdr, rgba(255,255,255,0.1))', padding: 16, borderRadius: 12, borderLeft: '4px solid #eab308' }}>
          <div style={{ fontSize: 10, color: 'var(--tx3, #94a3b8)', fontWeight: 700, textTransform: 'uppercase' }}>Draft (Proses Hitung)</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#eab308', marginTop: 2 }}>{totalDraft} <span style={{ fontSize: 11, fontWeight: 500 }}>Sesi</span></div>
        </div>

        <div style={{ background: 'var(--bg2, rgba(255,255,255,0.03))', border: '1px solid var(--bdr, rgba(255,255,255,0.1))', padding: 16, borderRadius: 12, borderLeft: '4px solid #a855f7' }}>
          <div style={{ fontSize: 10, color: 'var(--tx3, #94a3b8)', fontWeight: 700, textTransform: 'uppercase' }}>Menunggu ACC Manager</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#a855f7', marginTop: 2 }}>{totalWaiting} <span style={{ fontSize: 11, fontWeight: 500 }}>Sesi</span></div>
        </div>

        <div style={{ background: 'var(--bg2, rgba(255,255,255,0.03))', border: '1px solid var(--bdr, rgba(255,255,255,0.1))', padding: 16, borderRadius: 12, borderLeft: '4px solid #22c55e' }}>
          <div style={{ fontSize: 10, color: 'var(--tx3, #94a3b8)', fontWeight: 700, textTransform: 'uppercase' }}>Ter-posting (Selesai)</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#22c55e', marginTop: 2 }}>{totalPosted} <span style={{ fontSize: 11, fontWeight: 500 }}>Sesi</span></div>
        </div>

        <div style={{ background: 'var(--bg2, rgba(255,255,255,0.03))', border: '1px solid var(--bdr, rgba(255,255,255,0.1))', padding: 16, borderRadius: 12, borderLeft: '4px solid #3b82f6' }}>
          <div style={{ fontSize: 10, color: 'var(--tx3, #94a3b8)', fontWeight: 700, textTransform: 'uppercase' }}>Total Seluruh Audit</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--tx1, #fff)', marginTop: 2 }}>{sessions.length} <span style={{ fontSize: 11, fontWeight: 500 }}>Sesi</span></div>
        </div>
      </div>

      {/* Sessions List */}
      <div style={{ background: 'var(--bg2, rgba(255,255,255,0.03))', border: '1px solid var(--bdr, rgba(255,255,255,0.1))', padding: 20, borderRadius: 16 }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📑</span> Daftar Sesi Audit Stock Opname
        </h3>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3, #94a3b8)' }}>
            ⏳ Memuat daftar sesi Stock Opname...
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', border: '2px dashed var(--bdr, rgba(255,255,255,0.1))', borderRadius: 12 }}>
            <span style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>📋</span>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Belum ada sesi Stock Opname</div>
            <p style={{ color: 'var(--tx3, #94a3b8)', fontSize: 13, margin: '6px 0 16px 0' }}>
              Klik tombol di bawah untuk membuat sesi audit stok fisik baru bersama tim teknisi.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '8px 16px',
                background: '#a855f7',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              ➕ Buat Sesi Opname Pertama
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sessions.map(s => {
              let statusBadge = (
                <span style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '4px 10px', fontSize: 11, fontWeight: 800, borderRadius: 12 }}>
                  ⏳ DRAFT (Sedang Dihitung)
                </span>
              );

              if (s.status === 'WAITING_APPROVAL') {
                statusBadge = (
                  <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '4px 10px', fontSize: 11, fontWeight: 800, borderRadius: 12 }}>
                    📤 MENUNGGU ACC MANAGER
                  </span>
                );
              } else if (s.status === 'POSTED') {
                statusBadge = (
                  <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '4px 10px', fontSize: 11, fontWeight: 800, borderRadius: 12 }}>
                    ✓ TER-POSTING (SELESAI)
                  </span>
                );
              } else if (s.status === 'CANCELLED') {
                statusBadge = (
                  <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '4px 10px', fontSize: 11, fontWeight: 800, borderRadius: 12 }}>
                    ❌ DIBATALKAN
                  </span>
                );
              }

              return (
                <div
                  key={s.id}
                  style={{
                    background: 'var(--bg1, #0f172a)',
                    border: '1px solid var(--bdr, rgba(255,255,255,0.1))',
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
                      <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx1, #fff)' }}>{s.judul}</span>
                      <span style={{ fontSize: 11, color: 'var(--tx3, #94a3b8)' }}>#{s.id}</span>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--tx2, #cbd5e1)', display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6 }}>
                      <span>📍 Rak: <strong>{s.lokasi || 'Semua Rak Gudang'}</strong></span>
                      <span>🗓️ Dibuat: {new Date(s.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      {s.approvedBy && <span>✓ ACC: <strong>{s.approvedBy}</strong></span>}
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginTop: 10, maxWidth: 400 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 700, color: 'var(--tx3, #94a3b8)', marginBottom: 2 }}>
                        <span>Progres Audit: {s.countedItems}/{s.totalItems} Item</span>
                        <span>{s.progressPct}%</span>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${s.progressPct}%`,
                          height: '100%',
                          background: s.progressPct === 100 ? '#22c55e' : 'linear-gradient(90deg, #a855f7, #3b82f6)',
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
                        style={{
                          padding: '8px 16px',
                          fontSize: 12,
                          fontWeight: 800,
                          background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                          color: '#fff',
                          textDecoration: 'none',
                          borderRadius: 8
                        }}
                      >
                        📱 Buka Form Hitung
                      </Link>

                      <Link
                        href={`/mtc/opname/${s.id}/print`}
                        target="_blank"
                        style={{
                          padding: '8px 12px',
                          fontSize: 12,
                          background: 'rgba(255,255,255,0.08)',
                          color: '#fff',
                          textDecoration: 'none',
                          borderRadius: 8
                        }}
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
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: 500, padding: 24, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#fff' }}>➕ Buat Sesi Stock Opname Baru</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSession}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 700, fontSize: 12, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                  Judul Sesi Opname <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Audit Stok Akhir Bulan Juli 2026"
                  value={judul}
                  onChange={e => setJudul(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff',
                    fontSize: 13
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 700, fontSize: 12, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                  Filter Lokasi Rak / Area (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Kosongkan untuk SEMUA rak, atau ketik nama rak (misal: Rak A1)"
                  value={lokasi}
                  onChange={e => setLokasi(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff',
                    fontSize: 13
                  }}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ fontWeight: 700, fontSize: 12, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                  Catatan / Keterangan (Opsional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Keterangan tambahan untuk tim audit..."
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff',
                    fontSize: 13
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ padding: '8px 16px', background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }}
                  disabled={submitting}
                >
                  Batal
                </button>

                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
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
