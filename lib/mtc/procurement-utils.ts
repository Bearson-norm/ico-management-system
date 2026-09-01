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

export function isOdooGrDone(item: TrackingItem): boolean {
  if (!item) return false;
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  return statusPo === 'DONE' || statusPr === 'RECEIVED';
}

export function isPhysicallyReceived(item: TrackingItem): boolean {
  if (!item) return false;
  return !!item.tanggalTerima;
}

export function isClosedOrDone(item: TrackingItem): boolean {
  if (!item) return false;
  return isOdooGrDone(item);
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

export function getItemSimplifiedStatus(item: TrackingItem): 'DRAFT' | 'APPROVAL' | 'PO' | 'DONE' | 'CANCELLED' {
  if (!item) return 'DRAFT';
  if (isCancelled(item)) return 'CANCELLED';
  if (isClosedOrDone(item)) return 'DONE';

  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  
  // 3. PO: PO resmi sudah diterbitkan di Odoo
  const hasPo = !!(item.nomorPo && item.nomorPo.trim() !== '') || statusPo === 'PO' || statusPr === 'PO';
  if (hasPo) return 'PO';

  // 2. APPROVAL: Sudah diapprove Finance & dalam proses Penawaran / RFQ
  const isApprovalOrRfq =
    statusPr === 'APPROVED' ||
    statusPr === 'PA_APPROVED' ||
    statusPr === 'RFQ' ||
    statusPr === 'APPROVAL' ||
    statusPr === 'OPEN' ||
    statusPr === 'IN_PROGRESS';

  if (isApprovalOrRfq) return 'APPROVAL';

  // 1. DRAFT: Tahap awal PR (Draf / persiapan pengajuan)
  return 'DRAFT';
}

export function getStatusBadgeStyles(status: string) {
  const norm = (status || '').toUpperCase();
  switch (norm) {
    case 'DRAFT':
      return { background: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db', label: '1. DRAFT PR' };
    case 'APPROVAL':
    case 'TO_APPROVE':
    case 'APPROVED':
    case 'RFQ':
      return { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', label: '2. APPROVAL & PENAWARAN' };
    case 'PO':
      return { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', label: '3. PO TERBIT' };
    case 'DONE':
    case 'RECEIVED':
      return { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', label: '✓ SELESAI' };
    case 'CANCELLED':
      return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', label: '✕ BATAL' };
    default:
      return { background: '#f3f4f6', color: '#4b5563', border: '1px solid #d1d5db', label: norm };
  }
}

export function filterItemByTab(
  item: TrackingItem,
  activeTab: TabType,
  cardFilter: CardFilterType
): boolean {
  const itemStatus = getItemSimplifiedStatus(item);

  // Card filter takes precedence
  if (cardFilter) {
    if (cardFilter === 'DRAFT') return itemStatus === 'DRAFT';
    if (cardFilter === 'APPROVAL') return itemStatus === 'APPROVAL';
    if (cardFilter === 'PO') return itemStatus === 'PO';
    if (cardFilter === 'DONE') return itemStatus === 'DONE' || itemStatus === 'CANCELLED';
    return true;
  }

  // Standard Tab Filters
  if (activeTab === 'ALL') {
    // Tampilkan semua dokumen yang aktif (belum selesai/batal)
    return itemStatus !== 'DONE' && itemStatus !== 'CANCELLED';
  } else if (activeTab === 'DRAFT') {
    return itemStatus === 'DRAFT';
  } else if (activeTab === 'APPROVAL') {
    return itemStatus === 'APPROVAL';
  } else if (activeTab === 'PO') {
    return itemStatus === 'PO';
  } else if (activeTab === 'DONE') {
    return itemStatus === 'DONE' || itemStatus === 'CANCELLED';
  }

  return true;
}
