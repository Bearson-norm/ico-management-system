'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function MtcOpnameDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
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
  const [unlistedQtyFisik, setUnlistedQtyFisik] = useState(1);
  const [unlistedHarga, setUnlistedHarga] = useState(0);
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

    // Auto refresh data every 10 seconds for real-time collaboration
    const timer = setInterval(() => {
      fetchOpnameDetail(false);
    }, 10000);

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
          qtyFisik: unlistedQtyFisik,
          harga: unlistedHarga,
          catatan: unlistedCatatan.trim(),
          createMaster: unlistedCreateMaster
        })
      });
      const json = await res.json();
      if (json.success) {
        setShowAddUnlistedModal(false);
        setUnlistedNama('');
        setUnlistedCatatan('');
        setUnlistedQtyFisik(1);
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
    // 1. Search text
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = item.namaItem?.toLowerCase().includes(q);
      const matchKat = item.kategori?.toLowerCase().includes(q);
      const matchLok = item.lokasi?.toLowerCase().includes(q);
      const matchSp = item.sparepartId?.toLowerCase().includes(q);
      if (!matchName && !matchKat && !matchLok && !matchSp) return false;
    }

    // 2. Location Filter
    if (selectedLocation !== 'ALL') {
      if ((item.lokasi || '') !== selectedLocation) return false;
    }

    // 3. Tab Status Filter
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
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--tx3)' }}>
        ⏳ Memuat form Stock Opname...
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Sesi Stock Opname Tidak Ditemukan</h2>
        <Link href="/mtc/opname" className="btn btn-primary" style={{ marginTop: 16 }}>
          ← Kembali ke Daftar Opname
        </Link>
      </div>
    );
  }

  const isReadOnly = session.status === 'POSTED';

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Sticky Navigation & Metadata Bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--bdr)',
        padding: '12px 16px',
        marginBottom: 16,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/mtc/opname" style={{ textDecoration: 'none', fontSize: 18, color: 'var(--tx2)' }}>
              ←
            </Link>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{session.judul}</h2>
                <span style={{ fontSize: 11, color: 'var(--tx3)' }}>#{session.id}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                📍 {session.lokasi || 'Semua Rak Gudang'} · {stats?.countedItems}/{stats?.totalItems} Item Di-audit ({stats?.progressPct}%)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {session.status === 'DRAFT' && (
              <span className="badge badge-ylw" style={{ padding: '4px 8px', fontSize: 10, fontWeight: 800 }}>
                ⏳ DRAFT (Hitung Fisik)
              </span>
            )}
            {session.status === 'WAITING_APPROVAL' && (
              <span className="badge badge-pur" style={{ padding: '4px 8px', fontSize: 10, fontWeight: 800, background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7' }}>
                📤 MENUNGGU ACC MANAGER
              </span>
            )}
            {session.status === 'POSTED' && (
              <span className="badge badge-grn" style={{ padding: '4px 8px', fontSize: 10, fontWeight: 800 }}>
                ✓ TER-POSTING (SELESAI)
              </span>
            )}

            <Link href={`/mtc/opname/${sessionId}/print`} target="_blank" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>
              🖨️ Cetak
            </Link>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: 4, background: 'var(--bg3)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
          <div style={{
            width: `${stats?.progressPct || 0}%`,
            height: '100%',
            background: stats?.progressPct === 100 ? 'var(--grn)' : 'linear-gradient(90deg, #a855f7, #3b82f6)',
            transition: 'width 0.3s'
          }} />
        </div>
      </div>

      {/* Auditor Name Input Banner */}
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>👤</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blu)', textTransform: 'uppercase' }}>Nama Teknisi Audit (Petugas Hitung)</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx1)' }}>{technicianName || 'Belum diisi (Klik Set Nama)'}</div>
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
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 11, borderColor: 'var(--blu)', color: 'var(--blu)' }}
        >
          ✏️ Set / Ganti Nama Teknisi
        </button>
      </div>

      {/* Audit Stats Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div className="card" style={{ padding: 12, textAlign: 'center', borderTop: '3px solid var(--grn)' }}>
          <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700 }}>🟢 SESUAI (0)</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--grn)', marginTop: 2 }}>{stats?.totalMatchingCount}</div>
        </div>

        <div className="card" style={{ padding: 12, textAlign: 'center', borderTop: '3px solid var(--red)' }}>
          <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700 }}>🔴 MINUS (-QTY)</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--red)', marginTop: 2 }}>-{stats?.totalMinusQty} Pcs</div>
          <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>{fmtCurrency(stats?.totalMinusValue || 0)}</div>
        </div>

        <div className="card" style={{ padding: 12, textAlign: 'center', borderTop: '3px solid #3b82f6' }}>
          <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700 }}>🔵 PLUS (+QTY)</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#3b82f6', marginTop: 2 }}>+{stats?.totalPlusQty} Pcs</div>
          <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>{fmtCurrency(stats?.totalPlusValue || 0)}</div>
        </div>

        <div className="card" style={{ padding: 12, textAlign: 'center', borderTop: '3px solid #a855f7' }}>
          <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700 }}>📊 NET VARIAN (RP)</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: (stats?.netVarianceValue || 0) < 0 ? 'var(--red)' : (stats?.netVarianceValue || 0) > 0 ? '#3b82f6' : 'var(--grn)', marginTop: 2 }}>
            {fmtCurrency(stats?.netVarianceValue || 0)}
          </div>
        </div>
      </div>

      {/* Filter Toolbar (Mobile Optimized Tabs) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        {/* Search Input */}
        <input
          type="text"
          className="form-input"
          placeholder="🔍 Cari nama barang, kategori, atau kode Rak..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', fontSize: 13 }}
        />

        {/* Tab Filters & Location Select */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {/* Status Tabs */}
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
                  background: activeTab === tab.id ? 'var(--tx1)' : 'var(--bg2)',
                  color: activeTab === tab.id ? 'var(--bg1)' : 'var(--tx2)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Rak / Location Dropdown */}
          {locations.length > 0 && (
            <select
              className="form-input form-select"
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              style={{ width: 'auto', minWidth: 140, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}
            >
              <option value="ALL">📍 Semua Rak ({locations.length})</option>
              {locations.map(loc => (
                <option key={loc} value={loc}>📍 {loc}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Items Cards List (Mobile Touch Friendly) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredItems.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', border: '2px dashed var(--bdr)', borderRadius: 12 }}>
            <span style={{ fontSize: 32, display: 'block', marginBottom: 6 }}>🔍</span>
            <div style={{ color: 'var(--tx3)', fontSize: 13 }}>Tidak ada item yang sesuai filter.</div>
          </div>
        ) : (
          filteredItems.map(item => {
            const isCounted = item.qtyFisik !== null && item.qtyFisik !== undefined;
            const selisih = item.selisih || 0;

            let cardBorder = '1px solid var(--bdr)';
            let badgeTag = null;

            if (isCounted) {
              if (selisih === 0) {
                cardBorder = '1px solid rgba(34, 197, 94, 0.4)';
                badgeTag = (
                  <span className="badge badge-grn" style={{ padding: '3px 8px', fontSize: 10, fontWeight: 800 }}>
                    🟢 SESUAI
                  </span>
                );
              } else if (selisih < 0) {
                cardBorder = '1px solid rgba(239, 68, 68, 0.4)';
                badgeTag = (
                  <span className="badge badge-red" style={{ padding: '3px 8px', fontSize: 10, fontWeight: 800 }}>
                    🔴 MINUS ({selisih} {item.uom})
                  </span>
                );
              } else {
                cardBorder = '1px solid rgba(59, 130, 246, 0.4)';
                badgeTag = (
                  <span className="badge badge-blu" style={{ padding: '3px 8px', fontSize: 10, fontWeight: 800 }}>
                    🔵 PLUS (+{selisih} {item.uom})
                  </span>
                );
              }
            }

            return (
              <div
                key={item.id}
                className="card"
                style={{
                  padding: 16,
                  borderRadius: 14,
                  border: cardBorder,
                  background: isCounted ? 'rgba(255,255,255,0.01)' : 'var(--bg2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}
              >
                {/* Item Top Info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx1)' }}>{item.namaItem}</span>
                      {item.isNewItem && (
                        <span className="badge badge-ylw" style={{ padding: '2px 6px', fontSize: 9, fontWeight: 700 }}>
                          ✨ BARANG TIDAK TERDAFTAR
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <span>📍 Rak: <strong style={{ color: 'var(--tx1)' }}>{item.lokasi || 'Gudang MTC'}</strong></span>
                      <span>Kat: {item.kategori || 'Umum'}</span>
                      {item.sparepartId && <span>Kode: {item.sparepartId}</span>}
                    </div>
                  </div>

                  <div>{badgeTag}</div>
                </div>

                {/* Counter & Qty Controls (Mobile Thumb Steppers) */}
                <div style={{
                  background: 'var(--bg3)',
                  borderRadius: 12,
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase' }}>Stok Sistem</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{item.qtySistem} <span style={{ fontSize: 10, color: 'var(--tx3)' }}>{item.uom}</span></div>
                  </div>

                  {/* Physical Count Stepper Input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      disabled={isReadOnly}
                      onClick={() => {
                        const current = item.qtyFisik !== null ? item.qtyFisik : item.qtySistem;
                        const next = Math.max(0, current - 1);
                        handleUpdateCount(item.id, next);
                      }}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        border: '1px solid var(--bdr)',
                        background: 'var(--bg1)',
                        fontSize: 18,
                        fontWeight: 800,
                        color: 'var(--tx1)',
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
                        width: 70,
                        height: 38,
                        textAlign: 'center',
                        fontWeight: 900,
                        fontSize: 16,
                        borderRadius: 10,
                        border: isCounted ? '2px solid var(--tx1)' : '1px solid var(--bdr)',
                        background: 'var(--bg1)',
                        color: 'var(--tx1)'
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
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        border: '1px solid var(--bdr)',
                        background: 'var(--bg1)',
                        fontSize: 18,
                        fontWeight: 800,
                        color: 'var(--tx1)',
                        cursor: 'pointer'
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Auditor Badge & Notes */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, fontSize: 11 }}>
                  <div style={{ color: 'var(--tx3)' }}>
                    {item.auditedBy ? (
                      <span>👤 Dihitung oleh: <strong style={{ color: 'var(--tx1)' }}>{item.auditedBy}</strong></span>
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
                      style={{ background: 'none', border: 'none', color: '#a855f7', fontSize: 11, cursor: 'pointer', padding: 0 }}
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

      {/* Floating Action Buttons for Mobile */}
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
            className="btn btn-secondary"
            style={{
              flex: 1,
              maxWidth: 240,
              padding: '12px 14px',
              fontSize: 12,
              fontWeight: 800,
              borderRadius: 30,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
            }}
          >
            ➕ Barang Tidak Terdaftar
          </button>

          {session.status === 'DRAFT' && (
            <button
              onClick={handleSubmitForApproval}
              disabled={actionLoading === 'submit-approval'}
              className="btn btn-primary"
              style={{
                flex: 1,
                maxWidth: 240,
                padding: '12px 14px',
                fontSize: 12,
                fontWeight: 800,
                borderRadius: 30,
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                border: 'none',
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
              className="btn btn-primary"
              style={{
                flex: 1,
                maxWidth: 260,
                padding: '12px 14px',
                fontSize: 12,
                fontWeight: 800,
                borderRadius: 30,
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                border: 'none',
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
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: 20, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>➕ Tambah Barang Tidak Terdaftar</h3>
              <button onClick={() => setShowAddUnlistedModal(false)} className="btn btn-ghost btn-sm" style={{ fontSize: 16 }}>✕</button>
            </div>

            <form onSubmit={handleAddUnlistedItem}>
              <div style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>
                  Nama Barang Fisik di Rak <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Bearing SKF 6204 2RS (Tidak ada di list)"
                  value={unlistedNama}
                  onChange={e => setUnlistedNama(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Kategori</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Bearing, Seal, dll"
                    value={unlistedKategori}
                    onChange={e => setUnlistedKategori(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Lokasi / Kode Rak</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Rak A1, B3, dll"
                    value={unlistedLokasi}
                    onChange={e => setUnlistedLokasi(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Jumlah Fisik (Qty)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={unlistedQtyFisik}
                    onChange={e => setUnlistedQtyFisik(parseInt(e.target.value) || 1)}
                    required
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Satuan (UoM)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Pcs, Set, Roll"
                    value={unlistedUom}
                    onChange={e => setUnlistedUom(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Estimasi Harga Satuan (Rp)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="0"
                  value={unlistedHarga}
                  onChange={e => setUnlistedHarga(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Catatan / Alasan</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Barang sisa project / baru ditemukan..."
                  value={unlistedCatatan}
                  onChange={e => setUnlistedCatatan(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="chkCreateMaster"
                  checked={unlistedCreateMaster}
                  onChange={e => setUnlistedCreateMaster(e.target.checked)}
                />
                <label htmlFor="chkCreateMaster" style={{ fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  Otomatis daftarkan juga ke Master Sparepart MTC
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={() => setShowAddUnlistedModal(false)} className="btn btn-ghost" disabled={addingUnlisted}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={addingUnlisted}>
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
