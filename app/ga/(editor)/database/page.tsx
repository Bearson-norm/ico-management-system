'use client';

import { useEffect, useState, FormEvent } from 'react';

const IMPORT_SAMPLE = `NAMA BARANG\tMin Qty\tLOKASI\tKODE BARANG\tHarga
LABEL NIIMBOT D11 UKURAN 12 X 22 MM \t24\tG2 ATAS\tA0001\tRp98,901
PLASTIK KLIP UKURAN 25X16 ISI 100PCS\t2\tG2 ATAS\tA0002\tRp44,289`;

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
  status: 'safe' | 'low' | 'habis';
};

type Filters = {
  search: string;
  status: string;
  kategoriId: string;
  lokasi: string;
  aktif: string;
};

const defaultFilters: Filters = {
  search: '',
  status: '',
  kategoriId: '',
  lokasi: '',
  aktif: 'true',
};

function buildStockQuery(f: Filters): string {
  const p = new URLSearchParams();
  p.set('aktif', f.aktif || 'true');
  if (f.search.trim()) p.set('search', f.search.trim());
  if (f.status) p.set('status', f.status);
  if (f.kategoriId) p.set('kategoriId', f.kategoriId);
  if (f.lokasi) p.set('lokasi', f.lokasi);
  const q = p.toString();
  return q ? `?${q}` : '';
}

function statusBadge(status: GaItem['status']) {
  if (status === 'habis') return <span className="badge badge-red">Habis</span>;
  if (status === 'low') return <span className="badge badge-ylw">Understock</span>;
  return <span className="badge badge-grn">Aman</span>;
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
  const [items, setItems] = useState<GaItem[]>([]);
  const [kategoris, setKategoris] = useState<{ id: number; nama: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [lokasiOptions, setLokasiOptions] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [saving, setSaving] = useState(false);

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
    filters.aktif !== 'true';

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
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditId(null);
    setForm(emptyForm);
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

  async function handleImport() {
    if (!importText.trim()) {
      alert('Data masih kosong');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/ga/import', {
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
        alert(d.message || 'Import selesai');
        if ((d.skipped ?? 0) === 0 && (d.failed ?? 0) === 0) {
          setImportOpen(false);
          setImportText('');
        }
        fetchItems();
        fetch('/api/ga/database/facets')
          .then((r) => r.json())
          .then((fJson) => {
            if (fJson.success) setLokasiOptions(fJson.data.lokasi ?? []);
          });
      } else {
        alert('Error: ' + json.error);
      }
    } catch (e: unknown) {
      alert('Terjadi kesalahan: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setImporting(false);
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
            <div className="page-sub">Kelola master barang — import massal atau edit per item</div>
          </div>
          <div className="ga-page-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(true)}>
              Import Excel
            </button>
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
                  <th>Harga</th>
                  <th>Stok</th>
                  <th>Status</th>
                  <th style={{ width: 100 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={8} className="text-muted text-center" style={{ padding: 24 }}>
                      {hasActiveFilters
                        ? 'Tidak ada barang yang cocok dengan filter.'
                        : 'Belum ada data. Gunakan Import Excel atau tambah lewat Stock In.'}
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
                      <td>{fmtRp(it.harga)}</td>
                      <td>{it.currentStock}</td>
                      <td>{statusBadge(it.status)}</td>
                      <td>
                        <div className="ga-table-actions">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(it)}>
                            Edit
                          </button>
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
          <div className="modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Edit Barang</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeEdit} aria-label="Tutup">
                ✕
              </button>
            </div>
            <form id="gaEditForm" onSubmit={handleSave}>
              <div className="modal-body">
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
                    />
                  </div>
                </div>
                <div className="form-grid-2">
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
                <p className="form-hint">ID sistem: {editId}</p>
              </div>
            </form>
            <div className="modal-footer">
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
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setImportOpen(false)}>
          <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Import Database GA</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportOpen(false)} aria-label="Tutup">
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="alert alert-blu">
                <div style={{ flex: 1 }}>
                  <strong>Cara import</strong>
                  <ol style={{ marginLeft: 16, marginTop: 4 }}>
                    <li>Copy data dari Excel (termasuk baris header).</li>
                    <li>Paste ke kotak di bawah (Ctrl+V).</li>
                    <li>Kode yang sudah ada diperbarui; kode baru ditambahkan.</li>
                  </ol>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Paste data Excel</label>
                <textarea
                  className="form-input"
                  rows={12}
                  style={{ fontFamily: 'monospace', whiteSpace: 'pre', overflowX: 'auto' }}
                  placeholder={IMPORT_SAMPLE}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(false)} disabled={importing}>
                Batal
              </button>
              <button type="button" className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? 'Memproses...' : 'Mulai Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
