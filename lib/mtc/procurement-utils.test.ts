import test from 'node:test';
import assert from 'node:assert/strict';
import type { TrackingItem } from '../../types/mtc/procurement';
import {
  buildManuallyArchivedJson,
  buildRestoredFromArchiveJson,
  computeReceivePackQty,
  deriveSparepartProcurementSummary,
  getItemAgeDays,
  getItemSimplifiedStatus,
  getLocalPackMultiplier,
  getOdooPackMultiplier,
  hasPoAssigned,
  isBeforeSyncCutoff,
  isCancelled,
  isManuallyArchived,
  isOngoingConfirmedPo,
  isPackConvertedToUnits,
  isStalePendingItem,
  matchesProcurementSearch,
  parsePackMetadata,
} from './procurement-utils';

function makeItem(overrides: Partial<TrackingItem> = {}): TrackingItem {
  return {
    id: 1,
    fbIndex: null,
    originalName: 'Bearing 6204',
    sparepartId: null,
    keterangan: null,
    penggunaanBulan: null,
    kontrak3Bulan: false,
    tanggalList: '2026-10-01T00:00:00.000Z',
    qty: 2,
    productCategory: 'Sparepart',
    reason: null,
    urgency: 'Normal',
    linkReferences: null,
    vendor: null,
    harga: 50000,
    nomorPr: 'PR05000',
    statusPr: 'DRAFT',
    statusPa: null,
    statusPo: null,
    nomorPo: null,
    nomorTe: null,
    poApproved: false,
    etaFoom: null,
    linkGr: null,
    tanggalTerima: null,
    isStocked: false,
    ...overrides,
  };
}

test('getItemSimplifiedStatus classifies TO_APPROVE as APPROVAL, not DRAFT', () => {
  const item = makeItem({ statusPr: 'TO_APPROVE', statusPo: null, nomorPo: null });
  assert.equal(getItemSimplifiedStatus(item), 'APPROVAL');
});

test('isCancelled and getItemSimplifiedStatus classify REJECTED as CANCELLED', () => {
  const item = makeItem({ statusPr: 'REJECTED' });
  assert.equal(isCancelled(item), true);
  assert.equal(getItemSimplifiedStatus(item), 'CANCELLED');
});

test('hasPoAssigned returns false for draft pre-PO states even if dirty fields exist', () => {
  const item = makeItem({ statusPr: 'READY_ODOO', statusPo: null, nomorPo: null });
  assert.equal(hasPoAssigned(item), false);
});

test('pack multipliers separate local converted units from Odoo pack units', () => {
  const unconverted = JSON.stringify({ type: 'pack', isPackMode: true, qtyPerPack: 10 });
  assert.equal(isPackConvertedToUnits(unconverted), false);
  assert.equal(getLocalPackMultiplier(unconverted), 10);
  assert.equal(getOdooPackMultiplier(unconverted), 10);

  const converted = JSON.stringify({
    type: 'pack',
    isPackMode: true,
    qtyPerPack: 10,
    originalPackQty: 2,
    isConvertedToUnits: true,
  });
  assert.equal(isPackConvertedToUnits(converted), true);
  assert.equal(getLocalPackMultiplier(converted), 1);
  assert.equal(getOdooPackMultiplier(converted), 10);
  assert.equal(parsePackMetadata(converted)?.originalPackQty, 2);
});

test('deriveSparepartProcurementSummary returns NONE/PR/PO and avoids double-multiplying converted qty', () => {
  assert.deepEqual(deriveSparepartProcurementSummary([]), {
    purchasingStatus: 'NONE',
    purchasingQty: 0,
    purchasingNoPr: null,
    purchasingNoPo: null,
  });

  const convertedPendingSibling = makeItem({
    qty: 15,
    nomorPr: 'PR05100',
    statusPr: 'TO_APPROVE',
    statusPo: 'RFQ',
    nomorPo: 'P14900',
    linkedPartsJson: JSON.stringify({
      type: 'pack',
      isPackMode: true,
      qtyPerPack: 10,
      isConvertedToUnits: true,
    }),
  });
  assert.deepEqual(deriveSparepartProcurementSummary([convertedPendingSibling]), {
    purchasingStatus: 'PR',
    purchasingQty: 15,
    purchasingNoPr: 'PR05100',
    purchasingNoPo: null,
  });

  const confirmedPo = makeItem({
    qty: 3,
    nomorPr: 'PR05101',
    statusPr: 'PO',
    statusPo: 'PO',
    nomorPo: 'P14901',
  });
  assert.deepEqual(deriveSparepartProcurementSummary([convertedPendingSibling, confirmedPo]), {
    purchasingStatus: 'PO',
    purchasingQty: 18,
    purchasingNoPr: 'PR05100',
    purchasingNoPo: 'P14901',
  });
});

test('matchesProcurementSearch searches nomorTe, vendor, sparepart alias/id, PR, PO, and name', () => {
  const item = makeItem({
    originalName: 'Kabel Sensor Proximity',
    nomorPr: 'PR05012',
    nomorPo: 'P14800',
    nomorTe: 'TE04546',
    vendor: 'PT Otomasi Nusantara',
    sparepart: {
      id: 'MTC-SP-088',
      nama: 'Proximity Sensor Omron E2E',
      namaAlias: 'Sensor Prox M12',
      uom: 'Pcs',
      lokasi: '1-A-1-1',
      harga: 120000,
      minQty: 2,
    },
  });

  assert.equal(matchesProcurementSearch(item, 'TE04546'), true);
  assert.equal(matchesProcurementSearch(item, 'nusantara'), true);
  assert.equal(matchesProcurementSearch(item, 'Sensor Prox M12'), true);
  assert.equal(matchesProcurementSearch(item, 'MTC-SP-088'), true);
  assert.equal(matchesProcurementSearch(item, 'PRO5012'), true);
  assert.equal(matchesProcurementSearch(item, 'tidak-ada'), false);
});

test('isOngoingConfirmedPo includes manual POs (statusPo null, statusPr PO) and excludes RFQ/DONE/CANCELLED', () => {
  assert.equal(isOngoingConfirmedPo(makeItem({ nomorPo: 'P14910', statusPr: 'PO', statusPo: null })), true);
  assert.equal(isOngoingConfirmedPo(makeItem({ nomorPo: 'P14910', statusPr: 'PO', statusPo: 'PO' })), true);
  assert.equal(isOngoingConfirmedPo(makeItem({ nomorPo: 'P14910', statusPr: 'RFQ', statusPo: 'RFQ' })), false);
  assert.equal(isOngoingConfirmedPo(makeItem({ nomorPo: 'P14910', statusPr: 'RECEIVED', statusPo: 'DONE' })), false);
  assert.equal(isOngoingConfirmedPo(makeItem({ nomorPo: 'P14910', statusPr: 'CANCELLED', statusPo: 'CANCELLED' })), false);
  assert.equal(isOngoingConfirmedPo(makeItem({ nomorPo: null, statusPr: 'PO', statusPo: 'PO' })), false);
});

test('computeReceivePackQty does not multiply again when item is already converted to units', () => {
  assert.deepEqual(computeReceivePackQty(2, true, 100, false), {
    multiplier: 100,
    totalPhysicalUnits: 200,
    nextReceiveQty: 200,
  });
  assert.deepEqual(computeReceivePackQty(15, true, 10, true), {
    multiplier: 1,
    totalPhysicalUnits: 15,
    nextReceiveQty: 15,
  });
  assert.deepEqual(computeReceivePackQty(5, false, 10, false), {
    multiplier: 1,
    totalPhysicalUnits: 5,
    nextReceiveQty: 5,
  });
});

test('manual archive metadata preserves pack fields and supports lossless reopen', () => {
  const existing = JSON.stringify({
    type: 'pack',
    isPackMode: true,
    qtyPerPack: 10,
    uomPack: 'Box',
    uomUnit: 'Pcs',
  });
  const archivedJson = buildManuallyArchivedJson(
    existing,
    { statusPr: 'PO', statusPo: 'PO' },
    'Barang menggantung > 90 hari',
    '2026-11-18T00:00:00.000Z'
  );

  assert.equal(isManuallyArchived(archivedJson), true);
  assert.equal(isManuallyArchived(makeItem({ linkedPartsJson: archivedJson })), true);
  const parsed = parsePackMetadata(archivedJson);
  assert.equal(parsed?.qtyPerPack, 10);
  assert.equal(parsed?.prevStatusPr, 'PO');
  assert.equal(parsed?.prevStatusPo, 'PO');

  const restoredJson = buildRestoredFromArchiveJson(archivedJson);
  assert.equal(isManuallyArchived(restoredJson), false);
  const restoredMeta = parsePackMetadata(restoredJson);
  assert.equal(restoredMeta?.qtyPerPack, 10);
  assert.equal(restoredMeta?.manuallyArchived, undefined);

  const plainArchive = buildManuallyArchivedJson(null, { statusPr: 'DRAFT', statusPo: null });
  assert.equal(buildRestoredFromArchiveJson(plainArchive), null);
});

test('getItemAgeDays and isStalePendingItem flag old pending items but exclude RECEIVED/DONE/CANCELLED', () => {
  const now = new Date('2026-11-18T12:00:00.000Z');
  const oldPo = makeItem({
    tanggalList: '2026-08-01T00:00:00.000Z',
    statusPr: 'PO',
    statusPo: 'PO',
    nomorPo: 'P12000',
  });
  assert.equal(getItemAgeDays(oldPo, now), 109);
  assert.equal(isStalePendingItem(oldPo, 60, now), true);
  assert.equal(isStalePendingItem(oldPo, 120, now), false);

  const freshPo = makeItem({
    tanggalList: '2026-11-01T00:00:00.000Z',
    statusPr: 'PO',
    statusPo: 'PO',
  });
  assert.equal(isStalePendingItem(freshPo, 60, now), false);

  const receivedOld = makeItem({
    tanggalList: '2026-06-01T00:00:00.000Z',
    statusPr: 'RECEIVED',
    statusPo: 'PO',
    tanggalTerima: '2026-07-01T00:00:00.000Z',
  });
  assert.equal(isStalePendingItem(receivedOld, 60, now), false);

  const cancelledOld = makeItem({
    tanggalList: '2026-06-01T00:00:00.000Z',
    statusPr: 'CANCELLED',
    statusPo: 'CANCELLED',
  });
  assert.equal(isStalePendingItem(cancelledOld, 60, now), false);
});

test('isBeforeSyncCutoff checks YYYY-MM-DD lower bound accurately', () => {
  assert.equal(isBeforeSyncCutoff(new Date('2025-12-31T23:59:59Z'), '2026-01-01'), true);
  assert.equal(isBeforeSyncCutoff(new Date('2026-01-01T00:00:00Z'), '2026-01-01'), false);
  assert.equal(isBeforeSyncCutoff(new Date('2025-05-01T00:00:00Z'), ''), false);
  assert.equal(isBeforeSyncCutoff(new Date('2025-05-01T00:00:00Z'), null), false);
});
