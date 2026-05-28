'use client';
import { useState, useEffect, FormEvent } from 'react';

type MasterData = {
  mesins: any[];
  teknisis: any[];
  kategoris: any[];
  spareparts: any[];
};

export default function ReportPage() {
  const [master, setMaster] = useState<MasterData>({ mesins: [], teknisis: [], kategoris: [], spareparts: [] });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Modal Sparepart
  const [spModalOpen, setSpModalOpen] = useState(false);
  const [spSearch, setSpSearch] = useState('');

  // Form State
  const [form, setForm] = useState({
    tipe: 'CM',
    tanggal: new Date().toISOString().split('T')[0],
    start: '',
    finish: '',
    shift: '',
    mesinId: '',
    keluhan: '',
    issue: '',
    action: '',
    kategoriId: '',
    picId: '',
    spareparts: [] as { sparepartId: string; qty: number; nama: string; stok: number; uom: string }[]
  });

  useEffect(() => {
    async function loadMaster() {
      try {
        const [resM, resT, resK, resS] = await Promise.all([
          fetch('/api/mtc/master/mesin').then(r => r.json()),
          fetch('/api/mtc/master/teknisi').then(r => r.json()),
          fetch('/api/mtc/master/kategori').then(r => r.json()),
          fetch('/api/mtc/stock').then(r => r.json()) // Ambil stok untuk pilihan sparepart
        ]);
        
        setMaster({
          mesins: resM.success ? resM.data : [],
          teknisis: resT.success ? resT.data : [],
          kategoris: resK.success ? resK.data : [],
          spareparts: resS.success ? resS.data : []
        });
      } catch (err) {
        console.error('Gagal load master data', err);
      } finally {
        setLoading(false);
      }
    }
    loadMaster();
  }, []);

  // Filter sparepart list for modal
  const filteredSP = master.spareparts.filter(sp => {
    if (!spSearch) return true;
    const q = spSearch.toLowerCase();
    return sp.nama.toLowerCase().includes(q) || sp.id.toLowerCase().includes(q) || (sp.lokasi || '').toLowerCase().includes(q);
  });

  const addSparepart = (sp: any) => {
    if (form.spareparts.find(s => s.sparepartId === sp.id)) {
      alert('Barang ini sudah ada di daftar.');
      return;
    }
    if (sp.currentStock <= 0) {
      alert('Stok barang ini kosong (0). Tidak bisa ditambahkan.');
      return;
    }
    setForm(prev => ({
      ...prev,
      spareparts: [...prev.spareparts, { sparepartId: sp.id, qty: 1, nama: sp.nama, stok: sp.currentStock, uom: sp.uom }]
    }));
    setSpModalOpen(false);
    setSpSearch('');
  };

  const removeSparepart = (id: string) => {
    setForm(prev => ({
      ...prev,
      spareparts: prev.spareparts.filter(s => s.sparepartId !== id)
    }));
  };

  const updateSPQty = (id: string, delta: number) => {
    setForm(prev => ({
      ...prev,
      spareparts: prev.spareparts.map(s => {
        if (s.sparepartId === id) {
          const newQty = s.qty + delta;
          if (newQty < 1) return s; // Minimal 1
          if (newQty > s.stok) {
            alert(`Stok tidak cukup! Maksimal ${s.stok} ${s.uom}`);
            return s;
          }
          return { ...s, qty: newQty };
        }
        return s;
      })
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const payload = {
      tipe: form.tipe,
      tanggal: form.tanggal,
      start: form.start,
      finish: form.finish,
      shift: form.shift ? parseInt(form.shift) : null,
      mesinId: parseInt(form.mesinId),
      keluhan: form.keluhan,
      issue: form.issue,
      action: form.action,
      kategoriId: form.kategoriId ? parseInt(form.kategoriId) : null,
      picId: parseInt(form.picId),
      spareparts: form.spareparts.map(s => ({
        sparepartId: s.sparepartId,
        qty: s.qty
      }))
    };

    try {
      const res = await fetch('/api/mtc/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();

      if (json.success) {
        setMessage({ type: 'success', text: `✅ Report berhasil disubmit! No Report: ${json.data.noReport}` });
        // Reset form
        setForm({
          tipe: 'CM',
          tanggal: new Date().toISOString().split('T')[0],
          start: '', finish: '', shift: '', mesinId: '', keluhan: '', issue: '', action: '', kategoriId: '', picId: '', spareparts: []
        });
        // Refresh master stock softly
        fetch('/api/mtc/stock').then(r => r.json()).then(resS => {
           if(resS.success) setMaster(prev => ({...prev, spareparts: resS.data}));
        });
        window.scrollTo(0,0);
      } else {
        setMessage({ type: 'error', text: `❌ Gagal: ${json.error}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Terjadi kesalahan sistem.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Memuat data master...</div>;
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">📝 Input Maintenance Report</div>
        <div className="page-sub">Isi form perbaikan dan catat pemakaian sparepart</div>
      </div>

      <div className="page-body">
        {message && (
          <div className={`alert ${message.type === 'success' ? 'alert-grn' : 'alert-red'}`} style={{ marginBottom: 20 }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
          <div className="card-header">
            <div className="card-title">Data Pekerjaan</div>
          </div>
          <div className="card-body form-grid">
            
            {/* ROW 1: Tipe, Tanggal, Shift */}
            <div className="form-grid-3">
              <div className="form-group">
                <label className="form-label">Tipe MTC <span className="req">*</span></label>
                <select className="form-input form-select" required value={form.tipe} onChange={e => setForm({...form, tipe: e.target.value})}>
                  <option value="CM">Corrective (CM)</option>
                  <option value="PM">Preventive (PM)</option>
                  <option value="OH">Overhaul (OH)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tanggal <span className="req">*</span></label>
                <input type="date" className="form-input" required value={form.tanggal} onChange={e => setForm({...form, tanggal: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Shift</label>
                <select className="form-input form-select" value={form.shift} onChange={e => setForm({...form, shift: e.target.value})}>
                  <option value="">Pilih Shift</option>
                  <option value="1">Shift 1</option>
                  <option value="2">Shift 2</option>
                  <option value="3">Shift 3</option>
                </select>
              </div>
            </div>

            {/* ROW 2: Waktu & PIC */}
            <div className="form-grid-3">
              <div className="form-group">
                <label className="form-label">Mulai <span className="req">*</span></label>
                <input type="time" className="form-input" required value={form.start} onChange={e => setForm({...form, start: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Selesai <span className="req">*</span></label>
                <input type="time" className="form-input" required value={form.finish} onChange={e => setForm({...form, finish: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">PIC / Teknisi <span className="req">*</span></label>
                <select className="form-input form-select" required value={form.picId} onChange={e => setForm({...form, picId: e.target.value})}>
                  <option value="">Pilih Teknisi...</option>
                  {master.teknisis.map(t => (
                    <option key={t.id} value={t.id}>{t.nama}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divider" />

            {/* ROW 3: Mesin & Kategori */}
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Mesin / Area <span className="req">*</span></label>
                <select className="form-input form-select" required value={form.mesinId} onChange={e => setForm({...form, mesinId: e.target.value})}>
                  <option value="">Pilih Mesin...</option>
                  {master.mesins.map(m => (
                    <option key={m.id} value={m.id}>{m.nama} {m.area ? `(${m.area})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Kategori Kerusakan</label>
                <select className="form-input form-select" value={form.kategoriId} onChange={e => setForm({...form, kategoriId: e.target.value})}>
                  <option value="">Pilih Kategori...</option>
                  {master.kategoris.filter(k => k.tipe === 'maintenance' || k.tipe === 'umum').map(k => (
                    <option key={k.id} value={k.id}>{k.nama}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ROW 4: Teks Area */}
            <div className="form-group">
              <label className="form-label">Keluhan <span className="req">*</span></label>
              <textarea className="form-input" rows={2} required placeholder="Laporan kerusakan / keluhan..." value={form.keluhan} onChange={e => setForm({...form, keluhan: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Issue / Akar Masalah <span className="req">*</span></label>
              <textarea className="form-input" rows={2} required placeholder="Penyebab kerusakan..." value={form.issue} onChange={e => setForm({...form, issue: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Action Taken <span className="req">*</span></label>
              <textarea className="form-input" rows={3} required placeholder="Tindakan perbaikan yang dilakukan..." value={form.action} onChange={e => setForm({...form, action: e.target.value})} />
            </div>

            <div className="divider" />

            {/* SPAREPART SECTION */}
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <label className="form-label" style={{ margin: 0 }}>Penggunaan Sparepart</label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSpModalOpen(true)}>
                + Tambah Barang
              </button>
            </div>

            {form.spareparts.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', background: 'var(--sf2)', borderRadius: 8, border: '1px dashed var(--brh)', color: 'var(--tx3)', fontSize: 13 }}>
                Tidak ada pemakaian sparepart.<br />
                Klik &quot;Tambah Barang&quot; jika ada.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {form.spareparts.map(sp => (
                  <div key={sp.sparepartId} className="sp-item">
                    <div className="sp-info">
                      <div className="sp-name">{sp.nama}</div>
                      <div className="sp-sub">
                        ID: <span className="text-mono">{sp.sparepartId}</span> · Stok: <strong style={{ color: 'var(--grn)' }}>{sp.stok}</strong> {sp.uom}
                      </div>
                    </div>
                    <div className="qty-ctrl">
                      <button type="button" className="qty-btn" onClick={() => updateSPQty(sp.sparepartId, -1)}>−</button>
                      <input type="text" className="qty-val" value={sp.qty} readOnly />
                      <button type="button" className="qty-btn" onClick={() => updateSPQty(sp.sparepartId, 1)}>+</button>
                    </div>
                    <button type="button" className="sp-del" onClick={() => removeSparepart(sp.sparepartId)} title="Hapus">×</button>
                  </div>
                ))}
              </div>
            )}

          </div>

          <div className="card-footer" style={{ padding: '20px', borderTop: '1px solid var(--br)', background: 'var(--sf2)', borderBottomLeftRadius: 13, borderBottomRightRadius: 13 }}>
            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
              {submitting ? 'Menyimpan...' : 'Submit Report'}
            </button>
          </div>
        </form>

      </div>

      {/* MODAL PENCARIAN SPAREPART */}
      {spModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSpModalOpen(false); }}>
          <div className="modal-box" style={{ height: '80vh', maxWidth: 600 }}>
            <div className="modal-header">
              <div className="modal-title">Pilih Sparepart</div>
              <button onClick={() => setSpModalOpen(false)} style={{ background:'none', border:'none', color:'var(--tx2)', fontSize: 20 }}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div style={{ padding: 16, borderBottom: '1px solid var(--br)' }}>
                <div className="search-bar">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="Cari nama barang atau SLOC..." 
                    value={spSearch} 
                    onChange={e => setSpSearch(e.target.value)} 
                  />
                </div>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {filteredSP.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx3)' }}>Tidak ditemukan</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {filteredSP.map(sp => (
                        <tr key={sp.id} onClick={() => addSparepart(sp)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--br)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 600 }}>{sp.nama}</div>
                            <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
                              {sp.id} · Lokasi: {sp.lokasi || '-'}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: sp.currentStock > 0 ? 'var(--grn)' : 'var(--red)' }}>
                              {sp.currentStock}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{sp.uom}</div>
                          </td>
                          <td style={{ padding: '12px 16px', width: 40 }}>
                            <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }}>Pilih</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
