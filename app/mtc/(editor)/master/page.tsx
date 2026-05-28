'use client';
import React, { useState, useEffect } from 'react';

type TabType = 'sparepart' | 'mesin' | 'teknisi' | 'kategori' | 'bom';

export default function MasterPage() {
  const [activeTab, setActiveTab] = useState<TabType>('sparepart');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
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

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importType, setImportType] = useState('sparepart');
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const [stockImportOpen, setStockImportOpen] = useState(false);
  const [stockImportText, setStockImportText] = useState('');
  const [stockImportSync, setStockImportSync] = useState(false);
  const [isStockImporting, setIsStockImporting] = useState(false);

  // BOM State
  const [bomMesins, setBomMesins] = useState<any[]>([]);
  const [expandedMesinId, setExpandedMesinId] = useState<number | null>(null);
  const [bomImportOpen, setBomImportOpen] = useState(false);
  const [bomCsvText, setBomCsvText] = useState('');
  const [isBomImporting, setIsBomImporting] = useState(false);

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

  const handleStockImportSubmit = async () => {
    if (!stockImportText.trim()) return alert('Pilih file CSV atau paste data dulu');
    setIsStockImporting(true);

    try {
      const res = await fetch('/api/mtc/stock/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: stockImportText,
          syncMode: stockImportSync,
          keterangan: stockImportSync ? 'Stock report sync' : 'Saldo awal',
        }),
      });
      const json = await res.json();

      if (json.success) {
        const d = json.data;
        if (d.skippedRows?.length || d.failedRows?.length) {
          console.group('Detail import stok');
          if (d.skippedRows?.length) console.table(d.skippedRows);
          if (d.failedRows?.length) console.table(d.failedRows);
          console.groupEnd();
        }
        alert(d.message || 'Import stok selesai');
        if ((d.failed ?? 0) === 0) {
          setStockImportOpen(false);
          setStockImportText('');
        }
        fetchData();
      } else {
        alert('❌ Error: ' + json.error);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      alert('Terjadi kesalahan saat memproses data: ' + message);
    } finally {
      setIsStockImporting(false);
    }
  };

  const handleStockFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setStockImportText(String(reader.result ?? ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportSubmit = async () => {
    if (!importText.trim()) return alert('Data masih kosong');
    setIsImporting(true);

    try {
      const res = await fetch('/api/mtc/master/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: importType, rawText: importText }),
      });
      const json = await res.json();

      if (json.success) {
        const d = json.data;
        if (d.skippedRows?.length || d.failedRows?.length) {
          console.group('Detail import');
          if (d.skippedRows?.length) console.table(d.skippedRows);
          if (d.failedRows?.length) console.table(d.failedRows);
          console.groupEnd();
        }
        alert(d.message || 'Import selesai');
        if ((d.skipped ?? 0) === 0 && (d.failed ?? 0) === 0) {
          setImportModalOpen(false);
          setImportText('');
        }
        fetchData();
      } else {
        alert('❌ Error: ' + json.error);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      alert('Terjadi kesalahan saat memproses data: ' + message);
    } finally {
      setIsImporting(false);
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
            {activeTab === 'sparepart' && (
              <button type="button" className="btn btn-ghost" onClick={() => setStockImportOpen(true)}>
                📊 Import Stock
              </button>
            )}
            {activeTab === 'bom' && (
              <button type="button" className="btn btn-primary" onClick={() => setBomImportOpen(true)}>
                📥 Import CSV BOM
              </button>
            )}
            {activeTab !== 'bom' && (
              <button type="button" className="btn btn-ghost" onClick={() => setImportModalOpen(true)}>
                📥 Import Excel
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
          <div className="card-header">
            <div className="filter-row" style={{ marginBottom: 0, width: '100%' }}>
              <div className="search-bar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" placeholder="Cari data..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
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
                    {spareparts.map(s => (
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
                    ))}
                    {spareparts.length === 0 && !loading && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40 }}>Data tidak ditemukan</td></tr>}
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

      {stockImportOpen && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <div className="modal-title">📊 Import Stock Report</div>
            </div>
            <div className="modal-body">
              <div className="alert alert-grn" style={{ marginBottom: 16 }}>
                <strong>Cara paling gampang — 3 langkah:</strong>
                <ol style={{ marginLeft: 16, marginTop: 6, marginBottom: 0 }}>
                  <li>Pastikan Item ID sudah ada di tab Master Sparepart</li>
                  <li>Klik <strong>Pilih file CSV</strong> di bawah</li>
                  <li>Klik <strong>Import Stok</strong></li>
                </ol>
              </div>

              <div className="form-group">
                <label className="form-label">1. Pilih file CSV stock report</label>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv"
                  className="form-input"
                  onChange={handleStockFilePick}
                />
                <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
                  Format: <code>id, Current Stock</code> — sama persis file <em>DB WEB MTC - Stock Sparepart.csv</em>
                </p>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={stockImportSync}
                    onChange={(e) => setStockImportSync(e.target.checked)}
                  />
                  Update stok yang sudah ada (mode sync)
                </label>
                <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
                  {stockImportSync
                    ? 'Centang ini kalau stok sudah pernah diisi dan mau disamakan lagi dengan stock report terbaru.'
                    : 'Biarkan tidak dicentang untuk isi stok pertama kali (hanya barang yang stoknya masih 0).'}
                </p>
              </div>

              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--tx2)' }}>Alternatif: paste dari Excel</summary>
                <div className="form-group" style={{ marginTop: 10 }}>
                  <textarea
                    className="form-input"
                    rows={6}
                    style={{ fontFamily: 'monospace', whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto' }}
                    placeholder={`id\tCurrent Stock\nMTC-SP-001\t31`}
                    value={stockImportText}
                    onChange={(e) => setStockImportText(e.target.value)}
                  />
                </div>
              </details>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setStockImportOpen(false)} disabled={isStockImporting}>
                Batal
              </button>
              <button className="btn btn-primary" onClick={handleStockImportSubmit} disabled={isStockImporting || !stockImportText.trim()}>
                {isStockImporting ? '⏳ Memproses...' : 'Import Stok'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <div className="modal-title">📥 Import / Update Data Massal</div>
            </div>
            <div className="modal-body">
              <div className="alert alert-blu">
                <div style={{ flex: 1 }}>
                  <strong>Cara Import:</strong>
                  <ol style={{ marginLeft: 16, marginTop: 4 }}>
                    <li>Pilih tipe data yang ingin di-import.</li>
                    <li>Copy data dari file Excel (termasuk baris Header-nya).</li>
                    <li>Paste ke dalam kotak teks di bawah ini.</li>
                  </ol>
                  <p style={{ marginTop: 4, fontSize: 11, color: 'var(--tx3)' }}>
                    *Copy dari Excel (Ctrl+C), paste di sini (Ctrl+V). Jangan ketik manual. Header wajib ada kolom <strong>id</strong>.
                    Harga dengan koma (Rp6,500,000) aman — pemisah kolom harus <strong>tab</strong> dari Excel.
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Pilih Target Tabel</label>
                <select className="form-input form-select" value={importType} onChange={e => setImportType(e.target.value)}>
                  <option value="mesin">Mesin (nama, tipe, area) — tipe: Perbaikan / Sparepart / Keduanya</option>
                  <option value="sparepart">Sparepart (id / Item ID, nama, kategori, uom, lokasi, harga, minQty, lead time)</option>
                  <option value="bom">Pemetaan BOM (Kolom: sparepartId, mesinNama)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Paste Data Excel Di Sini</label>
                <textarea
                  className="form-input"
                  rows={10}
                  style={{ fontFamily: 'monospace', whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto' }}
                  placeholder={`Contoh Header untuk Mesin:\nnama\ttipe\tarea\nMesin CNC 01\tperbaikan\tWorkshop A`}
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setImportModalOpen(false)} disabled={isImporting}>
                Batal
              </button>
              <button className="btn btn-primary" onClick={handleImportSubmit} disabled={isImporting}>
                {isImporting ? '⏳ Memproses...' : 'Mulai Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORT BOM CSV */}
      {bomImportOpen && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <div className="modal-title">🔗 Import BOM — Sparepart per Mesin</div>
            </div>
            <div className="modal-body">
              <div className="alert alert-blu" style={{ marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <strong>Format CSV yang didukung:</strong>
                  <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 12, background: 'var(--bg)', padding: '8px 12px', borderRadius: 6 }}>
                    Nama Mesin,Item ID<br/>
                    Mesin Lanyard Device,MTC-SP-077<br/>
                    Mesin Cellophane Device,MTC-SP-068
                  </div>
                  <p style={{ marginTop: 8, fontSize: 11, color: 'var(--tx3)' }}>
                    Baris dengan kolom kosong akan otomatis dilewati. Mesin akan dibuat otomatis jika belum ada.
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Pilih File CSV</label>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv"
                  className="form-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setBomCsvText(String(reader.result ?? ''));
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                />
                <p style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
                  File: <em>DB WEB MTC - DB Sparepart-Mesin.csv</em> atau format serupa
                </p>
              </div>

              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--tx2)' }}>Alternatif: paste teks CSV langsung</summary>
                <div className="form-group" style={{ marginTop: 10 }}>
                  <textarea
                    className="form-input"
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                    placeholder={'Nama Mesin,Item ID\nMesin Press 100T,MTC-SP-001'}
                    value={bomCsvText}
                    onChange={(e) => setBomCsvText(e.target.value)}
                  />
                </div>
              </details>

              {bomCsvText && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--sf2)', borderRadius: 6, fontSize: 12, color: 'var(--tx2)' }}>
                  ✅ {bomCsvText.trim().split('\n').length - 1} baris data siap diimport
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setBomImportOpen(false); setBomCsvText(''); }} disabled={isBomImporting}>
                Batal
              </button>
              <button
                className="btn btn-primary"
                disabled={isBomImporting || !bomCsvText.trim()}
                onClick={async () => {
                  if (!bomCsvText.trim()) return;
                  setIsBomImporting(true);
                  try {
                    const res = await fetch('/api/mtc/master/import', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'bom', rawText: bomCsvText }),
                    });
                    const json = await res.json();
                    if (json.success) {
                      alert(json.data.message || '✅ Import BOM selesai!');
                      setBomImportOpen(false);
                      setBomCsvText('');
                      // Refresh BOM data
                      const r2 = await fetch('/api/mtc/master/mesin?include=spareparts');
                      const j2 = await r2.json();
                      if (j2.success) setBomMesins(j2.data);
                    } else {
                      alert('❌ Error: ' + json.error);
                    }
                  } catch (e: unknown) {
                    alert('Terjadi kesalahan: ' + (e instanceof Error ? e.message : 'Unknown error'));
                  } finally {
                    setIsBomImporting(false);
                  }
                }}
              >
                {isBomImporting ? '⏳ Mengimport...' : '🔗 Import BOM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
