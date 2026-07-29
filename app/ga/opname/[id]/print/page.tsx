'use client';

import React, { useState, useEffect } from 'react';

export default function GaOpnamePrintPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPrintData() {
      try {
        const res = await fetch(`/api/ga/opname/${sessionId}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch (e) {
        console.error('Error loading GA print data:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchPrintData();
  }, [sessionId]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}>⏳ Memuat dokumen cetak Form Stock Opname GA...</div>;
  }

  if (!data || !data.session) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Dokumen Stock Opname GA tidak ditemukan.</div>;
  }

  const { session, lines } = data;
  const totalItems = lines.length;
  const countedItems = lines.filter((l: any) => l.counted);
  const totalMatchingCount = lines.filter((l: any) => l.counted && l.selisih === 0).length;
  const minusLines = lines.filter((l: any) => l.counted && l.selisih !== null && l.selisih < 0);
  const plusLines = lines.filter((l: any) => l.counted && l.selisih !== null && l.selisih > 0);
  const totalMinusQty = minusLines.reduce((acc: number, l: any) => acc + Math.abs(l.selisih!), 0);
  const totalPlusQty = plusLines.reduce((acc: number, l: any) => acc + l.selisih!, 0);
  const accuracyPct = totalItems > 0 ? ((totalMatchingCount / (countedItems.length || totalItems)) * 100).toFixed(1) : '0';

  return (
    <div style={{
      background: '#fff',
      color: '#000',
      fontFamily: 'Arial, sans-serif',
      padding: 30,
      maxWidth: 1050,
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

      {/* Action Header Button for Printing */}
      <div className="no-print" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          onClick={() => window.history.back()}
          style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #ccc', cursor: 'pointer', background: '#f3f4f6' }}
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

      {/* Official Kop Surat Header Table matching FLG FORM Standard */}
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
            <td style={{ width: '25%', border: '1px solid #000', padding: '4px 8px', color: '#000', fontWeight: 'bold', fontFamily: 'monospace' }}>
              FLG/FORM/GA/013-00
            </td>
          </tr>

          <tr>
            {/* Row 2 Center: Cikupa Factory / General Affairs */}
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 11, color: '#000' }}>
              Cikupa Factory — General Affairs
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
            {/* Row 3 Center: FORM STOCK OPNAME GA */}
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 12, color: '#000', textTransform: 'uppercase' }}>
              FORM STOCK OPNAME GA
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
      <table style={{ width: '100%', marginBottom: 16, fontSize: 11, borderCollapse: 'collapse', background: '#fff' }}>
        <tbody>
          <tr>
            <td style={{ width: '14%', fontWeight: 'bold', padding: '4px 0' }}>Nama Periode</td>
            <td style={{ width: '36%', padding: '4px 0' }}>: <strong>{session.periodeNama}</strong></td>
            <td style={{ width: '14%', fontWeight: 'bold', padding: '4px 0' }}>No. Sesi SO</td>
            <td style={{ width: '36%', padding: '4px 0' }}>: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>SO-GA-{session.id}</span> ({session.status === 'posted' ? 'TER-POSTING' : 'DRAFT / PROSES AUDIT'})</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 'bold', padding: '4px 0' }}>Cakupan Audit</td>
            <td style={{ padding: '4px 0' }}>: {session.lokasi || 'Semua Gedung / Lokasi GA'}</td>
            <td style={{ fontWeight: 'bold', padding: '4px 0' }}>Tanggal Cetak</td>
            <td style={{ padding: '4px 0' }}>: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
          </tr>
        </tbody>
      </table>

      {/* Summary Box */}
      <div style={{ border: '1px solid #000', borderRadius: 4, padding: 12, marginBottom: 18, background: '#f9fafb' }}>
        <div style={{ fontWeight: 'bold', fontSize: 11, marginBottom: 8, borderBottom: '1px solid #d1d5db', paddingBottom: 4, letterSpacing: '0.5px' }}>
          📊 REKAPITULASI PERHITUNGAN STOK FISIK VS SISTEM GA
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, textAlign: 'center', fontSize: 11 }}>
          <div>
            <div style={{ color: '#666' }}>Total Item Audit</div>
            <div style={{ fontWeight: 'bold', fontSize: 14 }}>{totalItems} Item</div>
            <div style={{ fontSize: 9, color: '#555' }}>({countedItems.length} Selesai Hitung)</div>
          </div>
          <div>
            <div style={{ color: '#0284c7' }}>🎯 Akurasi Hitung</div>
            <div style={{ fontWeight: 'bold', fontSize: 14, color: '#0284c7' }}>{accuracyPct}%</div>
            <div style={{ fontSize: 9, color: '#0284c7' }}>({totalMatchingCount} Cocok Sesuai)</div>
          </div>
          <div>
            <div style={{ color: '#16a34a' }}>🟢 Sesuai (Selisih 0)</div>
            <div style={{ fontWeight: 'bold', fontSize: 14, color: '#16a34a' }}>{totalMatchingCount} Item</div>
          </div>
          <div>
            <div style={{ color: '#dc2626' }}>🔴 Total Minus (-Qty)</div>
            <div style={{ fontWeight: 'bold', fontSize: 14, color: '#dc2626' }}>-{totalMinusQty} Pcs</div>
            <div style={{ fontSize: 9, color: '#dc2626' }}>({minusLines.length} Item Shortage)</div>
          </div>
          <div>
            <div style={{ color: '#2563eb' }}>🔵 Total Plus (+Qty)</div>
            <div style={{ fontWeight: 'bold', fontSize: 14, color: '#2563eb' }}>+{totalPlusQty} Pcs</div>
            <div style={{ fontSize: 9, color: '#2563eb' }}>({plusLines.length} Item Surplus)</div>
          </div>
        </div>
      </div>

      {/* Detailed Items Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginBottom: 30 }}>
        <thead>
          <tr style={{ background: '#e5e7eb', textAlign: 'left' }}>
            <th style={{ border: '1px solid #9ca3af', padding: 6, width: 24, textAlign: 'center' }}>No</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Kode</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Nama Barang GA</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Lokasi / Gedung</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right' }}>Qty Sistem</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right' }}>Qty Fisik</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right' }}>Selisih</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'center' }}>PIC Hitung</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((item: any, idx: number) => {
            const selisih = item.selisih;
            let statusStyle = {};
            let selisihText = '—';

            if (item.counted) {
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
                <td style={{ border: '1px solid #d1d5db', padding: 5, fontFamily: 'monospace' }}>{item.kodeBarang || item.itemId}</td>
                <td style={{ border: '1px solid #d1d5db', padding: 5 }}>
                  <strong>{item.nama}</strong>
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: 5 }}>{item.lokasi || '—'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'right' }}>{item.qtySistem} {item.uom}</td>
                <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'right', fontWeight: 'bold' }}>
                  {item.qtyFisik !== null && item.qtyFisik !== undefined ? `${item.qtyFisik} ${item.uom}` : '—'}
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'right', ...statusStyle }}>
                  {selisihText}
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'center', fontSize: 9 }}>{item.picNama || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Official Approval Signature Block (4 Columns: Penghitung, GA, Diketahui Supervisor GA, Disetujui Manufacture Manager) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        textAlign: 'center',
        marginTop: 40,
        pageBreakInside: 'avoid'
      }}>
        {/* Column 1: Penghitung */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 6px', background: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 2 }}>Dihitung Oleh,</div>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 40 }}>Penghitung (Staff Audit)</div>
          <div style={{ borderBottom: '1px solid #000', margin: '0 12px', paddingBottom: 4 }}>
            ( ......................................... )
          </div>
          <div style={{ fontSize: 9, color: '#374151', marginTop: 4 }}>Nama & Tanggal</div>
        </div>

        {/* Column 2: GA */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 6px', background: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 2 }}>Disiapkan Oleh,</div>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 40 }}>GA (Staff General Affairs)</div>
          <div style={{ borderBottom: '1px solid #000', margin: '0 12px', paddingBottom: 4 }}>
            ( ......................................... )
          </div>
          <div style={{ fontSize: 9, color: '#374151', marginTop: 4 }}>Nama & Tanggal</div>
        </div>

        {/* Column 3: Supervisor GA */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 6px', background: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 2 }}>Diketahui Oleh,</div>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 40 }}>Supervisor GA</div>
          <div style={{ borderBottom: '1px solid #000', margin: '0 12px', paddingBottom: 4 }}>
            ( ......................................... )
          </div>
          <div style={{ fontSize: 9, color: '#374151', marginTop: 4 }}>Nama & Tanggal</div>
        </div>

        {/* Column 4: Manufacture Manager */}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 6px', background: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: '#111827', marginBottom: 2 }}>Disetujui Oleh,</div>
          <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 40 }}>Manufacture Manager</div>
          <div style={{ borderBottom: '1px solid #000', margin: '0 12px', paddingBottom: 4 }}>
            ( ......................................... )
          </div>
          <div style={{ fontSize: 9, color: '#374151', marginTop: 4 }}>Nama & Tanggal</div>
        </div>
      </div>
    </div>
  );
}
