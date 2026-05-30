'use client';
import { useState, useEffect, FormEvent } from 'react';

// ── Opsi Kebutuhan — disimpan di localStorage ─────────────────────────────────
const STORAGE_KEY = 'mtc_kebutuhan_options';

const DEFAULT_KEBUTUHAN = [
  { id: '1', label: '🔄 Rutin / Terus Menerus' },
  { id: '2', label: '⚡ Insidentil / Sekali Pakai' },
  { id: '3', label: '🚀 Project / Investasi' },
  { id: '4', label: '🚨 Emergency / Urgent' },
];

function loadKebutuhanOptions() {
  if (typeof window === 'undefined') return DEFAULT_KEBUTUHAN;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_KEBUTUHAN;
}

function saveKebutuhanOptions(opts: { id: string; label: string }[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(opts)); } catch {}
}

export default function StockInPage() {
  const [spareparts, setSpareparts] = useState<any[]>([]);
  const [kategoris, setKategoris] = useState<any[]>([]);
  const [mesins, setMesins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'existing' | 'new' | 'log'>('existing');

  // Modal
  const [spModalOpen, setSpModalOpen] = useState(false);
  const [spSearch, setSpSearch] = useState('');
  const [selectedMachineFilter, setSelectedMachineFilter] = useState<string>('');

  // Forms
  const [baseForm, setBaseForm] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    purchaseType: '',
    vendor: ''
  });

  const [existingItems, setExistingItems] = useState<{ sparepartId: string; qty: number; nama: string; harga: number; uom: string }[]>([]);
  
  const [newForm, setNewForm] = useState<any>({
    nama: '', kategoriId: '', lokasi: '', harga: '', qty: '', minQty: '', mesinId: ''
  });

  const [logForm, setLogForm] = useState({
    nama: '', harga: '', qty: '', kebutuhan: '', kebutuhanDetail: ''
  });

  // Kebutuhan Options — dinamis, disimpan di localStorage
  const [kebutuhanOptions, setKebutuhanOptions] = useState<{ id: string; label: string }[]>(DEFAULT_KEBUTUHAN);
  const [kebutuhanModalOpen, setKebutuhanModalOpen] = useState(false);
  const [newKebutuhanLabel, setNewKebutuhanLabel] = useState('');
  const [editingKebutuhan, setEditingKebutuhan] = useState<{ id: string; label: string } | null>(null);

  // Load opsi dari localStorage saat mount
  useEffect(() => {
    setKebutuhanOptions(loadKebutuhanOptions());
  }, []);

  function handleSaveKebutuhanOptions(opts: { id: string; label: string }[]) {
    setKebutuhanOptions(opts);
    saveKebutuhanOptions(opts);
  }

  function handleAddKebutuhan() {
    const label = newKebutuhanLabel.trim();
    if (!label) return;
    const newOpt = { id: Date.now().toString(), label };
    handleSaveKebutuhanOptions([...kebutuhanOptions, newOpt]);
    setNewKebutuhanLabel('');
  }

  function handleDeleteKebutuhan(id: string) {
    if (!confirm('Hapus opsi ini? Log lama yang sudah tercatat tidak akan berubah.')) return;
    handleSaveKebutuhanOptions(kebutuhanOptions.filter(o => o.id !== id));
    if (logForm.kebutuhan === kebutuhanOptions.find(o => o.id === id)?.label) {
      setLogForm(prev => ({ ...prev, kebutuhan: '' }));
    }
  }

  function handleMoveKebutuhan(id: string, dir: 'up' | 'down') {
    const idx = kebutuhanOptions.findIndex(o => o.id === id);
    if (idx < 0) return;
    const newOpts = [...kebutuhanOptions];
    if (dir === 'up' && idx > 0) {
      [newOpts[idx - 1], newOpts[idx]] = [newOpts[idx], newOpts[idx - 1]];
    } else if (dir === 'down' && idx < newOpts.length - 1) {
      [newOpts[idx], newOpts[idx + 1]] = [newOpts[idx + 1], newOpts[idx]];
    }
    handleSaveKebutuhanOptions(newOpts);
  }

  function handleSaveEditKebutuhan() {
    if (!editingKebutuhan || !editingKebutuhan.label.trim()) return;
    handleSaveKebutuhanOptions(
      kebutuhanOptions.map(o => o.id === editingKebutuhan.id ? editingKebutuhan : o)
    );
    setEditingKebutuhan(null);
  }

  useEffect(() => {
    async function loadData() {
      try {
        const [resK, resS, resM] = await Promise.all([
          fetch('/api/mtc/master/kategori').then(r => r.json()),
          fetch('/api/mtc/stock').then(r => r.json()),
          fetch('/api/mtc/master/mesin').then(r => r.json())
        ]);
        if (resK.success) setKategoris(resK.data.filter((k:any) => k.tipe === 'sparepart' || k.tipe === 'umum'));
        if (resS.success) setSpareparts(resS.data);
        if (resM.success) setMesins(resM.data);
      } finally { setLoading(false); }
    }
    loadData();
  }, []);

  // -- Modal logic --
  const filteredSP = spareparts.filter(sp => {
    // Filter berdasarkan mesin (BOM) jika dipilih
    if (selectedMachineFilter) {
      const hasMachine = sp.mesins?.some((m: any) => m.id === Number(selectedMachineFilter));
      if (!hasMachine) return false;
    }
    // Filter pencarian teks
    if (!spSearch) return true;
    const q = spSearch.toLowerCase();
    return sp.nama.toLowerCase().includes(q) || sp.id.toLowerCase().includes(q);
  });

  const addExisting = (sp: any) => {
    if (existingItems.find(s => s.sparepartId === sp.id)) return alert('Sudah ada');
    setExistingItems(p => [...p, { sparepartId: sp.id, qty: 1, nama: sp.nama, harga: sp.harga || 0, uom: sp.uom }]);
    setSpModalOpen(false); setSpSearch(''); setSelectedMachineFilter('');
  };

  // -- Submit --
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true); setMessage(null);

    let payload: any = { ...baseForm, jenis: activeTab };

    if (activeTab === 'existing') {
      if (!existingItems.length) { setSubmitting(false); return alert('Pilih minimal 1 barang'); }
      payload.items = existingItems;
    } else if (activeTab === 'new') {
      payload = { 
        ...payload, 
        ...newForm, 
        harga: Number(newForm.harga)||0, 
        qty: Number(newForm.qty)||0, 
        minQty: Number(newForm.minQty)||0, 
        kategoriId: newForm.kategoriId ? Number(newForm.kategoriId) : null,
        mesinIds: newForm.mesinId ? [newForm.mesinId] : []
      };
    } else if (activeTab === 'log') {
      if (!logForm.kebutuhan || !logForm.kebutuhanDetail) {
        setSubmitting(false);
        return alert('Tipe Kebutuhan dan Keterangan Penggunaan wajib diisi');
      }
      payload = { 
        ...payload, 
        nama: logForm.nama,
        harga: Number(logForm.harga)||0, 
        qty: Number(logForm.qty)||0,
        keterangan: `[${logForm.kebutuhan}] ${logForm.kebutuhanDetail}`
      };
    }

    try {
      const res = await fetch('/api/mtc/stock/in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: `✅ ${json.data.msg}` });
        // Reset
        setExistingItems([]);
        setNewForm({ nama: '', kategoriId: '', lokasi: '', harga: '', qty: '', minQty: '', mesinId: '' });
        setLogForm({ nama: '', harga: '', qty: '', kebutuhan: '', kebutuhanDetail: '' });
        // Refresh master
        fetch('/api/mtc/stock').then(r => r.json()).then(rs => { if(rs.success) setSpareparts(rs.data); });
        window.scrollTo(0,0);
      } else {
        setMessage({ type: 'error', text: `❌ ${json.error}` });
      }
    } finally { setSubmitting(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Memuat data...</div>;

  return (
    <>
      <div className="page-header">
        <div className="page-title">📥 Stock In</div>
        <div className="page-sub">Penambahan stok barang baru atau existing</div>
      </div>

      <div className="page-body">
        {message && <div className={`alert ${message.type === 'success' ? 'alert-grn' : 'alert-red'}`} style={{ marginBottom: 20 }}>{message.text}</div>}

        {/* Mode Stock In — tombol (bukan teks statis) */}
        <div
          className="nav-wrap nav-wrap--scroll"
          style={{ marginBottom: 20 }}
          role="tablist"
          aria-label="Mode stok masuk"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'existing'}
            className={`ntab ${activeTab === 'existing' ? 'act-in' : ''}`}
            onClick={() => setActiveTab('existing')}
          >
            📦 Restock Barang Terdaftar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'new'}
            className={`ntab ${activeTab === 'new' ? 'act-in' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            ✨ Daftar Barang Baru
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'log'}
            className={`ntab ${activeTab === 'log' ? 'act-rp' : ''}`}
            onClick={() => setActiveTab('log')}
          >
            📝 Catat Langsung Pakai (Non-Stok)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
          {/* BASE INFO (selalu tampil) */}
          <div className="card-header"><div className="card-title">Informasi Pembelian</div></div>
          <div className="card-body form-grid">
            <div className="form-grid-3">
              <div className="form-group">
                <label className="form-label">Tanggal <span className="req">*</span></label>
                <input type="date" className="form-input" required value={baseForm.tanggal} onChange={e => setBaseForm({...baseForm, tanggal: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Jenis Pembelian</label>
                <select className="form-input form-select" value={baseForm.purchaseType} onChange={e => setBaseForm({...baseForm, purchaseType: e.target.value})}>
                  <option value="">Pilih...</option>
                  <option value="Cash">Cash (Kasbon)</option>
                  <option value="PO">Purchase Order (PO)</option>
                  <option value="Online">E-Commerce / Online</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Vendor / Toko</label>
                <input type="text" className="form-input" placeholder="Nama toko..." value={baseForm.vendor} onChange={e => setBaseForm({...baseForm, vendor: e.target.value})} />
              </div>
            </div>

            <div className="divider" />

            {/* TAB 1: EXISTING */}
            {activeTab === 'existing' && (
              <>
                <div className="flex-between" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ margin: 0 }}>Daftar Barang (Restock) <span className="req">*</span></label>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSpModalOpen(true)}>+ Pilih Barang</button>
                </div>
                {existingItems.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', background: 'var(--sf2)', borderRadius: 8, color: 'var(--tx3)' }}>Pilih barang yang masuk</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {existingItems.map(sp => (
                      <div key={sp.sparepartId} className="sp-item">
                        <div className="sp-info">
                          <div className="sp-name">{sp.nama}</div>
                          <div className="sp-sub">{sp.sparepartId}</div>
                        </div>
                        <div className="form-group" style={{ width: 120, marginRight: 10 }}>
                          <label className="form-label" style={{ fontSize: 9 }}>Harga Satuan</label>
                          <input type="number" className="form-input" value={sp.harga} onChange={e => setExistingItems(p => p.map(x => x.sparepartId===sp.sparepartId ? {...x, harga: Number(e.target.value)} : x))} />
                        </div>
                        <div className="form-group" style={{ width: 80, marginRight: 10 }}>
                          <label className="form-label" style={{ fontSize: 9 }}>Masuk</label>
                          <input type="number" className="form-input" min="1" value={sp.qty} onChange={e => setExistingItems(p => p.map(x => x.sparepartId===sp.sparepartId ? {...x, qty: Number(e.target.value)} : x))} />
                        </div>
                        <button type="button" className="sp-del" onClick={() => setExistingItems(p => p.filter(x => x.sparepartId !== sp.sparepartId))}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* TAB 2: NEW */}
            {activeTab === 'new' && (
              <>
                <label className="form-label" style={{ marginBottom: 8, color: 'var(--pur)' }}>✨ Daftarkan Barang Baru ke Master Data</label>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Nama Barang <span className="req">*</span></label>
                    <input type="text" className="form-input" required value={newForm.nama} onChange={e => setNewForm({...newForm, nama: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Kategori</label>
                    <select className="form-input form-select" value={newForm.kategoriId} onChange={e => setNewForm({...newForm, kategoriId: e.target.value})}>
                      <option value="">Pilih...</option>
                      {kategoris.map(k => <option key={k.id} value={k.id}>{k.nama}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">SLOC (Rak-Kol-Lvl-Bin)</label>
                    <input type="text" className="form-input" placeholder="Misal: 1-A-1-1" value={newForm.lokasi} onChange={e => setNewForm({...newForm, lokasi: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Harga Satuan</label>
                    <input type="number" className="form-input" value={newForm.harga} onChange={e => setNewForm({...newForm, harga: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min Qty (Peringatan)</label>
                    <input type="number" className="form-input" value={newForm.minQty} onChange={e => setNewForm({...newForm, minQty: e.target.value})} />
                  </div>
                </div>
                <div className="form-group" style={{ width: 200 }}>
                  <label className="form-label">Jumlah Masuk (Stok Awal) <span className="req">*</span></label>
                  <input type="number" className="form-input" min="1" required value={newForm.qty} onChange={e => setNewForm({...newForm, qty: e.target.value})} />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1', marginTop: 8 }}>
                  <label className="form-label">Digunakan Pada Mesin (BOM)</label>
                  <select 
                    className="form-input form-select" 
                    value={newForm.mesinId} 
                    onChange={e => setNewForm({...newForm, mesinId: e.target.value})}
                  >
                    <option value="">— Bukan untuk Mesin Khusus / Umum (Dipakai Semua Mesin) —</option>
                    {mesins
                      .filter(m => m.tipe === 'sparepart' || m.tipe === 'keduanya')
                      .map(m => (
                        <option key={m.id} value={m.id.toString()}>{m.nama}</option>
                      ))}
                  </select>
                </div>
              </>
            )}

            {/* TAB 3: LOG ONLY */}
            {activeTab === 'log' && (
              <>
                <div className="alert alert-ylw" style={{ marginBottom: 12 }}>
                  📝 Mode ini <strong>TIDAK AKAN</strong> menambah stok di inventory. Hanya mencatat pembelian barang yang langsung habis dipakai (misal: Air Minum, Majun, dll).
                </div>
                <div className="form-grid-3">
                  <div className="form-group">
                    <label className="form-label">Nama Barang / Deskripsi <span className="req">*</span></label>
                    <input type="text" className="form-input" required value={logForm.nama} onChange={e => setLogForm({...logForm, nama: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Jumlah / Qty <span className="req">*</span></label>
                    <input type="number" className="form-input" min="1" required value={logForm.qty} onChange={e => setLogForm({...logForm, qty: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Harga Total</label>
                    <input type="number" className="form-input" value={logForm.harga} onChange={e => setLogForm({...logForm, harga: e.target.value})} />
                  </div>
                </div>
                
                <div className="form-grid-2" style={{ marginTop: 16 }}>
                  <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label className="form-label" style={{ margin: 0 }}>Tipe Kebutuhan <span className="req">*</span></label>
                      <button
                        type="button"
                        title="Kelola opsi kebutuhan"
                        onClick={() => setKebutuhanModalOpen(true)}
                        style={{
                          background: 'var(--sf3)',
                          border: '1px solid var(--br)',
                          borderRadius: 6,
                          color: 'var(--tx3)',
                          padding: '2px 8px',
                          fontSize: 11,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'all .15s'
                        }}
                      >
                        ⚙️ Kelola
                      </button>
                    </div>
                    <div style={{ position: 'relative', width: '100%' }}>
                      <select 
                        className="form-input form-select" 
                        required 
                        value={logForm.kebutuhan} 
                        onChange={e => setLogForm({...logForm, kebutuhan: e.target.value})}
                        style={{ padding: '6px 36px 6px 14px', borderRadius: 8, background: 'var(--sf2)', color: 'var(--tx)', border: '1px solid var(--br)', fontSize: 13, height: '40px', outline: 'none', cursor: 'pointer', appearance: 'none', width: '100%', transition: 'all .15s' }}
                      >
                        <option value="">Pilih Kebutuhan...</option>
                        {kebutuhanOptions.map(opt => (
                          <option key={opt.id} value={opt.label}>{opt.label}</option>
                        ))}
                      </select>
                      <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--tx3)', fontSize: 10 }}>
                        ▼
                      </div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Keterangan Penggunaan <span className="req">*</span></label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      placeholder="Contoh: Digunakan untuk area Blister Line A..." 
                      value={logForm.kebutuhanDetail} 
                      onChange={e => setLogForm({...logForm, kebutuhanDetail: e.target.value})} 
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card-footer" style={{ padding: 20, borderTop: '1px solid var(--br)', background: 'var(--sf2)' }}>
            <button type="submit" className={`btn btn-lg ${activeTab === 'log' ? 'btn-ylw' : 'btn-grn'}`} disabled={submitting}>
              {submitting ? 'Menyimpan...' : activeTab === 'log' ? 'Catat ke Histori' : 'Simpan Stok Masuk'}
            </button>
          </div>
        </form>
      </div>

      {/* Modal */}
      {spModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSpModalOpen(false); }}>
          <div className="modal-box" style={{ height: '80vh', maxWidth: 600 }}>
            <div className="modal-header">
              <div className="modal-title">Pilih Barang untuk Restock</div>
              <button onClick={() => { setSpModalOpen(false); setSpSearch(''); setSelectedMachineFilter(''); }} style={{ background:'none', border:'none', color:'var(--tx2)', fontSize: 20 }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div style={{ padding: 16, borderBottom: '1px solid var(--br)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 10 }}>Filter Mesin (BOM)</label>
                  <select 
                    className="form-input form-select" 
                    value={selectedMachineFilter} 
                    onChange={e => setSelectedMachineFilter(e.target.value)}
                  >
                    <option value="">— Semua Mesin (Tampilkan Semua Sparepart) —</option>
                    {mesins
                      .filter(m => m.tipe === 'sparepart' || m.tipe === 'keduanya')
                      .map(m => (
                        <option key={m.id} value={m.id.toString()}>{m.nama}</option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 10 }}>Cari Sparepart</label>
                  <input type="text" className="form-input" autoFocus placeholder="Ketik nama atau ID sparepart..." value={spSearch} onChange={e => setSpSearch(e.target.value)} />
                </div>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {filteredSP.map(sp => (
                      <tr key={sp.id} onClick={() => { addExisting(sp); setSpSearch(''); setSelectedMachineFilter(''); }} style={{ cursor: 'pointer', borderBottom: '1px solid var(--br)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600 }}>{sp.nama}</div>
                          <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{sp.id} · {sp.lokasi}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Kelola Opsi Kebutuhan */}
      {kebutuhanModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setKebutuhanModalOpen(false); }}>
          <div className="modal-box" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">⚙️ Kelola Opsi Kebutuhan</div>
              <button onClick={() => setKebutuhanModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div className="modal-body" style={{ gap: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--tx3)', background: 'var(--sf2)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--br)' }}>
                ℹ️ Mengubah atau menghapus opsi <strong>tidak akan</strong> menghapus log yang sudah dicatat. Log lama tetap tersimpan dengan label aslinya.
              </div>

              {/* Daftar opsi */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {kebutuhanOptions.map((opt, idx) => (
                  <div key={opt.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'var(--sf2)',
                    border: '1px solid var(--br)',
                    borderRadius: 8,
                    padding: '8px 12px'
                  }}>
                    {/* Tombol urutan */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button
                        type="button"
                        onClick={() => handleMoveKebutuhan(opt.id, 'up')}
                        disabled={idx === 0}
                        style={{ background: 'none', border: 'none', color: idx === 0 ? 'var(--br)' : 'var(--tx3)', cursor: idx === 0 ? 'default' : 'pointer', fontSize: 10, lineHeight: 1, padding: 2 }}
                      >▲</button>
                      <button
                        type="button"
                        onClick={() => handleMoveKebutuhan(opt.id, 'down')}
                        disabled={idx === kebutuhanOptions.length - 1}
                        style={{ background: 'none', border: 'none', color: idx === kebutuhanOptions.length - 1 ? 'var(--br)' : 'var(--tx3)', cursor: idx === kebutuhanOptions.length - 1 ? 'default' : 'pointer', fontSize: 10, lineHeight: 1, padding: 2 }}
                      >▼</button>
                    </div>

                    {/* Label / Edit inline */}
                    {editingKebutuhan?.id === opt.id ? (
                      <input
                        type="text"
                        className="form-input"
                        autoFocus
                        value={editingKebutuhan.label}
                        onChange={e => setEditingKebutuhan({ ...editingKebutuhan, label: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEditKebutuhan(); if (e.key === 'Escape') setEditingKebutuhan(null); }}
                        style={{ flex: 1, height: 34, fontSize: 13 }}
                      />
                    ) : (
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{opt.label}</span>
                    )}

                    {/* Aksi */}
                    {editingKebutuhan?.id === opt.id ? (
                      <>
                        <button type="button" className="btn btn-grn btn-sm" onClick={handleSaveEditKebutuhan} style={{ padding: '4px 10px', fontSize: 11 }}>✓ Simpan</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingKebutuhan(null)} style={{ padding: '4px 10px', fontSize: 11 }}>Batal</button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingKebutuhan(opt)}
                          style={{ background: 'none', border: 'none', color: 'var(--pur)', fontSize: 13, cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
                          title="Edit opsi ini"
                        >✏️</button>
                        <button
                          type="button"
                          onClick={() => handleDeleteKebutuhan(opt.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 13, cursor: 'pointer', padding: '2px 6px', borderRadius: 4 }}
                          title="Hapus opsi ini"
                        >🗑️</button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Tambah opsi baru */}
              <div style={{ borderTop: '1px solid var(--br)', paddingTop: 14 }}>
                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Tambah Opsi Baru</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: 🏭 Produksi / Manufacturing"
                    value={newKebutuhanLabel}
                    onChange={e => setNewKebutuhanLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddKebutuhan(); } }}
                    style={{ flex: 1, height: 40 }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAddKebutuhan}
                    disabled={!newKebutuhanLabel.trim()}
                    style={{ height: 40, padding: '0 16px', whiteSpace: 'nowrap' }}
                  >
                    + Tambah
                  </button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 6 }}>
                  💡 Tips: Bisa pakai emoji di awal label, contoh: 🔧 Perbaikan Rutin
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { if (confirm('Reset ke opsi default? Opsi custom akan hilang.')) { handleSaveKebutuhanOptions(DEFAULT_KEBUTUHAN); } }}
                style={{ color: 'var(--red)', fontSize: 12 }}
              >
                🔄 Reset ke Default
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setKebutuhanModalOpen(false)}>Selesai</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media (max-width: 768px) {
          .form-grid-3, .form-grid-2 {
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }
      `}</style>
    </>
  );
}
