import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bundle = require('../../lib/mtc/bundle-receive.ts');

describe('bundle-receive utilities', () => {
  describe('parseBundleParts & serializeBundleParts', () => {
    it('parses bundle object format and round-trips cleanly', () => {
      const input = [
        { sparepartId: 'MTC-SP-001', nama: 'Relay MY4N 220Vac', qty: 10, harga: 50000, uom: 'Pcs', lokasi: 'A-01' },
        { sparepartId: 'MTC-SP-002', nama: 'Base Relay MY4N', qty: 10, harga: 17488, uom: 'Pcs', lokasi: 'A-02' },
      ];
      const serialized = bundle.serializeBundleParts(input);
      const parsed = bundle.parseBundleParts(serialized);

      assert.equal(parsed?.length, 2);
      assert.equal(parsed?.[0].sparepartId, 'MTC-SP-001');
      assert.equal(parsed?.[0].qty, 10);
      assert.equal(parsed?.[0].harga, 50000);
      assert.equal(parsed?.[1].sparepartId, 'MTC-SP-002');
      assert.equal(parsed?.[1].harga, 17488);
    });

    it('parses legacy array format with id field', () => {
      const legacy = JSON.stringify([
        { id: 'SP-10', nama: 'Relay', qty: 5, harga: 25000 },
        { id: 'SP-11', nama: 'Base', qty: 5, harga: 10000 },
      ]);
      const parsed = bundle.parseBundleParts(legacy);

      assert.equal(parsed?.length, 2);
      assert.equal(parsed?.[0].sparepartId, 'SP-10');
      assert.equal(parsed?.[1].sparepartId, 'SP-11');
    });

    it('returns null for pack metadata, invalid JSON, or empty values', () => {
      assert.equal(bundle.parseBundleParts(JSON.stringify({ type: 'pack', isPackMode: true, qtyPerPack: 10 })), null);
      assert.equal(bundle.parseBundleParts('{not-json'), null);
      assert.equal(bundle.parseBundleParts(null), null);
      assert.equal(bundle.parseBundleParts(''), null);
      assert.equal(bundle.parseBundleParts('[]'), null);
    });
  });

  describe('validateBundleParts', () => {
    it('rejects fewer than 2 items, missing sparepartId, duplicates, invalid qty, and negative harga', () => {
      assert.equal(bundle.validateBundleParts(null).valid, false);
      assert.equal(
        bundle.validateBundleParts([{ sparepartId: 'SP-1', nama: 'Relay', qty: 1, harga: 100 }]).valid,
        false
      );
      assert.equal(
        bundle.validateBundleParts([
          { sparepartId: '', nama: 'Relay', qty: 1, harga: 100 },
          { sparepartId: 'SP-2', nama: 'Base', qty: 1, harga: 100 },
        ]).valid,
        false
      );
      const dupRes = bundle.validateBundleParts([
        { sparepartId: 'SP-1', nama: 'Relay', qty: 10, harga: 50000 },
        { sparepartId: 'SP-1', nama: 'Relay Duplicate', qty: 10, harga: 17488 },
      ]);
      assert.equal(dupRes.valid, false);

      assert.equal(
        bundle.validateBundleParts([
          { sparepartId: 'SP-1', nama: 'Relay', qty: 0, harga: 50000 },
          { sparepartId: 'SP-2', nama: 'Base', qty: 10, harga: 17488 },
        ]).valid,
        false
      );
      assert.equal(
        bundle.validateBundleParts([
          { sparepartId: 'SP-1', nama: 'Relay', qty: 10, harga: -1 },
          { sparepartId: 'SP-2', nama: 'Base', qty: 10, harga: 17488 },
        ]).valid,
        false
      );
    });

    it('accepts 2 or more distinct valid items', () => {
      const res = bundle.validateBundleParts([
        { sparepartId: 'SP-1', nama: 'Relay MY4N', qty: 10, harga: 50000 },
        { sparepartId: 'SP-2', nama: 'Base MY4N', qty: 10, harga: 17488 },
      ]);
      assert.equal(res.valid, true);
      if (res.valid) {
        assert.equal(res.parts.length, 2);
        assert.equal(res.parts[0].sparepartId, 'SP-1');
        assert.equal(res.parts[1].harga, 17488);
      }
    });
  });

  describe('allocation calculations', () => {
    it('computes PO total, allocated total, and difference accurately', () => {
      const res = bundle.calculateBundleAllocation(10, 67488, [
        { qty: 10, harga: 50000 },
        { qty: 10, harga: 17488 },
      ]);
      assert.deepEqual(res, {
        poTotal: 674880,
        allocatedTotal: 674880,
        difference: 0,
      });
    });

    it('allocates PO total evenly by qty and handles edge inputs safely', () => {
      assert.deepEqual(bundle.allocateEvenlyByQty(674880, [{ qty: 10 }, { qty: 10 }]), [33744, 33744]);
      assert.deepEqual(bundle.allocateEvenlyByQty(0, [{ qty: 10 }, { qty: 10 }]), [0, 0]);
      assert.deepEqual(bundle.allocateEvenlyByQty(100000, [{ qty: 0 }, { qty: -5 }]), [50000, 50000]);
      assert.deepEqual(bundle.allocateEvenlyByQty(100000, []), []);
    });

    it('allocates remaining PO total to the last item and clamps negative remainders to 0', () => {
      const unitPrice = bundle.allocateRemainingToLast(674880, [
        { qty: 10, harga: 50000 },
        { qty: 10, harga: 0 },
      ]);
      assert.equal(unitPrice, 17488);

      const clamped = bundle.allocateRemainingToLast(100000, [
        { qty: 10, harga: 20000 },
        { qty: 5, harga: 0 },
      ]);
      assert.equal(clamped, 0);
      assert.equal(bundle.allocateRemainingToLast(100000, []), 0);
    });
  });

  describe('sync guard & sparepart set helpers', () => {
    it('extracts unique sparepart IDs from bundle metadata', () => {
      const json = bundle.serializeBundleParts([
        { sparepartId: 'SP-1', nama: 'Relay', qty: 10, harga: 50000 },
        { sparepartId: 'SP-2', nama: 'Base', qty: 10, harga: 17488 },
      ]);
      assert.deepEqual(bundle.extractBundleSparepartIds(json), ['SP-1', 'SP-2']);
      assert.deepEqual(bundle.extractBundleSparepartIds(JSON.stringify({ type: 'pack', qtyPerPack: 10 })), []);
    });

    it('skips partial auto-split only for physically received bundles', () => {
      const bundleJson = bundle.serializeBundleParts([
        { sparepartId: 'SP-1', nama: 'Relay', qty: 5, harga: 50000 },
        { sparepartId: 'SP-2', nama: 'Base', qty: 5, harga: 17488 },
      ]);
      assert.equal(bundle.shouldSkipPartialAutoSplitForBundle(bundleJson, true), true);
      assert.equal(bundle.shouldSkipPartialAutoSplitForBundle(bundleJson, false), false);
      assert.equal(bundle.shouldSkipPartialAutoSplitForBundle(JSON.stringify({ type: 'pack', qtyPerPack: 5 }), true), false);
      assert.equal(bundle.shouldSkipPartialAutoSplitForBundle(null, true), false);
    });

    it('identifies stale sparepart IDs and collects all affected sparepart IDs', () => {
      assert.deepEqual(
        bundle.getStaleBundleSparepartIds(
          ['SP-1', 'SP-2', 'SP-3', null],
          [
            { sparepartId: 'SP-1', nama: 'Relay', qty: 10, harga: 50000 },
            { sparepartId: 'SP-4', nama: 'Kabel', qty: 10, harga: 5000 },
          ]
        ),
        ['SP-2', 'SP-3']
      );

      const bundleJson = bundle.serializeBundleParts([
        { sparepartId: 'SP-1', nama: 'Relay', qty: 10, harga: 50000 },
        { sparepartId: 'SP-2', nama: 'Base', qty: 10, harga: 17488 },
      ]);
      assert.deepEqual(bundle.collectAffectedBundleSparepartIds('SP-1', bundleJson), ['SP-1', 'SP-2']);
      assert.deepEqual(
        bundle.collectAffectedBundleSparepartIds(null, '[{"id":"SP-2","nama":"Base","qty":10,"harga":17488}]'),
        ['SP-2']
      );
    });
  });
});
