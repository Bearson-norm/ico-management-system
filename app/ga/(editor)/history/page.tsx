'use client';
import { useEffect, useState } from 'react';

const PURCHASE_TYPES = ['Cash', 'PO', 'Online'];

function displayPurchase(r: { tipe: string; purchaseType?: string | null; keterangan?: string | null }) {
  if (r.tipe !== 'IN') return '—';
  if (r.purchaseType) return r.purchaseType;
  if (r.keterangan && PURCHASE_TYPES.includes(r.keterangan)) return r.keterangan;
  return '—';
}

function displayKeterangan(r: { tipe: string; purchaseType?: string | null; keterangan?: string | null }) {
  if (!r.keterangan) return '—';
  if (r.tipe === 'IN' && !r.purchaseType && PURCHASE_TYPES.includes(r.keterangan)) return '—';
  return r.keterangan;
}

export default function GaHistoryPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [tipe, setTipe] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    fetchData();
  }, [page, search, tipe, dateFrom, dateTo]);

  async function fetchData() {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), limit: '30' });
      if (search) q.set('search', search);
      if (tipe) q.set('tipe', tipe);
      if (dateFrom) q.set('dateFrom', dateFrom);
      if (dateTo) q.set('dateTo', dateTo);
      const res = await fetch('/api/ga/history?' + q.toString());
      const j = await res.json();
      if (j.success) {
        setRows(j.data.data);
        setTotal(j.data.total);
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading && rows.length === 0) return <div className="ga-loading">Memuat…</div>;

  return (
    <>
      <div className="page-header">
        <div className="page-title">Riwayat GA</div>
        <div className="page-sub">Audit trail stok masuk & keluar</div>
      </div>
      <div className="page-body">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header">
            <div className="filter-row" style={{ marginBottom: 0, width: '100%', flexWrap: 'wrap', gap: 8 }}>
              <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Cari barang, PIC, vendor…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <select
                className="form-input form-select"
                style={{ width: 120 }}
                value={tipe}
                onChange={(e) => {
                  setTipe(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua</option>
                <option value="IN">IN</option>
                <option value="OUT">OUT</option>
                <option value="ADJ">ADJ</option>
              </select>
              <input
                type="date"
                className="form-input"
                style={{ width: 140 }}
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
              />
              <span className="text-muted">ke</span>
              <input
                type="date"
                className="form-input"
                style={{ width: 140 }}
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div className="table-wrap">
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Waktu</th>
                  <th>Tipe</th>
                  <th>Barang</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th>PIC</th>
                  <th>Vendor</th>
                  <th>Jenis beli</th>
                  <th>Keterangan</th>
                </tr>
              </thead>
              <tbody style={{ opacity: loading ? 0.5 : 1 }}>
                {rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--ga-tx2)', padding: 24 }}>
                      Belum ada riwayat
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.tanggal).toLocaleDateString('id-ID')}</td>
                      <td className="text-muted text-tiny">
                        {new Date(r.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            r.tipe === 'IN' ? 'badge-grn' : r.tipe === 'ADJ' ? 'badge-blu' : 'badge-red'
                          }`}
                        >
                          {r.tipe}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {r.namaBarang || r.item?.nama || '—'}
                        {r.itemId && <div className="text-tiny text-muted">{r.itemId}</div>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {r.tipe === 'ADJ' && r.qty > 0 ? '+' : ''}
                        {r.qty}
                      </td>
                      <td>{r.picNama || '—'}</td>
                      <td>{r.tipe === 'IN' ? r.vendor || '—' : '—'}</td>
                      <td>{displayPurchase(r)}</td>
                      <td className="text-tiny">{displayKeterangan(r)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="card-header" style={{ borderTop: '1px solid var(--ga-br)', justifyContent: 'center', gap: 10 }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <span className="text-tiny text-muted">
              Halaman {page} dari {Math.ceil(total / 30) || 1}
            </span>
            <button className="btn btn-ghost btn-sm" disabled={page >= Math.ceil(total / 30)} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
