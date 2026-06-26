'use client';

import { useState, useEffect, FormEvent, useMemo } from 'react';
import Link from 'next/link';

interface GaItem {
  id: string;
  nama: string;
  uom: string;
  harga: number;
}

interface ProcurementTracking {
  id: number;
  originalName: string;
  itemId: string | null;
  qty: number;
  harga: number | null;
  vendor: string | null;
  nomorPr: string | null;
  nomorPo: string | null;
  status: 'ORDERED' | 'RECEIVED';
  tanggalPesan: string;
  tanggalTerima: string | null;
  isStocked: boolean;
  grDone: boolean;
  keterangan: string | null;
  item?: GaItem | null;
}

export default function GaProcurementPage() {
  const [items, setItems] = useState<ProcurementTracking[]>([]);
  const [masterItems, setMasterItems] = useState<GaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'RECEIVED' | 'ALL'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupingMode, setGroupingMode] = useState<'PR' | 'PO'>('PR');
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({
    'DRAFT': true,
    'BELUM_ADA_PO': true
  });
  
  // Odoo Session State
  const [odooSessionId, setOdooSessionId] = useState('');
  const [odooUid, setOdooUid] = useState('34');

  // Modals state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [editItem, setEditItem] = useState<ProcurementTracking | null>(null);
  const [selectedTracking, setSelectedTracking] = useState<ProcurementTracking | null>(null);

  // Form states
  const [addForm, setAddForm] = useState({
    originalName: '',
    itemId: '',
    qty: 1,
    harga: '',
    vendor: '',
    nomorPr: '',
    nomorPo: '',
    isStocked: true,
    keterangan: '',
  });

  const [receiveForm, setReceiveForm] = useState({
    qty: 1,
    harga: '',
    vendor: '',
    tanggalTerima: new Date().toISOString().split('T')[0],
    isStocked: true,
    itemId: '',
  });

  // Load configuration & data
  useEffect(() => {
    async function loadGaSettings() {
      let currentSessionId = '';
      let currentUid = '34';

      try {
        const res = await fetch('/api/ga/settings');
        const json = await res.json();
        if (json.success && json.data) {
          currentSessionId = json.data.ga_odoo_session_id || '';
          currentUid = json.data.ga_odoo_uid || '34';
        }
      } catch (err) {
        console.error('Failed to load GA Odoo settings from DB:', err);
      }

      if (!currentSessionId && typeof window !== 'undefined') {
        const savedSessionId = localStorage.getItem('ga_odoo_session_id') || '';
        const savedUid = localStorage.getItem('ga_odoo_uid') || '34';

        if (savedSessionId.trim()) {
          currentSessionId = savedSessionId;
          currentUid = savedUid;

          try {
            await fetch('/api/ga/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ga_odoo_session_id: currentSessionId,
                ga_odoo_uid: currentUid,
              })
            });
          } catch (migrateErr) {
            console.error('Failed to migrate GA Odoo settings to DB:', migrateErr);
          }
        }
      }

      setOdooSessionId(currentSessionId);
      setOdooUid(currentUid);
    }

    loadGaSettings();
    fetchData();
    fetchMasterItems();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ga/procurement?status=all');
      const json = await res.json();
      if (json.success) {
        setItems(json.data || []);
      } else {
        alert('Gagal memuat data: ' + json.error);
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan koneksi.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterItems = async () => {
    try {
      const res = await fetch('/api/ga/stock');
      const json = await res.json();
      if (json.success) {
        setMasterItems(json.data);
      }
    } catch (e) {
      console.error('Gagal mengambil master barang', e);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      localStorage.setItem('ga_odoo_session_id', odooSessionId);
      localStorage.setItem('ga_odoo_uid', odooUid);
    }
    try {
      await fetch('/api/ga/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ga_odoo_session_id: odooSessionId,
          ga_odoo_uid: odooUid,
        })
      });
    } catch (err) {
      console.error('Failed to save GA Odoo settings to DB:', err);
    }
    setShowSettingsModal(false);
  };


  // Sync Odoo
  const handleSyncOdoo = async () => {
    if (!odooSessionId) {
      alert('Konfigurasikan Cookie session_id Odoo terlebih dahulu di Pengaturan Odoo.');
      setShowSettingsModal(true);
      return;
    }
    setSyncing(true);
    try {
      const res = await fetch('/api/ga/odoo/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ odooSessionId, odooUid }),
      });
      const json = await res.json();
      if (json.success) {
        const grCount = json.data?.grConfirmedCount || 0;
        const vendorCount = json.data?.vendorUpdatedCount || 0;
        alert(
          `Sinkronisasi berhasil!\n\n` +
          `- Vendor Terisi Otomatis: ${vendorCount} item\n` +
          `- GR Odoo Terkonfirmasi: ${grCount} item${grCount > 0 ? ' (reminder terhapus)' : ''}\n` +
          `- PR Baru Terimpor (Deskripsi GA): ${json.data.importedPrCount} pengadaan`
        );
        fetchData();
        fetchMasterItems();
      } else {
        alert('Sinkronisasi gagal: ' + json.error);
      }
    } catch (e) {
      console.error(e);
      alert('Gagal menghubungi API Sinkronisasi.');
    } finally {
      setSyncing(false);
    }
  };

  // Add or Edit Order Submission
  const handleAddSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!addForm.originalName && !addForm.itemId) {
      alert('Pilih barang terdaftar atau ketik nama barang secara manual.');
      return;
    }
    setSubmitting(true);

    try {
      const url = '/api/ga/procurement';
      const method = editItem ? 'PATCH' : 'POST';
      const payload = editItem 
        ? { id: editItem.id, ...addForm }
        : addForm;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        setShowAddModal(false);
        setEditItem(null);
        resetAddForm();
        fetchData();
      } else {
        alert('Gagal menyimpan: ' + json.error);
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan penyimpanan.');
    } finally {
      setSubmitting(false);
    }
  };

  // Receive Submit
  const handleReceiveSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTracking) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/ga/procurement/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedTracking.id,
          qty: receiveForm.qty,
          harga: receiveForm.harga ? Number(receiveForm.harga) : null,
          vendor: receiveForm.vendor,
          tanggalTerima: receiveForm.tanggalTerima,
          isStocked: receiveForm.isStocked,
          itemId: receiveForm.itemId || null,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setShowReceiveModal(false);
        setSelectedTracking(null);
        fetchData();
      } else {
        alert('Gagal memproses penerimaan: ' + json.error);
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan saat menyimpan penerimaan.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAddForm = () => {
    setAddForm({
      originalName: '',
      itemId: '',
      qty: 1,
      harga: '',
      vendor: '',
      nomorPr: '',
      nomorPo: '',
      isStocked: true,
      keterangan: '',
    });
  };

  const openEditModal = (item: ProcurementTracking) => {
    setEditItem(item);
    setAddForm({
      originalName: item.originalName,
      itemId: item.itemId || '',
      qty: item.qty,
      harga: item.harga != null ? String(item.harga) : '',
      vendor: item.vendor || '',
      nomorPr: item.nomorPr || '',
      nomorPo: item.nomorPo || '',
      isStocked: item.isStocked,
      keterangan: item.keterangan || '',
    });
    setShowAddModal(true);
  };

  const openReceiveModal = (item: ProcurementTracking) => {
    setSelectedTracking(item);
    setReceiveForm({
      qty: item.qty,
      harga: item.harga != null ? String(item.harga) : '',
      vendor: item.vendor || '',
      tanggalTerima: new Date().toISOString().split('T')[0],
      isStocked: item.isStocked,
      itemId: item.itemId || '',
    });
    setShowReceiveModal(true);
  };

  const formatRupiah = (value: number | null) => {
    if (value === null) return '—';
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  // Filter items by active tab status
  const tabScopedItems = useMemo(() => {
    if (activeTab === 'ACTIVE') {
      return items.filter(i => i.status === 'ORDERED');
    }
    if (activeTab === 'RECEIVED') {
      return items.filter(i => i.status === 'RECEIVED');
    }
    return items;
  }, [items, activeTab]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    return tabScopedItems.filter((item) => {
      const q = searchQuery.toLowerCase();
      return (
        item.originalName.toLowerCase().includes(q) ||
        (item.nomorPr && item.nomorPr.toLowerCase().includes(q)) ||
        (item.nomorPo && item.nomorPo.toLowerCase().includes(q)) ||
        (item.vendor && item.vendor.toLowerCase().includes(q))
      );
    });
  }, [tabScopedItems, searchQuery]);

  // Expand / collapse helper
  const toggleGroupExpand = (key: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Group items dynamically by PR or PO
  const groupedGaItems = useMemo(() => {
    const groups: { [key: string]: ProcurementTracking[] } = {};

    filteredItems.forEach(item => {
      const key = groupingMode === 'PR' 
        ? (item.nomorPr?.trim() || 'DRAFT')
        : (item.nomorPo?.trim() || 'BELUM_ADA_PO');
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (groupingMode === 'PR') {
        if (a === 'DRAFT') return -1;
        if (b === 'DRAFT') return 1;
        return b.localeCompare(a);
      } else {
        if (a === 'BELUM_ADA_PO') return -1;
        if (b === 'BELUM_ADA_PO') return 1;
        return b.localeCompare(a);
      }
    });

    return sortedKeys.map(key => {
      const itemsInGroup = groups[key];
      let totalQty = 0;
      let totalCost = 0;
      const vendorsSet = new Set<string>();
      const posSet = new Set<string>();
      const prsSet = new Set<string>();
      let allDone = true;
      let someDone = false;
      let belumGrCount = 0;
      
      let oldestDate: Date | null = null;
      let latestReceiveDate: Date | null = null;

      for (const item of itemsInGroup) {
        totalQty += item.qty;
        totalCost += (Number(item.harga) || 0) * item.qty;
        if (item.vendor?.trim()) vendorsSet.add(item.vendor.trim());
        if (item.nomorPo?.trim()) posSet.add(item.nomorPo.trim());
        if (item.nomorPr?.trim()) prsSet.add(item.nomorPr.trim());
        
        const isReceived = item.status === 'RECEIVED';
        if (isReceived) {
          someDone = true;
        } else {
          allDone = false;
        }

        if (item.nomorPo && !item.grDone) {
          belumGrCount++;
        }

        const dateL = new Date(item.tanggalPesan);
        if (!oldestDate || dateL.getTime() < oldestDate.getTime()) {
          oldestDate = dateL;
        }

        if (item.tanggalTerima) {
          const rxDate = new Date(item.tanggalTerima);
          if (!latestReceiveDate || rxDate.getTime() > latestReceiveDate.getTime()) {
            latestReceiveDate = rxDate;
          }
        }
      }

      let overallStatus: 'DRAFT' | 'PR_PROCESS' | 'PO_ACTIVE' | 'PARTIAL' | 'DONE' = 'PR_PROCESS';
      if (groupingMode === 'PR') {
        if (key === 'DRAFT') {
          overallStatus = 'DRAFT';
        } else if (allDone) {
          overallStatus = 'DONE';
        } else if (someDone) {
          overallStatus = 'PARTIAL';
        } else if (posSet.size > 0) {
          overallStatus = 'PO_ACTIVE';
        } else {
          overallStatus = 'PR_PROCESS';
        }
      } else {
        if (key === 'BELUM_ADA_PO') {
          overallStatus = 'PR_PROCESS';
        } else if (allDone) {
          overallStatus = 'DONE';
        } else if (someDone) {
          overallStatus = 'PARTIAL';
        } else {
          overallStatus = 'PO_ACTIVE';
        }
      }

      let daysRunningStr = '';
      if (oldestDate) {
        const end = allDone && latestReceiveDate ? latestReceiveDate : new Date();
        const diff = end.getTime() - oldestDate.getTime();
        const days = Math.max(0, parseFloat((diff / (1000 * 60 * 60 * 24)).toFixed(1)));
        daysRunningStr = `${days} Hari`;
      } else {
        daysRunningStr = '—';
      }

      return {
        key,
        nomorPr: groupingMode === 'PR' ? (key === 'DRAFT' ? null : key) : (Array.from(prsSet).join(', ') || null),
        nomorPo: groupingMode === 'PO' ? (key === 'BELUM_ADA_PO' ? null : key) : (Array.from(posSet).join(', ') || null),
        items: itemsInGroup,
        totalQty,
        totalCost,
        vendors: Array.from(vendorsSet).join(', ') || '—',
        poNumbers: Array.from(posSet).join(', ') || '—',
        prNumbers: Array.from(prsSet).join(', ') || '—',
        overallStatus,
        daysRunningStr,
        oldestDateStr: oldestDate ? oldestDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        belumGrCount,
        hasPo: posSet.size > 0,
      };
    });
  }, [filteredItems, groupingMode]);

  return (
    <div className="ga-root" style={{ padding: '24px', flex: 1 }}>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div className="flex-between" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="page-title" style={{ fontSize: '24px', fontWeight: '800', color: 'var(--ga-tx)' }}>Pelacakan Pesanan GA</div>
            <div className="page-sub" style={{ fontSize: '14px', color: 'var(--ga-tx2)', marginTop: '4px' }}>
              Pantau status pesanan PR/PO dari Odoo dan catat penerimaan barang ke gudang GA
            </div>
          </div>
          
          <div className="ga-page-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowSettingsModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '40px', fontWeight: '600' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Pengaturan Odoo
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleSyncOdoo}
              disabled={syncing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                height: '40px',
                borderColor: 'var(--ga-accent)',
                color: 'var(--ga-accent)',
                fontWeight: '600',
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={syncing ? 'animate-spin' : ''}
                aria-hidden="true"
              >
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              {syncing ? 'Menghubungkan Odoo…' : 'Sinkronisasi Odoo'}
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                resetAddForm();
                setEditItem(null);
                setShowAddModal(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '40px', fontWeight: '600' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Tambah Pesanan
            </button>
          </div>
        </div>

        {/* Status Indicator */}
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: odooSessionId ? 'var(--ga-grn)' : 'var(--ga-red)',
            }}
          />
          <span style={{ color: 'var(--ga-tx2)' }}>
            Status Integrasi Odoo:{' '}
            <strong style={{ color: odooSessionId ? 'var(--ga-tx)' : 'var(--ga-tx3)' }}>
              {odooSessionId ? 'Koneksi Terkonfigurasi (Cookie Session Terpasang)' : 'Belum Terkonfigurasi (Mode Manual)'}
            </strong>
          </span>
        </div>
      </div>

      <div className="page-body">
        {/* Navigation Tabs & Search */}
        <div
          className="flex-between"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="nav-wrap" style={{ display: 'flex', gap: '4px', margin: 0 }} role="tablist" aria-label="Status Pesanan">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'ACTIVE'}
                className={`ntab ${activeTab === 'ACTIVE' ? 'act-in' : ''}`}
                onClick={() => setActiveTab('ACTIVE')}
                style={{ minWidth: '130px', textAlign: 'center', fontWeight: '600' }}
              >
                ⏳ Pesanan Aktif ({items.filter(i => i.status === 'ORDERED').length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'RECEIVED'}
                className={`ntab ${activeTab === 'RECEIVED' ? 'act-rp' : ''}`}
                onClick={() => setActiveTab('RECEIVED')}
                style={{ minWidth: '130px', textAlign: 'center', fontWeight: '600' }}
              >
                📦 Riwayat Terima ({items.filter(i => i.status === 'RECEIVED').length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'ALL'}
                className={`ntab ${activeTab === 'ALL' ? 'act-out' : ''}`}
                onClick={() => setActiveTab('ALL')}
                style={{ minWidth: '130px', textAlign: 'center', fontWeight: '600' }}
              >
                🌐 Semua Dokumen ({items.length})
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 8, border: '1px solid var(--ga-br)' }}>
              <button
                type="button"
                onClick={() => setGroupingMode('PR')}
                style={{
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: groupingMode === 'PR' ? 'var(--ga-sf3)' : 'transparent',
                  color: groupingMode === 'PR' ? 'var(--ga-accent)' : 'var(--ga-tx3)',
                  boxShadow: groupingMode === 'PR' ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                📋 Nomor PR
              </button>
              <button
                type="button"
                onClick={() => setGroupingMode('PO')}
                style={{
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: groupingMode === 'PO' ? 'var(--ga-sf3)' : 'transparent',
                  color: groupingMode === 'PO' ? 'var(--ga-accent)' : 'var(--ga-tx3)',
                  boxShadow: groupingMode === 'PO' ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                🚢 Nomor PO & Vendor
              </button>
            </div>
          </div>

          <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'var(--ga-sf2)', borderRadius: 'var(--ga-rs)', border: '1px solid var(--ga-br)', padding: '0 12px', height: '40px', width: '300px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ga-tx3)', marginRight: '8px' }} aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Cari nama barang, PO, PR, atau vendor…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: 'none', border: 'none', color: 'var(--ga-tx)', width: '100%', outline: 'none', fontSize: '13px' }}
            />
          </div>
        </div>

        {/* GROUPED ACCORDION PR LIST */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groupedGaItems.map((group) => {
            const isPrDraft = groupingMode === 'PR' ? group.nomorPr === null : group.nomorPo === null;
            const prKey = group.key;
            const isExpanded = !!expandedGroups[prKey];

            // Determine status color and text for header
            let statusBadge = null;
            if (groupingMode === 'PR') {
              if (isPrDraft) {
                statusBadge = <span className="badge badge-ylw" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>📋 Draft / Pending PR</span>;
              } else if (group.overallStatus === 'DONE') {
                statusBadge = <span className="badge badge-grn" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>✓ Diterima Lengkap</span>;
              } else if (group.overallStatus === 'PARTIAL') {
                statusBadge = <span className="badge badge-ylw" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, background: 'var(--ylw-d)', color: 'var(--ylw)' }}>⏳ Sebagian Diterima</span>;
              } else if (group.overallStatus === 'PO_ACTIVE') {
                statusBadge = <span className="badge" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, background: 'var(--ga-accent-d)', color: 'var(--ga-accent)', border: '1px solid rgba(251, 146, 60, 0.3)' }}>🚢 Sedang Diproses (PO)</span>;
              } else {
                statusBadge = <span className="badge badge-blu" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>📝 Pengajuan PR GA</span>;
              }
            } else {
              if (isPrDraft) {
                statusBadge = <span className="badge badge-ylw" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>⏳ Tahap PR / GA</span>;
              } else if (group.overallStatus === 'DONE') {
                statusBadge = <span className="badge badge-grn" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>✓ Diterima Lengkap</span>;
              } else if (group.overallStatus === 'PARTIAL') {
                statusBadge = <span className="badge badge-ylw" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, background: 'var(--ylw-d)', color: 'var(--ylw)' }}>⏳ Sebagian Diterima</span>;
              } else {
                statusBadge = <span className="badge" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, background: 'var(--ga-accent-d)', color: 'var(--ga-accent)', border: '1px solid rgba(251, 146, 60, 0.3)' }}>🚢 Sedang Diproses (PO)</span>;
              }
            }

            return (
              <div 
                key={prKey} 
                className="card" 
                style={{ 
                  overflow: 'hidden', 
                  borderLeft: isPrDraft ? '4px solid var(--ga-accent)' : '1px solid var(--ga-br)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}
              >
                {/* GROUP CARD HEADER */}
                <div 
                  onClick={() => toggleGroupExpand(prKey)}
                  style={{ 
                    padding: '16px 20px', 
                    background: isPrDraft ? 'rgba(251, 146, 60, 0.02)' : 'var(--ga-sf2)',
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    userSelect: 'text',
                    borderBottom: isExpanded ? '1px solid var(--ga-br)' : 'none',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ga-sf3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = isPrDraft ? 'rgba(251, 146, 60, 0.02)' : 'var(--ga-sf2)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, flexWrap: 'wrap' }}>
                    {/* Expand Chevron */}
                    <span style={{ fontSize: 12, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--ga-tx3)' }}>
                      ▶
                    </span>

                    {/* PR/PO Info */}
                    <div>
                      {groupingMode === 'PR' ? (
                        isPrDraft ? (
                          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ga-accent)' }}>
                            📝 DRAFT PENDING / BELUM ADA NO PR
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--ga-tx3)', fontWeight: 600 }}>NOMOR PR:</span>
                            <span 
                              className="badge badge-ylw" 
                              style={{ fontSize: 12, padding: '2px 8px', fontWeight: 800, cursor: 'text', userSelect: 'text' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {group.nomorPr}
                            </span>
                          </div>
                        )
                      ) : (
                        isPrDraft ? (
                          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ga-accent)' }}>
                            ⏳ TAHAP PR / BELUM TERBIT PO
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--ga-tx3)', fontWeight: 600 }}>NOMOR PO:</span>
                            <span 
                              className="badge" 
                              style={{ fontSize: 12, padding: '2px 8px', fontWeight: 800, cursor: 'text', userSelect: 'text', background: 'var(--ga-accent-d)', color: 'var(--ga-accent)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {group.nomorPo}
                            </span>
                          </div>
                        )
                      )}
                      
                      <div style={{ fontSize: 10, color: 'var(--ga-tx3)', marginTop: 4 }}>
                        {groupingMode === 'PR' ? 'Tanggal Pengajuan: ' : 'Tanggal Pengadaan: ' }
                        <strong style={{ color: 'var(--ga-tx2)' }}>{group.oldestDateStr}</strong> · Lead Time: <strong style={{ color: 'var(--ga-tx)' }}>{group.daysRunningStr}</strong>
                      </div>
                    </div>

                    {/* Secondary Badges (PO numbers if grouping by PR, or PR numbers if grouping by PO) */}
                    {groupingMode === 'PR' ? (
                      !isPrDraft && group.poNumbers !== '—' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9, color: 'var(--ga-tx3)', fontWeight: 600 }}>PO NO:</span>
                          {group.poNumbers.split(', ').map(po => (
                            <span 
                              key={po} 
                              className="badge" 
                              style={{ fontSize: 11, padding: '2px 8px', fontWeight: 800, cursor: 'text', userSelect: 'text', background: 'var(--ga-accent-d)', color: 'var(--ga-accent)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {po}
                            </span>
                          ))}
                        </div>
                      )
                    ) : (
                      !isPrDraft && group.prNumbers !== '—' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9, color: 'var(--ga-tx3)', fontWeight: 600 }}>PR NO:</span>
                          {group.prNumbers.split(', ').map(pr => (
                            <span 
                              key={pr} 
                              className="badge badge-ylw" 
                              style={{ fontSize: 11, padding: '2px 8px', fontWeight: 800, cursor: 'text', userSelect: 'text' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {pr}
                            </span>
                          ))}
                        </div>
                      )
                    )}

                    {/* Vendor summary */}
                    <div style={{ fontSize: 11, color: 'var(--ga-tx3)' }}>
                      Vendor: <span style={{ color: 'var(--ga-tx2)', fontWeight: 600 }}>{group.vendors}</span>
                    </div>
                  </div>

                  {/* Summary Pricing & Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--ga-tx)' }}>
                        {formatRupiah(group.totalCost)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--ga-tx3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{group.items.length} Item ({group.totalQty} Pcs)</span>
                        {group.hasPo && (
                          <>
                            ·
                            {group.belumGrCount > 0 ? (
                              <span className="badge" style={{ fontSize: 9, padding: '2px 6px', fontWeight: 800, background: 'rgba(234, 179, 8, 0.15)', color: '#EAB308', border: '1px solid rgba(234, 179, 8, 0.35)' }} title="Belum GR di Odoo">
                                ⚠️ {group.belumGrCount} Belum GR Odoo
                              </span>
                            ) : (
                              <span className="badge badge-grn" style={{ fontSize: 9, padding: '2px 6px', fontWeight: 800 }}>
                                ✓ Semua GR Odoo
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    
                    {statusBadge}
                  </div>
                </div>

                {/* GROUP EXPANDED DETAIL VIEW */}
                {isExpanded && (
                  <div style={{ padding: '0 0 10px 0', background: 'rgba(255,255,255,0.01)' }}>
                    <div className="table-wrap" style={{ overflowX: 'auto', border: 'none', borderRadius: 0 }}>
                      <table className="table-clean" style={{ minWidth: 1000, background: 'transparent' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.1)' }}>
                            <th>Nama Barang (Keterangan)</th>
                            <th style={{ width: '80px', textAlign: 'center' }}>Qty</th>
                            <th style={{ width: '140px' }}>Estimasi Harga</th>
                            <th>Vendor</th>
                            <th style={{ width: '120px' }}>{activeTab === 'ACTIVE' ? 'Tgl Pesan' : 'Tgl Terima'}</th>
                            <th style={{ width: '150px', textAlign: 'right', paddingRight: 20 }}>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => (
                            <tr key={item.id}>
                              <td style={{ verticalAlign: 'middle' }}>
                                <div style={{ fontWeight: '600', color: 'var(--ga-tx)' }}>{item.originalName}</div>
                                {item.itemId ? (
                                  <div style={{ fontSize: '11px', color: 'var(--ga-grn)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Terhubung Master: {item.itemId}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '11px', color: 'var(--red)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    ⚠️ Unlinked / General
                                  </div>
                                )}
                                {item.keterangan && (
                                  <div style={{ fontSize: '11px', color: 'var(--ga-tx3)', marginTop: '2px', fontStyle: 'italic', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '280px' }} title={item.keterangan}>
                                    {item.keterangan}
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 'bold', verticalAlign: 'middle' }}>
                                {item.qty} <span style={{ fontSize: '10px', color: 'var(--ga-tx3)', fontWeight: 'normal' }}>{item.item?.uom || 'Pcs'}</span>
                              </td>
                              <td style={{ verticalAlign: 'middle' }}>
                                {formatRupiah(item.harga)}
                              </td>
                              <td style={{ color: 'var(--ga-tx2)', verticalAlign: 'middle' }}>
                                {item.vendor || '—'}
                              </td>
                              <td style={{ color: 'var(--ga-tx2)', fontSize: '12px', verticalAlign: 'middle' }}>
                                {item.status === 'ORDERED'
                                  ? new Date(item.tanggalPesan).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                                  : item.tanggalTerima
                                  ? new Date(item.tanggalTerima).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                                  : '—'}
                              </td>
                              <td style={{ textAlign: 'right', verticalAlign: 'middle', paddingRight: 20 }}>
                                {item.status === 'ORDERED' ? (
                                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => openEditModal(item)}
                                      style={{ padding: '6px 8px' }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-primary btn-sm"
                                      onClick={() => openReceiveModal(item)}
                                      style={{ background: 'var(--ga-grn)', borderColor: 'var(--ga-grn)', color: '#fff', padding: '6px 12px', fontWeight: 'bold' }}
                                    >
                                      Terima
                                    </button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-end' }}>
                                    <span
                                      className={item.isStocked ? 'badge badge-grn' : 'badge badge-blu'}
                                      style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', padding: '4px 8px' }}
                                    >
                                      {item.isStocked ? 'Masuk Stok' : 'Pemakaian Langsung'}
                                    </span>
                                    {!item.grDone && (
                                      <span
                                        title={`Nomor ${item.nomorPr || item.nomorPo || 'PR/PO ini'} belum dikonfirmasi GR di Odoo. Minta SPV untuk melakukan GR, lalu klik Sinkronisasi Odoo.`}
                                        style={{
                                          fontSize: '10px',
                                          fontWeight: 'bold',
                                          padding: '3px 8px',
                                          borderRadius: '4px',
                                          background: 'rgba(234, 179, 8, 0.15)',
                                          color: '#EAB308',
                                          border: '1px solid rgba(234, 179, 8, 0.35)',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          cursor: 'help',
                                        }}
                                      >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                          <line x1="12" y1="9" x2="12" y2="13" />
                                          <line x1="12" y1="17" x2="12.01" y2="17" />
                                        </svg>
                                        Belum di-GR Odoo
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {groupedGaItems.length === 0 && !loading && (
            <div className="card" style={{ padding: '36px', textAlign: 'center', color: 'var(--ga-tx3)' }}>
              Tidak ada data pesanan ditemukan.
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: ODOO SETTINGS */}
      {showSettingsModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, zIndex: 1000 }}>
          <form onSubmit={handleSaveSettings} className="modal-box" style={{ width: '420px', padding: '24px', borderRadius: 'var(--ga-r)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ga-br)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div className="modal-title" style={{ fontSize: '16px', fontWeight: 'bold' }}>Pengaturan Integrasi Odoo</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowSettingsModal(false)} style={{ padding: '4px 8px' }}>Tutup</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
              <div>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Cookie session_id Odoo</label>
                <input
                  type="text"
                  className="form-input"
                  value={odooSessionId}
                  onChange={(e) => setOdooSessionId(e.target.value)}
                  placeholder="Masukkan session_id dari Browser Cookie..."
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                  required
                />
                <small style={{ color: 'var(--ga-tx3)', marginTop: '4px', display: 'block', fontSize: '11px', lineHeight: '1.4' }}>
                  Cookie ini digunakan untuk otentikasi aman ke API Odoo foomx.odoo.com atas nama akun Anda.
                </small>
              </div>
              <div>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Odoo User ID (UID)</label>
                <input
                  type="number"
                  className="form-input"
                  value={odooUid}
                  onChange={(e) => setOdooUid(e.target.value)}
                  placeholder="Contoh: 34"
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                  required
                />
                <small style={{ color: 'var(--ga-tx3)', marginTop: '4px', display: 'block', fontSize: '11px' }}>
                  User ID Odoo Anda untuk memfilter pengadaan buatan Anda saja (default: 34).
                </small>
              </div>
            </div>
            <div className="modal-footer" style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid var(--ga-br)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowSettingsModal(false)}>Batal</button>
              <button type="submit" className="btn btn-primary" style={{ fontWeight: '600' }}>Simpan Pengaturan</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT ORDER */}
      {showAddModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, zIndex: 1000 }}>
          <form onSubmit={handleAddSubmit} className="modal-box" style={{ width: '500px', padding: '24px', borderRadius: 'var(--ga-r)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ga-br)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div className="modal-title" style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {editItem ? 'Edit Pelacakan Pesanan' : 'Tambah Pelacakan Pesanan Baru'}
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddModal(false)} style={{ padding: '4px 8px' }}>Tutup</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', paddingRight: '4px', flex: 1 }}>
              <div>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Hubungkan ke Master Barang GA</label>
                <select
                  className="form-select"
                  value={addForm.itemId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    const matched = masterItems.find((m) => m.id === selectedId);
                    setAddForm((prev) => ({
                      ...prev,
                      itemId: selectedId,
                      originalName: matched ? matched.nama : prev.originalName,
                      harga: matched ? String(matched.harga) : prev.harga,
                    }));
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                >
                  <option value="">-- Barang tidak terdaftar / Barang Baru --</option>
                  {masterItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nama} ({item.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Nama Barang (Deskripsi)</label>
                <input
                  type="text"
                  className="form-input"
                  value={addForm.originalName}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, originalName: e.target.value }))}
                  placeholder="Ketik nama barang jika tidak terhubung Master..."
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Jumlah (Qty)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={addForm.qty}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, qty: Math.max(1, Number(e.target.value)) }))}
                    min="1"
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                    required
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Estimasi Harga Satuan</label>
                  <input
                    type="number"
                    className="form-input"
                    value={addForm.harga}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, harga: e.target.value }))}
                    placeholder="Rp"
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>No. PR (Odoo)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={addForm.nomorPr}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, nomorPr: e.target.value }))}
                    placeholder="Contoh: PR/2026/0002"
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>No. PO (Odoo)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={addForm.nomorPo}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, nomorPo: e.target.value }))}
                    placeholder="Contoh: PO2600201"
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                  />
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Nama Vendor / Pemasok</label>
                <input
                  type="text"
                  className="form-input"
                  value={addForm.vendor}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, vendor: e.target.value }))}
                  placeholder="Nama vendor..."
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <input
                  type="checkbox"
                  id="isStockedCheckbox"
                  checked={addForm.isStocked}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, isStocked: e.target.checked }))}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="isStockedCheckbox" style={{ fontSize: '12px', cursor: 'pointer', color: 'var(--ga-tx)' }}>
                  Masuk ke Gudang / Stok GA saat diterima (Bukan Pemakaian Langsung)
                </label>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Keterangan Tambahan</label>
                <textarea
                  className="form-input"
                  value={addForm.keterangan}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, keterangan: e.target.value }))}
                  placeholder="Keterangan kebutuhan atau PIC peminta..."
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)', height: '60px', resize: 'none' }}
                />
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid var(--ga-br)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ fontWeight: '600' }}>
                {submitting ? 'Menyimpan…' : editItem ? 'Simpan Perubahan' : 'Mulai Lacak Pesanan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: RECEIVE CONFIRMATION */}
      {showReceiveModal && selectedTracking && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, zIndex: 1000 }}>
          <form onSubmit={handleReceiveSubmit} className="modal-box" style={{ width: '450px', padding: '24px', borderRadius: 'var(--ga-r)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ga-br)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div className="modal-title" style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--ga-grn)' }}>Penerimaan Barang Pesanan</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setShowReceiveModal(false); setSelectedTracking(null); }} style={{ padding: '4px 8px' }}>Tutup</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
              <div style={{ background: 'var(--ga-sf2)', padding: '10px 14px', borderRadius: 'var(--ga-rs)', border: '1px solid var(--ga-br)' }}>
                <div style={{ fontSize: '11px', color: 'var(--ga-tx3)' }}>Barang yang dipesan:</div>
                <strong style={{ color: 'var(--ga-tx)', display: 'block', marginTop: '2px', fontSize: '14px' }}>{selectedTracking.originalName}</strong>
                <div style={{ fontSize: '12px', color: 'var(--ga-tx2)', marginTop: '4px' }}>
                  Ordered: <strong>{selectedTracking.qty} {selectedTracking.item?.uom || 'Pcs'}</strong>
                  {selectedTracking.nomorPo && ` · PO: ${selectedTracking.nomorPo}`}
                </div>
              </div>

              <div>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Hubungkan ke Master Barang GA (Wajib jika Masuk Stok)</label>
                <select
                  className="form-select"
                  value={receiveForm.itemId}
                  onChange={(e) => setReceiveForm((prev) => ({ ...prev, itemId: e.target.value }))}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                  required={receiveForm.isStocked}
                >
                  <option value="">-- Pilih Master Barang --</option>
                  {masterItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nama} ({item.id})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Tanggal Terima</label>
                  <input
                    type="date"
                    className="form-input"
                    value={receiveForm.tanggalTerima}
                    onChange={(e) => setReceiveForm((prev) => ({ ...prev, tanggalTerima: e.target.value }))}
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                    required
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Jumlah Diterima (Qty)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={receiveForm.qty}
                    onChange={(e) => setReceiveForm((prev) => ({ ...prev, qty: Math.max(1, Number(e.target.value)) }))}
                    min="1"
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Harga Satuan Aktual</label>
                  <input
                    type="number"
                    className="form-input"
                    value={receiveForm.harga}
                    onChange={(e) => setReceiveForm((prev) => ({ ...prev, harga: e.target.value }))}
                    placeholder="Rp"
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                  />
                </div>
                <div>
                  <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Vendor Aktual</label>
                  <input
                    type="text"
                    className="form-input"
                    value={receiveForm.vendor}
                    onChange={(e) => setReceiveForm((prev) => ({ ...prev, vendor: e.target.value }))}
                    placeholder="Vendor..."
                    style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <input
                  type="checkbox"
                  id="isStockedReceiveCheckbox"
                  checked={receiveForm.isStocked}
                  onChange={(e) => setReceiveForm((prev) => ({ ...prev, isStocked: e.target.checked }))}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="isStockedReceiveCheckbox" style={{ fontSize: '12px', cursor: 'pointer', color: 'var(--ga-tx)' }}>
                  Masuk ke Gudang / Stok GA (Jika tidak dicentang, dicatat sebagai Pemakaian Langsung)
                </label>
              </div>
            </div>

            <div className="modal-footer" style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid var(--ga-br)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => { setShowReceiveModal(false); setSelectedTracking(null); }}>Batal</button>
              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ background: 'var(--ga-grn)', borderColor: 'var(--ga-grn)', color: '#fff', fontWeight: '600' }}>
                {submitting ? 'Memproses…' : 'Catat Penerimaan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
