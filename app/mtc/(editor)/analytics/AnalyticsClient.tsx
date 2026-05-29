'use client';

import React, { useState, useMemo } from 'react';
import ProcurementSelect from '@/components/shared/ProcurementSelect';

interface SparepartData {
  id: string;
  nama: string;
  kategori: string;
  uom: string;
  lokasi: string;
  harga: number;
  currentStock: number;
  avgLeadTime: number;
  maxLeadTime: number;
  prDate: Date | string | null;
  poDate: Date | string | null;
  purchasingStatus: string;
  minQty: number;
  avgDailyUsage: number;
  avgMonthlyUsage: number;
  safetyStock: number;
  ssFormulaUsed: string;
  rop: number;
  isCritical: boolean;
  eoq: number;
  annualDemand: number;
  mesins: string[];
}

interface MovementData {
  id: number;
  tipe: string;
  sparepartId: string | null;
  namaItem: string | null;
  qty: number;
  harga: any;
  tanggal: Date | string;
}

function fmtRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export default function AnalyticsClient({
  spareparts: initialSpareparts,
  outMovements,
  criticalItemsCount,
  averageMtcLeadTime,
  totalPRActive,
  totalPOActive,
}: {
  spareparts: SparepartData[];
  outMovements: any[];
  criticalItemsCount: number;
  averageMtcLeadTime: number;
  totalPRActive: number;
  totalPOActive: number;
}) {
  const [activeTab, setActiveTab] = useState<'trends' | 'rop' | 'vendors'>('trends');
  const [chartType, setChartType] = useState<'qty' | 'value'>('value');
  const [chartPeriod, setChartPeriod] = useState<'monthly' | 'quarterly'>('monthly');
  const [search, setSearch] = useState('');
  const [kategoriFilter, setKategoriFilter] = useState('');
  const [mesinFilter, setMesinFilter] = useState('');
  
  const [sparepartsState, setSparepartsState] = useState<SparepartData[]>(initialSpareparts);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [showFutureModal, setShowFutureModal] = useState(false);

  // Extract unique categories and machines for filters
  const categories = useMemo(() => {
    const set = new Set(sparepartsState.map((sp) => sp.kategori));
    return Array.from(set).filter(Boolean).sort();
  }, [sparepartsState]);

  const machines = useMemo(() => {
    const list: string[] = [];
    sparepartsState.forEach(sp => {
      sp.mesins.forEach(m => {
        if (!list.includes(m)) list.push(m);
      });
    });
    return list.sort();
  }, [sparepartsState]);

  // Dynamic Grouping of Out Movements for Monthly & Quarterly usage charts
  const aggregatedCharts = useMemo(() => {
    const now = new Date();
    
    // 1. Monthly Grouping
    const monthlyMap: Record<string, { label: string; qty: number; value: number; timestamp: number }> = {};
    // Pre-populate last 12 months in order
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('id-ID', { month: 'short', year: '2-digit' });
      monthlyMap[key] = { label, qty: 0, value: 0, timestamp: d.getTime() };
    }

    // 2. Quarterly Grouping
    const quarterlyMap: Record<string, { label: string; qty: number; value: number; timestamp: number }> = {};
    // Pre-populate last 4 quarters
    for (let i = 3; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - (i * 3), 1);
      const q = Math.floor(d.getMonth() / 3) + 1;
      const key = `${d.getFullYear()}-Q${q}`;
      const label = `Kuartal ${q} ${d.getFullYear().toString().slice(-2)}`;
      quarterlyMap[key] = { label, qty: 0, value: 0, timestamp: d.getTime() };
    }

    outMovements.forEach((m) => {
      const mDate = new Date(m.tanggal);
      const mQty = m.qty || 0;
      const mVal = mQty * Number(m.harga || 0);

      // Monthly mapping
      const mKey = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap[mKey]) {
        monthlyMap[mKey].qty += mQty;
        monthlyMap[mKey].value += mVal;
      }

      // Quarterly mapping
      const q = Math.floor(mDate.getMonth() / 3) + 1;
      const qKey = `${mDate.getFullYear()}-Q${q}`;
      if (quarterlyMap[qKey]) {
        quarterlyMap[qKey].qty += mQty;
        quarterlyMap[qKey].value += mVal;
      }
    });

    const monthlyData = Object.values(monthlyMap);
    const quarterlyData = Object.values(quarterlyMap);

    return {
      monthly: monthlyData,
      quarterly: quarterlyData,
    };
  }, [outMovements]);

  // Handler to sync dynamic ROP value to minQty in Postgres via PUT API
  const handleSyncRop = async (sp: SparepartData) => {
    setShowFutureModal(true);
  };

  // Filter spareparts for display
  const filteredSpareparts = useMemo(() => {
    return sparepartsState.filter(sp => {
      const matchSearch = sp.nama.toLowerCase().includes(search.toLowerCase()) || 
                          sp.id.toLowerCase().includes(search.toLowerCase());
      const matchKategori = !kategoriFilter || sp.kategori === kategoriFilter;
      const matchMesin = !mesinFilter || sp.mesins.includes(mesinFilter);
      return matchSearch && matchKategori && matchMesin;
    });
  }, [sparepartsState, search, kategoriFilter, mesinFilter]);

  const activePRPOItems = useMemo(() => {
    return sparepartsState.filter(sp => sp.purchasingStatus === 'PR' || sp.purchasingStatus === 'PO');
  }, [sparepartsState]);

  // Chart Rendering Variables
  const activeChartData = chartPeriod === 'monthly' ? aggregatedCharts.monthly : aggregatedCharts.quarterly;
  const maxChartVal = useMemo(() => {
    const vals = activeChartData.map(d => chartType === 'qty' ? d.qty : d.value);
    const max = Math.max(...vals, 1);
    return max;
  }, [activeChartData, chartType]);

  // Refresh page data when update triggers
  const handleStatusUpdate = () => {
    window.location.reload();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">📈 ERP ROP & Analytics Suku Cadang</div>
          <div className="page-sub">Analisis konsumsi stok cerdas, lead time vendor, dan otomatisasi batas pesanan ROP</div>
        </div>
      </div>

      <div className="page-body">
        {/* ==================== DEVELOPMENT ROADMAP BANNER ==================== */}
        <div style={{ 
          background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(19,19,26,0.85) 100%)',
          border: '1px solid var(--pur-b)',
          borderRadius: 8,
          padding: '16px 20px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          boxShadow: 'var(--shadow)'
        }}>
          <div style={{ fontSize: 24 }}>🚧</div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--pur)', fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Rencana Pengembangan ERP MTC (Future Roadmap)
            </div>
            <div style={{ color: 'var(--tx2)', fontSize: 12, marginTop: 4 }}>
              Halaman ini adalah pratinjau simulasi (*preview mode*) dari sistem otomatisasi Reorder Point (ROP) & integrasi Lead Time dinamis yang disiapkan untuk fase pengembangan selanjutnya.
            </div>
          </div>
        </div>

        {/* ==================== UPPER ERP METRIC CARDS ==================== */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          <div className="stat-card" style={{
            background: 'linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(19,19,26,0.65) 100%)',
            border: '1px solid var(--red-b)',
            borderLeft: '4px solid var(--red)'
          }}>
            <div className="stat-label" style={{ color: 'var(--red)', fontWeight: 800 }}>🚨 Perlu PR / Dibawah ROP</div>
            <div className="stat-value" style={{ color: criticalItemsCount > 0 ? 'var(--red)' : 'var(--tx)' }}>{criticalItemsCount} Item</div>
            <div className="stat-sub">Stok saat ini &le; ERP Reorder Point</div>
          </div>

          <div className="stat-card" style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(19,19,26,0.65) 100%)',
            border: '1px solid var(--ylw-b)',
            borderLeft: '4px solid var(--ylw)'
          }}>
            <div className="stat-label" style={{ color: 'var(--ylw)', fontWeight: 800 }}>⏳ Tahap Pengadaan Aktif</div>
            <div className="stat-value">{totalPRActive + totalPOActive} Item</div>
            <div className="stat-sub">Sedang PR: <span style={{ fontWeight: 700, color: 'var(--ylw)' }}>{totalPRActive}</span> · Sudah PO: <span style={{ fontWeight: 700, color: 'var(--blu)' }}>{totalPOActive}</span></div>
          </div>

          <div className="stat-card" style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.06) 0%, rgba(19,19,26,0.65) 100%)',
            border: '1px solid var(--blu-b)',
            borderLeft: '4px solid var(--blu)'
          }}>
            <div className="stat-label" style={{ color: 'var(--blu)', fontWeight: 800 }}>🚚 Rata-Rata Lead Time</div>
            <div className="stat-value">{averageMtcLeadTime} Hari</div>
            <div className="stat-sub">Durasi pengiriman PR &rarr; Restock</div>
          </div>

          <div className="stat-card" style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(19,19,26,0.65) 100%)',
            border: '1px solid var(--grn-b)',
            borderLeft: '4px solid var(--grn)'
          }}>
            <div className="stat-label" style={{ color: 'var(--grn)', fontWeight: 800 }}>💰 Penghematan Holding (EOQ)</div>
            <div className="stat-value">{fmtRupiah(sparepartsState.reduce((sum, sp) => sum + (sp.currentStock > 0 ? (sp.eoq * sp.harga * 0.05) : 0), 0))}</div>
            <div className="stat-sub">Optimasi biaya pemesanan vs penyimpanan</div>
          </div>
        </div>

        {/* ==================== TAB NAVIGATION ==================== */}
        <div className="nav-wrap nav-wrap--scroll" style={{ marginBottom: 20 }}>
          <button 
            type="button" 
            className={`ntab ${activeTab === 'trends' ? 'act-rp' : ''}`} 
            onClick={() => setActiveTab('trends')}
          >
            📊 Tren Pemakaian Suku Cadang
          </button>
          <button 
            type="button" 
            className={`ntab ${activeTab === 'rop' ? 'act-in' : ''}`} 
            onClick={() => setActiveTab('rop')}
          >
            ⚙️ Otomatisasi ERP ROP & EOQ
          </button>
          <button 
            type="button" 
            className={`ntab ${activeTab === 'vendors' ? 'act-out' : ''}`} 
            onClick={() => setActiveTab('vendors')}
          >
            🚚 Pemantauan Vendor & Lead Time
          </button>
        </div>

        {/* ==================== TAB 1: VISUAL USAGE TRENDS ==================== */}
        {activeTab === 'trends' && (
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="card-title">📈 Grafik Analisis Pemakaian Suku Cadang</div>
                <div className="card-subtitle" style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>
                  Visualisasi kuantitas dan nilai pengeluaran barang (Stock Out) terhitung dari 12 bulan terakhir
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Period Select */}
                <select 
                  className="form-input form-select" 
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                  value={chartPeriod}
                  onChange={(e) => setChartPeriod(e.target.value as any)}
                >
                  <option value="monthly">Pemakaian Bulanan</option>
                  <option value="quarterly">Pemakaian Kuartal</option>
                </select>
                {/* Metric Select */}
                <select 
                  className="form-input form-select" 
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                  value={chartType}
                  onChange={(e) => setChartType(e.target.value as any)}
                >
                  <option value="qty">Kuantitas Pemakaian (Pcs)</option>
                  <option value="value">Nilai Pengeluaran (Rupiah - Rp)</option>
                </select>
              </div>
            </div>

            {/* Premium Custom HTML/CSS Bar Chart */}
            <div style={{ padding: '24px 16px', background: 'var(--sf2)', borderRadius: 8, margin: '12px 24px 24px 24px', border: '1px solid var(--br)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 260, paddingBottom: 12, borderBottom: '1px solid var(--br)', position: 'relative' }}>
                {/* Y-axis gridlines */}
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', pointerEvents: 'none', opacity: 0.1 }}>
                  <div style={{ borderTop: '1px dashed var(--tx)', width: '100%' }}></div>
                  <div style={{ borderTop: '1px dashed var(--tx)', width: '100%' }}></div>
                  <div style={{ borderTop: '1px dashed var(--tx)', width: '100%' }}></div>
                  <div style={{ borderTop: '1px dashed var(--tx)', width: '100%' }}></div>
                </div>

                {activeChartData.map((d, index) => {
                  const val = chartType === 'qty' ? d.qty : d.value;
                  const pct = (val / maxChartVal) * 100;
                  
                  return (
                    <div 
                      key={index} 
                      style={{ 
                        flex: 1, 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'center', 
                        height: '100%', 
                        justifyContent: 'flex-end', 
                        zIndex: 2,
                        padding: '0 4px'
                      }}
                    >
                      {/* Tooltip on Hover */}
                      <div className="chart-bar-hover-val" style={{ 
                        fontSize: 10, 
                        fontWeight: 700, 
                        color: chartType === 'qty' ? 'var(--pur)' : 'var(--grn)', 
                        marginBottom: 6,
                        opacity: val > 0 ? 1 : 0 
                      }}>
                        {chartType === 'qty' ? `${val} Pcs` : fmtRupiah(val)}
                      </div>

                      {/* Bar Fill */}
                      <div 
                        style={{ 
                          width: '80%', 
                          maxWidth: 32, 
                          height: `${Math.max(3, pct)}%`, 
                          background: chartType === 'qty' 
                            ? 'linear-gradient(to top, rgba(139,92,246,0.3) 0%, var(--pur) 100%)' 
                            : 'linear-gradient(to top, rgba(16,185,129,0.3) 0%, var(--grn) 100%)', 
                          borderRadius: '4px 4px 0 0',
                          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                        }}
                        title={`${d.label}: ${chartType === 'qty' ? `${val} Pcs` : fmtRupiah(val)}`}
                      />

                      {/* Bar Label */}
                      <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 8, whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {d.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, padding: '0 24px 24px 24px' }}>
              <div style={{ background: 'var(--sf3)', padding: 16, borderRadius: 8, border: '1px solid var(--br)' }}>
                <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Total Kuantitas Konsumsi (12 Bulan)</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: 'var(--pur)' }}>
                  {outMovements.reduce((sum, m) => sum + (m.qty || 0), 0).toLocaleString('id-ID')} Pcs
                </div>
              </div>
              <div style={{ background: 'var(--sf3)', padding: 16, borderRadius: 8, border: '1px solid var(--br)' }}>
                <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Total Nilai Konsumsi Rupiah (12 Bulan)</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: 'var(--grn)' }}>
                  {fmtRupiah(outMovements.reduce((sum, m) => sum + ((m.qty || 0) * Number(m.harga || 0)), 0))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: ERP ROP & EOQ TABLE ==================== */}
        {activeTab === 'rop' && (
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="card-title">⚙️ Otomatisasi ERP Reorder Point (ROP) & EOQ</div>
              
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%', marginTop: 8 }}>
                {/* Search */}
                <input 
                  type="text" 
                  placeholder="Cari Suku Cadang (ID / Nama)..." 
                  className="form-input" 
                  style={{ flex: 2, minWidth: 200, padding: '8px 12px', fontSize: 13 }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                
                {/* Category Filter */}
                <select 
                  className="form-input form-select" 
                  style={{ flex: 1, minWidth: 140, padding: '8px 12px', fontSize: 13 }}
                  value={kategoriFilter}
                  onChange={(e) => setKategoriFilter(e.target.value)}
                >
                  <option value="">Semua Kategori</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                {/* Machine BOM Filter */}
                <select 
                  className="form-input form-select" 
                  style={{ flex: 1, minWidth: 140, padding: '8px 12px', fontSize: 13 }}
                  value={mesinFilter}
                  onChange={(e) => setMesinFilter(e.target.value)}
                >
                  <option value="">Semua Induk Mesin (BOM)</option>
                  {machines.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table className="table-stack">
                <thead>
                  <tr>
                    <th>Item ID & Nama Suku Cadang</th>
                    <th style={{ textAlign: 'right' }}>Stok Aktif</th>
                    <th style={{ textAlign: 'right' }}>Rata-rata/Bulan</th>
                    <th style={{ textAlign: 'right' }}>Avg LeadTime</th>
                    <th>Safety Stock (SS)</th>
                    <th>ERP ROP</th>
                    <th>EOQ (Rekomendasi Pesan)</th>
                    <th style={{ textAlign: 'center' }}>Pengadaan</th>
                    <th style={{ textAlign: 'right' }}>Otomatisasi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSpareparts.map((sp) => {
                    const isROPReached = (sp.currentStock <= sp.rop);
                    const minQtyMatchesRop = sp.minQty === sp.rop;
                    
                    return (
                      <tr key={sp.id} style={{
                        background: isROPReached ? 'rgba(239,68,68,0.02)' : 'inherit',
                        borderLeft: isROPReached ? '3px solid var(--red)' : '3px solid transparent'
                      }}>
                        <td data-label="Barang">
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {sp.nama}
                            {isROPReached && (
                              <span className="badge badge-red" style={{ fontSize: 9, padding: '1px 5px' }}>🚨 ORDER NOW</span>
                            )}
                          </div>
                          <span className="text-muted text-mono text-tiny">{sp.id} · {sp.kategori}</span>
                        </td>
                        
                        <td data-label="Stok" style={{ 
                          textAlign: 'right', 
                          fontWeight: 700,
                          color: sp.currentStock === 0 ? 'var(--red)' : sp.currentStock <= sp.rop ? 'var(--ylw)' : 'var(--grn)'
                        }}>
                          {sp.currentStock} {sp.uom}
                        </td>
                        
                        <td data-label="Rata-rata/Bulan" style={{ textAlign: 'right', fontWeight: 600 }}>
                          {Number(sp.avgMonthlyUsage.toFixed(1))} {sp.uom}
                        </td>

                        <td data-label="Avg LeadTime" style={{ textAlign: 'right', fontWeight: 600 }}>
                          {sp.avgLeadTime > 0 ? `${sp.avgLeadTime} hari` : '—'}
                        </td>
                        
                        <td data-label="Safety Stock">
                          <div style={{ fontWeight: 600 }}>{sp.safetyStock} {sp.uom}</div>
                          <span className="text-muted" style={{ fontSize: 9 }}>{sp.avgLeadTime > 0 ? 'ERP Max formula' : '3-hari buffer'}</span>
                        </td>
                        
                        <td data-label="ERP ROP" style={{ fontWeight: 700 }}>
                          <span style={{ color: isROPReached ? 'var(--red)' : 'inherit' }}>
                            {sp.rop} {sp.uom}
                          </span>
                        </td>

                        <td data-label="EOQ">
                          <span className="badge badge-pur" style={{ fontWeight: 700 }}>
                            {sp.eoq} {sp.uom}
                          </span>
                          <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>
                            {fmtRupiah(sp.eoq * sp.harga)}
                          </div>
                        </td>

                        <td data-label="Pengadaan" style={{ textAlign: 'center' }}>
                          <ProcurementSelect 
                            itemId={sp.id} 
                            initialStatus={sp.purchasingStatus || 'NONE'} 
                            onUpdate={handleStatusUpdate}
                          />
                        </td>
                        
                        <td data-label="Otomatisasi" style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className={`btn btn-sm ${minQtyMatchesRop ? 'btn-ghost' : 'btn-primary'}`}
                            style={{ 
                              fontSize: 11, 
                              padding: '4px 10px',
                              opacity: minQtyMatchesRop ? 0.6 : 1,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            onClick={() => handleSyncRop(sp)}
                            disabled={syncingId === sp.id || minQtyMatchesRop}
                          >
                            {syncingId === sp.id ? '⏳ Sync...' : minQtyMatchesRop ? '✓ Sinkron' : '⚡ Terapkan ROP'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredSpareparts.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--tx3)' }}>
                        Data suku cadang tidak ditemukan
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: VENDOR MONITORING ==================== */}
        {activeTab === 'vendors' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">🚚 Pemantauan Pengiriman Vendor & Lead Time Aktif</div>
              <div className="card-subtitle" style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>
                Melacak secara real-time barang yang sedang dalam proses pengadaan (PR / PO) untuk mengukur performa pengiriman vendor
              </div>
            </div>

            <div className="table-wrap">
              <table className="table-clean">
                <thead>
                  <tr>
                    <th>Suku Cadang</th>
                    <th>Status Pengadaan</th>
                    <th>Awal Pengajuan (PR)</th>
                    <th>Waktu Berjalan</th>
                    <th>Rata-rata Historis</th>
                    <th style={{ width: '30%' }}>Progres Kedatangan</th>
                  </tr>
                </thead>
                <tbody>
                  {activePRPOItems.map((sp) => {
                    const prDateObj = sp.prDate ? new Date(sp.prDate) : null;
                    const elapsedDays = prDateObj 
                      ? Math.max(0.5, (now.getTime() - prDateObj.getTime()) / (1000 * 60 * 60 * 24))
                      : 0;
                    
                    const historicalAvg = sp.avgLeadTime || 3; // Fallback to 3 days if no average
                    const pct = Math.min(100, (elapsedDays / historicalAvg) * 100);
                    const isOverdue = (elapsedDays > historicalAvg);

                    return (
                      <tr key={sp.id}>
                        <td style={{ fontWeight: 600 }}>
                          <div>{sp.nama}</div>
                          <span className="text-muted text-tiny text-mono">{sp.id} · {sp.kategori}</span>
                        </td>
                        
                        <td>
                          {sp.purchasingStatus === 'PR' ? (
                            <span className="badge badge-ylw" style={{ fontWeight: 800 }}>⏳ SEDANG PR</span>
                          ) : (
                            <span className="badge badge-blu" style={{ fontWeight: 800 }}>📦 SUDAH PO</span>
                          )}
                        </td>

                        <td className="text-tiny">
                          {prDateObj ? prDateObj.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>

                        <td style={{ fontWeight: 700 }}>
                          <span style={{ color: isOverdue ? 'var(--red)' : 'inherit' }}>
                            {Number(elapsedDays.toFixed(1))} Hari
                          </span>
                        </td>

                        <td style={{ fontWeight: 600, color: 'var(--tx3)' }}>
                          {sp.avgLeadTime > 0 ? `${sp.avgLeadTime} Hari` : '—'}
                        </td>

                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {/* Visual Progress Meter */}
                            <div style={{ height: 8, background: 'var(--sf3)', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--br)', position: 'relative' }}>
                              <div style={{ 
                                height: '100%', 
                                width: `${pct}%`, 
                                background: isOverdue ? 'var(--red)' : 'var(--blu)',
                                borderRadius: 4,
                                transition: 'width 0.4s ease'
                              }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                              <span style={{ color: isOverdue ? 'var(--red)' : 'var(--tx3)' }}>
                                {isOverdue ? `⏳ Terlambat ${Math.round(elapsedDays - historicalAvg)} hari` : '🚚 Sedang Dikirim'}
                              </span>
                              <span style={{ fontWeight: 700 }}>{Math.round(pct)}%</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {activePRPOItems.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--tx3)' }}>
                        Tidak ada barang yang sedang dalam pengadaan aktif. Semua stok terpenuhi atau normal.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
      </div>

      {showFutureModal && (
        <div className="modal-backdrop" onClick={() => setShowFutureModal(false)}>
          <div className="modal-box" style={{ maxWidth: 440, textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✨</div>
            <div className="modal-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              Fitur Rencana Masa Depan!
            </div>
            <p style={{ color: 'var(--tx2)', fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
              Otomatisasi ERP ROP, sinkronisasi nilai pengaman `minQty` ke database, dan modul analisis logistik ini adalah **rencana pengembangan masa depan (Future Roadmap)** MTC Anda.
            </p>
            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => setShowFutureModal(false)}
            >
              Mengerti, Tutup Preview
            </button>
          </div>
        </div>
      )}
    </>
  );
}
