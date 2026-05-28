'use client';
import { useEffect, useState, FormEvent } from 'react';

const STOCK_OUT_SAMPLE = `NAMA BARANG\tQuantity\tTanggal Pemakaian\tNAMA
MASKER\t1\t22/05/2026\tFITA
TISSUE\t1\t22/05/2026\tFITA
HAIRNET DISPOSABLE\t1\t22/05/2026\tFITA`;

export default function GaStockOutPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    keterangan: '',
    rows: [] as { rowId: string; itemId: string; qty: number; nama: string; stok: number; picNama: string }[],
  });
  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importKeterangan, setImportKeterangan] = useState('');

  useEffect(() => {
    fetch('/api/ga/stock')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setItems(j.data);
        setLoading(false);
      });
  }, []);

  const filtered = items.filter((it) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return it.nama.toLowerCase().includes(q) || it.id.toLowerCase().includes(q);
  });

  function qtyAllocated(itemId: string, excludeRowId?: string) {
    return form.rows
      .filter((r) => r.itemId === itemId && r.rowId !== excludeRowId)
      .reduce((sum, r) => sum + r.qty, 0);
  }

  function remainingForItem(itemId: string, excludeRowId?: string) {
    const item = items.find((i) => i.id === itemId);
    const total = item?.currentStock ?? 0;
    return total - qtyAllocated(itemId, excludeRowId);
  }

  function pick(it: any) {
    const sisa = remainingForItem(it.id);
    if (sisa <= 0) return alert('Stok tidak cukup untuk barang ini');
    setForm((f) => ({
      ...f,
      rows: [
        ...f.rows,
        {
          rowId: crypto.randomUUID(),
          itemId: it.id,
          qty: 1,
          nama: it.nama,
          stok: it.currentStock,
          picNama: '',
        },
      ],
    }));
  }

  async function handleImportPaste() {
    if (!importText.trim()) {
      alert('Data masih kosong');
      return;
    }
    setImporting(true);
    setMsg(null);
    try {
      const res = await fetch('/api/ga/stock/out/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: importText, keterangan: importKeterangan }),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        if (d.skippedRows?.length || d.failedRows?.length) {
          console.group('Detail import stock out GA');
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
        const j = await fetch('/api/ga/stock').then((r) => r.json());
        if (j.success) setItems(j.data);
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
    if (!form.rows.length) return alert('Pilih barang');
    if (form.rows.some((r) => !r.picNama.trim())) return alert('Isi PIC/penerima untuk setiap barang');
    const over = form.rows.find((r) => r.qty > remainingForItem(r.itemId, r.rowId));
    if (over) return alert(`Total qty ${over.nama} melebihi stok tersedia`);
    setSubmitting(true);
    setMsg(null);
    const res = await fetch('/api/ga/stock/out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tanggal: form.tanggal,
        keterangan: form.keterangan,
        items: form.rows.map((r) => ({ itemId: r.itemId, qty: r.qty, picNama: r.picNama.trim() })),
      }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (json.success) {
      setMsg(`Berhasil: ${json.data.count} baris dicatat`);
      setForm({ tanggal: form.tanggal, keterangan: '', rows: [] });
      const j = await fetch('/api/ga/stock').then((r) => r.json());
      if (j.success) setItems(j.data);
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
            <div className="page-title">Stock Out GA</div>
            <div className="page-sub">Pengeluaran barang manual atau import paste dari Excel</div>
          </div>
          <div className="ga-page-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(true)}>
              Import Paste
            </button>
          </div>
        </div>
      </div>
      <div className="page-body">
        {msg && <div className="ga-alert-success">{msg}</div>}
        <form className="card ga-stock-out-form" onSubmit={onSubmit}>
          <div className="card-header">
            <div className="card-title">Informasi Pengeluaran</div>
          </div>
          <div className="card-body">
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">
                  Tanggal pakai <span className="req">*</span>
                </label>
                <input type="date" className="form-input" value={form.tanggal} onChange={(e) => setForm({ ...form, tanggal: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Keterangan / tujuan</label>
                <input className="form-input" placeholder="Keperluan penggunaan (opsional)" value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} />
              </div>
            </div>

            <div className="divider" style={{ margin: '20px 0' }} />

            <div className="flex-between ga-stock-out-lines-toolbar">
              <label className="form-label" style={{ margin: 0 }}>
                Daftar barang <span className="req">*</span>
              </label>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal(true)}>
                + Pilih barang
              </button>
            </div>
            {form.rows.length === 0 ? (
              <div className="ga-stock-out-empty">
                Pilih barang yang dikeluarkan
              </div>
            ) : (
              <div className="ga-stock-out-lines">
                <div className="ga-stock-out-lines-head" aria-hidden="true">
                  <span>Barang</span>
                  <span>Qty</span>
                  <span>PIC / Penerima</span>
                  <span />
                </div>
                <ul className="ga-stock-out-lines-body">
                  {form.rows.map((r) => {
                    const sisaBaris = remainingForItem(r.itemId, r.rowId);
                    return (
                    <li key={r.rowId}>
                      <div className="ga-stock-out-lines-name">
                        <strong>{r.nama}</strong>
                        <span className="ga-stock-out-lines-stock">
                          Sisa stok: {r.stok} · tersedia baris ini: {sisaBaris}
                        </span>
                      </div>
                      <div className="ga-stock-out-lines-field ga-stock-out-lines-qty">
                        <label className="ga-stock-out-lines-field-label">Qty</label>
                        <input
                          type="number"
                          min={1}
                          max={sisaBaris}
                          value={r.qty}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              rows: f.rows.map((x) =>
                                x.rowId === r.rowId
                                  ? { ...x, qty: Math.min(sisaBaris, Math.max(1, Number(e.target.value) || 1)) }
                                  : x
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="ga-stock-out-lines-field ga-stock-out-lines-pic">
                        <label className="ga-stock-out-lines-field-label">
                          PIC / Penerima <span className="req">*</span>
                        </label>
                        <input
                          placeholder="Nama penerima"
                          value={r.picNama}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              rows: f.rows.map((x) => (x.rowId === r.rowId ? { ...x, picNama: e.target.value } : x)),
                            }))
                          }
                          required
                        />
                      </div>
                      <div className="ga-stock-out-lines-action">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm((f) => ({ ...f, rows: f.rows.filter((x) => x.rowId !== r.rowId) }))}>
                          Hapus
                        </button>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
          <div className="card-footer" style={{ padding: 16, borderTop: '1px solid var(--ga-br)' }}>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Menyimpan…' : 'Simpan stok keluar'}
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
                {filtered.map((it) => {
                  const sisa = remainingForItem(it.id);
                  return (
                  <button
                    key={it.id}
                    type="button"
                    className="btn btn-ghost"
                    style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }}
                    onClick={() => pick(it)}
                    disabled={sisa <= 0}
                  >
                    {it.nama}{' '}
                    <span style={{ color: 'var(--ga-tx2)' }}>
                      (stok: {it.currentStock}{sisa < it.currentStock ? ` · tersedia: ${sisa}` : ''})
                    </span>
                  </button>
                  );
                })}
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
              <div className="modal-title">Import Stock Out (Paste Excel)</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportOpen(false)} aria-label="Tutup">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="alert alert-blu">
                <div style={{ flex: 1 }}>
                  <strong>Format data</strong>
                  <p style={{ marginTop: 4 }}>
                    Copy dari Excel dengan kolom: <strong>NAMA BARANG</strong>, <strong>Qty</strong>, <strong>Tanggal Pemakaian</strong> (DD/MM/YYYY), <strong>PIC</strong>.
                    Header opsional. Setiap baris punya tanggal dan PIC sendiri.
                  </p>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Keterangan (opsional, berlaku semua baris)</label>
                <input
                  className="form-input"
                  placeholder="Catatan tambahan"
                  value={importKeterangan}
                  onChange={(e) => setImportKeterangan(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Paste data Excel</label>
                <textarea
                  className="form-input"
                  rows={12}
                  style={{ fontFamily: 'monospace', whiteSpace: 'pre', overflowX: 'auto' }}
                  placeholder={STOCK_OUT_SAMPLE}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(false)} disabled={importing}>
                Batal
              </button>
              <button type="button" className="btn btn-primary" onClick={handleImportPaste} disabled={importing}>
                {importing ? 'Memproses…' : 'Mulai Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
