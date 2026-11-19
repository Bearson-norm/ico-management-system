import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sloc = require('../../lib/sloc.ts');

describe('parseSLOC and rack grouping helpers', () => {
  it('parses full 4-segment SLOC codes and normalizes whitespace and column case', () => {
    assert.deepEqual(sloc.parseSLOC('1-A-1-1'), {
      rak: '1',
      kolom: 'A',
      level: '1',
      bin: '1',
      valid: true,
    });
    assert.deepEqual(sloc.parseSLOC(' 2-b-2-18 '), {
      rak: '2',
      kolom: 'B',
      level: '2',
      bin: '18',
      valid: true,
    });
  });

  it('parses 3-segment SLOC codes without bin (Rak 3 and Rak 4) into valid rack groups', () => {
    for (const code of ['3-C-1', '3-C-2', '3-C-3', '3-C-4']) {
      const parsed = sloc.parseSLOC(code);
      assert.equal(parsed.valid, true, `${code} should be valid`);
      assert.equal(parsed.rak, '3');
      assert.equal(parsed.kolom, 'C');
      assert.equal(parsed.level, code.split('-')[2]);
      assert.equal(parsed.bin, '');
      assert.equal(sloc.getRakGroupKey(code, parsed), 'Rak 3');
      assert.equal(sloc.getKolomGroupKey(parsed), 'Kolom C');
    }

    const rak4 = sloc.parseSLOC('4-D-2');
    assert.deepEqual(rak4, {
      rak: '4',
      kolom: 'D',
      level: '2',
      bin: '',
      valid: true,
    });
    assert.equal(sloc.getRakGroupKey('4-D-2', rak4), 'Rak 4');
    assert.equal(sloc.getKolomGroupKey(rak4), 'Kolom D');
  });

  it('parses 2-segment (rack-column) and 1-segment (numeric rack only) locations into their parent rack', () => {
    const rak2b = sloc.parseSLOC('2-B');
    assert.deepEqual(rak2b, {
      rak: '2',
      kolom: 'B',
      level: '',
      bin: '',
      valid: true,
    });
    assert.equal(sloc.getRakGroupKey('2-B', rak2b), 'Rak 2');
    assert.equal(sloc.getKolomGroupKey(rak2b), 'Kolom B');

    const rak2Only = sloc.parseSLOC('2');
    assert.deepEqual(rak2Only, {
      rak: '2',
      kolom: '',
      level: '',
      bin: '',
      valid: true,
    });
    assert.equal(sloc.getRakGroupKey('2', rak2Only), 'Rak 2');
    assert.equal(sloc.getKolomGroupKey(rak2Only), 'Lainnya');
  });

  it('keeps non-SLOC strings, dates, part codes, and empty values invalid', () => {
    const invalidInputs = [
      '',
      '   ',
      '-',
      '—',
      'Gudang MTC',
      'Gedung A - Lantai 2',
      'Gedung 1 - Lantai 2 - Ruang 1 - Kiri',
      'MTC-SP-001',
      '2026-11-19',
      '0',
      '0-A-1',
      '2-10',
      '1-A-',
      null,
      undefined,
    ];

    for (const input of invalidInputs) {
      const parsed = sloc.parseSLOC(input);
      assert.equal(parsed.valid, false, `${JSON.stringify(input)} must be invalid`);
    }

    assert.equal(sloc.getRakGroupKey('Gudang MTC'), 'Gudang MTC');
    assert.equal(sloc.getRakGroupKey('—'), '—');
    assert.equal(sloc.getRakGroupKey(''), '(Tanpa Lokasi)');
  });

  it('counts distinct non-empty columns without counting blank columns from rack-only items', () => {
    const items = ['2-B-1-1', '2-C-2-3', '2-B', '2'].map((loc) => ({
      _parsed: sloc.parseSLOC(loc),
    }));
    assert.equal(sloc.countDistinctKolom(items), 2);

    const rak3Items = ['3-C-1', '3-C-2', '3-C-3', '3-C-4'].map((loc) => ({
      _parsed: sloc.parseSLOC(loc),
    }));
    assert.equal(sloc.countDistinctKolom(rak3Items), 1);

    const rakOnlyItems = ['5'].map((loc) => ({
      _parsed: sloc.parseSLOC(loc),
    }));
    assert.equal(sloc.countDistinctKolom(rakOnlyItems), 0);
  });

  it('sorts parsed SLOCs naturally with empty sub-segments placed after populated ones and invalid at end', () => {
    const rawLocations = ['Gudang MTC', '3-C-10', '3-C-2', '3-C-1', '2', '2-B', '2-B-1-1', '4-D-2', '1-A-1-10', '1-A-1-2'];
    const sorted = [...rawLocations].sort((a, b) =>
      sloc.compareParsedSLOC(sloc.parseSLOC(a), sloc.parseSLOC(b), a, b)
    );
    assert.deepEqual(sorted, [
      '1-A-1-2',
      '1-A-1-10',
      '2-B-1-1',
      '2-B',
      '2',
      '3-C-1',
      '3-C-2',
      '3-C-10',
      '4-D-2',
      'Gudang MTC',
    ]);
  });
});
