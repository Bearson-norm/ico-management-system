'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { compareLocations } from '@/lib/utils';

export default function GaOpnamePrintPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showSystemQtyInForm, setShowSystemQtyInForm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');

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

  const lines = data?.lines || [];

  const locations = useMemo(() => {
    const uniq = Array.from(
      new Set(lines.map((l: any) => (l.lokasi || '').trim() || '—'))
    ) as string[];
    return uniq.sort((a, b) => compareLocations(a, b));
  }, [lines]);

  const filteredLines = useMemo(() => {
    return lines
      .filter((item: any) => {
        if (selectedLocation !== 'ALL') {
          const loc = (item.lokasi || '').trim() || '—';
          return loc === selectedLocation;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const locDiff = compareLocations(a.lokasi, b.lokasi);
        if (locDiff !== 0) return locDiff;
        return (a.nama || '').trim().localeCompare((b.nama || '').trim(), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      });
  }, [lines, selectedLocation]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>⏳</div>
        <strong>Memuat dokumen cetak Form Stock Opname GA...</strong>
      </div>
    );
  }

  if (!data || !data.session) {
    return (
      <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <h2>Dokumen Stock Opname GA tidak ditemukan atau Anda tidak memiliki akses.</h2>
        <Link href="/ga/opname" style={{ color: '#2563eb', textDecoration: 'underline' }}>
          ← Kembali ke Daftar Opname
        </Link>
      </div>
    );
  }

  const { session } = data;
  const statusLabel =
    session.status === 'posted'
      ? 'TER-POSTING'
      : session.status === 'waiting_approval'
        ? 'MENUNGGU ACC'
        : 'DRAFT';

  return (
    <div className="ga-print-container">
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }

        body {
          background: #fff !important;
          color: #000 !important;
          font-family: Arial, Helvetica, sans-serif !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .ga-print-container {
          background: #fff !important;
          color: #000 !important;
          font-family: Arial, Helvetica, sans-serif !important;
          padding: 16px 20px;
          max-width: 1000px;
          margin: 0 auto;
          font-size: 10px;
          box-sizing: border-box;
        }

        .ga-print-container * {
          color: #000 !important;
          box-sizing: border-box;
        }

        .ga-print-container table {
          width: 100%;
          border-collapse: collapse;
        }

        .ga-print-container td,
        .ga-print-container th {
          background-color: #fff !important;
          color: #000 !important;
        }

        .ga-print-container tr.table-header th {
          background-color: #f1f5f9 !important;
          font-weight: bold;
          color: #000 !important;
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
          .ga-print-container {
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
            href={`/ga/opname/${sessionId}`}
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
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showSystemQtyInForm}
              onChange={e => setShowSystemQtyInForm(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Tampilkan Kolom Stok Sistem</span>
          </label>

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
              <option value="ALL">Semua Gedung / Lokasi ({lines.length} Item)</option>
              {locations.map((loc: string) => (
                <option key={loc} value={loc}>
                  {loc === '-' || loc === '—' || !loc ? 'Tanpa lokasi (—)' : `Gedung: ${loc}`}
                </option>
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

      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #000', marginBottom: 12, fontSize: 10.5 }}>
        <tbody>
          <tr>
            <td rowSpan={3} style={{ width: '20%', border: '1px solid #000', padding: 6, textAlign: 'center', verticalAlign: 'middle', background: '#fff' }}>
              <img src="/logo.png" alt="FOOM" style={{ maxHeight: 38, maxWidth: '95%', objectFit: 'contain' }} />
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 11.5 }}>
              PT. FOOM Lab Global
            </td>
            <td style={{ width: '14%', border: '1px solid #000', padding: '4px 6px' }}>
              No. Dokumen
            </td>
            <td style={{ width: '24%', border: '1px solid #000', padding: '4px 6px', fontWeight: 'bold', fontFamily: 'monospace' }}>
              FLG/FORM/GA/013-00
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 10.5 }}>
              Cikupa Factory
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>
              Revisi
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>
              00
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase' }}>
              LEMBAR KERJA STOCK OPNAME GA (FORM FISIK)
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>
              Tanggal
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 6px' }}>
              {session.tanggal ? new Date(session.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', marginBottom: 8, fontSize: 10.5, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ width: '14%', fontWeight: 'bold', padding: '2px 0' }}>Nama Periode</td>
            <td style={{ width: '36%', padding: '2px 0' }}>: <strong>{session.periodeNama}</strong></td>
            <td style={{ width: '14%', fontWeight: 'bold', padding: '2px 0' }}>No. Sesi SO</td>
            <td style={{ width: '36%', padding: '2px 0' }}>: <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>SO-GA-{session.id}</span> ({statusLabel})</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 'bold', padding: '2px 0' }}>Cakupan Audit</td>
            <td style={{ padding: '2px 0' }}>
              : {selectedLocation !== 'ALL'
                ? `Gedung: ${selectedLocation}`
                : (session.lokasi || 'Semua Gedung / Lokasi GA')}
            </td>
            <td style={{ fontWeight: 'bold', padding: '2px 0' }}>Tanggal Cetak</td>
            <td style={{ padding: '2px 0' }}>: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
          </tr>
        </tbody>
      </table>

      <div style={{
        border: '1px dashed #475569',
        borderRadius: 4,
        padding: '4px 8px',
        marginBottom: 8,
        background: '#f8fafc',
        fontSize: 9.5,
        lineHeight: 1.3
      }}>
        <strong>📌 Petunjuk Pengisian:</strong> Hitung fisik aktual di gedung & tulis pada kolom <strong>Qty Fisik</strong>. Centang kondisi (B = Baik, R = Rusak). Tulis barang temuan baru pada baris kosong di bawah.
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5, marginBottom: 16 }}>
        <thead>
          <tr className="table-header" style={{ background: '#f1f5f9', textAlign: 'left' }}>
            <th style={{ border: '1px solid #000', padding: '5px 4px', width: 26, textAlign: 'center' }}>No</th>
            <th style={{ border: '1px solid #000', padding: '5px 6px', width: 85 }}>Kode Barang</th>
            <th style={{ border: '1px solid #000', padding: '5px 6px' }}>Nama Barang GA</th>
            <th style={{ border: '1px solid #000', padding: '5px 6px', width: 90, textAlign: 'center' }}>Lokasi / Gedung</th>
            <th style={{ border: '1px solid #000', padding: '5px 4px', width: 44, textAlign: 'center' }}>Satuan</th>
            {showSystemQtyInForm && (
              <th style={{ border: '1px solid #000', padding: '5px 4px', width: 55, textAlign: 'right' }}>Stok Sistem</th>
            )}
            <th style={{ border: '2px solid #000', padding: '5px 4px', width: 68, textAlign: 'center', background: '#fff' }}>
              QTY FISIK
            </th>
            <th style={{ border: '1px solid #000', padding: '5px 4px', width: 68, textAlign: 'center' }}>Kondisi</th>
            <th style={{ border: '1px solid #000', padding: '5px 6px', width: 110 }}>Catatan</th>
          </tr>
        </thead>
        <tbody>
          {filteredLines.map((item: any, idx: number) => (
            <tr key={item.id} style={{ height: 25, background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
              <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{idx + 1}</td>
              <td style={{ border: '1px solid #000', padding: '3px 6px', fontFamily: 'monospace', fontSize: 9 }}>{item.kodeBarang || item.itemId || '—'}</td>
              <td style={{ border: '1px solid #000', padding: '3px 6px' }}>
                <strong>{item.nama}</strong>
              </td>
              <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{item.lokasi || '—'}</td>
              <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>{item.uom || 'Pcs'}</td>
              {showSystemQtyInForm && (
                <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'right', fontWeight: 'bold' }}>{item.qtySistem}</td>
              )}
              <td style={{ border: '2px solid #000', padding: '3px 4px', textAlign: 'center', background: '#fff' }}>
              </td>
              <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontSize: 8.5, whiteSpace: 'nowrap' }}>
                [ ] B &nbsp; [ ] R
              </td>
              <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
            </tr>
          ))}

          {[1, 2, 3, 4, 5].map((blankIdx) => (
            <tr key={`blank-${blankIdx}`} style={{ height: 27, background: '#fff' }}>
              <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', color: '#888' }}>{filteredLines.length + blankIdx}</td>
              <td style={{ border: '1px solid #000', padding: '3px 6px', color: '#888', fontStyle: 'italic', fontSize: 8.5 }}>[Item Baru]</td>
              <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
              <td style={{ border: '1px solid #000', padding: '3px 4px' }}></td>
              <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>Pcs</td>
              {showSystemQtyInForm && (
                <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'right', color: '#888' }}>0</td>
              )}
              <td style={{ border: '2px solid #000', padding: '3px 4px', textAlign: 'center' }}></td>
              <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontSize: 8.5, whiteSpace: 'nowrap' }}>
                [ ] B &nbsp; [ ] R
              </td>
              <td style={{ border: '1px solid #000', padding: '3px 6px' }}></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8,
        textAlign: 'center',
        marginTop: 24,
        pageBreakInside: 'avoid'
      }}>
        {[
          { title: 'Dihitung Oleh,', role: 'Penghitung (Staff Audit)' },
          { title: 'Disiapkan Oleh,', role: 'GA (Staff General Affairs)' },
          { title: 'Diketahui Oleh,', role: 'Supervisor GA' },
          { title: 'Disetujui Oleh,', role: 'Manufacture Manager' },
        ].map((col) => (
          <div key={col.title} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 6px', background: '#fff' }}>
            <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 2 }}>{col.title}</div>
            <div style={{ fontSize: 10, marginBottom: 40 }}>{col.role}</div>
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              gap: 3,
              margin: '0 4px',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ fontSize: 11, lineHeight: 1, flexShrink: 0 }}>(</span>
              <span style={{
                flex: 1,
                minWidth: 24,
                borderBottom: '1px solid #000',
                height: 14,
              }} />
              <span style={{ fontSize: 11, lineHeight: 1, flexShrink: 0 }}>)</span>
            </div>
            <div style={{ fontSize: 9, marginTop: 4 }}>Nama & Tanggal</div>
          </div>
        ))}
      </div>
    </div>
  );
}
