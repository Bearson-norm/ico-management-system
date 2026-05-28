'use client';
import { useState, useEffect, FormEvent } from 'react';

const STOCK_INITIAL_SAMPLE = `NAMA BARANG\tKODE BARANG\tQty
LABEL NIIMBOT D11 UKURAN 12 X 22 MM \tA0001\t24
PLASTIK KLIP UKURAN 25X16 ISI 100PCS\tA0002\t10
LABEL TOM & JERRY BULAT NO. 113 WARNA BIRU (PACK)\tA0003\t5`;

export default function GaStockInPage() {
  const [items, setItems] = useState<any[]>([]);
  const [kategoris, setKategoris] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [base, setBase] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    purchaseType: '',
    vendor: '',
    picNama: '',
    keterangan: '',
  });
  const [existingRows, setExistingRows] = useState<{ itemId: string; qty: number; nama: string; harga: number }[]>([]);
  const [newForm, setNewForm] = useState({
    nama: '',
    kategoriId: '',
    lokasi: '',
    kodeBarang: '',
    harga: '',
    qty: '',
    minQty: '',
    maxQty: '',
    uom: 'Pcs',
  });
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMeta, setImportMeta] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    picNama: '',
    keterangan: 'Saldo awal',
  });

  useEffect(() => {
    (async () => {
      try {
        const [rK, rS] = await Promise.all([
          fetch('/api/ga/kategori').then((r) => r.json()),
          fetch('/api/ga/stock').then((r) => r.json()),
        ]);
        if (rK.success) setKategoris(rK.data);
        if (rS.success) setItems(rS.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = items.filter((it) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return it.nama.toLowerCase().includes(q) || it.id.toLowerCase().includes(q);
  });

  function addRow(it: any) {
    if (existingRows.find((x) => x.itemId === it.id)) return;
    setExistingRows((p) => [...p, { itemId: it.id, qty: 1, nama: it.nama, harga: it.harga || 0 }]);
    setModal(false);
    setSearch('');
  }

  async function handleImportInitial() {
    if (!importText.trim()) {
      alert('Data masih kosong');
      return;
    }
    if (!importMeta.picNama.trim()) {
      alert('PIC penerima wajib diisi');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/ga/stock/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: importText,
          tanggal: importMeta.tanggal,
          picNama: importMeta.picNama,
          keterangan: importMeta.keterangan,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        if (d.skippedRows?.length || d.failedRows?.length) {
          console.group('Detail import saldo awal GA');
          if (d.skippedRows?.length) console.table(d.skippedRows);
          if (d.failedRows?.length) console.table(d.failedRows);
          console.groupEnd();
        }
        alert(d.message || 'Import selesai');
        if ((d.failed ?? 0) === 0) {
          setImportOpen(false);
          setImportText('');
        }
        setMsg(d.message);
        const rS = await fetch('/api/ga/stock').then((r) => r.json());
        if (rS.success) setItems(rS.data);
      } else {
        alert('Error: ' + json.error);
      }
    } catch (e: unknown) {
      alert('Terjadi kesalahan: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setImporting(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    let payload: Record<string, unknown> = { ...base, jenis: tab };
    if (tab === 'existing') {
      if (!existingRows.length) {
        setSubmitting(false);
        return alert('Pilih minimal 1 barang');
      }
      payload.items = existingRows.map((r) => ({ itemId: r.itemId, qty: r.qty, harga: r.harga }));
    } else {
      payload = {
        ...payload,
        ...newForm,
        harga: Number(newForm.harga) || 0,
        qty: Number(newForm.qty) || 0,
        minQty: Number(newForm.minQty) || 0,
        maxQty: newForm.maxQty ? Number(newForm.maxQty) : null,
        kategoriId: newForm.kategoriId ? Number(newForm.kategoriId) : null,
      };
    }
    const res = await fetch('/api/ga/stock/in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSubmitting(false);
    if (json.success) {
      setMsg(json.data.msg);
      setExistingRows([]);
      setNewForm({
        nama: '',
        kategoriId: '',
        lokasi: '',
        kodeBarang: '',
        harga: '',
        qty: '',
        minQty: '',
        maxQty: '',
        uom: 'Pcs',
      });
      const rS = await fetch('/api/ga/stock').then((r) => r.json());
      if (rS.success) setItems(rS.data);
    } else {
      setMsg(json.error || 'Gagal');
    }
  }

  if (loading) return <div className="ga-loading">Memuat…</div>;

  return (
    <>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title">Stock In GA</div>
            <div className="page-sub">Restock barang terdaftar, barang baru, atau import saldo awal</div>
          </div>
          <div className="ga-page-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(true)}>
              Import Saldo Awal
            </button>
          </div>
        </div>
      </div>
      <div className="page-body">
        {msg && <div className="ga-alert-success">{msg}</div>}
        <div className="nav-wrap" style={{ marginBottom: 16 }} role="tablist" aria-label="Mode stock in">
          <button type="button" role="tab" aria-selected={tab === 'existing'} className={`ntab ${tab === 'existing' ? 'act-in' : ''}`} onClick={() => setTab('existing')}>
            Barang terdaftar
          </button>
          <button type="button" role="tab" aria-selected={tab === 'new'} className={`ntab ${tab === 'new' ? 'act-in' : ''}`} onClick={() => setTab('new')}>
            Barang baru
          </button>
        </div>
        <form onSubmit={onSubmit} className="card" style={{ padding: 0, maxWidth: 800, margin: '0 auto' }}>
          <div className="card-header">
            <div className="card-title">Informasi Penerimaan</div>
          </div>
          <div className="card-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">
                  Tanggal <span className="req">*</span>
                </label>
                <input type="date" className="form-input" value={base.tanggal} onChange={(e) => setBase({ ...base, tanggal: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">
                  PIC penerima <span className="req">*</span>
                </label>
                <input className="form-input" placeholder="Nama yang menerima barang" value={base.picNama} onChange={(e) => setBase({ ...base, picNama: e.target.value })} required />
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Jenis pembelian</label>
                <select className="form-input form-select" value={base.purchaseType} onChange={(e) => setBase({ ...base, purchaseType: e.target.value })}>
                  <option value="">Pilih…</option>
                  <option value="Cash">Cash (Kasbon)</option>
                  <option value="PO">Purchase Order (PO)</option>
                  <option value="Online">E-Commerce / Online</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Vendor / toko</label>
                <input className="form-input" placeholder="Nama toko…" value={base.vendor} onChange={(e) => setBase({ ...base, vendor: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Keterangan</label>
              <input className="form-input" placeholder="Catatan tambahan (opsional)" value={base.keterangan} onChange={(e) => setBase({ ...base, keterangan: e.target.value })} />
            </div>

            <div className="divider" style={{ margin: '20px 0' }} />

            {tab === 'existing' && (
              <>
                <div className="flex-between" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Daftar barang <span className="req">*</span>
                  </label>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal(true)}>
                    + Pilih barang
                  </button>
                </div>
                {existingRows.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', background: 'var(--ga-sf2)', borderRadius: 8, color: 'var(--ga-tx2)' }}>
                    Pilih barang yang masuk
                  </div>
                ) : (
                  <ul className="ga-item-list">
                    {existingRows.map((r) => (
                      <li key={r.itemId}>
                        <span>{r.nama}</span>
                        <label style={{ fontSize: 12, color: 'var(--ga-tx2)' }}>
                          Qty
                          <input
                            type="number"
                            value={r.qty}
                            min={1}
                            onChange={(e) =>
                              setExistingRows((rows) =>
                                rows.map((x) => (x.itemId === r.itemId ? { ...x, qty: Number(e.target.value) || 1 } : x))
                              )
                            }
                          />
                        </label>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExistingRows((rows) => rows.filter((x) => x.itemId !== r.itemId))}>
                          Hapus
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {tab === 'new' && (
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">
                    Nama <span className="req">*</span>
                  </label>
                  <input className="form-input" value={newForm.nama} onChange={(e) => setNewForm({ ...newForm, nama: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Kategori</label>
                  <select className="form-input form-select" value={newForm.kategoriId} onChange={(e) => setNewForm({ ...newForm, kategoriId: e.target.value })}>
                    <option value="">—</option>
                    {kategoris.map((k: any) => (
                      <option key={k.id} value={k.id}>
                        {k.nama}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">
                      Qty <span className="req">*</span>
                    </label>
                    <input className="form-input" type="number" value={newForm.qty} onChange={(e) => setNewForm({ ...newForm, qty: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">UOM</label>
                    <input className="form-input" value={newForm.uom} onChange={(e) => setNewForm({ ...newForm, uom: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Lokasi</label>
                  <input className="form-input" value={newForm.lokasi} onChange={(e) => setNewForm({ ...newForm, lokasi: e.target.value })} />
                </div>
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Harga</label>
                    <input className="form-input" type="number" value={newForm.harga} onChange={(e) => setNewForm({ ...newForm, harga: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Min qty</label>
                    <input className="form-input" type="number" value={newForm.minQty} onChange={(e) => setNewForm({ ...newForm, minQty: e.target.value })} />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="card-footer" style={{ padding: 16, borderTop: '1px solid var(--ga-br)' }}>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Menyimpan…' : 'Simpan stok masuk'}
            </button>
          </div>
        </form>
      </div>

      {modal && (
        <div className="modal-backdrop">
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">Pilih barang</div>
            </div>
            <div className="modal-body">
              <input className="form-input" placeholder="Cari…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div style={{ maxHeight: 320, overflow: 'auto', marginTop: 12 }}>
                {filtered.map((it) => (
                  <button key={it.id} type="button" className="btn btn-ghost" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }} onClick={() => addRow(it)}>
                    {it.nama} <span style={{ color: 'var(--ga-tx2)' }}>({it.id})</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setImportOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Import Saldo Awal</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportOpen(false)} aria-label="Tutup">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="alert alert-blu">
                <div style={{ flex: 1 }}>
                  <strong>Cara import</strong>
                  <ol style={{ marginLeft: 16, marginTop: 4 }}>
                    <li>Import master barang dulu lewat <strong>Database GA → Import Excel</strong>.</li>
                    <li>Copy data dari Excel (termasuk header: NAMA BARANG, KODE BARANG, Qty).</li>
                    <li>Isi tanggal dan PIC, lalu paste dan klik Import.</li>
                    <li>Barang yang sudah punya stok dilewati agar tidak dobel.</li>
                  </ol>
                </div>
              </div>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">
                    Tanggal <span className="req">*</span>
                  </label>
                  <input
                    type="date"
                    className="form-input"
                    value={importMeta.tanggal}
                    onChange={(e) => setImportMeta({ ...importMeta, tanggal: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    PIC penerima <span className="req">*</span>
                  </label>
                  <input
                    className="form-input"
                    placeholder="Nama yang menerima"
                    value={importMeta.picNama}
                    onChange={(e) => setImportMeta({ ...importMeta, picNama: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Keterangan</label>
                <input
                  className="form-input"
                  value={importMeta.keterangan}
                  onChange={(e) => setImportMeta({ ...importMeta, keterangan: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Paste data Excel</label>
                <textarea
                  className="form-input"
                  rows={12}
                  style={{ fontFamily: 'monospace', whiteSpace: 'pre', overflowX: 'auto' }}
                  placeholder={STOCK_INITIAL_SAMPLE}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(false)} disabled={importing}>
                Batal
              </button>
              <button type="button" className="btn btn-primary" onClick={handleImportInitial} disabled={importing}>
                {importing ? 'Memproses...' : 'Mulai Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
