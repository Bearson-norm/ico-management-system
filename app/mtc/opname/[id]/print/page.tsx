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

      {/* Official Kop Surat Header Table matching Excel FLG FORM */}
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: 16, fontFamily: 'Arial, sans-serif', fontSize: 11 }}>
        <tbody>
          <tr>
            {/* Logo FOOM (Rowspan 3) */}
            <td rowSpan={3} style={{ width: '22%', border: '1px solid #000', padding: 8, textAlign: 'center', verticalAlign: 'middle', background: '#fff' }}>
              <img src="/logo.png" alt="FOOM" style={{ maxHeight: 42, maxWidth: '100%', objectFit: 'contain' }} />
            </td>

            {/* Row 1 Center: PT. FOOM Lab Global */}
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 12, color: '#000' }}>
              PT. FOOM Lab Global
            </td>

            {/* Row 1 Right: No. Dokumen */}
            <td style={{ width: '13%', border: '1px solid #000', padding: '4px 8px', color: '#000' }}>
              No. Dokumen
            </td>
            <td style={{ width: '25%', border: '1px solid #000', padding: '4px 8px', color: '#000' }}>
              FLG/FORM/MTC/013-00
            </td>
          </tr>

          <tr>
            {/* Row 2 Center: Cikupa Factory */}
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 11, color: '#000' }}>
              Cikupa Factory
            </td>

            {/* Row 2 Right: Revisi */}
            <td style={{ border: '1px solid #000', padding: '4px 8px', color: '#000' }}>
              Revisi
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 8px', color: '#000' }}>
              00
            </td>
          </tr>

          <tr>
            {/* Row 3 Center: LAPORAN STOCK OPNAME */}
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 11, color: '#000', textTransform: 'uppercase' }}>
              LAPORAN STOCK OPNAME
            </td>

            {/* Row 3 Right: Tanggal */}
            <td style={{ border: '1px solid #000', padding: '4px 8px', color: '#000' }}>
              Tanggal
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 8px', color: '#000' }}>
              {session.tanggal ? new Date(session.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Audit Metadata Details */}
      <table style={{ width: '100%', marginBottom: 18, fontSize: 11, borderCollapse: 'collapse', background: '#fff' }}>
        <tbody>
          <tr>
            <td style={{ width: '14%', fontWeight: 'bold', padding: '4px 0' }}>Judul Audit</td>
            <td style={{ width: '36%', padding: '4px 0' }}>: <strong>{session.judul}</strong></td>
            <td style={{ width: '14%', fontWeight: 'bold', padding: '4px 0' }}>No. Sesi SO</td>
            <td style={{ width: '36%', padding: '4px 0' }}>: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>SO-MTC-{session.id}</span> ({session.status})</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 'bold', padding: '4px 0' }}>Lokasi Audit</td>
            <td style={{ padding: '4px 0' }}>: {session.lokasi || 'Semua Rak Gudang MTC'}</td>
            <td style={{ fontWeight: 'bold', padding: '4px 0' }}>Tanggal Cetak</td>
            <td style={{ padding: '4px 0' }}>: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
          </tr>
        </tbody>
      </table>

      {/* Summary Box */}
      <div style={{ border: '1px solid #000', borderRadius: 4, padding: 12, marginBottom: 20, background: '#f9fafb' }}>
        <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 8, borderBottom: '1px solid #d1d5db', paddingBottom: 4, letterSpacing: '0.5px' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginTop: 40, pageBreakInside: 'avoid' }}>
        <div style={{ width: '38%' }}>
          <div style={{ fontSize: 11, marginBottom: 50 }}>Dihitung Oleh,</div>
          <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 4 }}>
            ( ......................................... )
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Admin Maintenance</div>
        </div>

        <div style={{ width: '38%' }}>
          <div style={{ fontSize: 11, marginBottom: 50 }}>Diketahui Oleh,</div>
          <div style={{ borderBottom: '1px solid #000', fontWeight: 'bold', paddingBottom: 4 }}>
            ( ......................................... )
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Manufacturing Manager</div>
        </div>
      </div>
    </div>
  );
}
