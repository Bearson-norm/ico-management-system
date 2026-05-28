'use client';
import { useState, useEffect, FormEvent } from 'react';

export default function StockInPage() {
  const [spareparts, setSpareparts] = useState<any[]>([]);
  const [kategoris, setKategoris] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<'existing' | 'new' | 'log'>('existing');

  // Modal
  const [spModalOpen, setSpModalOpen] = useState(false);
  const [spSearch, setSpSearch] = useState('');

  // Forms
  const [baseForm, setBaseForm] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    purchaseType: '',
    vendor: ''
  });

  const [existingItems, setExistingItems] = useState<{ sparepartId: string; qty: number; nama: string; harga: number; uom: string }[]>([]);
  
  const [newForm, setNewForm] = useState({
    nama: '', kategoriId: '', lokasi: '', harga: '', qty: '', minQty: ''
  });

  const [logForm, setLogForm] = useState({
    nama: '', harga: '', qty: ''
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [resK, resS] = await Promise.all([
          fetch('/api/mtc/master/kategori').then(r => r.json()),
          fetch('/api/mtc/stock').then(r => r.json())
        ]);
        if (resK.success) setKategoris(resK.data.filter((k:any) => k.tipe === 'sparepart' || k.tipe === 'umum'));
        if (resS.success) setSpareparts(resS.data);
      } finally { setLoading(false); }
    }
    loadData();
  }, []);

  // -- Modal logic --
  const filteredSP = spareparts.filter(sp => {
    if (!spSearch) return true;
    const q = spSearch.toLowerCase();
    return sp.nama.toLowerCase().includes(q) || sp.id.toLowerCase().includes(q);
  });

  const addExisting = (sp: any) => {
    if (existingItems.find(s => s.sparepartId === sp.id)) return alert('Sudah ada');
    setExistingItems(p => [...p, { sparepartId: sp.id, qty: 1, nama: sp.nama, harga: sp.harga || 0, uom: sp.uom }]);
    setSpModalOpen(false); setSpSearch('');
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
      payload = { ...payload, ...newForm, harga: Number(newForm.harga)||0, qty: Number(newForm.qty)||0, minQty: Number(newForm.minQty)||0, kategoriId: newForm.kategoriId ? Number(newForm.kategoriId) : null };
    } else if (activeTab === 'log') {
      payload = { ...payload, ...logForm, harga: Number(logForm.harga)||0, qty: Number(logForm.qty)||0 };
    }

    try {
      const res = await fetch('/api/mtc/stock/in', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: `✅ ${json.data.msg}` });
        // Reset
        setExistingItems([]);
        setNewForm({ nama: '', kategoriId: '', lokasi: '', harga: '', qty: '', minQty: '' });
        setLogForm({ nama: '', harga: '', qty: '' });
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
              <button onClick={() => setSpModalOpen(false)} style={{ background:'none', border:'none', color:'var(--tx2)', fontSize: 20 }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div style={{ padding: 16, borderBottom: '1px solid var(--br)' }}>
                <input type="text" className="form-input" autoFocus placeholder="Cari..." value={spSearch} onChange={e => setSpSearch(e.target.value)} />
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {filteredSP.map(sp => (
                      <tr key={sp.id} onClick={() => addExisting(sp)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--br)' }}>
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
    </>
  );
}
