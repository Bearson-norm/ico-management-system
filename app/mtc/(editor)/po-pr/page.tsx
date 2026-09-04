'use client';

import { useState, useEffect, useMemo } from 'react';
import { Sparepart, TrackingItem, TabType, CardFilterType } from '@/types/mtc/procurement';
import {
  filterItemByTab,
  isClosedOrDone,
  isOdooGrDone,
  isPhysicallyReceived,
  isCancelled,
  generateAutoAlias,
  getItemSimplifiedStatus,
} from '@/lib/mtc/procurement-utils';

import { HeaderSection } from '@/components/mtc/po-pr/HeaderSection';
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

  // Saved Odoo configurations
  const [odooPassword, setOdooPassword] = useState('');
  const [odooDb, setOdooDb] = useState('foom-production-5808833');
  const [odooUid, setOdooUid] = useState('34');
  const [odooSessionId, setOdooSessionId] = useState('');

  // Modal visibility states
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Temporary Settings states
  const [tempOdooPassword, setTempOdooPassword] = useState('');
  const [tempOdooDb, setTempOdooDb] = useState('foom-production-5808833');
  const [tempOdooUid, setTempOdooUid] = useState('34');
  const [tempOdooSessionId, setTempOdooSessionId] = useState('');
  const [manualSyncStatus, setManualSyncStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

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
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
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
      try {
        const res = await fetch('/api/mtc/settings');
        const json = await res.json();
        if (json.success && json.data) {
          const dbData = json.data;
          const currentOdooPassword = dbData.mtc_odoo_password || '';
          const currentOdooDb = dbData.mtc_odoo_db || 'foom-production-5808833';
          const currentOdooUid = dbData.mtc_odoo_uid || '34';
          const currentOdooSessionId = dbData.mtc_odoo_session_id || '';

          setOdooPassword(currentOdooPassword);
          setTempOdooPassword(currentOdooPassword);
          setOdooDb(currentOdooDb);
          setTempOdooDb(currentOdooDb);
          setOdooUid(currentOdooUid);
          setTempOdooUid(currentOdooUid);
          setOdooSessionId(currentOdooSessionId);
          setTempOdooSessionId(currentOdooSessionId);
        }
      } catch (err) {
        console.error('Failed to load settings from DB:', err);
      }
    }

    loadSettings();
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
    if (!odooSessionId || !odooSessionId.trim()) {
      setShowSettingsModal(true);
      alert('Silakan masukkan Odoo Browser Session ID terlebih dahulu pada menu Pengaturan (⚙️).');
      return;
    }

    setActionLoading('sync-main');
    try {
      const res = await fetch('/api/mtc/odoo/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          odooPassword: odooPassword,
          odooDb: odooDb,
          odooUid: parseInt(odooUid) || 34,
          odooSessionId: odooSessionId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        alert('✓ Sinkronisasi Odoo Cloud berhasil!');
        await fetchData();
        await fetchSpareparts();
      } else {
        alert(`⚠️ Gagal menyinkronkan data: ${json.error}`);
      }
    } catch (err: any) {
      alert('✓ Permintaan sinkronisasi Odoo telah dikirim ke server. Memperbarui data...');
      await fetchData();
      await fetchSpareparts();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setOdooPassword(tempOdooPassword);
    setOdooDb(tempOdooDb);
    setOdooUid(tempOdooUid);
    setOdooSessionId(tempOdooSessionId);

    try {
      await fetch('/api/mtc/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mtc_odoo_password: tempOdooPassword,
          mtc_odoo_db: tempOdooDb,
          mtc_odoo_uid: tempOdooUid,
          mtc_odoo_session_id: tempOdooSessionId,
        }),
      });
    } catch (err) {}

    setManualSyncStatus({ type: 'success', msg: 'Pengaturan Odoo berhasil disimpan!' });
    setTimeout(() => {
      setShowSettingsModal(false);
      setManualSyncStatus(null);
    }, 1500);
  }

  async function handleClearAllProcurementData() {
    if (!confirm('Apakah Anda yakin ingin MENGHAPUS SEMUA DATA sinkronisasi pengadaan/procurement di database lokal?')) return;
    setActionLoading('clear-all');
    try {
      const res = await fetch('/api/mtc/procurement?action=clear_all', { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        alert(json.data.msg || 'Data procurement lokal berhasil dikosongkan.');
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
        alert('Penerimaan berhasil dicatat ke stok gudang!');
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

  // Pure Local Items list (No Google Sheets scope)
  const scopedItems = useMemo(() => items, [items]);

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
      const allItemsForPr = scopedItems.filter((i) =>
        (groupingMode === 'PR' ? i.nomorPr?.trim() || 'DRAFT' : i.nomorPo?.trim() || 'BELUM_ADA_PO') === key
      );
      const totalScopeItemsCount = allItemsForPr.length;
      const closedScopeItemsCount = allItemsForPr.filter(isClosedOrDone).length;

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
        const itemGrDone = isOdooGrDone(item);
        const itemStockReceived = isPhysicallyReceived(item);

        if (itemGrDone) {
          someDone = true;
        } else if (!itemCancelled) {
          allDone = false;
        }

        if (item.nomorPo && !itemCancelled) {
          poItemsCount++;
          if (!itemGrDone) belumGrCount++;
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

      // Determine Simplified Overall Status for Group Header
      let overallStatus: 'DRAFT' | 'APPROVAL' | 'PO' | 'RECEIVED' | 'CLOSED' | 'DONE' | 'CANCELLED' = 'DRAFT';
      if (allCancelled) {
        overallStatus = 'CANCELLED';
      } else if (allDone) {
        overallStatus = 'CLOSED';
      } else if (itemsInGroup.some((i) => getItemSimplifiedStatus(i) === 'RECEIVED')) {
        overallStatus = 'RECEIVED';
      } else if (posSet.size > 0 && Array.from(posSet)[0] !== 'BELUM_ADA_PO') {
        overallStatus = 'PO';
      } else if (itemsInGroup.some((i) => getItemSimplifiedStatus(i) === 'PO')) {
        overallStatus = 'PO';
      } else if (itemsInGroup.some((i) => getItemSimplifiedStatus(i) === 'APPROVAL') || (key !== 'DRAFT' && prsSet.size > 0)) {
        overallStatus = 'APPROVAL';
      } else {
        overallStatus = 'DRAFT';
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
        totalScopeItemsCount,
        closedScopeItemsCount,
      };
    });
  }, [filteredItems, groupingMode, scopedItems]);

  const stats = useMemo(() => {
    let draftCount = 0;
    let approvalCount = 0;
    let poCount = 0;
    let receivedCount = 0;
    let closedCount = 0;

    scopedItems.forEach((i) => {
      const s = getItemSimplifiedStatus(i);
      if (s === 'DRAFT') draftCount++;
      else if (s === 'APPROVAL') approvalCount++;
      else if (s === 'PO') poCount++;
      else if (s === 'RECEIVED') receivedCount++;
      else if (s === 'CLOSED') closedCount++;
    });

    return {
      draftCount,
      approvalCount,
      poCount,
      receivedCount,
      closedCount,
      doneCount: closedCount
    };
  }, [scopedItems]);

  return (
    <>
      <HeaderSection
        actionLoading={actionLoading}
        handleOneClickSync={handleOneClickSync}
        openSettingsModal={() => {
          setTempOdooPassword(odooPassword);
          setTempOdooDb(odooDb);
          setTempOdooUid(odooUid);
          setTempOdooSessionId(odooSessionId);
          setShowSettingsModal(true);
        }}
      />

      <div className="page-body">
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
            Memuat data pengadaan Odoo...
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
        tempOdooPassword={tempOdooPassword}
        setTempOdooPassword={setTempOdooPassword}
        tempOdooDb={tempOdooDb}
        setTempOdooDb={setTempOdooDb}
        tempOdooUid={tempOdooUid}
        setTempOdooUid={setTempOdooUid}
        tempOdooSessionId={tempOdooSessionId}
        setTempOdooSessionId={setTempOdooSessionId}
        handleSaveSettings={handleSaveSettings}
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

