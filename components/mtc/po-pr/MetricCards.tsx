import React from 'react';
import { TrackingItem, CardFilterType, TabType } from '@/types/mtc/procurement';
import { fmtRupiah, isClosedOrDone } from '@/lib/mtc/procurement-utils';

type MetricCardsProps = {
  stats: {
    draftCount: number;
    approvalCount: number;
    poCount: number;
    doneCount: number;
  };
  cardFilter: CardFilterType;
  setCardFilter: (val: CardFilterType) => void;
  setActiveTab: (tab: TabType) => void;
  scopedItems: TrackingItem[];
};

export const MetricCards: React.FC<MetricCardsProps> = ({
  stats,
  cardFilter,
  setCardFilter,
  setActiveTab,
  scopedItems,
}) => {
  const recentUpdates = scopedItems
    .filter((item) => {
      const upd = item.updatedAt;
      if (!upd) return false;
      const diffHours = (new Date().getTime() - new Date(upd).getTime()) / (1000 * 60 * 60);
      return diffHours <= 72;
    })
    .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime());

  return (
    <>
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div
          className="stat-card stat-ylw"
          style={{
            cursor: 'pointer',
            transition: 'all 0.2s',
            borderLeft: '4px solid #9ca3af',
            boxShadow:
              cardFilter === 'DRAFT'
                ? '0 0 0 2px #9ca3af, 0 4px 20px rgba(156, 163, 175, 0.25)'
                : 'none',
            transform: cardFilter === 'DRAFT' ? 'scale(1.02)' : 'scale(1)',
            opacity: cardFilter && cardFilter !== 'DRAFT' ? 0.6 : 1,
          }}
          onClick={() => {
            if (cardFilter === 'DRAFT') {
              setCardFilter(null);
            } else {
              setCardFilter('DRAFT');
              setActiveTab('DRAFT');
            }
          }}
        >
          <div className="stat-label">📝 1. Awal PR (Draft)</div>
          <div className="stat-value">{stats.draftCount}</div>
          <div className="stat-sub">Pengajuan awal PR, belum disetujui Finance</div>
        </div>

        <div
          className="stat-card stat-blu"
          style={{
            cursor: 'pointer',
            transition: 'all 0.2s',
            borderLeft: '4px solid var(--blu)',
            boxShadow:
              cardFilter === 'APPROVAL'
                ? '0 0 0 2px var(--blu), 0 4px 20px rgba(59, 130, 246, 0.25)'
                : 'none',
            transform: cardFilter === 'APPROVAL' ? 'scale(1.02)' : 'scale(1)',
            opacity: cardFilter && cardFilter !== 'APPROVAL' ? 0.6 : 1,
          }}
          onClick={() => {
            if (cardFilter === 'APPROVAL') {
              setCardFilter(null);
            } else {
              setCardFilter('APPROVAL');
              setActiveTab('APPROVAL');
            }
          }}
        >
          <div className="stat-label">⚖️ 2. Approval & Penawaran</div>
          <div className="stat-value">{stats.approvalCount}</div>
          <div className="stat-sub">Disetujui Finance & proses penawaran / RFQ</div>
        </div>

        <div
          className="stat-card stat-pur"
          style={{
            cursor: 'pointer',
            transition: 'all 0.2s',
            borderLeft: '4px solid var(--pur)',
            boxShadow:
              cardFilter === 'PO'
                ? '0 0 0 2px var(--pur), 0 4px 20px rgba(168, 85, 247, 0.25)'
                : 'none',
            transform: cardFilter === 'PO' ? 'scale(1.02)' : 'scale(1)',
            opacity: cardFilter && cardFilter !== 'PO' ? 0.6 : 1,
          }}
          onClick={() => {
            if (cardFilter === 'PO') {
              setCardFilter(null);
            } else {
              setCardFilter('PO');
              setActiveTab('PO');
            }
          }}
        >
          <div className="stat-label">🚢 3. PO Terbit</div>
          <div className="stat-value">{stats.poCount}</div>
          <div className="stat-sub">PO terbit di Odoo, menunggu barang datang</div>
        </div>

        <div
          className="stat-card stat-grn"
          style={{
            cursor: 'pointer',
            transition: 'all 0.2s',
            borderLeft: '4px solid var(--grn)',
            boxShadow:
              cardFilter === 'DONE'
                ? '0 0 0 2px var(--grn), 0 4px 20px rgba(34, 197, 94, 0.25)'
                : 'none',
            transform: cardFilter === 'DONE' ? 'scale(1.02)' : 'scale(1)',
            opacity: cardFilter && cardFilter !== 'DONE' ? 0.6 : 1,
          }}
          onClick={() => {
            if (cardFilter === 'DONE') {
              setCardFilter(null);
            } else {
              setCardFilter('DONE');
              setActiveTab('DONE');
            }
          }}
        >
          <div className="stat-label">✓ 4. Selesai (Diterima)</div>
          <div className="stat-value">{stats.doneCount}</div>
          <div className="stat-sub">Barang sudah diterima & masuk stok gudang</div>
        </div>
      </div>

      {/* RECENT UPDATES FEED */}
      {recentUpdates.length > 0 && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            border: '1px solid rgba(168, 85, 247, 0.2)',
            background:
              'linear-gradient(135deg, rgba(59, 130, 246, 0.02) 0%, rgba(168, 85, 247, 0.02) 100%)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>📢</span>
            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--pur)' }}>
              Pemberitahuan Perubahan Status Terbaru (72 Jam Terakhir)
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              maxHeight: 150,
              overflowY: 'auto',
              paddingRight: 8,
            }}
          >
            {recentUpdates.map((item) => {
              let badgeText = 'Update';
              let badgeBg = 'var(--sf3)';
              let message = `Barang "${item.originalName}" telah diperbarui.`;
              const updateTime = item.updatedAt
                ? new Date(item.updatedAt).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  }) +
                  ', ' +
                  new Date(item.updatedAt)
                    .toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })
                    .replace('.', ':') +
                  ' WIB'
                : '';

              if (item.statusPr === 'WAITING_PRICE') {
                badgeText = 'Menunggu Harga';
                badgeBg = 'rgba(234, 179, 8, 0.15)';
                message = `Barang baru "${item.originalName}" diajukan dan sedang menunggu input harga resmi dari SCM.`;
              } else if (item.statusPr === 'READY_ODOO') {
                badgeText = 'Harga Siap';
                badgeBg = 'rgba(34, 197, 94, 0.15)';
                message = `Harga barang "${item.originalName}" selesai diupdate oleh SCM (${fmtRupiah(
                  Number(item.harga)
                )}), siap diajukan ke Odoo.`;
              } else if (item.tanggalTerima || isClosedOrDone(item)) {
                badgeText = 'Diterima';
                badgeBg = 'rgba(34, 197, 94, 0.25)';
                message = `Barang "${item.originalName}" telah dicatat masuk (Goods Received / GR).`;
              } else if (item.nomorPo) {
                badgeText = 'PO Terbit';
                badgeBg = 'rgba(59, 130, 246, 0.2)';
                message = `Nomor PO "${item.nomorPo}" telah diterbitkan untuk "${item.originalName}" (Vendor: ${
                  item.vendor || '—'
                }).`;
              } else if (item.nomorPr) {
                badgeText = 'PR Diajukan';
                badgeBg = 'rgba(168, 85, 247, 0.15)';
                message = `Nomor PR "${item.nomorPr}" telah diajukan untuk "${item.originalName}".`;
              }

              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--sf2)',
                    border: '1px solid var(--br)',
                    borderRadius: 8,
                    fontSize: 11,
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      className="badge"
                      style={{
                        background: badgeBg,
                        color: 'var(--tx1)',
                        border: '1px solid var(--br)',
                        fontSize: 9,
                        padding: '3px 8px',
                      }}
                    >
                      {badgeText}
                    </span>
                    <span style={{ color: 'var(--tx2)' }}>{message}</span>
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
                    {updateTime}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {cardFilter && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            background: 'rgba(168, 85, 247, 0.08)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            borderRadius: 8,
            padding: '10px 16px',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🎯</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tx1)' }}>
              Filter Aktif Kartu Metrik: &quot;
              {cardFilter === 'WAITING_PRICE'
                ? 'Belum Ada Harga (Pengadaan Baru)'
                : cardFilter === 'PR_PENDING'
                ? 'PR Tunggu Persetujuan'
                : cardFilter === 'PO_RECEIVED'
                ? 'PO Sudah Di-GR (Selesai)'
                : 'PO Belum Di-GR (Belum Selesai)'}
              &quot;
            </span>
          </div>
          <button
            type="button"
            className="btn btn-pur btn-sm"
            onClick={() => setCardFilter(null)}
            style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '4px 10px',
              height: 'auto',
              background: 'linear-gradient(135deg, var(--pur) 0%, #4f46e5 100%)',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              borderRadius: 4,
            }}
          >
            ✕ Hapus Filter Kartu
          </button>
        </div>
      )}
    </>
  );
};
