'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

interface SparepartValuationItem {
  id: string;
  nama: string;
  uom: string;
  lokasi: string;
  currentStock: number;
  price: number;
  valuation: number;
}

interface Props {
  initialItems: SparepartValuationItem[];
}

export default function ValuationBreakdownTable({ initialItems }: Props) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return initialItems;
    return initialItems.filter(
      (item) =>
        item.id.toLowerCase().includes(query) ||
        item.nama.toLowerCase().includes(query) ||
        item.lokasi.toLowerCase().includes(query)
    );
  }, [search, initialItems]);

  // Reset page to 1 when search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Calculate pagination details
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const displayedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage]);

  const fmtRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="card">
      <div className="card-header" style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--br)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div className="card-title" style={{ fontSize: 16 }}>Daftar Rincian Aset</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="text"
            className="input"
            placeholder="Cari ID, Nama, atau Lokasi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 260, padding: '8px 12px', fontSize: 13 }}
          />
        </div>
      </div>

      <div className="table-responsive">
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--br)', background: 'var(--sf)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'center', width: 60, fontSize: 12, fontWeight: 700, color: 'var(--tx3)' }}>NO</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', width: 140, fontSize: 12, fontWeight: 700, color: 'var(--tx3)' }}>ID SUKU CADANG</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--tx3)' }}>NAMA SUKU CADANG</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', width: 120, fontSize: 12, fontWeight: 700, color: 'var(--tx3)' }}>LOKASI</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', width: 120, fontSize: 12, fontWeight: 700, color: 'var(--tx3)' }}>STOK AKTIF</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', width: 150, fontSize: 12, fontWeight: 700, color: 'var(--tx3)' }}>HARGA MASTER</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', width: 180, fontSize: 12, fontWeight: 700, color: 'var(--tx3)' }}>NILAI ASET</th>
            </tr>
          </thead>
          <tbody>
            {displayedItems.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--tx3)', fontSize: 14 }}>
                  Tidak ada data suku cadang yang cocok dengan pencarian Anda.
                </td>
              </tr>
            ) : (
              displayedItems.map((item, index) => {
                const globalIndex = (currentPage - 1) * itemsPerPage + index + 1;
                // Highlight outliers with valuation > 10,000,000 IDR (likely candidates for typos)
                const isOutlier = item.valuation >= 10000000;

                return (
                  <tr key={item.id} style={{
                    borderBottom: '1px solid var(--br)',
                    background: isOutlier ? 'rgba(239,83,80,0.03)' : 'inherit',
                    transition: 'background 0.15s ease'
                  }}>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, color: 'var(--tx2)' }}>
                      {globalIndex}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>
                      <Link href={`/mtc/master?search=${item.id}`} className="link" style={{ textDecoration: 'none', color: 'var(--blu)' }}>
                        {item.id}
                      </Link>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontWeight: 500, color: 'var(--tx)' }}>{item.nama}</span>
                        {isOutlier && (
                          <span style={{ fontSize: 11, color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                            ⚠️ Nilai aset tinggi (&gt; Rp 10 Juta) - Harap periksa jika ada salah input Harga/Stok
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--tx2)' }}>
                      {item.lokasi}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>
                      {item.currentStock} {item.uom}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: 'var(--tx2)' }}>
                      {fmtRupiah(item.price)}
                    </td>
                    <td style={{
                      padding: '12px 16px',
                      textAlign: 'right',
                      fontSize: 13,
                      fontWeight: 700,
                      color: isOutlier ? 'var(--red)' : 'var(--grn)'
                    }}>
                      {fmtRupiah(item.valuation)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--br)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ fontSize: 13, color: 'var(--tx3)' }}>
            Menampilkan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredItems.length)} dari {filteredItems.length} item
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{ padding: '6px 12px' }}
            >
              Sebelumnya
            </button>
            <span style={{ fontSize: 13, color: 'var(--tx2)', padding: '0 8px' }}>
              Halaman {currentPage} dari {totalPages}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{ padding: '6px 12px' }}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
