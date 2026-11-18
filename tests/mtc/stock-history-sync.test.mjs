import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const stockUtils = require('../../lib/mtc/stock-utils.ts');

describe('mtc stock-utils', () => {
  describe('keteranganNotContains & buildMtcHistoryWhere', () => {
    it('preserves NULL keterangan rows when excluding [SILENT] in default Semua Tipe view', () => {
      const where = stockUtils.buildMtcHistoryWhere({
        tipe: '',
        search: 'MTC-SP-133',
      });

      assert.ok(Array.isArray(where.AND));
      const silentGuard = where.AND.find(
        (cond) =>
          Array.isArray(cond.OR) &&
          cond.OR.some((branch) => branch.keterangan === null) &&
          cond.OR.some((branch) => branch.NOT?.keterangan?.contains === '[SILENT]')
      );
      assert.ok(silentGuard, 'expected explicit keterangan: null fallback alongside NOT contains [SILENT]');

      const searchGuard = where.AND.find(
        (cond) =>
          Array.isArray(cond.OR) &&
          cond.OR.some((branch) => branch.sparepartId?.contains === 'MTC-SP-133')
      );
      assert.ok(searchGuard, 'expected trimmed search OR block preserved alongside silent guard');
    });

    it('preserves NULL keterangan rows when excluding both [SILENT] and [OPNAME] for IN and OUT', () => {
      for (const tipe of ['IN', 'OUT']) {
        const where = stockUtils.buildMtcHistoryWhere({
          tipe,
          kategoriOut: 'Maintenance',
          search: '  DC Brushed  ',
        });

        assert.ok(Array.isArray(where.AND));
        const hasSilentGuard = where.AND.some(
          (cond) =>
            Array.isArray(cond.OR) &&
            cond.OR.some((b) => b.keterangan === null) &&
            cond.OR.some((b) => b.NOT?.keterangan?.contains === '[SILENT]')
        );
        const hasOpnameGuard = where.AND.some(
          (cond) =>
            Array.isArray(cond.OR) &&
            cond.OR.some((b) => b.keterangan === null) &&
            cond.OR.some((b) => b.NOT?.keterangan?.contains === '[OPNAME]')
        );
        const hasTipe = where.AND.some((cond) => cond.tipe === tipe);
        const hasSearch = where.AND.some(
          (cond) =>
            Array.isArray(cond.OR) &&
            cond.OR.some((b) => b.sparepartId?.contains === 'DC Brushed')
        );

        assert.equal(hasSilentGuard, true);
        assert.equal(hasOpnameGuard, true);
        assert.equal(hasTipe, true);
        assert.equal(hasSearch, true);
      }
    });

    it('handles ADJUSTMENT, LOG, date range, and UNCATEGORIZED filters cleanly without dropping guards', () => {
      const adj = stockUtils.buildMtcHistoryWhere({
        tipe: 'ADJUSTMENT',
        kategoriOut: 'UNCATEGORIZED',
        dateFrom: '2026-05-01',
        dateTo: '2026-11-18',
      });
      assert.ok(adj.AND.some((c) => c.keterangan?.contains === '[OPNAME]'));
      assert.ok(adj.AND.some((c) => c.tanggal?.gte instanceof Date && c.tanggal?.lte instanceof Date));
      assert.ok(
        adj.AND.some(
          (c) =>
            Array.isArray(c.OR) &&
            c.OR.some((b) => b.keterangan === null) &&
            c.OR.some((b) => b.NOT?.keterangan?.contains === '[SILENT]')
        )
      );
      assert.ok(
        adj.AND.some(
          (c) =>
            Array.isArray(c.OR) &&
            c.OR.some((b) => b.kategoriOut === null) &&
            c.OR.some((b) => b.kategoriOut === '')
        )
      );

      const log = stockUtils.buildMtcHistoryWhere({ tipe: 'LOG' });
      assert.ok(log.AND.some((c) => c.tipe === 'LOG'));
      assert.ok(
        log.AND.some(
          (c) =>
            Array.isArray(c.OR) &&
            c.OR.some((b) => b.keterangan === null) &&
            c.OR.some((b) => b.NOT?.keterangan?.contains === '[SILENT]')
        )
      );
    });

    it('builds trend movement where preserving NULL keterangan rows', () => {
      const where = stockUtils.buildMtcTrendMovementWhere({
        sparepartId: 'MTC-SP-133',
        kategori: 'Maintenance',
      });

      assert.ok(Array.isArray(where.AND));
      const hasTipeOut = where.AND.some((cond) => cond.tipe === 'OUT');
      const hasSilentGuard = where.AND.some(
        (cond) =>
          Array.isArray(cond.OR) &&
          cond.OR.some((b) => b.keterangan === null) &&
          cond.OR.some((b) => b.NOT?.keterangan?.contains === '[SILENT]')
      );
      const hasOpnameGuard = where.AND.some(
        (cond) =>
          Array.isArray(cond.OR) &&
          cond.OR.some((b) => b.keterangan === null) &&
          cond.OR.some((b) => b.NOT?.keterangan?.contains === '[OPNAME]')
      );

      assert.equal(hasTipeOut, true);
      assert.equal(hasSilentGuard, true);
      assert.equal(hasOpnameGuard, true);
    });
  });

  describe('computeMovementStockTotals & computeSparepartCurrentStock', () => {
    it('computes net stock excluding histori-sheets by default and using abs(qty) for OUT', () => {
      const result = stockUtils.computeMovementStockTotals([
        { tipe: 'IN', qty: 5, purchaseType: null },
        { tipe: 'OUT', qty: 1, purchaseType: null },
        { tipe: 'OUT', qty: -1, purchaseType: null },
        { tipe: 'OUT', qty: 10, purchaseType: 'histori-sheets' },
        { tipe: 'LOG', qty: 99, purchaseType: null },
      ]);

      assert.deepEqual(result, {
        totalIn: 5,
        totalOut: 2,
        netStock: 3,
      });
    });

    it('computes stock from potonganFisiks when tipeUkur is bulk', () => {
      const stock = stockUtils.computeSparepartCurrentStock({
        tipeUkur: 'bulk',
        movements: [{ tipe: 'IN', qty: 100 }],
        potonganFisiks: [{ panjangSisa: 4.5 }, { panjangSisa: 2.5 }],
      });

      assert.equal(stock, 7);
    });

    it('computes stock from movements when tipeUkur is unit', () => {
      const stock = stockUtils.computeSparepartCurrentStock({
        tipeUkur: 'unit',
        movements: [
          { tipe: 'IN', qty: 5, purchaseType: null },
          { tipe: 'OUT', qty: 1, purchaseType: null },
          { tipe: 'OUT', qty: 1, purchaseType: null },
          { tipe: 'OUT', qty: 1, purchaseType: null },
        ],
        potonganFisiks: [{ panjangSisa: 99 }],
      });

      assert.equal(stock, 2);
    });
  });

  describe('shouldSendSilentStockAdjustment', () => {
    it('returns false when unit stock was not modified or when item is bulk', () => {
      assert.equal(stockUtils.shouldSendSilentStockAdjustment('unit', 3, '3'), false);
      assert.equal(stockUtils.shouldSendSilentStockAdjustment('unit', 3, 3), false);
      assert.equal(stockUtils.shouldSendSilentStockAdjustment('bulk', 5, '2'), false);
      assert.equal(stockUtils.shouldSendSilentStockAdjustment('unit', 3, ''), false);
      assert.equal(stockUtils.shouldSendSilentStockAdjustment('unit', null, 0), false);
    });

    it('returns true only when unit stock was explicitly changed to a valid number', () => {
      assert.equal(stockUtils.shouldSendSilentStockAdjustment('unit', 3, '2'), true);
      assert.equal(stockUtils.shouldSendSilentStockAdjustment('unit', 3, 0), true);
    });
  });
});
