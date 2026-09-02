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
      <div style={{ padding: 60, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
        <strong>Memuat dokumen cetak Stock Opname...</strong>
      </div>
    );
  }

  if (!data || !data.session) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <h2>Dokumen Stock Opname tidak ditemukan atau Anda tidak memiliki akses.</h2>
        <Link href="/mtc/opname" style={{ color: '#2563eb', textDecoration: 'underline' }}>
          ← Kembali ke Daftar Opname
        </Link>
      </div>
    );
  }

  const { session, stats, items = [], locations = [] } = data;

  // Filter items by selected location if specified
  const filteredItems = (items || []).filter((item: any) => {
    if (selectedLocation !== 'ALL') {
      return (item.lokasi || '') === selectedLocation;
    }
    return true;
  });

  return (
    <div className="mtc-print-root">
      {/* Global Print CSS Styles */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 1.0cm 1.0cm 1.0cm 1.0cm;
        }

        html, body {
          background: #fff !important;
          color: #000 !important;
          font-family: Arial, Helvetica, sans-serif !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .mtc-print-root {
          background: #fff !important;
          color: #000 !important;
          font-family: Arial, Helvetica, sans-serif !important;
          padding: 16px 20px;
          max-width: 960px;
          margin: 0 auto;
          font-size: 9.5px;
          box-sizing: border-box;
          line-height: 1.25;
        }

        .mtc-print-root * {
          box-sizing: border-box;
          color: #000 !important;
        }

        .mtc-print-root table {
          width: 100% !important;
          border-collapse: collapse !important;
          table-layout: fixed !important;
        }

        .mtc-print-root td,
        .mtc-print-root th {
          background-color: #fff !important;
          color: #000 !important;
          word-break: break-word;
          overflow-wrap: break-word;
          border: 1px solid #000;
        }

        .mtc-print-root tr.header-row th {
          background-color: #f1f5f9 !important;
          font-weight: bold;
          font-size: 9.5px;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          .mtc-print-root {
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .page-break {
            page-break-before: always;
          }
          table {
            page-break-inside: auto;
            width: 100% !important;
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
        padding: '12px 16px',
        marginBottom: 16,
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
              padding: '7px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: 12
            }}
          >
            ← Kembali
          </Link>

          {/* Mode Selector */}
          <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 8, padding: 3 }}>
            <button
              onClick={() => setPrintMode('form')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 12,
                background: printMode === 'form' ? '#2563eb' : 'transparent',
                color: printMode === 'form' ? '#fff !important' : '#475569 !important'
              }}
            >
              📋 Form Lembar Kerja Fisik (Blanko)
            </button>
            <button
              onClick={() => setPrintMode('report')}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 800,
                fontSize: 12,
                background: printMode === 'report' ? '#2563eb' : 'transparent',
                color: printMode === 'report' ? '#fff !important' : '#475569 !important'
              }}
            >
              📊 Laporan Rekapitulasi Hasil
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
              padding: '8px 18px',
              borderRadius: 6,
              background: '#2563eb',
              color: '#fff !important',
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            🖨️ Cetak / Save to PDF
          </button>
        </div>
      </div>

      {/* Official FLG Kop Surat Header (Table Layout Fixed 100%) */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: 10, fontSize: 10, tableLayout: 'fixed' }}>
        <tbody>
          <tr>
            {/* Logo FOOM (Rowspan 3: 18%) */}
            <td rowSpan={3} style={{ width: '18%', border: '1px solid #000', padding: 4, textAlign: 'center', verticalAlign: 'middle', background: '#fff' }}>
              <img src="/logo.png" alt="FOOM" style={{ maxHeight: 34, maxWidth: '90%', objectFit: 'contain' }} />
            </td>

            {/* Row 1 Center: PT. FOOM Lab Global (44%) */}
            <td style={{ width: '44%', border: '1px solid #000', padding: '3px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: 11 }}>
              PT. FOOM Lab Global
            </td>

            {/* Row 1 Right: No. Dokumen (13% + 25%) */}
            <td style={{ width: '13%', border: '1px solid #000', padding: '3px 6px' }}>
              No. Dokumen
            </td>
            <td style={{ width: '25%', border: '1px solid #000', padding: '3px 6px', fontWeight: 'bold', fontFamily: 'monospace' }}>
              FLG/FORM/MTC/013-00
            </td>
          </tr>

          <tr>
            {/* Row 2 Center: Cikupa Factory */}
            <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: 10 }}>
              Cikupa Factory
            </td>

            {/* Row 2 Right: Revisi */}
            <td style={{ border: '1px solid #000', padding: '3px 6px' }}>
              Revisi
            </td>
            <td style={{ border: '1px solid #000', padding: '3px 6px' }}>
              00
            </td>
          </tr>

          <tr>
            {/* Row 3 Center: Title depends on Print Mode */}
            <td style={{ border: '1px solid #000', padding: '3px 6px', textAlign: 'center', fontWeight: 'bold', fontSize: 10.5, textTransform: 'uppercase' }}>
              {printMode === 'form' ? 'LEMBAR KERJA STOCK OPNAME MTC (FORM FISIK)' : 'LAPORAN HASIL REKAPITULASI STOCK OPNAME MTC'}
            </td>

            {/* Row 3 Right: Tanggal */}
            <td style={{ border: '1px solid #000', padding: '3px 6px' }}>
              Tanggal
            </td>
            <td style={{ border: '1px solid #000', padding: '3px 6px' }}>
              {session.createdAt ? new Date(session.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Sesi & Lokasi Metadata */}
      <table style={{ width: '100%', marginBottom: 8, fontSize: 10, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <tbody>
          <tr>
            <td style={{ width: '13%', fontWeight: 'bold', padding: '2px 0', border: 'none' }}>Judul Sesi SO</td>
            <td style={{ width: '37%', padding: '2px 0', border: 'none' }}>: <strong>{session.judul}</strong></td>
            <td style={{ width: '13%', fontWeight: 'bold', padding: '2px 0', border: 'none' }}>No. Sesi</td>
            <td style={{ width: '37%', padding: '2px 0', border: 'none' }}>: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>SO-MTC-{session.id}</span> ({session.status})</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 'bold', padding: '2px 0', border: 'none' }}>Cakupan Lokasi</td>
            <td style={{ padding: '2px 0', border: 'none' }}>: {selectedLocation !== 'ALL' ? `Rak: ${selectedLocation}` : (session.lokasi || 'Semua Rak Gudang MTC')}</td>
            <td style={{ fontWeight: 'bold', padding: '2px 0', border: 'none' }}>Tanggal Cetak</td>
            <td style={{ padding: '2px 0', border: 'none' }}>: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
          </tr>
        </tbody>
      </table>

      {/* MODE 1: FORM LEMBAR KERJA FISIK (BLANKO LAPANGAN UNTUK DIISI DI KERTAS) */}
      {printMode === 'form' && (
        <>
          <div style={{
            border: '1px dashed #475569',
            borderRadius: 4,
            padding: '4px 6px',
            marginBottom: 8,
            background: '#f8fafc',
            fontSize: 9,
            lineHeight: 1.25
          }}>
            <strong>📌 Petunjuk:</strong> Hitung fisik aktual di rak & tulis pada kolom <strong>Qty Fisik</strong>. Centang kondisi (B=Baik, R=Rusak). Tulis barang temuan baru di baris kosong di bawah.
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, marginBottom: 14, tableLayout: 'fixed' }}>
            <thead>
              <tr className="header-row" style={{ background: '#f1f5f9', textAlign: 'left' }}>
                <th style={{ border: '1px solid #000', padding: '4px 2px', width: '4%', textAlign: 'center' }}>No</th>
                <th style={{ border: '1px solid #000', padding: '4px 4px', width: showSystemQtyInForm ? '11%' : '12%' }}>Kode</th>
                <th style={{ border: '1px solid #000', padding: '4px 4px', width: showSystemQtyInForm ? '32%' : '37%' }}>Nama Sparepart / Barang</th>
                <th style={{ border: '1px solid #000', padding: '4px 4px', width: showSystemQtyInForm ? '10%' : '11%' }}>Rak</th>
                <th style={{ border: '1px solid #000', padding: '4px 2px', width: '5%', textAlign: 'center' }}>Satuan</th>
                {showSystemQtyInForm && (
                  <th style={{ border: '1px solid #000', padding: '4px 3px', width: '7%', textAlign: 'right' }}>Qty Sis</th>
                )}
                <th style={{ border: '2px solid #000', padding: '4px 3px', width: showSystemQtyInForm ? '9%' : '10%', textAlign: 'center', background: '#fff' }}>
                  QTY FISIK
                </th>
                <th style={{ border: '1px solid #000', padding: '4px 2px', width: showSystemQtyInForm ? '8%' : '9%', textAlign: 'center' }}>Kondisi</th>
                <th style={{ border: '1px solid #000', padding: '4px 4px', width: showSystemQtyInForm ? '14%' : '17%' }}>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item: any, idx: number) => (
                <tr key={item.id} style={{ height: 24, background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ border: '1px solid #000', padding: '2px 4px', fontSize: 8.5 }}>{item.sparepartId || '—'}</td>
                  <td style={{ border: '1px solid #000', padding: '2px 4px' }}>
                    <strong>{item.namaItem}</strong>
                    {item.isNewItem && <span style={{ fontSize: 7.5, marginLeft: 2 }}>(Baru)</span>}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '2px 4px' }}>{item.lokasi || 'Gudang MTC'}</td>
                  <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center' }}>{item.uom || 'Pcs'}</td>
                  {showSystemQtyInForm && (
                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'right', fontWeight: 'bold' }}>{item.qtySistem}</td>
                  )}
                  {/* Empty handwriting box */}
                  <td style={{ border: '2px solid #000', padding: '2px 3px', textAlign: 'center', background: '#fff' }}>
                  </td>
                  <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center', fontSize: 8 }}>
                    [ ] B &nbsp; [ ] R
                  </td>
                  <td style={{ border: '1px solid #000', padding: '2px 4px' }}></td>
                </tr>
              ))}

              {/* Extra Blank Rows for Writing Unlisted Items */}
              {[1, 2, 3, 4, 5].map((blankIdx) => (
                <tr key={`blank-${blankIdx}`} style={{ height: 26, background: '#fff' }}>
                  <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center', color: '#888' }}>{filteredItems.length + blankIdx}</td>
                  <td style={{ border: '1px solid #000', padding: '2px 4px', color: '#888', fontStyle: 'italic', fontSize: 8 }}>[Item Baru]</td>
                  <td style={{ border: '1px solid #000', padding: '2px 4px' }}></td>
                  <td style={{ border: '1px solid #000', padding: '2px 4px' }}></td>
                  <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center' }}>Pcs</td>
                  {showSystemQtyInForm && (
                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'right', color: '#888' }}>0</td>
                  )}
                  <td style={{ border: '2px solid #000', padding: '2px 3px', textAlign: 'center' }}></td>
                  <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center', fontSize: 8 }}>
                    [ ] B &nbsp; [ ] R
                  </td>
                  <td style={{ border: '1px solid #000', padding: '2px 4px' }}></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Signature Block for Form Mode */}
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginTop: 20, pageBreakInside: 'avoid' }}>
            <div style={{ width: '40%' }}>
              <div style={{ fontSize: 10, marginBottom: 40, fontWeight: 'bold' }}>Petugas Penghitung Lapangan,</div>
              <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 2 }}>
                ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )
              </div>
              <div style={{ fontSize: 9, marginTop: 2 }}>Teknisi / Staff Audit MTC</div>
              <div style={{ fontSize: 8, marginTop: 1 }}>Tgl: ............................................</div>
            </div>

            <div style={{ width: '40%' }}>
              <div style={{ fontSize: 10, marginBottom: 40, fontWeight: 'bold' }}>Supervisor / Penanggung Jawab MTC,</div>
              <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 2 }}>
                ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )
              </div>
              <div style={{ fontSize: 9, marginTop: 2 }}>Supervisor / PIC Gudang MTC</div>
              <div style={{ fontSize: 8, marginTop: 1 }}>Tgl: ............................................</div>
            </div>
          </div>
        </>
      )}

      {/* MODE 2: LAPORAN HASIL REKAPITULASI OPNAME (POST-AUDIT REPORT) */}
      {printMode === 'report' && (
        <>
          {/* Summary Box */}
          <div style={{ border: '1px solid #000', borderRadius: 4, padding: 8, marginBottom: 12, background: '#f9fafb' }}>
            <div style={{ fontWeight: 'bold', fontSize: 10, marginBottom: 4, borderBottom: '1px solid #d1d5db', paddingBottom: 2 }}>
              📊 RINGKASAN REKAPITULASI HASIL OPNAME
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, textAlign: 'center', fontSize: 9.5 }}>
              <div>
                <div style={{ color: '#555' }}>Total Item Audit</div>
                <div style={{ fontWeight: 'bold', fontSize: 12 }}>{stats.totalItems} Item</div>
                <div style={{ fontSize: 8, color: '#555' }}>({stats.countedItems} Dihitung)</div>
              </div>
              <div>
                <div>🎯 Akurasi Data</div>
                <div style={{ fontWeight: 'bold', fontSize: 12 }}>
                  {stats.accuracyPct !== undefined ? stats.accuracyPct : (stats.totalItems > 0 ? ((stats.totalMatchingCount / (stats.countedItems || stats.totalItems)) * 100).toFixed(1) : 0)}%
                </div>
                <div style={{ fontSize: 8 }}>({stats.totalMatchingCount} Sesuai)</div>
              </div>
              <div>
                <div>🟢 Sesuai (0)</div>
                <div style={{ fontWeight: 'bold', fontSize: 12 }}>{stats.totalMatchingCount} Item</div>
              </div>
              <div>
                <div>🔴 Total Minus (-Qty)</div>
                <div style={{ fontWeight: 'bold', fontSize: 12 }}>-{stats.totalMinusQty} Pcs</div>
                <div style={{ fontSize: 8 }}>({fmtCurrency(stats.totalMinusValue)})</div>
              </div>
              <div>
                <div>🔵 Total Plus (+Qty)</div>
                <div style={{ fontWeight: 'bold', fontSize: 12 }}>+{stats.totalPlusQty} Pcs</div>
                <div style={{ fontSize: 8 }}>({fmtCurrency(stats.totalPlusValue)})</div>
              </div>
              <div>
                <div>Net Varian Rp</div>
                <div style={{ fontWeight: 'bold', fontSize: 11.5 }}>
                  {fmtCurrency(stats.netVarianceValue)}
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, marginBottom: 16, tableLayout: 'fixed' }}>
            <thead>
              <tr className="header-row" style={{ background: '#e5e7eb', textAlign: 'left' }}>
                <th style={{ border: '1px solid #9ca3af', padding: '4px 2px', width: '4%', textAlign: 'center' }}>No</th>
                <th style={{ border: '1px solid #9ca3af', padding: '4px 3px', width: '12%' }}>Kode</th>
                <th style={{ border: '1px solid #9ca3af', padding: '4px 4px', width: '32%' }}>Nama Sparepart / Barang</th>
                <th style={{ border: '1px solid #9ca3af', padding: '4px 3px', width: '11%' }}>Lokasi</th>
                <th style={{ border: '1px solid #9ca3af', padding: '4px 3px', textAlign: 'right', width: '7%' }}>Qty Sis</th>
                <th style={{ border: '1px solid #9ca3af', padding: '4px 3px', textAlign: 'right', width: '7%' }}>Qty Fis</th>
                <th style={{ border: '1px solid #9ca3af', padding: '4px 3px', textAlign: 'right', width: '8%' }}>Selisih</th>
                <th style={{ border: '1px solid #9ca3af', padding: '4px 3px', textAlign: 'center', width: '9%' }}>Petugas</th>
                <th style={{ border: '1px solid #9ca3af', padding: '4px 4px', width: '10%' }}>Catatan</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item: any, idx: number) => {
                const selisih = item.selisih || 0;
                let selisihText = '0';

                if (item.isCounted) {
                  if (selisih < 0) selisihText = `${selisih} ${item.uom}`;
                  else if (selisih > 0) selisihText = `+${selisih} ${item.uom}`;
                  else selisihText = '0';
                } else {
                  selisihText = 'Belum Hitung';
                }

                return (
                  <tr key={item.id} style={{ height: 23, background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                    <td style={{ border: '1px solid #d1d5db', padding: '2px 2px', textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '2px 3px', fontSize: 8.5 }}>{item.sparepartId || '—'}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '2px 4px' }}>
                      <strong>{item.namaItem}</strong>
                      {item.isNewItem && <span style={{ fontSize: 7.5, marginLeft: 2 }}>(Baru)</span>}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: '2px 3px' }}>{item.lokasi || 'Gudang'}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '2px 3px', textAlign: 'right' }}>{item.qtySistem} {item.uom}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '2px 3px', textAlign: 'right', fontWeight: 'bold' }}>
                      {item.qtyFisik !== null && item.qtyFisik !== undefined ? `${item.qtyFisik} ${item.uom}` : '—'}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: '2px 3px', textAlign: 'right', fontWeight: selisih !== 0 ? 'bold' : 'normal' }}>
                      {selisihText}
                    </td>
                    <td style={{ border: '1px solid #d1d5db', padding: '2px 2px', textAlign: 'center', fontSize: 8 }}>{item.auditedBy || '—'}</td>
                    <td style={{ border: '1px solid #d1d5db', padding: '2px 3px', fontSize: 8 }}>{item.catatan || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Signature Block for Report Mode */}
          <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginTop: 20, pageBreakInside: 'avoid' }}>
            <div style={{ width: '40%' }}>
              <div style={{ fontSize: 10, marginBottom: 40 }}>Dihitung Oleh,</div>
              <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 2 }}>
                ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )
              </div>
              <div style={{ fontSize: 9, marginTop: 2 }}>Admin / Teknisi Maintenance</div>
            </div>

            <div style={{ width: '40%' }}>
              <div style={{ fontSize: 10, marginBottom: 40 }}>Diketahui & Disetujui Oleh,</div>
              <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 2 }}>
                ( {session.approvedBy || '.........................................'} )
              </div>
              <div style={{ fontSize: 9, marginTop: 2 }}>Manufacturing Manager / Supervisor</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
