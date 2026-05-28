'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { GaDashboardInsights, GaDashboardItemRow } from '@/lib/ga/dashboardInsights';

const links = [
  { href: '/ga/database', title: 'Database Barang', desc: 'Master barang & import dari Excel' },
  { href: '/ga/stock-in', title: 'Stock In', desc: 'Restock barang terdaftar atau barang baru' },
  { href: '/ga/stock-out', title: 'Stock Out', desc: 'Pengeluaran barang dengan nama PIC' },
  { href: '/ga/opname', title: 'Stock Opname', desc: 'Hitung fisik, bandingkan sistem, posting selisih' },
  { href: '/ga/stock', title: 'Stok & Lokasi', desc: 'Lihat stok per rak dan status' },
  { href: '/ga/history', title: 'Riwayat', desc: 'Gerakan stok IN / OUT' },
  { href: '/ga/reports', title: 'Export CSV', desc: 'Inbound, outbound, laporan ringkas' },
];

function statusBadge(status: GaDashboardItemRow['status']) {
  if (status === 'habis') return <span className="badge badge-red">Habis</span>;
  if (status === 'low') return <span className="badge badge-ylw">Understock</span>;
  return <span className="badge badge-grn">Aman</span>;
}

function InsightTable({
  rows,
  emptyText,
  showOutCols,
}: {
  rows: GaDashboardItemRow[];
  emptyText: string;
  showOutCols: boolean;
}) {
  if (rows.length === 0) {
    return <p className="ga-insight-empty">{emptyText}</p>;
  }
  return (
    <div className="table-wrap ga-insight-table">
      <table>
        <thead>
          <tr>
            <th>Barang</th>
            <th>Stok</th>
            <th>Min</th>
            {showOutCols && (
              <>
                <th>Keluar</th>
                <th>Trx</th>
              </>
            )}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="ga-insight-name">{r.nama}</div>
                <div className="ga-insight-meta">
                  {r.kodeBarang || r.id}
                  {r.lokasi !== '—' ? ` · ${r.lokasi}` : ''}
                </div>
              </td>
              <td>
                <strong>{r.currentStock}</strong> {r.uom}
              </td>
              <td>{r.minQty}</td>
              {showOutCols && (
                <>
                  <td>{r.outQtyPeriod}</td>
                  <td>{r.outCountPeriod}</td>
                </>
              )}
              <td>{statusBadge(r.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GaDashboardPage() {
  const [insights, setInsights] = useState<GaDashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ga/dashboard?days=90&limit=10')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setInsights(j.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const periodLabel = insights ? `${insights.periodDays} hari terakhir` : '90 hari terakhir';

  return (
    <>
      <div className="page-header">
        <div className="page-title">Dashboard GA</div>
        <div className="page-sub">Ringkasan stok, pergerakan keluar, dan akses cepat modul</div>
      </div>

      <div className="page-body">
        <div className="ga-insight-grid">
          <div className="card ga-insight-card ga-insight-card--hot">
            <div className="card-header ga-insight-card-header">
              <div>
                <div className="card-title">Sering keluar</div>
                <div className="ga-insight-desc">Barang dengan qty keluar tertinggi · {periodLabel}</div>
              </div>
              <Link href="/ga/stock-out" className="btn btn-ghost btn-sm">
                Stock Out
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {loading ? (
                <div className="ga-loading" style={{ padding: 24 }}>
                  Memuat…
                </div>
              ) : (
                <InsightTable
                  rows={insights?.frequentOut ?? []}
                  emptyText="Belum ada pengeluaran stok pada periode ini."
                  showOutCols
                />
              )}
            </div>
          </div>

          <div className="card ga-insight-card ga-insight-card--low">
            <div className="card-header ga-insight-card-header">
              <div>
                <div className="card-title">Understock</div>
                <div className="ga-insight-desc">Stok di bawah min qty atau habis</div>
              </div>
              <Link href="/ga/stock?status=kritis" className="btn btn-ghost btn-sm">
                Lihat Stok
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {loading ? (
                <div className="ga-loading" style={{ padding: 24 }}>
                  Memuat…
                </div>
              ) : (
                <InsightTable
                  rows={insights?.understock ?? []}
                  emptyText="Semua barang di atas batas min qty."
                  showOutCols={false}
                />
              )}
            </div>
          </div>

          <div className="card ga-insight-card ga-insight-card--rare">
            <div className="card-header ga-insight-card-header">
              <div>
                <div className="card-title">Jarang keluar</div>
                <div className="ga-insight-desc">Barang dengan keluaran paling sedikit · {periodLabel}</div>
              </div>
              <Link href="/ga/history" className="btn btn-ghost btn-sm">
                Riwayat
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {loading ? (
                <div className="ga-loading" style={{ padding: 24 }}>
                  Memuat…
                </div>
              ) : (
                <InsightTable
                  rows={insights?.rareOut ?? []}
                  emptyText="Tidak ada data barang aktif."
                  showOutCols
                />
              )}
            </div>
          </div>
        </div>

        <div className="ga-dash-section-title">Menu cepat</div>
        <div className="stats-grid">
          {links.map((item) => (
            <Link key={item.href} href={item.href} className="card ga-dash-card">
              <strong>{item.title}</strong>
              <p>{item.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
