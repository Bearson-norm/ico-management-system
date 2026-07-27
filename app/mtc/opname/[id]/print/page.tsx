'use client';

import React, { useState, useEffect } from 'react';

export default function MtcOpnamePrintPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPrintData() {
      try {
        const res = await fetch(`/api/mtc/opname/${sessionId}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
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
    return <div style={{ padding: 40, textAlign: 'center' }}>⏳ Memuat dokumen cetak Stock Opname...</div>;
  }

  if (!data || !data.session) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Dokumen Stock Opname tidak ditemukan.</div>;
  }

  const { session, stats, items } = data;

  return (
    <div style={{
      background: '#fff',
      color: '#000',
      fontFamily: 'Arial, sans-serif',
      padding: 30,
      maxWidth: 1000,
      margin: '0 auto',
      fontSize: 12
    }}>
      {/* Print CSS Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: #fff !important;
            color: #000 !important;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-before: always;
          }
        }
      `}</style>

      {/* Floating Action Button for Triggering Print */}
      <div className="no-print" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => window.history.back()}
          style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer' }}
        >
          ← Kembali
        </button>

        <button
          onClick={() => window.print()}
          style={{
            padding: '10px 20px',
            borderRadius: 6,
            background: '#2563eb',
            color: '#fff',
            fontWeight: 'bold',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          🖨️ Cetak / Save to PDF
        </button>
      </div>

      {/* Document Header */}
      <div style={{ borderBottom: '2px solid #000', paddingBottom: 12, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 'bold' }}>PT FOOM LAB GLOBAL</h1>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#444', marginTop: 2 }}>DEPARTEMEN MAINTENANCE & SPAREPART (MTC)</div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Laporan Hasil Audit Physical Stock Opname Gudang</div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#2563eb' }}>BERKAS STOCK OPNAME</h2>
          <div style={{ fontSize: 12, fontWeight: 'bold', marginTop: 4 }}>NO: SO-MTC-{session.id}</div>
          <div style={{ fontSize: 11, color: '#555' }}>Status: {session.status}</div>
        </div>
      </div>

      {/* Audit Metadata */}
      <table style={{ width: '100%', marginBottom: 20, fontSize: 11, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ width: '15%', fontWeight: 'bold', padding: '4px 0' }}>Judul Audit</td>
            <td style={{ width: '35%', padding: '4px 0' }}>: {session.judul}</td>
            <td style={{ width: '15%', fontWeight: 'bold', padding: '4px 0' }}>Tanggal Cetak</td>
            <td style={{ width: '35%', padding: '4px 0' }}>: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 'bold', padding: '4px 0' }}>Lokasi Rak</td>
            <td style={{ padding: '4px 0' }}>: {session.lokasi || 'Semua Rak Gudang MTC'}</td>
            <td style={{ fontWeight: 'bold', padding: '4px 0' }}>Di-ACC Oleh</td>
            <td style={{ padding: '4px 0' }}>: {session.approvedBy ? `${session.approvedBy} (${new Date(session.approvedAt).toLocaleDateString('id-ID')})` : '— (Menunggu ACC)'}</td>
          </tr>
        </tbody>
      </table>

      {/* Summary Box */}
      <div style={{ border: '1px solid #000', borderRadius: 6, padding: 12, marginBottom: 20, background: '#f9fafb' }}>
        <div style={{ fontWeight: 'bold', fontSize: 12, marginBottom: 8, borderBottom: '1px solid #ccc', paddingBottom: 4 }}>
          📊 RINGKASAN REKAPITULASI HASIL OPNAME
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, textAlign: 'center', fontSize: 11 }}>
          <div>
            <div style={{ color: '#666' }}>Total Item Audit</div>
            <div style={{ fontWeight: 'bold', fontSize: 14 }}>{stats.totalItems} Item</div>
          </div>
          <div>
            <div style={{ color: '#16a34a' }}>🟢 Sesuai (0)</div>
            <div style={{ fontWeight: 'bold', fontSize: 14, color: '#16a34a' }}>{stats.totalMatchingCount} Item</div>
          </div>
          <div>
            <div style={{ color: '#dc2626' }}>🔴 Total Minus (-Qty)</div>
            <div style={{ fontWeight: 'bold', fontSize: 14, color: '#dc2626' }}>-{stats.totalMinusQty} Pcs</div>
            <div style={{ fontSize: 10, color: '#dc2626' }}>({fmtCurrency(stats.totalMinusValue)})</div>
          </div>
          <div>
            <div style={{ color: '#2563eb' }}>🔵 Total Plus (+Qty)</div>
            <div style={{ fontWeight: 'bold', fontSize: 14, color: '#2563eb' }}>+{stats.totalPlusQty} Pcs</div>
            <div style={{ fontSize: 10, color: '#2563eb' }}>({fmtCurrency(stats.totalPlusValue)})</div>
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
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Kode</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Nama Sparepart / Barang Fisik</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Lokasi</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right' }}>Qty Sistem</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right' }}>Qty Fisik</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right' }}>Selisih</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'center' }}>Petugas</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Catatan Audit</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, idx: number) => {
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
                <td style={{ border: '1px solid #d1d5db', padding: 5, fontFamily: 'monospace' }}>{item.sparepartId || '—'}</td>
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

      {/* Signature Block */}
      <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center', marginTop: 40, pageBreakInside: 'avoid' }}>
        <div style={{ width: '30%' }}>
          <div style={{ fontSize: 11, marginBottom: 50 }}>Dibuat Oleh (Tim Audit),</div>
          <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 4 }}>
            ( ......................................... )
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Teknisi Audit MTC</div>
        </div>

        <div style={{ width: '30%' }}>
          <div style={{ fontSize: 11, marginBottom: 50 }}>Diperiksa Oleh,</div>
          <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 4 }}>
            ( ......................................... )
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Supervisor MTC</div>
        </div>

        <div style={{ width: '30%' }}>
          <div style={{ fontSize: 11, marginBottom: 50 }}>Disetujui Oleh (ACC),</div>
          <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 4 }}>
            ( {session.approvedBy || '.........................................'} )
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Manager Produksi / MTC</div>
        </div>
      </div>
    </div>
  );
}
