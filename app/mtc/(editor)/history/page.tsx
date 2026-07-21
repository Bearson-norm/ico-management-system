'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function fmtRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function getPresetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === 'this-month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: fmt(from), to: fmt(to) };
  }
  if (preset === 'last-month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(from), to: fmt(to) };
  }
  if (preset === '3-months') {
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { from: fmt(from), to: fmt(now) };
  }
  if (preset === '6-months') {
    const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return { from: fmt(from), to: fmt(now) };
  }
  if (preset === 'this-year') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: fmt(from), to: fmt(now) };
  }
  return { from: '', to: '' };
}

function HistoryContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Table filters
  const [search, setSearch] = useState('');
  const [tipe, setTipe] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');

  // Export state
  const [showExport, setShowExport] = useState(false);
  const [expTipe, setExpTipe] = useState('');
  const [expPreset, setExpPreset] = useState('this-month');
  const [expFrom, setExpFrom] = useState('');
  const [expTo, setExpTo] = useState('');
  const [expFormat, setExpFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [exporting, setExporting] = useState(false);

  // Sync preset → date range for export
  useEffect(() => {
    if (expPreset !== 'custom') {
      const { from, to } = getPresetRange(expPreset);
      setExpFrom(from);
      setExpTo(to);
    }
  }, [expPreset]);

  // Sync with query parameter `tipe`
  useEffect(() => {
    const qTipe = searchParams.get('tipe') || '';
    setTipe(qTipe);
  }, [searchParams]);

  useEffect(() => {
    fetchData();
  }, [page, search, tipe, dateFrom, dateTo, sort]);

  async function fetchData() {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page) });
      if (search) q.set('search', search);
      if (tipe) q.set('tipe', tipe);
      if (dateFrom) q.set('dateFrom', dateFrom);
      if (dateTo) q.set('dateTo', dateTo);
      q.set('sort', sort);
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

  async function handleExport() {
    setExporting(true);
    try {
      const q = new URLSearchParams();
      if (expTipe) q.set('tipe', expTipe);
      if (expFrom) q.set('dateFrom', expFrom);
      if (expTo) q.set('dateTo', expTo);
      q.set('format', expFormat);

      const res = await fetch('/api/mtc/history/export?' + q.toString());
      if (!res.ok) { alert('Gagal export'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = res.headers.get('content-disposition') ?? '';
      const nameMatch = cd.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = nameMatch?.[1] ?? `StokHistory.${expFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="page-header">
        <div style={{ flex: 1 }}>
          <div className="page-title">Riwayat INOUT</div>
          <div className="page-sub">Audit trail pergerakan stok</div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => setShowExport(v => !v)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {showExport ? 'Tutup Export' : 'Export'}
        </button>
      </div>

      {/* Export Panel */}
      {showExport && (
        <div className="page-body" style={{ paddingBottom: 0 }}>
          <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
            <div className="card-header" style={{ display: 'block', padding: '14px 20px' }}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>
                📥 Ekspor Riwayat Stok
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>

                {/* Tipe */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>Tipe Transaksi</div>
                  <select className="form-input form-select" style={{ minWidth: 160 }} value={expTipe} onChange={e => setExpTipe(e.target.value)}>
                    <option value="">Semua (IN + OUT + LOG)</option>
                    <option value="IN">IN saja</option>
                    <option value="OUT">OUT saja</option>
                    <option value="LOG">LOG saja</option>
                  </select>
                </div>

                {/* Preset periode */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>Periode</div>
                  <select className="form-input form-select" style={{ minWidth: 170 }} value={expPreset} onChange={e => setExpPreset(e.target.value)}>
                    <option value="this-month">Bulan ini</option>
                    <option value="last-month">Bulan lalu</option>
                    <option value="3-months">3 Bulan terakhir</option>
                    <option value="6-months">6 Bulan terakhir</option>
                    <option value="this-year">Tahun ini</option>
                    <option value="custom">Custom range…</option>
                  </select>
                </div>

                {/* Custom date range */}
                {expPreset === 'custom' && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>Dari</div>
                      <input type="date" className="form-input" value={expFrom} onChange={e => setExpFrom(e.target.value)} />
                    </div>
                    <span style={{ paddingBottom: 8, color: 'var(--tx3)' }}>s/d</span>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>Sampai</div>
                      <input type="date" className="form-input" value={expTo} onChange={e => setExpTo(e.target.value)} />
                    </div>
                  </div>
                )}

                {/* Format */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--tx3)', marginBottom: 4 }}>Format File</div>
                  <select className="form-input form-select" style={{ minWidth: 120 }} value={expFormat} onChange={e => setExpFormat(e.target.value as 'xlsx' | 'csv')}>
                    <option value="xlsx">Excel (.xlsx)</option>
                    <option value="csv">CSV (.csv)</option>
                  </select>
                </div>

                {/* Info + Download button */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
                  {(expFrom || expTo) && (
                    <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                      {expFrom && expTo ? `${expFrom} s/d ${expTo}` : expFrom ? `Dari ${expFrom}` : `S/d ${expTo}`}
                    </div>
                  )}
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={handleExport}
                    disabled={exporting}
                  >
                    {exporting ? '⏳ Mengunduh...' : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Download {expFormat.toUpperCase()}
                      </>
                    )}
                  </button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      <div className="page-body">
        <div className="card">
          <div className="card-header" style={{ display: 'block', padding: '14px 20px' }}>
            <div className="filter-row" style={{ marginBottom: 0, width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <div className="search-bar" style={{ flex: '1 1 200px', minWidth: 180, marginBottom: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" placeholder="Cari nama barang, report, keterangan..." value={search} onChange={e => {setSearch(e.target.value); setPage(1);}} />
              </div>
              <select className="form-input form-select" style={{ flex: '0 0 auto', minWidth: 110 }} value={tipe} onChange={e => {setTipe(e.target.value); setPage(1);}}>
                <option value="">Semua Tipe</option>
                <option value="IN">IN</option>
                <option value="OUT">OUT</option>
                <option value="LOG">LOG</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: '0 1 auto' }}>
                <input type="date" className="form-input" style={{ flex: '1 1 130px', minWidth: 120 }} value={dateFrom} onChange={e => {setDateFrom(e.target.value); setPage(1);}} />
                <span className="text-muted" style={{ flexShrink: 0 }}>s/d</span>
                <input type="date" className="form-input" style={{ flex: '1 1 130px', minWidth: 120 }} value={dateTo} onChange={e => {setDateTo(e.target.value); setPage(1);}} />
              </div>
              <select className="form-input form-select" style={{ flex: '0 0 auto', minWidth: 160 }} value={sort} onChange={e => {setSort(e.target.value as 'desc' | 'asc'); setPage(1);}}>
                <option value="desc">Terbaru ↓</option>
                <option value="asc">Terlama ↑</option>
              </select>
            </div>
          </div>

          <div className="table-wrap" style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 680 }}>
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Waktu</th>
                  <th>Tipe</th>
                  <th>Item / Sparepart</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Harga</th>
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
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {d.harga && Number(d.harga) > 0 ? fmtRupiah(Number(d.harga)) : '—'}
                    </td>
                    <td>{d.pic?.nama || '—'}</td>
                    <td className="text-mono text-tiny">{d.noReport || '—'}</td>
                    <td className="text-tiny">{[d.keterangan, d.purchaseType, d.vendor].filter(Boolean).join(' · ') || '—'}</td>
                  </tr>
                ))}
                {data.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--tx3)' }}>
                      Tidak ada riwayat ditemukan
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card-header" style={{ borderTop: '1px solid var(--br)', borderBottom: 'none', justifyContent: 'center', gap: '10px' }}>
            <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span className="text-tiny text-muted">Halaman {page} dari {Math.ceil(total / 30) || 1} · Total {total} data</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= Math.ceil(total / 30)} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={
      <>
        <div className="page-header">
          <div className="page-title">Riwayat INOUT</div>
          <div className="page-sub">Memuat data riwayat...</div>
        </div>
        <div className="page-body">
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--tx3)' }}>Memuat…</div>
        </div>
      </>
    }>
      <HistoryContent />
    </Suspense>
  );
}
