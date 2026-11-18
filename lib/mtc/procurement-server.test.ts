import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PENDING_ARRIVAL_WHERE,
  archiveOrReopenProcurementItems,
  syncSparepartProcurement,
} from './procurement-server';

function makeFakeDb(pendingRows: any[], sparepartRow = { avgLeadTime: 10, maxLeadTime: 12 }) {
  const calls: { findManyWhere?: any; updateArgs?: any } = {};
  const db = {
    procurementTracking: {
      findMany: async (args: any) => {
        calls.findManyWhere = args.where;
        return pendingRows;
      },
    },
    sparepart: {
      findUnique: async () => sparepartRow,
      update: async (args: any) => {
        calls.updateArgs = args;
        return args;
      },
    },
  };
  return { db, calls };
}

test('syncSparepartProcurement queries active pending arrivals (including null statusPo) and aggregates multi-PO summary', async () => {
  const { db, calls } = makeFakeDb([
    {
      qty: 15,
      nomorPr: 'PR05100',
      nomorPo: null,
      statusPr: 'TO_APPROVE',
      statusPo: null,
      tanggalTerima: null,
      linkedPartsJson: JSON.stringify({ type: 'pack', isPackMode: true, qtyPerPack: 10, isConvertedToUnits: true }),
    },
    {
      qty: 4,
      nomorPr: 'PR05101',
      nomorPo: 'P14905',
      statusPr: 'PO',
      statusPo: 'PO',
      tanggalTerima: null,
      linkedPartsJson: null,
    },
  ]);

  await syncSparepartProcurement(db, 'MTC-SP-001', {
    candidateHarga: 25000,
    allowHargaUpdate: true,
    odooNotes: '[]',
  });

  assert.deepEqual(calls.findManyWhere, {
    sparepartId: 'MTC-SP-001',
    ...PENDING_ARRIVAL_WHERE,
  });
  assert.deepEqual(calls.updateArgs, {
    where: { id: 'MTC-SP-001' },
    data: {
      purchasingStatus: 'PO',
      purchasingQty: 19,
      purchasingNoPr: 'PR05100',
      purchasingNoPo: 'P14905',
      odooNotes: '[]',
      harga: 25000,
    },
  });
});

test('syncSparepartProcurement clears dates and status to NONE when no pending items remain and updates lead time when flagged', async () => {
  const { db, calls } = makeFakeDb([], { avgLeadTime: 10, maxLeadTime: 12 });

  await syncSparepartProcurement(db, 'MTC-SP-002', {
    updateLeadTime: true,
    leadTimeStartDate: new Date('2026-10-01T00:00:00Z'),
    leadTimeReceiptDate: new Date('2026-10-21T00:00:00Z'),
  });

  assert.deepEqual(calls.updateArgs, {
    where: { id: 'MTC-SP-002' },
    data: {
      purchasingStatus: 'NONE',
      purchasingQty: 0,
      purchasingNoPr: null,
      purchasingNoPo: null,
      prDate: null,
      poDate: null,
      avgLeadTime: 12,
      maxLeadTime: 20,
    },
  });
});

test('archiveOrReopenProcurementItems archives eligible stale items, skips already received, and syncs sparepart badges', async () => {
  const updatedTrackings: any[] = [];
  const syncedSparepartUpdates: any[] = [];
  const rows = [
    {
      id: 10,
      sparepartId: 'MTC-SP-001',
      statusPr: 'PO',
      statusPo: 'PO',
      nomorPr: 'PR010',
      nomorPo: 'PO010',
      tanggalTerima: null,
      qty: 5,
      linkedPartsJson: null,
    },
    {
      id: 11,
      sparepartId: 'MTC-SP-001',
      statusPr: 'RECEIVED',
      statusPo: 'DONE',
      nomorPr: 'PR011',
      nomorPo: 'PO011',
      tanggalTerima: new Date('2026-10-01T00:00:00Z'),
      qty: 2,
      linkedPartsJson: null,
    },
  ];

  const db = {
    procurementTracking: {
      findMany: async (args: any) => {
        if (args.where?.id?.in) return rows;
        return [];
      },
      update: async (args: any) => {
        updatedTrackings.push(args);
        return args;
      },
    },
    sparepart: {
      update: async (args: any) => {
        syncedSparepartUpdates.push(args);
        return args;
      },
    },
  };

  const result = await archiveOrReopenProcurementItems(db, {
    action: 'archive',
    ids: [10, 11],
    reason: 'PO lama tidak ada kabar',
  });

  assert.equal(result.processedIds.length, 1);
  assert.deepEqual(result.processedIds, [10]);
  assert.deepEqual(result.skippedIds, [11]);
  assert.equal(updatedTrackings[0].where.id, 10);
  assert.equal(updatedTrackings[0].data.statusPr, 'CANCELLED');
  assert.equal(updatedTrackings[0].data.statusPo, 'CANCELLED');
  const meta = JSON.parse(updatedTrackings[0].data.linkedPartsJson);
  assert.equal(meta.manuallyArchived, true);
  assert.equal(meta.prevStatusPr, 'PO');
  assert.equal(meta.prevStatusPo, 'PO');
  assert.equal(syncedSparepartUpdates.length, 1);
  assert.equal(syncedSparepartUpdates[0].data.purchasingStatus, 'NONE');
});

test('archiveOrReopenProcurementItems restores manually archived items back to previous PR/PO status', async () => {
  const updatedTrackings: any[] = [];
  const syncedSparepartUpdates: any[] = [];
  const rows = [
    {
      id: 20,
      sparepartId: 'MTC-SP-005',
      statusPr: 'CANCELLED',
      statusPo: 'CANCELLED',
      nomorPr: 'PR020',
      nomorPo: 'PO020',
      tanggalTerima: null,
      qty: 4,
      linkedPartsJson: JSON.stringify({
        manuallyArchived: true,
        manuallyArchivedAt: '2026-11-18T00:00:00.000Z',
        prevStatusPr: 'PO',
        prevStatusPo: null,
      }),
    },
  ];

  const db = {
    procurementTracking: {
      findMany: async (args: any) => {
        if (args.where?.id?.in) return rows;
        return [
          {
            qty: 4,
            nomorPr: 'PR020',
            nomorPo: 'PO020',
            statusPr: 'PO',
            statusPo: null,
            tanggalTerima: null,
            linkedPartsJson: null,
          },
        ];
      },
      update: async (args: any) => {
        updatedTrackings.push(args);
        return args;
      },
    },
    sparepart: {
      update: async (args: any) => {
        syncedSparepartUpdates.push(args);
        return args;
      },
    },
  };

  const result = await archiveOrReopenProcurementItems(db, {
    action: 'reopen',
    ids: [20],
  });

  assert.deepEqual(result.processedIds, [20]);
  assert.equal(updatedTrackings[0].data.statusPr, 'PO');
  assert.equal(updatedTrackings[0].data.statusPo, null);
  assert.equal(updatedTrackings[0].data.linkedPartsJson, null);
  assert.equal(syncedSparepartUpdates[0].data.purchasingStatus, 'PO');
  assert.equal(syncedSparepartUpdates[0].data.purchasingNoPo, 'PO020');
});
