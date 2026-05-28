'use client';
import { useState, useEffect } from 'react';

export default function HistoryPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Filters
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
      const q = new URLSearchParams({ page: String(page) });
      if (search) q.set('search', search);
      if (tipe) q.set('tipe', tipe);
      if (dateFrom) q.set('dateFrom', dateFrom);
      if (dateTo) q.set('dateTo', dateTo);
      
      const res = await fetch('/api/mtc/history?' + q.toString());
      const json = await res.json();
      if (json.success) {
        setData(json.data.data);
        setTotal(json.data.total);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">Riwayat INOUT</div>
        <div className="page-sub">Audit trail pergerakan stok</div>
      </div>

      <div className="page-body">
        <div className="card">
          <div className="card-header">
            <div className="filter-row" style={{ marginBottom: 0, width: '100%' }}>
              <div className="search-bar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" placeholder="Cari nama barang, report, keterangan..." value={search} onChange={e => {setSearch(e.target.value); setPage(1);}} />
              </div>
              <select className="form-input form-select" style={{ width: '120px' }} value={tipe} onChange={e => {setTipe(e.target.value); setPage(1);}}>
                <option value="">Semua Tipe</option>
                <option value="IN">IN</option>
                <option value="OUT">OUT</option>
                <option value="LOG">LOG</option>
              </select>
              <input type="date" className="form-input" style={{ width: '140px' }} value={dateFrom} onChange={e => {setDateFrom(e.target.value); setPage(1);}} />
              <span className="text-muted">ke</span>
              <input type="date" className="form-input" style={{ width: '140px' }} value={dateTo} onChange={e => {setDateTo(e.target.value); setPage(1);}} />
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Waktu</th>
                  <th>Tipe</th>
                  <th>Item / Sparepart</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th>PIC</th>
                  <th>No Report</th>
                  <th>Keterangan</th>
                </tr>
              </thead>
              <tbody style={{ opacity: loading ? 0.5 : 1 }}>
                {data.map(d => (
                  <tr key={d.id}>
                    <td>{new Date(d.tanggal).toLocaleDateString('id-ID')}</td>
                    <td className="text-muted text-tiny">{new Date(d.createdAt).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</td>
                    <td>
                      {d.tipe === 'IN' && <span className="badge badge-grn">IN</span>}
                      {d.tipe === 'OUT' && <span className="badge badge-ylw">OUT</span>}
                      {d.tipe === 'LOG' && <span className="badge badge-pur">LOG</span>}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {d.namaItem}
                      {d.sparepartId && <div className="text-tiny text-muted">{d.sparepartId}</div>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{d.qty}</td>
                    <td>{d.pic?.nama || '—'}</td>
                    <td className="text-mono text-tiny">{d.noReport || '—'}</td>
                    <td className="text-tiny">{[d.keterangan, d.purchaseType, d.vendor].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
                {data.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--tx3)' }}>
                      Tidak ada riwayat ditemukan
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          <div className="card-header" style={{ borderTop: '1px solid var(--br)', borderBottom: 'none', justifyContent: 'center', gap: '10px' }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span className="text-tiny text-muted">Halaman {page} dari {Math.ceil(total / 30) || 1}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= Math.ceil(total / 30)} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </div>
      </div>
    </>
  );
}
