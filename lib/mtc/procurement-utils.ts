import { TrackingItem, TabType, CardFilterType } from '@/types/mtc/procurement';

export function parseOdooLinks(item: any) {
  let prUrl: string | null = null;
  let poUrl: string | null = null;
  let grUrl: string | null = item?.linkGr || null;

  if (item?.linkReferences) {
    const raw = item.linkReferences.trim();
    if (raw.startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        prUrl = parsed.pr || null;
        poUrl = parsed.po || null;
        if (!grUrl && parsed.gr) grUrl = parsed.gr;
      } catch (e) {}
    } else if (raw.includes('model=good.received')) {
      if (!grUrl) grUrl = raw;
    } else if (raw.includes('model=purchase.order')) {
      poUrl = raw;
    } else if (raw.includes('model=purchase.request') || raw.includes('model=purchase.requisition')) {
      prUrl = raw;
    }
  }

  return { prUrl, poUrl, grUrl };
}

export function isClosedOrDone(item: TrackingItem): boolean {
  if (!item) return false;
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  return !!item.tanggalTerima || statusPo === 'DONE' || statusPr === 'RECEIVED';
}

export function isCancelled(item: TrackingItem): boolean {
  if (!item) return false;
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  return statusPr === 'CANCELLED' || statusPo === 'CANCELLED';
}

export function hasPoAssigned(item: TrackingItem): boolean {
  if (!item) return false;
  const poNo = (item.nomorPo || '').trim();
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  return poNo.length > 0 || statusPr === 'PO' || statusPr === 'RFQ' || statusPo === 'PO' || statusPo === 'RFQ';
}

export function fmtRupiah(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export function generateAutoAlias(fullName: string): string {
  const clean = fullName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.replace(/\b\w/g, char => char.toUpperCase());
}

export function getStatusBadgeStyles(status: string) {
  switch ((status || '').toUpperCase()) {
    case 'DRAFT':
      return { background: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db' };
    case 'TO_APPROVE':
      return { background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d' };
    case 'APPROVED':
      return { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' };
    case 'RFQ':
      return { background: '#f9f5f7', color: '#875A7B', border: '1px solid #e9d5df' };
    case 'PO':
      return { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' };
    case 'CANCELLED':
      return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' };
    default:
      return { background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' };
  }
}

export function filterItemByTab(
  item: TrackingItem,
  activeTab: TabType,
  cardFilter: CardFilterType
): boolean {
  const isDone = isClosedOrDone(item);
  const isCanc = isCancelled(item);
  const hasPo = hasPoAssigned(item);
  const spStatus = (item.statusPr || 'DRAFT').toUpperCase();

  // Card filter takes precedence
  if (cardFilter) {
    if (cardFilter === 'WAITING_PRICE') {
      const isNoPrice = item.harga == null || Number(item.harga) === 0;
      if (isDone || isCanc || !isNoPrice) return false;
    } else if (cardFilter === 'PR_PENDING') {
      if (isDone || isCanc || !item.nomorPr || item.nomorPo) return false;
    } else if (cardFilter === 'PO_RECEIVED') {
      if (!item.nomorPo || !isDone) return false;
    } else if (cardFilter === 'PO_PENDING_GR') {
      if (isDone || isCanc || !item.nomorPo) return false;
    }
    return true;
  }

  // Standard Tab Filters
  if (activeTab === 'ACTIVE') {
    // ACTIVE excludes Closed and Cancelled
    if (isDone || isCanc) return false;
  } else if (activeTab === 'DRAFT_PR') {
    const isDraft =
      (!spStatus || spStatus === 'DRAFT' || spStatus === 'WAITING_PRICE' || spStatus === 'CONTINUE') &&
      (!item.nomorPr || item.nomorPr.trim() === '');
    if (isDone || isCanc || !isDraft) return false;
  } else if (activeTab === 'READY_ODOO') {
    if (isDone || isCanc || spStatus !== 'READY_ODOO' || hasPo) return false;
  } else if (activeTab === 'TO_APPROVE') {
    if (isDone || isCanc || spStatus !== 'TO_APPROVE' || hasPo) return false;
  } else if (activeTab === 'APPROVED') {
    // APPROVED tab MUST exclude items that already have PO created or are closed/cancelled!
    if (isDone || isCanc || spStatus !== 'APPROVED' || hasPo) return false;
  } else if (activeTab === 'PO_RFQ') {
    // PO_RFQ tab MUST show active items with PO created
    if (isDone || isCanc || !hasPo) return false;
  } else if (activeTab === 'RECEIVED') {
    // RECEIVED tab shows items that are Closed or Cancelled
    if (!isDone && !isCanc) return false;
  }

  return true;
}
