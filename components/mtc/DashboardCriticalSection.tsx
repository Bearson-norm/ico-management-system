'use client';

import { useState } from 'react';
import Link from 'next/link';

export type DashboardSparepart = {
  id: string;
  nama: string;
  minQty: number;
  maxLeadTime: number;
  avgLeadTime: number;
  calculatedSafetyStock: number;
  isAuto: boolean;
  limitStock: number;
  uom: string;
  lokasi: string | null;
  currentStock: number;
  purchasingStatus: string; // 'NONE' | 'PR' | 'PO'
  purchasingQty: number;
  purchasingNoPr?: string | null;
  purchasingNoPo?: string | null;
  harga: number;
  kategori?: { id: number; nama: string } | null;
  mesins?: { id: number; nama: string; vital?: boolean; area?: string | null }[];
};

export type TopMovement = {
  sparepartId: string | null;
  namaItem: string | null;
  _sum: { qty: number | null };
  _count?: { id: number | null };
};

type Props = {
  sparepartsWithStock: DashboardSparepart[];
  topUsedMovements: TopMovement[];
};

export default function DashboardCriticalSection({ sparepartsWithStock, topUsedMovements }: Props) {
  const [criticalTab, setCriticalTab] = useState<'ALL' | 'EMPTY' | 'ACTIVE_PROCUREMENT'>('ALL');
  const [topTab, setTopTab] = useState<'ALL' | 'CRITICAL' | 'CONSUMABLE'>('ALL');

  // Filter items needing restock (currentStock <= limitStock)
  const lowStockItems = sparepartsWithStock
    .filter((sp) => sp.currentStock <= sp.limitStock)
    .sort((a, b) => a.currentStock - b.currentStock);

  // Pure informational classification without forced PR vs Petty Cash decisions
  const classifyItem = (sp: DashboardSparepart) => {
    const isVitalProductionMachine =
      (sp.mesins &&
        sp.mesins.some((m) => {
          const isVital = m.vital === true;
          const areaName = (m.area || '').toLowerCase();
          const isProduksi = areaName ? areaName.includes('produksi') : true;
          return isVital && isProduksi;
        })) ||
      false;

    const katNama = (sp.kategori?.nama || '').toLowerCase();
    const isExplicitCriticalKat = katNama.includes('kritis') || katNama.includes('vital');
    const isCriticalPart = isVitalProductionMachine || isExplicitCriticalKat;

    const isOut = sp.currentStock === 0;

    let procLabel = isOut ? '🔴 Stok Habis' : '🟡 Stok Kritis';
    let procColor = isOut ? '#ef4444' : '#eab308';
    let procBg = isOut ? 'rgba(239,68,68,0.12)' : 'rgba(234,179,8,0.12)';
    let procBorder = isOut ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)';

    if (sp.purchasingStatus === 'PR') {
      procLabel = `⏳ PR ${sp.purchasingNoPr ? `(${sp.purchasingNoPr})` : ''}`;
      procColor = '#eab308';
      procBg = 'rgba(234,179,8,0.15)';
      procBorder = 'rgba(234,179,8,0.4)';
    } else if (sp.purchasingStatus === 'PO') {
      procLabel = `🚢 PO ${sp.purchasingNoPo ? `(${sp.purchasingNoPo})` : ''}`;
      procColor = '#60a5fa';
      procBg = 'rgba(59,130,246,0.15)';
      procBorder = 'rgba(59,130,246,0.4)';
    }

    return {
      procLabel,
      procColor,
      procBg,
      procBorder,
      isCriticalPart,
      typeLabel: isCriticalPart ? '🔴 Part Critical' : '📦 Sparepart / Utilitas',
      typeColor: isCriticalPart ? '#ef4444' : '#10b981',
      typeBg: isCriticalPart ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
      typeBorder: isCriticalPart ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)',
    };
  };

  const emptyCount = lowStockItems.filter((sp) => sp.currentStock === 0).length;
  const activeProcCount = lowStockItems.filter((sp) => sp.purchasingStatus === 'PR' || sp.purchasingStatus === 'PO').length;

  const filteredCriticalItems = lowStockItems.filter((sp) => {
    if (criticalTab === 'EMPTY') return sp.currentStock === 0;
    if (criticalTab === 'ACTIVE_PROCUREMENT') return sp.purchasingStatus === 'PR' || sp.purchasingStatus === 'PO';
    return true;
  }).slice(0, 6);

  const stockMap = new Map(sparepartsWithStock.map((sp) => [sp.id, sp]));

  // Filter top used items by selected tab (Part Critical vs Consumable)
  const filteredTopMovements = topUsedMovements.filter((m) => {
    if (topTab === 'ALL') return true;
    const linkedSp = m.sparepartId ? stockMap.get(m.sparepartId) : null;
    if (!linkedSp) return topTab === 'CONSUMABLE';
    const c = classifyItem(linkedSp);
    if (topTab === 'CRITICAL') return c.isCriticalPart;
    if (topTab === 'CONSUMABLE') return !c.isCriticalPart;
    return true;
  }).slice(0, 5);

  return (
    <div className="form-grid-2" style={{ marginBottom: 24, gap: 20 }}>
      {/* CARD 1: BARANG PERLU RESTOCK (SYSTEM ROP) */}
      <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div className="card-header" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="card-title" style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🚨</span> Pemantauan Stok Kritis (ROP System)
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                Informasi sisa stok di bawah ROP &amp; status pengadaan aktif
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge badge-red">{lowStockItems.length} Kritis</span>
              <Link href="/mtc/inventory?status=kritis" className="btn btn-ghost btn-sm" style={{ height: 26, fontSize: 11 }}>
                Lihat Semua →
              </Link>
            </div>
          </div>

          {/* TAB FILTER BUTTONS FOR CARD 1 */}
          <div style={{ padding: '0 20px 12px 20px' }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              <button
                type="button"
                onClick={() => setCriticalTab('ALL')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: criticalTab === 'ALL' ? 'var(--sf3)' : 'transparent',
                  color: criticalTab === 'ALL' ? 'var(--tx)' : 'var(--tx3)',
                  borderColor: criticalTab === 'ALL' ? 'var(--br)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                Semua ({lowStockItems.length})
              </button>

              <button
                type="button"
                onClick={() => setCriticalTab('EMPTY')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: criticalTab === 'EMPTY' ? 'rgba(239,68,68,0.15)' : 'transparent',
                  color: criticalTab === 'EMPTY' ? '#ef4444' : 'var(--tx3)',
                  borderColor: criticalTab === 'EMPTY' ? 'rgba(239,68,68,0.4)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                🔴 Stok Habis ({emptyCount})
              </button>

              <button
                type="button"
                onClick={() => setCriticalTab('ACTIVE_PROCUREMENT')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: criticalTab === 'ACTIVE_PROCUREMENT' ? 'rgba(234,179,8,0.15)' : 'transparent',
                  color: criticalTab === 'ACTIVE_PROCUREMENT' ? '#eab308' : 'var(--tx3)',
                  borderColor: criticalTab === 'ACTIVE_PROCUREMENT' ? 'rgba(234,179,8,0.4)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                ⏳ PR / PO Jalan ({activeProcCount})
              </button>
            </div>
          </div>

          {/* CRITICAL ITEM LIST */}
          <div style={{ padding: '0 20px 20px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredCriticalItems.map((sp) => {
                const isOut = sp.currentStock === 0;
                const info = classifyItem(sp);

                return (
                  <div
                    key={sp.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'var(--sf2)',
                      border: '1px solid var(--br)',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: isOut ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {isOut ? '🔴' : '🟡'}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sp.nama}
                        </div>

                        {/* BADGE TIPE BARANG */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'monospace' }}>{sp.id}</span>
                          <span
                            style={{
                              fontSize: 9,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: info.typeBg,
                              color: info.typeColor,
                              border: `1px solid ${info.typeBorder}`,
                              fontWeight: 700,
                            }}
                          >
                            {info.typeLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* STATUS PENGADAAN & SISA STOK */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 800,
                          background: info.procBg,
                          color: info.procColor,
                          border: `1px solid ${info.procBorder}`,
                        }}
                      >
                        {info.procLabel}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: isOut ? 'var(--red)' : 'var(--ylw)' }}>
                        {sp.currentStock} / ROP {sp.limitStock} {sp.uom}
                      </span>
                    </div>
                  </div>
                );
              })}

              {filteredCriticalItems.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--tx3)' }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🟢</div>
                  <div style={{ fontSize: 12 }}>Tidak ada barang kritis pada kategori ini.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2: PEMAKAIAN TERTINGGI & ANALISIS PENGGANTIAN (30 HARI) */}
      <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div className="card-header" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div className="card-title" style={{ color: 'var(--pur)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🔥</span> Pemakaian Tertinggi &amp; Analisis Penggantian
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                Frekuensi penggantian &amp; akumulasi unit keluar dalam 30 hari terakhir
              </div>
            </div>
            <span className="badge badge-pur" style={{ fontSize: 10 }}>📅 30 Hari Terakhir</span>
          </div>

          {/* TAB FILTER BUTTONS FOR CARD 2 */}
          <div style={{ padding: '0 20px 12px 20px' }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              <button
                type="button"
                onClick={() => setTopTab('ALL')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: topTab === 'ALL' ? 'var(--sf3)' : 'transparent',
                  color: topTab === 'ALL' ? 'var(--tx)' : 'var(--tx3)',
                  borderColor: topTab === 'ALL' ? 'var(--br)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                Semua Top 5
              </button>

              <button
                type="button"
                onClick={() => setTopTab('CRITICAL')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: topTab === 'CRITICAL' ? 'rgba(239,68,68,0.15)' : 'transparent',
                  color: topTab === 'CRITICAL' ? '#ef4444' : 'var(--tx3)',
                  borderColor: topTab === 'CRITICAL' ? 'rgba(239,68,68,0.4)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                🔴 Part Critical
              </button>

              <button
                type="button"
                onClick={() => setTopTab('CONSUMABLE')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: topTab === 'CONSUMABLE' ? 'rgba(16,185,129,0.15)' : 'transparent',
                  color: topTab === 'CONSUMABLE' ? '#10b981' : 'var(--tx3)',
                  borderColor: topTab === 'CONSUMABLE' ? 'rgba(16,185,129,0.4)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                🛒 Consumables
              </button>
            </div>
          </div>

          {/* TOP USAGE ITEM LIST WITH REPLACEMENT FREQUENCY METRICS */}
          <div style={{ padding: '0 20px 20px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredTopMovements.map((m, idx) => {
                const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                const linkedSp = m.sparepartId ? stockMap.get(m.sparepartId) : null;
                const info = linkedSp ? classifyItem(linkedSp) : null;
                const qtyOut = m._sum.qty || 0;
                const txCount = m._count?.id || 1;

                return (
                  <div
                    key={m.sparepartId || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: 10,
                      background: 'var(--sf2)',
                      border: '1px solid var(--br)',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: 'rgba(139, 92, 246, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {rankIcons[idx] || '🔥'}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {m.namaItem}
                        </div>

                        {/* BADGE TIPE BARANG */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: 'var(--tx3)', fontFamily: 'monospace' }}>{m.sparepartId}</span>

                          {info && (
                            <span
                              style={{
                                fontSize: 9,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: info.typeBg,
                                color: info.typeColor,
                                border: `1px solid ${info.typeBorder}`,
                                fontWeight: 700,
                              }}
                            >
                              {info.typeLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* METRICS: TOTAL QTY OUT & REPLACEMENT FREQUENCY */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0, marginLeft: 8 }}>
                      <div
                        style={{
                          padding: '4px 10px',
                          borderRadius: 16,
                          fontSize: 11,
                          fontWeight: 800,
                          background: 'rgba(139, 92, 246, 0.15)',
                          color: 'var(--pur)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span>{qtyOut} {linkedSp?.uom || 'Pcs'} Out</span>
                        <span>·</span>
                        <span style={{ color: 'var(--tx)' }}>{txCount}x Diganti (30H)</span>
                      </div>
                      {linkedSp && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: linkedSp.currentStock <= linkedSp.limitStock ? 'var(--red)' : 'var(--grn)' }}>
                          Sisa Stok: {linkedSp.currentStock} {linkedSp.uom}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredTopMovements.length === 0 && (
                <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--tx3)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                  <div style={{ fontSize: 13 }}>Belum ada data pemakaian barang 30 hari terakhir.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
