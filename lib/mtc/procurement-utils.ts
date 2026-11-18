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

function isPrePoOrRfqState(item: { statusPr?: string | null; statusPo?: string | null }): boolean {
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  if (statusPo === 'RFQ' || statusPo === 'TO_APPROVE') {
    return true;
  }
  if (statusPo === 'PO' || statusPo === 'DONE') {
    return false;
  }
  return (
    statusPr === 'RFQ' ||
    statusPr === 'TO_APPROVE' ||
    statusPr === 'DRAFT' ||
    statusPr === 'WAITING_PRICE' ||
    statusPr === 'READY_ODOO' ||
    statusPr === 'CONTINUE'
  );
}

export function getEffectivePoNumber(item: TrackingItem): string | null {
  if (!item || isPrePoOrRfqState(item)) return null;
  const directPo = (item.nomorPo || '').trim();
  return directPo.length > 0 ? directPo : null;
}

/**
 * Cek apakah item sudah memiliki PO resmi (status purchase/done di Odoo)
 * Catatan: Dokumen RFQ (state 'draft'/'sent'/'to approve') belum dihitung sebagai PO Terbit.
 */
export function hasPoAssigned(item: TrackingItem): boolean {
  if (!item || isPrePoOrRfqState(item)) return false;
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  const effectivePo = getEffectivePoNumber(item);
  return (
    (effectivePo !== null && effectivePo !== '') ||
    statusPr === 'PO' ||
    statusPo === 'PO'
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
 * Menandakan dokumen penerimaan barang resmi di Odoo sudah DONE / disahkan.
 * PERHATIAN: Tautan (linkGr) yang ada BUKAN penanda GR sudah selesai,
 * karena dokumen di Odoo bisa saja masih berstatus DRAFT.
 */
export function isOdooGrDone(item: TrackingItem): boolean {
  if (!item) return false;
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  return statusPo === 'DONE' || statusPr === 'RECEIVED';
}

/**
 * Kategori: DITERIMA SAJA (BELUM GR)
 * Barang fisik sudah sampai di gudang (tanggalTerima terisi),
 * TETAPI dokumen GR di Odoo belum selesai/valid (masih Draft atau belum ada).
 */
export function isReceivedOnly(item: TrackingItem): boolean {
  if (!item) return false;
  return isPhysicallyReceived(item) && !isOdooGrDone(item);
}

/**
 * Kategori: CLOSED / SELESAI
 * Dokumen GR resmi dari Odoo sudah terbit/selesai (statusPo === 'DONE' atau statusPr === 'RECEIVED').
 */
export function isClosedOrDone(item: TrackingItem): boolean {
  if (!item) return false;
  return isOdooGrDone(item);
}

export function isCancelled(item: TrackingItem): boolean {
  if (!item) return false;
  const statusPr = (item.statusPr || '').toUpperCase();
  const statusPo = (item.statusPo || '').toUpperCase();
  return statusPr === 'CANCELLED' || statusPr === 'REJECTED' || statusPo === 'CANCELLED';
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

  // 2. APPROVAL: Sudah diapprove Finance & dalam proses Penawaran / RFQ / Menunggu Approval
  const statusPr = (item.statusPr || '').toUpperCase();
  const isApprovalOrRfq =
    statusPr === 'TO_APPROVE' ||
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

export type PackMetadata = {
  type?: string;
  isPackMode?: boolean;
  qtyPerPack?: number;
  uomPack?: string;
  uomUnit?: string;
  originalPackQty?: number;
  originalPackPrice?: number;
  isConvertedToUnits?: boolean;
  splitFromId?: number;
  manuallyArchived?: boolean;
  manuallyArchivedAt?: string;
  manuallyArchivedReason?: string;
  prevStatusPr?: string;
  prevStatusPo?: string | null;
};

/** Parse pack/split metadata from linkedPartsJson safely. */
export function parsePackMetadata(linkedPartsJson: string | null | undefined): PackMetadata | null {
  if (!linkedPartsJson) return null;
  try {
    const parsed = JSON.parse(linkedPartsJson);
    return parsed && typeof parsed === 'object' ? (parsed as PackMetadata) : null;
  } catch {
    return null;
  }
}

/** True when local qty & price have already been converted from packs to physical units. */
export function isPackConvertedToUnits(linkedPartsJson: string | null | undefined): boolean {
  const parsed = parsePackMetadata(linkedPartsJson);
  return Boolean(parsed && (parsed.isConvertedToUnits || parsed.originalPackQty !== undefined));
}

/** Multiplier to convert local TrackingItem.qty into physical units (1 if already converted). */
export function getLocalPackMultiplier(linkedPartsJson: string | null | undefined): number {
  const parsed = parsePackMetadata(linkedPartsJson);
  if (!parsed) return 1;
  if (parsed.isConvertedToUnits || parsed.originalPackQty !== undefined) {
    return 1;
  }
  if ((parsed.type === 'pack' || parsed.isPackMode) && Number(parsed.qtyPerPack) > 0) {
    return Number(parsed.qtyPerPack);
  }
  return 1;
}

/** Multiplier to convert Odoo PO/PR line quantities into physical units. */
export function getOdooPackMultiplier(linkedPartsJson: string | null | undefined): number {
  const parsed = parsePackMetadata(linkedPartsJson);
  if (!parsed) return 1;
  if ((parsed.type === 'pack' || parsed.isPackMode) && Number(parsed.qtyPerPack) > 0) {
    return Number(parsed.qtyPerPack);
  }
  return 1;
}

export type SparepartProcurementInput = {
  qty: number;
  nomorPr?: string | null;
  nomorPo?: string | null;
  statusPr?: string | null;
  statusPo?: string | null;
  tanggalTerima?: Date | string | null;
  linkedPartsJson?: string | null;
};

export type SparepartProcurementSummary = {
  purchasingStatus: 'NONE' | 'PR' | 'PO';
  purchasingQty: number;
  purchasingNoPr: string | null;
  purchasingNoPo: string | null;
};

/** Summarize pending procurement items into Master Sparepart's 3-state status ('NONE' | 'PR' | 'PO'). */
export function deriveSparepartProcurementSummary(
  pendingItems: SparepartProcurementInput[]
): SparepartProcurementSummary {
  const activeItems = (pendingItems || []).filter((p) => {
    if (p.tanggalTerima) return false;
    const spPo = (p.statusPo || '').toUpperCase();
    const spPr = (p.statusPr || '').toUpperCase();
    if (spPo === 'DONE' || spPo === 'CANCELLED') return false;
    if (spPr === 'CANCELLED' || spPr === 'REJECTED' || spPr === 'RECEIVED') return false;
    return true;
  });

  const purchasingQty = activeItems.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * getLocalPackMultiplier(item.linkedPartsJson),
    0
  );

  if (purchasingQty <= 0) {
    return {
      purchasingStatus: 'NONE',
      purchasingQty: 0,
      purchasingNoPr: null,
      purchasingNoPo: null,
    };
  }

  const confirmedPoItem = activeItems.find(
    (item) => Boolean(item.nomorPo?.trim()) && !isPrePoOrRfqState(item)
  );
  const firstPrItem = activeItems.find((item) => Boolean(item.nomorPr?.trim()));

  return {
    purchasingStatus: confirmedPoItem ? 'PO' : 'PR',
    purchasingQty,
    purchasingNoPr: firstPrItem?.nomorPr?.trim() || null,
    purchasingNoPo: confirmedPoItem?.nomorPo?.trim() || null,
  };
}

/** Match search query against PR, PO, TE, vendor, sparepart name/alias/id, and item name. */
export function matchesProcurementSearch(item: TrackingItem, query: string): boolean {
  const q = (query || '').toLowerCase().trim();
  if (!q) return true;
  const qNorm = q.replace(/^pro/, 'pr0').replace(/o/g, '0');
  const fields = [
    item.originalName,
    item.nomorPr,
    item.nomorPo,
    item.nomorTe,
    item.vendor,
    item.sparepart?.nama,
    item.sparepart?.namaAlias,
    item.sparepart?.id,
  ];
  return fields.some((val) => {
    if (!val) return false;
    const lower = val.toLowerCase();
    return lower.includes(q) || lower.includes(qNorm);
  });
}

/** True when an item has an active, confirmed PO number that is not yet closed or cancelled. */
export function isOngoingConfirmedPo(item: TrackingItem): boolean {
  if (!item || !item.nomorPo?.trim()) return false;
  if (isClosedOrDone(item) || isCancelled(item)) return false;
  return hasPoAssigned(item);
}

/** Compute physical unit multiplier and receive quantity for ReceiveModal without double-multiplying. */
export function computeReceivePackQty(
  itemQty: number,
  isPackMode: boolean,
  qtyPerPack: number,
  isAlreadyInUnits: boolean
): { multiplier: number; totalPhysicalUnits: number; nextReceiveQty: number } {
  const safeQty = Math.max(0, Number(itemQty) || 0);
  const safePack = Math.max(1, Number(qtyPerPack) || 1);
  const multiplier = isPackMode && !isAlreadyInUnits && safePack > 1 ? safePack : 1;
  const totalPhysicalUnits = safeQty * multiplier;
  return {
    multiplier,
    totalPhysicalUnits,
    nextReceiveQty: totalPhysicalUnits,
  };
}

/** True when a tracking item was manually archived from web UI to hide abandoned/stale items from active lists and sync. */
export function isManuallyArchived(
  input: string | null | undefined | { linkedPartsJson?: string | null }
): boolean {
  const raw = typeof input === 'string' || input == null ? input : input.linkedPartsJson;
  const parsed = parsePackMetadata(raw);
  return Boolean(parsed && parsed.manuallyArchived === true);
}

/** Serialize linkedPartsJson with manual-archive marker while preserving existing pack/split fields. */
export function buildManuallyArchivedJson(
  existingJson: string | null | undefined,
  prevStatus: { statusPr?: string | null; statusPo?: string | null },
  reason?: string | null,
  nowIso?: string
): string {
  const base = parsePackMetadata(existingJson) || {};
  return JSON.stringify({
    ...base,
    manuallyArchived: true,
    manuallyArchivedAt: nowIso || new Date().toISOString(),
    prevStatusPr: prevStatus.statusPr || 'DRAFT',
    prevStatusPo: prevStatus.statusPo ?? null,
    ...(reason?.trim() ? { manuallyArchivedReason: reason.trim() } : {}),
  });
}

/** Strip manual-archive markers from linkedPartsJson while preserving pack/split metadata. */
export function buildRestoredFromArchiveJson(existingJson: string | null | undefined): string | null {
  const parsed = parsePackMetadata(existingJson);
  if (!parsed) return null;
  const {
    manuallyArchived: _ma,
    manuallyArchivedAt: _mat,
    manuallyArchivedReason: _mar,
    prevStatusPr: _psp,
    prevStatusPo: _pso,
    ...rest
  } = parsed;
  if (Object.keys(rest).length === 0) return null;
  return JSON.stringify(rest);
}

/** Whole elapsed days since item's PR/request date (tanggalList or createdAt). */
export function getItemAgeDays(
  item: { tanggalList?: Date | string | null; createdAt?: Date | string | null },
  now: Date = new Date()
): number {
  const raw = item?.tanggalList || item?.createdAt;
  if (!raw) return 0;
  const dt = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(dt.getTime())) return 0;
  const diffMs = now.getTime() - dt.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** True when an item is still pending (DRAFT/APPROVAL/PO, not physically received/closed/cancelled) and meets stale age threshold. */
export function isStalePendingItem(
  item: TrackingItem,
  staleDays = 60,
  now: Date = new Date()
): boolean {
  if (!item || item.tanggalTerima) return false;
  const simplified = getItemSimplifiedStatus(item);
  if (simplified !== 'DRAFT' && simplified !== 'APPROVAL' && simplified !== 'PO') {
    return false;
  }
  const threshold = Math.max(1, Number(staleDays) || 60);
  return getItemAgeDays(item, now) >= threshold;
}

/** True when a document creation/list date precedes an optional YYYY-MM-DD sync cutoff date. */
export function isBeforeSyncCutoff(
  docDate: Date | string | null | undefined,
  minDateStr: string | null | undefined
): boolean {
  const cleanCutoff = (minDateStr || '').trim();
  if (!cleanCutoff || !docDate) return false;
  const parsedDoc = docDate instanceof Date ? docDate : new Date(docDate);
  const normalizedCutoff = /^\d{4}-\d{2}-\d{2}$/.test(cleanCutoff)
    ? new Date(`${cleanCutoff}T00:00:00.000Z`)
    : new Date(cleanCutoff);
  if (isNaN(parsedDoc.getTime()) || isNaN(normalizedCutoff.getTime())) return false;
  return parsedDoc.getTime() < normalizedCutoff.getTime();
}
