'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function MtcOpnameEditorDetailPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const { data: sessionData } = useSession();
  const isEditor = (sessionData?.user as any)?.role === 'editor';

  const [session, setSession] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'MATCH' | 'PLUS' | 'MINUS'>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Multi-user technician name
  const [technicianName, setTechnicianName] = useState('');
  const [focusedItemId, setFocusedItemId] = useState<number | null>(null);

  // Status submitting & action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedName = localStorage.getItem('mtc_opname_auditor_name') || '';
      setTechnicianName(savedName);
    }
    fetchOpnameDetail();

    const timer = setInterval(() => {
      fetchOpnameDetail(false);
    }, 8000);

    return () => clearInterval(timer);
  }, [sessionId]);

  async function fetchOpnameDetail(showLoader = true) {
    if (!showLoader && focusedItemId !== null) return;
    if (showLoader) setLoading(true);
    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}`);
      const json = await res.json();
      if (json.success) {
        setSession(json.data.session);
        setStats(json.data.stats);
        setLocations(json.data.locations || []);
        setCategories(json.data.categories || []);
        setItems(json.data.items || []);
      } else {
        alert(`Gagal memuat detail opname: ${json.error}`);
      }
    } catch (e) {
      console.error('Network error fetching opname detail:', e);
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function handleUpdateCount(itemId: number, newQty: number | null, itemNotes?: string) {
    if (!technicianName.trim()) {
      const inputName = prompt('Masukkan nama Anda (Teknisi Audit):');
      if (!inputName || !inputName.trim()) {
        alert('Nama teknisi wajib diisi untuk mencatat penanggung jawab audit!');
        return;
      }
      setTechnicianName(inputName.trim());
      if (typeof window !== 'undefined') {
        localStorage.setItem('mtc_opname_auditor_name', inputName.trim());
      }
    }

    const currentAuditor = technicianName.trim() || 'Teknisi MTC';

    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const selisih = newQty !== null ? (newQty - item.qtySistem) : 0;
        return {
          ...item,
          qtyFisik: newQty,
          isCounted: newQty !== null,
          selisih,
          auditedBy: currentAuditor,
          ...(itemNotes !== undefined ? { catatan: itemNotes } : {})
        };
      }
      return item;
    }));

    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          qtyFisik: newQty,
          auditedBy: currentAuditor,
          ...(itemNotes !== undefined ? { catatan: itemNotes } : {})
        })
      });
      const json = await res.json();
      if (!json.success) {
        alert(`Gagal menyimpan hitungan: ${json.error}`);
        await fetchOpnameDetail(false);
      }
    } catch (e) {
      console.error('Error saving atomic item count:', e);
    }
  }

  async function handleSubmitForApproval() {
    if (!confirm('Apakah Anda yakin telah selesai menghitung dan ingin MENGAJUKAN hasil Stock Opname ini ke Manager/Supervisor untuk di-ACC?')) {
      return;
    }

    setActionLoading('submit-approval');
    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', status: 'WAITING_APPROVAL' })
      });
      const json = await res.json();
      if (json.success) {
        await fetchOpnameDetail();
        alert(json.data.msg || '✓ Berhasil diajukan ke Manager!');
      } else {
        alert(`Gagal mengajukan: ${json.error}`);
      }
    } catch (e) {
      alert('Koneksi bermasalah.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAccAndPost() {
    if (!confirm('Apakah Anda (Supervisor/Manager) yakin ingin MENG-ACC & MEMPOSTING hasil Stock Opname ini?\n\nPenyesuaian stok akan langsung diperbarui ke database Master Sparepart MTC.')) {
      return;
    }

    setActionLoading('post-opname');
    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}/post`, {
        method: 'POST'
      });
      const json = await res.json();
      if (json.success) {
        await fetchOpnameDetail();
        alert(json.data.msg || '✓ Berhasil di-ACC & di-posting!');
      } else {
        alert(`Gagal posting: ${json.error}`);
      }
    } catch (e) {
      alert('Koneksi bermasalah.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnpostSession() {
    if (!confirm('Apakah Anda (Supervisor/Manager) yakin ingin BATALKAN ACC / RESET status opname ini kembali ke DRAFT untuk diedit ulang?')) {
      return;
    }

    setActionLoading('unpost-opname');
    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}/post`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (json.success) {
        await fetchOpnameDetail();
        alert(json.data.msg || '✓ Status sesi Opname berhasil dikembalikan ke DRAFT!');
      } else {
        alert(`Gagal membatalkan ACC: ${json.error}`);
      }
    } catch (e) {
      alert('Koneksi bermasalah.');
    } finally {
      setActionLoading(null);
    }
  }

  const filteredItems = items.filter(item => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = item.namaItem?.toLowerCase().includes(q);
      const matchKat = item.kategori?.toLowerCase().includes(q);
      const matchLok = item.lokasi?.toLowerCase().includes(q);
      const matchSp = item.sparepartId?.toLowerCase().includes(q);
      if (!matchName && !matchKat && !matchLok && !matchSp) return false;
    }

    if (selectedLocation !== 'ALL') {
      if ((item.lokasi || '') !== selectedLocation) return false;
    }

    if (selectedCategory !== 'ALL') {
      if ((item.kategori || '') !== selectedCategory) return false;
    }

    if (activeTab === 'PENDING') {
      if (item.id === focusedItemId) return true;
      return !item.isCounted;
    }
    if (activeTab === 'MATCH') return item.isCounted && item.selisih === 0;
    if (activeTab === 'PLUS') return item.isCounted && item.selisih > 0;
    if (activeTab === 'MINUS') return item.isCounted && item.selisih < 0;

    return true;
  });

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--tx3)' }}>
        ⏳ Memuat form Stock Opname...
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx1)' }}>
        <h2>Sesi Stock Opname Tidak Ditemukan</h2>
        <Link href="/mtc/opname" style={{ color: '#a855f7', textDecoration: 'underline', marginTop: 16, display: 'inline-block' }}>
          ← Kembali ke Daftar Opname
        </Link>
      </div>
    );
  }

  const isReadOnly = session.status === 'POSTED';

  return (
    <>
      <div className="page-header flex-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/mtc/opname" className="btn btn-ghost btn-sm" title="Kembali ke Daftar Opname">
            ← Kembali
          </Link>
          <div>
            <div className="page-title">{session.judul}</div>
            <div className="page-sub">
              📍 {session.lokasi || 'Semua Rak Gudang'} · {stats?.countedItems}/{stats?.totalItems} Item ({stats?.progressPct}%)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {session.status === 'DRAFT' && (
            <span style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '4px 10px', fontSize: 11, fontWeight: 800, borderRadius: 12 }}>
              ⏳ DRAFT (Sedang Dihitung)
            </span>
          )}
          {session.status === 'WAITING_APPROVAL' && (
            <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '4px 10px', fontSize: 11, fontWeight: 800, borderRadius: 12 }}>
              📤 MENUNGGU ACC MANAGER
            </span>
          )}
          {session.status === 'POSTED' && (
            <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '4px 10px', fontSize: 11, fontWeight: 800, borderRadius: 12 }}>
              ✓ TER-POSTING (SELESAI)
            </span>
          )}

          <Link href={`/mtc/opname/${sessionId}/print`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            🖨️ Form SO
          </Link>

          {session.status === 'DRAFT' && (
            <button
              onClick={handleSubmitForApproval}
              disabled={actionLoading === 'submit-approval'}
              className="btn btn-pur btn-sm"
            >
              {actionLoading === 'submit-approval' ? '⏳ Mengajukan...' : '📤 Ajukan ke Manager'}
            </button>
          )}

          {session.status === 'WAITING_APPROVAL' && (
            <button
              onClick={handleAccAndPost}
              disabled={actionLoading === 'post-opname'}
              className="btn btn-grn btn-sm"
            >
              {actionLoading === 'post-opname' ? '⏳ Posting...' : '✓ ACC & Posting Selisih'}
            </button>
          )}

          {(session.status === 'POSTED' || session.status === 'WAITING_APPROVAL') && (
            <button
              onClick={handleUnpostSession}
              disabled={actionLoading === 'unpost-opname'}
              className="btn btn-red btn-sm"
            >
              {actionLoading === 'unpost-opname' ? '⏳ Resetting...' : '↩️ Batal ACC'}
            </button>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Statistics Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={{ background: 'var(--sf2)', border: '1px solid var(--br)', padding: 14, borderRadius: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase' }}>Akurasi Hitung</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#0284c7', marginTop: 2 }}>{stats?.accuracyPct || '0'}%</div>
          </div>

          <div style={{ background: 'var(--sf2)', border: '1px solid var(--br)', padding: 14, borderRadius: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase' }}>Sesuai (Selisih 0)</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#16a34a', marginTop: 2 }}>{stats?.totalMatchingCount || 0}</div>
          </div>

          <div style={{ background: 'var(--sf2)', border: '1px solid var(--br)', padding: 14, borderRadius: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase' }}>Total Plus (+Qty)</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#2563eb', marginTop: 2 }}>+{stats?.totalPlusQty || 0}</div>
          </div>

          <div style={{ background: 'var(--sf2)', border: '1px solid var(--br)', padding: 14, borderRadius: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase' }}>Total Minus (-Qty)</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#dc2626', marginTop: 2 }}>-{stats?.totalMinusQty || 0}</div>
          </div>

          <div style={{ background: 'var(--sf2)', border: '1px solid var(--br)', padding: 14, borderRadius: 12 }}>
            <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase' }}>Progres Selesai</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--tx1)', marginTop: 2 }}>{stats?.countedItems}/{stats?.totalItems}</div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body" style={{ padding: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="search-bar" style={{ minWidth: 260, flex: 1 }}>
              <input
                type="text"
                placeholder="Cari berdasarkan nama sparepart, ID, atau lokasi..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['ALL', 'PENDING', 'MATCH', 'PLUS', 'MINUS'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`btn btn-sm ${activeTab === tab ? 'btn-pur' : 'btn-ghost'}`}
                >
                  {tab === 'ALL' && `Semua (${items.length})`}
                  {tab === 'PENDING' && `Belum Hitung (${items.filter(i => !i.isCounted).length})`}
                  {tab === 'MATCH' && `Sesuai (${items.filter(i => i.isCounted && i.selisih === 0).length})`}
                  {tab === 'PLUS' && `Plus (${items.filter(i => i.isCounted && i.selisih > 0).length})`}
                  {tab === 'MINUS' && `Minus (${items.filter(i => i.isCounted && i.selisih < 0).length})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>No</th>
                  <th>Kode</th>
                  <th>Nama Sparepart / Barang Fisik</th>
                  <th>Lokasi Rak</th>
                  <th style={{ textAlign: 'right' }}>Qty Sistem</th>
                  <th style={{ textAlign: 'right', width: 140 }}>Qty Fisik</th>
                  <th style={{ textAlign: 'right' }}>Selisih</th>
                  <th style={{ textAlign: 'center' }}>Petugas</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => {
                  const selisih = item.selisih || 0;
                  let statusStyle: React.CSSProperties = {};
                  let selisihText = '0';

                  if (item.isCounted) {
                    if (selisih < 0) {
                      statusStyle = { color: '#dc2626', fontWeight: 800 };
                      selisihText = `${selisih} ${item.uom}`;
                    } else if (selisih > 0) {
                      statusStyle = { color: '#2563eb', fontWeight: 800 };
                      selisihText = `+${selisih} ${item.uom}`;
                    } else {
                      statusStyle = { color: '#16a34a', fontWeight: 700 };
                      selisihText = '0';
                    }
                  } else {
                    selisihText = 'Belum Hitung';
                  }

                  return (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center', color: 'var(--tx3)' }}>{idx + 1}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.sparepartId || '—'}</td>
                      <td>
                        <strong>{item.namaItem}</strong>
                      </td>
                      <td>{item.lokasi || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{item.qtySistem} {item.uom}</td>
                      <td style={{ textAlign: 'right' }}>
                        {isReadOnly ? (
                          <span style={{ fontWeight: 800 }}>{item.qtyFisik !== null ? `${item.qtyFisik} ${item.uom}` : '—'}</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            className="form-input"
                            style={{ width: 80, textAlign: 'center', padding: '4px 8px', display: 'inline-block' }}
                            value={item.qtyFisik !== null && item.qtyFisik !== undefined ? item.qtyFisik : ''}
                            placeholder="Hitung..."
                            onFocus={() => setFocusedItemId(item.id)}
                            onBlur={() => setFocusedItemId(null)}
                            onChange={(e) => {
                              const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                              handleUpdateCount(item.id, isNaN(val as number) ? null : val);
                            }}
                          />
                        )}
                      </td>
                      <td style={{ textAlign: 'right', ...statusStyle }}>
                        {selisihText}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--tx3)' }}>
                        {item.auditedBy || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
