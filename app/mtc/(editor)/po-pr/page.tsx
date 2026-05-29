'use client';
import { useState, useEffect, useRef, useMemo } from 'react';

type Sparepart = {
  id: string;
  nama: string;
  kategoriId: number | null;
  kategori?: { nama: string } | null;
  uom: string;
  lokasi: string | null;
  harga: number;
  minQty: number;
  maxLeadTime: number;
  avgLeadTime: number;
  aktif: boolean;
  purchasingStatus: 'NONE' | 'PR' | 'PO';
  purchasingQty: number;
  prDate: string | null;
  poDate: string | null;
  currentStock: number;
};

export default function ProcurementPage() {
  const [spareparts, setSpareparts] = useState<Sparepart[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Search & input form state
  const [searchText, setSearchText] = useState('');
  const [selectedSp, setSelectedSp] = useState<Sparepart | null>(null);
  const [targetStatus, setTargetStatus] = useState<'PR' | 'PO'>('PR');
  const [purchasingQty, setPurchasingQty] = useState<number>(1);
  const [showDropdown, setShowDropdown] = useState(false);

  // Tabs state
  const [activeTab, setActiveTab] = useState<'PR' | 'PO'>('PR');

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/mtc/master/sparepart');
      const json = await res.json();
      if (json.success) {
        setSpareparts(json.data || []);
      }
    } catch (e) {
      console.error('Gagal mengambil data sparepart', e);
    } finally {
      setLoading(false);
    }
  }

  // Filter spareparts for autocomplete search (only show active and not in PR/PO status unless they choose it)
  const filteredSuggestions = useMemo(() => {
    if (!searchText.trim()) {
      return spareparts.filter(sp => sp.aktif && sp.purchasingStatus === 'NONE').slice(0, 10);
    }
    const q = searchText.toLowerCase();
    return spareparts
      .filter(sp => sp.aktif &&
        (sp.nama.toLowerCase().includes(q) ||
         sp.id.toLowerCase().includes(q) ||
         (sp.lokasi && sp.lokasi.toLowerCase().includes(q)))
      )
      .slice(0, 10);
  }, [searchText, spareparts]);

  // Items currently under PR
  const prItems = useMemo(() => {
    return spareparts.filter(sp => sp.purchasingStatus === 'PR');
  }, [spareparts]);

  // Items currently under PO
  const poItems = useMemo(() => {
    return spareparts.filter(sp => sp.purchasingStatus === 'PO');
  }, [spareparts]);

  const totalPrEstimasi = useMemo(() => {
    return prItems.reduce((sum, item) => sum + ((Number(item.harga) || 0) * (item.purchasingQty || 1)), 0);
  }, [prItems]);

  const totalPoEstimasi = useMemo(() => {
    return poItems.reduce((sum, item) => sum + ((Number(item.harga) || 0) * (item.purchasingQty || 1)), 0);
  }, [poItems]);

  async function updateStatus(itemId: string, newStatus: 'NONE' | 'PR' | 'PO', qty?: number) {
    setActionLoading(itemId);
    try {
      const res = await fetch('/api/mtc/master/sparepart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: itemId, 
          purchasingStatus: newStatus,
          ...(qty !== undefined ? { purchasingQty: qty } : {})
        }),
      });
      const json = await res.json();
      if (json.success) {
        // Success notification or reload data
        await fetchData();
        // Clear input form if it was the selected sparepart
        if (selectedSp && selectedSp.id === itemId) {
          setSelectedSp(null);
          setSearchText('');
        }
      } else {
        alert('Gagal memperbarui status pengadaan: ' + (json.message || 'Error'));
      }
    } catch (e) {
      alert('Terjadi kesalahan koneksi');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAddProcurement(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSp) {
      alert('Silakan pilih suku cadang terlebih dahulu');
      return;
    }
    await updateStatus(selectedSp.id, targetStatus, purchasingQty);
    // Switch to appropriate tab
    setActiveTab(targetStatus);
    // Reset Qty to 1
    setPurchasingQty(1);
  }

  function fmtRupiah(value: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  function getDaysElapsed(dateStr: string | null): number {
    if (!dateStr) return 0;
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return Math.max(0, parseFloat(diffDays.toFixed(1)));
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">⏳ Manajemen PO & PR</div>
        <div className="page-sub">Form pencatatan pengadaan, estimasi lead time, dan pemantauan status barang masuk.</div>
      </div>

      <div className="page-body">
        
        {/* STATS OVERVIEW CARDS */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card stat-ylw" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('PR')}>
            <div className="stat-label">Barang Sedang PR</div>
            <div className="stat-value">{prItems.length}</div>
            <div className="stat-sub">Nilai Estimasi: <span style={{ fontWeight: 700 }}>{fmtRupiah(totalPrEstimasi)}</span></div>
          </div>
          <div className="stat-card stat-blu" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('PO')}>
            <div className="stat-label">Barang Sudah PO</div>
            <div className="stat-value">{poItems.length}</div>
            <div className="stat-sub">Nilai Estimasi: <span style={{ fontWeight: 700 }}>{fmtRupiah(totalPoEstimasi)}</span></div>
          </div>
          <div className="stat-card stat-grn">
            <div className="stat-label">Total Pengadaan Aktif</div>
            <div className="stat-value" style={{ color: 'var(--grn)' }}>{prItems.length + poItems.length}</div>
            <div className="stat-sub">Membantu kalkulasi lead-time kedatangan</div>
          </div>
        </div>

        {/* INPUT PO & PR FORM CARD */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header" style={{ borderBottom: '1px solid var(--br)' }}>
            <div className="card-title">📝 Input Transaksi Pengadaan Baru</div>
          </div>
          <div style={{ padding: '24px 20px' }}>
            <form onSubmit={handleAddProcurement} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.6fr', gap: '20px' }} className="po-pr-form">
              {/* Autocomplete Sparepart Input */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }} ref={dropdownRef}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>
                  Cari Suku Cadang <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <div className="search-bar" style={{ width: '100%', marginBottom: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Ketik Nama, ID, atau Lokasi Suku Cadang..."
                    value={searchText}
                    onChange={(e) => {
                      setSearchText(e.target.value);
                      setSelectedSp(null);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                  />
                  {searchText && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchText('');
                        setSelectedSp(null);
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 18 }}
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Suggestions List */}
                {showDropdown && filteredSuggestions.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'var(--sf3)',
                      border: '1px solid var(--br)',
                      borderRadius: 8,
                      boxShadow: 'var(--shadow)',
                      zIndex: 100,
                      maxHeight: 280,
                      overflowY: 'auto',
                      marginTop: 4,
                    }}
                  >
                    {filteredSuggestions.map((sp) => (
                      <div
                        key={sp.id}
                        onClick={() => {
                          setSelectedSp(sp);
                          setSearchText(sp.nama);
                          setShowDropdown(false);
                        }}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--br)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'background 0.15s ease',
                        }}
                        className="suggestion-item"
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--sf2)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{sp.nama}</div>
                          <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                            ID: <span className="text-mono">{sp.id}</span> · SLOC: <span className="badge badge-blu" style={{ padding: '1px 5px', fontSize: 8 }}>{sp.lokasi || '—'}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: sp.currentStock <= sp.minQty ? 'var(--red)' : 'var(--grn)' }}>
                            Stok: {sp.currentStock} {sp.uom}
                          </div>
                          {sp.purchasingStatus !== 'NONE' && (
                            <span
                              className={`badge ${sp.purchasingStatus === 'PR' ? 'badge-ylw' : 'badge-blu'}`}
                              style={{ fontSize: 8, marginTop: 4, display: 'inline-block' }}
                            >
                              {sp.purchasingStatus === 'PR' ? '⏳ Sedang PR' : '📦 Sudah PO'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showDropdown && searchText.trim() && filteredSuggestions.length === 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'var(--sf3)',
                      border: '1px solid var(--br)',
                      borderRadius: 8,
                      padding: '14px',
                      color: 'var(--tx3)',
                      textAlign: 'center',
                      zIndex: 100,
                      marginTop: 4,
                    }}
                  >
                    Tidak ada suku cadang cocok ditemukan
                  </div>
                )}
              </div>

              {/* Status & Submit controls */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>
                  Set Status Pengadaan <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', height: '40px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="purchasingStatus"
                      checked={targetStatus === 'PR'}
                      onChange={() => setTargetStatus('PR')}
                      style={{ transform: 'scale(1.1)', cursor: 'pointer' }}
                    />
                    ⏳ Masukkan ke PR (Requisition)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="purchasingStatus"
                      checked={targetStatus === 'PO'}
                      onChange={() => setTargetStatus('PO')}
                      style={{ transform: 'scale(1.1)', cursor: 'pointer' }}
                    />
                    📦 Masukkan ke PO (Purchase Order)
                  </label>
                </div>
              </div>

              {/* Jumlah / Qty Pengadaan */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>
                  Jumlah / Qty <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  className="form-input"
                  value={purchasingQty}
                  onChange={(e) => setPurchasingQty(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ height: '40px' }}
                />
              </div>

              {/* Detail Selected Sparepart Summary */}
              {selectedSp && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    background: 'var(--sf2)',
                    border: '1px solid var(--br)',
                    borderRadius: 8,
                    padding: '16px 20px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 16,
                    marginTop: 10,
                    animation: 'fadeIn 0.2s ease-out',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>Suku Cadang terpilih</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx)', marginTop: 4 }}>{selectedSp.nama}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>ID: {selectedSp.id}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>Stok Saat Ini</div>
                    <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: selectedSp.currentStock <= selectedSp.minQty ? 'var(--red)' : 'var(--grn)' }}>
                      {selectedSp.currentStock} {selectedSp.uom}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>Safety Limit: {selectedSp.minQty} {selectedSp.uom}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>Lokasi & Harga</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--tx)', marginTop: 4 }}>{selectedSp.lokasi || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>{fmtRupiah(selectedSp.harga)} / Unit</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>Rata-rata Waktu Datang</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--pur)', marginTop: 4 }}>{selectedSp.avgLeadTime > 0 ? `${selectedSp.avgLeadTime.toFixed(1)} Hari` : 'Belum tercatat'}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>Maks lead time: {selectedSp.maxLeadTime} Hari</div>
                  </div>
                </div>
              )}

              {/* Submit & Reset actions */}
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                {selectedSp && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setSelectedSp(null);
                      setSearchText('');
                    }}
                  >
                    Batal
                  </button>
                )}
                <button
                  type="submit"
                  className="btn btn-pur"
                  disabled={!selectedSp || actionLoading !== null}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px' }}
                >
                  {actionLoading !== null ? 'Memproses...' : `Simpan ke ${targetStatus}`}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* TABS COMPONENT FOR LISTING */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title">📝 Daftar Pemantauan Pengadaan Aktif</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="badge badge-ylw">{prItems.length} Menunggu PR</span>
                <span className="badge badge-blu">{poItems.length} Menunggu PO</span>
              </div>
            </div>
            
            {/* Custom Premium Tabs Navigation */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--sf2)', padding: 4, borderRadius: 8, alignSelf: 'flex-start' }}>
              <button
                type="button"
                onClick={() => setActiveTab('PR')}
                style={{
                  padding: '8px 20px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeTab === 'PR' ? 'var(--ylw-d)' : 'transparent',
                  color: activeTab === 'PR' ? 'var(--ylw)' : 'var(--tx2)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                ⏳ Barang Sedang PR ({prItems.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('PO')}
                style={{
                  padding: '8px 20px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeTab === 'PO' ? 'var(--blu-d)' : 'transparent',
                  color: activeTab === 'PO' ? 'var(--blu)' : 'var(--tx2)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                📦 Barang Sudah PO ({poItems.length})
              </button>
            </div>
          </div>

          {/* TAB CONTENTS */}
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            {activeTab === 'PR' ? (
              <table>
                <thead>
                  <tr>
                    <th>Item ID</th>
                    <th>Nama Suku Cadang</th>
                    <th style={{ textAlign: 'center' }}>Qty PR</th>
                    <th>SLOC</th>
                    <th>Stok Saat Ini</th>
                    <th>Estimasi Biaya</th>
                    <th>Tanggal PR</th>
                    <th style={{ textAlign: 'center' }}>Hari Berjalan</th>
                    <th style={{ textAlign: 'center' }}>Status / Lead-Time</th>
                    <th style={{ textAlign: 'right' }}>Aksi Kelola</th>
                  </tr>
                </thead>
                <tbody>
                  {prItems.map((sp) => {
                    const elapsed = getDaysElapsed(sp.prDate);
                    const avg = sp.avgLeadTime;
                    const isOverdue = (avg > 0 && elapsed > avg);
                    return (
                      <tr key={sp.id}>
                        <td className="text-mono text-tiny text-muted">{sp.id}</td>
                        <td style={{ fontWeight: 600 }}>{sp.nama}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>
                          <span className="badge badge-pur" style={{ fontSize: 11, padding: '4px 10px' }}>
                            {sp.purchasingQty || 1} {sp.uom}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-blu" style={{ fontSize: 10 }}>{sp.lokasi || '—'}</span>
                        </td>
                        <td style={{ fontWeight: 700, color: sp.currentStock <= sp.minQty ? 'var(--red)' : 'var(--tx)' }}>
                          {sp.currentStock} {sp.uom} <span className="text-tiny text-muted" style={{ fontWeight: 400 }}>/ min {sp.minQty}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          <div>{fmtRupiah((Number(sp.harga) || 0) * (sp.purchasingQty || 1))}</div>
                          {(sp.purchasingQty || 1) > 1 && (
                            <div style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 400 }}>
                              {sp.purchasingQty} x {fmtRupiah(sp.harga)}
                            </div>
                          )}
                        </td>
                        <td className="text-tiny">
                          {sp.prDate ? new Date(sp.prDate).toLocaleString('id-ID', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          }) : '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: isOverdue ? 'var(--red)' : 'var(--tx)' }}>
                          {elapsed} Hari
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isOverdue ? (
                            <span className="badge badge-red" style={{ fontSize: 9, padding: '2px 8px', fontWeight: 800 }}>
                              ⚠️ Overdue ({elapsed} &gt; {avg.toFixed(1)}d)
                            </span>
                          ) : avg > 0 ? (
                            <span className="badge badge-grn" style={{ fontSize: 9, padding: '2px 8px', fontWeight: 700 }}>
                              ✓ On Track (Avg {avg.toFixed(1)}d)
                            </span>
                          ) : (
                            <span className="badge badge-pur" style={{ fontSize: 9, padding: '2px 8px' }}>
                              Lead-time Baru
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 8 }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => updateStatus(sp.id, 'NONE')}
                              disabled={actionLoading !== null}
                              style={{ color: 'var(--red)' }}
                            >
                              Batal PR
                            </button>
                            <button
                              type="button"
                              className="btn btn-blu btn-sm"
                              onClick={() => updateStatus(sp.id, 'PO', sp.purchasingQty)}
                              disabled={actionLoading !== null}
                              style={{ padding: '4px 10px', fontSize: 11 }}
                            >
                              📦 Upgrade ke PO
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {prItems.length === 0 && !loading && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>⏳</div>
                        <div>Tidak ada suku cadang dalam tahap PR (Requisition).</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Item ID</th>
                    <th>Nama Suku Cadang</th>
                    <th style={{ textAlign: 'center' }}>Qty PO</th>
                    <th>SLOC</th>
                    <th>Stok Saat Ini</th>
                    <th>Estimasi Biaya</th>
                    <th>Tanggal PO</th>
                    <th style={{ textAlign: 'center' }}>Hari Berjalan</th>
                    <th style={{ textAlign: 'center' }}>Histori Lead-Time</th>
                    <th style={{ textAlign: 'right' }}>Aksi Kelola</th>
                  </tr>
                </thead>
                <tbody>
                  {poItems.map((sp) => {
                    const elapsed = getDaysElapsed(sp.poDate);
                    const avg = sp.avgLeadTime;
                    const isOverdue = (avg > 0 && elapsed > avg);
                    return (
                      <tr key={sp.id}>
                        <td className="text-mono text-tiny text-muted">{sp.id}</td>
                        <td style={{ fontWeight: 600 }}>{sp.nama}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>
                          <span className="badge badge-pur" style={{ fontSize: 11, padding: '4px 10px' }}>
                            {sp.purchasingQty || 1} {sp.uom}
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-blu" style={{ fontSize: 10 }}>{sp.lokasi || '—'}</span>
                        </td>
                        <td style={{ fontWeight: 700, color: sp.currentStock <= sp.minQty ? 'var(--red)' : 'var(--tx)' }}>
                          {sp.currentStock} {sp.uom} <span className="text-tiny text-muted" style={{ fontWeight: 400 }}>/ min {sp.minQty}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          <div>{fmtRupiah((Number(sp.harga) || 0) * (sp.purchasingQty || 1))}</div>
                          {(sp.purchasingQty || 1) > 1 && (
                            <div style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 400 }}>
                              {sp.purchasingQty} x {fmtRupiah(sp.harga)}
                            </div>
                          )}
                        </td>
                        <td className="text-tiny">
                          {sp.poDate ? new Date(sp.poDate).toLocaleString('id-ID', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          }) : '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: isOverdue ? 'var(--red)' : 'var(--tx)' }}>
                          {elapsed} Hari
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isOverdue ? (
                            <span className="badge badge-red" style={{ fontSize: 9, padding: '2px 8px', fontWeight: 800 }}>
                              ⚠️ Overdue ({elapsed} &gt; {avg.toFixed(1)}d)
                            </span>
                          ) : avg > 0 ? (
                            <span className="badge badge-grn" style={{ fontSize: 9, padding: '2px 8px', fontWeight: 700 }}>
                              ✓ On Track (Avg {avg.toFixed(1)}d)
                            </span>
                          ) : (
                            <span className="badge badge-pur" style={{ fontSize: 9, padding: '2px 8px' }}>
                              Lead-time Baru
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => updateStatus(sp.id, 'NONE')}
                            disabled={actionLoading !== null}
                            style={{ color: 'var(--red)' }}
                          >
                            Batal PO
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {poItems.length === 0 && !loading && (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
                        <div>Tidak ada suku cadang dalam tahap PO (Purchase Order).</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      <style jsx global>{`
        .po-pr-form {
          animation: fadeIn 0.3s ease-out;
        }
        .suggestion-item {
          border-bottom: 1px solid var(--br);
        }
        .suggestion-item:last-child {
          border-bottom: none;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
          .po-pr-form {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}
