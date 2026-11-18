import {
  getLocalPackMultiplier,
  getOdooPackMultiplier,
  parsePackMetadata,
} from './procurement-utils';

const GENERIC_NAMES = [
  'EQUIPMENT', 'SPAREPARTS USAGE', 'SUPPLIES', 'FACTORY SUPPLIES', 'Barang GA', 'Produk Tanpa Nama',
  'REPAIR AND MAINTENANCE', 'REPAIR & MAINTENANCE', 'MEDIA PLACEMENT', 'SPONSORSHIP', 'MARKETING SUPPLIES',
  'OVERHEADS', 'OVERHEAD', 'OVERHEAD EXPENSE', 'OVERHEAD EXPENSES', 'UTILITY', 'UTILITIES',
  'DIRECT EXPENSE', 'DIRECT EXPENSES', 'INDIRECT EXPENSE', 'INDIRECT EXPENSES', 'GENERAL EXPENSE', 'GENERAL EXPENSES',
  'CONSUMABLES', 'CONSUMABLE', 'LAB CONSUMABLE', 'LAB CONSUMABLES', 'LABORATORY CONSUMABLE', 'LABORATORY CONSUMABLES',
  'LAB SUPPLIES', 'LABORATORY SUPPLIES', 'SAFETY SUPPLIES', 'SAFETY EQUIPMENT', 'OTHER EXPENSES', 'OTHER EXPENSE',
  'SERVICES', 'SERVICE', 'HARDWARE', 'TOOLS', 'TOOL',
];

const ACCOUNT_NAME_PATTERNS = [
  /^SUPPLIES\s+FACTORY\s+RELATED$/i,
  /^REPAIR\s+AND\s+MAINTENANCE/i,
  /^OFFICE\s+SUPPLIES$/i,
  /^FACTORY\s+SUPPLIES$/i,
  /^GENERAL\s+SUPPLIES$/i,
  /^MAINTENANCE\s+SUPPLIES$/i,
  /^CLEANING\s+SUPPLIES$/i,
  /^LAB(ORATORY)?\s+CONSUMABLES?$/i,
  /^LAB(ORATORY)?\s+SUPPLIES$/i,
  /^SAFETY\s+(SUPPLIES|EQUIPMENT)$/i,
  /^Barang\s+GA$/i,
  /^MEDIA\s+PLACEMENT$/i,
  /^SPONSORSHIP$/i,
  /^OVERHEADS?$/i,
  /^OVERHEAD\s+EXPENSES?$/i,
  /^UTILIT(Y|IES)$/i,
];

const NON_MTC_KEYWORDS = [
  'lollipop', 'lolipop', 'neon box', 'vapestore', 'vape store', 'wus vape', 'montir vape',
  'media placement', 'sponsorship', 'marketing supplies', 'promo', 'billboard', 'booth',
  'event', 'influencer', 'endorse', 'branding', 'flyer', 'brosur', 'banner',
];

const MATCH_STOP_WORDS = new Set([
  'per', 'isi', 'sak', 'untuk', 'kg', 'pcs', 'dan', 'atau', 'dengan',
  'filter', 'air', 'gedung', 'sumur', 'kotor', 'pam', 'repeat', 'order', 'kebutuhan',
]);

/** True if name is a generic accounting/placeholder label rather than a concrete part name. */
export function isGenericName(name: string | null | undefined): boolean {
  if (!name || !name.trim()) return false;
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  if (GENERIC_NAMES.some((g) => lower === g.toLowerCase())) {
    return true;
  }
  for (const pattern of ACCOUNT_NAME_PATTERNS) {
    if (pattern.test(trimmed)) {
      const hasNumbers = /\d/.test(trimmed);
      if (!hasNumbers) return true;
    }
  }

  const genericWords = [
    'consumable', 'consumables', 'supplies', 'overhead', 'overheads',
    'utility', 'utilities', 'repair and maintenance', 'repair & maintenance',
    'equipment', 'general expense', 'direct expense', 'indirect expense',
  ];
  if (genericWords.some((w) => lower.includes(w))) {
    const hasSpecificSpecs =
      /\d/.test(trimmed) ||
      /uph|liter|kg|mm|cm|pack|pcs|set|unit|box|cartridge|bottle|jerigen/i.test(trimmed);
    if (!hasSpecificSpecs) {
      return true;
    }
  }

  return false;
}

/** True if item text indicates non-maintenance marketing/retail spend. */
export function isNonMtcItem(name: string | null | undefined, keterangan: string | null | undefined): boolean {
  const combined = `${name || ''} ${keterangan || ''}`.toLowerCase();
  return NON_MTC_KEYWORDS.some((k) => combined.includes(k));
}

/** Pick the most specific item description from an Odoo PR/TE/PO line. */
export function getBestOdooLineName(line: any): string {
  const variant = (line.product_description_variants || '')?.trim();
  const lineName = (line.name || '')?.trim();
  const productLabel = (Array.isArray(line.product_id) ? line.product_id[1] : '')?.trim();

  if (variant && !isGenericName(variant)) {
    return variant;
  }
  if (lineName && !isGenericName(lineName) && isGenericName(productLabel)) {
    return lineName;
  }
  if (productLabel && !isGenericName(productLabel)) {
    return productLabel;
  }
  if (lineName && !isGenericName(lineName)) {
    return lineName;
  }

  return variant || lineName || productLabel || 'Produk Tanpa Nama';
}

function getMatchTokens(str: unknown): string[] {
  if (!str || typeof str !== 'string') return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !MATCH_STOP_WORDS.has(w));
}

/** Score similarity between a local tracking item and an Odoo line. */
export function computeLineMatchScore(line: any, item: any, totalLines: number, totalItems: number): number {
  if (!line || !item) return 0;

  const odooItemName = typeof item.sparepart?.nama === 'string' ? item.sparepart.nama.toLowerCase().trim() : '';
  const originalName = typeof item.originalName === 'string' ? item.originalName.toLowerCase().trim() : '';
  const targetQty = Number(item.qty) || 0;

  const rawProdName = Array.isArray(line.product_id) ? line.product_id[1] : '';
  const prodName = typeof rawProdName === 'string' ? rawProdName.toLowerCase().trim() : '';
  const lineName = typeof line.name === 'string' ? line.name.toLowerCase().trim() : '';
  const variantName =
    typeof line.product_description_variants === 'string'
      ? line.product_description_variants.toLowerCase().trim()
      : '';
  const lineQty = Number(line.product_qty) || 0;

  const originalDigits = originalName.match(/\b\d+\b/g) || [];
  let score = 0;

  if (originalName && (originalName === prodName || originalName === lineName || (variantName && originalName === variantName))) {
    score += 100;
  }
  if (odooItemName && (odooItemName === prodName || odooItemName === lineName || (variantName && odooItemName === variantName))) {
    score += 80;
  }

  if (prodName && prodName.length > 3) {
    if (originalName.includes(prodName) || prodName.includes(originalName)) score += 25;
    if (odooItemName && (odooItemName.includes(prodName) || prodName.includes(odooItemName))) score += 20;
  }

  if (lineName && lineName.length > 3) {
    if (originalName.includes(lineName) || lineName.includes(originalName)) score += 25;
    if (odooItemName && (odooItemName.includes(lineName) || lineName.includes(odooItemName))) score += 20;
  }

  if (variantName && variantName.length > 3) {
    if (originalName.includes(variantName) || variantName.includes(originalName)) score += 25;
    if (odooItemName && (odooItemName.includes(variantName) || variantName.includes(odooItemName))) score += 20;
  }

  const origTokens = getMatchTokens(originalName);
  const itemTokens = getMatchTokens(odooItemName);
  const lineTokens = getMatchTokens(lineName);
  const prodTokens = getMatchTokens(prodName);

  let maxCommonWords = 0;
  for (const targetTokens of [origTokens, itemTokens]) {
    if (targetTokens.length === 0) continue;
    for (const refTokens of [lineTokens, prodTokens]) {
      if (refTokens.length === 0) continue;
      const common = targetTokens.filter((t) => refTokens.includes(t));
      if (common.length > maxCommonWords) maxCommonWords = common.length;
    }
  }
  if (maxCommonWords >= 1) {
    score += Math.min(maxCommonWords * 10, 40);
  }

  if (score > 0 && originalDigits.length > 0) {
    let digitMatchCount = 0;
    for (const d of originalDigits) {
      const regex = new RegExp('\\b' + d + '\\b');
      if (regex.test(prodName) || regex.test(lineName)) digitMatchCount++;
    }
    score += digitMatchCount * 12;
  }

  const isLineDescriptionGeneric = isGenericName(lineName) || (!lineName && isGenericName(prodName));
  const itemMeta = parsePackMetadata(item.linkedPartsJson);
  const qtyMatchesLine =
    targetQty > 0 &&
    (targetQty === lineQty || (itemMeta?.originalPackQty !== undefined && itemMeta.originalPackQty === lineQty));

  if (qtyMatchesLine) {
    if (score > 0) {
      score += 8;
    } else if (totalLines === 1 && totalItems === 1 && isLineDescriptionGeneric && isGenericName(originalName)) {
      score += 20;
    }
  }

  if (score > 0 && item.nomorPo && line.parentPoName && item.nomorPo.trim() === line.parentPoName.trim()) {
    score += 15;
  }

  if (score === 0 && totalLines === 1 && totalItems === 1) {
    if (isLineDescriptionGeneric || isGenericName(originalName)) {
      score += 25;
    }
  }

  return score;
}

/** Global 1-to-1 bipartite matcher between local tracking items and Odoo PO/PR lines. */
export function matchItemsToLines(items: any[], lines: any[]): Map<number, any> {
  const result = new Map<number, any>();
  if (!items || items.length === 0 || !lines || lines.length === 0) return result;

  const candidates: { item: any; line: any; score: number }[] = [];
  for (const item of items) {
    for (const line of lines) {
      const score = computeLineMatchScore(line, item, lines.length, items.length);
      if (score >= 20) {
        candidates.push({ item, line, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const usedItemIds = new Set<number>();
  const usedLineIds = new Set<any>();

  for (const cand of candidates) {
    const itemId = cand.item.id;
    const lineKey = cand.line.id !== undefined ? cand.line.id : cand.line;

    if (!usedItemIds.has(itemId) && !usedLineIds.has(lineKey)) {
      usedItemIds.add(itemId);
      usedLineIds.add(lineKey);
      result.set(itemId, cand.line);
    }
  }

  // Split siblings matcher: attach remaining split-receipt siblings to the best-fitting sibling's PO line.
  for (const item of items) {
    if (result.has(item.id)) continue;

    const itemMeta = parsePackMetadata(item.linkedPartsJson);
    const itemNameLower = item.originalName?.trim().toLowerCase();
    let bestLine: any = null;
    let bestSibScore = -Infinity;

    for (const sib of items) {
      if (sib.id === item.id || !result.has(sib.id)) continue;
      const sameSparepart = Boolean(item.sparepartId && sib.sparepartId && item.sparepartId === sib.sparepartId);
      const sibNameLower = sib.originalName?.trim().toLowerCase();
      const sameExactName = Boolean(itemNameLower && sibNameLower && itemNameLower === sibNameLower);
      if (!sameSparepart && !sameExactName) continue;

      const siblingLine = result.get(sib.id);
      if (!siblingLine) continue;
      if (item.nomorPo && siblingLine.parentPoName && item.nomorPo.trim() !== siblingLine.parentPoName.trim()) {
        continue;
      }

      const sibMeta = parsePackMetadata(sib.linkedPartsJson);
      const linkedBySplitId = itemMeta?.splitFromId === sib.id || sibMeta?.splitFromId === item.id;
      const eitherSplitPortion = Boolean(
        item.tanggalTerima || item.statusPo === 'DONE' || sib.tanggalTerima || sib.statusPo === 'DONE'
      );
      const eitherHasPartialNote = Boolean(
        (item.odooNotes || '').includes('[Penerimaan Parsial:') ||
          (sib.odooNotes || '').includes('[Penerimaan Parsial:')
      );
      if (!linkedBySplitId && !eitherSplitPortion && !eitherHasPartialNote) {
        continue;
      }

      const odooMult = getOdooPackMultiplier(sib.linkedPartsJson || item.linkedPartsJson);
      const lineUnits = (Number(siblingLine.product_qty) || 0) * odooMult;
      const sibUnits = (Number(sib.qty) || 0) * getLocalPackMultiplier(sib.linkedPartsJson);
      const itemUnits = (Number(item.qty) || 0) * getLocalPackMultiplier(item.linkedPartsJson);

      let sibScore = 0;
      if (linkedBySplitId) sibScore += 100;
      if (lineUnits > 0 && Math.abs(sibUnits + itemUnits - lineUnits) < 0.01) sibScore += 50;
      if (lineUnits > sibUnits) sibScore += 25;
      else if (lineUnits > 0 && sibUnits >= lineUnits) sibScore -= 50;
      if (item.nomorPo && siblingLine.parentPoName && item.nomorPo.trim() === siblingLine.parentPoName.trim()) {
        sibScore += 15;
      }

      if (sibScore > bestSibScore) {
        bestSibScore = sibScore;
        bestLine = siblingLine;
      }
    }

    if (bestLine && bestSibScore >= 0) {
      result.set(item.id, bestLine);
    }
  }

  if (items.length === 1 && lines.length === 1 && result.size === 0) {
    const singleItem = items[0];
    const singleLine = lines[0];
    const score = computeLineMatchScore(singleLine, singleItem, 1, 1);
    const lineDesc = singleLine.name || (Array.isArray(singleLine.product_id) ? singleLine.product_id[1] : '');
    if (score > 0 || isGenericName(lineDesc) || isGenericName(singleItem.originalName)) {
      result.set(singleItem.id, singleLine);
    }
  }

  return result;
}

/** Filter raw sibling DB items down to genuine split siblings of the same PO line. */
export function filterTrueSplitSiblings(
  item: any,
  matchedLine: any,
  rawSiblingItems: any[],
  matchedPoMap: Map<number, any>
): any[] {
  const itemMeta = parsePackMetadata(item?.linkedPartsJson);
  return rawSiblingItems.filter((sib: any) => {
    if (sib.id === item.id) return true;
    const sibMatchedLine = matchedPoMap.get(sib.id);
    if (sibMatchedLine && matchedLine && sibMatchedLine.id && matchedLine.id && sibMatchedLine.id !== matchedLine.id) {
      return false;
    }
    if (sib.nomorPo && matchedLine?.parentPoName && sib.nomorPo.trim() !== matchedLine.parentPoName.trim()) {
      return false;
    }
    if (!sib.tanggalTerima && sib.statusPo !== 'DONE' && !item.tanggalTerima && item.statusPo !== 'DONE') {
      const sibMeta = parsePackMetadata(sib.linkedPartsJson);
      const explicitSplitLink = itemMeta?.splitFromId === sib.id || sibMeta?.splitFromId === item.id;
      const sameMatchedLine = Boolean(
        sibMatchedLine && matchedLine && sibMatchedLine.id && sibMatchedLine.id === matchedLine.id
      );
      return explicitSplitLink || sameMatchedLine;
    }
    return true;
  });
}

/** Decide whether DELETE /receive should merge a sibling pending row back into the reverted row. */
export function shouldAutoMergeUnreceive(
  tracking: any,
  sibling: any,
  deletedMovementDescriptions: string[]
): boolean {
  if (!tracking || !sibling) return false;
  const siblingMeta = parsePackMetadata(sibling.linkedPartsJson);
  const trackingMeta = parsePackMetadata(tracking.linkedPartsJson);
  if (siblingMeta?.splitFromId === tracking.id || trackingMeta?.splitFromId === sibling.id) {
    return true;
  }
  if ((sibling.odooNotes || '').includes('[Penerimaan Parsial:') || (tracking.odooNotes || '').includes('[Penerimaan Parsial:')) {
    return true;
  }
  return deletedMovementDescriptions.some((desc) => desc.includes('(Parsial:'));
}

/** Decide whether sync should update Sparepart EMA lead time for this item. */
export function shouldRecalculateLeadTimeOnSync(
  prevTanggalTerima: Date | string | null | undefined,
  prevStatusPo: string | null | undefined,
  nextTanggalTerima: Date | string | null | undefined,
  nextStatusPo: string | null | undefined
): boolean {
  if (!prevTanggalTerima && Boolean(nextTanggalTerima)) return true;
  if (prevStatusPo !== 'DONE' && nextStatusPo === 'DONE' && !prevTanggalTerima) return true;
  return false;
}

/** 1-to-1 bipartite matcher between Odoo PR/TE lines and local DB items. */
export function matchOdooPrLinesToLocal(
  validReqLines: { line: any; prodName: string; cleanProdName: string; qty: number; price: number }[],
  localItems: any[]
) {
  const getLineExactNames = (v: { line: any; prodName: string; cleanProdName: string }) => {
    const names = new Set<string>();
    if (v.cleanProdName) names.add(v.cleanProdName);
    const lName = typeof v.line?.name === 'string' ? v.line.name.trim() : '';
    if (lName && !isGenericName(lName)) names.add(lName.toLowerCase());
    const vName = typeof v.line?.product_description_variants === 'string' ? v.line.product_description_variants.trim() : '';
    if (vName && !isGenericName(vName)) names.add(vName.toLowerCase());
    const pName =
      Array.isArray(v.line?.product_id) && typeof v.line.product_id[1] === 'string'
        ? v.line.product_id[1].trim()
        : '';
    if (pName && !isGenericName(pName)) names.add(pName.toLowerCase());
    return names;
  };

  const lineExactNamesList = validReqLines.map(getLineExactNames);
  const candidates: { li: number; ii: number; score: number }[] = [];

  for (let li = 0; li < validReqLines.length; li++) {
    const vLine = validReqLines[li];
    const cleanProdName = vLine.cleanProdName;
    const exactNamesForLine = lineExactNamesList[li];
    const lineHasExactLocalMatch = localItems.some((l: any) => {
      const cn = (l.originalName || '').toLowerCase().trim();
      return Boolean(cn && exactNamesForLine.has(cn));
    });

    for (let ii = 0; ii < localItems.length; ii++) {
      const local = localItems[ii];
      const cleanLocalName = (local.originalName || '').toLowerCase().trim();
      const localHasExactLineMatch = lineExactNamesList.some(
        (otherSet) => Boolean(cleanLocalName && otherSet.has(cleanLocalName))
      );

      let score = 0;
      if (cleanLocalName && exactNamesForLine.has(cleanLocalName)) {
        score += 100;
      } else if (!localHasExactLineMatch && !lineHasExactLocalMatch) {
        if (
          cleanProdName.length > 3 &&
          cleanLocalName.length > 3 &&
          (cleanLocalName.includes(cleanProdName) || cleanProdName.includes(cleanLocalName))
        ) {
          score += 20;
        }
      }

      if (score > 0 && local.qty === vLine.qty) {
        score += 10;
      }
      if (
        score > 0 &&
        vLine.price > 0 &&
        Number(local.harga) > 0 &&
        Math.abs(Number(local.harga) - vLine.price) < 10
      ) {
        score += 5;
      }

      if (
        score === 0 &&
        !localHasExactLineMatch &&
        !lineHasExactLocalMatch &&
        (isGenericName(vLine.prodName) || isGenericName(local.originalName))
      ) {
        if (
          vLine.price > 0 &&
          Number(local.harga) > 0 &&
          Math.abs(Number(local.harga) - vLine.price) < 10
        ) {
          score += 18;
        } else if (local.qty === vLine.qty) {
          score += 16;
        } else if (validReqLines.length === 1 && localItems.length === 1) {
          score += 15;
        }
      }

      if (score >= 15) {
        candidates.push({ li, ii, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const assignedLocalByLineIdx = new Map<number, any>();
  const usedLocalItemIds = new Set<number>();

  for (const cand of candidates) {
    const targetItem = localItems[cand.ii];
    if (!assignedLocalByLineIdx.has(cand.li) && !usedLocalItemIds.has(targetItem.id)) {
      assignedLocalByLineIdx.set(cand.li, targetItem);
      usedLocalItemIds.add(targetItem.id);
    }
  }

  for (const local of localItems) {
    if (usedLocalItemIds.has(local.id)) continue;
    const cleanLocal = (local.originalName || '').toLowerCase().trim();
    const hasMatchedSibling = Array.from(assignedLocalByLineIdx.values()).some(
      (m: any) => (m.originalName || '').toLowerCase().trim() === cleanLocal
    );
    if (hasMatchedSibling && (local.tanggalTerima || local.statusPo === 'DONE' || local.nomorPo)) {
      usedLocalItemIds.add(local.id);
    }
  }

  return { assignedLocalByLineIdx, usedLocalItemIds };
}

export { getOdooPackMultiplier, parsePackMetadata };
