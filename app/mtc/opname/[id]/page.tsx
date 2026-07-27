'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function MtcOpnameStandaloneDetailPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;

  const [session, setSession] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'MATCH' | 'PLUS' | 'MINUS'>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  // Multi-user technician name
  const [technicianName, setTechnicianName] = useState('');

  // Unlisted item modal
  const [showAddUnlistedModal, setShowAddUnlistedModal] = useState(false);
  const [unlistedNama, setUnlistedNama] = useState('');
  const [unlistedKategori, setUnlistedKategori] = useState('Umum');
  const [unlistedLokasi, setUnlistedLokasi] = useState('');
  const [unlistedUom, setUnlistedUom] = useState('Pcs');
  const [unlistedQtyFisik, setUnlistedQtyFisik] = useState<string>('1');
  const [unlistedHarga, setUnlistedHarga] = useState<string>('0');
  const [unlistedCatatan, setUnlistedCatatan] = useState('');
  const [unlistedCreateMaster, setUnlistedCreateMaster] = useState(true);
  const [addingUnlisted, setAddingUnlisted] = useState(false);

  // Status submitting & action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    // Load technician name from localStorage
    if (typeof window !== 'undefined') {
      const savedName = localStorage.getItem('mtc_opname_auditor_name') || '';
      setTechnicianName(savedName);
    }

    fetchOpnameDetail();

    // Auto refresh data every 8 seconds for real-time collaboration
    const timer = setInterval(() => {
      fetchOpnameDetail(false);
    }, 8000);

    return () => clearInterval(timer);
  }, [sessionId]);

  async function fetchOpnameDetail(showLoader = true) {
    if (showLoader) setLoading(true);
    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}`);
      const json = await res.json();
      if (json.success) {
        setSession(json.data.session);
        setStats(json.data.stats);
        setLocations(json.data.locations || []);
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

  // Atomic single item update
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

    // Optimistic UI update
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

  // Handle Adding Unlisted Item on-the-fly
  async function handleAddUnlistedItem(e: React.FormEvent) {
    e.preventDefault();
    if (!unlistedNama.trim()) {
      alert('Nama barang fisik wajib diisi!');
      return;
    }

    setAddingUnlisted(true);
    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}/item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namaItem: unlistedNama.trim(),
          kategori: unlistedKategori.trim(),
          lokasi: unlistedLokasi.trim(),
          uom: unlistedUom.trim(),
          qtyFisik: Math.max(0, parseInt(unlistedQtyFisik) || 1),
          harga: Math.max(0, parseFloat(unlistedHarga) || 0),
          catatan: unlistedCatatan.trim(),
          createMaster: unlistedCreateMaster
        })
      });
      const json = await res.json();
      if (json.success) {
        setShowAddUnlistedModal(false);
        setUnlistedNama('');
        setUnlistedCatatan('');
        setUnlistedQtyFisik('1');
        setUnlistedHarga('0');
        await fetchOpnameDetail(false);
        alert(json.data.msg || 'Barang tidak terdaftar berhasil ditambahkan!');
      } else {
        alert(`Gagal menambahkan barang: ${json.error}`);
      }
    } catch (e) {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setAddingUnlisted(false);
    }
  }

  // Submit for ACC (WAITING_APPROVAL)
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

  // Manager ACC & Post Adjustment
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

  // Filtered items
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

    if (activeTab === 'PENDING') return !item.isCounted;
    if (activeTab === 'MATCH') return item.isCounted && item.selisih === 0;
    if (activeTab === 'PLUS') return item.isCounted && item.selisih > 0;
    if (activeTab === 'MINUS') return item.isCounted && item.selisih < 0;

    return true;
  });

  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--tx3, #94a3b8)' }}>
        ⏳ Memuat form Stock Opname...
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>
        <h2>Sesi Stock Opname Tidak Ditemukan</h2>
        <Link href="/mtc/opname" style={{ color: '#a855f7', textDecoration: 'underline', marginTop: 16, display: 'inline-block' }}>
          ← Kembali ke Daftar Opname
        </Link>
      </div>
    );
  }

  const isReadOnly = session.status === 'POSTED';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg1, #0f172a)',
      color: 'var(--tx1, #f8fafc)',
      fontFamily: 'Inter, system-ui, sans-serif',
      paddingBottom: 110
    }}>
      {/* Sticky Navigation & Metadata Bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: '#1e293b',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: '12px 16px',
        marginBottom: 16,
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/mtc/opname" style={{ textDecoration: 'none', fontSize: 20, color: '#94a3b8' }}>
              ←
            </Link>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>{session.judul}</h2>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>#{session.id}</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                📍 {session.lokasi || 'Semua Rak Gudang'} · {stats?.countedItems}/{stats?.totalItems} Item ({stats?.progressPct}%)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {session.status === 'DRAFT' && (
              <span style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '4px 8px', fontSize: 10, fontWeight: 800, borderRadius: 10 }}>
                ⏳ DRAFT
              </span>
            )}
            {session.status === 'WAITING_APPROVAL' && (
              <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '4px 8px', fontSize: 10, fontWeight: 800, borderRadius: 10 }}>
                📤 MENUNGGU ACC
              </span>
            )}
            {session.status === 'POSTED' && (
              <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '4px 8px', fontSize: 10, fontWeight: 800, borderRadius: 10 }}>
                ✓ TER-POSTING
              </span>
            )}

            <Link href={`/mtc/opname/${sessionId}/print`} target="_blank" style={{ fontSize: 11, color: '#fff', background: 'rgba(255,255,255,0.1)', padding: '6px 12px', borderRadius: 8, textDecoration: 'none' }}>
              🖨️ Cetak
            </Link>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
          <div style={{
            width: `${stats?.progressPct || 0}%`,
            height: '100%',
            background: stats?.progressPct === 100 ? '#22c55e' : 'linear-gradient(90deg, #a855f7, #3b82f6)',
            transition: 'width 0.3s'
          }} />
        </div>
      </div>

      <div style={{ padding: '0 16px' }}>
        {/* Auditor Name Input Banner */}
        <div style={{
          padding: 14,
          marginBottom: 16,
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>👤</span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase' }}>Nama Teknisi Audit (Petugas Hitung)</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{technicianName || 'Belum diisi (Klik Set Nama)'}</div>
            </div>
          </div>

          <button
            onClick={() => {
              const name = prompt('Masukkan Nama Anda untuk dicatat di setiap item yang dihitung:', technicianName);
              if (name && name.trim()) {
                setTechnicianName(name.trim());
                if (typeof window !== 'undefined') {
                  localStorage.setItem('mtc_opname_auditor_name', name.trim());
                }
              }
            }}
            style={{
              padding: '6px 12px',
              fontSize: 11,
              borderRadius: 8,
              border: '1px solid #60a5fa',
              background: 'transparent',
              color: '#60a5fa',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            ✏️ Set / Ganti Nama
          </button>
        </div>

        {/* Audit Stats Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, textAlign: 'center', borderTop: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>🟢 SESUAI (0)</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#4ade80', marginTop: 2 }}>{stats?.totalMatchingCount}</div>
          </div>

          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, textAlign: 'center', borderTop: '3px solid #ef4444' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>🔴 MINUS (-QTY)</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#f87171', marginTop: 2 }}>-{stats?.totalMinusQty} Pcs</div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{fmtCurrency(stats?.totalMinusValue || 0)}</div>
          </div>

          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, textAlign: 'center', borderTop: '3px solid #3b82f6' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>🔵 PLUS (+QTY)</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#60a5fa', marginTop: 2 }}>+{stats?.totalPlusQty} Pcs</div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{fmtCurrency(stats?.totalPlusValue || 0)}</div>
          </div>

          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, textAlign: 'center', borderTop: '3px solid #a855f7' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>📊 NET VARIAN (RP)</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: (stats?.netVarianceValue || 0) < 0 ? '#f87171' : (stats?.netVarianceValue || 0) > 0 ? '#60a5fa' : '#4ade80', marginTop: 2 }}>
              {fmtCurrency(stats?.netVarianceValue || 0)}
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="🔍 Cari nama barang, kategori, atau kode Rak..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 13,
              borderRadius: 10,
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff'
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
              {[
                { id: 'ALL', label: `Semua (${stats?.totalItems})` },
                { id: 'PENDING', label: `Belum (${stats?.totalItems - stats?.countedItems})` },
                { id: 'MATCH', label: `Sesuai (${stats?.totalMatchingCount})` },
                { id: 'MINUS', label: `Minus (-)` },
                { id: 'PLUS', label: `Plus (+)` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    border: 'none',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    background: activeTab === tab.id ? '#fff' : '#1e293b',
                    color: activeTab === tab.id ? '#0f172a' : '#cbd5e1',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {locations.length > 0 && (
              <select
                value={selectedLocation}
                onChange={e => setSelectedLocation(e.target.value)}
                style={{
                  minWidth: 130,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 8,
                  background: '#1e293b',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff'
                }}
              >
                <option value="ALL">📍 Semua Rak ({locations.length})</option>
                {locations.map(loc => (
                  <option key={loc} value={loc}>📍 {loc}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Items Cards List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredItems.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 12 }}>
              <span style={{ fontSize: 32, display: 'block', marginBottom: 6 }}>🔍</span>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>Tidak ada item yang sesuai filter.</div>
            </div>
          ) : (
            filteredItems.map(item => {
              const isCounted = item.qtyFisik !== null && item.qtyFisik !== undefined;
              const selisih = item.selisih || 0;

              let cardBorder = '1px solid rgba(255,255,255,0.1)';
              let badgeTag = null;

              if (isCounted) {
                if (selisih === 0) {
                  cardBorder = '1px solid rgba(34, 197, 94, 0.4)';
                  badgeTag = (
                    <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '3px 8px', fontSize: 10, fontWeight: 800, borderRadius: 8 }}>
                      🟢 SESUAI
                    </span>
                  );
                } else if (selisih < 0) {
                  cardBorder = '1px solid rgba(239, 68, 68, 0.4)';
                  badgeTag = (
                    <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '3px 8px', fontSize: 10, fontWeight: 800, borderRadius: 8 }}>
                      🔴 MINUS ({selisih} {item.uom})
                    </span>
                  );
                } else {
                  cardBorder = '1px solid rgba(59, 130, 246, 0.4)';
                  badgeTag = (
                    <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '3px 8px', fontSize: 10, fontWeight: 800, borderRadius: 8 }}>
                      🔵 PLUS (+{selisih} {item.uom})
                    </span>
                  );
                }
              }

              return (
                <div
                  key={item.id}
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    border: cardBorder,
                    background: '#1e293b',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>{item.namaItem}</span>
                        {item.isNewItem && (
                          <span style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '2px 6px', fontSize: 9, fontWeight: 700, borderRadius: 6 }}>
                            ✨ BARANG TIDAK TERDAFTAR
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <span>📍 Rak: <strong style={{ color: '#fff' }}>{item.lokasi || 'Gudang MTC'}</strong></span>
                        <span>Kat: {item.kategori || 'Umum'}</span>
                        {item.sparepartId && <span>Kode: {item.sparepartId}</span>}
                      </div>
                    </div>

                    <div>{badgeTag}</div>
                  </div>

                  {/* Counter & Qty Controls */}
                  <div style={{
                    background: '#0f172a',
                    borderRadius: 12,
                    padding: 12,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Stok Sistem</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{item.qtySistem} <span style={{ fontSize: 10, color: '#94a3b8' }}>{item.uom}</span></div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        disabled={isReadOnly}
                        onClick={() => {
                          const current = item.qtyFisik !== null ? item.qtyFisik : item.qtySistem;
                          const next = Math.max(0, current - 1);
                          handleUpdateCount(item.id, next);
                        }}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: '#1e293b',
                          fontSize: 18,
                          fontWeight: 800,
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        -
                      </button>

                      <input
                        type="number"
                        disabled={isReadOnly}
                        placeholder="Input..."
                        value={item.qtyFisik !== null && item.qtyFisik !== undefined ? item.qtyFisik : ''}
                        onChange={e => {
                          const val = e.target.value === '' ? null : parseInt(e.target.value);
                          handleUpdateCount(item.id, val);
                        }}
                        style={{
                          width: 75,
                          height: 40,
                          textAlign: 'center',
                          fontWeight: 900,
                          fontSize: 16,
                          borderRadius: 10,
                          border: isCounted ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.15)',
                          background: '#0f172a',
                          color: '#fff'
                        }}
                      />

                      <button
                        disabled={isReadOnly}
                        onClick={() => {
                          const current = item.qtyFisik !== null ? item.qtyFisik : item.qtySistem;
                          const next = current + 1;
                          handleUpdateCount(item.id, next);
                        }}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: '#1e293b',
                          fontSize: 18,
                          fontWeight: 800,
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 11 }}>
                    <div style={{ color: '#94a3b8' }}>
                      {item.auditedBy ? (
                        <span>👤 Dihitung oleh: <strong style={{ color: '#fff' }}>{item.auditedBy}</strong></span>
                      ) : (
                        <span style={{ fontStyle: 'italic' }}>Belum diperiksa</span>
                      )}
                    </div>

                    {!isReadOnly && (
                      <button
                        onClick={() => {
                          const note = prompt('Masukkan catatan/alasan selisih untuk item ini:', item.catatan || '');
                          if (note !== null) {
                            handleUpdateCount(item.id, item.qtyFisik, note);
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: '#c084fc', fontSize: 11, cursor: 'pointer', padding: 0 }}
                      >
                        💬 {item.catatan ? `Catatan: "${item.catatan}"` : '+ Tambah Catatan'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Floating Action Buttons */}
      {!isReadOnly && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          left: 16,
          right: 16,
          display: 'flex',
          gap: 10,
          zIndex: 99,
          justifyContent: 'center'
        }}>
          <button
            onClick={() => setShowAddUnlistedModal(true)}
            style={{
              flex: 1,
              maxWidth: 240,
              padding: '12px 14px',
              fontSize: 12,
              fontWeight: 800,
              borderRadius: 30,
              background: '#334155',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)'
            }}
          >
            ➕ Barang Tidak Terdaftar
          </button>

          {session.status === 'DRAFT' && (
            <button
              onClick={handleSubmitForApproval}
              disabled={actionLoading === 'submit-approval'}
              style={{
                flex: 1,
                maxWidth: 240,
                padding: '12px 14px',
                fontSize: 12,
                fontWeight: 800,
                borderRadius: 30,
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(168, 85, 247, 0.4)'
              }}
            >
              {actionLoading === 'submit-approval' ? '⏳ Mengajukan...' : '📤 Ajukan ke Manager'}
            </button>
          )}

          {session.status === 'WAITING_APPROVAL' && (
            <button
              onClick={handleAccAndPost}
              disabled={actionLoading === 'post-opname'}
              style={{
                flex: 1,
                maxWidth: 260,
                padding: '12px 14px',
                fontSize: 12,
                fontWeight: 800,
                borderRadius: 30,
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(34, 197, 94, 0.4)'
              }}
            >
              {actionLoading === 'post-opname' ? '⏳ Posting...' : '✓ ACC & Post Adjustment'}
            </button>
          )}
        </div>
      )}

      {/* Modal Add Unlisted Physical Item */}
      {showAddUnlistedModal && (
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
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: 480, padding: 20, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>➕ Tambah Barang Tidak Terdaftar</h3>
              <button onClick={() => setShowAddUnlistedModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleAddUnlistedItem}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>
                  Nama Barang Fisik di Rak <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Bearing SKF 6204 2RS"
                  value={unlistedNama}
                  onChange={e => setUnlistedNama(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Kategori</label>
                  <input
                    type="text"
                    placeholder="Bearing, Seal, dll"
                    value={unlistedKategori}
                    onChange={e => setUnlistedKategori(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Lokasi / Kode Rak</label>
                  <input
                    type="text"
                    placeholder="Rak A1, B3, dll"
                    value={unlistedLokasi}
                    onChange={e => setUnlistedLokasi(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Jumlah Fisik (Qty)</label>
                  <input
                    type="number"
                    min="1"
                    value={unlistedQtyFisik}
                    onChange={e => setUnlistedQtyFisik(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                  />
                </div>

                <div>
                  <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Satuan (UoM)</label>
                  <input
                    type="text"
                    placeholder="Pcs, Set, Roll"
                    value={unlistedUom}
                    onChange={e => setUnlistedUom(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Estimasi Harga Satuan (Rp)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={unlistedHarga}
                  onChange={e => setUnlistedHarga(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Catatan / Alasan</label>
                <input
                  type="text"
                  placeholder="Barang sisa project / baru ditemukan..."
                  value={unlistedCatatan}
                  onChange={e => setUnlistedCatatan(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                />
              </div>

              <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="chkCreateMasterStandalone"
                  checked={unlistedCreateMaster}
                  onChange={e => setUnlistedCreateMaster(e.target.checked)}
                />
                <label htmlFor="chkCreateMasterStandalone" style={{ fontSize: 11, cursor: 'pointer', color: '#cbd5e1' }}>
                  Otomatis daftarkan juga ke Master Sparepart MTC
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={() => setShowAddUnlistedModal(false)} style={{ padding: '8px 16px', background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }} disabled={addingUnlisted}>
                  Batal
                </button>
                <button type="submit" style={{ padding: '8px 16px', background: '#a855f7', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }} disabled={addingUnlisted}>
                  {addingUnlisted ? '⏳ Menyimpan...' : '➕ Tambahkan ke Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
