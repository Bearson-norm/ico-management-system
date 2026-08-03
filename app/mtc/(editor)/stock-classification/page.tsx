'use client';
import React, { useState, useEffect, useCallback } from 'react';

interface SpClassification {
  id: string;
  nama: string;
  uom: string;
  lokasi: string;
  harga: number;
  currentStock: number;
  mesins: { id: number; nama: string; vital: boolean }[];
  isVital: boolean;
  vitalMesins: string[];
  dampakDowntime: 'STOP_TOTAL' | 'KURANGI_PRODUKTIVITAS';
  freqOutPeriod: number;
  totalOutPeriod: number;
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
  const [bulan, setBulan] = useState(12);
  const [slowThreshold, setSlowThreshold] = useState(1.0);
  const [filterJalur, setFilterJalur] = useState<string>('');
  const [onlyWajibPr, setOnlyWajibPr] = useState(false);
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mtc/stock-classification?bulan=${bulan}&slowThreshold=${slowThreshold}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [bulan, slowThreshold]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Counts for summary cards
  const totalWajibPr = data.filter((d) => d.isWajibPr).length;
  const totalJalurB = data.filter((d) => d.jalur.includes('B')).length;
  const totalJalurA = data.filter((d) => d.jalur.includes('A')).length;

  const filtered = data.filter((d) => {
    if (onlyWajibPr && !d.isWajibPr) return false;
    if (filterJalur && !d.jalur.includes(filterJalur)) return false;
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
            <div className="page-title">📊 Perhitungan Min, Max &amp; ROP (Reorder Point)</div>
            <div className="page-sub">
              Rekomendasi stok otomatis berdasarkan rata-rata pemakaian 12 bulan terakhir, lead time &amp; kritikalitas mesin (Jalur A vs Jalur B)
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Controls Card */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
                <label className="form-label" style={{ fontSize: 11 }}>📅 Periode Analisis (Bulan)</label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  max={60}
                  value={bulan}
                  onChange={(e) => setBulan(Math.max(1, parseInt(e.target.value) || 12))}
                  style={{ height: 36 }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
                <label className="form-label" style={{ fontSize: 11 }}>⚙️ Ambang Jarang Keluar (Jalur B)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--tx3)' }}>&lt;</span>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input"
                    min={0.1}
                    value={slowThreshold}
                    onChange={(e) => setSlowThreshold(Math.max(0.1, parseFloat(e.target.value) || 1.0))}
                    style={{ height: 36 }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>x / bulan</span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={fetchData}
                disabled={loading}
                style={{ height: 36, alignSelf: 'flex-end' }}
              >
                {loading ? '⏳ Hitung Ulang...' : '🔄 Hitung Ulang &amp; Update ROP'}
              </button>
            </div>
          </div>
        </div>

        {/* Summary Dashboard Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
          {/* Card 1: Wajib PR */}
          <div
            className="card"
            onClick={() => {
              setOnlyWajibPr(!onlyWajibPr);
              setFilterJalur('');
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
              Stok &le; ROP (Perlu Segera Dibeli)
            </div>
          </div>

          {/* Card 2: Jalur B */}
          <div
            className="card"
            onClick={() => {
              setFilterJalur(filterJalur === 'B' ? '' : 'B');
              setOnlyWajibPr(false);
            }}
            style={{
              cursor: 'pointer',
              border: filterJalur === 'B' ? '2px solid #f97316' : '1px solid rgba(249,115,22,0.3)',
              background: 'rgba(249,115,22,0.06)',
              padding: '14px 16px',
              borderRadius: 'var(--r)',
              transition: 'all .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f97316' }}>{totalJalurB}</div>
              <span className="badge" style={{ background: 'rgba(249,115,22,0.2)', color: '#f97316', fontSize: 11, fontWeight: 700 }}>
                ⚡ JALUR B
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginTop: 6 }}>
              Kritis - Jarang Keluar (Buffer 1-2 Pcs)
            </div>
          </div>

          {/* Card 3: Jalur A */}
          <div
            className="card"
            onClick={() => {
              setFilterJalur(filterJalur === 'A' ? '' : 'A');
              setOnlyWajibPr(false);
            }}
            style={{
              cursor: 'pointer',
              border: filterJalur === 'A' ? '2px solid var(--pur)' : '1px solid var(--br)',
              background: 'var(--sf2)',
              padding: '14px 16px',
              borderRadius: 'var(--r)',
              transition: 'all .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--tx)' }}>{totalJalurA}</div>
              <span className="badge" style={{ background: 'var(--sf3)', color: 'var(--tx2)', fontSize: 11, fontWeight: 600 }}>
                🚢 JALUR A
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginTop: 6 }}>
              Sparepart Normal / High Turnover
            </div>
          </div>

          {/* Card 4: Total Spareparts */}
          <div
            className="card"
            onClick={() => {
              setFilterJalur('');
              setOnlyWajibPr(false);
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
                  placeholder="Cari item ID / nama sparepart / mesin..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {(onlyWajibPr || filterJalur || search) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setOnlyWajibPr(false);
                    setFilterJalur('');
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
                  <th>Klasifikasi Dampak</th>
                  <th style={{ textAlign: 'right' }}>Rata-rata Pemakaian</th>
                  <th style={{ textAlign: 'center' }}>Lead Time</th>
                  <th style={{ textAlign: 'center' }}>Jalur Rumus</th>
                  <th style={{ textAlign: 'right' }}>Min</th>
                  <th style={{ textAlign: 'right' }}>Max</th>
                  <th style={{ textAlign: 'right' }}>ROP</th>
                  <th style={{ textAlign: 'right' }}>Stok Saat Ini</th>
                  <th>Keterangan / Aksi PR</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: 48, color: 'var(--tx3)' }}>
                      {data.length === 0 ? '⏳ Memuat data kalkulasi ROP...' : 'Tidak ada sparepart yang cocok dengan filter.'}
                    </td>
                  </tr>
                )}
                {filtered.map((sp) => {
                  const isJalurB = sp.jalur.includes('B');
                  return (
                    <tr
                      key={sp.id}
                      style={{
                        background: sp.isWajibPr ? 'rgba(239,68,68,0.04)' : 'transparent',
                      }}
                    >
                      <td data-label="Item ID" className="text-mono text-tiny text-muted">{sp.id}</td>

                      <td data-label="Nama Sparepart">
                        <div style={{ fontWeight: 700, color: 'var(--tx)' }}>{sp.nama}</div>
                        {sp.vitalMesins.length > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2 }}>
                            ⚡ Mesin: {sp.vitalMesins.join(', ')}
                          </div>
                        )}
                      </td>

                      <td data-label="Klasifikasi Dampak">
                        {sp.isVital ? (
                          <span className="badge badge-red" style={{ fontSize: 10, fontWeight: 700 }}>
                            ⚡ STOP_TOTAL
                          </span>
                        ) : (
                          <span className="badge" style={{ fontSize: 10, background: 'var(--sf2)', color: 'var(--tx3)', border: '1px solid var(--br)' }}>
                            KURANGI_PRODUKTIVITAS
                          </span>
                        )}
                      </td>

                      <td data-label="Rata-rata Pemakaian" style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: sp.avgMonthlyUsage > 0 ? 'var(--tx)' : 'var(--tx3)' }}>
                          {sp.avgMonthlyUsage} {sp.uom}/bln
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>
                          ({sp.dailyUsage}/hari) • Total: {sp.totalOutPeriod} {sp.uom}
                        </div>
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
                            background: isJalurB ? 'rgba(249,115,22,0.12)' : 'var(--sf2)',
                            color: isJalurB ? '#f97316' : 'var(--tx2)',
                            border: isJalurB ? '1px solid rgba(249,115,22,0.3)' : '1px solid var(--br)',
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

                      <td data-label="Keterangan / Aksi PR">
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
