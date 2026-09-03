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

/**
 * Ekstraksi nomor PO dari notifikasi Chatter Odoo
 * Contoh pesan:
 * "Order confirmation P14859 for your Request PR04785"
 * "The following requested items from Purchase Request PR04785 have now been confirmed in Purchase Order P14859:"
 */
export function extractPoFromChatter(odooNotes?: string | null): string | null {
  if (!odooNotes || !odooNotes.trim()) return null;
  const patterns = [
    /Order confirmation\s+(P\d+)/i,
    /confirmed in Purchase Order\s+(P\d+)/i,
    /Purchase Order\s+(P\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = odooNotes.match(pattern);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }
  return null;
}

/**
 * Mendapatkan nomor PO efektif:
 * Prioritas 1: item.nomorPo di database
 * Prioritas 2: Ekstraksi dari notifikasi konfirmasi PO di Odoo Chatter
 */
export function getEffectivePoNumber(item: TrackingItem): string | null {
  if (!item) return null;
  const directPo = (item.nomorPo || '').trim();
  if (directPo.length > 0) return directPo;
  return extractPoFromChatter(item.odooNotes);
}

/**
 * Cek apakah item sudah memiliki PO resmi atau konfirmasi PO dari chatter
 */
export function hasPoAssigned(item: TrackingItem): boolean {
  if (!item) return false;
  const effectivePo = getEffectivePoNumber(item);
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  return (
    (effectivePo !== null && effectivePo !== '') ||
    statusPr === 'PO' ||
    statusPr === 'RFQ' ||
    statusPo === 'PO' ||
    statusPo === 'RFQ'
  );
}

/**
 * LOGIC TERIMA (Penerimaan Fisik Barang di Gudang):
 * Murni mencatat bahwa barang fisik telah tiba dan diterima oleh tim gudang/pabrik.
 * Tidak sama dengan dokumen Good Received (GR) di Odoo.
 */
export function isPhysicallyReceived(item: TrackingItem): boolean {
  if (!item) return false;
  return !!item.tanggalTerima;
}

/**
 * LOGIC GR (Good Received Resmi dari Odoo):
 * Menandakan dokumen penerimaan barang resmi (good.received) di Odoo sudah ada atau disahkan.
 */
export function isOdooGrDone(item: TrackingItem): boolean {
  if (!item) return false;
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  const hasGrLink = !!(item.linkGr && item.linkGr.trim() !== '');
  return statusPo === 'DONE' || statusPr === 'RECEIVED' || hasGrLink;
}

/**
 * Kategori: DITERIMA SAJA (BELUM GR)
 * Barang fisik sudah sampai di gudang (tanggalTerima terisi),
 * TETAPI dokumen GR di Odoo belum dibuat/diterbitkan.
 */
export function isReceivedOnly(item: TrackingItem): boolean {
  if (!item) return false;
  return isPhysicallyReceived(item) && !isOdooGrDone(item);
}

/**
 * Kategori: CLOSED / SELESAI
 * Barang fisik sudah diterima DAN dokumen GR resmi dari Odoo sudah terbit/selesai.
 */
export function isClosedOrDone(item: TrackingItem): boolean {
  if (!item) return false;
  // Status CLOSED tercapai jika dokumen GR Odoo sudah selesai
  return isOdooGrDone(item);
}

export function isCancelled(item: TrackingItem): boolean {
  if (!item) return false;
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  return statusPr === 'CANCELLED' || statusPo === 'CANCELLED';
}

export function fmtRupiah(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function generateAutoAlias(fullName: string): string {
  const clean = fullName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.replace(/\b\w/g, (char) => char.toUpperCase());
}

export type SimplifiedStatus = 'DRAFT' | 'APPROVAL' | 'PO' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';

/**
 * Menentukan 5 Status Utama yang Rapi & Tegas:
 * 1. DRAFT: Persiapan PR / pengajuan awal
 * 2. APPROVAL: Disetujui Finance / proses penawaran harga (RFQ)
 * 3. PO: PO resmi sudah terbit di Odoo (atau ada notifikasi konfirmasi PO di chatter)
 * 4. RECEIVED: Barang fisik sudah diterima, tetapi dokumen GR Odoo belum terbit (Terima Saja)
 * 5. CLOSED: Barang fisik sudah diterima + dokumen GR Odoo sudah terbit (Closed / Selesai)
 * 6. CANCELLED: Dibatalkan
 */
export function getItemSimplifiedStatus(item: TrackingItem): SimplifiedStatus {
  if (!item) return 'DRAFT';
  if (isCancelled(item)) return 'CANCELLED';

  // 5. CLOSED: Sudah Diterima + Dokumen GR Odoo selesai
  if (isClosedOrDone(item)) return 'CLOSED';

  // 4. RECEIVED: Diterima Saja (Fisik sudah sampai, tapi belum ada GR di Odoo)
  if (isReceivedOnly(item)) return 'RECEIVED';

  // 3. PO: PO resmi sudah diterbitkan di Odoo atau dikonfirmasi di chatter
  if (hasPoAssigned(item)) return 'PO';

  // 2. APPROVAL: Sudah diapprove Finance & dalam proses Penawaran / RFQ
  const statusPr = (item.statusPr || '').toUpperCase();
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
    case 'RECEIVED':
    case 'TERIMA_SAJA':
      return { background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', label: '📦 4. DITERIMA (BELUM GR)' };
    case 'CLOSED':
    case 'DONE':
      return { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', label: '✓ 5. CLOSED (SELESAI)' };
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
    if (cardFilter === 'RECEIVED') return itemStatus === 'RECEIVED';
    if (cardFilter === 'CLOSED' || cardFilter === 'DONE') return itemStatus === 'CLOSED' || itemStatus === 'CANCELLED';
    return true;
  }

  // Standard Tab Filters
  if (activeTab === 'ALL') {
    // Tampilkan semua dokumen yang aktif (belum CLOSED / BATAL)
    return itemStatus !== 'CLOSED' && itemStatus !== 'CANCELLED';
  } else if (activeTab === 'DRAFT') {
    return itemStatus === 'DRAFT';
  } else if (activeTab === 'APPROVAL') {
    return itemStatus === 'APPROVAL';
  } else if (activeTab === 'PO') {
    return itemStatus === 'PO';
  } else if (activeTab === 'RECEIVED') {
    return itemStatus === 'RECEIVED';
  } else if (activeTab === 'CLOSED' || activeTab === 'DONE') {
    return itemStatus === 'CLOSED' || itemStatus === 'CANCELLED';
  }

  return true;
}
