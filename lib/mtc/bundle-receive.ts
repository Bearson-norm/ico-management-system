export type BundlePartInput = {
  sparepartId: string;
  nama: string;
  qty: number;
  harga: number;
  uom?: string;
  lokasi?: string | null;
};

export type BundleMetadata = {
  type: 'bundle';
  parts: BundlePartInput[];
};

export type ReceiveMode = 'unit' | 'pack' | 'split';

/**
 * Parse `linkedPartsJson` into normalized bundle components when the row
 * uses the `{ type: 'bundle', parts }` shape or the legacy array shape.
 * Returns null for pack conversion metadata, empty arrays, or invalid JSON.
 */
export function parseBundleParts(
  linkedPartsJson: string | null | undefined
): BundlePartInput[] | null {
  if (!linkedPartsJson || typeof linkedPartsJson !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(linkedPartsJson);
  } catch {
    return null;
  }

  let rawList: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    (parsed as { type?: unknown }).type === 'bundle' &&
    Array.isArray((parsed as { parts?: unknown }).parts)
  ) {
    rawList = (parsed as { parts: unknown[] }).parts;
  }

  if (!rawList || rawList.length === 0) return null;

  const normalized: BundlePartInput[] = [];
  for (const entry of rawList) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const sparepartId = String(item.sparepartId ?? item.id ?? '').trim();
    if (!sparepartId) continue;

    const rawQty = Number(item.qty);
    const qty = Number.isFinite(rawQty) && rawQty >= 1 ? Math.round(rawQty) : 1;
    const rawHarga = Number(item.harga);
    const harga = Number.isFinite(rawHarga) && rawHarga >= 0 ? rawHarga : 0;
    const nama = String(item.nama ?? item.namaItem ?? '').trim() || sparepartId;

    normalized.push({
      sparepartId,
      nama,
      qty,
      harga,
      ...(item.uom !== undefined ? { uom: String(item.uom) } : {}),
      ...(item.lokasi !== undefined
        ? { lokasi: item.lokasi ? String(item.lokasi) : null }
        : {}),
    });
  }

  return normalized.length > 0 ? normalized : null;
}

/**
 * Serialize bundle components into the canonical `{ type: 'bundle', parts }`
 * JSON structure stored on `ProcurementTracking.linkedPartsJson`.
 */
export function serializeBundleParts(parts: BundlePartInput[]): string {
  const payload: BundleMetadata = {
    type: 'bundle',
    parts: parts.map((part) => ({
      sparepartId: String(part.sparepartId).trim(),
      nama: String(part.nama || '').trim() || String(part.sparepartId).trim(),
      qty: Math.max(1, Math.round(Number(part.qty) || 1)),
      harga: Math.max(0, Number(part.harga) || 0),
      ...(part.uom ? { uom: part.uom } : {}),
      ...(part.lokasi !== undefined ? { lokasi: part.lokasi } : {}),
    })),
  };
  return JSON.stringify(payload);
}

/**
 * Extract unique non-empty sparepart IDs from a serialized bundle payload.
 */
export function extractBundleSparepartIds(
  linkedPartsJson: string | null | undefined
): string[] {
  const parts = parseBundleParts(linkedPartsJson);
  if (!parts) return [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (part.sparepartId) seen.add(part.sparepartId);
  }
  return Array.from(seen);
}

/**
 * Validate incoming multi-item receipt rows: requires >= 2 items, distinct
 * non-empty sparepart IDs, integer qty >= 1, and non-negative unit prices.
 */
export function validateBundleParts(
  parts: unknown
): { valid: true; parts: BundlePartInput[] } | { valid: false; error: string } {
  if (!Array.isArray(parts) || parts.length < 2) {
    return {
      valid: false,
      error: 'Pecah item membutuhkan minimal 2 komponen sparepart yang berbeda.',
    };
  }

  const seenIds = new Set<string>();
  const normalized: BundlePartInput[] = [];

  for (let i = 0; i < parts.length; i++) {
    const raw = parts[i];
    if (!raw || typeof raw !== 'object') {
      return {
        valid: false,
        error: `Format komponen baris ke-${i + 1} tidak valid.`,
      };
    }

    const row = raw as Record<string, unknown>;
    const sparepartId = String(row.sparepartId ?? row.id ?? '').trim();
    if (!sparepartId) {
      return {
        valid: false,
        error: `Komponen baris ke-${i + 1} wajib memilih Master Sparepart.`,
      };
    }

    if (seenIds.has(sparepartId)) {
      return {
        valid: false,
        error: 'Master Sparepart tidak boleh dipilih ganda pada komponen yang berbeda.',
      };
    }
    seenIds.add(sparepartId);

    const rawQty = Number(row.qty);
    if (!Number.isFinite(rawQty) || rawQty < 1 || !Number.isInteger(rawQty)) {
      return {
        valid: false,
        error: `Qty komponen baris ke-${i + 1} harus berupa bilangan bulat minimal 1.`,
      };
    }

    const rawHarga = row.harga === undefined || row.harga === null ? 0 : Number(row.harga);
    if (!Number.isFinite(rawHarga) || rawHarga < 0) {
      return {
        valid: false,
        error: `Harga satuan komponen baris ke-${i + 1} tidak boleh bernilai negatif.`,
      };
    }

    const nama = String(row.nama ?? row.namaItem ?? '').trim() || sparepartId;
    normalized.push({
      sparepartId,
      nama,
      qty: rawQty,
      harga: rawHarga,
      ...(row.uom ? { uom: String(row.uom) } : {}),
      ...(row.lokasi !== undefined
        ? { lokasi: row.lokasi ? String(row.lokasi) : null }
        : {}),
    });
  }

  return { valid: true, parts: normalized };
}

/**
 * Compute PO baseline total, allocated split total, and signed difference.
 */
export function calculateBundleAllocation(
  poQty: number,
  poUnitPrice: number,
  parts: Array<{ qty: number; harga: number }>
): { poTotal: number; allocatedTotal: number; difference: number } {
  const safePoQty =
    Number.isFinite(Number(poQty)) && Number(poQty) > 0 ? Number(poQty) : 0;
  const safePoPrice =
    Number.isFinite(Number(poUnitPrice)) && Number(poUnitPrice) >= 0
      ? Number(poUnitPrice)
      : 0;
  const poTotal = Math.round(safePoQty * safePoPrice);

  const allocatedTotal = Math.round(
    parts.reduce((sum, part) => {
      const q = Number.isFinite(Number(part.qty)) && Number(part.qty) > 0 ? Number(part.qty) : 0;
      const h = Number.isFinite(Number(part.harga)) && Number(part.harga) >= 0 ? Number(part.harga) : 0;
      return sum + q * h;
    }, 0)
  );

  return {
    poTotal,
    allocatedTotal,
    difference: allocatedTotal - poTotal,
  };
}

/**
 * Divide the total PO amount evenly across component slots, then convert each
 * slot share into a rounded non-negative unit price based on component qty.
 */
export function allocateEvenlyByQty(
  poTotal: number,
  parts: Array<{ qty: number }>
): number[] {
  if (!Array.isArray(parts) || parts.length === 0) return [];
  const safeTotal =
    Number.isFinite(Number(poTotal)) && Number(poTotal) > 0 ? Number(poTotal) : 0;
  const perSlot = safeTotal / parts.length;

  return parts.map((part) => {
    const rawQty = Number(part.qty);
    const safeQty =
      Number.isFinite(rawQty) && rawQty > 0 ? Math.round(rawQty) : 1;
    return Math.max(0, Math.round(perSlot / safeQty));
  });
}

/**
 * Allocate the remaining unallocated PO value into the last component's unit
 * price, clamped at 0 so prior over-allocations never produce negative prices.
 */
export function allocateRemainingToLast(
  poTotal: number,
  parts: Array<{ qty: number; harga: number }>
): number {
  if (!Array.isArray(parts) || parts.length === 0) return 0;
  const safeTotal =
    Number.isFinite(Number(poTotal)) && Number(poTotal) > 0 ? Number(poTotal) : 0;

  const allocatedBeforeLast = parts.slice(0, -1).reduce((sum, part) => {
    const q = Number.isFinite(Number(part.qty)) && Number(part.qty) > 0 ? Number(part.qty) : 0;
    const h = Number.isFinite(Number(part.harga)) && Number(part.harga) >= 0 ? Number(part.harga) : 0;
    return sum + q * h;
  }, 0);

  const remaining = Math.max(0, safeTotal - allocatedBeforeLast);
  const lastQtyRaw = Number(parts[parts.length - 1].qty);
  const lastQty =
    Number.isFinite(lastQtyRaw) && lastQtyRaw > 0 ? Math.round(lastQtyRaw) : 1;

  return Math.max(0, Math.round(remaining / lastQty));
}

/**
 * Prevent Odoo sync from creating phantom partial PO siblings when a bundle
 * receipt has already been recorded and component qty differs from PO qty.
 */
export function shouldSkipPartialAutoSplitForBundle(
  linkedPartsJson: string | null | undefined,
  isItemPhysicallyReceived: boolean
): boolean {
  if (!isItemPhysicallyReceived) return false;
  const parts = parseBundleParts(linkedPartsJson);
  return Boolean(parts && parts.length > 0);
}

/**
 * Identify previously recorded sparepart IDs that are no longer present in
 * the incoming bundle parts list so stale movements can be cleaned up.
 */
export function getStaleBundleSparepartIds(
  existingSparepartIds: Array<string | null>,
  incomingParts: BundlePartInput[]
): string[] {
  const incomingSet = new Set(
    incomingParts.map((p) => String(p.sparepartId).trim()).filter(Boolean)
  );
  const stale = new Set<string>();
  for (const id of existingSparepartIds) {
    const cleanId = id ? String(id).trim() : '';
    if (cleanId && !incomingSet.has(cleanId)) {
      stale.add(cleanId);
    }
  }
  return Array.from(stale);
}

/**
 * Collect all unique sparepart IDs affected by a tracking row (both its
 * primary `sparepartId` and any components stored inside `linkedPartsJson`).
 */
export function collectAffectedBundleSparepartIds(
  primarySparepartId: string | null | undefined,
  linkedPartsJson: string | null | undefined
): string[] {
  const ids = new Set<string>();
  if (primarySparepartId && String(primarySparepartId).trim()) {
    ids.add(String(primarySparepartId).trim());
  }
  for (const partId of extractBundleSparepartIds(linkedPartsJson)) {
    ids.add(partId);
  }
  return Array.from(ids);
}
