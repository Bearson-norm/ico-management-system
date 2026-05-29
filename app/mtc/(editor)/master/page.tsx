'use client';
import React, { useState, useEffect } from 'react';

type TabType = 'sparepart' | 'mesin' | 'teknisi' | 'kategori' | 'bom';

export default function MasterPage() {
  const [activeTab, setActiveTab] = useState<TabType>('sparepart');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Filters State
  const [filterKategori, setFilterKategori] = useState<string>('');
  const [filterMesin, setFilterMesin] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>(''); // '', 'aktif', 'nonaktif'
  const [filterPengadaan, setFilterPengadaan] = useState<string>(''); // '', 'PR', 'PO', 'NONE'
  
  // Data
  const [spareparts, setSpareparts] = useState<any[]>([]);
  const [mesins, setMesins] = useState<any[]>([]);
  const [teknisis, setTeknisis] = useState<any[]>([]);
  const [kategoris, setKategoris] = useState<any[]>([]);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<TabType>('sparepart');
  const [isEdit, setIsEdit] = useState(false);
  const [form, setForm] = useState<any>({});

  // Unified Super Import State
  const [unifiedImportOpen, setUnifiedImportOpen] = useState(false);
  const [importType, setImportType] = useState<string>('sparepart');
  const [importMethod, setImportMethod] = useState<'excel' | 'csv'>('excel');
  const [importText, setImportText] = useState('');
  const [stockImportSync, setStockImportSync] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // BOM State
  const [bomMesins, setBomMesins] = useState<any[]>([]);
  const [expandedMesinId, setExpandedMesinId] = useState<number | null>(null);

  // Reset filters on tab switch
  useEffect(() => {
    setFilterKategori('');
    setFilterMesin('');
    setFilterStatus('');
    setFilterPengadaan('');
  }, [activeTab]);

  useEffect(() => {
    fetchData();
  }, [activeTab, search]);

  async function fetchData() {
    setLoading(true);
    try {
      if (activeTab === 'sparepart') {
        const res = await fetch('/api/mtc/master/sparepart?search=' + search);
        const json = await res.json();
        if (json.success) setSpareparts(json.data);
      } else if (activeTab === 'mesin') {
        const res = await fetch('/api/mtc/master/mesin');
        const json = await res.json();
        if (json.success) setMesins(json.data);
      } else if (activeTab === 'teknisi') {
        const res = await fetch('/api/mtc/master/teknisi');
        const json = await res.json();
        if (json.success) setTeknisis(json.data);
      } else if (activeTab === 'kategori') {
        const res = await fetch('/api/mtc/master/kategori');
        const json = await res.json();
        if (json.success) setKategoris(json.data);
      } else if (activeTab === 'bom') {
        const res = await fetch('/api/mtc/master/mesin?include=spareparts');
        const json = await res.json();
        if (json.success) setBomMesins(json.data);
      }
    } finally {
      setLoading(false);
    }
  }

  // Khusus sparepart fetch kategori dan mesin untuk dropdown/checkbox
  useEffect(() => {
    if (activeTab === 'sparepart') {
      if (kategoris.length === 0) fetch('/api/mtc/master/kategori').then(r => r.json()).then(j => { if(j.success) setKategoris(j.data); });
      if (mesins.length === 0) fetch('/api/mtc/master/mesin').then(r => r.json()).then(j => { if(j.success) setMesins(j.data); });
    }
  }, [activeTab]);

  const openModal = (type: TabType, data: any = null) => {
    setModalType(type);
    setIsEdit(!!data);
    if (type === 'sparepart') {
      setForm(data ? { ...data, kategoriId: data.kategoriId || '', purchasingStatus: data.purchasingStatus || 'NONE', mesinIds: data.mesins?.map((m: any) => m.id.toString()) || [] } : { purchasingStatus: 'NONE' });
      // Sparepart tidak bisa dibuat dari sini, hanya dari menu Stock In -> Beli Baru
    } else if (type === 'mesin') {
      setForm(
        data
          ? { ...data, tipe: data.tipe || 'perbaikan' }
          : { nama: '', area: '', tipe: 'perbaikan', aktif: true }
      );
    } else if (type === 'teknisi') {
      setForm(data || { nama: '', aktif: true });
    } else if (type === 'kategori') {
      setForm(data || { nama: '', tipe: 'umum' });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const endpoint = `/api/mtc/master/${modalType}`;
    const method = isEdit ? 'PUT' : 'POST';
    
    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });

    if (res.ok) {
      setModalOpen(false);
      fetchData();
    } else {
      const json = await res.json();
      alert('Error: ' + json.error);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Apakah Anda yakin ingin menghapus data ini secara permanen? Tindakan ini tidak dapat dibatalkan.`)) return;
    
    const endpoint = `/api/mtc/master/${modalType}?id=${form.id}`;
    const res = await fetch(endpoint, {
      method: 'DELETE',
    });

    if (res.ok) {
      setModalOpen(false);
      fetchData();
    } else {
      const json = await res.json();
      alert('Gagal menghapus: ' + json.error);
    }
  };

  const handleUnifiedImportSubmit = async () => {
    if (!importText.trim()) return alert('Data masih kosong atau file belum dipilih');
    setIsImporting(true);

    try {
      let res;
      if (importType === 'stock') {
        res = await fetch('/api/mtc/stock/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: importText,
            syncMode: stockImportSync,
            keterangan: stockImportSync ? 'Stock report sync' : 'Saldo awal',
          }),
        });
      } else {
        res = await fetch('/api/mtc/master/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: importType, rawText: importText }),
        });
      }

      const json = await res.json();

      if (json.success) {
        const d = json.data;
        if (d.skippedRows?.length || d.failedRows?.length) {
          console.group('Detail import');
          if (d.skippedRows?.length) console.table(d.skippedRows);
          if (d.failedRows?.length) console.table(d.failedRows);
          console.groupEnd();
        }
        alert(d.message || '✅ Import data berhasil!');
        setUnifiedImportOpen(false);
        setImportText('');
        fetchData();
      } else {
        alert('❌ Error: ' + json.error);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      alert('Terjadi kesalahan saat memproses import: ' + message);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result ?? ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const getImportGuidelines = () => {
    switch (importType) {
      case 'sparepart':
        return {
          title: '📦 Master Sparepart',
          alertClass: 'alert-blu',
          cols: 'id (Item ID), nama, kategori, uom, lokasi, harga, minQty, maxLeadTime, avgLeadTime',
          placeholderExcel: "Contoh Copy-Paste dari Excel:\nid\tnama\tkategori\tuom\tlokasi\tharga\tminQty\nMTC-SP-001\tBearing SKF\tMechanical\tPcs\t1-A-1-1\t50000\t2",
          placeholderCsv: "Contoh isi file CSV:\nid,nama,kategori,uom,lokasi,harga,minQty\nMTC-SP-001,Bearing SKF,Mechanical,Pcs,1-A-1-1,50000,2"
        };
      case 'mesin':
        return {
          title: '🏭 Master Mesin',
          alertClass: 'alert-blu',
          cols: 'nama, tipe, area (tipe: perbaikan / sparepart / keduanya)',
          placeholderExcel: "Contoh Copy-Paste dari Excel:\nnama\ttipe\tarea\nMesin Press 100T\tkeduanya\tLine A",
          placeholderCsv: "Contoh isi file CSV:\nnama,tipe,area\nMesin Press 100T,keduanya,Line A"
        };
      case 'bom':
        return {
          title: '🔗 Pemetaan BOM Mesin',
          alertClass: 'alert-pur',
          cols: 'Nama Mesin, Item ID (atau sparepartId, mesinNama)',
          placeholderExcel: "Contoh Copy-Paste dari Excel:\nNama Mesin\tItem ID\nMesin Press 100T\tMTC-SP-001",
          placeholderCsv: "Contoh isi file CSV:\nNama Mesin,Item ID\nMesin Press 100T,MTC-SP-001"
        };
      case 'stock':
        return {
          title: '📊 Laporan Stok Awal / Sync',
          alertClass: 'alert-grn',
          cols: 'id, Current Stock',
          placeholderExcel: "Contoh Copy-Paste dari Excel:\nid\tCurrent Stock\nMTC-SP-001\t15",
          placeholderCsv: "Contoh isi file CSV:\nid,Current Stock\nMTC-SP-001,15"
        };
      default:
        return {
          title: 'Import',
          alertClass: 'alert-blu',
          cols: '',
          placeholderExcel: '',
          placeholderCsv: ''
        };
    }
  };

  return (
    <>
      <div className="page-header">
        <div className="flex-between page-header-row">
          <div>
            <div className="page-title">⚙️ Master Data</div>
            <div className="page-sub">Kelola informasi barang, teknisi, mesin, dan kategori</div>
          </div>
          <div className="page-header-actions">
            {(activeTab === 'sparepart' || activeTab === 'mesin' || activeTab === 'bom') && (
              <button 
                type="button" 
                className="btn btn-ghost" 
                onClick={() => {
                  setImportType(activeTab);
                  setImportText('');
                  setUnifiedImportOpen(true);
                }}
              >
                📋 Import Excel
              </button>
            )}
            {activeTab !== 'sparepart' && activeTab !== 'bom' && (
              <button type="button" className="btn btn-primary" onClick={() => openModal(activeTab)}>
                + Tambah {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Navigation Tabs */}
        <div className="nav-wrap nav-wrap--scroll" style={{ marginBottom: 20 }} role="tablist" aria-label="Master data">
          <button type="button" role="tab" aria-selected={activeTab === 'sparepart'} className={`ntab ${activeTab === 'sparepart' ? 'act-rp' : ''}`} onClick={() => setActiveTab('sparepart')}>
            📦 Sparepart
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'mesin'} className={`ntab ${activeTab === 'mesin' ? 'act-in' : ''}`} onClick={() => setActiveTab('mesin')}>
            🏭 Mesin
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'teknisi'} className={`ntab ${activeTab === 'teknisi' ? 'act-out' : ''}`} onClick={() => setActiveTab('teknisi')}>
            👷 Teknisi
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'kategori'} className={`ntab ${activeTab === 'kategori' ? 'act-in' : ''}`} onClick={() => setActiveTab('kategori')}>
            🏷️ Kategori
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'bom'} className={`ntab ${activeTab === 'bom' ? 'act-rp' : ''}`} onClick={() => setActiveTab('bom')}>
            🔗 BOM per Mesin
          </button>
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="master-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 16, flexWrap: 'wrap' }}>
              <div className="search-bar" style={{ flex: 1, minWidth: 240, marginBottom: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" placeholder="Cari data..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>

              {activeTab === 'sparepart' && (
                <div className="master-filters">
                  {/* Filter Kategori */}
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <select
                      className="form-input form-select"
                      style={{ padding: '6px 30px 6px 14px', borderRadius: 20, background: 'var(--sf2)', color: 'var(--tx)', border: '1px solid var(--br)', fontSize: 12, height: 'auto', outline: 'none', cursor: 'pointer', appearance: 'none', minWidth: 150, transition: 'all .15s' }}
                      value={filterKategori}
                      onChange={e => setFilterKategori(e.target.value)}
                    >
                      <option value="">🏷️ Semua Kategori</option>
                      {kategoris.map(k => (
                        <option key={k.id} value={k.nama}>{k.nama}</option>
                      ))}
                    </select>
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)', fontSize: 9 }}>
                      ▼
                    </div>
                  </div>

                  {/* Filter Mesin */}
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <select
                      className="form-input form-select"
                      style={{ padding: '6px 30px 6px 14px', borderRadius: 20, background: 'var(--sf2)', color: 'var(--tx)', border: '1px solid var(--br)', fontSize: 12, height: 'auto', outline: 'none', cursor: 'pointer', appearance: 'none', minWidth: 150, transition: 'all .15s' }}
                      value={filterMesin}
                      onChange={e => setFilterMesin(e.target.value)}
                    >
                      <option value="">🏭 Semua Mesin</option>
                      {mesins.map(m => (
                        <option key={m.id} value={m.nama}>{m.nama}</option>
                      ))}
                    </select>
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)', fontSize: 9 }}>
                      ▼
                    </div>
                  </div>

                  {/* Filter Status Aktif */}
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <select
                      className="form-input form-select"
                      style={{ padding: '6px 30px 6px 14px', borderRadius: 20, background: 'var(--sf2)', color: 'var(--tx)', border: '1px solid var(--br)', fontSize: 12, height: 'auto', outline: 'none', cursor: 'pointer', appearance: 'none', minWidth: 120, transition: 'all .15s' }}
                      value={filterStatus}
                      onChange={e => setFilterStatus(e.target.value)}
                    >
                      <option value="">⚙️ Semua Status</option>
                      <option value="aktif">🟢 Aktif</option>
                      <option value="nonaktif">🔴 Nonaktif</option>
                    </select>
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)', fontSize: 9 }}>
                      ▼
                    </div>
                  </div>

                  {/* Filter Status Pengadaan */}
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <select
                      className="form-input form-select"
                      style={{ padding: '6px 30px 6px 14px', borderRadius: 20, background: 'var(--sf2)', color: 'var(--tx)', border: '1px solid var(--br)', fontSize: 12, height: 'auto', outline: 'none', cursor: 'pointer', appearance: 'none', minWidth: 160, transition: 'all .15s' }}
                      value={filterPengadaan}
                      onChange={e => setFilterPengadaan(e.target.value)}
                    >
                      <option value="">🛒 Semua Pengadaan</option>
                      <option value="PR">⏳ Sedang PR</option>
                      <option value="PO">📦 Sudah PO</option>
                      <option value="NONE">— Tanpa Status</option>
                    </select>
                    <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)', fontSize: 9 }}>
                      ▼
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="table-wrap">
            <table className="table-stack" style={{ opacity: loading ? 0.5 : 1 }}>
              
              {/* TAB: SPAREPART */}
              {activeTab === 'sparepart' && (
                <>
                  <thead>
                    <tr>
                      <th>Item ID</th>
                      <th>Nama Barang</th>
                      <th>Lokasi / SLOC</th>
                      <th>Kategori</th>
                      <th style={{ textAlign: 'right' }}>Harga</th>
                      <th style={{ textAlign: 'right' }}>Stok</th>
                      <th>Min Qty</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const list = spareparts.filter(s => {
                        if (filterKategori && s.kategori?.nama !== filterKategori) return false;
                        if (filterMesin && !s.mesins?.some((m: any) => m.nama === filterMesin)) return false;
                        if (filterStatus) {
                          const isAktif = filterStatus === 'aktif';
                          if (s.aktif !== isAktif) return false;
                        }
                        if (filterPengadaan && s.purchasingStatus !== filterPengadaan) return false;
                        return true;
                      });

                      if (list.length === 0 && !loading) {
                        return <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>Data tidak ditemukan</td></tr>;
                      }

                      return list.map(s => (
                        <tr key={s.id}>
                          <td data-label="Item ID" className="text-mono text-tiny text-muted">{s.id}</td>
                          <td data-label="Nama Barang" style={{ fontWeight: 600 }}>
                            <div>{s.nama}</div>
                            {s.purchasingStatus === 'PR' && <span className="badge badge-ylw" style={{ fontSize: 9, marginTop: 4, display: 'inline-block' }}>⏳ Sedang PR</span>}
                            {s.purchasingStatus === 'PO' && <span className="badge badge-blu" style={{ fontSize: 9, marginTop: 4, display: 'inline-block' }}>📦 Sudah PO</span>}
                          </td>
                          <td data-label="Lokasi"><span className="badge badge-blu" style={{ fontSize: 10 }}>{s.lokasi || '—'}</span></td>
                          <td data-label="Kategori">{s.kategori?.nama || '—'}</td>
                          <td data-label="Harga">Rp {Number(s.harga).toLocaleString('id-ID')}</td>
                          <td data-label="Stok" style={{ fontWeight: 700, color: s.currentStock <= 0 ? 'var(--red)' : s.currentStock < s.minQty ? 'var(--ylw)' : 'var(--grn)' }}>
                            {s.currentStock ?? 0} {s.uom}
                          </td>
                          <td data-label="Min Qty">{s.minQty}</td>
                          <td data-label="Status">{s.aktif ? <span className="badge badge-grn">Aktif</span> : <span className="badge badge-red">Nonaktif</span>}</td>
                          <td data-label="Aksi">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal('sparepart', s)}>Edit</button>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </>
              )}

              {/* TAB: MESIN */}
              {activeTab === 'mesin' && (
                <>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nama Mesin</th>
                      <th>Tipe</th>
                      <th>Area</th>
                      <th>Spareparts</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesins
                      .filter(m => m.nama.toLowerCase().includes(search.toLowerCase()))
                      .filter(m => m.tipe === 'perbaikan')
                      .map(m => (
                      <tr key={m.id}>
                        <td data-label="ID" className="text-muted text-tiny">{m.id}</td>
                        <td data-label="Nama Mesin" style={{ fontWeight: 600 }}>{m.nama}</td>
                        <td data-label="Tipe">
                          {m.tipe === 'sparepart' ? <span className="badge badge-blu">Khusus Sparepart (BOM)</span>
                           : m.tipe === 'perbaikan' ? <span className="badge badge-ylw">Khusus Perbaikan</span>
                           : <span className="badge badge-pur">Keduanya</span>}
                        </td>
                        <td data-label="Area">{m.area || '—'}</td>
                        <td data-label="Spareparts"><span className="badge badge-pur">{m._sparepartCount ?? 0} item</span></td>
                        <td data-label="Status">{m.aktif ? <span className="badge badge-grn">Aktif</span> : <span className="badge badge-red">Nonaktif</span>}</td>
                        <td data-label="Aksi">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal('mesin', m)}>Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {/* TAB: TEKNISI */}
              {activeTab === 'teknisi' && (
                <>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nama Teknisi / PIC</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teknisis.filter(t => t.nama.toLowerCase().includes(search.toLowerCase())).map(t => (
                      <tr key={t.id}>
                        <td data-label="ID" className="text-muted text-tiny">{t.id}</td>
                        <td data-label="Nama Teknisi" style={{ fontWeight: 600 }}>{t.nama}</td>
                        <td data-label="Status">{t.aktif ? <span className="badge badge-grn">Aktif</span> : <span className="badge badge-red">Nonaktif</span>}</td>
                        <td data-label="Aksi">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal('teknisi', t)}>Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {/* TAB: KATEGORI */}
              {activeTab === 'kategori' && (
                <>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nama Kategori</th>
                      <th>Tipe</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kategoris.filter(k => k.nama.toLowerCase().includes(search.toLowerCase())).map(k => (
                      <tr key={k.id}>
                        <td data-label="ID" className="text-muted text-tiny">{k.id}</td>
                        <td data-label="Nama Kategori" style={{ fontWeight: 600 }}>{k.nama}</td>
                        <td data-label="Tipe">
                          {k.tipe === 'sparepart' ? <span className="badge badge-blu">Sparepart</span>
                           : k.tipe === 'maintenance' ? <span className="badge badge-ylw">Maintenance</span>
                           : <span className="badge badge-pur">Umum</span>}
                        </td>
                        <td data-label="Aksi">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal('kategori', k)}>Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {/* TAB: BOM per Mesin */}
              {activeTab === 'bom' && (
                <>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>Nama Mesin</th>
                      <th>Area</th>
                      <th>Jumlah Sparepart Terhubung</th>
                      <th style={{ textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bomMesins
                      .filter(m => m.nama.toLowerCase().includes(search.toLowerCase()))
                      .filter(m => m.tipe === 'sparepart' || m.tipe === 'keduanya')
                      .filter(m => (m._sparepartCount ?? 0) > 0)
                      .map(m => (
                        <React.Fragment key={m.id}>
                        <tr onClick={() => setExpandedMesinId(expandedMesinId === m.id ? null : m.id)} style={{ cursor: 'pointer' }}>
                          <td style={{ textAlign: 'center', fontSize: 14 }}>{expandedMesinId === m.id ? '▼' : '▶'}</td>
                          <td data-label="Nama Mesin" style={{ fontWeight: 600 }}>{m.nama}</td>
                          <td data-label="Area">{m.area || '—'}</td>
                          <td data-label="Jumlah SP">
                            <span className={`badge ${m._sparepartCount > 0 ? 'badge-pur' : 'badge-red'}`}>
                              {m._sparepartCount} sparepart
                            </span>
                          </td>
                          <td data-label="Aksi" style={{ textAlign: 'right' }}>
                            <button 
                              type="button" 
                              className="btn btn-ghost btn-sm" 
                              onClick={(e) => {
                                e.stopPropagation();
                                openModal('mesin', m);
                              }}
                            >
                              ✏️ Edit Mesin
                            </button>
                          </td>
                        </tr>
                        {expandedMesinId === m.id && (
                          <tr>
                            <td colSpan={5} style={{ padding: 0 }}>
                              <div style={{ padding: '12px 20px 16px 48px', background: 'var(--sf2)', borderTop: '1px solid var(--br)' }}>
                                {Array.isArray(m.spareparts) && m.spareparts.length > 0 ? (
                                  <table className="table-clean" style={{ marginBottom: 0 }}>
                                    <thead>
                                      <tr>
                                        <th style={{ fontSize: 11 }}>Item ID</th>
                                        <th style={{ fontSize: 11 }}>Nama Sparepart</th>
                                        <th style={{ fontSize: 11 }}>UoM</th>
                                        <th style={{ fontSize: 11 }}>SLOC</th>
                                        <th style={{ fontSize: 11, textAlign: 'right' }}>Aksi</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {m.spareparts.map((sp: any) => (
                                        <tr key={sp.id}>
                                          <td className="text-mono text-tiny text-muted">{sp.id}</td>
                                          <td style={{ fontWeight: 600, fontSize: 13 }}>{sp.nama}</td>
                                          <td className="text-tiny">{sp.uom}</td>
                                          <td><span className="badge badge-blu" style={{ fontSize: 10 }}>{sp.lokasi || '—'}</span></td>
                                          <td style={{ textAlign: 'right', padding: '4px 8px' }}>
                                            <button 
                                              type="button" 
                                              className="btn btn-ghost btn-sm" 
                                              style={{ fontSize: 11, padding: '2px 8px' }}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openModal('sparepart', sp);
                                              }}
                                            >
                                              ✏️ Edit BOM
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div style={{ color: 'var(--tx3)', fontSize: 13, padding: '8px 0' }}>
                                    {m._sparepartCount > 0
                                      ? '⏳ Memuat daftar sparepart...'
                                      : 'Belum ada sparepart yang dihubungkan ke mesin ini.'}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {bomMesins.length === 0 && !loading && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40 }}>Tidak ada data mesin</td></tr>
                    )}
                  </tbody>
                </>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* MODAL EDIT/TAMBAH */}
      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-title">{isEdit ? 'Edit Data' : 'Tambah Data'}</div>
            </div>
            <div className="modal-body">
              <form id="masterForm" onSubmit={handleSubmit} className="form-grid">
                
                {/* FORM SPAREPART */}
                {modalType === 'sparepart' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Nama Barang</label>
                      <input className="form-input" required value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} />
                    </div>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label className="form-label">Kategori</label>
                        <select className="form-input form-select" value={form.kategoriId} onChange={e => setForm({...form, kategoriId: e.target.value})}>
                          <option value="">Tanpa Kategori</option>
                          {kategoris.filter(k => k.tipe === 'sparepart' || k.tipe === 'umum').map(k => (
                            <option key={k.id} value={k.id}>{k.nama}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Satuan (UoM)</label>
                        <input className="form-input" required value={form.uom} onChange={e => setForm({...form, uom: e.target.value})} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Lokasi / SLOC (Rak-Kol-Lvl-Bin)</label>
                      <input className="form-input" placeholder="Contoh: 1-A-1-1" value={form.lokasi || ''} onChange={e => setForm({...form, lokasi: e.target.value})} />
                    </div>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label className="form-label">Harga Satuan (Rp)</label>
                        <input type="number" className="form-input" required value={form.harga} onChange={e => setForm({...form, harga: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Manual Min Qty (Backup Alert)</label>
                        <input type="number" className="form-input" required value={form.minQty} onChange={e => setForm({...form, minQty: e.target.value})} />
                      </div>
                    </div>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label className="form-label">Lead Time Terlama (Hari)</label>
                        <input type="number" className="form-input" value={form.maxLeadTime || ''} placeholder="Contoh: 14" onChange={e => setForm({...form, maxLeadTime: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Lead Time Rata-Rata (Hari)</label>
                        <input type="number" className="form-input" value={form.avgLeadTime || ''} placeholder="Contoh: 7" onChange={e => setForm({...form, avgLeadTime: e.target.value})} />
                      </div>
                    </div>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label className="form-label">Status Aktif</label>
                        <select className="form-input form-select" value={form.aktif ? 'true' : 'false'} onChange={e => setForm({...form, aktif: e.target.value === 'true'})}>
                          <option value="true">Aktif (Bisa Dipilih)</option>
                          <option value="false">Nonaktif / Tidak Dijual</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Status Pengadaan (PR / PO)</label>
                        <select className="form-input form-select" value={form.purchasingStatus || 'NONE'} onChange={e => setForm({...form, purchasingStatus: e.target.value})}>
                          <option value="NONE">— Tidak Ada Status —</option>
                          <option value="PR">⏳ Sedang di-PR (Requisition)</option>
                          <option value="PO">📦 Sudah jadi PO (Order)</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group" style={{ gridColumn: '1/-1' }}>
                      <label className="form-label">Digunakan Pada Mesin (BOM)</label>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--br)' }}>
                        {mesins.map(m => {
                          const checked = form.mesinIds?.includes(m.id.toString());
                          return (
                            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, background: checked ? 'var(--blu-d)' : 'var(--sf2)', padding: '4px 10px', borderRadius: 20, color: checked ? 'var(--blu)' : 'var(--tx2)', border: `1px solid ${checked ? 'var(--blu)' : 'transparent'}` }}>
                              <input 
                                type="checkbox" 
                                checked={checked} 
                                onChange={(e) => {
                                  const cur = form.mesinIds || [];
                                  if (e.target.checked) setForm({...form, mesinIds: [...cur, m.id.toString()]});
                                  else setForm({...form, mesinIds: cur.filter((id: string) => id !== m.id.toString())});
                                }}
                                style={{ display: 'none' }}
                              />
                              {checked ? '✓ ' : ''}{m.nama}
                            </label>
                          );
                        })}
                        {mesins.length === 0 && <span className="text-muted text-tiny">Belum ada data mesin</span>}
                      </div>
                    </div>
                  </>
                )}

                {/* FORM MESIN */}
                {modalType === 'mesin' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Nama Mesin</label>
                      <input className="form-input" required value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Area (Opsional)</label>
                      <input className="form-input" value={form.area || ''} onChange={e => setForm({...form, area: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tipe Mesin</label>
                      <select className="form-input form-select" value={form.tipe || 'keduanya'} onChange={e => setForm({...form, tipe: e.target.value})}>
                        <option value="keduanya">Keduanya (Tampil di semua)</option>
                        <option value="sparepart">Khusus Induk (BOM Sparepart)</option>
                        <option value="perbaikan">Khusus Line (Laporan Perbaikan)</option>
                      </select>
                    </div>
                    {isEdit && (
                      <div className="form-group">
                        <label className="form-label">Status Aktif</label>
                        <select className="form-input form-select" value={form.aktif ? 'true' : 'false'} onChange={e => setForm({...form, aktif: e.target.value === 'true'})}>
                          <option value="true">Aktif</option>
                          <option value="false">Nonaktif</option>
                        </select>
                      </div>
                    )}
                  </>
                )}

                {/* FORM TEKNISI */}
                {modalType === 'teknisi' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Nama Teknisi / PIC</label>
                      <input className="form-input" required value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} />
                    </div>
                    {isEdit && (
                      <div className="form-group">
                        <label className="form-label">Status Aktif</label>
                        <select className="form-input form-select" value={form.aktif ? 'true' : 'false'} onChange={e => setForm({...form, aktif: e.target.value === 'true'})}>
                          <option value="true">Aktif</option>
                          <option value="false">Nonaktif</option>
                        </select>
                      </div>
                    )}
                  </>
                )}

                {/* FORM KATEGORI */}
                {modalType === 'kategori' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Nama Kategori</label>
                      <input className="form-input" required value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Peruntukan Tipe</label>
                      <select className="form-input form-select" value={form.tipe} onChange={e => setForm({...form, tipe: e.target.value})}>
                        <option value="sparepart">Khusus Sparepart</option>
                        <option value="maintenance">Khusus Maintenance</option>
                        <option value="umum">Umum (Bisa keduanya)</option>
                      </select>
                    </div>
                  </>
                )}

              </form>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div>
                {isEdit && (
                  <button 
                    type="button" 
                    className="btn" 
                    style={{ background: 'var(--red)', color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={handleDelete}
                  >
                    🗑️ Hapus Permanen
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Batal</button>
                <button type="submit" form="masterForm" className="btn btn-primary">Simpan Data</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UNIFIED SUPER IMPORT MODAL */}
      {unifiedImportOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setUnifiedImportOpen(false); }}>
          <div className="modal-box" style={{ maxWidth: 620, width: '100%', height: '90vh' }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                📥 Super Import Data Massal
              </div>
              <button onClick={() => { setUnifiedImportOpen(false); setImportText(''); }} style={{ background:'none', border:'none', color:'var(--tx2)', fontSize: 20 }}>×</button>
            </div>
            
            <div className="modal-body" style={{ gap: 16, overflowY: 'auto' }}>
              {/* Select Target Table */}
              <div className="form-group">
                <label className="form-label" style={{ fontSize: 10 }}>1. Pilih Target Data / Tabel</label>
                <select 
                  className="form-input form-select" 
                  value={importType} 
                  onChange={(e) => {
                    setImportType(e.target.value);
                    setImportText('');
                  }}
                >
                  <option value="sparepart">📦 Master Sparepart (Barang & Harga)</option>
                  <option value="mesin">🏭 Master Mesin (Daftar Unit)</option>
                  <option value="bom">🔗 Pemetaan BOM (Sparepart per Mesin)</option>
                  <option value="stock">📊 Laporan / Sinkronisasi Stok (Qty Saat Ini)</option>
                </select>
              </div>

              {/* Dynamic Guidelines */}
              {(() => {
                const guide = getImportGuidelines();
                return (
                  <div className={`alert ${guide.alertClass}`} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div><strong>Format Kolom yang Diterima:</strong></div>
                    <code style={{ background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 4, display: 'inline-block', fontSize: 12, wordBreak: 'break-all' }}>
                      {guide.cols}
                    </code>
                    {importType === 'stock' && (
                      <div style={{ marginTop: 6, fontSize: 11 }}>
                        *MTC Sparepart ID wajib sudah terdaftar terlebih dahulu di Master Data.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Method Tabs */}
              <div className="stock-view-toggle" style={{ background: 'var(--sf3)', padding: 3, borderRadius: 8 }}>
                <button 
                  type="button" 
                  className={`stock-view-toggle__btn ${importMethod === 'excel' ? 'stock-view-toggle__btn--active' : ''}`}
                  style={{ flex: 1, padding: '8px 12px' }}
                  onClick={() => { setImportMethod('excel'); setImportText(''); }}
                >
                  📋 Paste dari Excel
                </button>
                <button 
                  type="button" 
                  className={`stock-view-toggle__btn ${importMethod === 'csv' ? 'stock-view-toggle__btn--active' : ''}`}
                  style={{ flex: 1, padding: '8px 12px' }}
                  onClick={() => { setImportMethod('csv'); setImportText(''); }}
                >
                  📁 Upload File (CSV)
                </button>
              </div>

              {/* Specific Options for Stock */}
              {importType === 'stock' && (
                <div style={{ background: 'var(--sf2)', padding: 12, borderRadius: 8, border: '1px solid var(--br)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    <input 
                      type="checkbox" 
                      checked={stockImportSync} 
                      onChange={(e) => setStockImportSync(e.target.checked)} 
                    />
                    Update stok yang sudah ada (Mode Sync)
                  </label>
                  <p style={{ color: 'var(--tx3)', fontSize: 11, marginTop: 4, marginLeft: 22 }}>
                    {stockImportSync 
                      ? 'Menimpa Qty lama dengan Qty baru di file CSV/Excel.' 
                      : 'Hanya mengisi Qty awal untuk barang yang stoknya masih 0.'}
                  </p>
                </div>
              )}

              {/* Inputs based on Method */}
              {importMethod === 'excel' ? (
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 10 }}>2. Paste Data dari Excel di bawah</label>
                  <textarea
                    className="form-input"
                    rows={8}
                    style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre', overflowX: 'auto' }}
                    placeholder={getImportGuidelines().placeholderExcel}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                  />
                  <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
                    *Salin tabel di Excel (termasuk baris Header), lalu paste (Ctrl+V) di kotak atas.
                  </p>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 10 }}>2. Pilih File CSV</label>
                  <input
                    type="file"
                    accept=".csv,.txt,text/csv"
                    className="form-input"
                    onChange={handleImportFilePick}
                  />
                  <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
                    *Pilih file berformat `.csv` yang berisi kolom-kolom di atas.
                  </p>
                  {importText && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--sf2)', borderRadius: 6, fontSize: 12, color: 'var(--tx2)' }}>
                      ✅ {importText.trim().split('\n').length - 1} baris data terdeteksi di dalam file CSV.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--br)', display: 'flex', gap: 10 }}>
              <button 
                type="button" 
                className="btn btn-ghost" 
                onClick={() => { setUnifiedImportOpen(false); setImportText(''); }} 
                disabled={isImporting}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Batal
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleUnifiedImportSubmit} 
                disabled={isImporting || !importText.trim()}
                style={{ flex: 2, justifyContent: 'center' }}
              >
                {isImporting ? '⏳ Sedang Memproses...' : '📥 Mulai Import Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .master-filters {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        @media (max-width: 1024px) {
          .master-header-row {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
          }
          .master-filters {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }
          .master-filters > div {
            width: 100% !important;
          }
          .master-filters select {
            width: 100% !important;
            min-width: 0 !important;
          }
        }
        @media (max-width: 480px) {
          .master-filters {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}
