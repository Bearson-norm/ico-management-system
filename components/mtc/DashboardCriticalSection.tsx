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
  mesins?: { id: number; nama: string; vital?: boolean }[];
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
  const [criticalTab, setCriticalTab] = useState<'ALL' | 'URGENT_PR' | 'ACTIVE_PR_PO' | 'PETTY_CASH'>('ALL');
  const [topTab, setTopTab] = useState<'ALL' | 'CRITICAL' | 'CONSUMABLE'>('ALL');

  // Filter items needing restock (currentStock <= limitStock)
  const lowStockItems = sparepartsWithStock
    .filter((sp) => sp.currentStock <= sp.limitStock)
    .sort((a, b) => a.currentStock - b.currentStock);

  // Helper logic to classify item as Part Critical vs Consumable
  const classifyItem = (sp: DashboardSparepart) => {
    const isVital = (sp.mesins && sp.mesins.some((m) => m.vital)) || false;
    const isForMachine = sp.mesins && sp.mesins.length > 0;
    const katNama = (sp.kategori?.nama || '').toLowerCase();
    const isMachineCategory =
      katNama.includes('mesin') ||
      katNama.includes('mechanical') ||
      katNama.includes('electrical') ||
      katNama.includes('sparepart') ||
      katNama.includes('kritis') ||
      katNama.includes('vital');
    const isConsumable =
      katNama.includes('consumable') || katNama.includes('umum') || katNama.includes('sipil') || katNama.includes('fast');

    // Part Critical = Vital machine part or critical sparepart (Requires PR)
    const isCriticalPart = isVital || isForMachine || isMachineCategory || !isConsumable;

    if (!isCriticalPart) {
      return {
        type: 'PETTY_CASH' as const,
        label: '💵 Petty Cash',
        color: '#10b981',
        bg: 'rgba(16,185,129,0.12)',
        border: 'rgba(16,185,129,0.25)',
        isCriticalPart: false,
        typeLabel: '🛒 Consumable',
        typeColor: '#10b981',
        typeBg: 'rgba(16,185,129,0.12)',
        typeBorder: 'rgba(16,185,129,0.3)',
      };
    }

    let prLabel = '🚨 Wajib Segera PR';
    let color = '#ef4444';
    let bg = 'rgba(239,68,68,0.15)';
    let border = 'rgba(239,68,68,0.35)';
    let type: 'URGENT_PR' | 'ACTIVE_PR_PO' | 'PETTY_CASH' = 'URGENT_PR';

    if (sp.purchasingStatus === 'PR') {
      type = 'ACTIVE_PR_PO' as const;
      prLabel = `⏳ PR ${sp.purchasingNoPr ? `(${sp.purchasingNoPr})` : ''}`;
      color = '#eab308';
      bg = 'rgba(234,179,8,0.12)';
      border = 'rgba(234,179,8,0.3)';
    } else if (sp.purchasingStatus === 'PO') {
      type = 'ACTIVE_PR_PO' as const;
      prLabel = `🚢 PO ${sp.purchasingNoPo ? `(${sp.purchasingNoPo})` : ''}`;
      color = '#60a5fa';
      bg = 'rgba(59,130,246,0.12)';
      border = 'rgba(59,130,246,0.3)';
    }

    return {
      type,
      label: prLabel,
      color,
      bg,
      border,
      isCriticalPart: true,
      typeLabel: isVital ? '🚨 Part Critical (Vital)' : '🔴 Part Critical',
      typeColor: '#ef4444',
      typeBg: 'rgba(239,68,68,0.12)',
      typeBorder: 'rgba(239,68,68,0.3)',
    };
  };

  const urgentPrCount = lowStockItems.filter((sp) => classifyItem(sp).type === 'URGENT_PR').length;
  const activeProcurementCount = lowStockItems.filter((sp) => classifyItem(sp).type === 'ACTIVE_PR_PO').length;
  const pettyCashCount = lowStockItems.filter((sp) => classifyItem(sp).type === 'PETTY_CASH').length;

  const filteredCriticalItems = lowStockItems.filter((sp) => {
    if (criticalTab === 'ALL') return true;
    const c = classifyItem(sp);
    return c.type === criticalTab;
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
                <span>🚨</span> Barang Perlu Restock (ROP System)
              </div>
              <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 2 }}>
                Prioritas pengadaan berdasarkan ROP &amp; status pengadaan
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
                onClick={() => setCriticalTab('URGENT_PR')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: criticalTab === 'URGENT_PR' ? 'rgba(239,68,68,0.15)' : 'transparent',
                  color: criticalTab === 'URGENT_PR' ? '#ef4444' : 'var(--tx3)',
                  borderColor: criticalTab === 'URGENT_PR' ? 'rgba(239,68,68,0.4)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                🚨 Segera PR ({urgentPrCount})
              </button>

              <button
                type="button"
                onClick={() => setCriticalTab('ACTIVE_PR_PO')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: criticalTab === 'ACTIVE_PR_PO' ? 'rgba(234,179,8,0.15)' : 'transparent',
                  color: criticalTab === 'ACTIVE_PR_PO' ? '#eab308' : 'var(--tx3)',
                  borderColor: criticalTab === 'ACTIVE_PR_PO' ? 'rgba(234,179,8,0.4)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                ⏳ PR/PO Jalan ({activeProcurementCount})
              </button>

              <button
                type="button"
                onClick={() => setCriticalTab('PETTY_CASH')}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: criticalTab === 'PETTY_CASH' ? 'rgba(16,185,129,0.15)' : 'transparent',
                  color: criticalTab === 'PETTY_CASH' ? '#10b981' : 'var(--tx3)',
                  borderColor: criticalTab === 'PETTY_CASH' ? 'rgba(16,185,129,0.4)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                💵 Petty Cash ({pettyCashCount})
              </button>
            </div>
          </div>

          {/* CRITICAL ITEM LIST WITH 2 DISTINCT BADGES */}
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

                        {/* BADGE 1: Part Critical vs Consumable */}
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

                    {/* BADGE 2: Status Pengadaan & Sisa Stok */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 800,
                          background: info.bg,
                          color: info.color,
                          border: `1px solid ${info.border}`,
                        }}
                      >
                        {info.label}
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

                        {/* BADGE: Part Critical vs Consumable */}
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
