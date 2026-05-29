'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
type StockItem = {
  id: string; nama: string; kategori: string; lokasi: string;
  uom: string; harga: number; minQty: number;
  totalIn: number; totalOut: number; currentStock: number;
  status: 'safe' | 'low' | 'habis';
  purchasingStatus?: 'NONE' | 'PR' | 'PO';
  mesins?: { id: number, nama: string }[];
  _parsed?: { rak: string; kolom: string; level: string; bin: string; valid: boolean };
};

// Parse SLOC "1-A-1-1" → { rak:'1', kolom:'A', level:'1', bin:'1' }
function parseSLOC(sloc: string) {
  const p = (sloc || '').trim().split('-');
  if (p.length >= 4) return { rak: p[0], kolom: p[1], level: p[2], bin: p[3], valid: true };
  return { rak: sloc || '?', kolom: '', level: '', bin: '', valid: false };
}

// ── Chip lokasi visual — langsung terbaca tanpa decode manual ──────────────
type LocationChipProps = {
  parsed: ReturnType<typeof parseSLOC>;
  size?: 'sm' | 'md';     // sm = dalam list, md = search result
  hideRak?: boolean;       // dalam detail rak, tidak perlu ulang tampilkan Rak
};

function LocationChip({ parsed, size = 'sm', hideRak = false }: LocationChipProps) {
  if (!parsed.valid) return <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{parsed.rak}</span>;

  const seg = size === 'md'
    ? { fontSize: 13, labelSize: 9, padding: '6px 10px', gap: 6 }
    : { fontSize: 11, labelSize: 8, padding: '4px 8px', gap: 4 };

  const segments = [
    ...(!hideRak ? [{ icon: '🏗️', label: 'RAK', value: parsed.rak, color: 'var(--pur)', bg: 'var(--pur-d)' }] : []),
    { icon: '📂', label: 'KOLOM', value: parsed.kolom, color: 'var(--blu)', bg: 'var(--blu-d)' },
    { icon: '≡',  label: 'BARIS', value: parsed.level, color: 'var(--grn)', bg: 'var(--grn-d)' },
    { icon: '□',  label: 'BIN',   value: parsed.bin,   color: 'var(--ylw)', bg: 'var(--ylw-d)' },
  ];

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: seg.gap, flexWrap: 'wrap' }}>
      {segments.map((s, i) => (
        <div key={i} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: s.bg, borderRadius: 6, padding: seg.padding,
          border: `0.5px solid ${s.color}33`, minWidth: 36,
        }}>
          <span style={{ fontSize: seg.labelSize, fontWeight: 800, color: s.color, textTransform: 'uppercase', letterSpacing: '.5px', lineHeight: 1 }}>
            {s.label}
          </span>
          <span style={{ fontSize: seg.fontSize, fontWeight: 800, color: 'var(--tx)', lineHeight: 1.2, marginTop: 2 }}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  if (s === 'safe') return <span className="badge badge-grn">🟢 Safe</span>;
  if (s === 'low')  return <span className="badge badge-ylw">🟡 Low</span>;
  return <span className="badge badge-red">🔴 Habis</span>;
}

function compareRackSegment(a: string, b: string) {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' });
}

export type StatusFilter = 'all' | 'kritis' | 'low' | 'habis' | 'safe' | 'pr' | 'po';

function parseStatusFilter(raw: string | null): StatusFilter {
  if (raw === 'kritis' || raw === 'low' || raw === 'habis' || raw === 'safe' || raw === 'pr' || raw === 'po') return raw;
  return 'all';
}

function matchesStatusFilter(item: StockItem, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'kritis') return item.status === 'low' || item.status === 'habis';
  if (filter === 'pr') return item.purchasingStatus === 'PR';
  if (filter === 'po') return item.purchasingStatus === 'PO';
  return item.status === filter;
}

function compareByRackOrder(a: StockItem, b: StockItem) {
  const pA = a._parsed;
  const pB = b._parsed;
  if (!pA?.valid && !pB?.valid) return a.lokasi.localeCompare(b.lokasi, 'id');
  if (!pA?.valid) return 1;
  if (!pB?.valid) return -1;
  return (
    compareRackSegment(pA.rak, pB.rak) ||
    compareRackSegment(pA.kolom, pB.kolom) ||
    compareRackSegment(pA.level, pB.level) ||
    compareRackSegment(pA.bin, pB.bin) ||
    a.nama.localeCompare(b.nama, 'id')
  );
}

export default function StockViewer({ stockApiUrl = '/api/mtc/stock' }: { stockApiUrl?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEditor = pathname.startsWith('/mtc/inventory');

  const [allItems, setAllItems] = useState<StockItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [activeRak, setActiveRak] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'rak' | 'list'>('rak');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() =>
    parseStatusFilter(searchParams.get('status'))
  );

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 120000);
    return () => clearInterval(t);
  }, [stockApiUrl]);

  useEffect(() => {
    setStatusFilter(parseStatusFilter(searchParams.get('status')));
  }, [searchParams]);

  const applyStatusFilter = useCallback(
    (next: StatusFilter) => {
      setStatusFilter(next);
      setActiveRak(null);
      if (next !== 'all') setViewMode('list');

      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') params.delete('status');
      else params.set('status', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(stockApiUrl);
      const json = await res.json();
      if (json.success) {
        const items = (json.data as StockItem[]).map(i => ({
          ...i, _parsed: parseSLOC(i.lokasi)
        }));
        setAllItems(items);
        setLastUpdate(new Date());
      }
    } finally { setLoading(false); }
  }

  const isSearch = search.trim().length > 0;
  
  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMesin, setSelectedMesin] = useState<number | null>(null);
  
  // Filter items based on status, category, and mesin
  const filteredItems = useMemo(() => {
    let items = allItems;
    if (statusFilter !== 'all') items = items.filter(i => matchesStatusFilter(i, statusFilter));
    if (selectedCategory) items = items.filter(i => i.kategori === selectedCategory);
    if (selectedMesin) {
      items = items.filter(i => i.mesins && i.mesins.some(m => m.id === selectedMesin));
    }
    return items;
  }, [allItems, statusFilter, selectedCategory, selectedMesin]);

  const uniqueCategories = useMemo(() => {
    return Array.from(new Set(allItems.map(i => i.kategori))).sort();
  }, [allItems]);

  const uniqueMesins = useMemo(() => {
    const map = new Map<number, { id: number, nama: string }>();
    for (const item of allItems) {
      if (item.mesins) {
        for (const m of item.mesins) {
          if (!map.has(m.id)) map.set(m.id, m);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [allItems]);

  // Group by RAK number (menggunakan filteredItems)
  const raks = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    for (const item of filteredItems) {
      const key = item._parsed?.valid ? `Rak ${item._parsed.rak}` : (item.lokasi || '(Tanpa Lokasi)');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).map(([rak, items]) => ({
      rak,
      items,
      total: items.length,
      habis: items.filter(i => i.status === 'habis').length,
      low:   items.filter(i => i.status === 'low').length,
      safe:  items.filter(i => i.status === 'safe').length,
    })).sort((a, b) => (b.habis * 2 + b.low) - (a.habis * 2 + a.low));
  }, [filteredItems]);

  // Search results (semua rak) dari allItems langsung
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    // Kalau lagi pilih kategori, search tetap di dalam kategori itu
    let base = selectedCategory ? filteredItems : allItems;
    return base.filter(i =>
      i.nama.toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q) ||
      i.kategori.toLowerCase().includes(q) ||
      i.lokasi.toLowerCase().includes(q)
    );
  }, [search, allItems, filteredItems, selectedCategory]);

  const activeData = raks.find(r => r.rak === activeRak);

  // Within a rack, group by KOLOM
  const kolomGroups = useMemo(() => {
    if (!activeData) return new Map<string, StockItem[]>();
    const map = new Map<string, StockItem[]>();
    for (const item of activeData.items) {
      const key = item._parsed?.valid ? `Kolom ${item._parsed.kolom}` : 'Lainnya';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [activeData]);

  const totalHabis = allItems.filter(i => i.status === 'habis').length;
  const totalLow   = allItems.filter(i => i.status === 'low').length;
  const totalKritis = totalHabis + totalLow;
  const isStatusFiltered = statusFilter !== 'all';

  return (
    <>
      {/* HEADER */}
      <div className="page-header">
        <div className="flex-between stock-page-header">
          <div>
            {activeRak && !isSearch && viewMode === 'rak' ? (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setActiveRak(null)} style={{ marginBottom: 8 }}>
                  ← Semua Rak
                </button>
                <div className="page-title">📦 {activeRak}</div>
                <div className="page-sub">{activeData?.total} item · {kolomGroups.size} kolom</div>
              </>
            ) : (
              <>
                <div className="page-title">
                  {statusFilter === 'kritis'
                    ? '🚨 Stok Kritis'
                    : statusFilter === 'low'
                      ? '🟡 Low Stock'
                      : statusFilter === 'habis'
                        ? '🔴 Stok Habis'
                        : statusFilter === 'safe'
                          ? '🟢 Stok Aman'
                          : statusFilter === 'pr'
                            ? '⏳ Barang Sedang PR'
                            : statusFilter === 'po'
                              ? '📦 Barang Sudah PO'
                              : 'Stock Inventory'}
                </div>
                <div className="page-sub">
                  {isStatusFiltered
                    ? `${filteredItems.length} item · Filter: ${statusFilter === 'kritis' ? 'Habis & Low Stock' : statusFilter}`
                    : `${raks.length} Rak · ${filteredItems.length} Item ·`}{' '}
                  Update {lastUpdate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </>
            )}
          </div>
          <div className="stock-view-header-actions">
            {!isSearch && !activeRak && !isStatusFiltered && (
              <div className="stock-view-toggle">
                <button
                  type="button"
                  className={`stock-view-toggle__btn${viewMode === 'rak' ? ' stock-view-toggle__btn--active' : ''}`}
                  onClick={() => setViewMode('rak')}
                >
                  🏗️ Mode Rak
                </button>
                <button
                  type="button"
                  className={`stock-view-toggle__btn${viewMode === 'list' ? ' stock-view-toggle__btn--active' : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  📄 Semua Barang
                </button>
              </div>
            )}
            <button className="btn btn-ghost btn-sm stock-refresh-btn" onClick={fetchData} disabled={loading}>
              {loading ? '...' : '↻ Refresh'}
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">

        {/* ALERT KRITIS */}
        {(totalHabis > 0 || totalLow > 0) && !isSearch && !activeRak && (
          <button
            type="button"
            className="alert alert-red stock-critical-alert"
            style={{ marginBottom: 20, width: '100%', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => applyStatusFilter(statusFilter === 'kritis' ? 'all' : 'kritis')}
          >
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ flex: 1 }}>
              {statusFilter === 'kritis' ? (
                <>
                  Menampilkan <strong>{filteredItems.length} item kritis</strong>
                  {' '}— ketuk untuk kembali ke semua stok
                </>
              ) : (
                <>
                  <strong>{totalHabis} item Habis</strong>
                  {totalLow > 0 && <> · <strong>{totalLow} item Low Stock</strong></>}
                  {' '}— Ketuk untuk lihat daftar kritis
                </>
              )}
            </span>
            <span className="stock-critical-alert__action" aria-hidden>
              {statusFilter === 'kritis' ? '✕' : '→'}
            </span>
          </button>
        )}

        {/* STATUS FILTER PILLS */}
        {!isSearch && !activeRak && (
          <div className="stock-status-filters" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {([
              { key: 'all' as const, label: 'Semua', count: allItems.length },
              { key: 'kritis' as const, label: 'Kritis', count: totalKritis },
              { key: 'habis' as const, label: 'Habis', count: totalHabis },
              { key: 'low' as const, label: 'Low', count: totalLow },
              { key: 'safe' as const, label: 'Aman', count: allItems.filter(i => i.status === 'safe').length },
              { key: 'pr' as const, label: '⏳ Sedang PR', count: allItems.filter(i => i.purchasingStatus === 'PR').length },
              { key: 'po' as const, label: '📦 Sudah PO', count: allItems.filter(i => i.purchasingStatus === 'PO').length },
            ]).map(({ key, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => applyStatusFilter(key)}
                className={`stock-status-filter${statusFilter === key ? ' stock-status-filter--active' : ''}${
                  key === 'kritis' && count > 0 ? ' stock-status-filter--warn' : ''
                }`}
              >
                {label}
                <span className="stock-status-filter__count">{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* CONTROLS (Search & Filters) */}
        {!activeRak && (
          <div style={{ marginBottom: 24 }}>
            <div className="search-bar" style={{ marginBottom: 12 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text" placeholder="Cari nama, ID, SLOC..."
                value={search} onChange={e => { setSearch(e.target.value); setActiveRak(null); }}
                autoComplete="off"
              />
              {search && (
                <button onClick={() => setSearch('')}
                  style={{ background: 'none', border: 'none', color: 'var(--tx3)', cursor: 'pointer', fontSize: 18 }}>
                  ×
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button
                onClick={() => setSelectedCategory(null)}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: '1px solid var(--br)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: selectedCategory === null ? 'var(--tx)' : 'transparent',
                  color: selectedCategory === null ? 'var(--bg)' : 'var(--tx2)',
                  transition: 'all .15s'
                }}
              >
                Semua Kategori
              </button>
              {uniqueCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, border: '1px solid var(--br)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: selectedCategory === cat ? 'var(--blu)' : 'var(--sf2)',
                    color: selectedCategory === cat ? '#fff' : 'var(--tx2)',
                    transition: 'all .15s'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Mesin Pills */}
            {uniqueMesins.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setSelectedMesin(null)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, border: '1px solid var(--br)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    background: selectedMesin === null ? 'var(--tx)' : 'transparent',
                    color: selectedMesin === null ? 'var(--bg)' : 'var(--tx2)',
                    transition: 'all .15s'
                  }}
                >
                  Semua Mesin
                </button>
                {uniqueMesins.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMesin(m.id)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, border: '1px solid var(--br)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: selectedMesin === m.id ? 'var(--pur)' : 'var(--sf2)',
                      color: selectedMesin === m.id ? '#fff' : 'var(--tx2)',
                      transition: 'all .15s'
                    }}
                  >
                    🏭 {m.nama}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ MODE: SEARCH ══ */}
        {isSearch && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                🔍 &ldquo;{search}&rdquo;
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                  {searchResults.length} item
                </span>
              </div>
            </div>
            <StockItemList items={searchResults} isEditor={isEditor} onUpdate={fetchData} />
          </div>
        )}

        {/* ══ MODE: DETAIL RAK — split per KOLOM ══ */}
        {!isSearch && activeRak && activeData && (
          <>
            {/* Badge summary */}
            <div className="gap-8" style={{ marginBottom: 16 }}>
              {activeData.habis > 0 && <span className="badge badge-red">{activeData.habis} Habis</span>}
              {activeData.low   > 0 && <span className="badge badge-ylw">{activeData.low} Low Stock</span>}
              {activeData.safe  > 0 && <span className="badge badge-grn">{activeData.safe} Safe</span>}
            </div>

            {/* 2-column grid per KOLOM */}
            <div className="stock-kolom-grid">
              {Array.from(kolomGroups.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([kolom, items]) => (
                  <KolomCard key={kolom} kolom={kolom} items={items} />
                ))}
            </div>
          </>
        )}

        {/* ══ MODE: FILTER STATUS (LIST) ══ */}
        {!isSearch && !activeRak && isStatusFiltered && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                Daftar Stok — {statusFilter === 'kritis' ? 'Kritis' : statusFilter === 'pr' ? 'Sedang PR' : statusFilter === 'po' ? 'Sudah PO' : statusFilter}
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                  {filteredItems.length} item
                </span>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => applyStatusFilter('all')}>
                Reset filter
              </button>
            </div>
            <StockItemList items={filteredItems} sortByRack highlightName isEditor={isEditor} onUpdate={fetchData} />
          </div>
        )}

        {/* ══ MODE: OVERVIEW RAK ══ */}
        {!isSearch && !activeRak && !isStatusFiltered && viewMode === 'rak' && (
          <div className="stock-rak-grid">
            {raks.map(r => (
              <div key={r.rak}
                className="card"
                onClick={() => setActiveRak(r.rak)}
                style={{
                  cursor: 'pointer',
                  borderColor: r.habis > 0 ? 'var(--red-b)' : r.low > 0 ? 'var(--ylw-b)' : 'var(--br)',
                  transition: 'all .15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <div style={{ padding: '18px 20px' }}>
                  <div className="flex-between" style={{ marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 3 }}>
                        Lokasi Penyimpanan
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>📦 {r.rak}</div>
                      <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                        {r.items[0]?._parsed?.valid
                          ? `${new Set(r.items.map(i => i._parsed?.kolom)).size} Kolom`
                          : `${r.total} item`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {r.habis > 0 && <span className="badge badge-red">{r.habis} Habis</span>}
                      {r.low   > 0 && <span className="badge badge-ylw">{r.low} Low</span>}
                      {r.habis === 0 && r.low === 0 && <span className="badge badge-grn">✓ Aman</span>}
                    </div>
                  </div>

                  {/* Mini bar stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
                    {[
                      { label: 'Total', val: r.total, color: 'var(--tx)' },
                      { label: 'Low', val: r.low, color: 'var(--ylw)' },
                      { label: 'Habis', val: r.habis, color: 'var(--red)' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', background: 'var(--sf2)', borderRadius: 8, padding: '8px 4px' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.val}</div>
                        <div style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--tx3)', textAlign: 'right' }}>Lihat isi rak →</div>
                </div>
              </div>
            ))}
            {raks.length === 0 && !loading && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: 'var(--tx3)' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
                <div>Belum ada data stok.</div>
              </div>
            )}
          </div>
        )}

        {/* ══ MODE: SEMUA BARANG (LIST) ══ */}
        {!isSearch && !activeRak && !isStatusFiltered && viewMode === 'list' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                Daftar Semua Barang
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
                  {filteredItems.length} item
                </span>
              </div>
            </div>
            <StockItemList items={filteredItems} sortByRack highlightName isEditor={isEditor} onUpdate={fetchData} />
          </div>
        )}

      </div>
    </>
  );
}

// ── Kartu Kolom (dalam sebuah rak) ─────────────────────────────────────────
function KolomCard({ kolom, items }: { kolom: string; items: StockItem[] }) {
  const sorted = [...items].sort((a, b) => {
    const score = (i: StockItem) => i.status === 'habis' ? 2 : i.status === 'low' ? 1 : 0;
    if (score(b) !== score(a)) return score(b) - score(a);
    // Sort by Level then Bin
    const lA = a._parsed?.level ?? ''; const bA = a._parsed?.bin ?? '';
    const lB = b._parsed?.level ?? ''; const bB = b._parsed?.bin ?? '';
    return (lA + bA).localeCompare(lB + bB);
  });

  const habis = items.filter(i => i.status === 'habis').length;
  const low   = items.filter(i => i.status === 'low').length;

  return (
    <div className="card">
      {/* Header kolom */}
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'var(--pur-d)', color: 'var(--pur)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 16,
          }}>
            {kolom.replace('Kolom ', '')}
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>{kolom}</div>
            <div style={{ fontSize: 11, color: 'var(--tx3)' }}>{items.length} item</div>
          </div>
        </div>
        <div className="gap-8">
          {habis > 0 && <span className="badge badge-red">{habis}</span>}
          {low   > 0 && <span className="badge badge-ylw">{low}</span>}
        </div>
      </div>

      {/* Daftar item */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {sorted.map((item, idx) => {
          const p = item._parsed;
          const lokLabel = p?.valid ? `Lvl ${p.level} · Bin ${p.bin}` : item.lokasi;
          const stockColor = item.status === 'safe' ? 'var(--grn)' : item.status === 'low' ? 'var(--ylw)' : 'var(--red)';

          return (
            <div key={item.id} className="stock-kolom-item" style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 16px',
              borderBottom: idx < sorted.length - 1 ? '1px solid var(--br)' : 'none',
              background: item.status === 'habis' ? 'rgba(224,85,85,.04)' : 'transparent',
            }}>
              {/* Location chip — langsung terbaca */}
              <LocationChip parsed={item._parsed!} size="sm" hideRak />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nama}</span>
                  {item.purchasingStatus === 'PR' && <span className="badge badge-ylw" style={{ fontSize: 9, padding: '1px 6px', fontWeight: 800 }}>⏳ PR</span>}
                  {item.purchasingStatus === 'PO' && <span className="badge badge-blu" style={{ fontSize: 9, padding: '1px 6px', fontWeight: 800 }}>📦 PO</span>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 1 }}>{item.id}</div>
              </div>

              {/* Stok */}
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: stockColor, lineHeight: 1 }}>
                  {item.currentStock}
                </div>
                <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{item.uom}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Daftar barang: tabel desktop + kartu mobile ─────────────────────────────
function StockItemList({
  items,
  sortByRack = false,
  highlightName = false,
  isEditor = false,
  onUpdate,
}: {
  items: StockItem[];
  sortByRack?: boolean;
  highlightName?: boolean;
  isEditor?: boolean;
  onUpdate?: () => void;
}) {
  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort(sortByRack ? compareByRackOrder : (a, b) => a.nama.localeCompare(b.nama, 'id'));
    return copy;
  }, [items, sortByRack]);

  if (!sorted.length) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tx3)' }}>Tidak ditemukan</div>
    );
  }

  return (
    <>
      <div className="table-wrap stock-item-list__table">
        <table>
          <thead>
            <tr>
              <th>SLOC</th>
              <th>Nama Barang</th>
              <th>Kategori</th>
              <th style={{ textAlign: 'right', background: 'var(--sf2)' }}>Stok</th>
              <th>UoM</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              {isEditor && <th style={{ textAlign: 'center' }}>Pengadaan</th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map(item => (
              <StockItemTableRow 
                key={item.id} 
                item={item} 
                highlightName={highlightName} 
                isEditor={isEditor} 
                onUpdate={onUpdate} 
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="stock-item-list__cards">
        {sorted.map(item => (
          <StockItemCard 
            key={item.id} 
            item={item} 
            highlightName={highlightName} 
            isEditor={isEditor} 
            onUpdate={onUpdate} 
          />
        ))}
      </div>
    </>
  );
}

function stockColor(status: StockItem['status']) {
  return status === 'safe' ? 'var(--grn)' : status === 'low' ? 'var(--ylw)' : 'var(--red)';
}

function StockItemTableRow({
  item,
  highlightName,
  isEditor = false,
  onUpdate,
}: {
  item: StockItem;
  highlightName?: boolean;
  isEditor?: boolean;
  onUpdate?: () => void;
}) {
  return (
    <tr>
      <td>
        <LocationChip parsed={item._parsed!} size="md" />
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className={highlightName ? 'stock-item-name stock-item-name--highlight' : ''} style={{ fontWeight: 600 }}>
            {item.nama}
          </div>
          {item.purchasingStatus === 'PR' && <span className="badge badge-ylw" style={{ fontSize: 9, padding: '1px 6px', fontWeight: 800 }}>⏳ Sedang PR</span>}
          {item.purchasingStatus === 'PO' && <span className="badge badge-blu" style={{ fontSize: 9, padding: '1px 6px', fontWeight: 800 }}>📦 Sudah PO</span>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--tx3)' }}>{item.id}</div>
      </td>
      <td>
        <span style={{ fontSize: 11, background: 'var(--sf3)', color: 'var(--tx2)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>
          {item.kategori}
        </span>
      </td>
      <td style={{ textAlign: 'right', background: 'var(--sf2)', fontWeight: 800, fontSize: 16, color: stockColor(item.status) }}>
        {item.currentStock}
      </td>
      <td style={{ color: 'var(--tx3)', fontSize: 12 }}>{item.uom}</td>
      <td style={{ textAlign: 'center' }}>
        <StatusBadge s={item.status} />
      </td>
      {isEditor && (
        <td style={{ textAlign: 'center' }}>
          {item.purchasingStatus === 'PR' && (
            <span className="badge badge-ylw">⏳ Sedang PR</span>
          )}
          {item.purchasingStatus === 'PO' && (
            <span className="badge badge-blu">📦 Sudah PO</span>
          )}
          {(!item.purchasingStatus || item.purchasingStatus === 'NONE') && (
            <span className="text-muted">—</span>
          )}
        </td>
      )}
    </tr>
  );
}

function StockItemCard({
  item,
  highlightName,
  isEditor = false,
  onUpdate,
}: {
  item: StockItem;
  highlightName?: boolean;
  isEditor?: boolean;
  onUpdate?: () => void;
}) {
  const color = stockColor(item.status);

  return (
    <div className={`stock-item-card${item.status === 'habis' ? ' stock-item-card--habis' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div className={`stock-item-card__name${highlightName ? ' stock-item-name--highlight' : ''}`} style={{ flex: 1, minWidth: 0 }}>
          {item.nama}
        </div>
        {item.purchasingStatus === 'PR' && <span className="badge badge-ylw" style={{ fontSize: 9, padding: '1px 6px', fontWeight: 800, flexShrink: 0 }}>⏳ Sedang PR</span>}
        {item.purchasingStatus === 'PO' && <span className="badge badge-blu" style={{ fontSize: 9, padding: '1px 6px', fontWeight: 800, flexShrink: 0 }}>📦 Sudah PO</span>}
      </div>
      <div className="stock-item-card__id">{item.id}</div>

      <div className="stock-item-card__location">
        <LocationChip parsed={item._parsed!} size="sm" />
      </div>

      <div className="stock-item-card__footer">
        <span className="stock-item-card__category">{item.kategori}</span>
        <div className="stock-item-card__stock">
          <span className="stock-item-card__qty" style={{ color }}>{item.currentStock}</span>
          <span className="stock-item-card__uom">{item.uom}</span>
        </div>
        {isEditor ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <StatusBadge s={item.status} />
            {item.purchasingStatus === 'PR' && <span className="badge badge-ylw" style={{ fontSize: 10 }}>⏳ Sedang PR</span>}
            {item.purchasingStatus === 'PO' && <span className="badge badge-blu" style={{ fontSize: 10 }}>📦 Sudah PO</span>}
          </div>
        ) : (
          <StatusBadge s={item.status} />
        )}
      </div>
    </div>
  );
}
