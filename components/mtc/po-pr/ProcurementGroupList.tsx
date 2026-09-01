import React, { Fragment } from 'react';
import { TrackingItem, GroupedPrItem } from '@/types/mtc/procurement';
import { parseOdooLinks, fmtRupiah, getStatusBadgeStyles } from '@/lib/mtc/procurement-utils';

type ProcurementGroupListProps = {
  groupedPrItems: GroupedPrItem[];
  filteredItemsCount: number;
  groupingMode: 'PR' | 'PO';
  setGroupingMode: (mode: 'PR' | 'PO') => void;
  sortBy: 'document' | 'vendor' | 'date';
  setSortBy: (sort: 'document' | 'vendor' | 'date') => void;
  expandedGroups: { [key: string]: boolean };
  toggleGroupExpand: (key: string) => void;
  expandedRows: { [key: number]: boolean };
  toggleRowExpand: (itemId: number) => void;
  activeCopyPopoverId: number | null;
  setActiveCopyPopoverId: (id: number | null) => void;
  openEditModal: (item: TrackingItem) => void;
  openReceiveModal: (item: TrackingItem) => void;
  openOdooProcessedModal: (item: TrackingItem) => void;
  openLinkModal: (item: TrackingItem) => void;
  handleUnlinkItem: (item: TrackingItem) => void;
  actionLoading: string | null;
  activeTab: string;
};

interface OdooChatterMessage {
  date?: string;
  author?: string;
  body?: string;
  phase?: string;
}

const OdooChatterViewer: React.FC<{ odooNotes?: string | null }> = ({ odooNotes }) => {
  const getParsedLogs = (): { type: 'logs'; logs: OdooChatterMessage[] } | { type: 'text'; text: string } | null => {
    if (!odooNotes || !odooNotes.trim()) return null;
    const raw = odooNotes.trim();
    if (raw.startsWith('[') || raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { type: 'logs', logs: parsed };
        }
        if (typeof parsed === 'object' && parsed !== null) {
          return { type: 'logs', logs: [parsed] };
        }
      } catch (e) {
        // Fallback to text
      }
    }
    return { type: 'text', text: raw };
  };

  const data = getParsedLogs();

  if (!data) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: 8,
          border: '1px dashed var(--br)',
          color: 'var(--tx3)',
          fontSize: 12,
        }}
      >
        <span style={{ fontSize: 16 }}>📭</span>
        <span>Belum ada log catatan chatter atau riwayat approval Odoo untuk pengajuan ini.</span>
      </div>
    );
  }

  if (data.type === 'text') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: 'var(--pur)' }}>
          <span>💬</span>
          <span>LOG PELACAKAN & KOMENTAR CHATTER ODOO</span>
        </div>
        <div
          style={{
            padding: '10px 14px',
            background: 'var(--sf3)',
            borderRadius: 8,
            border: '1px solid var(--br)',
            color: 'var(--tx2)',
            fontSize: 12,
            lineHeight: 1.6,
          }}
          dangerouslySetInnerHTML={{ __html: data.text }}
        />
      </div>
    );
  }

  const { logs } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13 }}>💬</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--pur)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Log Pelacakan & Komentar Chatter Odoo
          </span>
        </div>
        <span
          className="badge"
          style={{
            fontSize: 10,
            padding: '2px 8px',
            fontWeight: 700,
            background: 'rgba(168, 85, 247, 0.12)',
            color: '#c084fc',
            border: '1px solid rgba(168, 85, 247, 0.25)',
          }}
        >
          {logs.length} Aktivitas / Catatan Tercatat
        </span>
      </div>

      {/* Timeline List */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          paddingLeft: 18,
          borderLeft: '2px solid rgba(168, 85, 247, 0.25)',
          marginLeft: 8,
          gap: 10,
        }}
      >
        {logs.map((log, idx) => {
          const author = log.author || 'Sistem Odoo';
          const upperAuthor = author.toUpperCase();
          const isAudit = upperAuthor.includes('AUDIT');
          const isProcurement =
            upperAuthor.includes('PROCUREMENT') ||
            upperAuthor.includes('PURCHASING') ||
            upperAuthor.includes('BUYER');
          const isProd =
            upperAuthor.includes('PROD') ||
            upperAuthor.includes('MTC') ||
            upperAuthor.includes('MAINTENANCE');
          const isFinance =
            upperAuthor.includes('FINANCE') ||
            upperAuthor.includes('ACC') ||
            upperAuthor.includes('MANAGER');

          let avatarIcon = '👤';
          let avatarBg = 'rgba(255, 255, 255, 0.08)';
          let avatarColor = 'var(--tx2)';
          let borderAccent = 'var(--br)';
          let dotColor = 'var(--pur)';

          if (isAudit) {
            avatarIcon = '🛡️';
            avatarBg = 'rgba(59, 130, 246, 0.15)';
            avatarColor = '#60a5fa';
            borderAccent = 'rgba(59, 130, 246, 0.3)';
            dotColor = '#3b82f6';
          } else if (isProcurement) {
            avatarIcon = '🛒';
            avatarBg = 'rgba(168, 85, 247, 0.15)';
            avatarColor = '#c084fc';
            borderAccent = 'rgba(168, 85, 247, 0.3)';
            dotColor = '#a855f7';
          } else if (isProd) {
            avatarIcon = '🏭';
            avatarBg = 'rgba(234, 179, 8, 0.15)';
            avatarColor = '#facc15';
            borderAccent = 'rgba(234, 179, 8, 0.3)';
            dotColor = '#eab308';
          } else if (isFinance) {
            avatarIcon = '💼';
            avatarBg = 'rgba(34, 197, 94, 0.15)';
            avatarColor = '#4ade80';
            borderAccent = 'rgba(34, 197, 94, 0.3)';
            dotColor = '#22c55e';
          }

          let formattedDate = log.date || '—';
          if (log.date) {
            try {
              const d = new Date(log.date.replace(' ', 'T'));
              if (!isNaN(d.getTime())) {
                formattedDate = d.toLocaleString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                });
              }
            } catch (e) {}
          }

          const hasBody = log.body && log.body.trim().length > 0;
          let cleanBody = log.body || '';
          if (cleanBody) {
            cleanBody = cleanBody.replace(
              /<i[^>]*class=["'][^"']*fa-thumbs-up[^"']*["'][^>]*><\/i>/gi,
              ' <span style="color:#22c55e;font-size:13px;display:inline-block;margin-left:4px;">👍</span> '
            );
          }

          return (
            <div
              key={idx}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                background: 'var(--sf3)',
                border: `1px solid ${borderAccent}`,
                borderRadius: 8,
                padding: '9px 12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              }}
            >
              {/* Timeline Bullet Node */}
              <div
                style={{
                  position: 'absolute',
                  left: -25,
                  top: 12,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: dotColor,
                  border: '2px solid var(--sf2)',
                  boxShadow: `0 0 6px ${dotColor}`,
                }}
              />

              {/* Author, Phase & Date */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      background: avatarBg,
                      color: avatarColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                    }}
                  >
                    {avatarIcon}
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 11.5, color: 'var(--tx)' }}>{author}</span>
                  {log.phase && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: '1px 5px',
                        borderRadius: 4,
                        fontWeight: 800,
                        background:
                          log.phase === 'PO'
                            ? 'rgba(34, 197, 94, 0.15)'
                            : 'rgba(168, 85, 247, 0.15)',
                        color: log.phase === 'PO' ? '#4ade80' : '#c084fc',
                        border:
                          log.phase === 'PO'
                            ? '1px solid rgba(34, 197, 94, 0.3)'
                            : '1px solid rgba(168, 85, 247, 0.3)',
                      }}
                    >
                      {log.phase}
                    </span>
                  )}
                </div>

                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--tx3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>🕒</span>
                  <span>{formattedDate}</span>
                </div>
              </div>

              {/* Message Body or Activity Indicator */}
              {hasBody ? (
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--tx)',
                    lineHeight: 1.5,
                    marginTop: 2,
                    padding: '6px 10px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                  dangerouslySetInnerHTML={{ __html: cleanBody }}
                />
              ) : (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--tx3)',
                    fontStyle: 'italic',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>📌</span>
                  <span>Aktivitas / status dokumen tercatat di Odoo</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ProcurementGroupList: React.FC<ProcurementGroupListProps> = ({
  groupedPrItems,
  filteredItemsCount,
  groupingMode,
  setGroupingMode,
  sortBy,
  setSortBy,
  expandedGroups,
  toggleGroupExpand,
  expandedRows,
  toggleRowExpand,
  activeCopyPopoverId,
  setActiveCopyPopoverId,
  openEditModal,
  openReceiveModal,
  openOdooProcessedModal,
  openLinkModal,
  handleUnlinkItem,
  actionLoading,
  activeTab,
}) => {
  function renderFormattedItemName(name: string) {
    if (!name) return '—';
    const dashIndex = name.lastIndexOf(' - ');
    if (dashIndex > 8) {
      const mainTitle = name.substring(0, dashIndex).trim();
      const variantSuffix = name.substring(dashIndex + 3).trim();
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
          <span style={{ fontWeight: 700, color: 'var(--tx)' }}>{mainTitle}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.12)',
              padding: '1px 6px',
              borderRadius: 4,
              border: '1px solid rgba(56, 189, 248, 0.25)',
              display: 'inline-block',
            }}
          >
            🏷️ Varian: {variantSuffix}
          </span>
        </div>
      );
    }
    return <span style={{ fontWeight: 700, color: 'var(--tx)' }}>{name}</span>;
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📋</span> Daftar Pengadaan SCM ({filteredItemsCount} Item Terfilter)
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Sort Control */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--sf2)',
              padding: '3px 8px',
              borderRadius: 8,
              border: '1px solid var(--br)',
              height: '36px',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx3)' }}>URUTKAN BY:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--tx2)',
                fontSize: 10,
                fontWeight: 800,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="document" style={{ background: 'var(--sf3)', color: 'var(--tx)' }}>
                Nomor Dokumen
              </option>
              <option value="vendor" style={{ background: 'var(--sf3)', color: 'var(--tx)' }}>
                Nama Vendor
              </option>
              <option value="date" style={{ background: 'var(--sf3)', color: 'var(--tx)' }}>
                Tanggal
              </option>
            </select>
          </div>

          {/* Grouping Mode Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--sf2)',
              padding: 3,
              borderRadius: 8,
              border: '1px solid var(--br)',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--tx3)', padding: '0 8px' }}>
              KELOMPOKKAN BY:
            </span>
            <button
              type="button"
              onClick={() => setGroupingMode('PR')}
              style={{
                border: 'none',
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 800,
                cursor: 'pointer',
                background: groupingMode === 'PR' ? 'var(--sf3)' : 'transparent',
                color: groupingMode === 'PR' ? 'var(--pur)' : 'var(--tx3)',
                boxShadow: groupingMode === 'PR' ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              📋 Nomor PR
            </button>
            <button
              type="button"
              onClick={() => setGroupingMode('PO')}
              style={{
                border: 'none',
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 800,
                cursor: 'pointer',
                background: groupingMode === 'PO' ? 'var(--sf3)' : 'transparent',
                color: groupingMode === 'PO' ? 'var(--pur)' : 'var(--tx3)',
                boxShadow: groupingMode === 'PO' ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              🚢 Nomor PO & Vendor
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {groupedPrItems.map((group) => {
          const isPrDraft = groupingMode === 'PR' ? group.nomorPr === null : group.nomorPo === null;
          const prKey =
            groupingMode === 'PR'
              ? group.nomorPr === null
                ? 'DRAFT'
                : group.nomorPr
              : group.nomorPo === null
              ? 'BELUM_ADA_PO'
              : group.nomorPo;
          const isExpanded = !!expandedGroups[prKey];
          const hasUrgentItem = group.hasUrgent;

          // Simplified Group Header Badge
          let statusBadge = null;
          if (group.overallStatus === 'CANCELLED') {
            statusBadge = (
              <span
                className="badge badge-red"
                style={{
                  padding: '4px 10px',
                  fontSize: 10,
                  fontWeight: 700,
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                }}
              >
                🚫 Dibatalkan
              </span>
            );
          } else if (group.overallStatus === 'DONE') {
            statusBadge = (
              <span className="badge badge-grn" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>
                ✓ Selesai (Diterima)
              </span>
            );
          } else if (group.overallStatus === 'PO') {
            statusBadge = (
              <span className="badge badge-pur" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }}>
                🚢 3. PO Terbit
              </span>
            );
          } else if (group.overallStatus === 'APPROVAL') {
            statusBadge = (
              <span className="badge badge-blu" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>
                ⚖️ 2. Proses Approval
              </span>
            );
          } else {
            statusBadge = (
              <span className="badge badge-ylw" style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700 }}>
                📝 1. Draft
              </span>
            );
          }

          return (
            <div
              key={prKey}
              className="card"
              style={{
                overflow: 'hidden',
                borderLeft:
                  group.overallStatus === 'DONE'
                    ? '4px solid var(--grn)'
                    : group.overallStatus === 'CANCELLED'
                    ? '4px solid var(--red)'
                    : hasUrgentItem
                    ? '4px solid var(--red)'
                    : isPrDraft
                    ? '4px solid var(--ylw)'
                    : '1px solid var(--br)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              {/* GROUP HEADER */}
              <div
                onClick={() => toggleGroupExpand(prKey)}
                style={{
                  padding: '16px 20px',
                  background: isPrDraft ? 'rgba(234, 179, 8, 0.02)' : 'var(--sf2)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'text',
                  borderBottom: isExpanded ? '1px solid var(--br)' : 'none',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sf3)')}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = isPrDraft ? 'rgba(234, 179, 8, 0.02)' : 'var(--sf2)')
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: 12,
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      color: 'var(--tx3)',
                    }}
                  >
                    ▶
                  </span>

                  <div>
                    {(() => {
                      const prUrl = group.items.map((i) => parseOdooLinks(i).prUrl).find(Boolean);
                      const poUrl = group.items.map((i) => parseOdooLinks(i).poUrl).find(Boolean);

                      return groupingMode === 'PR' ? (
                        isPrDraft ? (
                          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ylw)' }}>
                            📝 DRAFT PENDING / BELUM ADA NO PR
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 600 }}>NOMOR PR:</span>
                            {prUrl ? (
                              <a
                                href={prUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="badge badge-ylw"
                                style={{
                                  fontSize: 12,
                                  padding: '2px 8px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title="Buka Lembar PR di Odoo"
                              >
                                {group.nomorPr} ↗
                              </a>
                            ) : (
                              <span
                                className="badge badge-ylw"
                                style={{
                                  fontSize: 12,
                                  padding: '2px 8px',
                                  fontWeight: 800,
                                  cursor: 'text',
                                  userSelect: 'text',
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {group.nomorPr}
                              </span>
                            )}
                            {(() => {
                              const teNo = group.items.map((i) => i.nomorTe).find(Boolean);
                              return teNo ? (
                                <span
                                  className="badge"
                                  style={{
                                    fontSize: 11,
                                    padding: '2px 8px',
                                    fontWeight: 800,
                                    background: 'rgba(168, 85, 247, 0.15)',
                                    color: '#c084fc',
                                    border: '1px solid rgba(168, 85, 247, 0.3)',
                                  }}
                                  title="Nomor Tiket TE (Request Odoo)"
                                >
                                  TE: {teNo}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        )
                      ) : isPrDraft ? (
                        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--pur)' }}>
                          ⏳ TAHAP PR / BELUM TERBIT PO (SCM)
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--tx3)', fontWeight: 600 }}>NOMOR PO:</span>
                          {poUrl ? (
                            <a
                              href={poUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="badge badge-blu"
                              style={{
                                fontSize: 12,
                                padding: '2px 8px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                              onClick={(e) => e.stopPropagation()}
                              title="Buka Lembar PO di Odoo"
                            >
                              {group.nomorPo} ↗
                            </a>
                          ) : (
                            <span
                              className="badge badge-blu"
                              style={{
                                fontSize: 12,
                                padding: '2px 8px',
                                fontWeight: 800,
                                cursor: 'text',
                                userSelect: 'text',
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {group.nomorPo}
                            </span>
                          )}
                        </div>
                      );
                    })()}

                    <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 4 }}>
                      {groupingMode === 'PR' ? 'Tanggal Pengajuan: ' : 'Tanggal Pengadaan: '}
                      <strong style={{ color: 'var(--tx2)' }}>{group.oldestDateStr}</strong> · Lead Time:{' '}
                      <strong style={{ color: 'var(--tx)' }}>{group.daysRunningStr}</strong>
                    </div>
                  </div>

                  {/* Secondary Badges for PO or PR Numbers */}
                  {groupingMode === 'PR'
                    ? !isPrDraft &&
                      group.poNumbers !== '—' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 600 }}>PO NO:</span>
                          {group.poNumbers.split(', ').map((po) => {
                            const itemWithPo = group.items.find((i) => i.nomorPo === po);
                            const poUrl = itemWithPo ? parseOdooLinks(itemWithPo).poUrl : null;
                            return poUrl ? (
                              <a
                                key={po}
                                href={poUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="badge badge-blu"
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title="Buka PO di Odoo"
                              >
                                {po} ↗
                              </a>
                            ) : (
                              <span
                                key={po}
                                className="badge badge-blu"
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  fontWeight: 800,
                                  cursor: 'text',
                                  userSelect: 'text',
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {po}
                              </span>
                            );
                          })}
                        </div>
                      )
                    : !isPrDraft &&
                      group.prNumbers !== '—' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 600 }}>PR NO:</span>
                          {group.prNumbers.split(', ').map((pr) => {
                            const itemWithPr = group.items.find((i) => i.nomorPr === pr);
                            const prUrl = itemWithPr ? parseOdooLinks(itemWithPr).prUrl : null;
                            return prUrl ? (
                              <a
                                key={pr}
                                href={prUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="badge badge-ylw"
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  fontWeight: 800,
                                  cursor: 'pointer',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title="Buka PR di Odoo"
                              >
                                {pr} ↗
                              </a>
                            ) : (
                              <span
                                key={pr}
                                className="badge badge-ylw"
                                style={{
                                  fontSize: 11,
                                  padding: '2px 8px',
                                  fontWeight: 800,
                                  cursor: 'text',
                                  userSelect: 'text',
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {pr}
                              </span>
                            );
                          })}
                        </div>
                      )}

                  {/* Vendor Summary */}
                  <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                    Vendor: <span style={{ color: 'var(--tx2)', fontWeight: 600 }}>{group.vendors}</span>
                  </div>

                  {hasUrgentItem && group.overallStatus !== 'DONE' && (
                    <span className="badge badge-red" style={{ fontSize: 9, fontWeight: 800 }}>
                      🚨 ADA ITEM URGENT
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--tx)' }}>
                      {fmtRupiah(group.totalCost)}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--tx3)',
                        marginTop: 2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        {group.items.length} Item ({group.totalQty} Pcs)
                      </span>
                      {group.poItemsCount > 0 && (
                        <>
                          ·
                          {group.belumGrCount > 0 ? (
                            <span
                              className="badge"
                              style={{
                                fontSize: 9,
                                padding: '2px 6px',
                                fontWeight: 800,
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                              }}
                            >
                              ⚠️ {group.belumGrCount} Belum GR
                            </span>
                          ) : (
                            <span
                              className="badge"
                              style={{
                                fontSize: 9,
                                padding: '2px 6px',
                                fontWeight: 800,
                                background: 'rgba(34, 197, 94, 0.15)',
                                color: '#4ade80',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                              }}
                            >
                              ✓ Semua GR
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {statusBadge}
                </div>
              </div>

              {/* GROUP DETAIL TABLE */}
              {isExpanded && (
                <div style={{ padding: '0 0 10px 0', background: 'rgba(255,255,255,0.01)' }}>
                  <div className="table-wrap" style={{ overflowX: 'auto', border: 'none', borderRadius: 0 }}>
                    <table style={{ minWidth: 1200, background: 'transparent' }}>
                      <thead>
                        <tr style={{ background: 'rgba(0,0,0,0.1)' }}>
                          <th style={{ width: 60, textAlign: 'center', paddingLeft: 20 }}>Nomor</th>
                          <th style={{ minWidth: 260 }}>Nama Barang / Suku Cadang (Odoo)</th>
                          <th style={{ minWidth: 240 }}>Koneksi Database Resmi MTC (Odoo)</th>
                          <th style={{ minWidth: 140, textAlign: 'center' }}>Fondasi Stok</th>
                          <th style={{ width: 80, textAlign: 'center' }}>Qty</th>
                          <th style={{ minWidth: 160 }}>Harga & Keterangan</th>
                          <th style={{ width: 60, textAlign: 'center' }}>GR Link</th>
                          <th style={{ textAlign: 'right', minWidth: 220, paddingRight: 20 }}>Aksi & Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => {
                          const isItemUrgent = item.urgency === 'Urgent';
                          const isOdooGrDone = item.statusPo === 'DONE';
                          const isItemReceived = !!item.tanggalTerima || isOdooGrDone;
                          const effectiveGrLink = parseOdooLinks(item).grUrl || item.linkGr;

                          return (
                            <Fragment key={item.id}>
                              <tr
                                style={{
                                  borderBottom: '1px solid var(--br)',
                                  backgroundColor:
                                    isItemUrgent && !isItemReceived ? 'rgba(239, 68, 68, 0.02)' : 'transparent',
                                  cursor: 'pointer',
                                }}
                                onClick={() => toggleRowExpand(item.id)}
                              >
                                <td
                                  className="text-mono text-tiny text-muted"
                                  style={{ textAlign: 'center', paddingLeft: 20 }}
                                >
                                  {item.fbIndex || '—'}
                                </td>

                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      {isItemUrgent && !isItemReceived && (
                                        <span style={{ color: 'var(--red)', fontSize: 12 }}>🚨</span>
                                      )}
                                      {renderFormattedItemName(item.originalName)}
                                    </div>

                                    {item.statusPr === 'READY_ODOO' && (
                                      <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                                        <button
                                          type="button"
                                          className="btn btn-ghost btn-sm"
                                          onClick={() =>
                                            setActiveCopyPopoverId(activeCopyPopoverId === item.id ? null : item.id)
                                          }
                                          style={{
                                            padding: '2px 6px',
                                            fontSize: 10,
                                            height: 'auto',
                                            borderRadius: 4,
                                            background: 'rgba(124, 58, 237, 0.15)',
                                            color: '#c084fc',
                                            border: '1px solid rgba(124, 58, 237, 0.3)',
                                          }}
                                        >
                                          📋 Salin Odoo
                                        </button>

                                        {activeCopyPopoverId === item.id && (
                                          <div
                                            style={{
                                              position: 'absolute',
                                              top: '100%',
                                              right: 0,
                                              background: 'var(--sf3)',
                                              border: '1px solid var(--br)',
                                              borderRadius: 8,
                                              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                                              zIndex: 100,
                                              padding: 8,
                                              display: 'flex',
                                              flexDirection: 'column',
                                              gap: 6,
                                              minWidth: 160,
                                              marginTop: 4,
                                            }}
                                          >
                                            <div
                                              style={{
                                                fontSize: 9,
                                                fontWeight: 800,
                                                color: 'var(--tx3)',
                                                borderBottom: '1px solid var(--br)',
                                                paddingBottom: 4,
                                                marginBottom: 2,
                                              }}
                                            >
                                              Widget Quick-Copy
                                            </div>
                                            <button
                                              type="button"
                                              className="btn btn-ghost btn-sm"
                                              onClick={() => {
                                                navigator.clipboard.writeText(
                                                  item.sparepart?.nama || item.originalName
                                                );
                                                alert('✓ Nama Resmi disalin!');
                                                setActiveCopyPopoverId(null);
                                              }}
                                              style={{ justifyContent: 'flex-start', fontSize: 10, padding: '4px 8px' }}
                                            >
                                              📄 Nama Resmi
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-ghost btn-sm"
                                              onClick={() => {
                                                navigator.clipboard.writeText(String(item.harga || 0));
                                                alert('✓ Harga disalin!');
                                                setActiveCopyPopoverId(null);
                                              }}
                                              style={{ justifyContent: 'flex-start', fontSize: 10, padding: '4px 8px' }}
                                            >
                                              💰 Harga Satuan
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-ghost btn-sm"
                                              onClick={() => {
                                                navigator.clipboard.writeText(String(item.qty));
                                                alert('✓ Qty disalin!');
                                                setActiveCopyPopoverId(null);
                                              }}
                                              style={{ justifyContent: 'flex-start', fontSize: 10, padding: '4px 8px' }}
                                            >
                                              📦 Jumlah (Qty)
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-ghost btn-sm"
                                              disabled={!item.linkReferences}
                                              onClick={() => {
                                                if (item.linkReferences) {
                                                  navigator.clipboard.writeText(item.linkReferences);
                                                  alert('✓ Link Referensi disalin!');
                                                }
                                                setActiveCopyPopoverId(null);
                                              }}
                                              style={{
                                                justifyContent: 'flex-start',
                                                fontSize: 10,
                                                padding: '4px 8px',
                                                opacity: item.linkReferences ? 1 : 0.5,
                                              }}
                                            >
                                              🔗 Link Referensi
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {item.reason && (
                                    <div
                                      style={{
                                        fontSize: 10,
                                        color: 'var(--tx3)',
                                        marginTop: 4,
                                        fontStyle: 'italic',
                                      }}
                                    >
                                      &quot;{item.reason}&quot;
                                    </div>
                                  )}
                                </td>

                                {/* Odoo Connected Item */}
                                <td>
                                  {item.sparepart ? (
                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <div style={{ fontWeight: 700, color: 'var(--tx2)', fontSize: 12 }}>
                                          {item.sparepart.nama}
                                        </div>
                                        {item.statusPr && item.statusPr !== 'READY_ODOO' && (
                                          <span
                                            className="badge"
                                            style={{
                                              fontSize: 8,
                                              padding: '1px 5px',
                                              fontWeight: 800,
                                              ...getStatusBadgeStyles(item.statusPr),
                                            }}
                                          >
                                            {item.statusPr}
                                          </span>
                                        )}
                                        {item.nomorPo && (
                                          <span
                                            className="badge"
                                            style={{
                                              fontSize: 8,
                                              padding: '2px 6px',
                                              fontWeight: 800,
                                              background: isOdooGrDone
                                                ? 'rgba(34, 197, 94, 0.15)'
                                                : 'rgba(239, 68, 68, 0.15)',
                                              color: isOdooGrDone ? '#22c55e' : '#f87171',
                                              border: isOdooGrDone
                                                ? '1px solid rgba(34, 197, 94, 0.3)'
                                                : '1px solid rgba(239, 68, 68, 0.3)',
                                              marginLeft: 4,
                                            }}
                                            title={
                                              isOdooGrDone
                                                ? 'Status Odoo: Receipt sudah divalidate'
                                                : 'Status Odoo: Receipt belum divalidate'
                                            }
                                          >
                                            {isOdooGrDone ? `✓ PO Odoo: ${item.nomorPo}` : `⚠️ PO Odoo: ${item.nomorPo}`}
                                          </span>
                                        )}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 9,
                                          color: 'var(--tx3)',
                                          marginTop: 2,
                                          display: 'flex',
                                          gap: 6,
                                          alignItems: 'center',
                                        }}
                                      >
                                        <span className="text-mono">{item.sparepart.id}</span>
                                        ·
                                        <span>SLOC:</span>
                                        <span className="badge badge-blu" style={{ fontSize: 8, padding: '1px 4px' }}>
                                          {item.sparepart.lokasi || '—'}
                                        </span>
                                        ·
                                        <button
                                          type="button"
                                          className="btn btn-ghost"
                                          onClick={() => openLinkModal(item)}
                                          style={{
                                            fontSize: 9,
                                            padding: '1px 4px',
                                            color: 'var(--pur)',
                                            height: 'auto',
                                            border: '1px solid rgba(168, 85, 247, 0.3)',
                                            borderRadius: 4,
                                            background: 'rgba(168, 85, 247, 0.05)',
                                          }}
                                          title="Ubah hubungan suku cadang"
                                        >
                                          ✏️ Ubah
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <div
                                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <span className="badge badge-red" style={{ fontSize: 9, padding: '2px 6px' }}>
                                          ⚠️ Unlinked / General
                                        </span>
                                        <button
                                          type="button"
                                          className="btn btn-ghost btn-sm"
                                          onClick={() => openLinkModal(item)}
                                          style={{
                                            fontSize: 9,
                                            padding: '2px 6px',
                                            color: 'var(--pur)',
                                            height: 'auto',
                                            border: '1px solid rgba(168, 85, 247, 0.3)',
                                          }}
                                        >
                                          🔗 Hubungkan
                                        </button>
                                      </div>
                                      {item.nomorPo && (
                                        <span
                                          className="badge"
                                          style={{
                                            fontSize: 8,
                                            padding: '2px 6px',
                                            fontWeight: 800,
                                            background: isOdooGrDone
                                              ? 'rgba(34, 197, 94, 0.15)'
                                              : 'rgba(239, 68, 68, 0.15)',
                                            color: isOdooGrDone ? '#22c55e' : '#f87171',
                                            border: isOdooGrDone
                                              ? '1px solid rgba(34, 197, 94, 0.3)'
                                              : '1px solid rgba(239, 68, 68, 0.3)',
                                          }}
                                        >
                                          {isOdooGrDone ? `✓ PO Odoo: ${item.nomorPo}` : `⚠️ PO Odoo: ${item.nomorPo}`}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>

                                {/* Stock Foundation */}
                                <td style={{ textAlign: 'center' }}>
                                  {item.isStocked ? (
                                    <span
                                      className="badge badge-grn"
                                      style={{
                                        padding: '3px 8px',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        background: 'rgba(34, 197, 94, 0.15)',
                                        color: '#22c55e',
                                      }}
                                    >
                                      📦 Masuk Stok
                                    </span>
                                  ) : (
                                    <span
                                      className="badge badge-pur"
                                      style={{
                                        padding: '3px 8px',
                                        fontSize: 10,
                                        fontWeight: 700,
                                        background: 'rgba(168, 85, 247, 0.15)',
                                        color: '#a855f7',
                                      }}
                                    >
                                      ⚡ Langsung Pakai
                                    </span>
                                  )}
                                </td>

                                {/* Quantity */}
                                <td style={{ textAlign: 'center', fontWeight: 800, fontSize: 12 }}>
                                  {item.qty}{' '}
                                  <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--tx3)' }}>
                                    {item.sparepart?.uom || 'Pcs'}
                                  </span>
                                </td>

                                {/* Price */}
                                <td>
                                  <div style={{ fontWeight: 700 }}>{fmtRupiah(item.harga)}</div>
                                  <div style={{ fontSize: 9, color: 'var(--tx3)', marginTop: 2 }}>
                                    Kat: {item.productCategory || 'Sparepart'} · Tipe:{' '}
                                    {(item.keterangan || '').replace(/<[^>]*>/g, '').trim() || 'consumable'}
                                  </div>
                                </td>

                                {/* GR Link Direct */}
                                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                  {effectiveGrLink ? (
                                    <a
                                      href={effectiveGrLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Buka Lembar GR Odoo di Tab Baru"
                                      className="btn btn-ghost btn-sm"
                                      style={{
                                        padding: '3px 8px',
                                        fontSize: 11,
                                        height: 'auto',
                                        borderRadius: 6,
                                        color: '#a855f7',
                                        background: 'rgba(168, 85, 247, 0.12)',
                                        border: '1px solid rgba(168, 85, 247, 0.3)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        textDecoration: 'none',
                                        fontWeight: 700,
                                      }}
                                    >
                                      📦 GR Odoo ↗
                                    </a>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => openEditModal(item)}
                                      title="Set / Edit Link GR Odoo"
                                      style={{
                                        padding: '2px 6px',
                                        fontSize: 10,
                                        height: 'auto',
                                        color: 'var(--tx3)',
                                        border: '1px dashed var(--br)',
                                        borderRadius: 4,
                                      }}
                                    >
                                      + Link GR
                                    </button>
                                  )}
                                </td>

                                {/* Actions */}
                                <td style={{ textAlign: 'right', paddingRight: 20 }} onClick={(e) => e.stopPropagation()}>
                                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => openEditModal(item)}
                                      style={{
                                        padding: '5px 8px',
                                        fontSize: 10,
                                        height: 'auto',
                                        border: '1px solid var(--br)',
                                        borderRadius: 6,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        cursor: 'pointer',
                                      }}
                                      title="Edit Detail SCM / PR / PO"
                                    >
                                      ✏️ Edit
                                    </button>

                                    {isItemReceived ? (
                                      <div style={{ textAlign: 'right' }}>
                                        <span
                                          className="badge badge-grn"
                                          style={{ padding: '4px 8px', fontSize: 10, fontWeight: 700 }}
                                        >
                                          ✓ Diterima {item.isStocked ? '(Gudang)' : '(Non-Stok)'}
                                        </span>
                                        {item.tanggalTerima && (
                                          <div style={{ fontSize: 8, color: 'var(--tx3)', marginTop: 2 }}>
                                            Tgl:{' '}
                                            {new Date(item.tanggalTerima).toLocaleDateString('id-ID', {
                                              day: '2-digit',
                                              month: '2-digit',
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    ) : item.statusPr === 'READY_ODOO' && item.sparepartId ? (
                                      <button
                                        type="button"
                                        className="btn btn-pur btn-sm"
                                        disabled={actionLoading !== null}
                                        onClick={() => openOdooProcessedModal(item)}
                                        style={{
                                          padding: '5px 10px',
                                          fontSize: 10,
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          background: 'linear-gradient(135deg, var(--pur) 0%, #4f46e5 100%)',
                                          color: '#fff',
                                          border: 'none',
                                          borderRadius: 6,
                                        }}
                                      >
                                        🚀 Selesai Odoo
                                      </button>
                                    ) : item.nomorPo ? (
                                      <button
                                        type="button"
                                        className="btn btn-grn btn-sm"
                                        disabled={actionLoading !== null}
                                        onClick={() => openReceiveModal(item)}
                                        style={{ padding: '5px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                                      >
                                        📥 Terima Barang
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>

                              {/* Chatter Log Row */}
                              {expandedRows[item.id] && (
                                <tr style={{ background: 'rgba(0,0,0,0.22)' }}>
                                  <td colSpan={8} style={{ padding: '16px 24px', borderBottom: '1px solid var(--br)' }}>
                                    <OdooChatterViewer odooNotes={item.odooNotes} />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};
