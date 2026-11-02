import { describe, expect, it, vi } from 'vitest';
import { CompressionEstimate, CompressionInputs, CompressionScenarioId, EncodingColumn, SegmentColumn } from '../../types';
import {
  buildCompressionChart,
  buildCompressionColumn,
  buildEncodedPreview,
  classifyCardinality,
  compareCompression,
  COMPRESSION_SCENARIOS,
  DEFAULT_COMPRESSION_INPUTS,
  defaultInputsFor,
  describeCompressionAssumptions,
  effectiveCardinality,
  estimateColumnCompression,
  estimateFromInputs,
  explainCompressionEstimate,
  generateScenarioColumn,
  getCompressionSourceReferences,
  getScenario,
  HIGH_CARDINALITY_RATIO,
  LOW_CARDINALITY_RATIO,
} from '../stage6-compression-simulator';
import { generateDictionaryEncoding } from '../stage6-vertipaq-simulator';
import { generateSegments, MODELLED_SEGMENT_METADATA_BYTES } from '../stage6-segment-simulator';
import { VALUE_ENCODING_METADATA_BYTES } from '../stage6-encoding-simulator';
import { generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../stage6-synthetic-dataset';

const ints = (values: Array<number | null>): SegmentColumn => ({ name: 'Ints', sourceType: 'int64', dataType: 'INTEGER', scale: 0, values });
const texts = (values: Array<string | null>): SegmentColumn => ({ name: 'Text', sourceType: 'utf8', dataType: 'TEXT', scale: 0, values });
const nonTextScenarios = COMPRESSION_SCENARIOS.filter((s) => s.id !== 'CUSTOMER_COLUMN').map((s) => s.id) as Array<Exclude<CompressionScenarioId, 'CUSTOMER_COLUMN'>>;

const inputs = (scenario: CompressionScenarioId, overrides: Partial<CompressionInputs> = {}): CompressionInputs => ({
  ...defaultInputsFor(scenario),
  ...overrides,
});

const assertSane = (e: CompressionEstimate): void => {
  for (const n of [e.originalBytes, e.dictionaryBytes, e.encodedValueBytes, e.segmentOverheadBytes, e.columnOverheadBytes, e.totalCompressedBytes]) {
    expect(Number.isFinite(n)).toBe(true);
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  }
  for (const n of [e.compressionRatio, e.savingsBytes, e.savingsPercent, e.dictionaryOverheadPercent, e.cardinalityRatio, e.breakdownPercent.dictionary, e.breakdownPercent.encodedValues, e.breakdownPercent.overhead]) {
    expect(Number.isFinite(n)).toBe(true);
    expect(Number.isNaN(n)).toBe(false);
  }
  expect(e.compressionRatio).toBeGreaterThan(0);
  expect(e.totalCompressedBytes).toBe(e.dictionaryBytes + e.encodedValueBytes + e.segmentOverheadBytes + e.columnOverheadBytes);
  expect(e.savingsBytes).toBe(e.originalBytes - e.totalCompressedBytes);
  if (e.totalCompressedBytes > 0) {
    const sum = e.breakdownPercent.dictionary + e.breakdownPercent.encodedValues + e.breakdownPercent.overhead;
    expect(sum).toBeCloseTo(100, 8);
  }
};

describe('scenario setup and cardinality control', () => {
  it('limits a user-controlled cardinality to the rows and to the scenario maximum', () => {
    expect(effectiveCardinality('LOW_CARDINALITY_TEXT', 1000, 5)).toBe(5);
    expect(effectiveCardinality('LOW_CARDINALITY_TEXT', 1000, 5000)).toBe(1000); // scenario maximum
    expect(effectiveCardinality('RANDOM_INTEGERS', 100, 500)).toBe(100); // cannot exceed the rows
    expect(effectiveCardinality('DATES_RANDOM', 5000, 5000)).toBe(730);
    expect(effectiveCardinality('REPEATED_DECIMALS', 1000, 0)).toBe(1);
    expect(effectiveCardinality('REPEATED_DECIMALS', 1000, 7.9)).toBe(7);
  });

  it('fixes cardinality to the row count for unique scenarios and leaves Customer columns to the data', () => {
    expect(effectiveCardinality('HIGH_CARDINALITY_TEXT', 321, 1)).toBe(321);
    expect(effectiveCardinality('SEQUENTIAL_INTEGERS', 77, 1)).toBe(77);
    expect(effectiveCardinality('CUSTOMER_COLUMN', 500, 1)).toBeNull();
  });

  it('returns 0 for zero rows and rejects invalid input', () => {
    expect(effectiveCardinality('LOW_CARDINALITY_TEXT', 0, 5)).toBe(0);
    expect(() => effectiveCardinality('LOW_CARDINALITY_TEXT', -1, 5)).toThrow(RangeError);
    expect(() => effectiveCardinality('LOW_CARDINALITY_TEXT', 1.5, 5)).toThrow(RangeError);
    expect(() => effectiveCardinality('LOW_CARDINALITY_TEXT', 10, Number.NaN)).toThrow(RangeError);
    expect(() => getScenario('NOPE' as CompressionScenarioId)).toThrow(RangeError);
  });

  it('gives every scenario a default cardinality and resets other settings when switching', () => {
    expect(defaultInputsFor('RANDOM_INTEGERS').cardinality).toBe(500);
    expect(defaultInputsFor('DATES_RANDOM', { ...DEFAULT_COMPRESSION_INPUTS, rowCount: 300, nullPercent: 10 })).toMatchObject({ rowCount: 300, nullPercent: 10, cardinality: 365 });
  });
});

describe('deterministic scenario data', () => {
  it('produces exactly the requested number of distinct values', () => {
    for (const [scenario, requested] of [
      ['LOW_CARDINALITY_TEXT', 5],
      ['LOW_CARDINALITY_TEXT', 40],
      ['RANDOM_INTEGERS', 123],
      ['REPEATED_DECIMALS', 17],
      ['DATES_RANDOM', 200],
      ['DATES_SORTED', 200],
    ] as const) {
      const column = generateScenarioColumn(scenario, 1000, requested);
      expect(new Set(column.values).size).toBe(requested);
      expect(column.values).toHaveLength(1000);
    }
  });

  it('does not use random numbers and gives identical output every time', () => {
    const spy = vi.spyOn(Math, 'random');
    for (const scenario of nonTextScenarios) {
      expect(generateScenarioColumn(scenario, 400, 30)).toEqual(generateScenarioColumn(scenario, 400, 30));
    }
    compareCompression({ rowCount: 300, segmentRowCount: 100, nullPercent: 10 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('builds the documented shape for each distribution', () => {
    expect(generateScenarioColumn('SEQUENTIAL_INTEGERS', 5, 1).values).toEqual([1, 2, 3, 4, 5]);
    const unique = generateScenarioColumn('HIGH_CARDINALITY_TEXT', 100, 1).values;
    expect(new Set(unique).size).toBe(100);
    expect(unique[0]).toBe('Customer 000001');
    const decimals = generateScenarioColumn('REPEATED_DECIMALS', 200, 8);
    expect(decimals.dataType).toBe('DECIMAL');
    expect(decimals.scale).toBe(2);
    expect((decimals.values as number[]).every((v) => Math.round(v * 100) / 100 === v)).toBe(true);
    const dates = generateScenarioColumn('DATES_RANDOM', 200, 50).values as string[];
    expect(dates.every((d) => /^20(23|24)-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect(generateScenarioColumn('LOW_CARDINALITY_TEXT', 50, 5).values.every((v) => ['East', 'West', 'North', 'South', 'Central'].includes(v as string))).toBe(true);
  });

  it('DATES_SORTED is the same data as DATES_RANDOM in ascending order', () => {
    const random = generateScenarioColumn('DATES_RANDOM', 500, 100).values as string[];
    const sorted = generateScenarioColumn('DATES_SORTED', 500, 100).values as string[];
    expect(sorted).toEqual(random.slice().sort());
  });

  it('does not make the first rows look sorted when cardinality is below the row count', () => {
    const values = generateScenarioColumn('RANDOM_INTEGERS', 200, 50).values as number[];
    const ascending = values.slice(0, 20).every((v, i, a) => i === 0 || a[i - 1] <= v);
    expect(ascending).toBe(false);
  });

  it('handles zero rows for every scenario', () => {
    for (const scenario of nonTextScenarios) {
      expect(generateScenarioColumn(scenario, 0, 10).values).toEqual([]);
    }
  });

  it('builds a Customer column from the shared dataset and applies the Module 3 null pattern', () => {
    const column = buildCompressionColumn(inputs('CUSTOMER_COLUMN', { customerColumn: 'Revenue', rowCount: 200 }));
    expect(column.name).toBe('Revenue');
    expect(column.values).toEqual(getCustomerEncodingColumn(generateSyntheticCustomerRows(200), 'Revenue').values);
    const withNulls = buildCompressionColumn(inputs('CUSTOMER_COLUMN', { customerColumn: 'Revenue', rowCount: 1000, nullPercent: 25 }));
    const share = withNulls.values.filter((v) => v === null).length / 1000;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.35);
    expect(() => buildCompressionColumn(inputs('CUSTOMER_COLUMN', { customerColumn: 'Nope' }))).toThrow(/Unknown/);
  });
});

describe('cardinality calculations', () => {
  it('counts distinct non-null values and the ratio', () => {
    const e = estimateColumnCompression(ints([1, 1, 2, 2, 2, null, null, 3]), 100);
    expect(e.cardinality).toBe(3);
    expect(e.nonNullCount).toBe(6);
    expect(e.nullCount).toBe(2);
    expect(e.cardinalityRatio).toBeCloseTo(0.5, 10);
  });

  it('labels bands at the teaching thresholds', () => {
    expect(LOW_CARDINALITY_RATIO).toBe(0.1);
    expect(HIGH_CARDINALITY_RATIO).toBe(0.9);
    expect(classifyCardinality(0.0999, 100)).toBe('LOW');
    expect(classifyCardinality(0.1, 100)).toBe('MEDIUM');
    expect(classifyCardinality(0.8999, 100)).toBe('MEDIUM');
    expect(classifyCardinality(0.9, 100)).toBe('HIGH');
    expect(classifyCardinality(0, 0)).toBe('EMPTY');
  });

  it('shows how the scenarios fall into bands at 1,000 rows', () => {
    const band = (s: CompressionScenarioId) => estimateFromInputs(inputs(s, { rowCount: 1000 })).cardinalityBand;
    expect(band('LOW_CARDINALITY_TEXT')).toBe('LOW');
    expect(band('REPEATED_DECIMALS')).toBe('LOW');
    expect(band('HIGH_CARDINALITY_TEXT')).toBe('HIGH');
    expect(band('SEQUENTIAL_INTEGERS')).toBe('HIGH');
    expect(band('RANDOM_INTEGERS')).toBe('MEDIUM');
  });
});

describe('dictionary model arithmetic (hand-checked)', () => {
  // [1, 2, 2, 3] in two segments of 2 rows.
  const e = estimateColumnCompression(ints([1, 2, 2, 3]), 2);

  it('counts the dictionary once and sizes IDs per segment', () => {
    expect(e.encodingModel).toBe('DICTIONARY');
    expect(e.cardinality).toBe(3);
    expect(e.dictionaryEntryCount).toBe(3);
    expect(e.bitsPerStoredValue).toBe(2);
    expect(e.originalBytes).toBe(32); // 4 numbers x 8 bytes
    expect(e.dictionaryBytes).toBe(24); // 3 distinct numbers x 8 bytes, once
    expect(e.encodedValueBytes).toBe(2); // 2 segments x ceil(2 rows x 2 bits / 8) = 1 byte each
    expect(e.segmentCount).toBe(2);
    expect(e.segmentOverheadBytes).toBe(2 * MODELLED_SEGMENT_METADATA_BYTES);
    expect(e.columnOverheadBytes).toBe(0);
    expect(e.totalCompressedBytes).toBe(24 + 2 + 128);
  });

  it('derives ratio, savings and percentages from those sizes', () => {
    expect(e.compressionRatio).toBeCloseTo(32 / 154, 10);
    expect(e.savingsBytes).toBe(32 - 154);
    expect(e.savingsPercent).toBeCloseTo((-122 / 32) * 100, 10);
    expect(e.dictionaryOverheadPercent).toBeCloseTo((24 / 154) * 100, 10);
    expect(e.breakdownPercent.dictionary).toBeCloseTo((24 / 154) * 100, 10);
    expect(e.breakdownPercent.encodedValues).toBeCloseTo((2 / 154) * 100, 10);
    expect(e.breakdownPercent.overhead).toBeCloseTo((128 / 154) * 100, 10);
  });

  it('keeps savings negative (not a negative size) when the model makes a column larger', () => {
    expect(e.savingsBytes).toBeLessThan(0);
    assertSane(e);
  });

  it('sizes text as UTF-8 bytes plus a length prefix, in both original and dictionary', () => {
    const t = estimateColumnCompression(texts(['ab', 'ab', 'cde']), 10);
    expect(t.originalBytes).toBe(6 + 6 + 7);
    expect(t.dictionaryBytes).toBe(6 + 7);
    expect(t.bitsPerStoredValue).toBe(1);
  });

  it('sizes dates as 8-byte numbers even though they are ISO text', () => {
    const d = estimateColumnCompression({ name: 'D', sourceType: 'date', dataType: 'DATE', scale: 0, values: ['2024-01-01', '2024-01-01', '2024-01-02'] }, 10);
    expect(d.originalBytes).toBe(24);
    expect(d.dictionaryBytes).toBe(16);
  });
});

describe('value model arithmetic (hand-checked)', () => {
  it('stores offsets in ceil(log2(range + 1)) bits with no dictionary', () => {
    const e = estimateColumnCompression(ints([100, 105, 103]), 100, { encoding: 'VALUE' });
    expect(e.encodingModel).toBe('VALUE');
    expect(e.dictionaryBytes).toBe(0);
    expect(e.dictionaryEntryCount).toBe(0);
    expect(e.bitsPerStoredValue).toBe(3); // range 5 -> 6 states
    expect(e.encodedValueBytes).toBe(2); // 3 rows x 3 bits = 9 bits
    expect(e.segmentOverheadBytes).toBe(MODELLED_SEGMENT_METADATA_BYTES);
    expect(e.columnOverheadBytes).toBe(VALUE_ENCODING_METADATA_BYTES);
    expect(e.totalCompressedBytes).toBe(2 + 64 + 16);
    expect(e.dictionaryOverheadPercent).toBe(0);
    assertSane(e);
  });

  it('adds one extra state when nulls exist', () => {
    const without = estimateColumnCompression(ints([1, 2, 3, 4]), 100, { encoding: 'VALUE' });
    const withNull = estimateColumnCompression(ints([1, 2, 3, null]), 100, { encoding: 'VALUE' });
    expect(without.bitsPerStoredValue).toBe(2); // range 3 -> 4 states
    expect(withNull.bitsPerStoredValue).toBe(2); // range 2 + null -> 4 states
    const wider = estimateColumnCompression(ints([1, 2, 3, 4, null]), 100, { encoding: 'VALUE' });
    expect(wider.bitsPerStoredValue).toBe(3); // 4 values + null -> 5 states
  });

  it('rejects value encoding for text', () => {
    expect(() => estimateColumnCompression(texts(['a']), 10, { encoding: 'VALUE' })).toThrow(RangeError);
    expect(() => buildEncodedPreview(texts(['a']), 'VALUE')).toThrow(RangeError);
  });

  it('makes sequential integers much smaller than a dictionary would, and repeated decimals the other way', () => {
    const seq = (e: 'DICTIONARY' | 'VALUE') => estimateFromInputs(inputs('SEQUENTIAL_INTEGERS', { encoding: e }));
    expect(seq('VALUE').totalCompressedBytes).toBeLessThan(seq('DICTIONARY').totalCompressedBytes);
    const dec = (e: 'DICTIONARY' | 'VALUE') => estimateFromInputs(inputs('REPEATED_DECIMALS', { encoding: e }));
    expect(dec('DICTIONARY').totalCompressedBytes).toBeLessThan(dec('VALUE').totalCompressedBytes);
  });
});

describe('shared dictionary accounting', () => {
  const column = buildCompressionColumn(inputs('CUSTOMER_COLUMN', { customerColumn: 'CustomerName', rowCount: 1000 }));

  it('counts the dictionary once, however many segments there are', () => {
    const few = estimateColumnCompression(column, 1000);
    const some = estimateColumnCompression(column, 250);
    const many = estimateColumnCompression(column, 50);
    expect(few.segmentCount).toBe(1);
    expect(some.segmentCount).toBe(4);
    expect(many.segmentCount).toBe(20);
    expect(some.dictionaryBytes).toBe(few.dictionaryBytes);
    expect(many.dictionaryBytes).toBe(few.dictionaryBytes);
    expect(many.dictionaryEntryCount).toBe(few.dictionaryEntryCount);
  });

  it('scales segment overhead with the number of segments and nothing else', () => {
    const some = estimateColumnCompression(column, 250);
    const many = estimateColumnCompression(column, 50);
    expect(some.segmentOverheadBytes).toBe(4 * MODELLED_SEGMENT_METADATA_BYTES);
    expect(many.segmentOverheadBytes).toBe(20 * MODELLED_SEGMENT_METADATA_BYTES);
    expect(many.totalCompressedBytes).toBeGreaterThan(some.totalCompressedBytes);
  });

  it('matches the Module 3 segment model exactly', () => {
    const e = estimateColumnCompression(column, 250);
    const m3 = generateSegments(column, 250);
    expect(e.dictionaryBytes).toBe(m3.totals.dictionaryBytes);
    expect(e.encodedValueBytes).toBe(m3.totals.dataBytes);
    expect(e.segmentOverheadBytes).toBe(m3.totals.metadataBytes);
    expect(e.totalCompressedBytes).toBe(m3.totals.totalBytes);
    expect(e.cardinality).toBe(m3.dictionary.cardinality);
    expect(e.bitsPerStoredValue).toBe(m3.dictionary.bitsPerId);
    expect(e.segments).toEqual(m3.segments);
  });

  it('agrees with the Module 1 size model when there is one segment and no nulls', () => {
    for (const name of ['CustomerID', 'Revenue', 'LastPurchaseDate', 'Region', 'CustomerName']) {
      const col = buildCompressionColumn(inputs('CUSTOMER_COLUMN', { customerColumn: name, rowCount: 500 }));
      const e = estimateColumnCompression(col, 500);
      const m1 = generateDictionaryEncoding(col.values, name, col.dataType);
      expect(e.originalBytes).toBe(m1.originalSize);
      expect(e.dictionaryBytes).toBe(m1.dictionaryOverhead);
      expect(e.encodedValueBytes).toBe(m1.encodedSize);
      expect(e.totalCompressedBytes).toBe(m1.encodedSize + m1.dictionaryOverhead + MODELLED_SEGMENT_METADATA_BYTES);
    }
  });
});

describe('segment size changes', () => {
  it('changes the segment count and per-segment statistics but not the dictionary or the original size', () => {
    const column = buildCompressionColumn(inputs('CUSTOMER_COLUMN', { customerColumn: 'Revenue', rowCount: 1000 }));
    const a = estimateColumnCompression(column, 500);
    const b = estimateColumnCompression(column, 100);
    expect(a.segmentCount).toBe(2);
    expect(b.segmentCount).toBe(10);
    expect(b.segments).toHaveLength(10);
    expect(a.originalBytes).toBe(b.originalBytes);
    expect(a.dictionaryBytes).toBe(b.dictionaryBytes);
    expect(a.segmentRowCount).toBe(500);
    expect(b.segmentRowCount).toBe(100);
  });

  it('rounds IDs up per segment, so very small segments cost a little more data', () => {
    const column = ints(Array.from({ length: 100 }, (_, i) => i % 3));
    const one = estimateColumnCompression(column, 100);
    const tiny = estimateColumnCompression(column, 1);
    expect(tiny.encodedValueBytes).toBeGreaterThan(one.encodedValueBytes);
    expect(tiny.segmentCount).toBe(100);
  });

  it('rejects invalid segment sizes', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Infinity]) {
      expect(() => estimateColumnCompression(ints([1, 2]), bad)).toThrow(RangeError);
    }
  });

  it('row order does not change any size in this model (no run-length model)', () => {
    const random = estimateFromInputs(inputs('DATES_RANDOM'));
    const sorted = estimateFromInputs(inputs('DATES_SORTED'));
    expect(sorted.totalCompressedBytes).toBe(random.totalCompressedBytes);
    // The layouts do differ: the sorted first segment ends mid-span, the random one reaches near the end.
    expect((sorted.segments[0].statistics.maxValue as string) < (random.segments[0].statistics.maxValue as string)).toBe(true);
  });
});

describe('edge cases', () => {
  it('zero rows: every size is 0, the ratio is 1 and nothing is NaN, for both models', () => {
    for (const encoding of ['DICTIONARY', 'VALUE'] as const) {
      const e = estimateColumnCompression(ints([]), 100, { encoding });
      expect(e.totalCompressedBytes).toBe(0);
      expect(e.originalBytes).toBe(0);
      expect(e.segmentCount).toBe(0);
      expect(e.segments).toEqual([]);
      expect(e.compressionRatio).toBe(1);
      expect(e.savingsPercent).toBe(0);
      expect(e.cardinalityBand).toBe('EMPTY');
      assertSane(e);
    }
    expect(explainCompressionEstimate(estimateColumnCompression(ints([]), 100))).toEqual(['There are no rows, so every size is 0 and there is nothing to compress.']);
  });

  it('single row: metadata dominates and the column grows', () => {
    const e = estimateColumnCompression(ints([42]), 100);
    expect(e.originalBytes).toBe(8);
    expect(e.dictionaryBytes).toBe(8);
    expect(e.encodedValueBytes).toBe(1);
    expect(e.totalCompressedBytes).toBe(8 + 1 + 64);
    expect(e.compressionRatio).toBeCloseTo(8 / 73, 10);
    assertSane(e);
  });

  it('single distinct value: one dictionary entry, 1 bit per row', () => {
    const e = estimateColumnCompression(ints(Array.from({ length: 80 }, () => 7)), 100);
    expect(e.cardinality).toBe(1);
    expect(e.bitsPerStoredValue).toBe(1);
    expect(e.dictionaryBytes).toBe(8);
    expect(e.encodedValueBytes).toBe(10);
    expect(e.cardinalityBand).toBe('LOW');
    assertSane(e);
  });

  it('all-null columns: no dictionary bytes, a reserved ID, ratio 0 and an EMPTY band', () => {
    const e = estimateColumnCompression(ints([null, null, null, null]), 100);
    expect(e.cardinality).toBe(0);
    expect(e.nonNullCount).toBe(0);
    expect(e.cardinalityRatio).toBe(0);
    expect(e.cardinalityBand).toBe('EMPTY');
    expect(e.dictionaryBytes).toBe(0);
    expect(e.dictionaryEntryCount).toBe(1);
    expect(e.originalBytes).toBe(32);
    expect(e.encodedValueBytes).toBe(1);
    assertSane(e);
    const text = estimateColumnCompression(texts([null, null]), 100);
    expect(text.originalBytes).toBe(8); // length prefix only
    assertSane(text);
    assertSane(estimateColumnCompression(ints([null, null]), 100, { encoding: 'VALUE' }));
  });

  it('a 100% null share from the inputs gives an all-null column', () => {
    const e = estimateFromInputs(inputs('SEQUENTIAL_INTEGERS', { nullPercent: 100, rowCount: 200 }));
    expect(e.nullCount).toBe(200);
    expect(e.cardinality).toBe(0);
    assertSane(e);
  });

  it('high-cardinality data: the dictionary dominates and the column is larger than the original', () => {
    const e = estimateFromInputs(inputs('HIGH_CARDINALITY_TEXT', { rowCount: 5000 }));
    expect(e.cardinality).toBe(5000);
    expect(e.cardinalityBand).toBe('HIGH');
    expect(e.dictionaryOverheadPercent).toBeGreaterThan(80);
    expect(e.compressionRatio).toBeLessThan(1);
    expect(e.savingsBytes).toBeLessThan(0);
    assertSane(e);
  });

  it('handles a large dataset', () => {
    const e = estimateFromInputs(inputs('SEQUENTIAL_INTEGERS', { rowCount: 100000, segmentRowCount: 500 }));
    expect(e.rowCount).toBe(100000);
    expect(e.segmentCount).toBe(200);
    assertSane(e);
  });

  it('never produces NaN, Infinity or negative sizes across scenarios, models, sizes, nulls and row counts', () => {
    for (const scenario of COMPRESSION_SCENARIOS.map((s) => s.id)) {
      for (const rowCount of [0, 1, 2, 7, 150]) {
        for (const segmentRowCount of [1, 3, 64, 5000]) {
          for (const nullPercent of [0, 25, 100]) {
            for (const encoding of ['DICTIONARY', 'VALUE'] as const) {
              const base = inputs(scenario, { rowCount, segmentRowCount, nullPercent, encoding });
              const column = buildCompressionColumn(base);
              if (encoding === 'VALUE' && column.dataType === 'TEXT') continue;
              assertSane(estimateColumnCompression(column, segmentRowCount, { encoding }));
            }
          }
        }
      }
    }
  });

  it('is deterministic', () => {
    const a = estimateFromInputs(inputs('RANDOM_INTEGERS', { nullPercent: 10 }));
    const b = estimateFromInputs(inputs('RANDOM_INTEGERS', { nullPercent: 10 }));
    expect(a).toEqual(b);
  });

  it('does not mutate its input column', () => {
    const column = ints([3, 1, null, 2]);
    const before = JSON.stringify(column);
    estimateColumnCompression(column, 2);
    estimateColumnCompression(column, 2, { encoding: 'VALUE' });
    expect(JSON.stringify(column)).toBe(before);
  });
});

describe('page examples (values quoted in the component text)', () => {
  const dict = (s: CompressionScenarioId, o: Partial<CompressionInputs> = {}) => estimateFromInputs(inputs(s, { encoding: 'DICTIONARY', ...o }));
  const value = (s: CompressionScenarioId, o: Partial<CompressionInputs> = {}) => estimateFromInputs(inputs(s, { encoding: 'VALUE', ...o }));

  it('low-cardinality text: 5 values, 3 bits per row, dictionary a small share, about 16x in this model', () => {
    const e = dict('LOW_CARDINALITY_TEXT');
    expect(e.cardinality).toBe(5);
    expect(e.bitsPerStoredValue).toBe(3);
    expect(e.dictionaryOverheadPercent).toBeLessThan(10);
    expect(Math.round(e.compressionRatio)).toBe(16);
  });

  it('high-cardinality text: the dictionary is more than 90% of the total and the ratio is below 1', () => {
    const e = dict('HIGH_CARDINALITY_TEXT');
    expect(e.dictionaryOverheadPercent).toBeGreaterThan(90);
    expect(e.compressionRatio.toFixed(2)).toBe('0.93');
  });

  it('sequential integers: 0.85x with a dictionary, about 5.7x with value encoding', () => {
    expect(dict('SEQUENTIAL_INTEGERS').compressionRatio.toFixed(2)).toBe('0.85');
    expect(value('SEQUENTIAL_INTEGERS').compressionRatio.toFixed(1)).toBe('5.7');
  });

  it('random integers: both models help, value encoding more (about 4.0x against 1.5x)', () => {
    expect(dict('RANDOM_INTEGERS').compressionRatio.toFixed(1)).toBe('1.5');
    expect(value('RANDOM_INTEGERS').compressionRatio.toFixed(1)).toBe('4.0');
  });

  it('repeated decimals: the dictionary wins (about 8.8x against 3.3x)', () => {
    expect(dict('REPEATED_DECIMALS').compressionRatio.toFixed(1)).toBe('8.8');
    expect(value('REPEATED_DECIMALS').compressionRatio.toFixed(1)).toBe('3.3');
  });

  it('dates: value encoding about 5.7x against 1.9x with a dictionary', () => {
    expect(dict('DATES_RANDOM').compressionRatio.toFixed(1)).toBe('1.9');
    expect(value('DATES_RANDOM').compressionRatio.toFixed(1)).toBe('5.7');
  });
});

describe('side-by-side comparison', () => {
  const rows = compareCompression({ rowCount: 1000, segmentRowCount: 500, nullPercent: 0 });

  it('lists the six examples and then every Customer column', () => {
    expect(rows.map((r) => r.group)).toEqual(['EXAMPLE', 'EXAMPLE', 'EXAMPLE', 'EXAMPLE', 'EXAMPLE', 'EXAMPLE', 'CUSTOMER', 'CUSTOMER', 'CUSTOMER', 'CUSTOMER', 'CUSTOMER']);
    expect(rows.slice(0, 6).map((r) => r.id)).toEqual(['LOW_CARDINALITY_TEXT', 'HIGH_CARDINALITY_TEXT', 'SEQUENTIAL_INTEGERS', 'RANDOM_INTEGERS', 'REPEATED_DECIMALS', 'DATES_RANDOM']);
    expect(rows.slice(6).map((r) => r.label)).toEqual([
      'CustomerID (Customer table)',
      'Revenue (Customer table)',
      'LastPurchaseDate (Customer table)',
      'Region (Customer table)',
      'CustomerName (Customer table)',
    ]);
  });

  it('gives a value-encoding estimate only for numeric and date columns', () => {
    for (const row of rows) {
      if (row.dictionary.dataType === 'TEXT') expect(row.value).toBeNull();
      else expect(row.value?.encodingModel).toBe('VALUE');
    }
  });

  it('matches the single-column estimates for the same settings', () => {
    const decimals = rows.find((r) => r.id === 'REPEATED_DECIMALS');
    expect(decimals?.dictionary).toEqual(estimateFromInputs(inputs('REPEATED_DECIMALS', { encoding: 'DICTIONARY' })));
    const revenue = rows.find((r) => r.id === 'CUSTOMER_Revenue');
    expect(revenue?.dictionary.totalCompressedBytes).toBe(estimateFromInputs(inputs('CUSTOMER_COLUMN', { customerColumn: 'Revenue' })).totalCompressedBytes);
  });

  it('uses the shared row count, segment size and null share', () => {
    const small = compareCompression({ rowCount: 200, segmentRowCount: 50, nullPercent: 25 });
    expect(small.every((r) => r.dictionary.rowCount === 200 && r.dictionary.segmentRowCount === 50)).toBe(true);
    expect(small.every((r) => r.dictionary.nullCount > 0)).toBe(true);
    small.forEach((r) => assertSane(r.dictionary));
  });

  it('handles zero rows without NaN', () => {
    const empty = compareCompression({ rowCount: 0, segmentRowCount: 100, nullPercent: 0 });
    expect(empty).toHaveLength(11);
    empty.forEach((r) => {
      assertSane(r.dictionary);
      if (r.value) assertSane(r.value);
    });
  });

  it('is deterministic', () => {
    expect(compareCompression({ rowCount: 300, segmentRowCount: 100, nullPercent: 10 })).toEqual(
      compareCompression({ rowCount: 300, segmentRowCount: 100, nullPercent: 10 }),
    );
  });
});

describe('chart geometry', () => {
  const rows = compareCompression({ rowCount: 1000, segmentRowCount: 500, nullPercent: 0 });
  const chart = buildCompressionChart(rows.map((r) => ({ id: r.id, label: r.label, estimate: r.dictionary })));

  it('stretches the axis only when a column grows beyond its original size', () => {
    expect(chart.scalePct).toBeGreaterThan(100); // CustomerID and high-cardinality text expand
    const shrink = buildCompressionChart([{ id: 'a', label: 'a', estimate: rows[0].dictionary }]);
    expect(shrink.scalePct).toBe(100);
    expect(shrink.rows[0].originalWidthPct).toBe(100);
  });

  it('makes the parts add up to the total and keep every width within 0-100', () => {
    for (const row of chart.rows) {
      const parts = row.dictionaryWidthPct + row.encodedWidthPct + row.overheadWidthPct;
      expect(parts).toBeCloseTo((row.totalPctOfOriginal / chart.scalePct) * 100, 8);
      for (const w of [row.originalWidthPct, row.dictionaryWidthPct, row.encodedWidthPct, row.overheadWidthPct]) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(100.0000001);
      }
    }
  });

  it('handles empty input and zero-size columns', () => {
    expect(buildCompressionChart([])).toEqual({ scalePct: 100, rows: [] });
    const zero = buildCompressionChart([{ id: 'z', label: 'z', estimate: estimateColumnCompression(ints([]), 10) }]);
    expect(zero.rows[0].totalPctOfOriginal).toBe(0);
    expect(Number.isNaN(zero.rows[0].dictionaryWidthPct)).toBe(false);
  });
});

describe('encoded preview', () => {
  const column: SegmentColumn = { name: 'M', sourceType: 'decimal(18,2)', dataType: 'DECIMAL', scale: 2, values: [10.5, 20, null, 10.5, 30.25] };

  it('assigns dictionary IDs in first-seen order and reserves an ID for null', () => {
    const preview = buildEncodedPreview(column, 'DICTIONARY');
    expect(preview.entries.map((e) => [e.id, e.value, e.bytes])).toEqual([
      [0, '10.50', 8],
      [1, '20.00', 8],
      [2, '30.25', 8],
    ]);
    expect(preview.nullEntryId).toBe(3);
    expect(preview.totalEntries).toBe(4);
    expect(preview.rows.map((r) => r.encoded)).toEqual(['ID 0', 'ID 1', 'ID 3 (null)', 'ID 0', 'ID 2']);
    expect(preview.rows[0].original).toBe('10.50');
  });

  it('shows value-encoded stored values relative to the column minimum', () => {
    const preview = buildEncodedPreview(column, 'VALUE');
    expect(preview.offset).toBe(1050);
    expect(preview.rows.map((r) => r.encoded)).toEqual(['0', '950', 'null (reserved state)', '0', '1975']);
    expect(preview.entries).toEqual([]);
  });

  it('limits rows and entries and handles all-null and empty columns', () => {
    const many = buildEncodedPreview(ints(Array.from({ length: 50 }, (_, i) => i)), 'DICTIONARY', { rowLimit: 3, entryLimit: 4 });
    expect(many.rows).toHaveLength(3);
    expect(many.entries).toHaveLength(4);
    expect(many.totalEntries).toBe(50);
    expect(buildEncodedPreview(ints([]), 'DICTIONARY').rows).toEqual([]);
    expect(buildEncodedPreview(ints([null]), 'VALUE').offset).toBeNull();
  });
});

describe('explanations, assumptions and sources', () => {
  it('walks through each part of the estimate and says dictionaries are counted once', () => {
    const lines = explainCompressionEstimate(estimateFromInputs(inputs('LOW_CARDINALITY_TEXT'))).join(' ');
    expect(lines).toMatch(/Original \(uncompressed, modelled\)/);
    expect(lines).toMatch(/counted once, not once per segment/);
    expect(lines).toMatch(/Encoded IDs: 1,000 rows x 3 bit\(s\)/);
    expect(lines).toMatch(/Segment overhead: 2 segment\(s\) x 64 B = 128 B/);
    expect(lines).toMatch(/Total estimated compressed size/);
    expect(lines).toMatch(/not VertiPaq measurements/);
  });

  it('says so plainly when the model makes a column larger', () => {
    const lines = explainCompressionEstimate(estimateFromInputs(inputs('HIGH_CARDINALITY_TEXT'))).join(' ');
    expect(lines).toMatch(/larger than the original/);
  });

  it('explains the value model without a dictionary', () => {
    const lines = explainCompressionEstimate(estimateFromInputs(inputs('SEQUENTIAL_INTEGERS', { encoding: 'VALUE' }))).join(' ');
    expect(lines).toMatch(/There is no dictionary/);
    expect(lines).not.toMatch(/counted once/);
  });

  it('labels cardinality bands as teaching labels and never claims an engine choice', () => {
    const lines = explainCompressionEstimate(estimateFromInputs(inputs('RANDOM_INTEGERS'))).join(' ');
    expect(lines).toMatch(/not engine thresholds/);
    expect(lines).not.toMatch(/recommend|engine (will )?(choose|select|use)s?|VertiPaq (will )?(choose|select|use)s?/i);
  });

  it('lists every assumption behind the sizes', () => {
    const labels = describeCompressionAssumptions().map((a) => a.label);
    expect(labels).toEqual(['Original size', 'Dictionary', 'Encoded IDs', 'Value encoding', 'Segment overhead', 'Not modelled']);
    expect(describeCompressionAssumptions().find((a) => a.label === 'Dictionary')?.text).toMatch(/counted once/);
  });

  it('cites verified Microsoft Learn pages over https', () => {
    const sources = getCompressionSourceReferences();
    expect(sources.every((s) => s.url.startsWith('https://'))).toBe(true);
    expect(sources.some((s) => s.url.includes('import-modeling-data-reduction'))).toBe(true);
    expect(sources.some((s) => s.url.includes('column.encodinghint'))).toBe(true);
    expect(sources.some((s) => s.url.includes('info-storagetablecolumnsegments'))).toBe(true);
  });
});

describe('inputs type', () => {
  it('defaults to a valid, sane estimate', () => {
    const e = estimateFromInputs(DEFAULT_COMPRESSION_INPUTS);
    assertSane(e);
    expect(e.columnName).toBeTruthy();
  });

  it('keeps the EncodingColumn type usable as input', () => {
    const column: EncodingColumn = generateScenarioColumn('SEQUENTIAL_INTEGERS', 10, 1);
    expect(estimateColumnCompression({ ...column, values: column.values.slice() }, 5).rowCount).toBe(10);
  });
});
