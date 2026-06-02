'use client';
import { useState, useEffect, useMemo, Fragment } from 'react';

type Sparepart = {
  id: string;
  nama: string;
  uom: string;
  lokasi: string | null;
  harga: number;
  minQty: number;
  namaAlias?: string | null;
  linkReference?: string | null;
  alasan?: string | null;
  purchasingStatus?: string | null;
  odooNotes?: string | null;
  vendor?: string | null;
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
  odooNotes?: string | null;
  isPengadaanBaru?: boolean;
};

export default function ProcurementTrackingPage() {
  const [items, setItems] = useState<TrackingItem[]>([]);
  const [spareparts, setSpareparts] = useState<Sparepart[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Saved configurations
  const [scriptUrl, setScriptUrl] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [odooPassword, setOdooPassword] = useState('');
  const [odooDb, setOdooDb] = useState('foom-production-5808833');
  const [odooUid, setOdooUid] = useState('34');
  const [odooSessionId, setOdooSessionId] = useState('');
  
  // Modal states
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showScriptCodeModal, setShowScriptCodeModal] = useState(false);
  
  // Temporary Settings states
  const [tempSheetUrl, setTempSheetUrl] = useState('');
  const [tempScriptUrl, setTempScriptUrl] = useState('');
  const [tempOdooPassword, setTempOdooPassword] = useState('');
  const [tempOdooDb, setTempOdooDb] = useState('foom-production-5808833');
  const [tempOdooUid, setTempOdooUid] = useState('34');
  const [tempOdooSessionId, setTempOdooSessionId] = useState('');
  const [csvFileText, setCsvFileText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [manualSyncStatus, setManualSyncStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  
  // New Request Form states
  const [reqOriginalName, setReqOriginalName] = useState('');
  const [reqSparepartId, setReqSparepartId] = useState('');
  const [reqKeterangan, setReqKeterangan] = useState('consumable');
  const [reqQty, setReqQty] = useState(1);
  const [reqProductCategory, setReqProductCategory] = useState('Sparepart');
  const [reqReason, setReqReason] = useState('');
  const [reqUrgency, setReqUrgency] = useState('Normal');
  const [reqLinkReferences, setReqLinkReferences] = useState('');
  const [reqIsStocked, setReqIsStocked] = useState(true); // Default true for maintenance parts
  const [requestStatus, setRequestStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // MTC PRO added states
  const [reqVendor, setReqVendor] = useState('');
  const [isPengadaanBaru, setIsPengadaanBaru] = useState(false);
  const [reqNamaAlias, setReqNamaAlias] = useState('');
  const [reqLinkReference, setReqLinkReference] = useState('');
  const [reqAlasan, setReqAlasan] = useState('');

  // Catalog search/autocomplete states
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showCatalogDropdown, setShowCatalogDropdown] = useState(false);

  // Odoo processed modal state
  const [showOdooProcessedModal, setShowOdooProcessedModal] = useState(false);
  const [odooProcessedItem, setOdooProcessedItem] = useState<TrackingItem | null>(null);
  const [odooProcessedPrNo, setOdooProcessedPrNo] = useState('');
  const [odooProcessedStatus, setOdooProcessedStatus] = useState<'DRAFT' | 'TO_APPROVE'>('DRAFT');

  // Expanded rows state for Odoo chatter timeline
  const [expandedRows, setExpandedRows] = useState<{ [key: number]: boolean }>({});
  
  const toggleRowExpand = (itemId: number) => {
    setExpandedRows(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const openOdooProcessedModal = (item: TrackingItem) => {
    setOdooProcessedItem(item);
    setOdooProcessedPrNo(item.nomorPr || '');
    setOdooProcessedStatus('DRAFT');
    setShowOdooProcessedModal(true);
  };

  // Quick Copy Popover state
  const [activeCopyPopoverId, setActiveCopyPopoverId] = useState<number | null>(null);
  
  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  
  // Expanded PR Groups state (default: expand drafts/new items)
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({
    'DRAFT': true
  });
  
  // Tabs for main view (updated to support Odoo status types)
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'DRAFT_PR' | 'TO_APPROVE' | 'APPROVED' | 'PO_RFQ' | 'RECEIVED' | 'ALL'>('ACTIVE');
  
  // Link Modal States
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingItem, setLinkingItem] = useState<TrackingItem | null>(null);
  const [linkSearch, setLinkSearch] = useState('');

  function generateAutoAlias(fullName: string) {
    const clean = fullName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return clean.replace(/\b\w/g, char => char.toUpperCase());
  }

  function getStatusBadgeStyles(status: string) {
    switch (status.toUpperCase()) {
      case 'DRAFT':
        return { background: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db' };
      case 'TO_APPROVE':
        return { background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d' };
      case 'APPROVED':
        return { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' };
      case 'RFQ':
        return { background: '#f9f5f7', color: '#875A7B', border: '1px solid #e9d5df' };
      case 'PO':
        return { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' };
      case 'CANCELLED':
        return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' };
      default:
        return { background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' };
    }
  }
  
  async function handleOdooProcessedSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!odooProcessedItem) return;
    
    setActionLoading(`odoo-${odooProcessedItem.id}`);
    try {
      const res = await fetch('/api/mtc/procurement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: odooProcessedItem.id,
          nomorPr: odooProcessedPrNo,
          statusPr: odooProcessedStatus, // DRAFT / TO_APPROVE
        })
      });
      const json = await res.json();
      if (json.success) {
        alert('Status PR Odoo resmi berhasil dicatat!');
        setShowOdooProcessedModal(false);
        setOdooProcessedItem(null);
        await fetchData();
      } else {
        alert(`Gagal memperbarui status: ${json.error}`);
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(null);
    }
  }

  // Receive Modal States
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingItem, setReceivingItem] = useState<TrackingItem | null>(null);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [receivePrice, setReceivePrice] = useState(0);
  const [receiveVendor, setReceiveVendor] = useState('');
  const [isStocked, setIsStocked] = useState(true); // true = Restock, false = Direct Use

  // Edit SCM Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<TrackingItem | null>(null);
  const [editPrNo, setEditPrNo] = useState('');
  const [editPoNo, setEditPoNo] = useState('');
  const [editVendor, setEditVendor] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [editQty, setEditQty] = useState(1);
  const [editEta, setEditEta] = useState('');
  const [editGrLink, setEditGrLink] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editKeterangan, setEditKeterangan] = useState('');
  const [editUrgency, setEditUrgency] = useState('Normal');

  // Load configuration from localStorage on mount
  useEffect(() => {
    fetchData();
    fetchSpareparts();
    
    if (typeof window !== 'undefined') {
      const savedScriptUrl = localStorage.getItem('mtc_procurement_script_url');
      if (savedScriptUrl) {
        setScriptUrl(savedScriptUrl);
        setTempScriptUrl(savedScriptUrl);
      }
      const savedSheetUrl = localStorage.getItem('mtc_procurement_sheet_url');
      if (savedSheetUrl) {
        setSheetUrl(savedSheetUrl);
        setTempSheetUrl(savedSheetUrl);
      }
      const savedOdooPassword = localStorage.getItem('mtc_odoo_password') || '';
      if (savedOdooPassword) {
        setOdooPassword(savedOdooPassword);
        setTempOdooPassword(savedOdooPassword);
      }
      const savedOdooDb = localStorage.getItem('mtc_odoo_db') || 'foom-production-5808833';
      setOdooDb(savedOdooDb);
      setTempOdooDb(savedOdooDb);
      
      const savedOdooUid = localStorage.getItem('mtc_odoo_uid') || '34';
      setOdooUid(savedOdooUid);
      setTempOdooUid(savedOdooUid);
      
      const savedOdooSessionId = localStorage.getItem('mtc_odoo_session_id') || '';
      if (savedOdooSessionId) {
        setOdooSessionId(savedOdooSessionId);
        setTempOdooSessionId(savedOdooSessionId);
      }

      // Real-Time Auto Sync on page load (silently in background)
      if (savedSheetUrl && (savedOdooPassword || savedOdooSessionId)) {
        fetch('/api/mtc/odoo/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sheetUrl: savedSheetUrl.trim(),
            odooPassword: savedOdooPassword,
            odooDb: savedOdooDb,
            odooUid: parseInt(savedOdooUid) || 34,
            odooSessionId: savedOdooSessionId
          })
        }).then(res => res.json())
          .then(json => {
            if (json.success) {
              const odooError = json.data?.odoo?.error;
              if (odooError && (odooError.toLowerCase().includes('session') || odooError.toLowerCase().includes('expired') || odooError.toLowerCase().includes('uid'))) {
                console.warn('Odoo Session Expired!');
              } else if (json.data?.odoo?.success) {
                // Silently refresh to pull real-time data
                fetchData();
                fetchSpareparts();
              }
            }
          }).catch(err => console.error('Background sync failed:', err));
      }
    }
  }, []);

  // Sync settings saver
  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setScriptUrl(tempScriptUrl);
    setSheetUrl(tempSheetUrl);
    setOdooPassword(tempOdooPassword);
    setOdooDb(tempOdooDb);
    setOdooUid(tempOdooUid);
    setOdooSessionId(tempOdooSessionId);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('mtc_procurement_script_url', tempScriptUrl);
      localStorage.setItem('mtc_procurement_sheet_url', tempSheetUrl);
      localStorage.setItem('mtc_odoo_password', tempOdooPassword);
      localStorage.setItem('mtc_odoo_db', tempOdooDb);
      localStorage.setItem('mtc_odoo_uid', tempOdooUid);
      localStorage.setItem('mtc_odoo_session_id', tempOdooSessionId);
    }
    
    setManualSyncStatus({ type: 'success', msg: 'Pengaturan koneksi berhasil disimpan!' });
    setTimeout(() => {
      setShowSettingsModal(false);
      setManualSyncStatus(null);
    }, 1500);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/mtc/procurement?archived=all');
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

  // One-Click Sheets & Odoo Cloud Sync
  async function handleOneClickSync() {
    if (!sheetUrl || !sheetUrl.trim()) {
      setTempSheetUrl('');
      setShowSettingsModal(true);
      alert('Silakan masukkan Link Google Sheets SCM terlebih dahulu pada menu Pengaturan (⚙️).');
      return;
    }

    setActionLoading('sync-main');
    try {
      const res = await fetch('/api/mtc/odoo/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheetUrl: sheetUrl.trim(),
          odooPassword: odooPassword,
          odooDb: odooDb,
          odooUid: parseInt(odooUid) || 34,
          odooSessionId: odooSessionId
        }),
      });
      const json = await res.json();
      if (json.success) {
        const odooError = json.data?.odoo?.error;
        if (odooError && (odooError.toLowerCase().includes('session') || odooError.toLowerCase().includes('expired') || odooError.toLowerCase().includes('uid'))) {
          alert('⚠️ Sesi Odoo (Cookie session_id) Anda telah kedaluwarsa atau tidak valid! Silakan perbarui session_id baru di menu Pengaturan (⚙️).');
        } else {
          alert('✓ Sinkronisasi Google Sheets & Odoo Cloud sukses!');
        }
        await fetchData();
        await fetchSpareparts();
      } else {
        alert(`⚠️ Gagal menyinkronkan data: ${json.error}`);
      }
    } catch (err: any) {
      alert('⚠️ Terjadi kesalahan jaringan. Coba lagi beberapa saat.');
    } finally {
      setActionLoading(null);
    }
  }

  // Manual File/Text CSV Sync
  async function handleManualSyncSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!csvFileText.trim()) return;

    setActionLoading('manual-sync');
    setManualSyncStatus(null);
    try {
      const res = await fetch('/api/mtc/procurement/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: csvFileText }),
      });
      const json = await res.json();
      if (json.success) {
        setManualSyncStatus({ type: 'success', msg: json.data?.msg || '✓ Sinkronisasi file CSV manual berhasil!' });
        setCsvFileText('');
        setCsvFileName('');
        await fetchData();
        await fetchSpareparts();
        setTimeout(() => setShowSettingsModal(false), 2000);
      } else {
        setManualSyncStatus({ type: 'error', msg: json.error || 'Gagal menyinkronkan file CSV.' });
      }
    } catch (err: any) {
      setManualSyncStatus({ type: 'error', msg: 'Koneksi jaringan bermasalah.' });
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
        setCsvFileText(event.target.result as string);
        setCsvFileName(file.name);
        setManualSyncStatus({ type: 'success', msg: `Berkas ${file.name} berhasil dimuat. Klik tombol Sync di bawah untuk memproses.` });
      }
    };
    reader.readAsText(file);
  }

  // Handle new PR Request submit (Write/Push)
  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading('request');
    setRequestStatus(null);

    const selectedSp = spareparts.find(s => s.id === reqSparepartId);
    const payload = {
      originalName: reqOriginalName,
      sparepartId: reqSparepartId || null,
      keterangan: reqKeterangan,
      qty: reqQty,
      productCategory: reqProductCategory,
      reason: isPengadaanBaru ? reqReason : 'Repeat Order',
      urgency: reqUrgency,
      linkReferences: isPengadaanBaru ? reqLinkReferences : (selectedSp?.linkReference || ''),
      isStocked: reqIsStocked,
      scriptUrl: scriptUrl || null,
      
      // MTC PRO fields expected by the backend
      isPengadaanBaru: isPengadaanBaru,
      namaAlias: isPengadaanBaru ? reqNamaAlias : (selectedSp?.namaAlias || ''),
      alasan: isPengadaanBaru ? reqReason : (selectedSp?.alasan || 'Repeat Order'),
      vendor: isPengadaanBaru ? reqVendor : (selectedSp?.vendor || ''),
      harga: isPengadaanBaru ? 0 : (selectedSp?.harga || 0),
    };

    try {
      const res = await fetch('/api/mtc/procurement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setRequestStatus({ type: 'success', msg: json.data.msg || 'Pengajuan PR berhasil disimpan!' });
        // Reset form
        setReqOriginalName('');
        setReqSparepartId('');
        setReqKeterangan('consumable');
        setReqQty(1);
        setReqProductCategory('Sparepart');
        setReqReason('');
        setReqUrgency('Normal');
        setReqLinkReferences('');
        setReqIsStocked(true);
        await fetchData();
        setTimeout(() => setShowRequestForm(false), 2500);
      } else {
        setRequestStatus({ type: 'error', msg: json.error || 'Gagal menyimpan pengajuan.' });
      }
    } catch (err) {
      setRequestStatus({ type: 'error', msg: 'Terjadi kesalahan koneksi jaringan.' });
    } finally {
      setActionLoading(null);
    }
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
    setIsStocked(item.isStocked || item.sparepartId != null);
    setShowReceiveModal(true);
  }

  function openLinkModal(item: TrackingItem) {
    setLinkingItem(item);
    setLinkSearch('');
    setShowLinkModal(true);
  }

  function openEditModal(item: TrackingItem) {
    setEditingItem(item);
    setEditPrNo(item.nomorPr || '');
    setEditPoNo(item.nomorPo || '');
    setEditVendor(item.vendor || '');
    setEditPrice(Number(item.harga) || 0);
    setEditQty(item.qty || 1);
    setEditEta(item.etaFoom ? new Date(item.etaFoom).toISOString().split('T')[0] : '');
    setEditGrLink(item.linkGr || '');
    setEditReason(item.reason || '');
    setEditCategory(item.productCategory || 'Sparepart');
    setEditKeterangan(item.keterangan || 'consumable');
    setEditUrgency(item.urgency || 'Normal');
    setShowEditModal(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;

    setActionLoading(`edit-${editingItem.id}`);
    try {
      const res = await fetch('/api/mtc/procurement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingItem.id,
          nomorPr: editPrNo,
          nomorPo: editPoNo,
          vendor: editVendor,
          harga: editPrice,
          qty: editQty,
          etaFoom: editEta || null,
          linkGr: editGrLink,
          reason: editReason,
          productCategory: editCategory,
          keterangan: editKeterangan,
          urgency: editUrgency,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert(json.data?.msg || '✓ Detail pengadaan berhasil diperbarui!');
        setShowEditModal(false);
        setEditingItem(null);
        await fetchData();
      } else {
        alert(`⚠️ Gagal memperbarui detail: ${json.error}`);
      }
    } catch (err) {
      alert('⚠️ Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(null);
    }
  }

  // Filter items in memory
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Tab filter
      const isItemReceived = !!item.tanggalTerima;
      const spStatus = (item.statusPr || 'DRAFT').toUpperCase();
      const poStatus = (item.statusPo || '').toUpperCase();

      if (activeTab === 'ACTIVE') {
        if (isItemReceived) return false;
      } else if (activeTab === 'DRAFT_PR') {
        if (isItemReceived || (spStatus !== 'DRAFT' && spStatus !== 'READY_ODOO')) return false;
      } else if (activeTab === 'TO_APPROVE') {
        if (isItemReceived || spStatus !== 'TO_APPROVE') return false;
      } else if (activeTab === 'APPROVED') {
        if (isItemReceived || spStatus !== 'APPROVED') return false;
      } else if (activeTab === 'PO_RFQ') {
        if (isItemReceived || (spStatus !== 'PO' && spStatus !== 'RFQ' && poStatus !== 'PO' && poStatus !== 'RFQ')) return false;
      } else if (activeTab === 'RECEIVED') {
        if (!isItemReceived) return false;
      }

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

      // Month & Year filter
      if (item.tanggalList) {
        const dateObj = new Date(item.tanggalList);
        if (yearFilter && dateObj.getFullYear().toString() !== yearFilter) return false;
        if (monthFilter && (dateObj.getMonth() + 1).toString() !== monthFilter) return false;
      } else if (monthFilter || yearFilter) {
        return false;
      }

      return true;
    });
  }, [items, searchQuery, urgencyFilter, categoryFilter, activeTab, monthFilter, yearFilter]);

  // Extract years dynamically
  const yearsList = useMemo(() => {
    const set = new Set<string>();
    items.forEach(item => {
      if (item.tanggalList) {
        const year = new Date(item.tanggalList).getFullYear().toString();
        set.add(year);
      }
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [items]);

  const monthsList = [
    { value: '1', label: 'Januari' },
    { value: '2', label: 'Februari' },
    { value: '3', label: 'Maret' },
    { value: '4', label: 'April' },
    { value: '5', label: 'Mei' },
    { value: '6', label: 'Juni' },
    { value: '7', label: 'Juli' },
    { value: '8', label: 'Agustus' },
    { value: '9', label: 'September' },
    { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' },
    { value: '12', label: 'Desember' }
  ];

  // Group items by nomorPr
  const groupedPrItems = useMemo(() => {
    const groups: { [key: string]: TrackingItem[] } = {};

    filteredItems.forEach(item => {
      const key = item.nomorPr?.trim() || 'DRAFT';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'DRAFT') return -1; // Drafts first
      if (b === 'DRAFT') return 1;
      return b.localeCompare(a); // Descending order of PR numbers
    });

    return sortedKeys.map(key => {
      const itemsInGroup = groups[key];
      let totalQty = 0;
      let totalCost = 0;
      const vendorsSet = new Set<string>();
      const posSet = new Set<string>();
      let hasUrgent = false;
      let allDone = true;
      let someDone = false;
      let hasPoActive = false;
      
      let oldestDate: Date | null = null;
      let latestReceiveDate: Date | null = null;

      for (const item of itemsInGroup) {
        totalQty += item.qty;
        totalCost += (Number(item.harga) || 0) * item.qty;
        if (item.vendor?.trim()) vendorsSet.add(item.vendor.trim());
        if (item.nomorPo?.trim()) posSet.add(item.nomorPo.trim());
        if (item.urgency === 'Urgent') hasUrgent = true;
        
        const isReceived = !!item.tanggalTerima;
        if (isReceived) {
          someDone = true;
        } else {
          allDone = false;
        }

        if (item.nomorPo && !item.tanggalTerima) {
          hasPoActive = true;
        }

        const dateL = new Date(item.tanggalList);
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
      if (key === 'DRAFT') {
        overallStatus = 'DRAFT';
      } else if (allDone) {
        overallStatus = 'DONE';
      } else if (someDone) {
        overallStatus = 'PARTIAL';
      } else if (hasPoActive) {
        overallStatus = 'PO_ACTIVE';
      } else {
        overallStatus = 'PR_PROCESS';
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
        nomorPr: key === 'DRAFT' ? null : key,
        items: itemsInGroup,
        totalQty,
        totalCost,
        vendors: Array.from(vendorsSet).join(', ') || '—',
        poNumbers: Array.from(posSet).join(', ') || '—',
        hasUrgent,
        overallStatus,
        daysRunningStr,
        oldestDateStr: oldestDate ? oldestDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
      };
    });
  }, [filteredItems]);

  const toggleGroupExpand = (prKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [prKey]: !prev[prKey]
    }));
  };

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
    const active = items.filter(i => !i.tanggalTerima);
    const received = items.filter(i => !!i.tanggalTerima && i.tanggalList);
    
    let totalDays = 0;
    received.forEach(item => {
      const diff = new Date(item.tanggalTerima!).getTime() - new Date(item.tanggalList).getTime();
      totalDays += Math.max(1, diff / (1000 * 60 * 60 * 24));
    });
    const avgLeadTime = received.length > 0 ? (totalDays / received.length).toFixed(1) : '—';
    const urgentCount = active.filter(i => i.urgency === 'Urgent').length;

    const today = new Date().getTime();
    const etaOverdueCount = active.filter(i => {
      if (!i.etaFoom) return false;
      return new Date(i.etaFoom).getTime() < today;
    }).length;

    const prCount = active.filter(i => i.statusPr === 'CONTINUE' && !i.nomorPo).length;
    const poCount = active.filter(i => i.nomorPo && !i.tanggalTerima).length;

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

  // Google Apps Script source code for display
  const googleScriptSource = `function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Request MTC");
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ 
        success: false, 
        error: "Tab 'Request MTC' tidak ditemukan di Spreadsheet Anda." 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = JSON.parse(e.postData.contents);
    
    // Append data baru
    sheet.appendRow([
      "", // Kolom A (Fb / ID kosong biar diisi manual atau auto-formula)
      data.originalName,
      data.mtcItemName,
      data.keterangan,
      "", // Penggunaan per bulan (kosong - dihitung avg nanti)
      data.isStocked ? "TRUE" : "FALSE", // Status rencana stock / bukan
      data.tanggalList,
      data.qty,
      data.productCategory,
      data.reason,
      data.urgency,
      data.linkReferences
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      success: true 
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ 
      success: false, 
      error: err.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  return (
    <>
      {/* HEADER SECTION */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🔍</span> Asisten Pelacakan PR / PO (SCM Sync)
          </div>
          <div className="page-sub">Kelola pengadaan suku cadang mesin, sinkronkan Google Sheets SCM, dan catat penerimaan barang langsung.</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-pur"
            onClick={() => setShowRequestForm(!showRequestForm)}
            style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 8, background: 'linear-gradient(135deg, var(--pur) 0%, #4f46e5 100%)', border: 'none', color: '#fff', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)', cursor: 'pointer' }}
          >
            {showRequestForm ? '✖ Tutup Form PR' : '➕ Buat Pengajuan PR'}
          </button>
          
          <div style={{ display: 'flex', background: 'var(--sf2)', borderRadius: 8, padding: 3, border: '1px solid var(--br)', gap: 4 }}>
            <button
              type="button"
              className="btn btn-grn"
              disabled={actionLoading === 'sync-main'}
              onClick={handleOneClickSync}
              style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              {actionLoading === 'sync-main' ? (
                <>
                  <span className="spinner" style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginRight: 4 }} />
                  Menyinkronkan...
                </>
              ) : (
                '🔄 Sinkronkan Data'
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setTempSheetUrl(sheetUrl);
                setTempScriptUrl(scriptUrl);
                setManualSyncStatus(null);
                setShowSettingsModal(true);
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, transition: 'all 0.15s', borderRadius: 6 }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--sf3)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              title="Pengaturan Koneksi Google Sheets / CSV"
            >
              ⚙️
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">

        {/* COMPACT PR SUBMISSION FORM */}
        {showRequestForm && (
          <div className="card" style={{ marginBottom: 24, border: '1px solid var(--pur)', background: 'var(--sf3)', animation: 'fadeIn 0.2s ease-out' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--br)', padding: '16px 20px' }}>
              <div className="card-title" style={{ color: 'var(--pur)', margin: 0, fontSize: 14, fontWeight: 800 }}>📝 Form Pengajuan PR Baru (MTC Maintenance)</div>
              {scriptUrl ? (
                <span className="badge badge-grn" style={{ fontSize: 9, padding: '3px 8px' }}>✓ Auto-Push ke Google Sheets Aktif</span>
              ) : (
                <span className="badge badge-ylw" style={{ fontSize: 9, padding: '3px 8px' }}>⚠️ Simpan Lokal Saja (Belum ada Link Sheets)</span>
              )}
            </div>
            <form onSubmit={handleRequestSubmit} style={{ padding: 20 }}>
              {/* MTC PRO: Mode Toggle Pill Selection */}
              <div style={{ marginBottom: 16, background: 'var(--sf2)', padding: 4, borderRadius: 8, display: 'inline-flex', border: '1px solid var(--br)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsPengadaanBaru(false);
                    setReqOriginalName('');
                    setReqSparepartId('');
                    setReqLinkReferences('');
                    setReqReason('');
                  }}
                  style={{
                    padding: '6px 16px',
                    fontSize: 11,
                    fontWeight: 800,
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: !isPengadaanBaru ? 'var(--sf3)' : 'transparent',
                    color: !isPengadaanBaru ? 'var(--pur)' : 'var(--tx3)',
                    transition: 'all 0.15s'
                  }}
                >
                  🔄 Repeat Order (Pencarian Katalog)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPengadaanBaru(true);
                    setReqOriginalName('');
                    setReqSparepartId('');
                    setReqNamaAlias('');
                    setReqLinkReferences('');
                    setReqReason('');
                    setReqVendor('');
                  }}
                  style={{
                    padding: '6px 16px',
                    fontSize: 11,
                    fontWeight: 800,
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: isPengadaanBaru ? 'var(--sf3)' : 'transparent',
                    color: isPengadaanBaru ? 'var(--pur)' : 'var(--tx3)',
                    transition: 'all 0.15s'
                  }}
                >
                  ➕ Pengadaan Baru (Entri Suku Cadang Baru)
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginBottom: 16 }}>
                
                {/* Left Column (Core info) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!isPengadaanBaru ? (
                    // Mode A: Autocomplete Catalog Search for Repeat Orders
                    <div className="form-group" style={{ position: 'relative' }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Cari Suku Cadang Resmi MTC (Autocomplete Riwayat)</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Ketik kata kunci untuk mencari di database riwayat..."
                        value={catalogSearch}
                        onChange={(e) => {
                          setCatalogSearch(e.target.value);
                          setShowCatalogDropdown(true);
                        }}
                        onFocus={() => setShowCatalogDropdown(true)}
                      />
                      
                      {showCatalogDropdown && (() => {
                        const hasSearchText = catalogSearch.trim().length > 0;
                        const displayItems = hasSearchText 
                          ? spareparts.filter(sp => 
                              sp.nama.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                              (sp.namaAlias && sp.namaAlias.toLowerCase().includes(catalogSearch.toLowerCase()))
                            ).slice(0, 8)
                          : spareparts.slice(0, 5);
                        
                        if (displayItems.length === 0 && !hasSearchText) return null;
                        
                        return (
                          <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            background: 'var(--sf2)',
                            border: '1px solid var(--br)',
                            borderRadius: 8,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                            zIndex: 99,
                            maxHeight: 220,
                            overflowY: 'auto',
                            marginTop: 6
                          }}>
                            <div style={{ padding: '6px 10px', fontSize: 9, fontWeight: 800, color: 'var(--tx3)', borderBottom: '1px solid var(--br)', textTransform: 'uppercase', background: 'rgba(0,0,0,0.1)' }}>
                              {hasSearchText ? '🔍 Hasil Pencarian Suku Cadang' : '📋 5 Suku Cadang Riwayat Teratas'}
                            </div>
                            
                            {displayItems.map((catItem, idx) => (
                              <div
                                key={idx}
                                onClick={() => {
                                  setReqOriginalName(catItem.nama);
                                  setReqSparepartId(catItem.id);
                                  setReqKeterangan('repeat order');
                                  setReqProductCategory('Sparepart');
                                  setReqIsStocked(true);
                                  setReqLinkReferences(catItem.linkReference || '');
                                  setReqReason(catItem.alasan || 'Repeat Order');
                                  
                                  setReqNamaAlias(catItem.namaAlias || '');
                                  setReqVendor(catItem.vendor || '');
                                  setReqAlasan(catItem.alasan || 'Repeat Order');
                                  setReqLinkReference(catItem.linkReference || '');
                                  
                                  setShowCatalogDropdown(false);
                                  setCatalogSearch('');
                                }}
                                style={{
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                  borderBottom: '1px solid var(--br)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  transition: 'background 0.15s'
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--sf3)')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                              >
                                <div>
                                  <div style={{ fontWeight: 700 }}>{catItem.nama}</div>
                                  <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>
                                    ID: {catItem.id} · Lokasi: {catItem.lokasi || '—'}
                                  </div>
                                </div>
                                <span className="badge badge-grn" style={{ fontSize: 8 }}>Pilih</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    // Mode B: Manual Title Case Generator for New Request
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Nama Barang Asli (Original Material Name) <span className="req" style={{ color: 'var(--red)' }}>*</span></label>
                      <input
                        type="text"
                        className="form-input"
                        required
                        placeholder="Ketik nama suku cadang panjang resmi..."
                        value={reqOriginalName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setReqOriginalName(val);
                          setReqNamaAlias(generateAutoAlias(val));
                        }}
                      />
                    </div>
                  )}

                  {isPengadaanBaru && (
                    <div className="form-group" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 11, color: 'var(--pur)' }}>Nama Alias Pendek (Title Case - Otomatis)</label>
                      <input
                        type="text"
                        className="form-input"
                        required
                        placeholder="Generate alias name..."
                        value={reqNamaAlias}
                        onChange={(e) => setReqNamaAlias(e.target.value)}
                        style={{ border: '1px solid var(--pur)', background: 'rgba(168, 85, 247, 0.02)' }}
                      />
                    </div>
                  )}

                  {isPengadaanBaru && (
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Rekomendasi Vendor / Toko</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Contoh: Tokopedia PT ABC..."
                        value={reqVendor}
                        onChange={(e) => setReqVendor(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Suku Cadang Resmi Terhubung</label>
                    <input
                      type="text"
                      className="form-input"
                      disabled
                      placeholder="Terisi otomatis saat memilih suku cadang..."
                      value={reqSparepartId ? `${reqOriginalName} (${reqSparepartId})` : '— Tanpa Koneksi (General/Suku Cadang Baru) —'}
                      style={{ opacity: 0.7, background: 'var(--sf2)' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Keterangan / Tipe Pengadaan</label>
                      <select
                        className="form-input form-select"
                        value={reqKeterangan}
                        onChange={(e) => setReqKeterangan(e.target.value)}
                        style={{ height: '38px' }}
                      >
                        <option value="consumable">consumable (Langsung habis)</option>
                        <option value="one time purchase">one time purchase (Sekali beli)</option>
                        <option value="repeat order">repeat order (Beli berkala)</option>
                        <option value="project">project (Kebutuhan project)</option>
                        <option value="tools">tools (Perkakas kerja)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Tingkat Urgensi</label>
                      <select
                        className="form-input form-select"
                        value={reqUrgency}
                        onChange={(e) => setReqUrgency(e.target.value)}
                        style={{ height: '38px' }}
                      >
                        <option value="Normal">🟢 Normal</option>
                        <option value="Urgent">🚨 Urgent / Mendesak</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Right Column (Procurement Details) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Jumlah / Qty <span className="req" style={{ color: 'var(--red)' }}>*</span></label>
                      <input
                        type="number"
                        min="1"
                        required
                        className="form-input"
                        value={reqQty}
                        onChange={(e) => setReqQty(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Kategori Produk</label>
                      <select
                        className="form-input form-select"
                        value={reqProductCategory}
                        onChange={(e) => setReqProductCategory(e.target.value)}
                        style={{ height: '38px' }}
                      >
                        <option value="Sparepart">Sparepart</option>
                        <option value="Tools">Tools (Alat Kerja)</option>
                        <option value="Special Tools">Special Tools</option>
                        <option value="Consumable">Consumable</option>
                        <option value="Lain-lain">Lain-lain</option>
                      </select>
                    </div>
                  </div>

                  {/* Rencana Masuk Stok / Direct Use selection (User's Foundation) */}
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11, marginBottom: 6, display: 'block' }}>Rencana Penyimpanan Barang (Tujuan Akhir)</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        type="button"
                        className={`btn ${reqIsStocked ? 'btn-grn' : 'btn-ghost'}`}
                        onClick={() => setReqIsStocked(true)}
                        style={{ flex: 1, height: 36, fontSize: 11, fontWeight: 700, border: reqIsStocked ? 'none' : '1px solid var(--br)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                      >
                        📦 Masuk Stok Gudang
                      </button>
                      <button
                        type="button"
                        className={`btn ${!reqIsStocked ? 'btn-pur' : 'btn-ghost'}`}
                        onClick={() => setReqIsStocked(false)}
                        style={{ flex: 1, height: 36, fontSize: 11, fontWeight: 700, border: !reqIsStocked ? 'none' : '1px solid var(--br)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                      >
                        ⚡ Konsumsi / Langsung Habis
                      </button>
                    </div>
                    <span style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 4, display: 'block' }}>
                      💡 {reqIsStocked ? 'Fondasi: Direncanakan masuk ke persediaan inventaris gudang MTC untuk maintenance saat barang tiba.' : 'Barang langsung dipakai/dipasang untuk kebutuhan mesin, dicatat sebagai log anggaran.'}
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Link Referensi Toko / Penawaran Vendor</label>
                    <input
                      type="url"
                      className="form-input"
                      placeholder={!isPengadaanBaru ? "Terkunci untuk repeat order" : "Tempel link Tokopedia, Shopee..."}
                      value={reqLinkReferences}
                      onChange={(e) => setReqLinkReferences(e.target.value)}
                      readOnly={!isPengadaanBaru}
                      style={{
                        background: !isPengadaanBaru ? 'var(--sf2)' : 'var(--sf3)',
                        opacity: !isPengadaanBaru ? 0.7 : 1,
                        cursor: !isPengadaanBaru ? 'not-allowed' : 'text'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Alasan Pembelian (Reason / Deskripsi Kebutuhan Mesin)</label>
                <textarea
                  className="form-input"
                  placeholder={!isPengadaanBaru ? "Terkunci untuk repeat order" : "Jelaskan detail untuk mesin apa, kerusakan apa..."}
                  rows={2}
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  readOnly={!isPengadaanBaru}
                  style={{
                    height: '54px',
                    padding: '8px 12px',
                    resize: 'none',
                    background: !isPengadaanBaru ? 'var(--sf2)' : 'var(--sf3)',
                    opacity: !isPengadaanBaru ? 0.7 : 1,
                    cursor: !isPengadaanBaru ? 'not-allowed' : 'text'
                  }}
                />
              </div>

              {requestStatus && (
                <div className={`alert ${requestStatus.type === 'success' ? 'alert-grn' : 'alert-red'}`} style={{ marginBottom: 16 }}>
                  {requestStatus.msg}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowRequestForm(false)} style={{ cursor: 'pointer' }}>Batal</button>
                <button
                  type="submit"
                  className="btn btn-pur"
                  disabled={actionLoading === 'request'}
                  style={{ fontWeight: 800, padding: '0 24px', cursor: 'pointer' }}
                >
                  {actionLoading === 'request' ? 'Menyimpan...' : '💾 Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* METRICS & KPI CARDS SECTION */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card stat-ylw" style={{ cursor: 'pointer', transition: 'all 0.2s', borderLeft: '4px solid var(--ylw)' }} onClick={() => setActiveTab('ACTIVE')}>
            <div className="stat-label">Barang Tahap PR</div>
            <div className="stat-value">{stats.prCount}</div>
            <div className="stat-sub">Menunggu PO terbit dari SCM / Vendor</div>
          </div>
          <div className="stat-card stat-blu" style={{ cursor: 'pointer', transition: 'all 0.2s', borderLeft: '4px solid var(--blu)' }} onClick={() => setActiveTab('ACTIVE')}>
            <div className="stat-label">Barang Sudah PO</div>
            <div className="stat-value">{stats.poCount}</div>
            <div className="stat-sub">Sedang diproses vendor / dalam pengiriman</div>
          </div>
          <div className="stat-card stat-red" style={{ borderLeft: '4px solid var(--red)' }}>
            <div className="stat-label">Pengadaan URGENT</div>
            <div className="stat-value" style={{ color: 'var(--red)' }}>{stats.urgentCount}</div>
            <div className="stat-sub">{stats.etaOverdueCount} Item melewati ETA Foom ⚠️</div>
          </div>
          <div className="stat-card stat-grn" style={{ cursor: 'pointer', transition: 'all 0.2s', borderLeft: '4px solid var(--grn)' }} onClick={() => setActiveTab('RECEIVED')}>
            <div className="stat-label">Rerata Lead-Time Pengadaan</div>
            <div className="stat-value" style={{ color: 'var(--grn)' }}>{stats.avgLeadTime}</div>
            <div className="stat-sub">Dihitung otomatis dari riwayat kedatangan</div>
          </div>
        </div>

        {/* SEARCH & FILTERS CONTROL CARD */}
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 1fr 1fr', gap: 16, alignItems: 'center' }}>
            <div className="search-bar" style={{ width: '100%', marginBottom: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Cari PR, PO, nama barang sheets, atau nama suku cadang Odoo..."
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

            <div className="form-group" style={{ marginBottom: 0 }}>
              <select
                className="form-input form-select"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                style={{ height: '40px' }}
              >
                <option value="">— Bulan (Semua) —</option>
                {monthsList.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <select
                className="form-input form-select"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                style={{ height: '40px' }}
              >
                <option value="">— Tahun (Semua) —</option>
                {yearsList.map(yr => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>

            {/* Custom Premium Odoo-style Tab Switcher */}
            <div style={{ gridColumn: 'span 5', display: 'flex', background: 'var(--sf2)', padding: 3, borderRadius: 8, height: '36px', border: '1px solid var(--br)', overflowX: 'auto', gap: 4 }}>
              {[
                { id: 'ACTIVE', label: '⏳ Semua Aktif', count: items.filter(i => !i.tanggalTerima).length },
                { id: 'DRAFT_PR', label: '⚙️ Draft PR', count: items.filter(i => !i.tanggalTerima && ((i.statusPr || 'DRAFT') === 'DRAFT' || i.statusPr === 'READY_ODOO')).length },
                { id: 'TO_APPROVE', label: '⏳ Tunggu Approve', count: items.filter(i => !i.tanggalTerima && i.statusPr === 'TO_APPROVE').length },
                { id: 'APPROVED', label: '✓ Disetujui', count: items.filter(i => !i.tanggalTerima && i.statusPr === 'APPROVED').length },
                { id: 'PO_RFQ', label: '🚢 Dalam Proses PO', count: items.filter(i => !i.tanggalTerima && (i.statusPr === 'PO' || i.statusPr === 'RFQ' || i.statusPo === 'PO' || i.statusPo === 'RFQ')).length },
                { id: 'RECEIVED', label: '📦 Diterima', count: items.filter(i => !!i.tanggalTerima).length },
                { id: 'ALL', label: '🌐 Semua Dokumen', count: items.length }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  className="ntab"
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    flex: '1 0 auto',
                    border: 'none',
                    padding: '0 12px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: 'pointer',
                    background: activeTab === tab.id ? 'var(--sf3)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--pur)' : 'var(--tx3)',
                    boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* GROUPED ACCORDION PR LIST */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groupedPrItems.map((group) => {
            const isPrDraft = group.nomorPr === null;
            const prKey = isPrDraft ? 'DRAFT' : group.nomorPr!;
            const isExpanded = !!expandedGroups[prKey];
            const hasUrgentItem = group.hasUrgent;

            // Determine status color and text for header
            let statusBadge = null;
            if (isPrDraft) {
              statusBadge = <span className="badge badge-ylw" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>📋 Draft / Pending PR</span>;
            } else if (group.overallStatus === 'DONE') {
              statusBadge = <span className="badge badge-grn" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>✓ Diterima Lengkap</span>;
            } else if (group.overallStatus === 'PARTIAL') {
              statusBadge = <span className="badge badge-ylw" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, background: 'rgba(234, 179, 8, 0.15)', color: '#facc15' }}>⏳ Sebagian Diterima</span>;
            } else if (group.overallStatus === 'PO_ACTIVE') {
              statusBadge = <span className="badge badge-blu" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>🚢 Sedang Diproses (PO)</span>;
            } else {
              statusBadge = <span className="badge" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>📝 Pengajuan PR SCM</span>;
            }

            return (
              <div 
                key={prKey} 
                className="card" 
                style={{ 
                  overflow: 'hidden', 
                  borderLeft: hasUrgentItem && group.overallStatus !== 'DONE' ? '4px solid var(--red)' : isPrDraft ? '4px solid var(--ylw)' : '1px solid var(--br)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}
              >
                {/* GROUP CARD HEADER */}
                <div 
                  onClick={() => toggleGroupExpand(prKey)}
                  style={{ 
                    padding: '16px 20px', 
                    background: isPrDraft ? 'rgba(234, 179, 8, 0.02)' : 'var(--sf2)',
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    userSelect: 'text',
                    borderBottom: isExpanded ? '1px solid var(--br)' : 'none',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sf3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = isPrDraft ? 'rgba(234, 179, 8, 0.02)' : 'var(--sf2)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, flexWrap: 'wrap' }}>
                    {/* Expand Chevron */}
                    <span style={{ fontSize: 12, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--tx3)' }}>
                      ▶
                    </span>

                    {/* PR Info */}
                    <div>
                      {isPrDraft ? (
                        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ylw)' }}>
                          📝 DRAFT PENDING / BELUM ADA NO PR
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 600 }}>NOMOR PR:</span>
                          <span 
                            className="badge badge-ylw" 
                            style={{ fontSize: 12, padding: '2px 8px', fontWeight: 800, cursor: 'text', userSelect: 'text' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {group.nomorPr}
                          </span>
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>
                        Tanggal Pengajuan: <strong style={{ color: 'var(--tx2)' }}>{group.oldestDateStr}</strong> · Lead Time: <strong style={{ color: 'var(--tx)' }}>{group.daysRunningStr}</strong>
                      </div>
                    </div>

                    {/* PO Badges */}
                    {!isPrDraft && group.poNumbers !== '—' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 600 }}>PO NO:</span>
                        {group.poNumbers.split(', ').map(po => (
                          <span 
                            key={po} 
                            className="badge badge-blu" 
                            style={{ fontSize: 11, padding: '2px 8px', fontWeight: 800, cursor: 'text', userSelect: 'text' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {po}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Vendor summary */}
                    <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                      Vendor: <span style={{ color: 'var(--tx2)', fontWeight: 600 }}>{group.vendors}</span>
                    </div>

                    {/* Urgent Alert Banner */}
                    {hasUrgentItem && group.overallStatus !== 'DONE' && (
                      <span className="badge badge-red" style={{ fontSize: 9, fontWeight: 800, animation: 'pulse 1.5s infinite' }}>🚨 ADA ITEM URGENT</span>
                    )}
                  </div>

                  {/* Summary Pricing & Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--tx)' }}>
                        {fmtRupiah(group.totalCost)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                        {group.items.length} Item ({group.totalQty} Pcs)
                      </div>
                    </div>
                    
                    {statusBadge}
                  </div>
                </div>

                {/* GROUP EXPANDED DETAIL VIEW */}
                {isExpanded && (
                  <div style={{ padding: '0 0 10px 0', background: 'rgba(255,255,255,0.01)', animation: 'fadeIn 0.2s ease-out' }}>
                    <div className="table-wrap" style={{ overflowX: 'auto', border: 'none', borderRadius: 0 }}>
                      <table style={{ minWidth: 1200, background: 'transparent' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.1)' }}>
                            <th style={{ width: 60, textAlign: 'center', paddingLeft: 20 }}>Fb</th>
                            <th style={{ minWidth: 260 }}>Nama Barang Pengajuan (Sheets)</th>
                            <th style={{ minWidth: 240 }}>Koneksi Database Resmi MTC (Odoo)</th>
                            <th style={{ minWidth: 140, textAlign: 'center' }}>Fondasi Stok</th>
                            <th style={{ width: 80, textAlign: 'center' }}>Qty</th>
                            <th style={{ minWidth: 160 }}>Harga & Keterangan</th>
                            <th style={{ minWidth: 110 }}>ETA Foom</th>
                            <th style={{ width: 60, textAlign: 'center' }}>GR Link</th>
                            <th style={{ textAlign: 'right', minWidth: 220, paddingRight: 20 }}>Aksi & Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((item) => {
                            const isItemUrgent = item.urgency === 'Urgent';
                            const isItemReceived = !!item.tanggalTerima;
                            const hasEtaPassed = item.etaFoom && !isItemReceived && new Date(item.etaFoom).getTime() < new Date().getTime();

                            return (
                              <Fragment key={item.id}>
                                <tr 
                                  style={{ 
                                    borderBottom: '1px solid var(--br)',
                                    backgroundColor: isItemUrgent && !isItemReceived ? 'rgba(239, 68, 68, 0.02)' : 'transparent',
                                    cursor: 'pointer'
                                  }}
                                  onClick={() => toggleRowExpand(item.id)}
                                >
                                  {/* index nomor list (Fb) */}
                                  <td className="text-mono text-tiny text-muted" style={{ textAlign: 'center', paddingLeft: 20 }}>
                                    {item.fbIndex || '—'}
                                  </td>
                                  
                                  {/* Original item name with Quick Copy popover */}
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {isItemUrgent && !isItemReceived && <span style={{ color: 'var(--red)', fontSize: 12 }}>🚨</span>}
                                        <span style={{ fontWeight: 700, color: 'var(--tx)' }}>{item.originalName}</span>
                                      </div>
                                      
                                      {item.statusPr === 'READY_ODOO' && (
                                        <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                          <button
                                            type="button"
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => setActiveCopyPopoverId(activeCopyPopoverId === item.id ? null : item.id)}
                                            style={{ padding: '2px 6px', fontSize: 10, height: 'auto', borderRadius: 4, background: 'rgba(124, 58, 237, 0.15)', color: '#c084fc', border: '1px solid rgba(124, 58, 237, 0.3)' }}
                                          >
                                            📋 Salin Odoo
                                          </button>
                                          
                                          {activeCopyPopoverId === item.id && (
                                            <div style={{
                                              position: 'absolute',
                                              top: '100%',
                                              right: 0,
                                              background: 'var(--sf3)',
                                              border: '1px solid var(--br)',
                                              borderRadius: 8,
                                              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                                              zIndex: 100,
                                              padding: 8,
                                              display: 'flex',
                                              flexDirection: 'column',
                                              gap: 6,
                                              minWidth: 160,
                                              marginTop: 4
                                            }}>
                                              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--tx3)', borderBottom: '1px solid var(--br)', paddingBottom: 4, marginBottom: 2 }}>
                                                Widget Quick-Copy
                                              </div>
                                              <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => {
                                                  navigator.clipboard.writeText(item.sparepart?.nama || item.originalName);
                                                  alert('✓ Nama Resmi disalin!');
                                                  setActiveCopyPopoverId(null);
                                                }}
                                                style={{ justifyContent: 'flex-start', fontSize: 10, padding: '4px 8px' }}
                                              >
                                                📄 Nama Resmi
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => {
                                                  navigator.clipboard.writeText(String(item.harga || 0));
                                                  alert('✓ Harga disalin!');
                                                  setActiveCopyPopoverId(null);
                                                }}
                                                style={{ justifyContent: 'flex-start', fontSize: 10, padding: '4px 8px' }}
                                              >
                                                💰 Harga Satuan
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => {
                                                  navigator.clipboard.writeText(String(item.qty));
                                                  alert('✓ Qty disalin!');
                                                  setActiveCopyPopoverId(null);
                                                }}
                                                style={{ justifyContent: 'flex-start', fontSize: 10, padding: '4px 8px' }}
                                              >
                                                📦 Jumlah (Qty)
                                              </button>
                                              <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                disabled={!item.linkReferences}
                                                onClick={() => {
                                                  if (item.linkReferences) {
                                                    navigator.clipboard.writeText(item.linkReferences);
                                                    alert('✓ Link Referensi disalin!');
                                                  }
                                                  setActiveCopyPopoverId(null);
                                                }}
                                                style={{ justifyContent: 'flex-start', fontSize: 10, padding: '4px 8px', opacity: item.linkReferences ? 1 : 0.5 }}
                                              >
                                                🔗 Link Referensi
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {item.reason && <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4, fontStyle: 'italic' }}>&quot;{item.reason}&quot;</div>}
                                  </td>

                                  {/* Odoo Connected Item */}
                                  <td>
                                    {item.sparepart ? (
                                      <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <div style={{ fontWeight: 700, color: 'var(--tx2)', fontSize: 12 }}>{item.sparepart.nama}</div>
                                          {item.statusPr && item.statusPr !== 'READY_ODOO' && (
                                            <span className="badge" style={{ fontSize: 8, padding: '1px 5px', fontWeight: 800, ...getStatusBadgeStyles(item.statusPr) }}>
                                              {item.statusPr}
                                            </span>
                                          )}
                                        </div>
                                        <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                                          <span className="text-mono">{item.sparepart.id}</span>
                                          ·
                                          <span>SLOC:</span>
                                          <span className="badge badge-blu" style={{ fontSize: 8, padding: '1px 4px' }}>{item.sparepart.lokasi || '—'}</span>
                                          ·
                                          <span className="badge badge-grn" style={{ fontSize: 8, padding: '1px 4px', background: 'rgba(34, 197, 94, 0.1)', color: '#4ade80' }}>✓ Terhubung</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                                        <span className="badge badge-red" style={{ fontSize: 9, padding: '2px 6px' }}>⚠️ Unlinked / General</span>
                                        <button
                                          type="button"
                                          className="btn btn-ghost btn-sm"
                                          onClick={() => openLinkModal(item)}
                                          style={{ fontSize: 9, padding: '2px 6px', color: 'var(--pur)', height: 'auto', border: '1px solid rgba(168, 85, 247, 0.3)' }}
                                        >
                                          🔗 Hubungkan
                                        </button>
                                      </div>
                                    )}
                                  </td>

                                  {/* Stock Foundation Badge (User requested foundation) */}
                                  <td style={{ textAlign: 'center' }}>
                                    {item.isStocked ? (
                                      <span className="badge badge-grn" style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                                        📦 Masuk Stok
                                      </span>
                                    ) : (
                                      <span className="badge badge-pur" style={{ padding: '3px 8px', fontSize: 10, fontWeight: 700, background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7' }}>
                                        ⚡ Langsung Pakai
                                      </span>
                                    )}
                                  </td>

                                  {/* Quantity */}
                                  <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 12 }}>
                                    {item.qty} <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--tx3)' }}>{item.sparepart?.uom || 'Pcs'}</span>
                                  </td>

                                  {/* Price & Notes */}
                                  <td>
                                    <div style={{ fontWeight: 700 }}>{fmtRupiah(item.harga)}</div>
                                    <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>
                                      Kat: {item.productCategory || 'Sparepart'} · Tipe: {item.keterangan || 'consumable'}
                                    </div>
                                  </td>

                                  {/* ETA Foom */}
                                  <td>
                                    {item.etaFoom ? (
                                      <div style={{ color: hasEtaPassed ? 'var(--red)' : 'var(--tx)' }}>
                                        <div style={{ fontSize: 11, fontWeight: 600 }}>
                                          {new Date(item.etaFoom).toLocaleDateString('id-ID', {
                                            day: '2-digit', month: 'short', year: 'numeric'
                                          })}
                                        </div>
                                        {hasEtaPassed && <div style={{ fontSize: 8, fontWeight: 800, color: 'var(--red)', marginTop: 2 }}>⚠️ LEWAT ESTIMASI</div>}
                                      </div>
                                    ) : '—'}
                                  </td>

                                  {/* Link GR Odoo */}
                                  <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                    {item.linkGr ? (
                                      <a
                                        href={item.linkGr}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Buka Lembar GR Odoo"
                                        style={{ fontSize: 15, color: 'var(--pur)', textDecoration: 'none' }}
                                      >
                                        🔗
                                      </a>
                                    ) : '—'}
                                  </td>

                                  {/* Receive Action Column */}
                                  <td style={{ textAlign: 'right', paddingRight: 20 }} onClick={(e) => e.stopPropagation()}>
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => openEditModal(item)}
                                        style={{ padding: '5px 8px', fontSize: 10, height: 'auto', border: '1px solid var(--br)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                        title="Edit Detail SCM / PR / PO"
                                      >
                                        ✏️ Edit
                                      </button>

                                      {isItemReceived ? (
                                        <div style={{ textAlign: 'right' }}>
                                          <span className="badge badge-grn" style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700 }}>
                                            ✓ Diterima {item.isStocked ? '(Gudang)' : '(Non-Stok)'}
                                          </span>
                                          {item.tanggalTerima && (
                                            <div style={{ fontSize: 8, color: 'var(--tx3)', marginTop: 2 }}>
                                              Tgl: {new Date(item.tanggalTerima).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' })}
                                            </div>
                                          )}
                                        </div>
                                      ) : item.statusPr === 'READY_ODOO' && item.sparepartId ? (
                                        <button
                                          type="button"
                                          className="btn btn-pur btn-sm"
                                          disabled={actionLoading !== null}
                                          onClick={() => openOdooProcessedModal(item)}
                                          style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, var(--pur) 0%, #4f46e5 100%)', color: '#fff', border: 'none', borderRadius: 6 }}
                                        >
                                          🚀 Selesai Odoo
                                        </button>
                                      ) : item.nomorPo ? (
                                        <button
                                          type="button"
                                          className="btn btn-grn btn-sm"
                                          disabled={actionLoading !== null}
                                          onClick={() => openReceiveModal(item)}
                                          style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                                        >
                                          📥 Terima Barang
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={actionLoading !== null}
                                          onClick={() => openEditModal(item)}
                                          style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 6 }}
                                        >
                                          🚢 Push ke PO
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>

                                {/* Expanded Timeline Chatter Log Row */}
                                {expandedRows[item.id] && (
                                  <tr style={{ background: 'rgba(0,0,0,0.18)' }}>
                                    <td colSpan={9} style={{ padding: '16px 24px', borderBottom: '1px solid var(--br)' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--pur)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                          💬 Log Pelacakan & Komentar Chatter Odoo (Mail Messages)
                                        </div>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingLeft: 8, paddingRight: 8 }}>
                                          <style dangerouslySetInnerHTML={{ __html: `
                                            .chatter-body ul {
                                              list-style-type: disc !important;
                                              padding-left: 20px !important;
                                              margin: 6px 0 !important;
                                            }
                                            .chatter-body li {
                                              margin-bottom: 3px !important;
                                            }
                                            .chatter-body p {
                                              margin: 6px 0 !important;
                                            }
                                            .chatter-body a {
                                              color: var(--pur) !important;
                                              text-decoration: underline !important;
                                            }
                                          `}} />

                                          {(() => {
                                            const rawNotes = item.odooNotes || item.sparepart?.odooNotes;
                                            if (!rawNotes) {
                                              return (
                                                <div style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic', paddingLeft: 12, borderLeft: '2px dashed var(--br)' }}>
                                                  Belum ada log catatan chatter Odoo untuk item ini. Lakukan sinkronisasi atau masukkan nomor PR Odoo resmi.
                                                </div>
                                              );
                                            }
                                            try {
                                              if (rawNotes.trim().startsWith('[')) {
                                                const logs = JSON.parse(rawNotes);
                                                if (logs.length === 0) {
                                                  return <div style={{ fontSize: 11, color: 'var(--tx3)', fontStyle: 'italic', paddingLeft: 12, borderLeft: '2px dashed var(--br)' }}>Belum ada komentar chatter Odoo.</div>;
                                                }

                                                // Helper to format date header
                                                const formatDateHeader = (dateStr: string) => {
                                                  if (!dateStr) return 'Tanggal Tidak Diketahui';
                                                  try {
                                                    const d = new Date(dateStr.replace(' ', 'T'));
                                                    if (isNaN(d.getTime())) {
                                                      const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
                                                      if (match) return `${match[3]}/${match[2]}/${match[1]}`;
                                                      return dateStr.split(' ')[0];
                                                    }
                                                    return d.toLocaleDateString('id-ID', {
                                                      day: 'numeric',
                                                      month: 'long',
                                                      year: 'numeric'
                                                    });
                                                  } catch {
                                                    return dateStr.split(' ')[0];
                                                  }
                                                };

                                                // Helper to format time
                                                const formatTime = (dateStr: string) => {
                                                  if (!dateStr) return '';
                                                  try {
                                                    const d = new Date(dateStr.replace(' ', 'T'));
                                                    if (isNaN(d.getTime())) {
                                                      const match = dateStr.match(/(\d{2}):(\d{2}):(\d{2})/);
                                                      if (match) return `${match[1]}:${match[2]}`;
                                                      return '';
                                                    }
                                                    return d.toLocaleTimeString('id-ID', {
                                                      hour: '2-digit',
                                                      minute: '2-digit'
                                                    });
                                                  } catch {
                                                    return '';
                                                  }
                                                };

                                                // Group logs by date
                                                const groupedLogs: { [key: string]: any[] } = {};
                                                logs.forEach((log: any) => {
                                                  const header = formatDateHeader(log.date);
                                                  if (!groupedLogs[header]) {
                                                    groupedLogs[header] = [];
                                                  }
                                                  groupedLogs[header].push(log);
                                                });

                                                // Get chronological date headers in order
                                                const dateHeaders = Object.keys(groupedLogs);

                                                return (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24, position: 'relative' }}>
                                                    {/* Central timeline track line */}
                                                    <div style={{
                                                      position: 'absolute',
                                                      left: 20,
                                                      top: 10,
                                                      bottom: 10,
                                                      width: 2,
                                                      background: 'linear-gradient(to bottom, var(--pur) 0%, rgba(168, 85, 247, 0.1) 100%)',
                                                      zIndex: 1
                                                    }} />

                                                    {dateHeaders.map((dateHeader) => (
                                                      <div key={dateHeader} style={{ display: 'flex', flexDirection: 'column', gap: 14, zIndex: 2 }}>
                                                        {/* Date Header Row */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                          {/* Bullet dot indicator on line */}
                                                          <div style={{
                                                            width: 12,
                                                            height: 12,
                                                            borderRadius: '50%',
                                                            background: 'var(--pur)',
                                                            border: '3px solid var(--sf1)',
                                                            boxShadow: '0 0 8px var(--pur)',
                                                            marginLeft: 15,
                                                            zIndex: 3
                                                          }} />
                                                          <span style={{
                                                            fontSize: 10,
                                                            fontWeight: 900,
                                                            color: 'var(--tx3)',
                                                            background: 'rgba(168, 85, 247, 0.1)',
                                                            padding: '2px 8px',
                                                            borderRadius: 12,
                                                            border: '1px solid rgba(168, 85, 247, 0.25)',
                                                            letterSpacing: '0.5px'
                                                          }}>
                                                            🗓️ {dateHeader}
                                                          </span>
                                                        </div>

                                                        {/* Logs under this Date */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 42 }}>
                                                          {groupedLogs[dateHeader].map((log, logIdx) => {
                                                            const isPoPhase = log.phase === 'PO';
                                                            return (
                                                              <div
                                                                key={logIdx}
                                                                style={{
                                                                  display: 'flex',
                                                                  flexDirection: 'column',
                                                                  gap: 8,
                                                                  padding: '12px 16px',
                                                                  background: isPoPhase ? 'rgba(34, 197, 94, 0.04)' : 'rgba(168, 85, 247, 0.04)',
                                                                  borderRadius: 10,
                                                                  border: isPoPhase ? '1px solid rgba(34, 197, 94, 0.15)' : '1px solid rgba(168, 85, 247, 0.15)',
                                                                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                                                  transition: 'all 0.2s',
                                                                  position: 'relative'
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                  e.currentTarget.style.borderColor = isPoPhase ? 'rgba(34, 197, 94, 0.4)' : 'rgba(168, 85, 247, 0.4)';
                                                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                  e.currentTarget.style.borderColor = isPoPhase ? 'rgba(34, 197, 94, 0.15)' : 'rgba(168, 85, 247, 0.15)';
                                                                  e.currentTarget.style.transform = 'translateY(0)';
                                                                }}
                                                              >
                                                                {/* Log Header Line */}
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    <span style={{ fontWeight: 800, color: 'var(--tx)', fontSize: 11.5 }}>
                                                                      👤 {log.author || 'Odoo System'}
                                                                    </span>
                                                                    {isPoPhase ? (
                                                                      <span className="badge badge-grn" style={{ fontSize: 8.5, padding: '2px 6px', fontWeight: 800, background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80' }}>
                                                                        🛒 FASE PO
                                                                      </span>
                                                                    ) : (
                                                                      <span className="badge badge-pur" style={{ fontSize: 8.5, padding: '2px 6px', fontWeight: 800, background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                                                                        📋 FASE PR / DRAFT / PENAWARAN
                                                                      </span>
                                                                    )}
                                                                  </div>
                                                                  
                                                                  <span style={{ fontSize: 9.5, color: 'var(--tx3)', fontWeight: 600 }}>
                                                                    ⏱️ {formatTime(log.date)}
                                                                  </span>
                                                                </div>

                                                                {/* Log Body content */}
                                                                <div
                                                                  style={{
                                                                    color: 'var(--tx2)',
                                                                    fontSize: 11,
                                                                    lineHeight: 1.5,
                                                                    wordBreak: 'break-word',
                                                                    paddingLeft: 4,
                                                                    borderLeft: isPoPhase ? '2px solid rgba(34, 197, 94, 0.3)' : '2px solid rgba(168, 85, 247, 0.3)'
                                                                  }}
                                                                  className="chatter-body"
                                                                  dangerouslySetInnerHTML={{ __html: log.body || '' }}
                                                                />
                                                              </div>
                                                            );
                                                          })}
                                                        </div>
                                                      </div>
                                                    ))}
                                                  </div>
                                                );
                                              } else {
                                                return rawNotes.split('\n').map((line: string, idx: number) => (
                                                  <div key={idx} style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.4, paddingLeft: 12, borderLeft: '2px solid var(--pur)' }}>{line}</div>
                                                ));
                                              }
                                            } catch (e) {
                                              return <div style={{ fontSize: 11, color: 'var(--tx2)', whiteSpace: 'pre-wrap', lineHeight: 1.4, paddingLeft: 12, borderLeft: '2px solid var(--pur)' }}>{rawNotes}</div>;
                                            }
                                          })()}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {groupedPrItems.length === 0 && !loading && (
            <div className="card" style={{ textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--tx)' }}>Belum Ada Data Pelacakan SCM</div>
              <div style={{ fontSize: 12, marginTop: 4, color: 'var(--tx3)' }}>
                Klik tombol **🔄 Sinkronkan Data** di kanan atas untuk menyinkronkan data dari Google Sheets secara langsung.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CONSOLIDATED CONFIGURATION & SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3>⚙️ Pengaturan Koneksi Google Sheets & CSV</h3>
              <button className="modal-close" onClick={() => setShowSettingsModal(false)}>×</button>
            </div>
            
            <div className="modal-body" style={{ padding: 20 }}>
              {/* Form 1: Save sheet/webhook links */}
              <form onSubmit={handleSaveSettings} style={{ marginBottom: 24, borderBottom: '1px solid var(--br)', paddingBottom: 24 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--pur)', fontWeight: 800 }}>🔗 Integrasi Google Sheets API (Satu-Klik Sync)</h4>
                
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Link Google Sheets Pelacakan SCM (Source Data)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    value={tempSheetUrl}
                    onChange={(e) => setTempSheetUrl(e.target.value)}
                  />
                  <span style={{ fontSize: 9, color: 'var(--tx3)', display: 'block', marginTop: 4 }}>
                    💡 Link Spreadsheet ini akan disimpan secara lokal. Pastikan file Google Sheet disetel share ke **&quot;Anyone with the link can view&quot;**.
                  </span>
                </div>

                <div className="form-group" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11, margin: 0 }}>Google Apps Script Web App URL (Auto-Push Form)</label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowScriptCodeModal(true)}
                      style={{ fontSize: 9, padding: '2px 6px', height: 'auto', color: 'var(--pur)', border: '1px solid rgba(168,85,247,0.2)' }}
                    >
                      🛠️ Kode Apps Script
                    </button>
                  </div>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={tempScriptUrl}
                    onChange={(e) => setTempScriptUrl(e.target.value)}
                  />
                  <span style={{ fontSize: 9, color: 'var(--tx3)', display: 'block', marginTop: 4 }}>
                    💡 Web App URL dari script Google Sheets. Mengizinkan form MTC **menulis baris request baru secara otomatis** langsung ke Sheets Anda.
                  </span>
                </div>

                <div style={{ borderTop: '1px solid var(--br)', paddingTop: 16, marginTop: 16, marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--pur)', fontWeight: 800 }}>🔑 Kredensial Odoo Cloud (Lacak Status & Chatter)</h4>
                  
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11, color: 'var(--pur)' }}>Odoo Browser Session ID (Cookie - Jalan Ninja/Mandiri)</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Masukkan nilai cookie session_id dari browser..."
                      value={tempOdooSessionId}
                      onChange={(e) => setTempOdooSessionId(e.target.value)}
                      style={{ border: tempOdooSessionId ? '1px solid var(--pur)' : '1px solid var(--br)' }}
                    />
                    <span style={{ fontSize: 9, color: 'var(--tx3)', display: 'block', marginTop: 4 }}>
                      💡 <b>Sangat Berguna untuk Akun Pinjaman:</b> Login ke Odoo di browser, cari cookie bernama <code>session_id</code> lewat Inspect Element (F12) lalu pilih Cookies, lalu tempel di sini. Jika kolom ini terisi, setelan API Key, DB, dan UID di bawah akan otomatis dilewati.
                    </span>
                  </div>

                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Odoo RPC Password / API Key</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Masukkan Kata Sandi Odoo atau Developer API Key..."
                      value={tempOdooPassword}
                      onChange={(e) => setTempOdooPassword(e.target.value)}
                    />
                    <span style={{ fontSize: 9, color: 'var(--tx3)', display: 'block', marginTop: 4 }}>
                      💡 Kata sandi akun Odoo Anda (e.g. untuk puput@foom.id) atau Developer API Key yang digenerate dari profil Odoo Anda.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Odoo Database Name</label>
                      <input
                        type="text"
                        className="form-input"
                        value={tempOdooDb}
                        onChange={(e) => setTempOdooDb(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Odoo UID</label>
                      <input
                        type="text"
                        className="form-input"
                        value={tempOdooUid}
                        onChange={(e) => setTempOdooUid(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-pur"
                  style={{ width: '100%', fontWeight: 700, height: 38 }}
                >
                  💾 Simpan Tautan Integrasi
                </button>
              </form>

              {/* Form 2: Manual Upload CSV */}
              <form onSubmit={handleManualSyncSubmit}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 13, color: '#facc15', fontWeight: 800 }}>📁 Unggah Berkas CSV Manual</h4>
                
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Pilih File CSV Ekspor Spreadsheet</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                      id="manual-csv-picker"
                    />
                    <label
                      htmlFor="manual-csv-picker"
                      className="btn btn-ghost"
                      style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', height: 38, border: '1px dashed var(--br)' }}
                    >
                      {csvFileName ? `📂 Berkas: ${csvFileName}` : '📁 Pilih Berkas CSV dari Komputer'}
                    </label>
                  </div>
                </div>

                {manualSyncStatus && (
                  <div className={`alert ${manualSyncStatus.type === 'success' ? 'alert-grn' : 'alert-red'}`} style={{ marginBottom: 16, fontSize: 11 }}>
                    {manualSyncStatus.msg}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowSettingsModal(false)}>Tutup</button>
                  <button
                    type="submit"
                    className="btn btn-grn"
                    disabled={actionLoading === 'manual-sync' || !csvFileText.trim()}
                    style={{ fontWeight: 700, padding: '0 20px', height: 38 }}
                  >
                    {actionLoading === 'manual-sync' ? 'Memproses...' : '🔄 Jalankan Sinkronisasi CSV'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE APPS SCRIPT WEB APP SOURCE CODE MODAL */}
      {showScriptCodeModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-card" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3>🛠️ Google Apps Script (Webhook Penulisan Sheets)</h3>
              <button className="modal-close" onClick={() => setShowScriptCodeModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <p style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 10 }}>
                Ikuti langkah berikut untuk mengaktifkan sinkronisasi otomatis satu-arah dari Web MTC ke Sheets:
              </p>
              <ol style={{ fontSize: 10, color: 'var(--tx3)', paddingLeft: 18, marginBottom: 14 }}>
                <li>Buka Spreadsheet SCM Anda yang memiliki tab bernama <strong>&quot;Request MTC&quot;</strong>.</li>
                <li>Klik <strong>Extensions &gt; Apps Script</strong>.</li>
                <li>Hapus seluruh kode kosong di editor, lalu paste kode di bawah ini.</li>
                <li>Klik tombol <strong>Deploy &gt; New Deployment</strong>.</li>
                <li>Pilih jenis <strong>Web App</strong>. Atur: <i>Execute as</i> ke <b>Me</b>, dan <i>Who has access</i> ke <b>Anyone</b>.</li>
                <li>Klik Deploy, berikan otorisasi Google, salin URL Web App yang terbentuk, dan tempalkan di menu Pengaturan MTC.</li>
              </ol>
              <div style={{ position: 'relative' }}>
                <pre style={{ background: 'var(--sf2)', border: '1px solid var(--br)', borderRadius: 8, padding: 14, fontSize: 10, overflowX: 'auto', maxHeight: 200, color: 'var(--tx2)', fontFamily: 'monospace' }}>
                  {googleScriptSource}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(googleScriptSource);
                    alert('✓ Kode script disalin ke clipboard!');
                  }}
                  className="btn btn-pur btn-sm"
                  style={{ position: 'absolute', right: 10, top: 10, fontSize: 10, padding: '4px 10px', height: 'auto', cursor: 'pointer' }}
                >
                  📋 Salin Kode
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setShowScriptCodeModal(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL LINK MANUAL SPAREPART */}
      {showLinkModal && linkingItem && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>🔗 Hubungkan ke Master Suku Cadang MTC</h3>
              <button className="modal-close" onClick={() => setShowLinkModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 20 }}>
              <div style={{ marginBottom: 16, borderBottom: '1px solid var(--br)', paddingBottom: 10 }}>
                <label className="form-label" style={{ fontSize: 10, color: 'var(--tx3)' }}>NAMA BARANG DI SHEETS</label>
                <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2, color: 'var(--tx)' }}>{linkingItem.originalName}</div>
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>Qty: {linkingItem.qty} Unit · Urgensi: {linkingItem.urgency}</div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Cari Suku Cadang Resmi di Master DB</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ketik Nama, ID Suku Cadang, atau Lokasi SLOC..."
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
                  <div style={{ fontSize: 14, fontWeight: 800, marginTop: 4, color: 'var(--tx)' }}>{receivingItem.originalName}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pur)', marginTop: 4 }}>
                    Kuantitas Masuk: {receivingItem.qty} {receivingItem.sparepart?.uom || 'Unit'} · PO No: {receivingItem.nomorPo || '—'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Tanggal Kedatangan <span style={{ color: 'var(--red)' }}>*</span></label>
                    <input
                      type="date"
                      required
                      className="form-input"
                      value={receiveDate}
                      onChange={(e) => setReceiveDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Harga Satuan Aktual (Rp) <span style={{ color: 'var(--red)' }}>*</span></label>
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
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Nama Vendor / Toko</label>
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
                  <label className="form-label" style={{ fontWeight: 800, marginBottom: 8, display: 'block', fontSize: 11 }}>Tipe Penyimpanan Gudang (Tindakan Nyata)</label>
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
                      <span style={{ fontWeight: 700, fontSize: 11 }}>Masukkan Stok (Restock)</span>
                      <span style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2, textAlign: 'center' }}>
                        Tambah kuantitas persediaan di MTC Inventory
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
                      <span style={{ fontWeight: 700, fontSize: 11 }}>Langsung Pakai (LOG)</span>
                      <span style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2, textAlign: 'center' }}>
                        Catat log anggaran pengadaan, tanpa mengubah stok
                      </span>
                    </label>
                  </div>

                  {!receivingItem.sparepartId && (
                    <div style={{ fontSize: 9, color: 'var(--red)', fontWeight: 700, marginTop: 8 }}>
                      ⚠️ Item ini belum dihubungkan ke Master Suku Cadang. Anda hanya bisa mencatat sebagai **&quot;Langsung Pakai (Non-Stok)&quot;**. Hubungkan terlebih dahulu jika ingin restock kuantitas gudang.
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

      {/* MODAL EDIT SCM DETAILS (OVERRIDE TYPOS & DELAYS) */}
      {showEditModal && editingItem && (
        <div className="modal-overlay" style={{ zIndex: 1050 }}>
          <div className="modal-card" style={{ maxWidth: 560 }}>
            <div className="modal-header" style={{ background: 'var(--sf2)', borderBottom: '1px solid var(--br)' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--tx)' }}>✏️ Sesuaikan & Edit Detail Pelacakan SCM</h3>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body" style={{ padding: 20, maxHeight: '65vh', overflowY: 'auto' }}>
                <div style={{ marginBottom: 16, borderBottom: '1px solid var(--br)', paddingBottom: 10 }}>
                  <label style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 800, textTransform: 'uppercase' }}>Nama Barang Pengajuan (Sheets)</label>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4, color: 'var(--tx)' }}>{editingItem.originalName}</div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                    Kategori: <span style={{ color: 'var(--tx2)' }}>{editingItem.productCategory || 'Sparepart'}</span> · 
                    Kuantitas: <span style={{ color: 'var(--tx2)', fontWeight: 700 }}>{editingItem.qty} {editingItem.sparepart?.uom || 'Unit'}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Nomor PR</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: PR04128"
                      value={editPrNo}
                      onChange={(e) => setEditPrNo(e.target.value)}
                    />
                    <span style={{ fontSize: 8, color: 'var(--tx3)', display: 'block', marginTop: 2 }}>
                      💡 Masukkan nomor PR dari SCM untuk pengelompokan.
                    </span>
                  </div>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Nomor PO</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: PO09123"
                      value={editPoNo}
                      onChange={(e) => setEditPoNo(e.target.value)}
                    />
                    <span style={{ fontSize: 8, color: 'var(--tx3)', display: 'block', marginTop: 2 }}>
                      💡 Selesaikan typo PO atau tambahkan PO manual di sini.
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Nama Vendor / Toko</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Nama PT / Toko online..."
                      value={editVendor}
                      onChange={(e) => setEditVendor(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Harga Satuan Aktual (Rp)</label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={editPrice}
                      onChange={(e) => setEditPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Estimasi Kedatangan (ETA Foom)</label>
                    <input
                      type="date"
                      className="form-input"
                      value={editEta}
                      onChange={(e) => setEditEta(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Urgensi Barang</label>
                    <select
                      className="form-input form-select"
                      value={editUrgency}
                      onChange={(e) => setEditUrgency(e.target.value)}
                      style={{ height: '38px' }}
                    >
                      <option value="Normal">🟢 Normal</option>
                      <option value="Urgent">🚨 Urgent / Mendesak</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Jumlah Kebutuhan (Qty)</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={editQty}
                      onChange={(e) => setEditQty(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Kategori Produk</label>
                    <select
                      className="form-input form-select"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      style={{ height: '38px' }}
                    >
                      <option value="Sparepart">Sparepart</option>
                      <option value="Tools">Tools (Alat Kerja)</option>
                      <option value="Special Tools">Special Tools</option>
                      <option value="Consumable">Consumable</option>
                      <option value="Lain-lain">Lain-lain</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Link Lembar GR Odoo (Jika Ada)</label>
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://odoo.foom.id/web#id=..."
                      value={editGrLink}
                      onChange={(e) => setEditGrLink(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Alasan Pembelian / Keterangan Lain</label>
                    <textarea
                      className="form-input"
                      placeholder="Jelaskan kebutuhan suku cadang..."
                      rows={2}
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      style={{ height: '54px', padding: '8px 12px', resize: 'none' }}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer" style={{ background: 'var(--sf2)', borderTop: '1px solid var(--br)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditModal(false)}>Batal</button>
                <button
                  type="submit"
                  className="btn btn-pur"
                  disabled={actionLoading !== null}
                  style={{ fontWeight: 700, padding: '0 24px' }}
                >
                  {actionLoading !== null ? 'Memproses...' : '💾 Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MARK AS PROCESSED (READY_ODOO -> DRAFT / TO_APPROVE) */}
      {showOdooProcessedModal && odooProcessedItem && (
        <div className="modal-overlay" style={{ zIndex: 1090 }}>
          <div className="modal-card" style={{ maxWidth: 480 }}>
            <div className="modal-header" style={{ background: 'var(--sf2)', borderBottom: '1px solid var(--br)' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--tx)' }}>🚀 Catat PR Odoo Resmi (Mark Processed)</h3>
              <button className="modal-close" onClick={() => setShowOdooProcessedModal(false)}>×</button>
            </div>
            <form onSubmit={handleOdooProcessedSubmit}>
              <div className="modal-body" style={{ padding: 20 }}>
                <div style={{ marginBottom: 16, borderBottom: '1px solid var(--br)', paddingBottom: 10 }}>
                  <label style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 800 }}>NAMA BARANG DI SHEETS</label>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4, color: 'var(--tx)' }}>{odooProcessedItem.originalName}</div>
                  <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                    Kategori: {odooProcessedItem.productCategory || 'Sparepart'} · Qty: {odooProcessedItem.qty} Pcs
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Nomor PR Odoo Resmi <span style={{ color: 'var(--red)' }}>*</span></label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="Contoh: PR/2026/06/0012"
                    value={odooProcessedPrNo}
                    onChange={(e) => setOdooProcessedPrNo(e.target.value)}
                    autoFocus
                  />
                  <span style={{ fontSize: 9, color: 'var(--tx3)', display: 'block', marginTop: 4 }}>
                    💡 Nomor PR ini akan digunakan sebagai &quot;Jangkar Pelacakan&quot; untuk menyinkronkan status langsung dari server Odoo Cloud secara otomatis.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Status Draf Odoo Awal</label>
                  <select
                    className="form-input form-select"
                    value={odooProcessedStatus}
                    onChange={(e) => setOdooProcessedStatus(e.target.value as any)}
                    style={{ height: '38px' }}
                  >
                    <option value="DRAFT">⚙️ DRAFT (Belum diajukan di Odoo)</option>
                    <option value="TO_APPROVE">⏳ TO APPROVE (Menunggu Approval di Odoo)</option>
                  </select>
                </div>
              </div>
              
              <div className="modal-footer" style={{ background: 'var(--sf2)', borderTop: '1px solid var(--br)' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowOdooProcessedModal(false)}>Batal</button>
                <button
                  type="submit"
                  className="btn btn-pur"
                  disabled={actionLoading !== null}
                  style={{ fontWeight: 700, padding: '0 24px', background: 'linear-gradient(135deg, var(--pur) 0%, #4f46e5 100%)', border: 'none', color: '#fff' }}
                >
                  {actionLoading !== null ? 'Memproses...' : '🚀 Simpan Nomor PR & Hubungkan'}
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
          font-size: 14px;
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
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </>
  );
}
