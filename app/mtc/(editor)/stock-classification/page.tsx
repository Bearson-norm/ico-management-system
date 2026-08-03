'use client';
import React, { useState, useEffect, useCallback } from 'react';

interface TransactionItem {
  tanggal: string;
  qty: number;
  keterangan: string | null;
}

interface MonthlyBreakdownItem {
  monthKey: string;
  monthLabel: string;
  year: number;
  qty: number;
  transactions: TransactionItem[];
}

interface SpClassification {
  id: string;
  nama: string;
  uom: string;
  lokasi: string;
  harga: number;
  currentStock: number;
  isMesinProduksi: boolean;
  tipePeruntukan: string;
  mesins: { id: number; nama: string; vital: boolean }[];
  isVital: boolean;
  vitalMesins: string[];
  dampakDowntime: 'STOP_TOTAL' | 'KURANGI_PRODUKTIVITAS' | 'CONSUMABLE';
  totalOut12m: number;
  totalOut6m: number;
  totalOut3m: number;
  avgMonthly12m: number;
  avgMonthly6m: number;
  avgMonthly3m: number;
  spikeTrend: 'SPIKE_UP' | 'TREND_DOWN' | 'STABLE';
  spikePercentage: string;
  monthlyBreakdown: MonthlyBreakdownItem[];
  peakMonthInfo: string;
  avgMonthlyUsage: number;
  dailyUsage: number;
  leadTime: number;
  jalur: 'Jalur A (Normal)' | 'Jalur B (Kritis-Slow)';
  min: number;
  max: number;
  rop: number;
  safetyStock: number;
  isWajibPr: boolean;
  catatan: string | null;
}

export default function StockClassificationPage() {
  const [data, setData] = useState<SpClassification[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'AUTO' | '12M' | '6M' | '3M'>('AUTO');
  const [slowThreshold, setSlowThreshold] = useState(1.0);
  const [filterJalur, setFilterJalur] = useState<string>('');
  const [filterPeruntukan, setFilterPeruntukan] = useState<'ALL' | 'MESIN' | 'BUKAN_MESIN'>('ALL');
  const [filterSpike, setFilterSpike] = useState(false);
  const [onlyWajibPr, setOnlyWajibPr] = useState(false);
  const [search, setSearch] = useState('');

  // Specific Month & Year Filter
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL'); // '01'..'12' or 'ALL'
  const [selectedYear, setSelectedYear] = useState<string>('ALL'); // '2026', '2025', '2024' or 'ALL'
  const [onlyWithUsageInSelectedMonth, setOnlyWithUsageInSelectedMonth] = useState(false);

  // Expandable row state for month-by-month breakdown
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [expandAllMonths, setExpandAllMonths] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mtc/stock-classification?mode=${mode}&slowThreshold=${slowThreshold}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [mode, slowThreshold]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleExpandAll = () => {
    const nextState = !expandAllMonths;
    setExpandAllMonths(nextState);
    const newExpanded: Record<string, boolean> = {};
    if (nextState) {
      data.forEach((d) => {
        newExpanded[d.id] = true;
      });
    }
    setExpandedRows(newExpanded);
  };

  // Build target key for selected month & year filter (e.g. "2026-08")
  const hasSpecificMonthYearFilter = selectedMonth !== 'ALL' || selectedYear !== 'ALL';

  // Summary Metrics
  const totalMesin = data.filter((d) => d.isMesinProduksi).length;
  const totalBukanMesin = data.filter((d) => !d.isMesinProduksi).length;
  const mesinWajibPr = data.filter((d) => d.isMesinProduksi && d.isWajibPr).length;
  const bukanMesinWajibPr = data.filter((d) => !d.isMesinProduksi && d.isWajibPr).length;

  const totalWajibPr = data.filter((d) => d.isWajibPr).length;
  const totalSpikeUp = data.filter((d) => d.spikeTrend === 'SPIKE_UP').length;
  const totalJalurB = data.filter((d) => d.jalur.includes('B')).length;

  const filtered = data.filter((d) => {
    if (onlyWajibPr && !d.isWajibPr) return false;
    if (filterSpike && d.spikeTrend !== 'SPIKE_UP') return false;
    if (filterJalur && !d.jalur.includes(filterJalur)) return false;
    if (filterPeruntukan === 'MESIN' && !d.isMesinProduksi) return false;
    if (filterPeruntukan === 'BUKAN_MESIN' && d.isMesinProduksi) return false;

    // Filter by specific Month and/or Year
    if (hasSpecificMonthYearFilter && onlyWithUsageInSelectedMonth) {
      const matchMonth = d.monthlyBreakdown?.some((mb) => {
        const [year, month] = mb.monthKey.split('-');
        if (selectedYear !== 'ALL' && year !== selectedYear) return false;
        if (selectedMonth !== 'ALL' && month !== selectedMonth) return false;
        return mb.qty > 0;
      });
      if (!matchMonth) return false;
    }

    if (search) {
      const q = search.toLowerCase();
      const matchName = d.nama.toLowerCase().includes(q);
      const matchId = d.id.toLowerCase().includes(q);
      const matchMesin = d.vitalMesins.some((m) => m.toLowerCase().includes(q));
      if (!matchName && !matchId && !matchMesin) return false;
    }
    return true;
  });

  return (
    <>
      <div className="page-header">
        <div className="flex-between page-header-row">
          <div>
            <div className="page-title">⚡ Analisis Pemakaian Bulanan &amp; Deteksi Lonjakan (Spike &amp; Noise)</div>
            <div className="page-sub">
              Filter pemakaian per-bulan &amp; per-tahun untuk mendeteksi transaksi lonjakan pemakaian pada bulan spesifik
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Peruntukan Comparison Banner */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
            marginBottom: 16,
          }}
        >
          {/* Mesin Produksi */}
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(19,19,26,0.65) 100%)',
              border: filterPeruntukan === 'MESIN' ? '2px solid #3b82f6' : '1px solid rgba(59,130,246,0.3)',
              padding: '16px 20px',
              borderRadius: 'var(--r)',
              cursor: 'pointer',
            }}
            onClick={() => setFilterPeruntukan(filterPeruntukan === 'MESIN' ? 'ALL' : 'MESIN')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="badge" style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa', fontWeight: 700, fontSize: 11 }}>
                🏭 MESIN PRODUKSI (PART VITAL / PRODUKSI)
              </span>
              <span style={{ fontSize: 12, color: 'var(--tx3)', fontWeight: 600 }}>
                {totalMesin > 0 ? Math.round((totalMesin / data.length) * 100) : 0}% dari total
              </span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--tx)', marginTop: 8 }}>
              {totalMesin} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx3)' }}>Item</span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--tx2)' }}>
              <span>🚨 Wajib PR: <strong style={{ color: '#ef4444' }}>{mesinWajibPr} Item</strong></span>
              <span>⚡ Kritis (Jalur B): <strong style={{ color: '#f97316' }}>{totalJalurB} Item</strong></span>
            </div>
          </div>

          {/* Consumables (Bukan Mesin) */}
          <div
            className="card"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(19,19,26,0.65) 100%)',
              border: filterPeruntukan === 'BUKAN_MESIN' ? '2px solid var(--pur)' : '1px solid rgba(168,85,247,0.3)',
              padding: '16px 20px',
              borderRadius: 'var(--r)',
              cursor: 'pointer',
            }}
            onClick={() => setFilterPeruntukan(filterPeruntukan === 'BUKAN_MESIN' ? 'ALL' : 'BUKAN_MESIN')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="badge" style={{ background: 'rgba(168,85,247,0.2)', color: '#c084fc', fontWeight: 700, fontSize: 11 }}>
                🛠️ CONSUMABLE (BUKAN UNTUK MESIN)
              </span>
              <span style={{ fontSize: 12, color: 'var(--tx3)', fontWeight: 600 }}>
                {totalBukanMesin > 0 ? Math.round((totalBukanMesin / data.length) * 100) : 0}% dari total
              </span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--tx)', marginTop: 8 }}>
              {totalBukanMesin} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx3)' }}>Item</span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--tx2)' }}>
              <span>🚨 Wajib PR: <strong style={{ color: '#ef4444' }}>{bukanMesinWajibPr} Item</strong></span>
              <span>🚢 Normal (Jalur A): <strong style={{ color: 'var(--tx)' }}>{data.filter(d => !d.isMesinProduksi && d.jalur.includes('A')).length} Item</strong></span>
            </div>
          </div>
        </div>

        {/* Controls & Mode Switcher Card */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Left: Mode Selection */}
              <div>
                <label className="form-label" style={{ fontSize: 11, marginBottom: 6 }}>
                  ⚙️ Metode Dasar Kalkulasi ROP:
                </label>
                <div style={{ display: 'flex', gap: 4, background: 'var(--sf2)', padding: 4, borderRadius: 8, border: '1px solid var(--br)' }}>
                  {[
                    { id: 'AUTO', label: '⚡ Otomatis (Anti-Spike / Safety)' },
                    { id: '3M', label: '📊 3 Bulan (Tren Terkini)' },
                    { id: '6M', label: '📊 6 Bulan (Menengah)' },
                    { id: '12M', label: '📊 12 Bulan (Baseline)' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="btn btn-sm"
                      style={{
                        height: 32,
                        fontSize: 11,
                        fontWeight: mode === m.id ? 700 : 500,
                        background: mode === m.id ? 'var(--sf3)' : 'transparent',
                        color: mode === m.id ? 'var(--pur)' : 'var(--tx3)',
                        boxShadow: mode === m.id ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                      }}
                      onClick={() => setMode(m.id as any)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: Specific Month & Year Filter */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>📅 Filter Bulan</label>
                  <select
                    className="form-select"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    style={{ height: 32, fontSize: 11 }}
                  >
                    <option value="ALL">Semua Bulan</option>
                    <option value="01">Januari</option>
                    <option value="02">Februari</option>
                    <option value="03">Maret</option>
                    <option value="04">April</option>
                    <option value="05">Mei</option>
                    <option value="06">Juni</option>
                    <option value="07">Juli</option>
                    <option value="08">Agustus</option>
                    <option value="09">September</option>
                    <option value="10">Oktober</option>
                    <option value="11">November</option>
                    <option value="12">Desember</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 11 }}>🗓️ Filter Tahun</label>
                  <select
                    className="form-select"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    style={{ height: 32, fontSize: 11 }}
                  >
                    <option value="ALL">Semua Tahun</option>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                  </select>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={toggleExpandAll}
                  style={{ height: 32 }}
                >
                  {expandAllMonths ? '📂 Sembunyikan Rincian' : '📅 Tampilkan Rincian Bulanan'}
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={fetchData}
                  disabled={loading}
                  style={{ height: 32 }}
                >
                  {loading ? '⏳ Hitung Ulang...' : '🔄 Hitung Ulang'}
                </button>
              </div>
            </div>

            {/* Filter Toggle Bar */}
            {hasSpecificMonthYearFilter && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--br)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="badge" style={{ background: 'rgba(168,85,247,0.2)', color: '#c084fc', fontSize: 11, fontWeight: 700 }}>
                  🔍 Filter Aktif: {selectedMonth !== 'ALL' ? `Bulan ${selectedMonth}` : 'Semua Bulan'} {selectedYear !== 'ALL' ? `Tahun ${selectedYear}` : ''}
                </span>

                <label style={{ fontSize: 12, color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={onlyWithUsageInSelectedMonth}
                    onChange={(e) => setOnlyWithUsageInSelectedMonth(e.target.checked)}
                  />
                  Hanya tampilkan sparepart yang ADA PEMAKAIAN di periode filter ini
                </label>

                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setSelectedMonth('ALL');
                    setSelectedYear('ALL');
                    setOnlyWithUsageInSelectedMonth(false);
                  }}
                  style={{ fontSize: 10, marginLeft: 'auto' }}
                >
                  ✕ Clear Filter Periode
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          {/* Card 1: Wajib PR */}
          <div
            className="card"
            onClick={() => {
              setOnlyWajibPr(!onlyWajibPr);
              setFilterSpike(false);
            }}
            style={{
              cursor: 'pointer',
              border: onlyWajibPr ? '2px solid #ef4444' : '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.06)',
              padding: '14px 16px',
              borderRadius: 'var(--r)',
              transition: 'all .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#ef4444' }}>{totalWajibPr}</div>
              <span className="badge" style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 11, fontWeight: 700 }}>
                🚨 WAJIB PR/PO
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginTop: 6 }}>
              Stok &le; ROP (Perlu Pemesanan)
            </div>
          </div>

          {/* Card 2: Spike Up */}
          <div
            className="card"
            onClick={() => {
              setFilterSpike(!filterSpike);
              setOnlyWajibPr(false);
            }}
            style={{
              cursor: 'pointer',
              border: filterSpike ? '2px solid #f97316' : '1px solid rgba(249,115,22,0.3)',
              background: 'rgba(249,115,22,0.06)',
              padding: '14px 16px',
              borderRadius: 'var(--r)',
              transition: 'all .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f97316' }}>{totalSpikeUp}</div>
              <span className="badge" style={{ background: 'rgba(249,115,22,0.2)', color: '#f97316', fontSize: 11, fontWeight: 700 }}>
                ⚡ LONJAKAN (SPIKE)
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginTop: 6 }}>
              Pemakaian 3 Bln Melonjak Tinggi
            </div>
          </div>

          {/* Card 3: Jalur B */}
          <div
            className="card"
            onClick={() => {
              setFilterJalur(filterJalur === 'B' ? '' : 'B');
              setOnlyWajibPr(false);
            }}
            style={{
              cursor: 'pointer',
              border: filterJalur === 'B' ? '2px solid #eab308' : '1px solid rgba(234,179,8,0.3)',
              background: 'rgba(234,179,8,0.06)',
              padding: '14px 16px',
              borderRadius: 'var(--r)',
              transition: 'all .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#ca8a04' }}>{totalJalurB}</div>
              <span className="badge" style={{ background: 'rgba(234,179,8,0.2)', color: '#ca8a04', fontSize: 11, fontWeight: 700 }}>
                ⚡ JALUR B
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginTop: 6 }}>
              Kritis - Jarang Keluar (Buffer 1-2 Pcs)
            </div>
          </div>

          {/* Card 4: Total Active */}
          <div
            className="card"
            onClick={() => {
              setFilterJalur('');
              setFilterPeruntukan('ALL');
              setOnlyWajibPr(false);
              setFilterSpike(false);
              setSelectedMonth('ALL');
              setSelectedYear('ALL');
            }}
            style={{
              cursor: 'pointer',
              border: '1px solid var(--br)',
              background: 'var(--sf2)',
              padding: '14px 16px',
              borderRadius: 'var(--r)',
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--tx3)' }}>{data.length}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', marginTop: 6 }}>
              Total Suku Cadang Aktif
            </div>
          </div>
        </div>

        {/* Main Table */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="search-bar" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text"
                  placeholder="Cari item ID / nama / mesin..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {(onlyWajibPr || filterSpike || filterJalur || filterPeruntukan !== 'ALL' || search || hasSpecificMonthYearFilter) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setOnlyWajibPr(false);
                    setFilterSpike(false);
                    setFilterJalur('');
                    setFilterPeruntukan('ALL');
                    setSelectedMonth('ALL');
                    setSelectedYear('ALL');
                    setOnlyWithUsageInSelectedMonth(false);
                    setSearch('');
                  }}
                >
                  ✕ Reset Filter
                </button>
              )}

              <div style={{ fontSize: 12, color: 'var(--tx3)', fontWeight: 600 }}>
                Menampilkan {filtered.length} dari {data.length} item
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table-stack" style={{ opacity: loading ? 0.5 : 1 }}>
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Nama Sparepart</th>
                  <th>Peruntukan / Mesin</th>
                  <th>Klasifikasi Dampak</th>
                  <th style={{ textAlign: 'center' }}>Pemakaian 12M vs 6M vs 3M</th>
                  <th style={{ textAlign: 'center' }}>Deteksi Lonjakan</th>
                  <th style={{ textAlign: 'center' }}>Rincian Bulanan</th>
                  <th style={{ textAlign: 'center' }}>Lead Time</th>
                  <th style={{ textAlign: 'center' }}>Jalur Rumus</th>
                  <th style={{ textAlign: 'right' }}>Min</th>
                  <th style={{ textAlign: 'right' }}>Max</th>
                  <th style={{ textAlign: 'right' }}>ROP</th>
                  <th style={{ textAlign: 'right' }}>Stok Saat Ini</th>
                  <th>Status &amp; Rekomendasi PR</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={14} style={{ textAlign: 'center', padding: 48, color: 'var(--tx3)' }}>
                      {data.length === 0 ? '⏳ Memuat data perbandingan...' : 'Tidak ada sparepart yang cocok dengan filter.'}
                    </td>
                  </tr>
                )}
                {filtered.map((sp) => {
                  const isJalurB = sp.jalur.includes('B');
                  const isExpanded = !!expandedRows[sp.id];

                  // Find matching breakdown for selected month/year
                  const matchingMonths = sp.monthlyBreakdown?.filter((mb) => {
                    const [year, month] = mb.monthKey.split('-');
                    if (selectedYear !== 'ALL' && year !== selectedYear) return false;
                    if (selectedMonth !== 'ALL' && month !== selectedMonth) return false;
                    return true;
                  }) || [];

                  const selectedQty = matchingMonths.reduce((sum, mb) => sum + mb.qty, 0);

                  return (
                    <React.Fragment key={sp.id}>
                      <tr
                        style={{
                          background: sp.isWajibPr ? 'rgba(239,68,68,0.04)' : 'transparent',
                        }}
                      >
                        <td data-label="Item ID" className="text-mono text-tiny text-muted">{sp.id}</td>

                        <td data-label="Nama Sparepart">
                          <div style={{ fontWeight: 700, color: 'var(--tx)' }}>{sp.nama}</div>
                          {hasSpecificMonthYearFilter && selectedQty > 0 && (
                            <div style={{ fontSize: 10, color: '#f97316', marginTop: 2, fontWeight: 700 }}>
                              📌 Pemakaian Periode Ini: {selectedQty} {sp.uom}
                            </div>
                          )}
                        </td>

                        <td data-label="Peruntukan / Mesin">
                          {sp.isMesinProduksi ? (
                            <div>
                              <span className="badge" style={{ fontSize: 10, background: sp.isVital ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)', color: sp.isVital ? '#ef4444' : '#60a5fa', border: sp.isVital ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(59,130,246,0.3)', fontWeight: 700 }}>
                                🏭 Mesin Produksi
                              </span>
                              <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 3 }}>
                                {sp.vitalMesins.length > 0 ? sp.vitalMesins.join(', ') : sp.mesins.map(m => m.nama).join(', ')}
                              </div>
                            </div>
                          ) : (
                            <span className="badge" style={{ fontSize: 10, background: 'var(--sf2)', color: 'var(--tx3)', border: '1px solid var(--br)' }}>
                              🛠️ CONSUMABLE
                            </span>
                          )}
                        </td>

                        <td data-label="Klasifikasi Dampak">
                          {sp.dampakDowntime === 'STOP_TOTAL' ? (
                            <span className="badge badge-red" style={{ fontSize: 10, fontWeight: 700 }}>
                              ⚡ STOP_TOTAL
                            </span>
                          ) : sp.dampakDowntime === 'CONSUMABLE' ? (
                            <span className="badge" style={{ fontSize: 10, background: 'rgba(168,85,247,0.12)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.3)', fontWeight: 600 }}>
                              🛠️ CONSUMABLE
                            </span>
                          ) : (
                            <span className="badge" style={{ fontSize: 10, background: 'var(--sf2)', color: 'var(--tx3)', border: '1px solid var(--br)' }}>
                              KURANGI_PRODUKTIVITAS
                            </span>
                          )}
                        </td>

                        <td data-label="Pemakaian 12M vs 6M vs 3M" style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 11, display: 'flex', gap: 6, justifyContent: 'center', fontFamily: 'monospace' }}>
                            <span title="Rata-rata 12 Bulan" style={{ color: 'var(--tx3)' }}>12M: <strong>{sp.avgMonthly12m}</strong></span>
                            <span>|</span>
                            <span title="Rata-rata 6 Bulan" style={{ color: 'var(--tx2)' }}>6M: <strong>{sp.avgMonthly6m}</strong></span>
                            <span>|</span>
                            <span title="Rata-rata 3 Bulan" style={{ color: sp.spikeTrend === 'SPIKE_UP' ? '#f97316' : 'var(--tx)', fontWeight: 700 }}>
                              3M: {sp.avgMonthly3m}
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                            Kalkulasi ROP: <strong>{sp.avgMonthlyUsage} {sp.uom}/bln</strong>
                          </div>
                        </td>

                        <td data-label="Deteksi Lonjakan" style={{ textAlign: 'center' }}>
                          {sp.spikeTrend === 'SPIKE_UP' ? (
                            <span className="badge" style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.4)', fontSize: 10, fontWeight: 800 }}>
                              ⚡ LONJAKAN ({sp.spikePercentage})
                            </span>
                          ) : sp.spikeTrend === 'TREND_DOWN' ? (
                            <span className="badge" style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)', fontSize: 10 }}>
                              📉 TURUN ({sp.spikePercentage})
                            </span>
                          ) : (
                            <span className="text-muted" style={{ fontSize: 11 }}>
                              ✓ Stabil
                            </span>
                          )}
                        </td>

                        <td data-label="Rincian Bulanan" style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ height: 26, fontSize: 10, padding: '2px 8px' }}
                            onClick={() => toggleRow(sp.id)}
                          >
                            {isExpanded ? '▲ Tutup' : '📅 Rincian'}
                          </button>
                        </td>

                        <td data-label="Lead Time" style={{ textAlign: 'center' }}>
                          <span className="badge badge-gray" style={{ fontSize: 11 }}>
                            {sp.leadTime} Hari
                          </span>
                        </td>

                        <td data-label="Jalur Rumus" style={{ textAlign: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              background: isJalurB ? 'rgba(234,179,8,0.12)' : 'var(--sf2)',
                              color: isJalurB ? '#ca8a04' : 'var(--tx2)',
                              border: isJalurB ? '1px solid rgba(234,179,8,0.3)' : '1px solid var(--br)',
                            }}
                          >
                            {isJalurB ? '⚡ Jalur B (Kritis-Slow)' : '🚢 Jalur A (Normal)'}
                          </span>
                        </td>

                        <td data-label="Min" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--tx2)' }}>
                          {sp.min} {sp.uom}
                        </td>

                        <td data-label="Max" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--tx2)' }}>
                          {sp.max} {sp.uom}
                        </td>

                        <td data-label="ROP" style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              fontWeight: 800,
                              fontSize: 14,
                              color: sp.isWajibPr ? '#ef4444' : 'var(--pur)',
                              background: sp.isWajibPr ? 'rgba(239,68,68,0.12)' : 'rgba(168,85,247,0.1)',
                              padding: '2px 8px',
                              borderRadius: 6,
                            }}
                          >
                            {sp.rop} {sp.uom}
                          </span>
                        </td>

                        <td data-label="Stok Saat Ini" style={{ textAlign: 'right' }}>
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: 14,
                              color: sp.isWajibPr ? '#ef4444' : 'var(--grn)',
                            }}
                          >
                            {sp.currentStock} {sp.uom}
                          </div>
                        </td>

                        <td data-label="Status &amp; Rekomendasi PR">
                          {sp.isWajibPr ? (
                            <div>
                              <span
                                className="badge"
                                style={{
                                  background: '#ef4444',
                                  color: '#fff',
                                  fontSize: 10,
                                  fontWeight: 800,
                                  padding: '3px 8px',
                                  boxShadow: '0 1px 4px rgba(239,68,68,0.4)',
                                }}
                              >
                                🚨 WAJIB PR/PO! (Stok &le; ROP)
                              </span>
                              {sp.catatan && (
                                <div style={{ fontSize: 10, color: '#f97316', marginTop: 4, fontWeight: 600 }}>
                                  💡 {sp.catatan}
                                </div>
                              )}
                            </div>
                          ) : sp.catatan ? (
                            <div style={{ fontSize: 10, color: '#f97316', fontWeight: 600 }}>
                              💡 {sp.catatan}
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--grn)', fontWeight: 600 }}>
                              ✓ Stok Aman
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded Month-by-Month Matrix Row */}
                      {isExpanded && (
                        <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                          <td colSpan={14} style={{ padding: '12px 16px', borderBottom: '1px solid var(--br)' }}>
                            <div
                              style={{
                                background: 'var(--sf2)',
                                border: '1px solid var(--br)',
                                borderRadius: 8,
                                padding: 12,
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>
                                  📅 Rincian Pemakaian Bulanan (12 Bulan Terakhir) — <span style={{ color: 'var(--pur)' }}>{sp.nama}</span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                                  Puncak Pemakaian: <strong style={{ color: '#f97316' }}>{sp.peakMonthInfo}</strong>
                                </div>
                              </div>

                              {/* Monthly Bar Cards */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, textAlign: 'center', marginBottom: 12 }}>
                                {sp.monthlyBreakdown?.map((mb) => {
                                  const [y, m] = mb.monthKey.split('-');
                                  const isSelected = (selectedYear === 'ALL' || selectedYear === y) && (selectedMonth === 'ALL' || selectedMonth === m);
                                  const isPeak = sp.peakMonthInfo.includes(mb.monthLabel) && mb.qty > 0;

                                  return (
                                    <div
                                      key={mb.monthKey}
                                      style={{
                                        background: isSelected
                                          ? (mb.qty > 0 ? 'rgba(168,85,247,0.2)' : 'var(--sf3)')
                                          : (mb.qty > 0 ? (isPeak ? 'rgba(249,115,22,0.15)' : 'var(--sf3)') : 'rgba(0,0,0,0.15)'),
                                        border: isSelected
                                          ? '2px solid var(--pur)'
                                          : (isPeak ? '1px solid #f97316' : '1px solid var(--br)'),
                                        borderRadius: 6,
                                        padding: '6px 4px',
                                      }}
                                    >
                                      <div style={{ fontSize: 10, color: isSelected ? 'var(--pur)' : 'var(--tx3)', fontWeight: isSelected ? 700 : 600 }}>
                                        {mb.monthLabel}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 13,
                                          fontWeight: mb.qty > 0 ? 800 : 400,
                                          color: mb.qty > 0 ? (isPeak ? '#f97316' : 'var(--tx)') : 'var(--tx3)',
                                          marginTop: 2,
                                        }}
                                      >
                                        {mb.qty} <span style={{ fontSize: 9 }}>{sp.uom}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Specific Transactions Log */}
                              {sp.monthlyBreakdown?.some((mb) => mb.transactions?.length > 0) && (
                                <div style={{ borderTop: '1px solid var(--br)', paddingTop: 8, marginTop: 8 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 6 }}>
                                    📝 Transaksi Keluar Pada Periode Ini:
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {sp.monthlyBreakdown
                                      .filter((mb) => {
                                        const [y, m] = mb.monthKey.split('-');
                                        if (selectedYear !== 'ALL' && selectedYear !== y) return false;
                                        if (selectedMonth !== 'ALL' && selectedMonth !== m) return false;
                                        return mb.transactions.length > 0;
                                      })
                                      .flatMap((mb) => mb.transactions)
                                      .map((tx, idx) => (
                                        <div
                                          key={idx}
                                          style={{
                                            fontSize: 11,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justify: 'space-between',
                                            background: 'var(--sf3)',
                                            padding: '4px 10px',
                                            borderRadius: 4,
                                          }}
                                        >
                                          <span>📅 {tx.tanggal}</span>
                                          <span style={{ fontWeight: 700, color: '#f97316' }}>{tx.qty} {sp.uom}</span>
                                          <span style={{ color: 'var(--tx3)', flex: 1, marginLeft: 16, textAlign: 'right' }}>
                                            {tx.keterangan || 'Tanpa Catatan'}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
