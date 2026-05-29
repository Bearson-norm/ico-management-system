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
  purchasingNoPr: string | null;
  purchasingNoPo: string | null;
  prDate: string | null;
  poDate: string | null;
  currentStock: number;
};

type CartItem = {
  id: string;
  nama: string;
  uom: string;
  qty: number;
  harga: number;
};

export default function ProcurementPage() {
  const [spareparts, setSpareparts] = useState<Sparepart[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Utility to format ISO local timezone datetime for datetime-local inputs
  function getLocalDateTimeString(date: Date = new Date()) {
    const tzoffset = date.getTimezoneOffset() * 60000;
    return (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
  }

  // Search & input form state
  const [searchText, setSearchText] = useState('');
  const [selectedSp, setSelectedSp] = useState<Sparepart | null>(null);
  const [targetStatus, setTargetStatus] = useState<'PR' | 'PO'>('PR');
  const [purchasingQty, setPurchasingQty] = useState<number>(1);
  const [formNoPr, setFormNoPr] = useState('');
  const [formNoPo, setFormNoPo] = useState('');
  const [formDate, setFormDate] = useState(getLocalDateTimeString());
  const [showDropdown, setShowDropdown] = useState(false);

  // Cart state
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Tabs state
  const [activeTab, setActiveTab] = useState<'PR' | 'PO'>('PR');

  // Edit Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSp, setEditingSp] = useState<Sparepart | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [editNoPr, setEditNoPr] = useState('');
  const [editNoPo, setEditNoPo] = useState('');
  const [editPrDate, setEditPrDate] = useState('');
  const [editPoDate, setEditPoDate] = useState('');

  // Upgrade Modal states
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradingSp, setUpgradingSp] = useState<Sparepart | null>(null);
  const [upgradeNoPo, setUpgradeNoPo] = useState('');
  const [upgradePoDate, setUpgradePoDate] = useState('');

  // Receive Modal states
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingSp, setReceivingSp] = useState<Sparepart | null>(null);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [receivePrice, setReceivePrice] = useState(0);
  const [receiveType, setReceiveType] = useState('MTC');
  const [receiveVendor, setReceiveVendor] = useState('');

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
        await fetchData();
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

  function handleAddToCart(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSp) {
      alert('Silakan pilih suku cadang terlebih dahulu');
      return;
    }
    const existingIndex = cartItems.findIndex(item => item.id === selectedSp.id);
    if (existingIndex > -1) {
      const updated = [...cartItems];
      updated[existingIndex].qty += purchasingQty;
      setCartItems(updated);
    } else {
      setCartItems([
        ...cartItems,
        {
          id: selectedSp.id,
          nama: selectedSp.nama,
          uom: selectedSp.uom,
          qty: purchasingQty,
          harga: Number(selectedSp.harga) || 0
        }
      ]);
    }
    setSelectedSp(null);
    setSearchText('');
    setPurchasingQty(1);
  }

  async function handleSaveBulkProcurement(e: React.FormEvent) {
    e.preventDefault();
    if (cartItems.length === 0) {
      alert('Daftar barang pengadaan kosong. Silakan tambah barang terlebih dahulu');
      return;
    }

    setActionLoading('bulk-save');
    try {
      const isPr = targetStatus === 'PR';
      const docNo = isPr ? formNoPr : formNoPo;

      for (const item of cartItems) {
        const payload = {
          id: item.id,
          purchasingStatus: targetStatus,
          purchasingQty: item.qty,
          purchasingNoPr: isPr ? docNo : null,
          purchasingNoPo: !isPr ? docNo : null,
          prDate: isPr ? new Date(formDate).toISOString() : null,
          poDate: !isPr ? new Date(formDate).toISOString() : null,
        };

        const res = await fetch('/api/mtc/master/sparepart', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!json.success) {
          throw new Error(json.message || `Gagal menyimpan ${item.nama}`);
        }
      }

      alert(`Berhasil menyimpan ${cartItems.length} pengadaan baru!`);
      await fetchData();
      setCartItems([]);
      setFormNoPr('');
      setFormNoPo('');
      setFormDate(getLocalDateTimeString());
      setActiveTab(targetStatus);
    } catch (err: any) {
      alert('Terjadi kesalahan saat menyimpan pengadaan: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  }

  function handleRemoveFromCart(id: string) {
    setCartItems(cartItems.filter(item => item.id !== id));
  }

  function handleUpdateCartQty(id: string, delta: number) {
    setCartItems(
      cartItems.map(item => {
        if (item.id === id) {
          return { ...item, qty: Math.max(1, item.qty + delta) };
        }
        return item;
      })
    );
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingSp) return;

    setActionLoading(editingSp.id);
    try {
      const payload = {
        id: editingSp.id,
        purchasingQty: editQty,
        purchasingNoPr: editNoPr || null,
        purchasingNoPo: editNoPo || null,
        prDate: editPrDate ? new Date(editPrDate).toISOString() : null,
        poDate: editPoDate ? new Date(editPoDate).toISOString() : null,
      };

      const res = await fetch('/api/mtc/master/sparepart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        setShowEditModal(false);
        setEditingSp(null);
        await fetchData();
      } else {
        alert('Gagal mengedit pengadaan: ' + (json.message || 'Error'));
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUpgradeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!upgradingSp) return;

    setActionLoading(upgradingSp.id);
    try {
      const payload = {
        id: upgradingSp.id,
        purchasingStatus: 'PO',
        purchasingQty: upgradingSp.purchasingQty,
        purchasingNoPr: upgradingSp.purchasingNoPr,
        purchasingNoPo: upgradeNoPo || null,
        poDate: upgradePoDate ? new Date(upgradePoDate).toISOString() : new Date().toISOString(),
      };

      const res = await fetch('/api/mtc/master/sparepart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        setShowUpgradeModal(false);
        setUpgradingSp(null);
        setUpgradeNoPo('');
        setActiveTab('PO');
        await fetchData();
      } else {
        alert('Gagal memproses upgrade: ' + (json.message || 'Error'));
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReceiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receivingSp) return;

    setActionLoading(receivingSp.id);
    try {
      const payload = {
        jenis: 'existing',
        tanggal: receiveDate,
        purchaseType: receiveType || null,
        vendor: receiveVendor || null,
        items: [
          {
            sparepartId: receivingSp.id,
            qty: receivingSp.purchasingQty || 1,
            harga: Number(receivePrice) || 0
          }
        ]
      };

      const res = await fetch('/api/mtc/stock/in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        alert(`Berhasil menerima ${receivingSp.nama} sebanyak ${receivingSp.purchasingQty || 1} ${receivingSp.uom}`);
        setShowReceiveModal(false);
        setReceivingSp(null);
        await fetchData();
      } else {
        alert('Gagal mencatat penerimaan: ' + (json.message || 'Error'));
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi');
    } finally {
      setActionLoading(null);
    }
  }

  function openEditModal(sp: Sparepart) {
    setEditingSp(sp);
    setEditQty(sp.purchasingQty || 1);
    setEditNoPr(sp.purchasingNoPr || '');
    setEditNoPo(sp.purchasingNoPo || '');
    setEditPrDate(sp.prDate ? getLocalDateTimeString(new Date(sp.prDate)) : '');
    setEditPoDate(sp.poDate ? getLocalDateTimeString(new Date(sp.poDate)) : '');
    setShowEditModal(true);
  }

  function openUpgradeModal(sp: Sparepart) {
    setUpgradingSp(sp);
    setUpgradeNoPo('');
    setUpgradePoDate(getLocalDateTimeString());
    setShowUpgradeModal(true);
  }

  function openReceiveModal(sp: Sparepart) {
    setReceivingSp(sp);
    setReceivePrice(Number(sp.harga) || 0);
    setReceiveDate(new Date().toISOString().split('T')[0]);
    setReceiveType('MTC');
    setReceiveVendor('');
    setShowReceiveModal(true);
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
            {/* Input Row Form */}
            <form onSubmit={handleAddToCart} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 0.6fr 1.2fr', gap: '20px', alignItems: 'end' }} className="po-pr-form">
              {/* Autocomplete Sparepart Input */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }} ref={dropdownRef}>
                <label className="form-label" style={{ fontWeight: 800, fontSize: 10, letterSpacing: '0.05em', color: 'var(--tx3)', textTransform: 'uppercase' }}>
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

              {/* Set Status Pengadaan */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ fontWeight: 800, fontSize: 10, letterSpacing: '0.05em', color: 'var(--tx3)', textTransform: 'uppercase' }}>
                  Set Status Pengadaan <span style={{ color: 'var(--red)' }}>*</span>
                </label>
                <div style={{ display: 'flex', background: 'var(--sf2)', padding: 4, borderRadius: 8, border: '1px solid var(--br)', height: '40px' }}>
                  <button
                    type="button"
                    onClick={() => setTargetStatus('PR')}
                    style={{
                      flex: 1,
                      padding: '4px 12px',
                      borderRadius: 6,
                      border: 'none',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      background: targetStatus === 'PR' ? 'var(--ylw-d)' : 'transparent',
                      color: targetStatus === 'PR' ? 'var(--ylw)' : 'var(--tx3)',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    ⏳ PR
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetStatus('PO')}
                    style={{
                      flex: 1,
                      padding: '4px 12px',
                      borderRadius: 6,
                      border: 'none',
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer',
                      background: targetStatus === 'PO' ? 'var(--blu-d)' : 'transparent',
                      color: targetStatus === 'PO' ? 'var(--blu)' : 'var(--tx3)',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    📦 PO
                  </button>
                </div>
              </div>

              {/* Jumlah / Qty Pengadaan */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label className="form-label" style={{ fontWeight: 800, fontSize: 10, letterSpacing: '0.05em', color: 'var(--tx3)', textTransform: 'uppercase' }}>
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

              {/* Button Add To Cart */}
              <div style={{ height: '40px', display: 'flex', alignItems: 'end' }}>
                <button
                  type="submit"
                  className="btn btn-pur"
                  disabled={!selectedSp}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: '40px', fontWeight: 700 }}
                >
                  ➕ Tambah ke Daftar
                </button>
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
            </form>

            {/* Procurement Cart UI Table */}
            {cartItems.length > 0 && (
              <div style={{ marginTop: 30, animation: 'fadeIn 0.3s ease-out', borderTop: '1px solid var(--br)', paddingTop: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--pur)' }}>🛒 Daftar Item Pengadaan ({cartItems.length})</div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCartItems([])} style={{ color: 'var(--red)' }}>
                    Bersihkan Daftar
                  </button>
                </div>
                <div className="table-wrap" style={{ marginBottom: 20 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Item ID</th>
                        <th>Nama Suku Cadang</th>
                        <th style={{ textAlign: 'center' }}>Jumlah / Qty</th>
                        <th>Harga Satuan</th>
                        <th>Subtotal</th>
                        <th style={{ textAlign: 'right' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cartItems.map((item) => (
                        <tr key={item.id}>
                          <td className="text-mono text-tiny text-muted">{item.id}</td>
                          <td style={{ fontWeight: 600 }}>{item.nama}</td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                              <button
                                type="button"
                                onClick={() => handleUpdateCartQty(item.id, -1)}
                                className="btn btn-ghost"
                                style={{ padding: '0 8px', fontSize: 14, height: 24, minWidth: 24 }}
                              >
                                -
                              </button>
                              <span style={{ fontWeight: 700, fontSize: 13, minWidth: 24, display: 'inline-block', textAlign: 'center' }}>
                                {item.qty} {item.uom}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateCartQty(item.id, 1)}
                                className="btn btn-ghost"
                                style={{ padding: '0 8px', fontSize: 14, height: 24, minWidth: 24 }}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td>{fmtRupiah(item.harga)}</td>
                          <td style={{ fontWeight: 700 }}>{fmtRupiah(item.harga * item.qty)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(item.id)}
                              style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 18, cursor: 'pointer' }}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 14, fontWeight: 800, marginBottom: 24 }}>
                  <span>Total Estimasi: <span style={{ color: 'var(--pur)', fontSize: 16 }}>{fmtRupiah(cartItems.reduce((sum, item) => sum + (item.harga * item.qty), 0))}</span></span>
                </div>

                {/* Bulk Document & Date Details Form */}
                <form onSubmit={handleSaveBulkProcurement} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', background: 'var(--sf2)', padding: '20px', borderRadius: 8, border: '1px solid var(--br)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>
                      {targetStatus === 'PR' ? 'Nomor PR Dokumen' : 'Nomor PO Dokumen'} <span style={{ color: 'var(--tx3)' }}>(Opsional - Berlaku untuk Semua Item)</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={targetStatus === 'PR' ? 'Masukkan Nomor PR (Contoh: PR-MTC-0529)' : 'Masukkan Nomor PO (Contoh: PO-MTC-0529)'}
                      value={targetStatus === 'PR' ? formNoPr : formNoPo}
                      onChange={(e) => targetStatus === 'PR' ? setFormNoPr(e.target.value) : setFormNoPo(e.target.value)}
                      style={{ height: '40px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 12 }}>
                      Tanggal Pengadaan <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      style={{ height: '40px' }}
                    />
                  </div>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
                    <button
                      type="submit"
                      className={`btn ${targetStatus === 'PR' ? 'btn-pur' : 'btn-blu'}`}
                      disabled={actionLoading !== null}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', fontWeight: 700 }}
                    >
                      {actionLoading === 'bulk-save' ? 'Memproses Penyimpanan...' : `💾 Simpan Semua Pengadaan (${cartItems.length} Suku Cadang)`}
                    </button>
                  </div>
                </form>
              </div>
            )}
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
                    <th>No PR</th>
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
                        <td>
                          <span className="badge badge-blu" style={{ fontSize: 10 }}>{sp.purchasingNoPr || '—'}</span>
                        </td>
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
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openEditModal(sp)}
                              style={{ color: 'var(--pur)', padding: '2px 6px' }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => updateStatus(sp.id, 'NONE')}
                              disabled={actionLoading !== null}
                              style={{ color: 'var(--red)', padding: '2px 6px' }}
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              className="btn btn-blu btn-sm"
                              onClick={() => openUpgradeModal(sp)}
                              disabled={actionLoading !== null}
                              style={{ padding: '4px 10px', fontSize: 11 }}
                            >
                              📦 Upgrade PO
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {prItems.length === 0 && !loading && (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>
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
                    <th>No PO</th>
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
                        <td>
                          <div>
                            <span className="badge badge-blu" style={{ fontSize: 10 }}>{sp.purchasingNoPo || '—'}</span>
                          </div>
                          {sp.purchasingNoPr && (
                            <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>
                              PR: {sp.purchasingNoPr}
                            </div>
                          )}
                        </td>
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
                          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openEditModal(sp)}
                              style={{ color: 'var(--pur)', padding: '2px 6px' }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => updateStatus(sp.id, 'NONE')}
                              disabled={actionLoading !== null}
                              style={{ color: 'var(--red)', padding: '2px 6px' }}
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              className="btn btn-grn btn-sm"
                              onClick={() => openReceiveModal(sp)}
                              disabled={actionLoading !== null}
                              style={{ padding: '4px 10px', fontSize: 11 }}
                            >
                              📥 Terima Barang
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {poItems.length === 0 && !loading && (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>
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

      {showEditModal && editingSp && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>✏️ Edit Informasi Pengadaan</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'var(--tx3)' }}>NAMA SUKU CADANG</label>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{editingSp.nama} (ID: {editingSp.id})</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label">Jumlah / Qty</label>
                    <input
                      type="number"
                      min="1"
                      required
                      className="form-input"
                      value={editQty}
                      onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Unit of Measure (UOM)</label>
                    <input type="text" className="form-input" disabled value={editingSp.uom} />
                  </div>
                </div>

                {editingSp.purchasingStatus === 'PR' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label className="form-label">Nomor PR</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Contoh: PR-2026-001"
                        value={editNoPr}
                        onChange={(e) => setEditNoPr(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="form-label">Tanggal PR</label>
                      <input
                        type="datetime-local"
                        className="form-input"
                        required
                        value={editPrDate}
                        onChange={(e) => setEditPrDate(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                      <div>
                        <label className="form-label">Nomor PR</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Contoh: PR-2026-001"
                          value={editNoPr}
                          onChange={(e) => setEditNoPr(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Tanggal PR</label>
                        <input
                          type="datetime-local"
                          className="form-input"
                          value={editPrDate}
                          onChange={(e) => setEditPrDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                      <div>
                        <label className="form-label">Nomor PO</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Contoh: PO-2026-001"
                          value={editNoPo}
                          onChange={(e) => setEditNoPo(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="form-label">Tanggal PO</label>
                        <input
                          type="datetime-local"
                          className="form-input"
                          required
                          value={editPoDate}
                          onChange={(e) => setEditPoDate(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditModal(false)}>Batal</button>
                <button type="submit" className="btn btn-pur" disabled={actionLoading !== null}>
                  {actionLoading !== null ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUpgradeModal && upgradingSp && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>📦 Upgrade ke PO (Purchase Order)</h3>
              <button className="modal-close" onClick={() => setShowUpgradeModal(false)}>×</button>
            </div>
            <form onSubmit={handleUpgradeSubmit}>
              <div className="modal-body">
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'var(--tx3)' }}>NAMA SUKU CADANG</label>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{upgradingSp.nama}</div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                    Qty: {upgradingSp.purchasingQty} {upgradingSp.uom} · PR No: {upgradingSp.purchasingNoPr || '—'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label">Nomor PO <span style={{ color: 'var(--red)' }}>*</span></label>
                    <input
                      type="text"
                      required
                      placeholder="Masukkan Nomor PO..."
                      className="form-input"
                      value={upgradeNoPo}
                      onChange={(e) => setUpgradeNoPo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label">Tanggal PO <span style={{ color: 'var(--red)' }}>*</span></label>
                    <input
                      type="datetime-local"
                      required
                      className="form-input"
                      value={upgradePoDate}
                      onChange={(e) => setUpgradePoDate(e.target.value)}
                    />
                  </div>
                </div>

                {upgradingSp.purchasingNoPr && (
                  <div style={{ background: 'var(--sf2)', border: '1px solid var(--br)', borderRadius: 6, padding: '10px 14px', fontSize: 11, color: 'var(--tx3)' }}>
                    💡 <strong>Catatan:</strong> Barang-barang lain dengan Nomor PR <strong>{upgradingSp.purchasingNoPr}</strong> otomatis akan di-upgrade ke PO mewarisi Nomor PO & Tanggal yang sama.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowUpgradeModal(false)}>Batal</button>
                <button type="submit" className="btn btn-blu" disabled={actionLoading !== null}>
                  {actionLoading !== null ? 'Memproses...' : 'Upgrade Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReceiveModal && receivingSp && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h3>📥 Terima Barang & Catat Stok Masuk</h3>
              <button className="modal-close" onClick={() => setShowReceiveModal(false)}>×</button>
            </div>
            <form onSubmit={handleReceiveSubmit}>
              <div className="modal-body">
                <div style={{ marginBottom: 14, borderBottom: '1px solid var(--br)', paddingBottom: 10 }}>
                  <label style={{ fontSize: 11, color: 'var(--tx3)' }}>NAMA SUKU CADANG</label>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{receivingSp.nama}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--pur)', marginTop: 4 }}>
                    Menerima: {receivingSp.purchasingQty || 1} {receivingSp.uom} · PO No: {receivingSp.purchasingNoPo || '—'}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label">Jenis Pembelian</label>
                    <select
                      className="form-input"
                      value={receiveType}
                      onChange={(e) => setReceiveType(e.target.value)}
                      style={{ padding: '0 10px', height: '38px' }}
                    >
                      <option value="MTC">MTC</option>
                      <option value="PROJECT">PROJECT</option>
                      <option value="INVESTASI">INVESTASI</option>
                    </select>
                  </div>
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

                <div style={{ fontSize: 11, color: 'var(--tx3)', background: 'var(--sf2)', padding: 10, borderRadius: 6 }}>
                  ℹ️ <strong>Informasi:</strong> Menyimpan penerimaan ini akan secara otomatis menambahkan stok barang sebanyak {receivingSp.purchasingQty || 1} unit ke sistem, menghitung Lead-Time pengadaan, serta me-reset status pengadaan suku cadang ini menjadi normal.
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowReceiveModal(false)}>Batal</button>
                <button type="submit" className="btn btn-grn" disabled={actionLoading !== null}>
                  {actionLoading !== null ? 'Mencatat...' : 'Terima & Masuk Stok'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
          max-width: 520px;
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
          padding: 20px;
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
        @media (max-width: 768px) {
          .po-pr-form {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}
