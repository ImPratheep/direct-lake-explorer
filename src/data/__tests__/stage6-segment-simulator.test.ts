import { describe, expect, it } from 'vitest';
import { EncodingColumn, SegmentColumn, SegmentValue } from '../../types';
import {
  applyNullPattern,
  compareSegmentValues,
  detectColumnOrder,
  explainSegmentResult,
  generateSegments,
  getSegmentSourceReferences,
  MODELLED_SEGMENT_METADATA_BYTES,
  toSegmentColumn,
} from '../stage6-segment-simulator';
import { generateSyntheticCustomerRows, getCustomerEncodingColumn, isoDateToDayNumber } from '../stage6-synthetic-dataset';

const ints = (values: SegmentValue[]): SegmentColumn => ({
  name: 'Ints',
  sourceType: 'int64',
  dataType: 'INTEGER',
  scale: 0,
  values,
});

const customer = (name: string, rows: number): EncodingColumn =>
  getCustomerEncodingColumn(generateSyntheticCustomerRows(rows), name);

describe('compareSegmentValues and detectColumnOrder', () => {
  it('orders numbers numerically and strings by code unit', () => {
    expect(compareSegmentValues(2, 10)).toBe(-1);
    expect(compareSegmentValues(10, 2)).toBe(1);
    expect(compareSegmentValues(3, 3)).toBe(0);
    expect(compareSegmentValues('2024-01-02', '2024-01-10')).toBe(-1); // ISO dates sort chronologically
    expect(compareSegmentValues('b', 'a')).toBe(1);
  });

  it('detects empty, constant, ascending, descending and unordered columns', () => {
    expect(detectColumnOrder([])).toBe('EMPTY');
    expect(detectColumnOrder([null, null])).toBe('EMPTY');
    expect(detectColumnOrder([5, 5, null, 5])).toBe('CONSTANT');
    expect(detectColumnOrder([1, 2, 2, 3])).toBe('ASCENDING');
    expect(detectColumnOrder([3, 2, 2, 1])).toBe('DESCENDING');
    expect(detectColumnOrder([1, 3, 2])).toBe('UNORDERED');
  });

  it('ignores nulls when detecting order', () => {
    expect(detectColumnOrder([1, null, 2, null, 3])).toBe('ASCENDING');
    expect(detectColumnOrder(['2024-01-01', null, '2024-03-01'])).toBe('ASCENDING');
  });
});

describe('generateSegments: ordered column', () => {
  const result = generateSegments(ints([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 4);

  it('splits into segments with a shorter final segment and correct boundaries', () => {
    expect(result.segments.map((s) => s.rowCount)).toEqual([4, 4, 2]);
    expect(result.segments.map((s) => [s.startRowIndex, s.endRowIndex])).toEqual([
      [0, 4],
      [4, 8],
      [8, 10],
    ]);
    expect(result.segments.map((s) => s.isPartial)).toEqual([false, false, true]);
    expect(result.totalRows).toBe(10);
    expect(result.segmentRowCount).toBe(4);
  });

  it('computes real statistics from the values in each segment', () => {
    const first = result.segments[0].statistics;
    expect(first.minValue).toBe(1);
    expect(first.maxValue).toBe(4);
    expect(first.distinctCount).toBe(4);
    expect(first.nullCount).toBe(0);
    expect(first.averageValue).toBe(2.5);
    expect(first.standardDeviation).toBeCloseTo(Math.sqrt(1.25), 10);
    expect(result.segments[2].statistics.minValue).toBe(9);
    expect(result.segments[2].statistics.maxValue).toBe(10);
  });

  it('applies the shared-dictionary size model', () => {
    expect(result.dictionary.cardinality).toBe(10);
    expect(result.dictionary.bitsPerId).toBe(4); // 10 distinct values
    expect(result.dictionary.bytes).toBe(80); // 10 numbers * 8 bytes
    expect(result.segments[0].dataBytes).toBe(2); // 4 rows * 4 bits
    expect(result.segments[2].dataBytes).toBe(1); // 2 rows * 4 bits = 8 bits
    expect(result.segments[0].size).toBe(2 + MODELLED_SEGMENT_METADATA_BYTES);
    expect(result.totals).toEqual({
      dataBytes: 5,
      metadataBytes: 3 * MODELLED_SEGMENT_METADATA_BYTES,
      dictionaryBytes: 80,
      totalBytes: 5 + 192 + 80,
    });
  });

  it('reports that no segment ranges overlap and the column was already ascending', () => {
    expect(result.loadedOrder).toBe('ASCENDING');
    expect(result.segmentedOrder).toBe('ASCENDING');
    expect(result.overlappingSegmentCount).toBe(0);
    expect(result.segments.every((s) => !s.rangeOverlapsAnotherSegment)).toBe(true);
  });
});

describe('generateSegments: unordered column and the sort option', () => {
  const values = [5, 1, 9, 3, 7, 2, 8, 4];

  it('shows overlapping ranges when values are not in order', () => {
    const result = generateSegments(ints(values), 4);
    expect(result.loadedOrder).toBe('UNORDERED');
    expect(result.segments[0].statistics).toMatchObject({ minValue: 1, maxValue: 9 });
    expect(result.segments[1].statistics).toMatchObject({ minValue: 2, maxValue: 8 });
    expect(result.overlappingSegmentCount).toBe(2);
  });

  it('removes the overlap when rows are sorted by the column, without mutating the input', () => {
    const column = ints(values);
    const result = generateSegments(column, 4, { rowOrder: 'SORTED_ASCENDING' });
    expect(result.rowOrder).toBe('SORTED_ASCENDING');
    expect(result.loadedOrder).toBe('UNORDERED');
    expect(result.segmentedOrder).toBe('ASCENDING');
    expect(result.segments[0].statistics).toMatchObject({ minValue: 1, maxValue: 4 });
    expect(result.segments[1].statistics).toMatchObject({ minValue: 5, maxValue: 9 });
    expect(result.overlappingSegmentCount).toBe(0);
    expect(column.values).toEqual(values);
  });

  it('puts nulls last when sorting', () => {
    const result = generateSegments(ints([3, null, 1, null, 2]), 2, { rowOrder: 'SORTED_ASCENDING' });
    expect(result.segments.map((s) => s.statistics.nullCount)).toEqual([0, 1, 1]);
    expect(result.segments[0].statistics).toMatchObject({ minValue: 1, maxValue: 2 });
  });
});

describe('overlap detection', () => {
  const flags = (values: number[], size: number): boolean[] =>
    generateSegments(ints(values), size).segments.map((s) => s.rangeOverlapsAnotherSegment);

  it('treats ranges that share a boundary value as overlapping', () => {
    expect(flags([1, 2, 3, 3, 4, 5], 3)).toEqual([true, true]);
  });

  it('flags every segment a wide range intersects, not just its neighbour', () => {
    // [0,100], [10,20], [30,40]: the wide first range overlaps both of the others.
    expect(flags([0, 100, 10, 20, 30, 40], 2)).toEqual([true, true, true]);
  });

  it('does not flag disjoint ranges', () => {
    expect(flags([0, 1, 5, 6, 10, 11], 2)).toEqual([false, false, false]);
  });

  it('flags a segment that only overlaps a later segment', () => {
    expect(flags([0, 50, 40, 60, 100, 101], 2)).toEqual([true, true, false]);
  });
});

describe('nulls', () => {
  it('counts nulls, ignores them in min/max and reserves one dictionary ID for them', () => {
    const result = generateSegments(ints([1, null, 3, null]), 2);
    expect(result.nullCount).toBe(2);
    expect(result.segments.map((s) => s.statistics.nullCount)).toEqual([1, 1]);
    expect(result.segments[0].statistics).toMatchObject({ minValue: 1, maxValue: 1, distinctCount: 1 });
    expect(result.dictionary).toMatchObject({ cardinality: 2, hasNullEntry: true, entryCount: 3, bitsPerId: 2, bytes: 16 });
  });

  it('reports min and max as null for an all-null segment and never flags it as overlapping', () => {
    const result = generateSegments(ints([null, null, 1, 2]), 2);
    const empty = result.segments[0];
    expect(empty.statistics.minValue).toBeNull();
    expect(empty.statistics.maxValue).toBeNull();
    expect(empty.statistics.distinctCount).toBe(0);
    expect(empty.statistics.averageValue).toBeUndefined();
    expect(empty.dictionaryCoverage).toBe(0);
    expect(empty.rangeOverlapsAnotherSegment).toBe(false);
  });

  it('handles a column that is entirely null', () => {
    const result = generateSegments(ints([null, null, null]), 2);
    expect(result.loadedOrder).toBe('EMPTY');
    expect(result.dictionary).toMatchObject({ cardinality: 0, hasNullEntry: true, entryCount: 1, bytes: 0 });
    expect(result.overlappingSegmentCount).toBe(0);
    expect(result.segments).toHaveLength(2);
  });

  it('applyNullPattern is deterministic, non-mutating and keeps non-null values', () => {
    const column = customer('Revenue', 2000);
    const a = applyNullPattern(column, 25);
    const b = applyNullPattern(column, 25);
    expect(a.values).toEqual(b.values);
    expect(column.values.every((v) => v !== null)).toBe(true);
    a.values.forEach((v, i) => {
      if (v !== null) expect(v).toBe(column.values[i]);
    });
    const share = a.values.filter((v) => v === null).length / a.values.length;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.35);
  });

  it('applyNullPattern handles 0 and 100 percent and rejects bad input', () => {
    const column = customer('CustomerID', 200);
    expect(applyNullPattern(column, 0).values.some((v) => v === null)).toBe(false);
    expect(applyNullPattern(column, 100).values.every((v) => v === null)).toBe(true);
    expect(() => applyNullPattern(column, -1)).toThrow(RangeError);
    expect(() => applyNullPattern(column, 101)).toThrow(RangeError);
    expect(() => applyNullPattern(column, Number.NaN)).toThrow(RangeError);
  });
});

describe('boundary conditions', () => {
  it('handles an empty dataset without NaN or division by zero', () => {
    const result = generateSegments(ints([]), 100);
    expect(result.totalRows).toBe(0);
    expect(result.segments).toEqual([]);
    expect(result.averageSegmentBytes).toBe(0);
    expect(result.overlappingSegmentCount).toBe(0);
    expect(result.totals.totalBytes).toBe(0);
    expect(result.loadedOrder).toBe('EMPTY');
    expect(explainSegmentResult(result)).toEqual(['There are no rows, so there are no segments and nothing to compare.']);
  });

  it('makes one segment when the segment size is larger than the data', () => {
    const result = generateSegments(ints([1, 2, 3]), 10);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].rowCount).toBe(3);
    expect(result.segments[0].isPartial).toBe(true);
  });

  it('makes one full segment when the segment size equals the row count', () => {
    const result = generateSegments(ints([1, 2, 3]), 3);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].isPartial).toBe(false);
  });

  it('makes one segment per row at segment size 1', () => {
    const result = generateSegments(ints([4, 5, 6]), 1);
    expect(result.segments.map((s) => s.rowCount)).toEqual([1, 1, 1]);
  });

  it('has no partial segment when the rows divide evenly', () => {
    const result = generateSegments(ints([1, 2, 3, 4, 5, 6]), 3);
    expect(result.segments.every((s) => !s.isPartial)).toBe(true);
  });

  it('rejects segment sizes that are not whole numbers of at least 1', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Infinity]) {
      expect(() => generateSegments(ints([1, 2]), bad)).toThrow(RangeError);
    }
  });

  it('segments cover every row exactly once, in order', () => {
    const result = generateSegments(ints(Array.from({ length: 103 }, (_, i) => i)), 10);
    expect(result.segments.reduce((sum, s) => sum + s.rowCount, 0)).toBe(103);
    result.segments.forEach((segment, i) => {
      expect(segment.startRowIndex).toBe(i === 0 ? 0 : result.segments[i - 1].endRowIndex);
    });
  });
});

describe('data types', () => {
  it('computes text min and max by code unit and no average', () => {
    const column: SegmentColumn = { name: 'T', sourceType: 'utf8', dataType: 'TEXT', scale: 0, values: ['pear', 'apple', 'fig'] };
    const result = generateSegments(column, 3);
    expect(result.segments[0].statistics).toMatchObject({ minValue: 'apple', maxValue: 'pear', distinctCount: 3 });
    expect(result.segments[0].statistics.averageValue).toBeUndefined();
    expect(result.dictionary.bytes).toBe(4 + 4 + 5 + 4 + 3 + 4); // UTF-8 bytes + 4-byte prefix each
  });

  it('keeps ISO date min and max chronological, sizes dates as numbers and gives no average', () => {
    const column: SegmentColumn = {
      name: 'D',
      sourceType: 'date',
      dataType: 'DATE',
      scale: 0,
      values: ['2024-03-01', '2023-12-31', '2024-01-15'],
    };
    const result = generateSegments(column, 3);
    expect(result.segments[0].statistics).toMatchObject({ minValue: '2023-12-31', maxValue: '2024-03-01' });
    expect(result.segments[0].statistics.averageValue).toBeUndefined();
    expect(result.dictionary.bytes).toBe(3 * 8);
  });

  it('gives an average for decimals', () => {
    const column: SegmentColumn = { name: 'M', sourceType: 'decimal(18,2)', dataType: 'DECIMAL', scale: 2, values: [1.5, 2.5] };
    expect(generateSegments(column, 2).segments[0].statistics.averageValue).toBe(2);
  });
});

describe('shared dictionary', () => {
  const column = toSegmentColumn(customer('Region', 1000));

  it('uses one dictionary for every segment', () => {
    const result = generateSegments(column, 250);
    expect(result.segments.every((s) => s.dictionaryId === 0)).toBe(true);
    expect(result.segments.every((s) => s.bitsPerId === result.dictionary.bitsPerId)).toBe(true);
    for (const segment of result.segments) {
      expect(segment.dictionaryEntriesReferenced).toBeLessThanOrEqual(result.dictionary.cardinality);
      expect(segment.dictionaryCoverage).toBeGreaterThan(0);
      expect(segment.dictionaryCoverage).toBeLessThanOrEqual(1);
    }
  });

  it('counts the dictionary once, however many segments there are', () => {
    const few = generateSegments(column, 500);
    const many = generateSegments(column, 50);
    expect(many.dictionary).toEqual(few.dictionary);
    expect(many.totals.dictionaryBytes).toBe(few.totals.dictionaryBytes);
    expect(many.totals.metadataBytes).toBeGreaterThan(few.totals.metadataBytes);
    expect(many.segments.length).toBeGreaterThan(few.segments.length);
  });

  it('does not change the column dictionary when rows are sorted', () => {
    const loaded = generateSegments(column, 250);
    const sorted = generateSegments(column, 250, { rowOrder: 'SORTED_ASCENDING' });
    expect(sorted.dictionary).toEqual(loaded.dictionary);
  });
});

describe('shared Customer dataset', () => {
  it('shows an ordered key with no overlapping ranges and exact boundaries', () => {
    const result = generateSegments(toSegmentColumn(customer('CustomerID', 1000)), 250);
    expect(result.loadedOrder).toBe('ASCENDING');
    expect(result.segments.map((s) => [s.statistics.minValue, s.statistics.maxValue])).toEqual([
      [1, 250],
      [251, 500],
      [501, 750],
      [751, 1000],
    ]);
    expect(result.overlappingSegmentCount).toBe(0);
  });

  it('shows unordered columns whose segment ranges all overlap', () => {
    for (const name of ['LastPurchaseDate', 'Revenue']) {
      const result = generateSegments(toSegmentColumn(customer(name, 1000)), 250);
      expect(result.loadedOrder).toBe('UNORDERED');
      expect(result.overlappingSegmentCount).toBe(result.segments.length);
    }
  });

  it('sorting an unordered column can only leave overlaps at shared boundary values', () => {
    const result = generateSegments(toSegmentColumn(customer('Revenue', 1000)), 250, { rowOrder: 'SORTED_ASCENDING' });
    expect(result.segmentedOrder).toBe('ASCENDING');
    expect(result.overlappingSegmentCount).toBeLessThanOrEqual(2 * (result.segments.length - 1));
    const withoutSort = generateSegments(toSegmentColumn(customer('Revenue', 1000)), 250);
    expect(result.overlappingSegmentCount).toBeLessThanOrEqual(withoutSort.overlappingSegmentCount);
  });

  it('is deterministic', () => {
    const a = generateSegments(applyNullPattern(customer('Revenue', 500), 10), 100);
    const b = generateSegments(applyNullPattern(customer('Revenue', 500), 10), 100);
    expect(a).toEqual(b);
  });

  describe('claims made by the page examples', () => {
    const spanDays = (min: unknown, max: unknown): number =>
      isoDateToDayNumber(max as string) - isoDateToDayNumber(min as string);

    it('LastPurchaseDate: unsorted segments span nearly the whole two years; sorted ones narrow but may touch', () => {
      const column = toSegmentColumn(customer('LastPurchaseDate', 1000));
      const loaded = generateSegments(column, 250);
      expect(loaded.segments.every((s) => spanDays(s.statistics.minValue, s.statistics.maxValue) > 600)).toBe(true);

      const sorted = generateSegments(column, 250, { rowOrder: 'SORTED_ASCENDING' });
      expect(sorted.segments.every((s) => spanDays(s.statistics.minValue, s.statistics.maxValue) < 250)).toBe(true);
      // Shared boundary dates still count as overlap, so the count is not necessarily zero.
      expect(sorted.overlappingSegmentCount).toBeLessThanOrEqual(sorted.segments.length);
    });

    it('Region: every segment uses all five entries as loaded, and fewer when sorted', () => {
      const column = toSegmentColumn(customer('Region', 1000));
      const loaded = generateSegments(column, 50);
      expect(loaded.dictionary.cardinality).toBe(5);
      expect(loaded.segments.every((s) => s.dictionaryEntriesReferenced === 5)).toBe(true);

      const sorted = generateSegments(column, 50, { rowOrder: 'SORTED_ASCENDING' });
      expect(sorted.segments.every((s) => s.dictionaryEntriesReferenced <= 2)).toBe(true);
    });

    it('Revenue with 10% nulls: null counts differ between segments and the dictionary gains one reserved entry', () => {
      const plain = generateSegments(toSegmentColumn(customer('Revenue', 1000)), 250);
      const withNulls = generateSegments(applyNullPattern(customer('Revenue', 1000), 10), 250);
      const counts = withNulls.segments.map((s) => s.statistics.nullCount);
      expect(new Set(counts).size).toBeGreaterThan(1);
      expect(withNulls.dictionary.hasNullEntry).toBe(true);
      expect(withNulls.dictionary.entryCount).toBe(withNulls.dictionary.cardinality + 1);
      expect(plain.dictionary.hasNullEntry).toBe(false);
    });
  });

  it('does not mutate the input column', () => {
    const column = toSegmentColumn(customer('Region', 300));
    const before = column.values.slice();
    generateSegments(column, 50, { rowOrder: 'SORTED_ASCENDING' });
    expect(column.values).toEqual(before);
  });
});

describe('explanations and sources', () => {
  it('labels segment size as an educational setting and describes overlap with a pointer to Module 4', () => {
    const unordered = explainSegmentResult(generateSegments(toSegmentColumn(customer('Revenue', 1000)), 250)).join(' ');
    expect(unordered).toMatch(/educational setting, not an engine limit/);
    expect(unordered).toMatch(/overlaps another segment's range/);
    expect(unordered).toMatch(/see Module 4/);
  });

  it('says no ranges overlap for an ordered key, and mentions nulls when present', () => {
    const ordered = explainSegmentResult(generateSegments(toSegmentColumn(customer('CustomerID', 1000)), 250)).join(' ');
    expect(ordered).toMatch(/No segment has a min-max range that overlaps/);
    const withNulls = explainSegmentResult(generateSegments(applyNullPattern(customer('Revenue', 500), 20), 100)).join(' ');
    expect(withNulls).toMatch(/null row\(s\) use one reserved ID/);
  });

  it('does not present simulated metadata as engine behaviour', () => {
    const text = explainSegmentResult(generateSegments(toSegmentColumn(customer('Region', 500)), 100)).join(' ');
    expect(text).not.toMatch(/VertiPaq (uses|stores|splits)|the engine (uses|stores|splits)/i);
  });

  it('cites verified Microsoft Learn and Parquet pages over https', () => {
    const sources = getSegmentSourceReferences();
    expect(sources.every((s) => s.url.startsWith('https://'))).toBe(true);
    expect(sources.some((s) => s.url.includes('info-storagetablecolumnsegments-function-dax'))).toBe(true);
    expect(sources.some((s) => s.url.includes('/fabric/fundamentals/direct-lake-overview'))).toBe(true);
  });
});
