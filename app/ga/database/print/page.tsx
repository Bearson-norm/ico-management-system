'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type GaItem = {
  id: string;
  nama: string;
  kodeBarang: string | null;
  lokasi: string;
  harga: number;
  minQty: number;
  currentStock: number;
  kategori: string;
  status: 'safe' | 'low' | 'habis' | 'overstock';
};

function statusLabel(status: GaItem['status']) {
  if (status === 'habis') return 'Habis';
  if (status === 'low') return 'Understock';
  if (status === 'overstock') return 'Overstock';
  return 'Aman';
}

function fmtRp(n: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}

function GaDatabasePrintContent() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<GaItem[]>([]);
  const [loading, setLoading] = useState(true);

  const query = searchParams.toString();

  useEffect(() => {
    async function fetchPrintData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/ga/stock${query ? `?${query}` : ''}`);
        const json = await res.json();
        if (json.success) setItems(json.data);
      } catch (e) {
        console.error('Error loading GA daftar barang print data:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchPrintData();
  }, [query]);

  const printedAt = useMemo(
    () =>
      new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        dateStyle: 'long',
        timeStyle: 'short',
      }),
    []
  );

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const lokasi = searchParams.get('lokasi');
    const kategoriId = searchParams.get('kategoriId');
    const aktif = searchParams.get('aktif') ?? 'true';

    if (search) parts.push(`Cari: ${search}`);
    if (status === 'safe') parts.push('Status stok: Aman');
    else if (status === 'low') parts.push('Status stok: Understock');
    else if (status === 'habis') parts.push('Status stok: Habis');
    else if (status === 'overstock') parts.push('Status stok: Overstock');
    else if (status === 'kritis') parts.push('Status stok: Kritis');
    if (lokasi) parts.push(`Lokasi: ${lokasi}`);
    if (kategoriId) {
      parts.push(`Kategori: ${items[0]?.kategori || kategoriId}`);
    }
    if (aktif === 'false') parts.push('Status barang: Nonaktif saja');
    else if (aktif === 'all') parts.push('Status barang: Semua');
    else parts.push('Status barang: Aktif saja');

    return parts.join(' · ');
  }, [searchParams, items]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#000' }}>
        Memuat daftar barang GA...
      </div>
    );
  }

  return (
    <div
      className="ga-print-container"
      style={{
        background: '#fff',
        color: '#000',
        fontFamily: 'Arial, sans-serif',
        padding: 30,
        maxWidth: 1050,
        margin: '0 auto',
        fontSize: 12,
      }}
    >
      <style jsx global>{`
        body {
          background: #fff !important;
          color: #000 !important;
        }
        .ga-print-container td,
        .ga-print-container th,
        .ga-print-container span,
        .ga-print-container div,
        .ga-print-container p,
        .ga-print-container strong {
          color: #000 !important;
        }

        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        @media print {
          body {
            background: #fff !important;
            color: #000 !important;
          }
          .no-print {
            display: none !important;
          }
          .ga-print-container {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      <div
        className="no-print"
        style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <button
          type="button"
          onClick={() => window.history.back()}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #ccc',
            cursor: 'pointer',
            background: '#f3f4f6',
            color: '#000',
          }}
        >
          ← Kembali
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={items.length === 0}
          style={{
            padding: '10px 20px',
            borderRadius: 6,
            background: items.length === 0 ? '#9ca3af' : '#2563eb',
            color: '#fff',
            fontWeight: 'bold',
            border: 'none',
            cursor: items.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          Cetak / Save to PDF
        </button>
      </div>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #000',
          marginBottom: 16,
          fontFamily: 'Arial, sans-serif',
          fontSize: 11,
        }}
      >
        <tbody>
          <tr>
            <td
              rowSpan={3}
              style={{
                width: '22%',
                border: '1px solid #000',
                padding: 8,
                textAlign: 'center',
                verticalAlign: 'middle',
                background: '#fff',
              }}
            >
              <img
                src="/logo.png"
                alt="FOOM"
                style={{ maxHeight: 42, maxWidth: '100%', objectFit: 'contain' }}
              />
            </td>
            <td
              colSpan={2}
              style={{
                border: '1px solid #000',
                padding: '4px 8px',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: 12,
              }}
            >
              PT. FOOM Lab Global
            </td>
          </tr>
          <tr>
            <td
              colSpan={2}
              style={{
                border: '1px solid #000',
                padding: '4px 8px',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: 11,
              }}
            >
              Cikupa Factory
            </td>
          </tr>
          <tr>
            <td
              colSpan={2}
              style={{
                border: '1px solid #000',
                padding: '4px 8px',
                textAlign: 'center',
                fontWeight: 'bold',
                fontSize: 12,
                textTransform: 'uppercase',
              }}
            >
              DAFTAR BARANG GA
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', marginBottom: 16, fontSize: 11, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ width: '16%', fontWeight: 'bold', padding: '4px 0' }}>Tanggal Cetak</td>
            <td style={{ width: '34%', padding: '4px 0' }}>: {printedAt} WIB</td>
            <td style={{ width: '16%', fontWeight: 'bold', padding: '4px 0' }}>Jumlah Barang</td>
            <td style={{ width: '34%', padding: '4px 0' }}>: {items.length}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 'bold', padding: '4px 0', verticalAlign: 'top' }}>Filter</td>
            <td colSpan={3} style={{ padding: '4px 0' }}>
              : {filterSummary || 'Semua barang aktif'}
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginBottom: 30 }}>
        <thead>
          <tr style={{ background: '#e5e7eb', textAlign: 'left' }}>
            <th style={{ border: '1px solid #9ca3af', padding: 6, width: 28, textAlign: 'center' }}>No</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Kode</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Nama Barang</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Lokasi</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right' }}>Min</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right' }}>Stok</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6, textAlign: 'right' }}>Harga</th>
            <th style={{ border: '1px solid #9ca3af', padding: 6 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ border: '1px solid #d1d5db', padding: 12, textAlign: 'center' }}>
                Tidak ada barang yang cocok dengan filter.
              </td>
            </tr>
          ) : (
            items.map((it, idx) => (
              <tr key={it.id} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'center' }}>{idx + 1}</td>
                <td style={{ border: '1px solid #d1d5db', padding: 5, fontFamily: 'monospace' }}>
                  {it.kodeBarang || '—'}
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: 5 }}>
                  <strong>{it.nama}</strong>
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: 5 }}>{it.lokasi}</td>
                <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'right' }}>{it.minQty}</td>
                <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'right' }}>{it.currentStock}</td>
                <td style={{ border: '1px solid #d1d5db', padding: 5, textAlign: 'right' }}>{fmtRp(it.harga)}</td>
                <td style={{ border: '1px solid #d1d5db', padding: 5 }}>{statusLabel(it.status)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function GaDatabasePrintPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40, textAlign: 'center', color: '#000' }}>
          Memuat daftar barang GA...
        </div>
      }
    >
      <GaDatabasePrintContent />
    </Suspense>
  );
}
