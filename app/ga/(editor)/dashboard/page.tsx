'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const links = [
  { href: '/ga/database', title: 'Database Barang', desc: 'Master barang & import dari Excel' },
  { href: '/ga/stock-in', title: 'Stock In', desc: 'Restock barang terdaftar atau barang baru' },
  { href: '/ga/stock-out', title: 'Stock Out', desc: 'Pengeluaran barang dengan nama PIC' },
  { href: '/ga/opname', title: 'Stock Opname', desc: 'Hitung fisik, bandingkan sistem, posting selisih' },
  { href: '/ga/stock', title: 'Stok & Lokasi', desc: 'Lihat stok per rak dan status' },
  { href: '/ga/history', title: 'Riwayat', desc: 'Gerakan stok IN / OUT' },
  { href: '/ga/reports', title: 'Export CSV', desc: 'Inbound, outbound, laporan ringkas' },
];

function fmtRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export default function GaDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingLog, setRefreshingLog] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [days, setDays] = useState(7); // Default to 7 days (1 week)

  const outboundMovements = data?.recentMovements?.filter((m: any) => m.tipe === 'OUT') || [];
  const inboundMovements = data?.recentMovements?.filter((m: any) => m.tipe === 'IN') || [];

  useEffect(() => {
    if (!data) {
      setLoading(true);
    } else {
      setRefreshingLog(true);
    }
    fetch(`/api/ga/dashboard?days=${days}`)
      .then((r) => r.json())
      .then((j) => {
        console.log('[GA Dashboard] API response:', j);
        if (j.success) {
          setData(j.data);
        } else {
          setApiError(j.error || 'API returned error');
          console.error('[GA Dashboard] API error:', j.error);
        }
      })
      .catch((e) => {
        setApiError(e.message);
        console.error('[GA Dashboard] Fetch error:', e);
      })
      .finally(() => {
        setLoading(false);
        setRefreshingLog(false);
      });
  }, [days]);

  if (loading) return <div className="ga-loading">Memuat data dashboard GA…</div>;
  if (apiError) return (
    <div style={{ padding: '40px', color: '#f87171', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', margin: '24px', border: '1px solid rgba(239,68,68,0.3)' }}>
      <strong>Error memuat dashboard:</strong> {apiError}
      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>Buka Console browser (F12) untuk detail lengkap.</div>
    </div>
  );

  return (
    <>
      <div className="page-header" style={{ position: 'relative' }}>
        <div className="flex-between">
          <div>
            <div className="page-title">Dashboard Overview</div>
            <div className="page-sub">Modul GA — Ringkasan aset & log pergerakan stok</div>
          </div>
          
          {/* Quick Menu Dropdown */}
          <div className="ga-page-actions" style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                borderColor: 'var(--ga-accent)',
                color: 'var(--ga-accent)',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                height: '40px',
              }}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              Menu ☰
            </button>
            {menuOpen && (
              <div
                className="card"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 8px)',
                  width: 260,
                  zIndex: 200,
                  padding: '8px',
                  boxShadow: 'var(--ga-shadow)',
                  background: 'var(--ga-sf)',
                  border: '1px solid var(--ga-br)',
                }}
              >
                <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 'bold', color: 'var(--ga-tx3)', textTransform: 'uppercase', borderBottom: '1px solid var(--ga-br)', marginBottom: '6px' }}>
                  Akses Cepat
                </div>
                {links.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="nav-item"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '8px 12px',
                      borderRadius: 'var(--ga-rs)',
                      fontSize: '13px',
                      marginBottom: '2px',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => setMenuOpen(false)}
                  >
                    <strong style={{ color: 'var(--ga-tx)' }}>{item.title}</strong>
                    <span style={{ fontSize: '10px', color: 'var(--ga-tx2)', marginTop: '2px' }}>{item.desc}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* ==================== BANNER HERO: ESTIMASI ASET & METRIK UTAMA ==================== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px', marginBottom: '24px' }}>
          {/* Left Side: Valuation Card with Integrated Mini Stats */}
          <div className="card" style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(19, 19, 26, 0.75) 100%)',
            border: '1px solid var(--ga-accent-b)',
            borderLeft: '5px solid var(--ga-accent)',
            padding: '24px 28px',
            borderRadius: 'var(--r)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: '180px'
          }}>
            <Link href="/ga/stock" className="ga-valuation-text-link" style={{ textDecoration: 'none' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--ga-accent)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                📦 Total Estimasi Nilai Aset Inventaris GA
              </div>
              <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--ga-tx)', marginTop: '8px', letterSpacing: '-0.5px' }}>
                {fmtRupiah(data?.totalStockValuation ?? 0)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ga-tx2)', marginTop: '6px' }}>
                Nilai Outbound (Barang Keluar): <span style={{ color: 'var(--pur)', fontWeight: 600 }}>{fmtRupiah(data?.totalOutboundValuation ?? 0)}</span>
              </div>
            </Link>

            {/* Integrated Mini Stats Panel */}
            <div style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              marginTop: '16px',
              borderTop: '1px solid var(--ga-br)',
              paddingTop: '16px'
            }}>
              <Link href="/ga/database" className="ga-stat-item-link" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: '9px', color: 'var(--ga-tx3)', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>Jenis Barang</span>
                <span style={{ fontSize: '14px', fontWeight: '800' }}>{data?.totalItemsCount}</span>
              </Link>
              <div style={{ width: '1px', background: 'var(--ga-br)', alignSelf: 'stretch' }} />
              <Link href="/ga/stock" className="ga-stat-item-link" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: '9px', color: 'var(--ga-tx3)', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>Total Fisik</span>
                <span style={{ fontSize: '14px', fontWeight: '800' }}>
                  {data?.totalStockCount?.toLocaleString('id-ID')} <span style={{ fontSize: '10px', fontWeight: '400', color: 'var(--ga-tx2)' }}>pcs</span>
                </span>
              </Link>
              <div style={{ width: '1px', background: 'var(--ga-br)', alignSelf: 'stretch' }} />
              <Link href="/ga/database" className="ga-stat-item-link" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: '9px', color: 'var(--ga-tx3)', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>Kategori</span>
                <span style={{ fontSize: '14px', fontWeight: '800' }}>{data?.totalKategoriCount}</span>
              </Link>
              <div style={{ width: '1px', background: 'var(--ga-br)', alignSelf: 'stretch' }} />
              <Link href="/ga/opname" className="ga-stat-item-link" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: '9px', color: 'var(--ga-tx3)', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>Opname Sesi</span>
                <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--ga-ylw)' }}>{data?.totalDraftOpnameCount} <span style={{ fontSize: '9px', fontWeight: 'bold' }}>Draft</span></span>
              </Link>
              <div style={{ width: '1px', background: 'var(--ga-br)', alignSelf: 'stretch' }} />
              <Link href="/ga/po-pr" className="ga-stat-item-link" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: '9px', color: 'var(--ga-tx3)', textTransform: 'uppercase', fontWeight: 'bold', display: 'block' }}>Dipesan</span>
                <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--ga-accent)' }}>
                  {data?.activeOrderCount ?? 0} <span style={{ fontSize: '9px', fontWeight: 'bold' }}>Aktif</span>
                </span>
              </Link>
            </div>
          </div>

          {/* Right Side: Kritis / Perlu Restock Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: '180px' }}>
            <div className="card-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', height: '48px', padding: '0 20px' }}>
              <div className="card-title" style={{ color: 'var(--ga-red)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <span>🚨</span> Kritis / Perlu Restock
              </div>
              <Link href="/ga/stock?status=kritis" className="btn btn-ghost btn-sm" style={{ fontSize: '11px', color: 'var(--ga-red)' }}>
                Lihat Stok →
              </Link>
            </div>
            <div style={{ padding: '12px 20px 20px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '180px' }}>
              {data?.lowStockItems?.map((sp: any) => {
                const isOut = sp.currentStock === 0;
                return (
                  <Link href="/ga/stock" key={sp.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 'var(--ga-rs)',
                    background: 'var(--ga-sf2)',
                    border: '1px solid var(--ga-br)',
                    fontSize: '11px',
                    color: 'inherit',
                    textDecoration: 'none'
                  }}
                  className="ga-critical-item-row"
                  >
                    <div style={{ minWidth: 0, flex: 1, marginRight: '8px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--ga-tx)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{sp.nama}</div>
                      <div style={{ fontSize: '9px', color: 'var(--ga-tx3)', fontFamily: 'monospace', marginTop: '2px' }}>{sp.id}</div>
                    </div>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      flexShrink: 0
                    }}>
                      <div style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '800',
                        background: isOut ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        color: isOut ? 'var(--ga-red)' : 'var(--ga-ylw)',
                        border: `1px solid ${isOut ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                      }}>
                        Stok: {sp.currentStock} {sp.uom}
                      </div>
                    </div>
                  </Link>
                );
              })}
              {(!data?.lowStockItems || data.lowStockItems.length === 0) && (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--ga-tx3)', fontSize: '12px' }}>
                  🟢 Seluruh persediaan aman.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ==================== WORKSPACE: 2 COLUMNS LAYOUT ==================== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px', alignItems: 'start' }}>
          
          {/* LEFT COLUMN: LOG OUTBOUND TERKINI */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--ga-red)' }}>
                <span>📤</span> Log Outbound Terkini
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  style={{
                    background: 'var(--ga-sf2)',
                    border: '1px solid var(--ga-br)',
                    color: 'var(--ga-tx)',
                    borderRadius: 'var(--ga-rs)',
                    fontSize: '11px',
                    padding: '4px 24px 4px 8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    outline: 'none',
                    height: '28px',
                    appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='%23a0a0c0' d='M0 0l5 5 5-5z'/></svg>")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 8px center',
                  }}
                >
                  <option value={7}>1 Minggu Terakhir</option>
                  <option value={30}>30 Hari Terakhir</option>
                  <option value={1}>Hari Ini</option>
                </select>
              </div>
              <Link href="/ga/history?tipe=OUT" className="btn btn-ghost btn-sm" style={{ fontSize: '11px' }}>
                Lihat Semua →
              </Link>
            </div>
            <div style={{
              flex: 1,
              padding: '0px 20px 20px 20px',
              maxHeight: '400px',
              overflowY: 'auto',
              opacity: refreshingLog ? 0.6 : 1,
              transition: 'opacity 0.15s ease-in-out',
              position: 'relative'
            }}>
              <div className="table-wrap" style={{ border: 'none', margin: 0 }}>
                <table className="table-clean" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>Waktu</th>
                      <th>Nama Barang</th>
                      <th style={{ textAlign: 'right', width: '70px' }}>Qty</th>
                      <th style={{ width: '120px' }}>PIC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboundMovements.map((m: any) => (
                      <tr key={m.id}>
                        <td className="text-muted text-tiny" style={{ padding: '10px 8px' }}>
                          {new Date(m.tanggal).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short'
                          })} {new Date(m.tanggal).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td style={{ fontWeight: 600, padding: '10px 8px' }}>
                          <Link href="/ga/stock" className="ga-table-item-link" style={{ color: 'inherit', textDecoration: 'none' }}>
                            <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }} title={m.namaBarang}>
                              {m.namaBarang}
                            </div>
                          </Link>
                        </td>
                        <td style={{ fontWeight: 700, textAlign: 'right', padding: '10px 8px', color: 'var(--ga-red)' }}>
                          {m.qty}
                        </td>
                        <td className="text-muted" style={{ padding: '10px 8px', fontSize: '12px' }}>
                          {m.picNama || '—'}
                        </td>
                      </tr>
                    ))}
                    {outboundMovements.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--ga-tx3)' }}>
                          Belum ada transaksi log outbound dalam {days === 1 ? 'hari ini' : days === 7 ? '1 minggu terakhir' : '30 hari terakhir'}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: LOG INBOUND & OPNAME */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* CARD 1: LOG INBOUND TERKINI */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--ga-grn)' }}>
                  <span>📥</span> Log Inbound Terkini
                </div>
                <Link href="/ga/history?tipe=IN" className="btn btn-ghost btn-sm" style={{ fontSize: '11px' }}>
                  Lihat Semua →
                </Link>
              </div>
              <div style={{
                flex: 1,
                padding: '0px 20px 20px 20px',
                maxHeight: '260px',
                overflowY: 'auto',
                opacity: refreshingLog ? 0.6 : 1,
                transition: 'opacity 0.15s ease-in-out',
                position: 'relative'
              }}>
                <div className="table-wrap" style={{ border: 'none', margin: 0 }}>
                  <table className="table-clean" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '80px' }}>Waktu</th>
                        <th>Nama Barang</th>
                        <th style={{ textAlign: 'right', width: '70px' }}>Qty</th>
                        <th style={{ width: '100px' }}>PIC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inboundMovements.map((m: any) => (
                        <tr key={m.id}>
                          <td className="text-muted text-tiny" style={{ padding: '10px 8px' }}>
                            {new Date(m.tanggal).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short'
                            })} {new Date(m.tanggal).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td style={{ fontWeight: 600, padding: '10px 8px' }}>
                            <Link href="/ga/stock" className="ga-table-item-link" style={{ color: 'inherit', textDecoration: 'none' }}>
                              <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '120px' }} title={m.namaBarang}>
                                {m.namaBarang}
                              </div>
                            </Link>
                          </td>
                          <td style={{ fontWeight: 700, textAlign: 'right', padding: '10px 8px', color: 'var(--ga-grn)' }}>
                            {m.qty}
                          </td>
                          <td className="text-muted" style={{ padding: '10px 8px', fontSize: '12px' }}>
                            {m.picNama || '—'}
                          </td>
                        </tr>
                      ))}
                      {inboundMovements.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--ga-tx3)' }}>
                            Belum ada transaksi log inbound.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* CARD 2: SESI OPNAME TERAKHIR (KHAS GA) */}
            <div className="card">
              <div className="card-header" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}>
                <div className="card-title" style={{ color: 'var(--ga-accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📋</span> Sesi Opname Selesai / Aktif
                </div>
                <Link href="/ga/opname" className="btn btn-ghost btn-sm" style={{ fontSize: '11px' }}>
                  Kelola →
                </Link>
              </div>
              <div style={{ padding: '0px 20px 20px 20px' }}>
                <div className="table-wrap" style={{ border: 'none', margin: 0 }}>
                  <table className="table-clean" style={{ width: '100%', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>Periode</th>
                        <th>Tgl Sesi</th>
                        <th style={{ textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.recentOpnameSessions?.slice(0, 3).map((item: any) => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 600, padding: '8px 4px' }}>
                            <Link href={`/ga/opname/${item.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                              {item.periodeNama}
                            </Link>
                          </td>
                          <td className="text-muted text-tiny" style={{ padding: '8px 4px' }}>
                            {new Date(item.tanggal).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px 4px' }}>
                            {item.status === 'posted' ? (
                              <span className="badge badge-grn" style={{ padding: '2px 6px', fontSize: '9px' }}>Posted</span>
                            ) : (
                              <span className="badge badge-ylw" style={{ padding: '2px 6px', fontSize: '9px' }}>Draft</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {(!data?.recentOpnameSessions || data.recentOpnameSessions.length === 0) && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', padding: '20px', color: 'var(--ga-tx3)' }}>
                            Tidak ada sesi opname aktif.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
