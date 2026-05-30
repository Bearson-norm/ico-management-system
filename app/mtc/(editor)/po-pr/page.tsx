'use client';
import { useState, useEffect, useMemo } from 'react';

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
  
  // Saved configurations
  const [scriptUrl, setScriptUrl] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  
  // Modal states
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showScriptCodeModal, setShowScriptCodeModal] = useState(false);
  
  // Temporary Settings states
  const [tempSheetUrl, setTempSheetUrl] = useState('');
  const [tempScriptUrl, setTempScriptUrl] = useState('');
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
  
  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  
  // Expanded PR Groups state (default: expand drafts/new items)
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({
    'DRAFT': true
  });
  
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
    }
  }, []);

  // Sync settings saver
  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setScriptUrl(tempScriptUrl);
    setSheetUrl(tempSheetUrl);
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('mtc_procurement_script_url', tempScriptUrl);
      localStorage.setItem('mtc_procurement_sheet_url', tempSheetUrl);
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

  // One-Click Google Sheets Sync
  async function handleOneClickSync() {
    if (!sheetUrl || !sheetUrl.trim()) {
      setTempSheetUrl('');
      setShowSettingsModal(true);
      alert('Silakan masukkan Link Google Sheets SCM terlebih dahulu pada menu Pengaturan (⚙️).');
      return;
    }

    setActionLoading('sync-main');
    try {
      const res = await fetch('/api/mtc/procurement/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: sheetUrl.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        alert(json.data?.msg || '✓ Sinkronisasi data Google Sheets berhasil!');
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

    const payload = {
      originalName: reqOriginalName,
      sparepartId: reqSparepartId || null,
      keterangan: reqKeterangan,
      qty: reqQty,
      productCategory: reqProductCategory,
      reason: reqReason,
      urgency: reqUrgency,
      linkReferences: reqLinkReferences,
      isStocked: reqIsStocked,
      scriptUrl: scriptUrl || null, // Auto-push to GSheets if configured
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
        
        const isReceived = item.statusPo === 'DONE';
        if (isReceived) {
          someDone = true;
        } else {
          allDone = false;
        }

        if (item.nomorPo && item.statusPo !== 'DONE') {
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
    const active = items.filter(i => i.statusPo !== 'DONE');
    const received = items.filter(i => i.statusPo === 'DONE' && i.tanggalTerima && i.tanggalList);
    
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
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginBottom: 16 }}>
                
                {/* Left Column (Core info) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Nama Barang Asli (Original Material Name) <span className="req" style={{ color: 'var(--red)' }}>*</span></label>
                    <input
                      type="text"
                      className="form-input"
                      required
                      placeholder="Ketik nama sesuai toko online / penawaran vendor..."
                      value={reqOriginalName}
                      onChange={(e) => setReqOriginalName(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Hubungkan Suku Cadang Resmi MTC (Dropdown Master DB)</label>
                    <select
                      className="form-input form-select"
                      value={reqSparepartId}
                      onChange={(e) => setReqSparepartId(e.target.value)}
                      style={{ height: '38px' }}
                    >
                      <option value="">— Bukan untuk Suku Cadang Terdaftar / Umum —</option>
                      {spareparts.map(sp => (
                        <option key={sp.id} value={sp.id}>{sp.nama} ({sp.id})</option>
                      ))}
                    </select>
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
                      placeholder="Tempel link Tokopedia, Shopee, atau dokumen penawaran..."
                      value={reqLinkReferences}
                      onChange={(e) => setReqLinkReferences(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: 11 }}>Alasan Pembelian (Reason / Deskripsi Kebutuhan Mesin)</label>
                <textarea
                  className="form-input"
                  placeholder="Jelaskan detail untuk mesin apa, kerusakan apa, atau kenapa barang ini mendesak..."
                  rows={2}
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  style={{ height: '54px', padding: '8px 12px', resize: 'none' }}
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
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr', gap: 16, alignItems: 'center' }}>
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

            {/* Custom Tab Switcher */}
            <div style={{ display: 'flex', background: 'var(--sf2)', padding: 4, borderRadius: 8, height: '40px', border: '1px solid var(--br)' }}>
              <button
                type="button"
                className="ntab"
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
                ⏳ Aktif ({items.filter(i => i.statusPo !== 'DONE').length})
              </button>
              <button
                type="button"
                className="ntab"
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
                ✓ Diterima ({items.filter(i => i.statusPo === 'DONE').length})
              </button>
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
                            const isItemReceived = item.statusPo === 'DONE';
                            const hasEtaPassed = item.etaFoom && !isItemReceived && new Date(item.etaFoom).getTime() < new Date().getTime();

                            return (
                              <tr 
                                key={item.id} 
                                style={{ 
                                  borderBottom: '1px solid var(--br)',
                                  backgroundColor: isItemUrgent && !isItemReceived ? 'rgba(239, 68, 68, 0.02)' : 'transparent'
                                }}
                              >
                                {/* index nomor list (Fb) */}
                                <td className="text-mono text-tiny text-muted" style={{ textAlign: 'center', paddingLeft: 20 }}>
                                  {item.fbIndex || '—'}
                                </td>
                                
                                {/* Original item name */}
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {isItemUrgent && !isItemReceived && <span style={{ color: 'var(--red)', fontSize: 12 }}>🚨</span>}
                                    <span style={{ fontWeight: 700, color: 'var(--tx)' }}>{item.originalName}</span>
                                  </div>
                                  {item.reason && <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4, fontStyle: 'italic' }}>&quot;{item.reason}&quot;</div>}
                                </td>

                                {/* Odoo Connected Item */}
                                <td>
                                  {item.sparepart ? (
                                    <div>
                                      <div style={{ fontWeight: 700, color: 'var(--tx2)', fontSize: 12 }}>{item.sparepart.nama}</div>
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                <td style={{ textAlign: 'center' }}>
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
                                <td style={{ textAlign: 'right', paddingRight: 20 }}>
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
