'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sparepart, TrackingItem, TabType, CardFilterType } from '@/types/mtc/procurement';
import {
  parseOdooLinks,
  filterItemByTab,
  isClosedOrDone,
  isCancelled,
  generateAutoAlias,
} from '@/lib/mtc/procurement-utils';

import { HeaderSection } from '@/components/mtc/po-pr/HeaderSection';
import { PrSubmissionForm } from '@/components/mtc/po-pr/PrSubmissionForm';
import { MetricCards } from '@/components/mtc/po-pr/MetricCards';
import { SearchAndFilters } from '@/components/mtc/po-pr/SearchAndFilters';
import { ProcurementGroupList } from '@/components/mtc/po-pr/ProcurementGroupList';

import { SettingsModal } from '@/components/mtc/po-pr/Modals/SettingsModal';
import { LinkSparepartModal } from '@/components/mtc/po-pr/Modals/LinkSparepartModal';
import { ReceiveModal } from '@/components/mtc/po-pr/Modals/ReceiveModal';
import { EditScmModal } from '@/components/mtc/po-pr/Modals/EditScmModal';
import { OdooProcessedModal } from '@/components/mtc/po-pr/Modals/OdooProcessedModal';

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
  const [filterSource] = useState<'sheet' | 'all'>('sheet');

  // Modal visibility states
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);

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
  const [reqIsStocked, setReqIsStocked] = useState(true);
  const [requestStatus, setRequestStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // MTC PRO fields
  const [reqVendor, setReqVendor] = useState('');
  const [isPengadaanBaru, setIsPengadaanBaru] = useState(false);
  const [reqNamaAlias, setReqNamaAlias] = useState('');
  const [, setReqLinkReference] = useState('');
  const [, setReqAlasan] = useState('');

  // PR Cart states
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [batchPrNo, setBatchPrNo] = useState('');

  // Catalog search/autocomplete states
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showCatalogDropdown, setShowCatalogDropdown] = useState(false);

  // Odoo processed modal state
  const [showOdooProcessedModal, setShowOdooProcessedModal] = useState(false);
  const [odooProcessedItem, setOdooProcessedItem] = useState<TrackingItem | null>(null);
  const [odooProcessedPrNo, setOdooProcessedPrNo] = useState('');
  const [odooProcessedStatus, setOdooProcessedStatus] = useState<'DRAFT' | 'TO_APPROVE'>('DRAFT');

  // Expanded rows & groups
  const [expandedRows, setExpandedRows] = useState<{ [key: number]: boolean }>({});
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({ DRAFT: true });

  // Quick Copy Popover state
  const [activeCopyPopoverId, setActiveCopyPopoverId] = useState<number | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');

  // Tabs for main view
  const [activeTab, setActiveTab] = useState<TabType>('ACTIVE');
  const [groupingMode, setGroupingMode] = useState<'PR' | 'PO'>('PR');
  const [sortBy, setSortBy] = useState<'document' | 'vendor' | 'date'>('document');
  const [cardFilter, setCardFilter] = useState<CardFilterType>(null);

  // Link Modal States
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingItem, setLinkingItem] = useState<TrackingItem | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSuggestions, setLinkSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Master options
  const [dbCategories, setDbCategories] = useState<{ id: number; nama: string; tipe: string }[]>([]);
  const [, setDbMesins] = useState<{ id: number; nama: string; tipe: string; area?: string | null }[]>([]);
  const [isCreatingNewSp, setIsCreatingNewSp] = useState(false);
  const [newSpNama, setNewSpNama] = useState('');
  const [newSpAlias, setNewSpAlias] = useState('');
  const [newSpKategoriId, setNewSpKategoriId] = useState('');
  const [newSpLokasi, setNewSpLokasi] = useState('');
  const [newSpUom, setNewSpUom] = useState('Pcs');
  const [newSpIsStocked, setNewSpIsStocked] = useState(true);

  // Receive Modal States
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingItem, setReceivingItem] = useState<TrackingItem | null>(null);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [receivePrice, setReceivePrice] = useState(0);
  const [receiveVendor, setReceiveVendor] = useState('');
  const [isStocked, setIsStocked] = useState(true);

  // Edit SCM Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<TrackingItem | null>(null);
  const [editPrNo, setEditPrNo] = useState('');
  const [editPoNo, setEditPoNo] = useState('');
  const [editTeNo, setEditTeNo] = useState('');
  const [editStatusPr, setEditStatusPr] = useState('');
  const [editVendor, setEditVendor] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [editQty, setEditQty] = useState(1);
  const [editEta, setEditEta] = useState('');
  const [editGrLink, setEditGrLink] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editKeterangan, setEditKeterangan] = useState('');
  const [editUrgency, setEditUrgency] = useState('Normal');

  const toggleRowExpand = (itemId: number) => {
    setExpandedRows((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const toggleGroupExpand = (prKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [prKey]: !prev[prKey] }));
  };

  useEffect(() => {
    fetchData();
    fetchSpareparts();
    fetchDbCategories();
    fetchDbMesins();

    async function loadSettings() {
      let currentScriptUrl = '';
      let currentSheetUrl = '';
      let currentOdooPassword = '';
      let currentOdooDb = 'foom-production-5808833';
      let currentOdooUid = '34';
      let currentOdooSessionId = '';

      try {
        const res = await fetch('/api/mtc/settings');
        const json = await res.json();
        if (json.success && json.data) {
          const dbData = json.data;
          currentScriptUrl = dbData.mtc_procurement_script_url || '';
          currentSheetUrl = dbData.mtc_procurement_sheet_url || '';
          currentOdooPassword = dbData.mtc_odoo_password || '';
          currentOdooDb = dbData.mtc_odoo_db || 'foom-production-5808833';
          currentOdooUid = dbData.mtc_odoo_uid || '34';
          currentOdooSessionId = dbData.mtc_odoo_session_id || '';
        }
      } catch (err) {
        console.error('Failed to load settings from DB:', err);
      }

      setScriptUrl(currentScriptUrl);
      setTempScriptUrl(currentScriptUrl);
      setSheetUrl(currentSheetUrl);
      setTempSheetUrl(currentSheetUrl);
      setOdooPassword(currentOdooPassword);
      setTempOdooPassword(currentOdooPassword);
      setOdooDb(currentOdooDb);
      setTempOdooDb(currentOdooDb);
      setOdooUid(currentOdooUid);
      setTempOdooUid(currentOdooUid);
      setOdooSessionId(currentOdooSessionId);
      setTempOdooSessionId(currentOdooSessionId);
    }

    loadSettings();

    if (typeof window !== 'undefined') {
      const savedCart = localStorage.getItem('mtc_pr_cart');
      if (savedCart) {
        try {
          setCartItems(JSON.parse(savedCart));
        } catch (e) {}
      }
    }
  }, []);

  useEffect(() => {
    if (!showLinkModal) return;
    setLoadingSuggestions(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mtc/master/sparepart?simple=true&search=${encodeURIComponent(linkSearch)}`);
        const json = await res.json();
        if (json.success) setLinkSuggestions(json.data || []);
      } catch (err) {
        console.error('Gagal memuat saran link sparepart:', err);
      } finally {
        setLoadingSuggestions(false);
      }
    }, linkSearch ? 300 : 0);

    return () => clearTimeout(delayDebounceFn);
  }, [linkSearch, showLinkModal]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/mtc/procurement?archived=all');
      const json = await res.json();
      if (json.success) setItems(json.data || []);
    } catch (e) {
      console.error('Gagal mengambil data pengadaan', e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSpareparts() {
    try {
      const res = await fetch('/api/mtc/master/sparepart?simple=true');
      const json = await res.json();
      if (json.success) setSpareparts(json.data || []);
    } catch (e) {}
  }

  async function fetchDbCategories() {
    try {
      const res = await fetch('/api/mtc/master/kategori');
      const json = await res.json();
      if (json.success) setDbCategories(json.data || []);
    } catch (e) {}
  }

  async function fetchDbMesins() {
    try {
      const res = await fetch('/api/mtc/master/mesin');
      const json = await res.json();
      if (json.success) setDbMesins(json.data || []);
    } catch (e) {}
  }

  async function handleOneClickSync() {
    if ((!sheetUrl || !sheetUrl.trim()) && (!odooSessionId || !odooSessionId.trim())) {
      setShowSettingsModal(true);
      alert('Silakan masukkan Link Google Sheets SCM atau Odoo Browser Session ID terlebih dahulu pada menu Pengaturan (⚙️).');
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
          odooSessionId: odooSessionId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert('✓ Sinkronisasi Google Sheets & Odoo Cloud sukses!');
        await fetchData();
        await fetchSpareparts();
      } else {
        alert(`⚠️ Gagal menyinkronkan data: ${json.error}`);
      }
    } catch (err: any) {
      alert('✓ Permintaan sinkronisasi Odoo & Sheets telah dikirim ke server. Memperbarui data...');
      await fetchData();
      await fetchSpareparts();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setScriptUrl(tempScriptUrl);
    setSheetUrl(tempSheetUrl);
    setOdooPassword(tempOdooPassword);
    setOdooDb(tempOdooDb);
    setOdooUid(tempOdooUid);
    setOdooSessionId(tempOdooSessionId);

    try {
      await fetch('/api/mtc/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mtc_procurement_script_url: tempScriptUrl,
          mtc_procurement_sheet_url: tempSheetUrl,
          mtc_odoo_password: tempOdooPassword,
          mtc_odoo_db: tempOdooDb,
          mtc_odoo_uid: tempOdooUid,
          mtc_odoo_session_id: tempOdooSessionId,
        }),
      });
    } catch (err) {}

    setManualSyncStatus({ type: 'success', msg: 'Pengaturan koneksi berhasil disimpan!' });
    setTimeout(() => {
      setShowSettingsModal(false);
      setManualSyncStatus(null);
    }, 1500);
  }

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setCsvFileText(event.target.result as string);
        setCsvFileName(file.name);
        setManualSyncStatus({ type: 'success', msg: `Berkas ${file.name} berhasil dimuat. Klik tombol Sync untuk memproses.` });
      }
    };
    reader.readAsText(file);
  }

  async function handleClearAllProcurementData() {
    if (!confirm('Apakah Anda yakin ingin MENGHAPUS SEMUA DATA sinkronisasi pengadaan/procurement?')) return;
    setActionLoading('clear-all');
    try {
      const res = await fetch('/api/mtc/procurement?action=clear_all', { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        alert(json.data.msg || 'Data procurement berhasil dikosongkan.');
        await fetchData();
      } else {
        alert(`Gagal: ${json.error}`);
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading('request');
    setRequestStatus(null);

    const selectedSp = spareparts.find((s) => s.id === reqSparepartId);
    const payload = {
      originalName: reqOriginalName,
      sparepartId: reqSparepartId || null,
      keterangan: reqKeterangan,
      qty: reqQty,
      productCategory: reqProductCategory,
      reason: isPengadaanBaru ? reqReason : 'Repeat Order',
      urgency: reqUrgency,
      linkReferences: isPengadaanBaru ? reqLinkReferences : selectedSp?.linkReference || '',
      isStocked: reqIsStocked,
      scriptUrl: scriptUrl || null,
      isPengadaanBaru: isPengadaanBaru,
      namaAlias: isPengadaanBaru ? reqNamaAlias : selectedSp?.namaAlias || '',
      alasan: isPengadaanBaru ? reqReason : selectedSp?.alasan || 'Repeat Order',
      vendor: isPengadaanBaru ? reqVendor : selectedSp?.vendor || '',
      harga: isPengadaanBaru ? 0 : selectedSp?.harga || 0,
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
        setReqOriginalName('');
        setReqSparepartId('');
        setReqQty(1);
        await fetchData();
        handleOneClickSync();
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

  const saveCartToLocalStorage = (newCart: any[]) => {
    setCartItems(newCart);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mtc_pr_cart', JSON.stringify(newCart));
    }
  };

  function handleAddToCart() {
    if (!reqOriginalName?.trim()) {
      alert('Nama barang asli wajib diisi!');
      return;
    }
    const selectedSp = spareparts.find((s) => s.id === reqSparepartId);
    const newItem = {
      id: Date.now(),
      originalName: reqOriginalName.trim(),
      sparepartId: reqSparepartId || null,
      keterangan: reqKeterangan,
      qty: Number(reqQty),
      productCategory: reqProductCategory,
      reason: isPengadaanBaru ? reqReason : 'Repeat Order',
      urgency: reqUrgency,
      linkReferences: isPengadaanBaru ? reqLinkReferences : selectedSp?.linkReference || '',
      isStocked: reqIsStocked,
      isPengadaanBaru,
      namaAlias: isPengadaanBaru ? reqNamaAlias : selectedSp?.namaAlias || '',
      alasan: isPengadaanBaru ? reqReason : selectedSp?.alasan || 'Repeat Order',
      vendor: isPengadaanBaru ? reqVendor : selectedSp?.vendor || '',
      harga: isPengadaanBaru ? 0 : selectedSp?.harga || 0,
    };
    saveCartToLocalStorage([...cartItems, newItem]);
    setReqOriginalName('');
    setReqSparepartId('');
    setReqQty(1);
  }

  function handleRemoveFromCart(id: number) {
    saveCartToLocalStorage(cartItems.filter((item) => item.id !== id));
  }

  async function handleBatchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!batchPrNo.trim() || cartItems.length === 0) return;
    setActionLoading('batch-request');
    try {
      const res = await fetch('/api/mtc/procurement/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartItems,
          nomorPr: batchPrNo.trim(),
          scriptUrl: scriptUrl || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        saveCartToLocalStorage([]);
        setBatchPrNo('');
        await fetchData();
        handleOneClickSync();
        setShowRequestForm(false);
      } else {
        alert(json.error);
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(null);
    }
  }

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
        alert('Penerimaan berhasil dicatat!');
        setShowReceiveModal(false);
        setReceivingItem(null);
        await fetchData();
      } else {
        alert(`Gagal: ${json.error}`);
      }
    } catch (err) {
      alert('Terjadi kesalahan koneksi.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLinkSparepart(sparepartId: string) {
    if (!linkingItem) return;
    setActionLoading(`link-${linkingItem.id}`);
    try {
      const res = await fetch('/api/mtc/procurement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: linkingItem.id,
          sparepartId: sparepartId,
          isStocked: true,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowLinkModal(false);
        setLinkingItem(null);
        await fetchData();
      } else {
        alert(`Gagal: ${json.error}`);
      }
    } catch (e) {
      alert('Koneksi bermasalah.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateAndLinkSparepart(e: React.FormEvent) {
    e.preventDefault();
    if (!linkingItem || !newSpNama.trim()) return;
    setActionLoading(`link-${linkingItem.id}`);
    try {
      const resSp = await fetch('/api/mtc/master/sparepart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: newSpNama.trim(),
          namaAlias: newSpAlias.trim() || null,
          kategoriId: newSpKategoriId ? Number(newSpKategoriId) : null,
          uom: newSpUom || 'Pcs',
          lokasi: newSpLokasi.trim() || null,
          harga: Number(linkingItem.harga) || 0,
        }),
      });
      const jsonSp = await resSp.json();
      if (!jsonSp.success) {
        alert(`Gagal: ${jsonSp.error}`);
        setActionLoading(null);
        return;
      }
      const newSpId = jsonSp.data.id;
      const resProc = await fetch('/api/mtc/procurement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: linkingItem.id,
          sparepartId: newSpId,
          isStocked: newSpIsStocked,
        }),
      });
      const jsonProc = await resProc.json();
      if (jsonProc.success) {
        setShowLinkModal(false);
        setLinkingItem(null);
        await fetchData();
        await fetchSpareparts();
      } else {
        alert(`Gagal: ${jsonProc.error}`);
      }
    } catch (e) {
      alert('Terjadi kesalahan.');
    } finally {
      setActionLoading(null);
    }
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
          nomorTe: editTeNo,
          statusPr: editStatusPr,
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
        alert('Detail berhasil diperbarui!');
        setShowEditModal(false);
        setEditingItem(null);
        await fetchData();
      } else {
        alert(`Gagal: ${json.error}`);
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(null);
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
          statusPr: odooProcessedStatus,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert('Status PR Odoo berhasil dicatat!');
        setShowOdooProcessedModal(false);
        setOdooProcessedItem(null);
        await fetchData();
      } else {
        alert(`Gagal: ${json.error}`);
      }
    } catch (err) {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnlinkItem(item: TrackingItem) {
    if (!confirm('Apakah Anda yakin ingin memutus hubungan dengan suku cadang?')) return;
    setActionLoading(`unlink-${item.id}`);
    try {
      const res = await fetch('/api/mtc/procurement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, sparepartId: null }),
      });
      const json = await res.json();
      if (json.success) {
        alert('✓ Hubungan suku cadang berhasil diputus!');
        await fetchData();
      }
    } catch (err) {
      alert('Terjadi kesalahan.');
    } finally {
      setActionLoading(null);
    }
  }

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
    setIsCreatingNewSp(false);
    setNewSpNama(item.originalName);
    setNewSpAlias(generateAutoAlias(item.originalName));
    setShowLinkModal(true);
  }

  function openEditModal(item: TrackingItem) {
    setEditingItem(item);
    setEditPrNo(item.nomorPr || '');
    setEditPoNo(item.nomorPo || '');
    setEditTeNo(item.nomorTe || '');
    setEditStatusPr(item.statusPr || 'DRAFT');
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

  function openOdooProcessedModal(item: TrackingItem) {
    setOdooProcessedItem(item);
    setOdooProcessedPrNo(item.nomorPr || '');
    setOdooProcessedStatus('DRAFT');
    setShowOdooProcessedModal(true);
  }

  const scopedItems = useMemo(() => {
    let activeSheetId = null;
    if (sheetUrl && sheetUrl.trim()) {
      const match = sheetUrl.trim().match(/\/d\/([a-zA-Z0-9-_]+)/);
      activeSheetId = match ? match[1] : sheetUrl.trim();
    }
    if (filterSource === 'sheet') {
      return items.filter((item) => (activeSheetId ? item.sheetId === activeSheetId : !item.sheetId));
    }
    return items;
  }, [items, filterSource, sheetUrl]);

  // Strict Tab Filtering using procurement-utils
  const filteredItems = useMemo(() => {
    return scopedItems.filter((item) => {
      if (!filterItemByTab(item, activeTab, cardFilter)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const qNorm = q.replace(/^pro/, 'pr0').replace(/o/g, '0');
        const origName = item.originalName.toLowerCase();
        const prNo = (item.nomorPr || '').toLowerCase();
        const poNo = (item.nomorPo || '').toLowerCase();
        const spName = (item.sparepart?.nama || '').toLowerCase();

        const matchName = origName.includes(q) || origName.includes(qNorm);
        const matchPr = prNo.includes(q) || prNo.includes(qNorm);
        const matchPo = poNo.includes(q) || poNo.includes(qNorm);
        const matchOdoo = spName.includes(q) || spName.includes(qNorm);

        if (!matchName && !matchPr && !matchPo && !matchOdoo) return false;
      }

      if (urgencyFilter && item.urgency !== urgencyFilter) return false;
      if (categoryFilter && item.productCategory !== categoryFilter) return false;
      if (vendorFilter && item.vendor?.trim() !== vendorFilter) return false;

      const dateToCheck = isClosedOrDone(item) ? item.tanggalTerima || item.tanggalList : item.tanggalList;
      if (dateToCheck) {
        const dateObj = new Date(dateToCheck);
        if (yearFilter && dateObj.getFullYear().toString() !== yearFilter) return false;
        if (monthFilter && (dateObj.getMonth() + 1).toString() !== monthFilter) return false;
      } else if (monthFilter || yearFilter) {
        return false;
      }

      return true;
    });
  }, [scopedItems, searchQuery, urgencyFilter, categoryFilter, vendorFilter, activeTab, monthFilter, yearFilter, cardFilter]);

  const yearsList = useMemo(() => {
    const set = new Set<string>(['2026', '2025', '2024', '2023']);
    scopedItems.forEach((item) => {
      if (item.tanggalList) set.add(new Date(item.tanggalList).getFullYear().toString());
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [scopedItems]);

  const uniqueVendors = useMemo(() => {
    const set = new Set<string>();
    scopedItems.forEach((item) => {
      if (item.vendor?.trim()) set.add(item.vendor.trim());
    });
    return Array.from(set).sort();
  }, [scopedItems]);

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
    { value: '12', label: 'Desember' },
  ];

  const checkMonthYear = (item: TrackingItem, isReceived: boolean) => {
    const dateToCheck = isReceived ? item.tanggalTerima || item.tanggalList : item.tanggalList;
    if (dateToCheck) {
      const dateObj = new Date(dateToCheck);
      if (yearFilter && dateObj.getFullYear().toString() !== yearFilter) return false;
      if (monthFilter && (dateObj.getMonth() + 1).toString() !== monthFilter) return false;
      return true;
    }
    return !monthFilter && !yearFilter;
  };

  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    scopedItems.forEach((item) => {
      if (item.productCategory) set.add(item.productCategory);
    });
    return Array.from(set).sort();
  }, [scopedItems]);

  // Group items dynamically
  const groupedPrItems = useMemo(() => {
    const groups: { [key: string]: TrackingItem[] } = {};

    filteredItems.forEach((item) => {
      const key =
        groupingMode === 'PR'
          ? item.nomorPr?.trim() || 'DRAFT'
          : item.nomorPo?.trim() || 'BELUM_ADA_PO';

      if (!groups[key]) groups[key] = [];
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

    return sortedKeys.map((key) => {
      const itemsInGroup = groups[key];
      let totalQty = 0;
      let totalCost = 0;
      const vendorsSet = new Set<string>();
      const posSet = new Set<string>();
      const prsSet = new Set<string>();
      let hasUrgent = false;
      let allDone = true;
      let someDone = false;
      let hasPoActive = false;
      let poItemsCount = 0;
      let belumGrCount = 0;
      let oldestDate: Date | null = null;
      let latestReceiveDate: Date | null = null;

      for (const item of itemsInGroup) {
        totalQty += item.qty;
        totalCost += (Number(item.harga) || 0) * item.qty;
        if (item.vendor?.trim()) vendorsSet.add(item.vendor.trim());
        if (item.nomorPo?.trim()) posSet.add(item.nomorPo.trim());
        if (item.nomorPr?.trim()) prsSet.add(item.nomorPr.trim());
        if (item.urgency === 'Urgent') hasUrgent = true;

        const itemCancelled = isCancelled(item);
        const itemDone = isClosedOrDone(item);

        if (itemDone) {
          someDone = true;
        } else if (!itemCancelled) {
          allDone = false;
        }

        if (item.nomorPo && !itemDone && !itemCancelled) {
          hasPoActive = true;
        }
        if (item.nomorPo && !itemCancelled) {
          poItemsCount++;
          if (!itemDone) belumGrCount++;
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

      const allCancelled = itemsInGroup.length > 0 && itemsInGroup.every(isCancelled);

      // Determine precise Overall Status for Group Header
      let overallStatus: 'DRAFT' | 'PR_PROCESS' | 'PR_APPROVED' | 'PO_ACTIVE' | 'PARTIAL' | 'DONE' | 'CANCELLED' = 'PR_PROCESS';
      if (allCancelled) {
        overallStatus = 'CANCELLED';
      } else if (allDone) {
        overallStatus = 'DONE';
      } else if (someDone) {
        overallStatus = 'PARTIAL';
      } else if (hasPoActive) {
        overallStatus = 'PO_ACTIVE';
      } else if (key === 'DRAFT') {
        overallStatus = 'DRAFT';
      } else if (itemsInGroup.some((i) => (i.statusPr || '').toUpperCase() === 'APPROVED')) {
        overallStatus = 'PR_APPROVED';
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
        nomorPr: groupingMode === 'PR' ? (key === 'DRAFT' ? null : key) : Array.from(prsSet).join(', ') || null,
        nomorPo: groupingMode === 'PO' ? (key === 'BELUM_ADA_PO' ? null : key) : Array.from(posSet).join(', ') || null,
        items: itemsInGroup,
        totalQty,
        totalCost,
        vendors: Array.from(vendorsSet).join(', ') || '—',
        poNumbers: Array.from(posSet).join(', ') || '—',
        prNumbers: Array.from(prsSet).join(', ') || '—',
        hasUrgent,
        overallStatus,
        daysRunningStr,
        oldestDate,
        oldestDateStr: oldestDate
          ? oldestDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
        poItemsCount,
        belumGrCount,
      };
    });
  }, [filteredItems, groupingMode]);

  const stats = useMemo(() => {
    const active = scopedItems.filter((i) => !isClosedOrDone(i) && !isCancelled(i));
    const noPriceCount = active.filter((i) => i.harga == null || Number(i.harga) === 0).length;
    const prPendingCount = active.filter((i) => i.nomorPr && !i.nomorPo).length;
    const poReceivedCount = scopedItems.filter((i) => i.nomorPo && isClosedOrDone(i)).length;
    const poPendingGrCount = active.filter((i) => i.nomorPo).length;

    return {
      noPriceCount,
      prPendingCount,
      poReceivedCount,
      poPendingGrCount,
    };
  }, [scopedItems]);

  return (
    <>
      <HeaderSection
        showRequestForm={showRequestForm}
        setShowRequestForm={setShowRequestForm}
        actionLoading={actionLoading}
        handleOneClickSync={handleOneClickSync}
        openSettingsModal={() => {
          setTempSheetUrl(sheetUrl);
          setTempScriptUrl(scriptUrl);
          setShowSettingsModal(true);
        }}
      />

      <div className="page-body">
        <PrSubmissionForm
          showRequestForm={showRequestForm}
          setShowRequestForm={setShowRequestForm}
          scriptUrl={scriptUrl}
          spareparts={spareparts}
          isPengadaanBaru={isPengadaanBaru}
          setIsPengadaanBaru={setIsPengadaanBaru}
          catalogSearch={catalogSearch}
          setCatalogSearch={setCatalogSearch}
          showCatalogDropdown={showCatalogDropdown}
          setShowCatalogDropdown={setShowCatalogDropdown}
          reqOriginalName={reqOriginalName}
          setReqOriginalName={setReqOriginalName}
          reqSparepartId={reqSparepartId}
          setReqSparepartId={setReqSparepartId}
          reqKeterangan={reqKeterangan}
          setReqKeterangan={setReqKeterangan}
          reqQty={reqQty}
          setReqQty={setReqQty}
          reqProductCategory={reqProductCategory}
          setReqProductCategory={setReqProductCategory}
          reqReason={reqReason}
          setReqReason={setReqReason}
          reqUrgency={reqUrgency}
          setReqUrgency={setReqUrgency}
          reqLinkReferences={reqLinkReferences}
          setReqLinkReferences={setReqLinkReferences}
          reqIsStocked={reqIsStocked}
          setReqIsStocked={setReqIsStocked}
          reqVendor={reqVendor}
          setReqVendor={setReqVendor}
          reqNamaAlias={reqNamaAlias}
          setReqNamaAlias={setReqNamaAlias}
          setReqAlasan={setReqAlasan}
          setReqLinkReference={setReqLinkReference}
          requestStatus={requestStatus}
          handleRequestSubmit={handleRequestSubmit}
          handleAddToCart={handleAddToCart}
          cartItems={cartItems}
          saveCartToLocalStorage={saveCartToLocalStorage}
          handleRemoveFromCart={handleRemoveFromCart}
          batchPrNo={batchPrNo}
          setBatchPrNo={setBatchPrNo}
          handleBatchSubmit={handleBatchSubmit}
          actionLoading={actionLoading}
        />

        <MetricCards
          stats={stats}
          cardFilter={cardFilter}
          setCardFilter={setCardFilter}
          setActiveTab={setActiveTab}
          scopedItems={scopedItems}
        />

        <SearchAndFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          urgencyFilter={urgencyFilter}
          setUrgencyFilter={setUrgencyFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          vendorFilter={vendorFilter}
          setVendorFilter={setVendorFilter}
          monthFilter={monthFilter}
          setMonthFilter={setMonthFilter}
          yearFilter={yearFilter}
          setYearFilter={setYearFilter}
          categoriesList={categoriesList}
          uniqueVendors={uniqueVendors}
          yearsList={yearsList}
          monthsList={monthsList}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setCardFilter={setCardFilter}
          scopedItems={scopedItems}
          checkMonthYear={checkMonthYear}
        />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx3)' }}>
            Memuat data pengadaan...
          </div>
        ) : (
          <ProcurementGroupList
            groupedPrItems={groupedPrItems}
            filteredItemsCount={filteredItems.length}
            groupingMode={groupingMode}
            setGroupingMode={setGroupingMode}
            sortBy={sortBy}
            setSortBy={setSortBy}
            expandedGroups={expandedGroups}
            toggleGroupExpand={toggleGroupExpand}
            expandedRows={expandedRows}
            toggleRowExpand={toggleRowExpand}
            activeCopyPopoverId={activeCopyPopoverId}
            setActiveCopyPopoverId={setActiveCopyPopoverId}
            openEditModal={openEditModal}
            openReceiveModal={openReceiveModal}
            openOdooProcessedModal={openOdooProcessedModal}
            openLinkModal={openLinkModal}
            handleUnlinkItem={handleUnlinkItem}
            actionLoading={actionLoading}
            activeTab={activeTab}
          />
        )}
      </div>

      <SettingsModal
        showSettingsModal={showSettingsModal}
        setShowSettingsModal={setShowSettingsModal}
        tempSheetUrl={tempSheetUrl}
        setTempSheetUrl={setTempSheetUrl}
        tempScriptUrl={tempScriptUrl}
        setTempScriptUrl={setTempScriptUrl}
        tempOdooPassword={tempOdooPassword}
        setTempOdooPassword={setTempOdooPassword}
        tempOdooDb={tempOdooDb}
        setTempOdooDb={setTempOdooDb}
        tempOdooUid={tempOdooUid}
        setTempOdooUid={setTempOdooUid}
        tempOdooSessionId={tempOdooSessionId}
        setTempOdooSessionId={setTempOdooSessionId}
        handleSaveSettings={handleSaveSettings}
        csvFileName={csvFileName}
        csvFileText={csvFileText}
        handleFileChange={handleFileChange}
        handleManualSyncSubmit={handleManualSyncSubmit}
        manualSyncStatus={manualSyncStatus}
        actionLoading={actionLoading}
        handleClearAllProcurementData={handleClearAllProcurementData}
      />

      <LinkSparepartModal
        showLinkModal={showLinkModal}
        setShowLinkModal={setShowLinkModal}
        linkingItem={linkingItem}
        linkSearch={linkSearch}
        setLinkSearch={setLinkSearch}
        linkSuggestions={linkSuggestions}
        loadingSuggestions={loadingSuggestions}
        handleLinkSparepart={handleLinkSparepart}
        isCreatingNewSp={isCreatingNewSp}
        setIsCreatingNewSp={setIsCreatingNewSp}
        newSpNama={newSpNama}
        setNewSpNama={setNewSpNama}
        newSpAlias={newSpAlias}
        setNewSpAlias={setNewSpAlias}
        newSpKategoriId={newSpKategoriId}
        setNewSpKategoriId={setNewSpKategoriId}
        newSpLokasi={newSpLokasi}
        setNewSpLokasi={setNewSpLokasi}
        newSpUom={newSpUom}
        setNewSpUom={setNewSpUom}
        newSpIsStocked={newSpIsStocked}
        setNewSpIsStocked={setNewSpIsStocked}
        dbCategories={dbCategories}
        handleCreateAndLinkSparepart={handleCreateAndLinkSparepart}
        actionLoading={actionLoading}
      />

      <ReceiveModal
        showReceiveModal={showReceiveModal}
        setShowReceiveModal={setShowReceiveModal}
        receivingItem={receivingItem}
        receiveDate={receiveDate}
        setReceiveDate={setReceiveDate}
        receivePrice={receivePrice}
        setReceivePrice={setReceivePrice}
        receiveVendor={receiveVendor}
        setReceiveVendor={setReceiveVendor}
        isStocked={isStocked}
        setIsStocked={setIsStocked}
        handleReceiveSubmit={handleReceiveSubmit}
        actionLoading={actionLoading}
      />

      <EditScmModal
        showEditModal={showEditModal}
        setShowEditModal={setShowEditModal}
        editingItem={editingItem}
        editPrNo={editPrNo}
        setEditPrNo={setEditPrNo}
        editPoNo={editPoNo}
        setEditPoNo={setEditPoNo}
        editTeNo={editTeNo}
        setEditTeNo={setEditTeNo}
        editStatusPr={editStatusPr}
        setEditStatusPr={setEditStatusPr}
        editVendor={editVendor}
        setEditVendor={setEditVendor}
        editPrice={editPrice}
        setEditPrice={setEditPrice}
        editQty={editQty}
        setEditQty={setEditQty}
        editEta={editEta}
        setEditEta={setEditEta}
        editGrLink={editGrLink}
        setEditGrLink={setEditGrLink}
        editReason={editReason}
        setEditReason={setEditReason}
        editCategory={editCategory}
        setEditCategory={setEditCategory}
        editKeterangan={editKeterangan}
        setEditKeterangan={setEditKeterangan}
        editUrgency={editUrgency}
        setEditUrgency={setEditUrgency}
        handleEditSubmit={handleEditSubmit}
        actionLoading={actionLoading}
      />

      <OdooProcessedModal
        showOdooProcessedModal={showOdooProcessedModal}
        setShowOdooProcessedModal={setShowOdooProcessedModal}
        odooProcessedItem={odooProcessedItem}
        odooProcessedPrNo={odooProcessedPrNo}
        setOdooProcessedPrNo={setOdooProcessedPrNo}
        odooProcessedStatus={odooProcessedStatus}
        setOdooProcessedStatus={setOdooProcessedStatus}
        handleOdooProcessedSubmit={handleOdooProcessedSubmit}
        actionLoading={actionLoading}
      />
    </>
  );
}
