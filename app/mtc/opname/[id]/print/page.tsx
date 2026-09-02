'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function MtcOpnamePrintPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Print View Modes: 'form' (Blanko Lembar Kerja Fisik Lapangan) vs 'report' (Laporan Hasil Rekapitulasi)
  const [printMode, setPrintMode] = useState<'form' | 'report'>('form');
  const [showSystemQtyInForm, setShowSystemQtyInForm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

  useEffect(() => {
    // Check URL query parameters for mode
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const modeParam = urlParams.get('mode');
      if (modeParam === 'report') {
        setPrintMode('report');
      } else if (modeParam === 'form') {
        setPrintMode('form');
      }
    }

    async function fetchPrintData() {
      try {
        const res = await fetch(`/api/mtc/opname/${sessionId}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        } else {
          alert('Gagal memuat data cetak: ' + json.error);
        }
      } catch (e) {
        console.error('Error loading print data:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchPrintData();
  }, [sessionId]);

  const fmtCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  };

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
        <strong>Memuat dokumen cetak Stock Opname...</strong>
      </div>
    );
  }

  if (!data || !data.session) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
        <h2>Dokumen Stock Opname tidak ditemukan atau Anda tidak memiliki akses.</h2>
        <Link href="/mtc/opname" style={{ color: '#2563eb', textDecoration: 'underline' }}>
          ← Kembali ke Daftar Opname
        </Link>
      </div>
    );
  }

  const { session, stats, items, locations = [] } = data;

  // Filter items by selected location if specified
  const filteredItems = (items || []).filter((item: any) => {
    if (selectedLocation !== 'ALL') {
      return (item.lokasi || '') === selectedLocation;
    }
    return true;
  });

  return (
    <div style={{
      background: '#fff',
      color: '#000',
      fontFamily: 'Arial, Helvetica, sans-serif',
      padding: '24px 30px',
      maxWidth: 1050,
      margin: '0 auto',
      fontSize: 11
    }}>
      {/* Print CSS Styles */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm 12mm;
        }
        body {
          background: #fff !important;
          color: #000 !important;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-before: always;
          }
          table {
            page-break-inside: auto;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
        }
      `}</style>

      {/* Floating Toolbar (NO PRINT) */}
      <div className="no-print" style={{
        background: '#f8fafc',
        border: '1px solid #cbd5e1',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 24,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.06)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Link
            href={`/mtc/opname/${sessionId}`}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 12
            }}
          >
            ← Kembali ke Detail Sesi
          </Link>

          {/* Mode Selector */}
          <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => setPrintMode('form')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 12,
                background: printMode === 'form' ? '#2563eb' : 'transparent',
                color: printMode === 'form' ? '#fff' : '#475569'
              }}
            >
              📋 Form Lembar Kerja Fisik (Blanko)
            </button>
            <button
              onClick={() => setPrintMode('report')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 12,
                background: printMode === 'report' ? '#2563eb' : 'transparent',
                color: printMode === 'report' ? '#fff' : '#475569'
              }}
            >
              📊 Laporan Rekapitulasi Hasil
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Options for Form Mode */}
          {printMode === 'form' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showSystemQtyInForm}
                onChange={e => setShowSystemQtyInForm(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span>Tampilkan Kolom Stok Sistem</span>
            </label>
          )}

          {/* Location Filter */}
          {locations.length > 0 && (
            <select
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: 12,
                fontWeight: 600,
                color: '#334155'
              }}
            >
              <option value="ALL">Semua Rak / Lokasi ({items.length} Item)</option>
              {locations.map((loc: string) => (
                <option key={loc} value={loc}>Rak: {loc}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => window.print()}
            style={{
              padding: '9px 20px',
              borderRadius: 8,
              background: '#2563eb',
              color: '#fff',
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            🖨️ Cetak / Print ke PDF
          </button>
        </div>
      </div>

      {/* Official FLG Kop Surat Header */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: 14, fontSize: 11 }}>
        <tbody>
          <tr>
            {/* Logo FOOM (Rowspan 3) */}
            <td rowSpan={3} style={{ width: '22%', border: '1px solid #000', padding: 8, textAlign: 'center', verticalAlign: 'middle', background: '#fff' }}>
              <img src="/logo.png" alt="FOOM" style={{ maxHeight: 42, maxWidth: '100%', objectFit: 'contain' }} />
            </td>

            {/* Row 1 Center: PT. FOOM Lab Global */}
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 12 }}>
              PT. FOOM Lab Global
            </td>

            {/* Row 1 Right: No. Dokumen */}
            <td style={{ width: '13%', border: '1px solid #000', padding: '4px 8px' }}>
              No. Dokumen
            </td>
            <td style={{ width: '25%', border: '1px solid #000', padding: '4px 8px', fontWeight: 'bold', fontFamily: 'monospace' }}>
              FLG/FORM/MTC/013-00
            </td>
          </tr>

          <tr>
            {/* Row 2 Center: Cikupa Factory */}
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 11 }}>
              Cikupa Factory
            </td>

            {/* Row 2 Right: Revisi */}
            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>
              Revisi
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>
              00
            </td>
          </tr>

          <tr>
            {/* Row 3 Center: Title depends on Print Mode */}
            <td style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 12, textTransform: 'uppercase' }}>
              {printMode === 'form' ? 'LEMBAR KERJA STOCK OPNAME MTC (FORM FISIK)' : 'LAPORAN HASIL REKAPITULASI STOCK OPNAME MTC'}
            </td>

            {/* Row 3 Right: Tanggal */}
            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>
              Tanggal
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 8px' }}>
              {session.createdAt ? new Date(session.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Sesi & Lokasi Metadata */}
      <table style={{ width: '100%', marginBottom: 14, fontSize: 11, borderCollapse: 'collapse', background: '#fff' }}>
        <tbody>
          <tr>
            <td style={{ width: '14%', fontWeight: 'bold', padding: '3px 0' }}>Judul Sesi SO</td>
            <td style={{ width: '36%', padding: '3px 0' }}>: <strong>{session.judul}</strong></td>
            <td style={{ width: '14%', fontWeight: 'bold', padding: '3px 0' }}>No. Sesi</td>
            <td style={{ width: '36%', padding: '3px 0' }}>: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>SO-MTC-{session.id}</span> ({session.status})</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 'bold', padding: '3px 0' }}>Cakupan Lokasi</td>
            <td style={{ padding: '3px 0' }}>: {selectedLocation !== 'ALL' ? `Rak / Lokasi: ${selectedLocation}` : (session.lokasi || 'Semua Rak Gudang MTC')}</td>
            <td style={{ fontWeight: 'bold', padding: '3px 0' }}>Tanggal Cetak</td>
            <td style={{ padding: '3px 0' }}>: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
          </tr>
        </tbody>
      </table>

      {/* MODE 1: FORM LEMBAR KERJA FISIK (BLANKO LAPANGAN UNTUK DIISI DI KERTAS) */}
      {printMode === 'form' && (
        <>
          <div style={{
            border: '1px dashed #475569',
            borderRadius: 4,
            padding: '6px 10px',
            marginBottom: 12,
            background: '#f8fafc',
            fontSize: 10,
            color: '#334155'
          }}>
            <strong>📌 Petunjuk Pengisian Lapangan:</strong>
            <span style={{ marginLeft: 6 }}>
              1. Hitung fisik barang aktual di rak/gudang. 2. Tuliskan jumlah fisik pada kolom <strong>Qty Fisik</strong>. 3. Beri centang/keterangan kondisi barang. 4. Jika ada sparepart fisik yang belum terdaftar di tabel, tuliskan pada baris kosong di halaman terakhir. 5. Tanda tangani form setelah selesai.
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginBottom: 24 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                <th style={{ border: '1px solid #000', padding: '6px 4px', width: 26, textAlign: 'center' }}>No</th>
                <th style={{ border: '1px solid #000', padding: '6px 6px', width: 85 }}>Kode Barang</th>
                <th style={{ border: '1px solid #000', padding: '6px 6px' }}>Nama Sparepart / Barang</th>
                <th style={{ border: '1px solid #000', padding: '6px 6px', width: 90 }}>Lokasi / Rak</th>
                <th style={{ border: '1px solid #000', padding: '6px 4px', width: 42, textAlign: 'center' }}>Satuan</th>
                {showSystemQtyInForm && (
                  <th style={{ border: '1px solid #000', padding: '6px 6px', width: 65, textAlign: 'right' }}>Qty Sistem</th>
                )}
                <th style={{ border: '2px solid #000', padding: '6px 6px', width: 85, textAlign: 'center', background: '#fff' }}>
                  QTY FISIK<br /><span style={{ fontSize: 8, fontWeight: 'normal' }}>(Tulis Tangan)</span>
                </th>
                <th style={{ border: '1px solid #000', padding: '6px 4px', width: 75, textAlign: 'center' }}>Kondisi (B/R)</th>
                <th style={{ border: '1px solid #000', padding: '6px 6px', width: 130 }}>Catatan / Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item: any, idx: number) => (
                <tr key={item.id} style={{ height: 28, background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px', fontFamily: 'monospace', fontSize: 9 }}>{item.sparepartId || '—'}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px' }}>
                    <strong>{item.namaItem}</strong>
                    {item.isNewItem && <span style={{ fontSize: 8, marginLeft: 4 }}>(Baru)</span>}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{item.lokasi || 'Gudang MTC'}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center' }}>{item.uom || 'Pcs'}</td>
                  {showSystemQtyInForm && (
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontWeight: 'bold' }}>{item.qtySistem}</td>
                  )}
                  {/* Empty hand-writing box */}
                  <td style={{ border: '2px solid #000', padding: '4px 6px', textAlign: 'center', background: '#fff' }}>
                    {/* Blank line for writing */}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', fontSize: 9, color: '#666' }}>
                    [ &nbsp; ] B &nbsp; [ &nbsp; ] R
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px' }}></td>
                </tr>
              ))}

              {/* Extra Blank Rows for Writing Unlisted Items in Warehouse */}
              {[1, 2, 3, 4, 5].map((blankIdx) => (
                <tr key={`blank-${blankIdx}`} style={{ height: 30, background: '#fff' }}>
                  <td style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', color: '#888' }}>{filteredItems.length + blankIdx}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px', color: '#888', fontStyle: 'italic', fontSize: 9 }}>[Item Baru]</td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px' }}></td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px' }}></td>
                  <td style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center' }}>Pcs</td>
                  {showSystemQtyInForm && (
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', color: '#888' }}>0</td>
                  )}
                  <td style={{ border: '2px solid #000', padding: '4px 6px', textAlign: 'center' }}></td>
                  <td style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', fontSize: 9, color: '#666' }}>
                    [ &nbsp; ] B &nbsp; [ &nbsp; ] R
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px 6px' }}></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Signature Block for Form Mode */}
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginTop: 30, pageBreakInside: 'avoid' }}>
            <div style={{ width: '42%' }}>
              <div style={{ fontSize: 11, marginBottom: 55, fontWeight: 'bold' }}>Petugas Penghitung Fisik Lapangan,</div>
              <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 4 }}>
                ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )
              </div>
              <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>Teknisi / Staff Audit MTC</div>
              <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>Tgl: ............................................</div>
            </div>

            <div style={{ width: '42%' }}>
              <div style={{ fontSize: 11, marginBottom: 55, fontWeight: 'bold' }}>Penanggung Jawab / Supervisor MTC,</div>
              <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 4 }}>
                ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )
              </div>
              <div style={{ fontSize: 10, color: '#444', marginTop: 4 }}>Supervisor / PIC Gudang MTC</div>
              <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>Tgl: ............................................</div>
            </div>
          </div>
        </>
      )}

      {/* MODE 2: LAPORAN HASIL REKAPITULASI OPNAME (POST-AUDIT REPORT) */}
      {printMode === 'report' && (
        <>
          {/* Summary Box */}
          <div style={{ border: '1px solid #000', borderRadius: 4, padding: 12, marginBottom: 18, background: '#f9fafb' }}>
            <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 8, borderBottom: '1px solid #d1d5db', paddingBottom: 4, letterSpacing: '0.5px' }}>
              📊 RINGKASAN REKAPITULASI HASIL OPNAME
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, textAlign: 'center', fontSize: 11 }}>
              <div>
                <div style={{ color: '#666' }}>Total Item Audit</div>
                <div style={{ fontWeight: 'bold', fontSize: 14 }}>{stats.totalItems} Item</div>
                <div style={{ fontSize: 9, color: '#666' }}>({stats.countedItems} Dihitung)</div>
              </div>
              <div>
                <div style={{ color: '#0284c7' }}>🎯 Akurasi Data</div>
                <div style={{ fontWeight: 'bold', fontSize: 14, color: '#0284c7' }}>
                  {stats.accuracyPct !== undefined ? stats.accuracyPct : (stats.totalItems > 0 ? ((stats.totalMatchingCount / (stats.countedItems || stats.totalItems)) * 100).toFixed(1) : 0)}%
                </div>
                <div style={{ fontSize: 9, color: '#0284c7' }}>({stats.totalMatchingCount} Sesuai)</div>
              </div>
              <div>
                <div style={{ color: '#16a34a' }}>🟢 Sesuai (0)</div>
                <div style={{ fontWeight: 'bold', fontSize: 14, color: '#16a34a' }}>{stats.totalMatchingCount} Item</div>
              </div>
              <div>
                <div style={{ color: '#dc2626' }}>🔴 Total Minus (-Qty)</div>
                <div style={{ fontWeight: 'bold', fontSize: 14, color: '#dc2626' }}>-{stats.totalMinusQty} Pcs</div>
                <div style={{ fontSize: 9, color: '#dc2626' }}>({fmtCurrency(stats.totalMinusValue)})</div>
              </div>
              <div>
                <div style={{ color: '#2563eb' }}>🔵 Total Plus (+Qty)</div>
                <div style={{ fontWeight: 'bold', fontSize: 14, color: '#2563eb' }}>+{stats.totalPlusQty} Pcs</div>
                <div style={{ fontSize: 9, color: '#2563eb' }}>({fmtCurrency(stats.totalPlusValue)})</div>
              </div>
              <div>
                <div style={{ color: '#000' }}>Net Varian Rp</div>
                <div style={{ fontWeight: 'bold', fontSize: 13, color: stats.netVarianceValue < 0 ? '#dc2626' : stats.netVarianceValue > 0 ? '#2563eb' : '#16a34a' }}>
                  {fmtCurrency(stats.netVarianceValue)}
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginBottom: 30 }}>
            <thead>
              <tr style={{ background: '#e5e7eb', textAlign: 'left' }}>
                <th style={{ border: '1px solid #9ca3af', padding: 6, width: 24, textAlign: 'center' }}>No</th>
                <th style={{ border: '1px solid #9ca3af', padding: 6, width: 85 }}>Kode</th>
                <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Nama Sparepart / Barang Fisik</th>
                <th style={{ border: '1px solid #9ca3af', padding: 6, width: 90 }}>Lokasi</th>
                <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right', width: 70 }}>Qty Sistem</th>
                <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right', width: 70 }}>Qty Fisik</th>
                <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right', width: 70 }}>Selisih</th>
                <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'center', width: 90 }}>Petugas</th>
                <th style={{ border: '1px solid #9ca3af', padding: 6, width: 120 }}>Catatan Audit</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item: any, idx: number) => {
                const selisih = item.selisih || 0;
                let statusStyle = {};
                let selisihText = '0';

                if (item.isCounted) {
                  if (selisih < 0) {
                    statusStyle = { color: '#dc2626', fontWeight: 'bold' };
                    selisihText = `${selisih} ${item.uom}`;
                  } else if (selisih > 0) {
                    statusStyle = { color: '#2563eb', fontWeight: 'bold' };
                    selisihText = `+${selisih} ${item.uom}`;
                  } else {
                    statusStyle = { color: '#16a34a' };
                    selisihText = '0';
                  }
                } else {
                  selisihText = 'Belum Hitung';
                }

                return (
                  <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: 5, fontFamily: 'monospace', fontSize: 9 }}>{item.sparepartId || '—'}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: 5 }}>
                      <strong>{item.namaItem}</strong>
                      {item.isNewItem && <span style={{ color: '#d97706', fontSize: 9, marginLeft: 4 }}>(Item Baru)</span>}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: 5 }}>{item.lokasi || 'Gudang'}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'right' }}>{item.qtySistem} {item.uom}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'right', fontWeight: 'bold' }}>
                      {item.qtyFisik !== null && item.qtyFisik !== undefined ? `${item.qtyFisik} ${item.uom}` : '—'}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'right', ...statusStyle }}>
                      {selisihText}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'center', fontSize: 9 }}>{item.auditedBy || '—'}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: 5, fontSize: 9 }}>{item.catatan || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Signature Block for Report Mode */}
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginTop: 36, pageBreakInside: 'avoid' }}>
            <div style={{ width: '42%' }}>
              <div style={{ fontSize: 11, marginBottom: 55 }}>Dihitung Oleh,</div>
              <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 4 }}>
                ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )
              </div>
              <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Admin / Teknisi Maintenance</div>
            </div>

            <div style={{ width: '42%' }}>
              <div style={{ fontSize: 11, marginBottom: 55 }}>Diketahui & Disetujui Oleh,</div>
              <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 4 }}>
                ( {session.approvedBy || '.........................................'} )
              </div>
              <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Manufacturing Manager / Supervisor</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
