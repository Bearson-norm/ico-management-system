'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import * as XLSX from 'xlsx';

function fmtRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function TrendContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialSp = searchParams.get('sp') || 'MTC-SP-099';
  const [selectedSpId, setSelectedSpId] = useState<string>(initialSp);
  const [period, setPeriod] = useState<'3m' | '6m' | '1y' | 'all'>('all');
  const [kategori, setKategori] = useState<'Maintenance' | 'ALL'>('Maintenance');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Sync state with URL parameter if it changes
  useEffect(() => {
    const spFromUrl = searchParams.get('sp');
    if (spFromUrl && spFromUrl !== selectedSpId) {
      setSelectedSpId(spFromUrl);
    }
  }, [searchParams]);

  // Fetch trend data from API
  useEffect(() => {
    async function loadTrendData() {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          sparepartId: selectedSpId,
          period,
          kategori,
        });
        const res = await fetch(`/api/mtc/trend?${query.toString()}`);
        const json = await res.json();
        if (json.success) {
          setData(json);
        }
      } catch (err) {
        console.error('Gagal mengambil data trend:', err);
      } finally {
        setLoading(false);
      }
    }
    loadTrendData();
  }, [selectedSpId, period, kategori]);

  const handleSelectSparepart = (id: string) => {
    setSelectedSpId(id);
    setDropdownOpen(false);
    setSearchQuery('');
    router.replace(`/mtc/trend?sp=${encodeURIComponent(id)}`);
  };

  const filteredSpareparts = useMemo(() => {
    if (!data?.sparepartList) return [];
    if (!searchQuery.trim()) return data.sparepartList.slice(0, 50);
    const q = searchQuery.toLowerCase();
    return data.sparepartList.filter(
      (sp: any) =>
        sp.nama.toLowerCase().includes(q) ||
        sp.id.toLowerCase().includes(q) ||
        (sp.kategori?.nama || '').toLowerCase().includes(q)
    );
  }, [data?.sparepartList, searchQuery]);

  const exportToExcel = () => {
    if (!data?.selectedPart?.historyList || data.selectedPart.historyList.length === 0) {
      alert('Tidak ada data riwayat untuk diekspor.');
      return;
    }

    const partInfo = data.selectedPart.info;
    const rows = data.selectedPart.historyList.map((item: any, idx: number) => ({
      No: idx + 1,
      Tanggal: item.tanggal,
      Waktu: item.waktu,
      'Kode Part': partInfo.id,
      'Nama Sparepart': partInfo.nama,
      'Qty Keluar': item.qty,
      Satuan: partInfo.uom,
      'Harga Satuan (Rp)': item.hargaSatuan,
      'Total Biaya (Rp)': item.totalBiaya,
      'Mesin Terkait': item.mesin,
      Teknisi: item.pic,
      'No Report': item.noReport,
      Keterangan: item.keterangan,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Pemakaian');
    const safeName = (partInfo.nama || 'sparepart').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `Trend_${partInfo.id}_${safeName}.xlsx`);
  };

  const selectedPart = data?.selectedPart;
  const partInfo = selectedPart?.info;
  const kpis = selectedPart?.kpis;
  const monthlyTrend = selectedPart?.monthlyTrend || [];
  const machineBreakdown = selectedPart?.machineBreakdown || [];
  const historyList = selectedPart?.historyList || [];

  const chartColors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#6366f1'];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--tx)' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>📈</span>
            <div className="page-title" style={{ margin: 0 }}>Trend Penggunaan Sparepart</div>
          </div>
          <div className="page-sub" style={{ marginTop: 6 }}>
            Analisis pola konsumsi bulanan, estimasi sisa ketahanan stok, dan mesin konsumen utama.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={exportToExcel}
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 'var(--rs)', background: 'var(--sf2)', border: '1px solid var(--br)', color: 'var(--tx)', fontWeight: 600, fontSize: 13 }}
          >
            📥 Ekspor Excel
          </button>
          <Link
            href="/mtc/history"
            className="btn btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 'var(--rs)', background: 'var(--sf2)', border: '1px solid var(--br)', color: 'var(--tx)', fontWeight: 600, fontSize: 13 }}
          >
            🧾 Riwayat INOUT
          </Link>
        </div>
      </div>

      <div className="page-body">
        {/* Selector & Filter Bar */}
        <div
          style={{
            background: 'var(--sf)',
            border: '1px solid var(--br)',
            borderRadius: 'var(--r)',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'center' }}>
            {/* Sparepart Dropdown with Search */}
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
                Pilih Sparepart
              </label>
              <div
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                  background: 'var(--sf2)',
                  border: '1px solid var(--br)',
                  borderRadius: 'var(--rs)',
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {partInfo ? `${partInfo.nama} (${partInfo.id})` : 'Pilih Sparepart…'}
                  </div>
                  {partInfo && (
                    <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                      Kat: {partInfo.kategori} • Stok: {partInfo.currentStock} {partInfo.uom}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 12, color: 'var(--tx3)', marginLeft: 8 }}>▼</span>
              </div>

              {dropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: 'var(--sf)',
                    border: '1px solid var(--brh)',
                    borderRadius: 'var(--rs)',
                    marginTop: 6,
                    boxShadow: '0 12px 36px rgba(0,0,0,.6)',
                    maxHeight: 320,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: 10, borderBottom: '1px solid var(--br)', background: 'var(--sf2)' }}>
                    <input
                      type="text"
                      placeholder="Cari kode atau nama sparepart…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoFocus
                      style={{
                        width: '100%',
                        background: 'var(--sf)',
                        border: '1px solid var(--br)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        color: 'var(--tx)',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1, padding: 4 }}>
                    {filteredSpareparts.map((sp: any) => (
                      <div
                        key={sp.id}
                        onClick={() => handleSelectSparepart(sp.id)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          background: selectedSpId === sp.id ? 'var(--pur-d)' : 'transparent',
                          color: selectedSpId === sp.id ? 'var(--pur)' : 'var(--tx)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 13,
                        }}
                        onMouseEnter={(e) => {
                          if (selectedSpId !== sp.id) e.currentTarget.style.background = 'var(--sf2)';
                        }}
                        onMouseLeave={(e) => {
                          if (selectedSpId !== sp.id) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sp.nama}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                            {sp.id} • {sp.kategori?.nama || 'Umum'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtRupiah(Number(sp.harga))}</div>
                        </div>
                      </div>
                    ))}
                    {filteredSpareparts.length === 0 && (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>
                        Tidak ditemukan sparepart yang cocok.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Filter Periode & Kategori */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
                  Rentang Waktu
                </label>
                <div style={{ display: 'inline-flex', background: 'var(--sf2)', border: '1px solid var(--br)', borderRadius: 'var(--rs)', padding: 3, gap: 3 }}>
                  {(['3m', '6m', '1y', 'all'] as const).map((p) => {
                    const labelMap = { '3m': '3 Bln', '6m': '6 Bln', '1y': '1 Thn', all: 'Semua' };
                    const active = period === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        style={{
                          background: active ? 'var(--pur)' : 'transparent',
                          color: active ? '#fff' : 'var(--tx2)',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: active ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all .15s',
                        }}
                      >
                        {labelMap[p]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>
                  Fokus Pengeluaran
                </label>
                <div style={{ display: 'inline-flex', background: 'var(--sf2)', border: '1px solid var(--br)', borderRadius: 'var(--rs)', padding: 3, gap: 3 }}>
                  <button
                    onClick={() => setKategori('Maintenance')}
                    style={{
                      background: kategori === 'Maintenance' ? 'var(--blu)' : 'transparent',
                      color: kategori === 'Maintenance' ? '#fff' : 'var(--tx2)',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: kategori === 'Maintenance' ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all .15s',
                    }}
                  >
                    🛠️ Maintenance Saja
                  </button>
                  <button
                    onClick={() => setKategori('ALL')}
                    style={{
                      background: kategori === 'ALL' ? 'var(--blu)' : 'transparent',
                      color: kategori === 'ALL' ? '#fff' : 'var(--tx2)',
                      border: 'none',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: kategori === 'ALL' ? 700 : 500,
                      cursor: 'pointer',
                      transition: 'all .15s',
                    }}
                  >
                    Semua Pengeluaran
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Select Top Used Parts */}
          {data?.topUsedParts && data.topUsedParts.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--br)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase' }}>
                ⭐ Sering Dipakai:
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {data.topUsedParts.slice(0, 6).map((sp: any) => (
                  <button
                    key={sp.id}
                    onClick={() => handleSelectSparepart(sp.id)}
                    style={{
                      background: selectedSpId === sp.id ? 'var(--pur-d)' : 'var(--sf2)',
                      color: selectedSpId === sp.id ? 'var(--pur)' : 'var(--tx2)',
                      border: selectedSpId === sp.id ? '1px solid var(--pur-b)' : '1px solid var(--br)',
                      borderRadius: 'var(--rs)',
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {sp.nama} ({sp.totalQty} {sp.uom})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--tx3)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx)' }}>Memuat Analisis Tren…</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Mengagregasi riwayat pemakaian dan data mesin</div>
          </div>
        ) : !partInfo ? (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--tx3)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx)' }}>Sparepart Tidak Ditemukan</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Silakan pilih sparepart lain dari menu di atas.</div>
          </div>
        ) : (
          <>
            {/* KPI Cards Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 16,
                marginBottom: 24,
              }}
            >
              {/* Card 1: Total Pemakaian */}
              <div
                style={{
                  background: 'var(--sf)',
                  border: '1px solid var(--br)',
                  borderRadius: 'var(--r)',
                  padding: 20,
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Total Pemakaian ({period.toUpperCase()})
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, color: 'var(--pur)' }}>
                  {kpis.totalQty} <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx2)' }}>{partInfo.uom}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>
                  Dari total {kpis.totalEvents} kali perbaikan / penggantian
                </div>
              </div>

              {/* Card 2: Total Biaya */}
              <div
                style={{
                  background: 'var(--sf)',
                  border: '1px solid var(--br)',
                  borderRadius: 'var(--r)',
                  padding: 20,
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Total Biaya Pengeluaran
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8, color: 'var(--tx)' }}>
                  {fmtRupiah(kpis.totalBiaya)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>
                  Harga satuan: {fmtRupiah(partInfo.harga)}
                </div>
              </div>

              {/* Card 3: Run Rate Konsumsi */}
              <div
                style={{
                  background: 'var(--sf)',
                  border: '1px solid var(--br)',
                  borderRadius: 'var(--r)',
                  padding: 20,
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Rata-rata Konsumsi (Run-Rate)
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, color: 'var(--blu)' }}>
                  {kpis.runRateMonthly} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx2)' }}>{partInfo.uom}/Bulan</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>
                  Terakhir dipakai: <strong style={{ color: 'var(--tx2)' }}>{kpis.lastUsedDate}</strong>
                </div>
              </div>

              {/* Card 4: Ketahanan Stok & Status */}
              <div
                style={{
                  background: 'var(--sf)',
                  border: '1px solid var(--br)',
                  borderRadius: 'var(--r)',
                  padding: 20,
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Stok & Ketahanan (Runway)
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background:
                        kpis.reorderStatus === 'DANGER'
                          ? 'var(--red-d)'
                          : kpis.reorderStatus === 'WARNING'
                          ? 'var(--ylw-d)'
                          : 'var(--grn-d)',
                      color:
                        kpis.reorderStatus === 'DANGER'
                          ? 'var(--red)'
                          : kpis.reorderStatus === 'WARNING'
                          ? 'var(--ylw)'
                          : 'var(--grn)',
                      border:
                        kpis.reorderStatus === 'DANGER'
                          ? '1px solid var(--red-b)'
                          : kpis.reorderStatus === 'WARNING'
                          ? '1px solid var(--ylw-b)'
                          : '1px solid var(--grn-b)',
                    }}
                  >
                    {kpis.reorderStatus === 'DANGER'
                      ? 'HABIS / KRITIS'
                      : kpis.reorderStatus === 'WARNING'
                      ? 'PERLU RESTOCK'
                      : 'STOK AMAN'}
                  </span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8, color: 'var(--tx)' }}>
                  {partInfo.currentStock} {partInfo.uom}{' '}
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx3)' }}>
                    (Est. ~{kpis.runwayMonths} Bulan)
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>
                  Min Qty: {partInfo.minQty} {partInfo.uom} • Lokasi: {partInfo.lokasi}
                </div>
              </div>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 24, marginBottom: 24 }}>
              {/* Chart 1: Monthly Usage Trend (Qty) */}
              <div
                style={{
                  background: 'var(--sf)',
                  border: '1px solid var(--br)',
                  borderRadius: 'var(--r)',
                  padding: 24,
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>
                      📊 Tren Pengeluaran per Bulan ({partInfo.uom})
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                      Volume barang keluar untuk keperluan operasional
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--pur)', background: 'var(--pur-d)', padding: '4px 10px', borderRadius: 6 }}>
                    Total: {kpis.totalQty} {partInfo.uom}
                  </div>
                </div>

                {monthlyTrend.length > 0 ? (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="monthLabel" stroke="var(--tx3)" fontSize={11} tickLine={false} />
                        <YAxis stroke="var(--tx3)" fontSize={11} tickLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{
                            background: '#1a1a24',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 8,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                            color: '#eeeef4',
                            fontSize: 12,
                          }}
                          formatter={(value: any) => [`${value} ${partInfo.uom}`, 'Volume Keluar']}
                          labelFormatter={(label: any) => `Periode: ${label}`}
                        />
                        <Bar dataKey="qty" radius={[6, 6, 0, 0]}>
                          {monthlyTrend.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 13 }}>
                    Belum ada data pemakaian pada rentang waktu ini.
                  </div>
                )}
              </div>

              {/* Chart 2: Monthly Cost Trend (Rupiah) */}
              <div
                style={{
                  background: 'var(--sf)',
                  border: '1px solid var(--br)',
                  borderRadius: 'var(--r)',
                  padding: 24,
                  boxShadow: 'var(--shadow)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>
                      💰 Tren Biaya Pemakaian (Rp)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                      Akumulasi nilai finansial penggantian part per bulan
                    </div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--grn)', background: 'var(--grn-d)', padding: '4px 10px', borderRadius: 6 }}>
                    {fmtRupiah(kpis.totalBiaya)}
                  </div>
                </div>

                {monthlyTrend.length > 0 ? (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyTrend} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                        <defs>
                          <linearGradient id="colorBiaya" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="monthLabel" stroke="var(--tx3)" fontSize={11} tickLine={false} />
                        <YAxis
                          stroke="var(--tx3)"
                          fontSize={10}
                          tickLine={false}
                          tickFormatter={(v) => (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${v / 1000}k`)}
                        />
                        <Tooltip
                          contentStyle={{
                            background: '#1a1a24',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 8,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                            color: '#eeeef4',
                            fontSize: 12,
                          }}
                          formatter={(value: any) => [fmtRupiah(Number(value)), 'Total Biaya']}
                          labelFormatter={(label: any) => `Periode: ${label}`}
                        />
                        <Area type="monotone" dataKey="totalBiaya" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorBiaya)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 13 }}>
                    Belum ada data pengeluaran biaya pada rentang waktu ini.
                  </div>
                )}
              </div>
            </div>

            {/* Machine Breakdown Section */}
            <div
              style={{
                background: 'var(--sf)',
                border: '1px solid var(--br)',
                borderRadius: 'var(--r)',
                padding: 24,
                marginBottom: 24,
                boxShadow: 'var(--shadow)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>
                    🏭 Distribusi Mesin Konsumen Part
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                    Mesin-mesin produksi yang paling sering mengonsumsi sparepart ini
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx3)' }}>
                  {machineBreakdown.length} Mesin Teridentifikasi
                </div>
              </div>

              {machineBreakdown.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  {machineBreakdown.map((m: any, idx: number) => {
                    const color = chartColors[idx % chartColors.length];
                    return (
                      <div
                        key={m.name}
                        style={{
                          background: 'var(--sf2)',
                          border: '1px solid var(--br)',
                          borderRadius: 'var(--rs)',
                          padding: '14px 16px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--tx)' }}>
                            {m.name}
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color,
                              background: 'rgba(255,255,255,0.05)',
                              padding: '2px 8px',
                              borderRadius: 4,
                            }}
                          >
                            {m.percentage}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, Math.max(5, m.percentage))}%`,
                              background: color,
                              borderRadius: 3,
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--tx3)' }}>
                          <span>
                            Volume: <strong style={{ color: 'var(--tx2)' }}>{m.qty} {partInfo.uom}</strong> ({m.count}x pergantian)
                          </span>
                          <span>
                            Nilai: <strong style={{ color: 'var(--tx2)' }}>{fmtRupiah(m.totalBiaya)}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>
                  Tidak ada data mesin terkait pada riwayat part ini.
                </div>
              )}
            </div>

            {/* Detailed Movement History Table */}
            <div
              style={{
                background: 'var(--sf)',
                border: '1px solid var(--br)',
                borderRadius: 'var(--r)',
                padding: 24,
                boxShadow: 'var(--shadow)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>
                    📋 Riwayat Detail Pemakaian
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                    Daftar kronologis barang keluar untuk part {partInfo.nama} ({historyList.length} transaksi)
                  </div>
                </div>
                <button
                  onClick={exportToExcel}
                  className="btn btn-secondary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 6,
                    background: 'var(--sf2)',
                    border: '1px solid var(--br)',
                    color: 'var(--tx)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  📥 Unduh Tabel Ini (.xlsx)
                </button>
              </div>

              {historyList.length > 0 ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--br)', color: 'var(--tx3)', fontSize: 11, textTransform: 'uppercase' }}>
                        <th style={{ padding: '12px 14px' }}>Tanggal & Jam</th>
                        <th style={{ padding: '12px 14px' }}>Qty</th>
                        <th style={{ padding: '12px 14px' }}>Harga Satuan</th>
                        <th style={{ padding: '12px 14px' }}>Total Biaya</th>
                        <th style={{ padding: '12px 14px' }}>Mesin Terkait</th>
                        <th style={{ padding: '12px 14px' }}>Teknisi (PIC)</th>
                        <th style={{ padding: '12px 14px' }}>Keterangan / Pekerjaan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyList.map((item: any) => (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: '1px solid var(--br)',
                            transition: 'background .15s',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sf2)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: 'var(--tx)' }}>{item.tanggal}</div>
                            <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{item.waktu} WIB</div>
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--pur)' }}>
                            {item.qty} {partInfo.uom}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--tx2)' }}>
                            {fmtRupiah(item.hargaSatuan)}
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--tx)' }}>
                            {fmtRupiah(item.totalBiaya)}
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 500, color: 'var(--tx)' }}>
                            {item.mesin}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--tx2)' }}>
                            {item.pic}
                          </td>
                          <td style={{ padding: '12px 14px', color: 'var(--tx3)', maxWidth: 300, fontSize: 12 }}>
                            {item.keterangan}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--tx3)', fontSize: 13 }}>
                  Tidak ada catatan transaksi pemakaian pada periode yang dipilih.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TrendPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--tx3)' }}>
          Memuat halaman analisis tren…
        </div>
      }
    >
      <TrendContent />
    </Suspense>
  );
}
