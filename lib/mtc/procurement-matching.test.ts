import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterTrueSplitSiblings,
  matchItemsToLines,
  shouldAutoMergeUnreceive,
  shouldRecalculateLeadTimeOnSync,
} from './procurement-matching';

test('matchItemsToLines does NOT attach second unreceived PR line to first PO line when only 1 PO line exists', () => {
  const localItems = [
    {
      id: 101,
      originalName: 'Bearing 6204',
      sparepartId: 'MTC-SP-001',
      qty: 5,
      tanggalTerima: null,
      statusPo: null,
      nomorPo: null,
    },
    {
      id: 102,
      originalName: 'Bearing 6204',
      sparepartId: 'MTC-SP-001',
      qty: 10,
      tanggalTerima: null,
      statusPo: null,
      nomorPo: null,
    },
  ];
  const odooLines = [
    {
      id: 9001,
      name: 'Bearing 6204',
      product_id: [10, 'Bearing 6204'],
      product_qty: 5,
      parentPoName: 'P14900',
    },
  ];

  const matched = matchItemsToLines(localItems, odooLines);
  assert.equal(matched.get(101)?.id, 9001);
  assert.equal(matched.get(102), undefined);
});

test('matchItemsToLines pairs split siblings to the matching PO line without cross-assigning to another same-item PO line', () => {
  const localItems = [
    {
      id: 101,
      originalName: 'Bearing 6204',
      sparepartId: 'MTC-SP-001',
      qty: 3,
      tanggalTerima: '2026-10-02T00:00:00.000Z',
      statusPo: 'PO',
      nomorPo: 'P14900',
    },
    {
      id: 102,
      originalName: 'Bearing 6204',
      sparepartId: 'MTC-SP-001',
      qty: 7,
      tanggalTerima: null,
      statusPo: 'PO',
      nomorPo: 'P14900',
    },
    {
      id: 103,
      originalName: 'Bearing 6204',
      sparepartId: 'MTC-SP-001',
      qty: 5,
      tanggalTerima: null,
      statusPo: 'PO',
      nomorPo: 'P14900',
    },
  ];
  const odooLines = [
    {
      id: 9001,
      name: 'Bearing 6204',
      product_id: [10, 'Bearing 6204'],
      product_qty: 10,
      parentPoName: 'P14900',
    },
    {
      id: 9002,
      name: 'Bearing 6204',
      product_id: [10, 'Bearing 6204'],
      product_qty: 5,
      parentPoName: 'P14900',
    },
  ];

  const matched = matchItemsToLines(localItems, odooLines);
  assert.equal(matched.get(103)?.id, 9002);
  assert.equal(matched.get(101)?.id, 9001);
  assert.equal(matched.get(102)?.id, 9001);

  // Order-independent: even when the standalone line appears first in the array
  const reversedMatched = matchItemsToLines([localItems[2], localItems[1], localItems[0]], odooLines);
  assert.equal(reversedMatched.get(103)?.id, 9002);
  assert.equal(reversedMatched.get(101)?.id, 9001);
  assert.equal(reversedMatched.get(102)?.id, 9001);
});

test('filterTrueSplitSiblings excludes unreceived independent lines and items from other PO lines', () => {
  const line1 = { id: 9001, product_qty: 5, parentPoName: 'P14900' };
  const line2 = { id: 9002, product_qty: 10, parentPoName: 'P14901' };

  const item1 = { id: 101, qty: 5, tanggalTerima: null, statusPo: 'PO', nomorPo: 'P14900' };
  const item2OtherPo = { id: 102, qty: 10, tanggalTerima: null, statusPo: 'PO', nomorPo: 'P14901' };
  const item3UnmatchedUnreceived = { id: 103, qty: 8, tanggalTerima: null, statusPo: null, nomorPo: null };

  const matchedMap = new Map<number, any>([
    [101, line1],
    [102, line2],
  ]);

  const filtered = filterTrueSplitSiblings(
    item1,
    line1,
    [item1, item2OtherPo, item3UnmatchedUnreceived],
    matchedMap
  );
  assert.deepEqual(
    filtered.map((x) => x.id),
    [101]
  );
});

test('shouldAutoMergeUnreceive only merges when evidence of a partial split exists', () => {
  const normalLine1 = { id: 101, originalName: 'Bearing 6204', linkedPartsJson: null };
  const normalLine2 = { id: 102, originalName: 'Bearing 6204', odooNotes: 'PR note biasa', linkedPartsJson: null };
  assert.equal(
    shouldAutoMergeUnreceive(normalLine1, normalLine2, ['[Penerimaan Pengadaan #101 PR: PR05055 / PO: P14900]']),
    false
  );

  const partialSiblingByNotes = {
    id: 103,
    originalName: 'Bearing 6204',
    odooNotes: '[Penerimaan Parsial: 3 diterima tgl 2026-10-02, sisa 7 Pcs menunggu]',
    linkedPartsJson: null,
  };
  assert.equal(
    shouldAutoMergeUnreceive(normalLine1, partialSiblingByNotes, [
      '[Penerimaan Pengadaan #101 (Parsial: 3/10 Pcs) PR: PR05055 / PO: P14900]',
    ]),
    true
  );

  const partialSiblingBySplitId = {
    id: 104,
    originalName: 'Bearing 6204',
    odooNotes: null,
    linkedPartsJson: JSON.stringify({ splitFromId: 101 }),
  };
  assert.equal(shouldAutoMergeUnreceive(normalLine1, partialSiblingBySplitId, []), true);
});

test('shouldRecalculateLeadTimeOnSync only triggers on initial receipt/GR transition', () => {
  assert.equal(shouldRecalculateLeadTimeOnSync(null, 'PO', '2026-10-05', 'PO'), true);
  assert.equal(shouldRecalculateLeadTimeOnSync(null, 'PO', '2026-10-05', 'DONE'), true);
  assert.equal(shouldRecalculateLeadTimeOnSync('2026-10-05', 'PO', '2026-10-05', 'PO'), false);
  assert.equal(shouldRecalculateLeadTimeOnSync('2026-10-05', 'PO', '2026-10-06', 'DONE'), false);
  assert.equal(shouldRecalculateLeadTimeOnSync(null, 'PO', null, 'PO'), false);
});
