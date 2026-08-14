import React from 'react';
import { TrackingItem, TabType, CardFilterType } from '@/types/mtc/procurement';

type SearchAndFiltersProps = {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  urgencyFilter: string;
  setUrgencyFilter: (val: string) => void;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  vendorFilter: string;
  setVendorFilter: (val: string) => void;
  monthFilter: string;
  setMonthFilter: (val: string) => void;
  yearFilter: string;
  setYearFilter: (val: string) => void;
  categoriesList: string[];
  uniqueVendors: string[];
  yearsList: string[];
  monthsList: { value: string; label: string }[];
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  setCardFilter: (val: CardFilterType) => void;
  scopedItems: TrackingItem[];
  checkMonthYear: (item: TrackingItem, isReceived: boolean) => boolean;
};

export const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({
  searchQuery,
  setSearchQuery,
  urgencyFilter,
  setUrgencyFilter,
  categoryFilter,
  setCategoryFilter,
  vendorFilter,
  setVendorFilter,
  monthFilter,
  setMonthFilter,
  yearFilter,
  setYearFilter,
  categoriesList,
  uniqueVendors,
  yearsList,
  monthsList,
  activeTab,
  setActiveTab,
  setCardFilter,
  scopedItems,
  checkMonthYear,
}) => {
  const isReceivedItem = (i: TrackingItem) =>
    !!i.tanggalTerima || i.statusPo === 'DONE' || i.statusPr === 'RECEIVED';
  const isCancelledItem = (i: TrackingItem) =>
    i.statusPr === 'CANCELLED' || i.statusPo === 'CANCELLED';

  const counts = {
    ACTIVE: scopedItems.filter((i) => !isReceivedItem(i) && !isCancelledItem(i) && checkMonthYear(i, false)).length,
    DRAFT_PR: scopedItems.filter(
      (i) =>
        !isReceivedItem(i) &&
        !isCancelledItem(i) &&
        checkMonthYear(i, false) &&
        (!i.statusPr || i.statusPr === 'DRAFT' || i.statusPr === 'WAITING_PRICE' || i.statusPr === 'CONTINUE') &&
        (!i.nomorPr || i.nomorPr.trim() === '') &&
        (!i.nomorPo || i.nomorPo.trim() === '')
    ).length,
    READY_ODOO: scopedItems.filter(
      (i) => !isReceivedItem(i) && !isCancelledItem(i) && checkMonthYear(i, false) && i.statusPr === 'READY_ODOO' && !i.nomorPo
    ).length,
    TO_APPROVE: scopedItems.filter(
      (i) => !isReceivedItem(i) && !isCancelledItem(i) && checkMonthYear(i, false) && i.statusPr === 'TO_APPROVE' && !i.nomorPo
    ).length,
    APPROVED: scopedItems.filter(
      (i) =>
        !isReceivedItem(i) &&
        !isCancelledItem(i) &&
        checkMonthYear(i, false) &&
        i.statusPr === 'APPROVED' &&
        (!i.nomorPo || i.nomorPo.trim() === '') &&
        i.statusPo !== 'PO' &&
        i.statusPo !== 'RFQ'
    ).length,
    PO_RFQ: scopedItems.filter(
      (i) =>
        !isReceivedItem(i) &&
        !isCancelledItem(i) &&
        checkMonthYear(i, false) &&
        (i.statusPr === 'PO' || i.statusPr === 'RFQ' || i.statusPo === 'PO' || i.statusPo === 'RFQ' || (i.nomorPo && i.nomorPo.trim() !== ''))
    ).length,
    RECEIVED: scopedItems.filter((i) => (isReceivedItem(i) || isCancelledItem(i)) && (checkMonthYear(i, true) || checkMonthYear(i, false))).length,
    ALL: scopedItems.filter((i) => (isReceivedItem(i) ? checkMonthYear(i, true) : checkMonthYear(i, false))).length,
  };

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'ACTIVE', label: '⏳ Semua Aktif', count: counts.ACTIVE },
    { id: 'DRAFT_PR', label: '⚙️ Draft PR', count: counts.DRAFT_PR },
    { id: 'READY_ODOO', label: '🚀 Siap Odoo', count: counts.READY_ODOO },
    { id: 'TO_APPROVE', label: '⏳ Tunggu Approve', count: counts.TO_APPROVE },
    { id: 'APPROVED', label: '✓ Disetujui', count: counts.APPROVED },
    { id: 'PO_RFQ', label: '🚢 Dalam Proses PO', count: counts.PO_RFQ },
    { id: 'RECEIVED', label: '📦 Closed / Finished', count: counts.RECEIVED },
    { id: 'ALL', label: '🌐 Semua Dokumen', count: counts.ALL },
  ];

  return (
    <div className="card" style={{ marginBottom: 20, padding: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 1.2fr 1fr 1fr', gap: 16, alignItems: 'center' }}>
        <div className="search-bar" style={{ width: '100%', marginBottom: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Cari PR, PO, nama barang sheets, atau nama suku cadang Odoo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <select
            className="form-input form-select"
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            style={{ height: '40px' }}
          >
            <option value="">— Urgensi (Semua) —</option>
            <option value="Urgent">🚨 Urgent / Mendesak</option>
            <option value="Normal">🟢 Normal</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <select
            className="form-input form-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ height: '40px' }}
          >
            <option value="">— Kategori (Semua) —</option>
            {categoriesList.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <select
            className="form-input form-select"
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            style={{ height: '40px' }}
          >
            <option value="">— Vendor (Semua) —</option>
            {uniqueVendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <select
            className="form-input form-select"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            style={{ height: '40px' }}
          >
            <option value="">— Bulan (Semua) —</option>
            {monthsList.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <select
            className="form-input form-select"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            style={{ height: '40px' }}
          >
            <option value="">— Tahun (Semua) —</option>
            {yearsList.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Tab Switcher */}
        <div
          style={{
            gridColumn: 'span 6',
            display: 'flex',
            background: 'var(--sf2)',
            padding: 3,
            borderRadius: 8,
            height: '36px',
            border: '1px solid var(--br)',
            overflowX: 'auto',
            gap: 4,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="ntab"
              onClick={() => {
                setActiveTab(tab.id);
                setCardFilter(null);
              }}
              style={{
                flex: '1 0 auto',
                border: 'none',
                padding: '0 12px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 800,
                cursor: 'pointer',
                background: activeTab === tab.id ? 'var(--sf3)' : 'transparent',
                color: activeTab === tab.id ? 'var(--pur)' : 'var(--tx3)',
                boxShadow: activeTab === tab.id ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
