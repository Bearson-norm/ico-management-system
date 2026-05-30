'use client';
import { useState, useEffect, useRef, useMemo } from 'react';

type Sparepart = {
  id: string;
  nama: string;
  uom: string;
  lokasi: string | null;
  harga: number;
  minQty: number;
};

type TrackingItem = {
  id: number;
  fbIndex: number | null;
  originalName: string;
  sparepartId: string | null;
  keterangan: string | null;
  penggunaanBulan: number | null;
  kontrak3Bulan: boolean;
  tanggalList: string;
  qty: number;
  productCategory: string | null;
  reason: string | null;
  urgency: string;
  linkReferences: string | null;
  vendor: string | null;
  harga: number | null;
  nomorPr: string | null;
  statusPr: string;
  statusPa: string | null;
  statusPo: string | null;
  nomorPo: string | null;
  poApproved: boolean;
  etaFoom: string | null;
  linkGr: string | null;
  tanggalTerima: string | null;
  isStocked: boolean;
  sparepart?: Sparepart | null;
};

export default function ProcurementTrackingPage() {
  const [items, setItems] = useState<TrackingItem[]>([]);
  const [spareparts, setSpareparts] = useState<Sparepart[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Import states
  const [showImportBox, setShowImportBox] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  
  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE'); // ACTIVE | ALL | RECEIVED
  const [categoryFilter, setCategoryFilter] = useState('');
  
  // Tabs for main view
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'RECEIVED' | 'ALL'>('ACTIVE');
  
  // Link Modal States
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingItem, setLinkingItem] = useState<TrackingItem | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  
  // Receive Modal States
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingItem, setReceivingItem] = useState<TrackingItem | null>(null);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [receivePrice, setReceivePrice] = useState(0);
  const [receiveVendor, setReceiveVendor] = useState('');
  const [isStocked, setIsStocked] = useState(true); // true = Restock, false = Direct Use

  useEffect(() => {
    fetchData();
    fetchSpareparts();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const showArchived = activeTab === 'RECEIVED';
      const res = await fetch(`/api/mtc/procurement?archived=${showArchived}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data || []);
      }
    } catch (e) {
      console.error('Gagal mengambil data pengadaan', e);
    } finally {
      setLoading(false);
    }
  }

  // Refetch when tab changes
  useEffect(() => {
    fetchData();
  }, [activeTab]);

  async function fetchSpareparts() {
    try {
      const res = await fetch('/api/mtc/master/sparepart');
      const json = await res.json();
      if (json.success) {
        setSpareparts(json.data || []);
      }
    } catch (e) {
      console.error('Gagal mengambil master sparepart', e);
    }
  }

  // Handle CSV sync/import
  async function handleImportSync(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading('import');
    setImportStatus(null);
    try {
      const res = await fetch('/api/mtc/procurement/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText, sheetUrl }),
      });
      const json = await res.json();
      if (json.success) {
        setImportStatus({ type: 'success', msg: json.data.msg || 'Sinkronisasi berhasil!' });
        setCsvText('');
        setSheetUrl('');
        await fetchData();
        await fetchSpareparts();
        setTimeout(() => setShowImportBox(false), 2000);
      } else {
        setImportStatus({ type: 'error', msg: json.error || 'Sinkronisasi gagal.' });
      }
    } catch (err: any) {
      setImportStatus({ type: 'error', msg: 'Terjadi kesalahan jaringan.' });
    } finally {
      setActionLoading(null);
    }
  }

  // Handle direct file select
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCsvText(event.target.result as string);
        setImportStatus({ type: 'success', msg: `Berkas ${file.name} berhasil dibaca. Klik tombol Sync di bawah untuk menyimpan.` });
      }
    };
    reader.readAsText(file);
  }

  // Handle Goods Receipt (Terima Barang)
  async function handleReceiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receivingItem) return;
    
    setActionLoading(`receive-${receivingItem.id}`);
    try {
      const res = await fetch('/api/mtc/procurement/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: receivingItem.id,
          tanggalTerima: receiveDate,
          isStocked: isStocked && receivingItem.sparepartId != null,
          harga: receivePrice,
          vendor: receiveVendor,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(json.data.msg || 'Penerimaan berhasil dicatat!');
        setShowReceiveModal(false);
        setReceivingItem(null);
        await fetchData();
      } else {
        alert(`Gagal: ${json.error}`);
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi jaringan.');
    } finally {
      setActionLoading(null);
    }
  }

  // Handle link manual sparepart
  async function handleLinkSparepart(sparepartId: string) {
    if (!linkingItem) return;
    setActionLoading(`link-${linkingItem.id}`);
    try {
      const res = await fetch('/api/mtc/procurement/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvText: `Fb,Original Material Name,MTC Item Name (ODOO),Qty\n${linkingItem.fbIndex || ''},"${linkingItem.originalName}","${spareparts.find(s => s.id === sparepartId)?.nama || ''}",${linkingItem.qty}`,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowLinkModal(false);
        setLinkingItem(null);
        setLinkSearch('');
        await fetchData();
      } else {
        alert(`Gagal menghubungkan: ${json.error}`);
      }
    } catch (e) {
      alert('Koneksi bermasalah.');
    } finally {
      setActionLoading(null);
    }
  }

  // Open modals
  function openReceiveModal(item: TrackingItem) {
    setReceivingItem(item);
    setReceivePrice(Number(item.harga) || 0);
    setReceiveVendor(item.vendor || '');
    setReceiveDate(new Date().toISOString().split('T')[0]);
    setIsStocked(item.sparepartId != null);
    setShowReceiveModal(true);
  }

  function openLinkModal(item: TrackingItem) {
    setLinkingItem(item);
    setLinkSearch('');
    setShowLinkModal(true);
  }

  // Filter items in memory
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.originalName.toLowerCase().includes(q);
        const matchPr = item.nomorPr?.toLowerCase().includes(q);
        const matchPo = item.nomorPo?.toLowerCase().includes(q);
        const matchOdoo = item.sparepart?.nama.toLowerCase().includes(q);
        if (!matchName && !matchPr && !matchPo && !matchOdoo) return false;
      }
      
      // Urgency filter
      if (urgencyFilter && item.urgency !== urgencyFilter) return false;
      
      // Kategori filter
      if (categoryFilter && item.productCategory !== categoryFilter) return false;

      return true;
    });
  }, [items, searchQuery, urgencyFilter, categoryFilter]);

  // Categories list for dropdown
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    items.forEach(item => {
      if (item.productCategory) set.add(item.productCategory);
    });
    return Array.from(set).sort();
  }, [items]);

  // Lead time stats & overdue counts
  const stats = useMemo(() => {
    const active = items.filter(i => i.statusPo !== 'DONE');
    const received = items.filter(i => i.statusPo === 'DONE' && i.tanggalTerima && i.tanggalList);
    
    // Average lead time
    let totalDays = 0;
    received.forEach(item => {
      const diff = new Date(item.tanggalTerima!).getTime() - new Date(item.tanggalList).getTime();
      totalDays += Math.max(1, diff / (1000 * 60 * 60 * 24));
    });
    const avgLeadTime = received.length > 0 ? (totalDays / received.length).toFixed(1) : '—';

    // Urgent items
    const urgentCount = active.filter(i => i.urgency === 'Urgent').length;

    // ETA Alerts (Overdue active items)
    const today = new Date().getTime();
    const etaOverdueCount = active.filter(i => {
      if (!i.etaFoom) return false;
      return new Date(i.etaFoom).getTime() < today;
    }).length;

    const prCount = active.filter(i => i.statusPr === 'CONTINUE' && !i.nomorPo).length;
    const poCount = active.filter(i => i.nomorPo && i.statusPo !== 'DONE').length;

    return { avgLeadTime, urgentCount, etaOverdueCount, prCount, poCount };
  }, [items]);

  // Format currency helper
  function fmtRupiah(value: number | null): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  // Days elapsed helper
  function getDaysElapsed(startStr: string, endStr: string | null): string {
    const start = new Date(startStr);
    const end = endStr ? new Date(endStr) : new Date();
    const diff = end.getTime() - start.getTime();
    const days = Math.max(0, parseFloat((diff / (1000 * 60 * 60 * 24)).toFixed(1)));
    return `${days} Hari`;
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-title">🔍 Pelacakan PR / PO (SCM Sinc)</div>
          <div className="page-sub">Sinkronisasi status pengadaan langsung dari spreadsheet Procurement untuk integrasi stok MTC otomatis.</div>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-pur"
            onClick={() => {
              setShowImportBox(!showImportBox);
              setImportStatus(null);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}
          >
            📥 {showImportBox ? 'Tutup Panel Sync' : 'Sinkronkan Google Sheets / CSV'}
          </button>
        </div>
      </div>

      <div className="page-body">
        
        {/* IMPORT / SYNC PANEL CONTAINER */}
        {showImportBox && (
          <div className="card" style={{ marginBottom: 24, border: '1px solid var(--pur)', background: 'rgba(107, 33, 168, 0.05)', animation: 'fadeIn 0.2s ease-out' }}>
            <div className="card-header"><div className="card-title" style={{ color: 'var(--pur)' }}>🔄 Sinkronisasi Spreadsheet SCM</div></div>
            <form onSubmit={handleImportSync} style={{ padding: '0 20px 20px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="form-label" style={{ fontWeight: 800 }}>Opsi 1: Tempel Link Google Sheets</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Tempel tautan / URL Google Sheets Pelacakan SCM di sini..."
                    value={sheetUrl}
                    onChange={(e) => {
                      setSheetUrl(e.target.value);
                      setCsvText('');
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--tx3)' }}>
                    💡 Pastikan Spreadsheet disetel ke <strong>&quot;Anyone with the link can view&quot;</strong> (Siapa saja dengan organisasi kantor dapat melihat).
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="form-label" style={{ fontWeight: 800 }}>Opsi 2: Unggah Berkas CSV</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                      id="csv-file-picker"
                    />
                    <label
                      htmlFor="csv-file-picker"
                      className="btn btn-ghost"
                      style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', height: 40 }}
                    >
                      📁 Pilih Berkas CSV Lokal
                    </label>
                  </div>
                  {csvText && (
                    <span style={{ fontSize: 10, color: 'var(--grn)', fontWeight: 700 }}>
                      ✓ Berkas CSV siap disinkronkan ({csvText.length} bytes terdeteksi).
                    </span>
                  )}
                </div>
              </div>

              {importStatus && (
                <div className={`alert ${importStatus.type === 'success' ? 'alert-grn' : 'alert-red'}`} style={{ marginBottom: 16 }}>
                  {importStatus.msg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowImportBox(false);
                    setCsvText('');
                    setSheetUrl('');
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-pur"
                  disabled={actionLoading === 'import' || (!csvText.trim() && !sheetUrl.trim())}
                  style={{ fontWeight: 700, padding: '0 24px' }}
                >
                  {actionLoading === 'import' ? 'Sinkronisasi...' : '🔄 Jalankan Sinkronisasi'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* METRICS & SUMMARY KPI CARDS */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card stat-ylw" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('ACTIVE')}>
            <div className="stat-label">Barang Tahap PR</div>
            <div className="stat-value">{stats.prCount}</div>
            <div className="stat-sub">Menunggu PO diterbitkan vendor</div>
          </div>
          <div className="stat-card stat-blu" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('ACTIVE')}>
            <div className="stat-label">Barang Sudah PO</div>
            <div className="stat-value">{stats.poCount}</div>
            <div className="stat-sub">Sedang diproses / dalam pengiriman</div>
          </div>
          <div className="stat-card stat-red">
            <div className="stat-label">Pengadaan URGENT</div>
            <div className="stat-value" style={{ color: 'var(--red)' }}>{stats.urgentCount}</div>
            <div className="stat-sub">{stats.etaOverdueCount} Item melewati ETA Foom ⚠️</div>
          </div>
          <div className="stat-card stat-grn" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('RECEIVED')}>
            <div className="stat-label">Rerata Lead-Time Pengadaan</div>
            <div className="stat-value" style={{ color: 'var(--grn)' }}>{stats.avgLeadTime}</div>
            <div className="stat-sub">Dihitung otomatis dari riwayat kedatangan</div>
          </div>
        </div>

        {/* SEARCH & FILTERS CONTROLS */}
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 16 }}>
            <div className="search-bar" style={{ width: '100%', marginBottom: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Cari berdasarkan nama barang, nomor PR, PO, atau item Odoo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <select
                className="form-input form-select"
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value)}
                style={{ height: '40px' }}
              >
                <option value="">— Urgensi (Semua) —</option>
                <option value="Urgent">🚨 Urgent / Mendesak</option>
                <option value="Normal">🟢 Normal</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <select
                className="form-input form-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ height: '40px' }}
              >
                <option value="">— Kategori (Semua) —</option>
                {categoriesList.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Custom Tab Switcher */}
            <div style={{ display: 'flex', background: 'var(--sf2)', padding: 4, borderRadius: 8, height: '40px', border: '1px solid var(--br)' }}>
              <button
                type="button"
                className={`ntab`}
                onClick={() => setActiveTab('ACTIVE')}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeTab === 'ACTIVE' ? 'var(--sf3)' : 'transparent',
                  color: activeTab === 'ACTIVE' ? 'var(--tx)' : 'var(--tx3)',
                  transition: 'all 0.15s'
                }}
              >
                ⏳ Aktif
              </button>
              <button
                type="button"
                className={`ntab`}
                onClick={() => setActiveTab('RECEIVED')}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: activeTab === 'RECEIVED' ? 'var(--sf3)' : 'transparent',
                  color: activeTab === 'RECEIVED' ? 'var(--tx)' : 'var(--tx3)',
                  transition: 'all 0.15s'
                }}
              >
                ✓ Diterima
              </button>
            </div>
          </div>
        </div>

        {/* MAIN DATA TABLE */}
        <div className="card">
          <div className="table-wrap" style={{ opacity: loading ? 0.6 : 1, overflowX: 'auto' }}>
            <table style={{ minWidth: 1200 }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Fb</th>
                  <th style={{ minWidth: 220 }}>Nama Barang (Sheets)</th>
                  <th style={{ minWidth: 200 }}>Item Master MTC (Odoo)</th>
                  <th style={{ textAlign: 'center', width: 60 }}>Qty</th>
                  <th>Keterangan</th>
                  <th>Urgensi</th>
                  <th>Nomor PR & PO</th>
                  <th>Harga & Vendor</th>
                  <th>ETA Foom</th>
                  <th style={{ textAlign: 'center' }}>Hari Berjalan</th>
                  <th style={{ textAlign: 'center', width: 80 }}>Odoo GR</th>
                  <th style={{ textAlign: 'right', minWidth: 160 }}>Aksi Penerimaan</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isUrgent = item.urgency === 'Urgent';
                  const isReceived = item.statusPo === 'DONE';
                  const hasEtaPassed = item.etaFoom && !isReceived && new Date(item.etaFoom).getTime() < new Date().getTime();

                  return (
                    <tr key={item.id} style={{ borderLeft: isUrgent && !isReceived ? '4px solid var(--red)' : 'none' }}>
                      <td className="text-mono text-tiny text-muted" style={{ paddingLeft: isUrgent && !isReceived ? 12 : 16 }}>
                        {item.fbIndex || '—'}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--tx)' }}>{item.originalName}</div>
                        {item.reason && <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>Alasan: {item.reason}</div>}
                      </td>
                      <td>
                        {item.sparepart ? (
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--tx2)' }}>{item.sparepart.nama}</div>
                            <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                              ID: <span className="text-mono">{item.sparepart.id}</span> · SLOC: <span className="badge badge-blu" style={{ fontSize: 8, padding: '1px 4px' }}>{item.sparepart.lokasi || '—'}</span>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="badge badge-red" style={{ fontSize: 9, padding: '3px 8px' }}>⚠️ Unlinked / General</span>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openLinkModal(item)}
                              style={{ display: 'block', fontSize: 9, padding: '2px 4px', color: 'var(--pur)', marginTop: 4, height: 'auto' }}
                            >
                              🔗 Hubungkan ke Master DB
                            </button>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 13 }}>
                        {item.qty} <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--tx3)' }}>{item.sparepart?.uom || 'Pcs'}</span>
                      </td>
                      <td className="text-tiny">
                        {item.keterangan || '—'}
                      </td>
                      <td>
                        {isUrgent ? (
                          <span className="badge badge-red" style={{ fontWeight: 800, fontSize: 9 }}>🚨 URGENT</span>
                        ) : (
                          <span className="badge badge-grn" style={{ fontSize: 9 }}>Normal</span>
                        )}
                      </td>
                      <td>
                        {item.nomorPr && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 9, color: 'var(--tx3)' }}>PR:</span>
                            <span className="badge badge-ylw" style={{ fontSize: 10, padding: '1px 6px' }}>{item.nomorPr}</span>
                          </div>
                        )}
                        {item.nomorPo && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <span style={{ fontSize: 9, color: 'var(--tx3)' }}>PO:</span>
                            <span className="badge badge-blu" style={{ fontSize: 10, padding: '1px 6px' }}>{item.nomorPo}</span>
                          </div>
                        )}
                        {!item.nomorPr && !item.nomorPo && <span className="text-muted">—</span>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{fmtRupiah(item.harga)}</div>
                        {item.vendor && <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>Vendor: {item.vendor}</div>}
                      </td>
                      <td>
                        {item.etaFoom ? (
                          <div style={{ color: hasEtaPassed ? 'var(--red)' : 'var(--tx)' }}>
                            {new Date(item.etaFoom).toLocaleDateString('id-ID', {
                              day: '2-digit', month: 'short', year: 'numeric'
                            })}
                            {hasEtaPassed && <div style={{ fontSize: 8, fontWeight: 800, color: 'var(--red)', marginTop: 2 }}>⚠️ LEWAT ETA</div>}
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                        {getDaysElapsed(item.tanggalList, item.tanggalTerima)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {item.linkGr ? (
                          <a
                            href={item.linkGr}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Buka Link GR Odoo"
                            style={{ fontSize: 18, color: 'var(--pur)', textDecoration: 'none' }}
                          >
                            🔗
                          </a>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isReceived ? (
                          <span className="badge badge-grn" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>
                            ✓ Diterima {item.isStocked ? '(Gudang)' : '(Non-Stok)'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-grn btn-sm"
                            disabled={actionLoading !== null}
                            onClick={() => openReceiveModal(item)}
                            style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700 }}
                          >
                            📥 Terima Barang
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredItems.length === 0 && !loading && (
                  <tr>
                    <td colSpan={13} style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Belum Ada Data Pelacakan Pengadaan</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>Silakan klik tombol **Sinkronkan Google Sheets** di atas untuk mengunggah CSV atau menyinkronkan link Sheets.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL LINK MANUAL SPAREPART */}
      {showLinkModal && linkingItem && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>🔗 Hubungkan ke Master Suku Cadang MTC</h3>
              <button className="modal-close" onClick={() => setShowLinkModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontSize: 10, color: 'var(--tx3)' }}>NAMA BARANG DI SHEETS</label>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{linkingItem.originalName}</div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>Qty: {linkingItem.qty} · Qty sheets: {linkingItem.qty}</div>
              </div>

              <div className="form-group">
                <label className="form-label">Cari Suku Cadang Resmi</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ketik Nama, ID, atau Lokasi Suku Cadang..."
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--br)', borderRadius: 8, background: 'var(--sf2)' }}>
                {spareparts
                  .filter(sp => {
                    if (!linkSearch.trim()) return true;
                    const q = linkSearch.toLowerCase();
                    return sp.nama.toLowerCase().includes(q) || sp.id.toLowerCase().includes(q);
                  })
                  .slice(0, 10)
                  .map(sp => (
                    <div
                      key={sp.id}
                      onClick={() => handleLinkSparepart(sp.id)}
                      className="suggestion-item"
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid var(--br)'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--sf3)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{sp.nama}</div>
                        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{sp.id} · SLOC: {sp.lokasi || '—'}</div>
                      </div>
                      <span className="badge badge-pur" style={{ fontSize: 9 }}>Hubungkan</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RECEIVE / GOODS RECEIPT GOODS */}
      {showReceiveModal && receivingItem && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>📥 Konfirmasi Penerimaan & Update Stok MTC</h3>
              <button className="modal-close" onClick={() => setShowReceiveModal(false)}>×</button>
            </div>
            <form onSubmit={handleReceiveSubmit}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 14, borderBottom: '1px solid var(--br)', paddingBottom: 10 }}>
                  <label style={{ fontSize: 10, color: 'var(--tx3)' }}>NAMA BARANG DI SHEETS</label>
                  <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>{receivingItem.originalName}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--pur)', marginTop: 4 }}>
                    Kuantitas Masuk: {receivingItem.qty} {receivingItem.sparepart?.uom || 'Unit'} · PO No: {receivingItem.nomorPo || '—'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label">Tanggal Kedatangan <span style={{ color: 'var(--red)' }}>*</span></label>
                    <input
                      type="date"
                      required
                      className="form-input"
                      value={receiveDate}
                      onChange={(e) => setReceiveDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Harga Satuan Aktual (Rp) <span style={{ color: 'var(--red)' }}>*</span></label>
                    <input
                      type="number"
                      required
                      min="0"
                      className="form-input"
                      value={receivePrice}
                      onChange={(e) => setReceivePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label">Nama Vendor / Toko</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: PT ABC Suku Cadang"
                      value={receiveVendor}
                      onChange={(e) => setReceiveVendor(e.target.value)}
                    />
                  </div>
                </div>

                {/* STOCKING SELECTION TOGGLE */}
                <div style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontWeight: 800, marginBottom: 8, display: 'block' }}>Tipe Penyimpanan Gudang</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <label
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '12px',
                        borderRadius: 8,
                        border: isStocked ? '2px solid var(--grn)' : '1px solid var(--br)',
                        background: isStocked ? 'rgba(34, 197, 94, 0.05)' : 'var(--sf2)',
                        cursor: receivingItem.sparepartId ? 'pointer' : 'not-allowed',
                        opacity: receivingItem.sparepartId ? 1 : 0.5,
                        transition: 'all 0.15s'
                      }}
                      onClick={() => {
                        if (receivingItem.sparepartId) setIsStocked(true);
                      }}
                    >
                      <span style={{ fontSize: 20, marginBottom: 4 }}>📦</span>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>Masukkan Stok (Restock)</span>
                      <span style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2, textAlign: 'center' }}>
                        Tambah kuantitas di MTC Inventory
                      </span>
                    </label>

                    <label
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '12px',
                        borderRadius: 8,
                        border: !isStocked ? '2px solid var(--pur)' : '1px solid var(--br)',
                        background: !isStocked ? 'rgba(168, 85, 247, 0.05)' : 'var(--sf2)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onClick={() => setIsStocked(false)}
                    >
                      <span style={{ fontSize: 20, marginBottom: 4 }}>⚡</span>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>Langsung Pakai (LOG)</span>
                      <span style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2, textAlign: 'center' }}>
                        Catat log anggaran, tanpa ubah stok
                      </span>
                    </label>
                  </div>

                  {!receivingItem.sparepartId && (
                    <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, marginTop: 8 }}>
                      ⚠️ Item ini belum dihubungkan ke Master Suku Cadang. Anda hanya bisa menerima sebagai **&quot;Langsung Pakai (Non-Stok)&quot;**. Hubungkan terlebih dahulu jika ingin memasukkannya ke stok gudang MTC.
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowReceiveModal(false)}>Batal</button>
                <button
                  type="submit"
                  className={`btn ${isStocked ? 'btn-grn' : 'btn-pur'}`}
                  disabled={actionLoading !== null}
                  style={{ fontWeight: 700, padding: '0 24px' }}
                >
                  {actionLoading !== null ? 'Memproses...' : isStocked ? 'Terima & Masuk Stok Gudang' : 'Terima & Catat Pemakaian langsung'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        .ntab:hover {
          color: var(--tx) !important;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeInOverlay 0.15s ease-out;
        }
        .modal-card {
          background: var(--sf3);
          border: 1px solid var(--br);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          width: 90%;
          overflow: hidden;
          animation: slideUpCard 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--br);
          background: var(--sf2);
        }
        .modal-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 800;
          color: var(--tx);
        }
        .modal-close {
          background: none;
          border: none;
          color: var(--tx3);
          font-size: 24px;
          cursor: pointer;
          line-height: 1;
        }
        .modal-body {
          max-height: 70vh;
          overflow-y: auto;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 14px 20px;
          background: var(--sf2);
          border-top: 1px solid var(--br);
        }
        @keyframes fadeInOverlay {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUpCard {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
