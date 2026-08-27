'use client';

import { useEffect, useState, FormEvent, ChangeEvent, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

type GaMovementClass = 'slow' | 'fast';

type GaItem = {
  id: string;
  nama: string;
  kodeBarang: string | null;
  lokasi: string;
  uom: string;
  harga: number;
  minQty: number;
  maxQty: number | null;
  kategoriId: number | null;
  kategori: string;
  currentStock: number;
  aktif: boolean;
  status: 'safe' | 'low' | 'habis' | 'overstock';
  qtyOut30d: number;
  movementClass: GaMovementClass;
  slowMovingThreshold: number;
};

type Filters = {
  search: string;
  status: string;
  kategoriId: string;
  lokasi: string;
  aktif: string;
  movementClass: string;
};

const defaultFilters: Filters = {
  search: '',
  status: '',
  kategoriId: '',
  lokasi: '',
  aktif: 'true',
  movementClass: '',
};

function buildStockQuery(f: Filters): string {
  const p = new URLSearchParams();
  p.set('aktif', f.aktif || 'true');
  if (f.search.trim()) p.set('search', f.search.trim());
  if (f.status) p.set('status', f.status);
  if (f.kategoriId) p.set('kategoriId', f.kategoriId);
  if (f.lokasi) p.set('lokasi', f.lokasi);
  if (f.movementClass) p.set('movementClass', f.movementClass);
  const q = p.toString();
  return q ? `?${q}` : '';
}

function statusBadge(status: GaItem['status']) {
  if (status === 'habis') return <span className="badge badge-red">Habis</span>;
  if (status === 'low') return <span className="badge badge-ylw">Understock</span>;
  if (status === 'overstock') return <span className="badge badge-pur">Overstock</span>;
  return <span className="badge badge-grn">Aman</span>;
}

function movementClassBadge(movementClass: GaMovementClass) {
  if (movementClass === 'slow') return <span className="badge badge-ylw">Slow Moving</span>;
  return <span className="badge badge-blu">Fast Moving</span>;
}

type EditForm = {
  nama: string;
  kodeBarang: string;
  lokasi: string;
  uom: string;
  harga: string;
  minQty: string;
  maxQty: string;
  kategoriId: string;
  aktif: boolean;
};

const emptyForm: EditForm = {
  nama: '',
  kodeBarang: '',
  lokasi: '',
  uom: 'Pcs',
  harga: '',
  minQty: '0',
  maxQty: '',
  kategoriId: '',
  aktif: true,
};

export default function GaDatabasePage() {
  return (
    <Suspense fallback={<div className="ga-loading">Memuat data barang…</div>}>
      <GaDatabasePageInner />
    </Suspense>
  );
}

function GaDatabasePageInner() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<GaItem[]>([]);
  const [kategoris, setKategoris] = useState<{ id: number; nama: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(() => {
    const mc = searchParams.get('movementClass');
    return {
      ...defaultFilters,
      movementClass: mc === 'slow' || mc === 'fast' ? mc : '',
    };
  });
  const [lokasiOptions, setLokasiOptions] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editMeta, setEditMeta] = useState<{
    movementClass: GaMovementClass;
    qtyOut30d: number;
    slowMovingThreshold: number;
  } | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importMethod, setImportMethod] = useState<'excel' | 'csv'>('excel');
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ga/stock${buildStockQuery(filters)}`);
      const json = await res.json();
      if (json.success) setItems(json.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchItems();
  }, [filters]);

  useEffect(() => {
    Promise.all([
      fetch('/api/ga/kategori').then((r) => r.json()),
      fetch('/api/ga/database/facets').then((r) => r.json()),
    ]).then(([kJson, fJson]) => {
      if (kJson.success) setKategoris(kJson.data);
      if (fJson.success) setLokasiOptions(fJson.data.lokasi ?? []);
    });
  }, []);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setFilters(defaultFilters);
  }

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.status !== '' ||
    filters.kategoriId !== '' ||
    filters.lokasi !== '' ||
    filters.aktif !== 'true' ||
    filters.movementClass !== '';

  function openEdit(it: GaItem) {
    setEditId(it.id);
    setForm({
      nama: it.nama,
      kodeBarang: it.kodeBarang || '',
      lokasi: it.lokasi === '—' ? '' : it.lokasi,
      uom: it.uom || 'Pcs',
      harga: String(it.harga ?? 0),
      minQty: String(it.minQty ?? 0),
      maxQty: it.maxQty != null ? String(it.maxQty) : '',
      kategoriId: it.kategoriId != null ? String(it.kategoriId) : '',
      aktif: it.aktif !== false,
    });
    setEditMeta({
      movementClass: it.movementClass,
      qtyOut30d: it.qtyOut30d,
      slowMovingThreshold: it.slowMovingThreshold,
    });
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditId(null);
    setForm(emptyForm);
    setEditMeta(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ga/items/${encodeURIComponent(editId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: form.nama,
          kodeBarang: form.kodeBarang,
          lokasi: form.lokasi || null,
          uom: form.uom,
          harga: Number(form.harga) || 0,
          minQty: Number(form.minQty) || 0,
          maxQty: form.maxQty ? Number(form.maxQty) : null,
          kategoriId: form.kategoriId ? Number(form.kategoriId) : null,
          aktif: form.aktif,
        }),
      });
      const json = await res.json();
      if (json.success) {
        closeEdit();
        fetchItems();
      } else {
        alert('Error: ' + json.error);
      }
    } catch (err: unknown) {
      alert('Terjadi kesalahan: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(it: GaItem) {
    const yakin = confirm(
      `Hapus permanen "${it.nama}" (${it.id})?\n\n` +
        'Barang akan dihapus dari database, tapi riwayat transaksi (stock in/out) tetap tersimpan.\n' +
        'Tindakan ini tidak dapat dibatalkan.'
    );
    if (!yakin) return;
    setDeletingId(it.id);
    try {
      const res = await fetch(`/api/ga/items/${encodeURIComponent(it.id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        fetchItems();
      } else {
        alert('Gagal menghapus: ' + (json.error || 'Unknown'));
      }
    } catch (err: unknown) {
      alert('Terjadi kesalahan: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setDeletingId(null);
    }
  }

  function closeImport() {
    setImportOpen(false);
    setImportText('');
    setImportMethod('excel');
  }

  function handleImportFilePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result ?? ''));
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleImportSubmit() {
    if (!importText.trim()) return alert('Data masih kosong atau file belum dipilih');
    setIsImporting(true);
    try {
      const res = await fetch('/api/ga/items/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: importText }),
      });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        if (d.skippedRows?.length || d.failedRows?.length) {
          console.group('Detail import GA');
          if (d.skippedRows?.length) console.table(d.skippedRows);
          if (d.failedRows?.length) console.table(d.failedRows);
          console.groupEnd();
        }
        alert(d.message || 'Import data berhasil!');
        closeImport();
        fetchItems();
      } else {
        alert('Error: ' + json.error);
      }
    } catch (err: unknown) {
      alert('Terjadi kesalahan saat memproses import: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setIsImporting(false);
    }
  }

  const fmtRp = (n: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

  return (
    <>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <div className="page-title">Database Barang GA</div>
            <div className="page-sub">Kelola master barang — edit per item atau import Min/Max</div>
          </div>
          <div className="page-header-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(true)}>
              Import Excel
            </button>
            <a
              className="btn btn-ghost"
              href={`/ga/database/print${buildStockQuery(filters)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={loading || items.length === 0}
              onClick={(e) => {
                if (loading || items.length === 0) e.preventDefault();
              }}
              style={{
                pointerEvents: loading || items.length === 0 ? 'none' : 'auto',
                opacity: loading || items.length === 0 ? 0.5 : 1,
              }}
            >
              Cetak / PDF
            </a>
            <a
              className="btn btn-primary"
              href={`/api/ga/database/export${buildStockQuery(filters)}`}
              aria-disabled={loading || items.length === 0}
              onClick={(e) => {
                if (loading || items.length === 0) e.preventDefault();
              }}
              style={{
                pointerEvents: loading || items.length === 0 ? 'none' : 'auto',
                opacity: loading || items.length === 0 ? 0.5 : 1,
              }}
            >
              Download Excel
            </a>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
            <div className="ga-filter-bar">
              <div className="search-bar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Cari nama atau kode barang..."
                  value={filters.search}
                  onChange={(e) => setFilter('search', e.target.value)}
                />
              </div>
              <div className="ga-filter-field">
                <label className="form-label" htmlFor="filter-status">Status stok</label>
                <select id="filter-status" className="form-input form-select" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                  <option value="">Semua</option>
                  <option value="safe">Aman</option>
                  <option value="low">Understock</option>
                  <option value="overstock">Overstock</option>
                  <option value="habis">Habis</option>
                </select>
              </div>
              <div className="ga-filter-field">
                <label className="form-label" htmlFor="filter-kategori">Kategori</label>
                <select id="filter-kategori" className="form-input form-select" value={filters.kategoriId} onChange={(e) => setFilter('kategoriId', e.target.value)}>
                  <option value="">Semua</option>
                  {kategoris.map((k) => (<option key={k.id} value={k.id}>{k.nama}</option>))}
                </select>
              </div>
              <div className="ga-filter-field">
                <label className="form-label" htmlFor="filter-lokasi">Lokasi</label>
                <select id="filter-lokasi" className="form-input form-select" value={filters.lokasi} onChange={(e) => setFilter('lokasi', e.target.value)}>
                  <option value="">Semua</option>
                  {lokasiOptions.map((loc) => (<option key={loc} value={loc}>{loc}</option>))}
                </select>
              </div>
              <div className="ga-filter-field">
                <label className="form-label" htmlFor="filter-aktif">Status barang</label>
                <select id="filter-aktif" className="form-input form-select" value={filters.aktif} onChange={(e) => setFilter('aktif', e.target.value)}>
                  <option value="true">Aktif saja</option>
                  <option value="false">Nonaktif saja</option>
                  <option value="all">Semua</option>
                </select>
              </div>
              <div className="ga-filter-field">
                <label className="form-label" htmlFor="filter-movement">Pergerakan</label>
                <select id="filter-movement" className="form-input form-select" value={filters.movementClass} onChange={(e) => setFilter('movementClass', e.target.value)}>
                  <option value="">Semua</option>
                  <option value="fast">Fast Moving</option>
                  <option value="slow">Slow Moving</option>
                </select>
              </div>
              {hasActiveFilters && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>Reset filter</button>
              )}
            </div>
            <div className="ga-filter-meta">
              <span>{loading ? 'Memuat…' : `${items.length} barang ditampilkan`}</span>
            </div>
          </div>

          <div className="table-wrap">
            <table style={{ opacity: loading ? 0.5 : 1 }}>
              <thead>
                <tr>
                  <th>KODE</th>
                  <th>NAMA BARANG</th>
                  <th>LOKASI</th>
                  <th>Min</th>
                  <th>Max</th>
                  <th>Harga</th>
                  <th>Stok</th>
                  <th>Status</th>
                  <th>Pergerakan</th>
                  <th style={{ width: 140 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={10} className="text-muted text-center" style={{ padding: 24 }}>
                      {hasActiveFilters
                        ? 'Tidak ada barang yang cocok dengan filter.'
                        : 'Belum ada data. Tambah barang lewat Stock In.'}
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <strong>{it.kodeBarang || '—'}</strong>
                        <div className="text-tiny text-muted">{it.id}</div>
                      </td>
                      <td>{it.nama}</td>
                      <td>{it.lokasi}</td>
                      <td>{it.minQty}</td>
                      <td>{it.maxQty ?? '—'}</td>
                      <td>{fmtRp(it.harga)}</td>
                      <td>{it.currentStock}</td>
                      <td>{statusBadge(it.status)}</td>
                      <td>{movementClassBadge(it.movementClass)}</td>
                      <td>
                        <div className="ga-table-actions">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(it)}>
                            Edit
                          </button>
                          {it.currentStock === 0 && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--ga-red, #dc2626)' }}
                              onClick={() => handleDelete(it)}
                              disabled={deletingId !== null}
                            >
                              {deletingId === it.id ? 'Menghapus…' : 'Hapus'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editOpen && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && closeEdit()}>
          <div className="modal-box" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Edit Barang</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeEdit} aria-label="Tutup">
                ✕
              </button>
            </div>
            <form id="gaEditForm" onSubmit={handleSave}>
              <div className="modal-body">
                <div className="form-grid">
                  {editMeta && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        padding: '10px 12px',
                        borderRadius: 'var(--ga-rs)',
                        background: 'var(--ga-sf2)',
                        border: '1px solid var(--ga-br)',
                      }}
                    >
                      {movementClassBadge(editMeta.movementClass)}
                      <span className="text-muted text-tiny">
                        Keluar 30 hari: {editMeta.qtyOut30d} / batas {editMeta.slowMovingThreshold}
                      </span>
                    </div>
                  )}
                  <p className="ga-modal-form-section">Identitas barang</p>
                  <div
                    className="form-grid-2"
                    style={{ gridTemplateColumns: 'minmax(120px, 1fr) minmax(0, 2fr)' }}
                  >
                    <div className="form-group">
                      <label className="form-label">Kode Barang</label>
                      <input
                        className="form-input"
                        value={form.kodeBarang}
                        onChange={(e) => setForm({ ...form, kodeBarang: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Nama Barang</label>
                      <input
                        className="form-input"
                        value={form.nama}
                        onChange={(e) => setForm({ ...form, nama: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <p className="ga-modal-form-section">Lokasi & stok</p>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Lokasi</label>
                      <input
                        className="form-input"
                        value={form.lokasi}
                        onChange={(e) => setForm({ ...form, lokasi: e.target.value })}
                        placeholder="G2 ATAS"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Satuan (UOM)</label>
                      <input
                        className="form-input"
                        value={form.uom}
                        onChange={(e) => setForm({ ...form, uom: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Min Qty</label>
                      <input
                        type="number"
                        min={0}
                        className="form-input"
                        value={form.minQty}
                        onChange={(e) => setForm({ ...form, minQty: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Max Qty (opsional)</label>
                      <input
                        type="number"
                        min={0}
                        className="form-input"
                        value={form.maxQty}
                        onChange={(e) => setForm({ ...form, maxQty: e.target.value })}
                        placeholder="Kosongkan jika tidak dipakai"
                      />
                    </div>
                  </div>

                  <p className="ga-modal-form-section">Harga & klasifikasi</p>
                  <div className="form-group">
                    <label className="form-label">Harga (Rp)</label>
                    <input
                      type="number"
                      min={0}
                      className="form-input"
                      value={form.harga}
                      onChange={(e) => setForm({ ...form, harga: e.target.value })}
                    />
                  </div>
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label">Kategori</label>
                      <select
                        className="form-input form-select"
                        value={form.kategoriId}
                        onChange={(e) => setForm({ ...form, kategoriId: e.target.value })}
                      >
                        <option value="">— Tanpa kategori —</option>
                        {kategoris.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.nama}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select
                        className="form-input form-select"
                        value={form.aktif ? 'true' : 'false'}
                        onChange={(e) => setForm({ ...form, aktif: e.target.value === 'true' })}
                      >
                        <option value="true">Aktif</option>
                        <option value="false">Nonaktif (disembunyikan dari stok)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </form>
            <div className="modal-footer">
              <span className="ga-modal-footer-meta">ID sistem: {editId}</span>
              <button type="button" className="btn btn-ghost" onClick={closeEdit} disabled={saving}>
                Batal
              </button>
              <button type="submit" form="gaEditForm" className="btn btn-primary" disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !isImporting) closeImport(); }}>
          <div className="modal-box" style={{ maxWidth: 620, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Import Min / Max Stok</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeImport} disabled={isImporting} aria-label="Tutup">
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="alert alert-blu" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><strong>Format kolom yang diterima:</strong></div>
                <code style={{ background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: 4, display: 'inline-block', fontSize: 12, wordBreak: 'break-all' }}>
                  No, Kode, Nama Barang, Lokasi, Min, Max
                </code>
                <div style={{ fontSize: 11 }}>
                  Hanya mengupdate barang yang Kode-nya sudah terdaftar. Stok fisik tidak diubah. Kode yang tidak ketemu dilewati.
                </div>
              </div>

              <div className="stock-view-toggle" style={{ background: 'var(--ga-sf3, var(--sf3))', padding: 3, borderRadius: 8 }}>
                <button
                  type="button"
                  className={`stock-view-toggle__btn ${importMethod === 'excel' ? 'stock-view-toggle__btn--active' : ''}`}
                  style={{ flex: 1, padding: '8px 12px' }}
                  onClick={() => { setImportMethod('excel'); setImportText(''); }}
                >
                  Paste dari Excel
                </button>
                <button
                  type="button"
                  className={`stock-view-toggle__btn ${importMethod === 'csv' ? 'stock-view-toggle__btn--active' : ''}`}
                  style={{ flex: 1, padding: '8px 12px' }}
                  onClick={() => { setImportMethod('csv'); setImportText(''); }}
                >
                  Upload File (CSV)
                </button>
              </div>

              {importMethod === 'excel' ? (
                <div className="form-group">
                  <label className="form-label">Paste data dari Excel</label>
                  <textarea
                    className="form-input"
                    rows={8}
                    style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre', overflowX: 'auto' }}
                    placeholder={'No\tKode\tNama Barang\tLokasi\tMin\tMax\n1\tA0042\tAIR MINERAL\tG5\t480\t720'}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                  />
                  <p style={{ fontSize: 11, color: 'var(--ga-tx3)', marginTop: 4 }}>
                    Salin tabel di Excel (termasuk baris header), lalu paste (Ctrl+V) di kotak atas.
                  </p>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Pilih file CSV</label>
                  <input
                    type="file"
                    accept=".csv,.txt,text/csv"
                    className="form-input"
                    onChange={handleImportFilePick}
                  />
                  <p style={{ fontSize: 11, color: 'var(--ga-tx3)', marginTop: 4 }}>
                    File CSV dengan kolom No, Kode, Nama Barang, Lokasi, Min, Max.
                  </p>
                  {importText && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--ga-sf2)', borderRadius: 6, fontSize: 12, color: 'var(--ga-tx2)' }}>
                      {Math.max(0, importText.trim().split('\n').length - 1)} baris data terdeteksi.
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={closeImport} disabled={isImporting}>
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleImportSubmit}
                disabled={isImporting || !importText.trim()}
              >
                {isImporting ? 'Sedang memproses…' : 'Mulai Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
