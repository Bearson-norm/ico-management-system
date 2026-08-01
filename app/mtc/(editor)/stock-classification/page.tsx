'use client';
import React, { useState, useEffect, useCallback } from 'react';

type KlasifikasiType =
  | 'KRITIS - STOK MINIMAL (asuransi)'
  | 'KRITIS - STOK NORMAL'
  | 'NORMAL - STOK IKUT PERMINTAAN'
  | 'NON-STOK - BELI SAAT BUTUH';

interface SpClassification {
  id: string;
  nama: string;
  mesins: { id: number; nama: string; vital: boolean }[];
  isVital: boolean;
  vitalMesins: string[];
  freqOut: number;
  klasifikasi: KlasifikasiType;
  alasan: string;
}

const BADGE_STYLE: Record<KlasifikasiType, React.CSSProperties> = {
  'KRITIS - STOK MINIMAL (asuransi)': {
    background: 'rgba(239,68,68,0.12)',
    color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.35)',
    fontWeight: 700,
  },
  'KRITIS - STOK NORMAL': {
    background: 'rgba(249,115,22,0.12)',
    color: '#f97316',
    border: '1px solid rgba(249,115,22,0.35)',
    fontWeight: 700,
  },
  'NORMAL - STOK IKUT PERMINTAAN': {
    background: 'rgba(234,179,8,0.12)',
    color: '#ca8a04',
    border: '1px solid rgba(234,179,8,0.35)',
    fontWeight: 600,
  },
  'NON-STOK - BELI SAAT BUTUH': {
    background: 'var(--sf2)',
    color: 'var(--tx3)',
    border: '1px solid var(--br)',
    fontWeight: 500,
  },
};

const EMOJI_MAP: Record<KlasifikasiType, string> = {
  'KRITIS - STOK MINIMAL (asuransi)': '🔴',
  'KRITIS - STOK NORMAL': '🟠',
  'NORMAL - STOK IKUT PERMINTAAN': '🟡',
  'NON-STOK - BELI SAAT BUTUH': '⚪',
};

const ALL_KLASIFIKASI: KlasifikasiType[] = [
  'KRITIS - STOK MINIMAL (asuransi)',
  'KRITIS - STOK NORMAL',
  'NORMAL - STOK IKUT PERMINTAAN',
  'NON-STOK - BELI SAAT BUTUH',
];

export default function StockClassificationPage() {
  const [data, setData] = useState<SpClassification[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulan, setBulan] = useState(12);
  const [threshold, setThreshold] = useState(4);
  const [filterKlasifikasi, setFilterKlasifikasi] = useState('');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mtc/stock-classification?bulan=${bulan}&threshold=${threshold}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } finally {
      setLoading(false);
    }
  }, [bulan, threshold]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = ALL_KLASIFIKASI.map((k) => ({
    label: k,
    count: data.filter((d) => d.klasifikasi === k).length,
  }));

  const filtered = data.filter((d) => {
    if (filterKlasifikasi && d.klasifikasi !== filterKlasifikasi) return false;
    if (search && !d.nama.toLowerCase().includes(search.toLowerCase()) && !d.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="page-header">
        <div className="flex-between page-header-row">
          <div>
            <div className="page-title">🔬 Klasifikasi Kebutuhan Stok</div>
            <div className="page-sub">
              Analisis setiap sparepart berdasarkan kritikalitas mesin &amp; frekuensi keluar stok
            </div>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Filter Controls */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
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
                <label className="form-label" style={{ fontSize: 11 }}>📊 Ambang "Sering" (min. transaksi OUT)</label>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  value={threshold}
                  onChange={(e) => setThreshold(Math.max(1, parseInt(e.target.value) || 4))}
                  style={{ height: 36 }}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={fetchData}
                disabled={loading}
                style={{ height: 36, alignSelf: 'flex-end' }}
              >
                {loading ? '⏳ Memuat...' : '🔄 Hitung Ulang'}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--tx3)' }}>
              Frekuensi dihitung dari transaksi Stock Out dalam <strong>{bulan} bulan</strong> terakhir.
              Sparepart dianggap &quot;sering keluar&quot; jika ≥ <strong>{threshold} transaksi</strong>.
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          {summary.map((s) => (
            <div
              key={s.label}
              className="card"
              onClick={() => setFilterKlasifikasi(filterKlasifikasi === s.label ? '' : s.label)}
              style={{
                cursor: 'pointer',
                border: filterKlasifikasi === s.label ? '2px solid var(--pur)' : '1px solid var(--br)',
                padding: '14px 16px',
                transition: 'all .15s',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--tx)' }}>{s.count}</div>
              <div style={{ marginTop: 4, ...BADGE_STYLE[s.label as KlasifikasiType], padding: '2px 8px', borderRadius: 20, fontSize: 10, display: 'inline-block' }}>
                {EMOJI_MAP[s.label as KlasifikasiType]} {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Main Table */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="search-bar" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  type="text"
                  placeholder="Cari nama / item ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {filterKlasifikasi && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setFilterKlasifikasi('')}
                >
                  ✕ Reset Filter
                </button>
              )}
              <div style={{ fontSize: 12, color: 'var(--tx3)' }}>
                {filtered.length} dari {data.length} item
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="table-stack" style={{ opacity: loading ? 0.5 : 1 }}>
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th>Nama Sparepart</th>
                  <th>Mesin Terhubung</th>
                  <th>Vital</th>
                  <th style={{ textAlign: 'right' }}>Frek. Keluar</th>
                  <th>Klasifikasi</th>
                  <th>Alasan / Rekomendasi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--tx3)' }}>
                      {data.length === 0 ? '⏳ Klik "Hitung Ulang" untuk memulai analisis.' : 'Tidak ada data yang cocok.'}
                    </td>
                  </tr>
                )}
                {filtered.map((sp) => (
                  <tr key={sp.id}>
                    <td data-label="Item ID" className="text-mono text-tiny text-muted">{sp.id}</td>
                    <td data-label="Nama Sparepart" style={{ fontWeight: 600 }}>{sp.nama}</td>
                    <td data-label="Mesin Terhubung">
                      {sp.mesins.length === 0 ? (
                        <span className="text-muted" style={{ fontSize: 12 }}>—</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {sp.mesins.map((m) => (
                            <span
                              key={m.id}
                              className="badge"
                              style={{
                                fontSize: 10,
                                background: m.vital ? 'rgba(239,68,68,0.10)' : 'var(--sf2)',
                                color: m.vital ? '#ef4444' : 'var(--tx2)',
                                border: m.vital ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--br)',
                              }}
                            >
                              {m.vital ? '⚡ ' : ''}{m.nama}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td data-label="Vital">
                      {sp.isVital ? (
                        <div>
                          <span className="badge badge-red" style={{ fontSize: 10 }}>⚡ VITAL</span>
                          <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 3 }}>
                            {sp.vitalMesins.join(', ')}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td data-label="Frek. Keluar" style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 15,
                          color: sp.freqOut >= threshold ? 'var(--grn)' : 'var(--tx3)',
                        }}
                      >
                        {sp.freqOut}×
                      </span>
                      <div style={{ fontSize: 10, color: 'var(--tx3)' }}>/{bulan} bln</div>
                    </td>
                    <td data-label="Klasifikasi">
                      <span
                        style={{
                          ...BADGE_STYLE[sp.klasifikasi],
                          padding: '3px 8px',
                          borderRadius: 20,
                          fontSize: 10,
                          display: 'inline-block',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {EMOJI_MAP[sp.klasifikasi]} {sp.klasifikasi}
                      </span>
                    </td>
                    <td data-label="Alasan" style={{ fontSize: 12, color: 'var(--tx2)', maxWidth: 300 }}>
                      {sp.alasan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
