'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import ShellLayout from '@/components/shared/ShellLayout';

export default function MtcOpnameDetailPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const { data: sessionData, status: authStatus } = useSession();
  const isEditor = (sessionData?.user as any)?.role === 'editor';

  const [session, setSession] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // View Mode: 'table' (Fast Spreadsheet Input Mode) vs 'cards' (Mobile Card View)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Filter & Sort states
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'MATCH' | 'PLUS' | 'MINUS'>('ALL');
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'location' | 'default' | 'name' | 'uncounted_first' | 'variance_first'>('location');

  // Auditor name
  const [technicianName, setTechnicianName] = useState('');
  const [focusedItemId, setFocusedItemId] = useState<number | null>(null);

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

  // Edit item modal states
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editLokasi, setEditLokasi] = useState('');
  const [editUom, setEditUom] = useState('Pcs');
  const [savingEdit, setSavingEdit] = useState(false);

  // Status submitting & action states
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Refs for keyboard navigation in fast table mode
  const inputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  useEffect(() => {
    // Load technician name from localStorage or session
    if (typeof window !== 'undefined') {
      const savedName = localStorage.getItem('mtc_opname_auditor_name') || sessionData?.user?.name || '';
      setTechnicianName(savedName);
    }

    fetchOpnameDetail();

    // Auto refresh data every 10 seconds for real-time collaboration
    const timer = setInterval(() => {
      fetchOpnameDetail(false);
    }, 10000);

    return () => clearInterval(timer);
  }, [sessionId, sessionData]);

  async function fetchOpnameDetail(showLoader = true) {
    if (!showLoader && focusedItemId !== null) return; // Skip background refresh while actively typing
    if (showLoader) setLoading(true);
    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}`);
      const json = await res.json();
      if (json.success) {
        setSession(json.data.session);
        setStats(json.data.stats);
        setLocations(json.data.locations || []);
        setCategories(json.data.categories || []);
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
    let currentAuditor = technicianName.trim();
    if (!currentAuditor) {
      currentAuditor = (sessionData?.user as any)?.name || (sessionData?.user as any)?.email || 'Teknisi MTC';
      setTechnicianName(currentAuditor);
      if (typeof window !== 'undefined') {
        localStorage.setItem('mtc_opname_auditor_name', currentAuditor);
      }
    }

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

  // Bulk Match All Uncounted Items
  async function handleBulkMatchUncounted() {
    const uncountedCount = items.filter(i => i.qtyFisik === null).length;
    if (uncountedCount === 0) {
      alert('Semua item sudah memiliki data hitungan fisik.');
      return;
    }

    if (!confirm(`Apakah Anda yakin ingin mengisi ${uncountedCount} item yang BELUM dihitung agar SAMA DENGAN STOK SISTEM (Selisih 0)?\n\nFitur ini cocok digunakan jika mayoritas barang di rak sudah dipastikan sesuai.`)) {
      return;
    }

    setActionLoading('bulk-match');
    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_match_uncounted',
          auditedBy: technicianName.trim() || sessionData?.user?.name || 'Teknisi MTC'
        })
      });
      const json = await res.json();
      if (json.success) {
        alert(json.data.msg || '✓ Berhasil menyamakan stok fisik sesuai sistem!');
        await fetchOpnameDetail(true);
      } else {
        alert(`Gagal bulk match: ${json.error}`);
      }
    } catch (e) {
      alert('Terjadi kesalahan jaringan.');
    } finally {
      setActionLoading(null);
    }
  }

  // Handle Deleting Item from SO Session
  async function handleDeleteItem(itemId: number, namaItem: string) {
    if (!confirm(`Apakah Anda yakin ingin menghapus "${namaItem}" dari sesi Stock Opname ini?`)) return;

    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}/item?itemId=${itemId}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (json.success) {
        alert(json.data?.msg || 'Item berhasil dihapus');
        await fetchOpnameDetail(false);
      } else {
        alert(`Gagal menghapus item: ${json.error}`);
      }
    } catch (e) {
      alert('Terjadi kesalahan koneksi saat menghapus item.');
    }
  }

  // Handle Editing Item Modal (Nama, Lokasi Rak, Uom)
  function openEditModal(item: any) {
    setEditingItem(item);
    setEditNama(item.namaItem || '');
    setEditLokasi(item.lokasi || '');
    setEditUom(item.uom || 'Pcs');
  }

  async function handleSaveEditItem(e: React.FormEvent) {
    e.preventDefault();
    if (!editingItem) return;
    if (!editNama.trim()) {
      alert('Nama barang wajib diisi!');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}/item`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: editingItem.id,
          namaItem: editNama.trim(),
          lokasi: editLokasi.trim(),
          uom: editUom.trim()
        })
      });
      const json = await res.json();
      if (json.success) {
        setEditingItem(null);
        alert(json.data?.msg || 'Detail item berhasil diperbarui!');
        await fetchOpnameDetail(false);
      } else {
        alert(`Gagal memperbarui item: ${json.error}`);
      }
    } catch (e) {
      alert('Terjadi kesalahan koneksi saat menyimpan perubahan.');
    } finally {
      setSavingEdit(false);
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

  // Manager Reset / Un-ACC Session
  async function handleUnpostSession() {
    if (!confirm('Apakah Anda (Supervisor/Manager) yakin ingin BATALKAN ACC / RESET status opname ini kembali ke DRAFT untuk diedit ulang?\n\nPenyesuaian stok pergerakan opname ini akan dibatalkan.')) {
      return;
    }

    setActionLoading('unpost-opname');
    try {
      const res = await fetch(`/api/mtc/opname/${sessionId}/post`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (json.success) {
        await fetchOpnameDetail();
        alert(json.data.msg || '✓ Status sesi Opname berhasil dikembalikan ke DRAFT!');
      } else {
        alert(`Gagal membatalkan ACC: ${json.error}`);
      }
    } catch (e) {
      alert('Koneksi bermasalah.');
    } finally {
      setActionLoading(null);
    }
  }

  // Filtered & Sorted items
  const filteredItems = useMemo(() => {
    let result = items.filter(item => {
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

      if (selectedCategory !== 'ALL') {
        if ((item.kategori || '') !== selectedCategory) return false;
      }

      if (activeTab === 'PENDING') {
        if (item.id === focusedItemId) return true;
        return item.qtyFisik === null || item.qtyFisik === undefined;
      }
      if (activeTab === 'MATCH') return item.qtyFisik !== null && item.selisih === 0;
      if (activeTab === 'PLUS') return item.qtyFisik !== null && item.selisih > 0;
      if (activeTab === 'MINUS') return item.qtyFisik !== null && item.selisih < 0;

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'location') {
        const locA = a.lokasi || '';
        const locB = b.lokasi || '';
        if (locA !== locB) return locA.localeCompare(locB);
        return (a.namaItem || '').localeCompare(b.namaItem || '');
      }
      if (sortBy === 'name') {
        return (a.namaItem || '').localeCompare(b.namaItem || '');
      }
      if (sortBy === 'uncounted_first') {
        const aCounted = a.qtyFisik !== null ? 1 : 0;
        const bCounted = b.qtyFisik !== null ? 1 : 0;
        if (aCounted !== bCounted) return aCounted - bCounted;
        return (a.lokasi || '').localeCompare(b.lokasi || '');
      }
      if (sortBy === 'variance_first') {
        const aVar = Math.abs(a.selisih || 0);
        const bVar = Math.abs(b.selisih || 0);
        return bVar - aVar;
      }
      return a.id - b.id; // default
    });

    return result;
  }, [items, search, selectedLocation, selectedCategory, activeTab, sortBy, focusedItemId]);

  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  // Keyboard navigation handler for fast table entry
  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number, item: any) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextItem = filteredItems[currentIndex + 1];
      if (nextItem && inputRefs.current[nextItem.id]) {
        inputRefs.current[nextItem.id]?.focus();
        inputRefs.current[nextItem.id]?.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevItem = filteredItems[currentIndex - 1];
      if (prevItem && inputRefs.current[prevItem.id]) {
        inputRefs.current[prevItem.id]?.focus();
        inputRefs.current[prevItem.id]?.select();
      }
    } else if (e.key === '=') {
      // Shortcut '=' sets value to system qty
      e.preventDefault();
      handleUpdateCount(item.id, item.qtySistem);
      const nextItem = filteredItems[currentIndex + 1];
      if (nextItem && inputRefs.current[nextItem.id]) {
        inputRefs.current[nextItem.id]?.focus();
        inputRefs.current[nextItem.id]?.select();
      }
    }
  }

  if (authStatus === 'loading' || loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Memuat data Stock Opname MTC...</div>
      </div>
    );
  }

  if (!isEditor) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <h2>Akses Ditolak</h2>
        <p style={{ color: '#94a3b8', fontSize: 13 }}>Halaman Stock Opname hanya dapat diakses oleh user dengan hak akses <strong>Editor / Maintenance Administrator</strong>.</p>
        <Link href="/mtc/stock" style={{ color: '#38bdf8', textDecoration: 'underline', marginTop: 16, display: 'inline-block' }}>
          ← Buka Halaman Stok Sparepart
        </Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
        <h2>Sesi Stock Opname Tidak Ditemukan</h2>
        <Link href="/mtc/opname" style={{ color: '#a855f7', textDecoration: 'underline', marginTop: 16, display: 'inline-block' }}>
          ← Kembali ke Daftar Opname
        </Link>
      </div>
    );
  }

  const isReadOnly = session.status === 'POSTED';

  const content = (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg1, #0f172a)',
      color: 'var(--tx1, #f8fafc)',
      fontFamily: 'Inter, system-ui, sans-serif',
      paddingBottom: 120
    }}>
      {/* Sticky Header Bar */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: '#1e293b',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        padding: '12px 18px',
        marginBottom: 16,
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/mtc/opname" style={{ textDecoration: 'none', fontSize: 20, color: '#94a3b8' }} title="Kembali ke Daftar Opname">
              ←
            </Link>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>{session.judul}</h2>
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>#SO-{session.id}</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                📍 {session.lokasi || 'Semua Rak Gudang'} · {stats?.countedItems}/{stats?.totalItems} Item Terhitung ({stats?.progressPct}%)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {session.status === 'DRAFT' && (
              <span style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', padding: '4px 10px', fontSize: 11, fontWeight: 800, borderRadius: 10 }}>
                ⏳ DRAFT
              </span>
            )}
            {session.status === 'WAITING_APPROVAL' && (
              <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '4px 10px', fontSize: 11, fontWeight: 800, borderRadius: 10 }}>
                📤 MENUNGGU ACC
              </span>
            )}
            {session.status === 'POSTED' && (
              <span style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '4px 10px', fontSize: 11, fontWeight: 800, borderRadius: 10 }}>
                ✓ TER-POSTING
              </span>
            )}

            {/* Print Shortcuts */}
            <Link
              href={`/mtc/opname/${sessionId}/print?mode=form`}
              target="_blank"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                padding: '6px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
              title="Cetak lembar kerja fisik blanko untuk pencatatan di atas kertas di lapangan"
            >
              📋 Cetak Form Fisik
            </Link>

            <Link
              href={`/mtc/opname/${sessionId}/print?mode=report`}
              target="_blank"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.15)',
                padding: '6px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
              title="Cetak laporan rekapitulasi hasil opname"
            >
              📊 Cetak Laporan
            </Link>

            {isEditor && (session.status === 'POSTED' || session.status === 'WAITING_APPROVAL') && (
              <button
                onClick={handleUnpostSession}
                disabled={actionLoading === 'unpost-opname'}
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#f87171',
                  background: 'rgba(239, 68, 68, 0.15)',
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  cursor: 'pointer'
                }}
                title="Batal ACC & kembalikan status ke DRAFT untuk diedit ulang"
              >
                {actionLoading === 'unpost-opname' ? '⏳ Resetting...' : '↩️ Batal ACC'}
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
          <div style={{
            width: `${stats?.progressPct || 0}%`,
            height: '100%',
            background: stats?.progressPct === 100 ? '#22c55e' : 'linear-gradient(90deg, #a855f7, #38bdf8)',
            transition: 'width 0.3s'
          }} />
        </div>
      </div>

      <div style={{ padding: '0 18px' }}>
        {/* Auditor & Quick Action Banner */}
        <div style={{
          padding: 14,
          marginBottom: 16,
          borderRadius: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>👤</span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase' }}>Teknisi Audit / Penginput Data</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{technicianName || 'Belum diisi'}</div>
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
                padding: '4px 10px',
                fontSize: 11,
                borderRadius: 6,
                border: '1px solid #60a5fa',
                background: 'transparent',
                color: '#60a5fa',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ✏️ Ganti Nama
            </button>
          </div>

          {/* Quick Bulk Tools */}
          {!isReadOnly && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleBulkMatchUncounted}
                disabled={actionLoading === 'bulk-match'}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#4ade80',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
                title="Isi sekaligus semua item yang belum dihitung agar sama dengan stok sistem (Selisih 0)"
              >
                {actionLoading === 'bulk-match' ? '⏳ Memproses...' : '⚡ Samakan Sisa Belum Hitung = Sistem'}
              </button>

              <button
                onClick={() => setShowAddUnlistedModal(true)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(168, 85, 247, 0.4)',
                  background: 'rgba(168, 85, 247, 0.15)',
                  color: '#c084fc',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                ➕ Barang Tidak Terdaftar
              </button>
            </div>
          )}
        </div>

        {/* Audit Stats Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, textAlign: 'center', borderTop: '3px solid #0284c7' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>🎯 AKURASI DATA</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8', marginTop: 2 }}>
              {stats?.accuracyPct !== undefined ? stats.accuracyPct : (stats?.countedItems > 0 ? ((stats.totalMatchingCount / stats.countedItems) * 100).toFixed(1) : 0)}%
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{stats?.totalMatchingCount} / {stats?.countedItems} Sesuai</div>
          </div>

          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, textAlign: 'center', borderTop: '3px solid #22c55e' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>🟢 SESUAI (0)</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#4ade80', marginTop: 2 }}>{stats?.totalMatchingCount}</div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Item Cocok</div>
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
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>Total Selisih Rp</div>
          </div>
        </div>

        {/* Filter & View Toolbar */}
        <div style={{
          background: '#1e293b',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          padding: 14,
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          {/* Row 1: Search & View Mode Switcher */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <input
              type="text"
              placeholder="🔍 Cari nama sparepart, kode barang, atau posisi rak..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1,
                minWidth: 260,
                padding: '9px 14px',
                fontSize: 13,
                borderRadius: 8,
                background: '#0f172a',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff'
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0f172a', padding: 3, borderRadius: 8 }}>
              <button
                onClick={() => setViewMode('table')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: viewMode === 'table' ? '#38bdf8' : 'transparent',
                  color: viewMode === 'table' ? '#0f172a' : '#94a3b8'
                }}
                title="Mode Tabel Cepat untuk input data dari lembar kertas dengan navigasi keyboard Enter/Panah"
              >
                ⚡ Mode Tabel Cepat (Spreadsheet)
              </button>
              <button
                onClick={() => setViewMode('cards')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: viewMode === 'cards' ? '#38bdf8' : 'transparent',
                  color: viewMode === 'cards' ? '#0f172a' : '#94a3b8'
                }}
                title="Mode Kartu"
              >
                📱 Mode Kartu
              </button>
            </div>
          </div>

          {/* Row 2: Status Tabs, Location Filter, and Sorting */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
              {[
                { id: 'ALL', label: `Semua (${stats?.totalItems || items.length})` },
                { id: 'PENDING', label: `Belum (${(stats?.totalItems || items.length) - (stats?.countedItems || 0)})` },
                { id: 'MATCH', label: `Sesuai (${stats?.totalMatchingCount || 0})` },
                { id: 'MINUS', label: `Minus (-)` },
                { id: 'PLUS', label: `Plus (+)` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 700,
                    border: 'none',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    background: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.06)',
                    color: activeTab === tab.id ? '#0f172a' : '#cbd5e1',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Sort By Dropdown */}
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 8,
                  background: '#0f172a',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#cbd5e1'
                }}
              >
                <option value="location">📍 Urutkan: Rak / Lokasi (Sesuai Form Kertas)</option>
                <option value="default">🔢 Urutkan: No ID Default</option>
                <option value="name">🔤 Urutkan: Nama Barang (A-Z)</option>
                <option value="uncounted_first">⏳ Urutkan: Belum Dihitung Teratas</option>
                <option value="variance_first">⚠️ Urutkan: Selisih Terbanyak</option>
              </select>

              {locations.length > 0 && (
                <select
                  value={selectedLocation}
                  onChange={e => setSelectedLocation(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    background: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#cbd5e1'
                  }}
                >
                  <option value="ALL">Semua Rak ({locations.length})</option>
                  {locations.map(loc => (
                    <option key={loc} value={loc}>Rak: {loc}</option>
                  ))}
                </select>
              )}

              {categories.length > 0 && (
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    background: '#0f172a',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: '#cbd5e1'
                  }}
                >
                  <option value="ALL">Semua Kategori ({categories.length})</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* MODE 1: FAST SPREADSHEET TABLE INPUT MODE */}
        {viewMode === 'table' && (
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
          }}>
            <div style={{
              background: '#0f172a',
              padding: '8px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              color: '#94a3b8'
            }}>
              <div>
                ⌨️ <strong>Tips Input Cepat:</strong> Tekan <kbd style={{ background: '#334155', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>Enter</kbd> atau <kbd style={{ background: '#334155', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>↓</kbd> untuk simpan & lompat ke baris bawah. Tekan <kbd style={{ background: '#334155', color: '#fff', padding: '1px 5px', borderRadius: 4 }}>=</kbd> untuk samakan dengan sistem.
              </div>
              <div>Menampilkan <strong>{filteredItems.length}</strong> item</div>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: '70vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#1e293b', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8' }}>
                    <th style={{ padding: '10px 8px', width: 34, textAlign: 'center' }}>No</th>
                    <th style={{ padding: '10px 10px', width: 90 }}>Kode</th>
                    <th style={{ padding: '10px 10px' }}>Nama Sparepart / Barang</th>
                    <th style={{ padding: '10px 10px', width: 110 }}>Lokasi / Rak</th>
                    <th style={{ padding: '10px 8px', width: 50, textAlign: 'center' }}>UOM</th>
                    <th style={{ padding: '10px 10px', width: 85, textAlign: 'right' }}>Stok Sistem</th>
                    <th style={{ padding: '10px 10px', width: 190, textAlign: 'center', background: 'rgba(56, 189, 248, 0.08)' }}>
                      INPUT STOK FISIK
                    </th>
                    <th style={{ padding: '10px 10px', width: 95, textAlign: 'right' }}>Selisih</th>
                    <th style={{ padding: '10px 10px', width: 95, textAlign: 'center' }}>Petugas</th>
                    <th style={{ padding: '10px 10px', width: 130 }}>Catatan & Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                        Tidak ada item yang sesuai filter pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const isCounted = item.qtyFisik !== null && item.qtyFisik !== undefined;
                      const selisih = item.selisih || 0;

                      let rowBg = idx % 2 === 0 ? '#1e293b' : 'rgba(255,255,255,0.02)';
                      if (isCounted) {
                        if (selisih === 0) rowBg = 'rgba(34, 197, 94, 0.05)';
                        else if (selisih < 0) rowBg = 'rgba(239, 68, 68, 0.08)';
                        else rowBg = 'rgba(59, 130, 246, 0.08)';
                      }

                      return (
                        <tr
                          key={item.id}
                          style={{
                            background: rowBg,
                            borderBottom: '1px solid rgba(255,255,255,0.06)'
                          }}
                        >
                          <td style={{ padding: '8px 6px', textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>{idx + 1}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>
                            {item.sparepartId || '—'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ fontWeight: 700, color: '#fff' }}>{item.namaItem}</div>
                            {item.isNewItem && (
                              <span style={{ fontSize: 9, color: '#eab308', background: 'rgba(234, 179, 8, 0.15)', padding: '1px 5px', borderRadius: 4 }}>
                                Item Baru
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span
                              onClick={() => setSelectedLocation(item.lokasi || 'ALL')}
                              style={{
                                background: 'rgba(255,255,255,0.08)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 11,
                                color: '#38bdf8',
                                cursor: 'pointer'
                              }}
                              title="Klik untuk filter hanya rak ini"
                            >
                              📍 {item.lokasi || 'Gudang'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 6px', textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>{item.uom}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#cbd5e1' }}>
                            {item.qtySistem}
                          </td>

                          {/* Fast Input Field with Keyboard Navigation */}
                          <td style={{ padding: '6px 10px', textAlign: 'center', background: 'rgba(56, 189, 248, 0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <input
                                ref={el => { inputRefs.current[item.id] = el; }}
                                type="number"
                                disabled={isReadOnly}
                                placeholder="Hitung..."
                                value={item.qtyFisik !== null && item.qtyFisik !== undefined ? item.qtyFisik : ''}
                                onFocus={() => setFocusedItemId(item.id)}
                                onBlur={() => {
                                  setTimeout(() => {
                                    setFocusedItemId(prev => prev === item.id ? null : prev);
                                  }, 400);
                                }}
                                onKeyDown={e => handleInputKeyDown(e, idx, item)}
                                onChange={e => {
                                  const val = e.target.value === '' ? null : parseInt(e.target.value);
                                  handleUpdateCount(item.id, val);
                                }}
                                style={{
                                  width: 80,
                                  height: 34,
                                  textAlign: 'center',
                                  fontWeight: 900,
                                  fontSize: 15,
                                  borderRadius: 8,
                                  border: isCounted
                                    ? (selisih === 0 ? '2px solid #22c55e' : selisih < 0 ? '2px solid #ef4444' : '2px solid #3b82f6')
                                    : '1px solid rgba(255,255,255,0.2)',
                                  background: '#0f172a',
                                  color: '#fff'
                                }}
                              />

                              {!isReadOnly && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCount(item.id, item.qtySistem)}
                                  style={{
                                    height: 34,
                                    padding: '0 8px',
                                    borderRadius: 6,
                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                    background: 'rgba(34, 197, 94, 0.15)',
                                    color: '#4ade80',
                                    fontSize: 11,
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                  }}
                                  title="Klik untuk samakan dengan stok sistem (Selisih 0)"
                                >
                                  = Sesuai
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Selisih Result */}
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {!isCounted ? (
                              <span style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>Belum hitung</span>
                            ) : selisih === 0 ? (
                              <span style={{ color: '#4ade80', fontWeight: 800 }}>0 Sesuai</span>
                            ) : selisih < 0 ? (
                              <span style={{ color: '#f87171', fontWeight: 900 }}>{selisih} {item.uom}</span>
                            ) : (
                              <span style={{ color: '#60a5fa', fontWeight: 900 }}>+{selisih} {item.uom}</span>
                            )}
                          </td>

                          <td style={{ padding: '8px 10px', textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>
                            {item.auditedBy || '—'}
                          </td>

                          {/* Catatan & Action Icons */}
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button
                                onClick={() => {
                                  const note = prompt('Masukkan catatan audit untuk barang ini:', item.catatan || '');
                                  if (note !== null) {
                                    handleUpdateCount(item.id, item.qtyFisik, note);
                                  }
                                }}
                                style={{
                                  background: item.catatan ? 'rgba(192, 132, 252, 0.2)' : 'transparent',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  color: item.catatan ? '#c084fc' : '#94a3b8',
                                  borderRadius: 4,
                                  padding: '3px 6px',
                                  fontSize: 10,
                                  cursor: 'pointer'
                                }}
                                title={item.catatan || 'Tambah catatan audit'}
                              >
                                💬 {item.catatan ? 'Catatan' : '+'}
                              </button>

                              {!isReadOnly && (
                                <>
                                  <button
                                    onClick={() => openEditModal(item)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#38bdf8',
                                      fontSize: 11,
                                      cursor: 'pointer',
                                      padding: '2px 4px'
                                    }}
                                    title="Edit nama barang / lokasi rak"
                                  >
                                    ✏️
                                  </button>

                                  <button
                                    onClick={() => handleDeleteItem(item.id, item.namaItem)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: '#f87171',
                                      fontSize: 11,
                                      cursor: 'pointer',
                                      padding: '2px 4px'
                                    }}
                                    title="Hapus dari sesi opname"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MODE 2: CARD VIEW */}
        {viewMode === 'cards' && (
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
                              ✨ BARANG BARU
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                          <span>📍 Rak: <strong style={{ color: '#38bdf8' }}>{item.lokasi || 'Gudang MTC'}</strong></span>
                          <span>Kat: {item.kategori || 'Umum'}</span>
                          {item.sparepartId && <span>Kode: {item.sparepartId}</span>}
                        </div>
                      </div>

                      <div>{badgeTag}</div>
                    </div>

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
                            width: 38,
                            height: 38,
                            borderRadius: 8,
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
                          onFocus={() => setFocusedItemId(item.id)}
                          onBlur={() => {
                            setTimeout(() => {
                              setFocusedItemId(prev => prev === item.id ? null : prev);
                            }, 400);
                          }}
                          onChange={e => {
                            const val = e.target.value === '' ? null : parseInt(e.target.value);
                            handleUpdateCount(item.id, val);
                          }}
                          style={{
                            width: 75,
                            height: 38,
                            textAlign: 'center',
                            fontWeight: 900,
                            fontSize: 16,
                            borderRadius: 8,
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
                            width: 38,
                            height: 38,
                            borderRadius: 8,
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

                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => handleUpdateCount(item.id, item.qtySistem)}
                            style={{
                              height: 38,
                              padding: '0 10px',
                              borderRadius: 8,
                              border: '1px solid rgba(34, 197, 94, 0.4)',
                              background: 'rgba(34, 197, 94, 0.15)',
                              color: '#4ade80',
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                            title="Set sama dengan stok sistem"
                          >
                            = Sesuai
                          </button>
                        )}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button
                            onClick={() => {
                              const note = prompt('Masukkan catatan audit untuk item ini:', item.catatan || '');
                              if (note !== null) {
                                handleUpdateCount(item.id, item.qtyFisik, note);
                              }
                            }}
                            style={{ background: 'none', border: 'none', color: '#c084fc', fontSize: 11, cursor: 'pointer', padding: 0 }}
                          >
                            💬 {item.catatan ? `Catatan: "${item.catatan}"` : '+ Catatan'}
                          </button>

                          <button
                            onClick={() => openEditModal(item)}
                            style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 11, cursor: 'pointer', padding: 0 }}
                          >
                            ✏️ Edit
                          </button>

                          <button
                            onClick={() => handleDeleteItem(item.id, item.namaItem)}
                            style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer', padding: 0 }}
                          >
                            🗑️ Hapus
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Floating Action Buttons for Session Submissions */}
      {!isReadOnly && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          left: 16,
          right: 16,
          display: 'flex',
          gap: 12,
          zIndex: 99,
          justifyContent: 'center'
        }}>
          {session.status === 'DRAFT' && (
            <button
              onClick={handleSubmitForApproval}
              disabled={actionLoading === 'submit-approval'}
              style={{
                flex: 1,
                maxWidth: 280,
                padding: '13px 18px',
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 30,
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(168, 85, 247, 0.45)'
              }}
            >
              {actionLoading === 'submit-approval' ? '⏳ Mengajukan...' : '📤 Selesai & Ajukan ke Manager'}
            </button>
          )}

          {session.status === 'WAITING_APPROVAL' && (
            <button
              onClick={handleAccAndPost}
              disabled={actionLoading === 'post-opname'}
              style={{
                flex: 1,
                maxWidth: 300,
                padding: '13px 18px',
                fontSize: 13,
                fontWeight: 800,
                borderRadius: 30,
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(34, 197, 94, 0.45)'
              }}
            >
              {actionLoading === 'post-opname' ? '⏳ Posting...' : '✓ ACC & Post Penyesuaian Stok'}
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
                  <select
                    value={unlistedKategori}
                    onChange={e => setUnlistedKategori(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                  >
                    <option value="Umum">Umum</option>
                    <option value="Bearing">Bearing</option>
                    <option value="Seal">Seal</option>
                    <option value="Elektrik">Elektrik</option>
                    <option value="Mekanik">Mekanik</option>
                    <option value="Pneumatic">Pneumatic</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>Lokasi / Kode Rak</label>
                  <input
                    type="text"
                    list="opnameLokasiDatalist"
                    placeholder="Pilih atau ketik Rak..."
                    value={unlistedLokasi}
                    onChange={e => setUnlistedLokasi(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                  />
                  <datalist id="opnameLokasiDatalist">
                    {locations.map(loc => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
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

      {/* Edit Item Modal */}
      {editingItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 999,
          padding: 16
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 440,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#fff' }}>
                ✏️ Edit Nama & Posisi Rak
              </h3>
              <button onClick={() => setEditingItem(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditItem}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>
                  Nama Barang / Sparepart <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={editNama}
                  onChange={e => setEditNama(e.target.value)}
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>
                  Lokasi / Posisi Rak (SLOC Terdaftar)
                </label>

                {locations.length > 0 && (
                  <select
                    value={editLokasi}
                    onChange={e => setEditLokasi(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#38bdf8', fontWeight: 700, fontSize: 12, marginBottom: 8 }}
                  >
                    <option value="">-- Pilih dari Rak Terdaftar ({locations.length} SLOC) --</option>
                    {locations.map(loc => (
                      <option key={loc} value={loc}>📍 {loc}</option>
                    ))}
                  </select>
                )}

                <input
                  type="text"
                  list="editRakDatalist"
                  placeholder="Atau ketik nama lokasi rak baru..."
                  value={editLokasi}
                  onChange={e => setEditLokasi(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                />
                <datalist id="editRakDatalist">
                  {locations.map(loc => (
                    <option key={loc} value={loc} />
                  ))}
                </datalist>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ fontWeight: 700, fontSize: 11, color: '#cbd5e1', display: 'block', marginBottom: 4 }}>
                  Satuan (UoM)
                </label>
                <input
                  type="text"
                  placeholder="Pcs, Set, Roll"
                  value={editUom}
                  onChange={e => setEditUom(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" onClick={() => setEditingItem(null)} style={{ padding: '8px 16px', background: 'transparent', color: '#94a3b8', border: 'none', cursor: 'pointer' }} disabled={savingEdit}>
                  Batal
                </button>
                <button type="submit" style={{ padding: '9px 18px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 8, fontWeight: 800, cursor: 'pointer' }} disabled={savingEdit}>
                  {savingEdit ? '⏳ Menyimpan...' : '💾 Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  return <ShellLayout>{content}</ShellLayout>;
}
