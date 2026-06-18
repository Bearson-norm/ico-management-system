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

function formatDateDDMMYYYY(dateStr: string | Date) {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatPicName(name?: string | null) {
  if (!name) return '—';
  return name.trim().toUpperCase();
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
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');

  // Daily Email Draft Generator states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [draftDate, setDraftDate] = useState('');
  const [draftRows, setDraftRows] = useState<any[]>([]);
  const [fetchingDraft, setFetchingDraft] = useState(false);
  const [copiedType, setCopiedType] = useState<'plain' | 'rich' | null>(null);

  useEffect(() => {
    fetchData();
  }, [page, search, tipe, dateFrom, dateTo, sort]);

  useEffect(() => {
    if (showEmailModal && draftDate) {
      fetchDraftData();
    }
  }, [showEmailModal, draftDate]);

  async function fetchDraftData() {
    setFetchingDraft(true);
    try {
      const q = new URLSearchParams({
        dateFrom: draftDate,
        dateTo: draftDate,
        limit: '1000',
        sort: 'asc'
      });
      const res = await fetch('/api/ga/history?' + q.toString());
      const j = await res.json();
      if (j.success) {
        setDraftRows(j.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch draft data:', err);
    } finally {
      setFetchingDraft(false);
    }
  }

  const inboundRows = draftRows.filter((r) => r.tipe === 'IN');
  const outboundRows = draftRows.filter((r) => r.tipe === 'OUT');

  function getDraftText() {
    const formattedDate = draftDate ? formatDateDDMMYYYY(draftDate) : '';
    let text = `Dear All\nBerikut ini saya\nlampirkan data :\n\n`;

    text += `1. Inbound :\n`;
    if (inboundRows.length === 0) {
      text += `Tidak ada barang masuk.\n\n`;
    } else {
      text += `Nama Barang\tQuantity\tTanggal\tNAMA\n`;
      inboundRows.forEach((r) => {
        const name = r.namaBarang || r.item?.nama || '—';
        const qty = r.qty;
        const pic = formatPicName(r.picNama);
        text += `${name}\t${qty}\t${formattedDate}\t${pic}\n`;
      });
      text += `\n`;
    }

    text += `2. Outbound :\n`;
    if (outboundRows.length === 0) {
      text += `Tidak ada barang keluar.\n`;
    } else {
      text += `Nama Barang\tQuantity\tTanggal\tNAMA\n`;
      outboundRows.forEach((r) => {
        const name = r.namaBarang || r.item?.nama || '—';
        const qty = r.qty;
        const pic = formatPicName(r.picNama);
        text += `${name}\t${qty}\t${formattedDate}\t${pic}\n`;
      });
    }
    return text;
  }

  async function handleCopyPlainText() {
    const text = getDraftText();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType('plain');
      setTimeout(() => setCopiedType(null), 4000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  }

  async function handleCopyRichText() {
    const formattedDate = draftDate ? formatDateDDMMYYYY(draftDate) : '';
    const text = getDraftText();

    let html = `<p style="font-family: Arial, sans-serif; font-size: 14px; margin: 0 0 10px 0;">Dear All</p>`;
    html += `<p style="font-family: Arial, sans-serif; font-size: 14px; margin: 0 0 20px 0;">Berikut ini saya<br>lampirkan data :</p>`;

    html += `<p style="font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; margin: 0 0 10px 0;">1. Inbound :</p>`;
    if (inboundRows.length === 0) {
      html += `<p style="font-family: Arial, sans-serif; font-size: 13px; font-style: italic; color: #666; margin: 0 0 20px 0;">Tidak ada barang masuk.</p>`;
    } else {
      html += `<table style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13px; margin: 0 0 20px 0; min-width: 500px;">`;
      html += `<thead><tr style="background-color: #f3f4f6; text-align: left;">`;
      html += `<th style="border: 1px solid #d1d5db; padding: 8px 12px; font-weight: bold;">Nama Barang</th>`;
      html += `<th style="border: 1px solid #d1d5db; padding: 8px 12px; font-weight: bold; text-align: right;">Quantity</th>`;
      html += `<th style="border: 1px solid #d1d5db; padding: 8px 12px; font-weight: bold; text-align: center;">Tanggal</th>`;
      html += `<th style="border: 1px solid #d1d5db; padding: 8px 12px; font-weight: bold;">NAMA</th>`;
      html += `</tr></thead><tbody>`;
      inboundRows.forEach((r) => {
        const name = r.namaBarang || r.item?.nama || '—';
        const qty = r.qty;
        const pic = formatPicName(r.picNama);
        html += `<tr>`;
        html += `<td style="border: 1px solid #e5e7eb; padding: 8px 12px;">${name}</td>`;
        html += `<td style="border: 1px solid #e5e7eb; padding: 8px 12px; text-align: right;">${qty}</td>`;
        html += `<td style="border: 1px solid #e5e7eb; padding: 8px 12px; text-align: center;">${formattedDate}</td>`;
        html += `<td style="border: 1px solid #e5e7eb; padding: 8px 12px;">${pic}</td>`;
        html += `</tr>`;
      });
      html += `</tbody></table>`;
    }

    html += `<p style="font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; margin: 0 0 10px 0;">2. Outbound :</p>`;
    if (outboundRows.length === 0) {
      html += `<p style="font-family: Arial, sans-serif; font-size: 13px; font-style: italic; color: #666; margin: 0 0 10px 0;">Tidak ada barang keluar.</p>`;
    } else {
      html += `<table style="border-collapse: collapse; font-family: Arial, sans-serif; font-size: 13px; margin: 0; min-width: 500px;">`;
      html += `<thead><tr style="background-color: #f3f4f6; text-align: left;">`;
      html += `<th style="border: 1px solid #d1d5db; padding: 8px 12px; font-weight: bold;">Nama Barang</th>`;
      html += `<th style="border: 1px solid #d1d5db; padding: 8px 12px; font-weight: bold; text-align: right;">Quantity</th>`;
      html += `<th style="border: 1px solid #d1d5db; padding: 8px 12px; font-weight: bold; text-align: center;">Tanggal</th>`;
      html += `<th style="border: 1px solid #d1d5db; padding: 8px 12px; font-weight: bold;">NAMA</th>`;
      html += `</tr></thead><tbody>`;
      outboundRows.forEach((r) => {
        const name = r.namaBarang || r.item?.nama || '—';
        const qty = r.qty;
        const pic = formatPicName(r.picNama);
        html += `<tr>`;
        html += `<td style="border: 1px solid #e5e7eb; padding: 8px 12px;">${name}</td>`;
        html += `<td style="border: 1px solid #e5e7eb; padding: 8px 12px; text-align: right;">${qty}</td>`;
        html += `<td style="border: 1px solid #e5e7eb; padding: 8px 12px; text-align: center;">${formattedDate}</td>`;
        html += `<td style="border: 1px solid #e5e7eb; padding: 8px 12px;">${pic}</td>`;
        html += `</tr>`;
      });
      html += `</tbody></table>`;
    }

    try {
      const textBlob = new Blob([text], { type: 'text/plain' });
      const htmlBlob = new Blob([html], { type: 'text/html' });
      const item = new ClipboardItem({
        'text/plain': textBlob,
        'text/html': htmlBlob,
      });
      await navigator.clipboard.write([item]);
      setCopiedType('rich');
      setTimeout(() => setCopiedType(null), 4000);
    } catch (err) {
      console.error('Failed to copy rich text:', err);
      // Fallback
      await navigator.clipboard.writeText(text);
      setCopiedType('plain');
      setTimeout(() => setCopiedType(null), 4000);
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), limit: '30' });
      if (search) q.set('search', search);
      if (tipe) q.set('tipe', tipe);
      if (dateFrom) q.set('dateFrom', dateFrom);
      if (dateTo) q.set('dateTo', dateTo);
      q.set('sort', sort);
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
        <div className="flex-between" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="page-title" style={{ fontSize: '24px', fontWeight: '800' }}>Riwayat GA</div>
            <div className="page-sub" style={{ fontSize: '14px', marginTop: '4px' }}>Audit trail stok masuk & keluar</div>
          </div>
          <div className="ga-page-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setShowEmailModal(true);
                setDraftDate(dateFrom || new Date().toISOString().split('T')[0]);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '40px', fontWeight: '600' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              Draft Email Harian
            </button>
          </div>
        </div>
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
              <select
                className="form-input form-select"
                style={{ width: 180 }}
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as 'desc' | 'asc');
                  setPage(1);
                }}
              >
                <option value="desc">Terbaru (tanggal & waktu)</option>
                <option value="asc">Terlama (tanggal & waktu)</option>
              </select>
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

      {showEmailModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', inset: 0, zIndex: 1000 }} onClick={() => setShowEmailModal(false)}>
          <div className="modal-box" style={{ width: '640px', padding: '24px', borderRadius: 'var(--ga-r)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--ga-br)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div className="modal-title" style={{ fontSize: '16px', fontWeight: 'bold' }}>Draft Email Laporan Harian</div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowEmailModal(false)} style={{ padding: '4px 8px' }}>Tutup</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
              <div>
                <label className="form-label" style={{ fontSize: '12px', marginBottom: '4px', display: 'block' }}>Pilih Tanggal Laporan</label>
                <input
                  type="date"
                  className="form-input"
                  value={draftDate}
                  onChange={(e) => {
                    setDraftDate(e.target.value);
                    setCopiedType(null);
                  }}
                  style={{ width: '100%', padding: '10px', borderRadius: 'var(--ga-rs)' }}
                />
              </div>

              {fetchingDraft ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ga-tx2)' }}>
                  Memuat data riwayat tanggal {draftDate ? formatDateDDMMYYYY(draftDate) : ''}...
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div className="form-label" style={{ fontSize: '12px' }}>Pratinjau Draf Email:</div>
                    <div
                      style={{
                        background: 'var(--ga-sf2)',
                        padding: '16px',
                        borderRadius: 'var(--ga-rs)',
                        border: '1px solid var(--ga-br)',
                        maxHeight: '320px',
                        overflowY: 'auto',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--ga-tx)',
                      }}
                    >
                      {getDraftText()}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleCopyRichText}
                      disabled={draftRows.length === 0}
                      style={{ flex: 1, fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                      {copiedType === 'rich' ? 'Tersalin!' : 'Salin untuk Email (Rich Text/Tabel)'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleCopyPlainText}
                      disabled={draftRows.length === 0}
                      style={{ fontWeight: '600', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      Salin Teks Biasa
                    </button>
                  </div>
                  {copiedType && (
                    <div style={{ fontSize: '12px', color: 'var(--ga-grn)', textAlign: 'center', marginTop: '-4px' }}>
                      {copiedType === 'rich' 
                        ? 'Format Tabel Rich Text telah disalin! Anda bisa langsung Paste (Ctrl+V) di Outlook atau Gmail.'
                        : 'Format Teks Biasa telah disalin ke clipboard.'}
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="modal-footer" style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid var(--ga-br)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowEmailModal(false)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
