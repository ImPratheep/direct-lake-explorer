import { describe, expect, it } from 'vitest';
import { EliminationOperator, EliminationPredicate, EliminationReasonCode, EncodingDataType, Segment } from '../../types';
import {
  buildEliminationRangeChart,
  ELIMINATION_OPERATORS,
  evaluateSegmentElimination,
  explainEliminationResult,
  formatEliminationPredicate,
  formatEliminationValue,
  getEliminationSourceReferences,
  validateEliminationPredicate,
} from '../stage6-elimination-simulator';
import { applyNullPattern, generateSegments, toSegmentColumn } from '../stage6-segment-simulator';
import { generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../stage6-synthetic-dataset';

// A hand-made segment with exactly the metadata Module 3 produces.
const seg = (
  id: number,
  min: number | string | null,
  max: number | string | null,
  rows = 10,
  nulls = 0,
): Segment => ({
  segmentId: id,
  startRowIndex: id * rows,
  endRowIndex: (id + 1) * rows,
  rowCount: rows,
  size: 0,
  statistics: { minValue: min, maxValue: max, distinctCount: 0, nullCount: nulls },
});

const num = (operator: EliminationOperator, value: number, upperValue?: number): EliminationPredicate => ({
  operator,
  value,
  upperValue,
});

const run = (segments: Segment[], predicate: EliminationPredicate, dataType: EncodingDataType = 'INTEGER') =>
  evaluateSegmentElimination(segments, predicate, { columnName: 'Col', dataType });

type Expectation = 'OUTSIDE_RANGE' | 'RANGE_OVERLAPS' | 'RANGE_SATISFIES' | 'ALL_EQUAL_EXCLUDED';

// The segment range used below is [10, 20].
const BOUNDARY_CASES: Array<[string, EliminationPredicate, Expectation]> = [
  // GT: eliminated when max <= value
  ['GT 20 (equals max)', num('GT', 20), 'OUTSIDE_RANGE'],
  ['GT 25 (above max)', num('GT', 25), 'OUTSIDE_RANGE'],
  ['GT 19 (just below max)', num('GT', 19), 'RANGE_OVERLAPS'],
  ['GT 10 (equals min)', num('GT', 10), 'RANGE_OVERLAPS'],
  ['GT 9 (just below min)', num('GT', 9), 'RANGE_SATISFIES'],
  // GTE: eliminated when max < value
  ['GTE 21 (just above max)', num('GTE', 21), 'OUTSIDE_RANGE'],
  ['GTE 20 (equals max)', num('GTE', 20), 'RANGE_OVERLAPS'],
  ['GTE 11', num('GTE', 11), 'RANGE_OVERLAPS'],
  ['GTE 10 (equals min)', num('GTE', 10), 'RANGE_SATISFIES'],
  ['GTE 5', num('GTE', 5), 'RANGE_SATISFIES'],
  // LT: eliminated when min >= value
  ['LT 10 (equals min)', num('LT', 10), 'OUTSIDE_RANGE'],
  ['LT 5', num('LT', 5), 'OUTSIDE_RANGE'],
  ['LT 11 (just above min)', num('LT', 11), 'RANGE_OVERLAPS'],
  ['LT 20 (equals max)', num('LT', 20), 'RANGE_OVERLAPS'],
  ['LT 21 (just above max)', num('LT', 21), 'RANGE_SATISFIES'],
  // LTE: eliminated when min > value
  ['LTE 9 (just below min)', num('LTE', 9), 'OUTSIDE_RANGE'],
  ['LTE 10 (equals min)', num('LTE', 10), 'RANGE_OVERLAPS'],
  ['LTE 19', num('LTE', 19), 'RANGE_OVERLAPS'],
  ['LTE 20 (equals max)', num('LTE', 20), 'RANGE_SATISFIES'],
  // EQ: eliminated when the value is outside [min, max]
  ['EQ 9', num('EQ', 9), 'OUTSIDE_RANGE'],
  ['EQ 21', num('EQ', 21), 'OUTSIDE_RANGE'],
  ['EQ 10 (equals min)', num('EQ', 10), 'RANGE_OVERLAPS'],
  ['EQ 15', num('EQ', 15), 'RANGE_OVERLAPS'],
  ['EQ 20 (equals max)', num('EQ', 20), 'RANGE_OVERLAPS'],
  // NEQ: a [10,20] range always holds some other value
  ['NEQ 10', num('NEQ', 10), 'RANGE_OVERLAPS'],
  ['NEQ 15', num('NEQ', 15), 'RANGE_OVERLAPS'],
  ['NEQ 20', num('NEQ', 20), 'RANGE_OVERLAPS'],
  ['NEQ 9 (below range)', num('NEQ', 9), 'RANGE_SATISFIES'],
  ['NEQ 25 (above range)', num('NEQ', 25), 'RANGE_SATISFIES'],
  // BETWEEN (inclusive)
  ['BETWEEN 1..9', num('BETWEEN', 1, 9), 'OUTSIDE_RANGE'],
  ['BETWEEN 21..30', num('BETWEEN', 21, 30), 'OUTSIDE_RANGE'],
  ['BETWEEN 1..10 (touches min)', num('BETWEEN', 1, 10), 'RANGE_OVERLAPS'],
  ['BETWEEN 20..30 (touches max)', num('BETWEEN', 20, 30), 'RANGE_OVERLAPS'],
  ['BETWEEN 12..18 (inside)', num('BETWEEN', 12, 18), 'RANGE_OVERLAPS'],
  ['BETWEEN 10..20 (equals range)', num('BETWEEN', 10, 20), 'RANGE_SATISFIES'],
  ['BETWEEN 5..25 (contains range)', num('BETWEEN', 5, 25), 'RANGE_SATISFIES'],
];

describe('operator rules and boundary equality on a [10, 20] segment', () => {
  it.each(BOUNDARY_CASES)('%s', (_label, predicate, expected) => {
    const result = run([seg(0, 10, 20)], predicate);
    expect(result.segments[0].reasonCode).toBe(expected);
    expect(result.segments[0].decision).toBe(expected === 'OUTSIDE_RANGE' ? 'ELIMINATED' : 'SCANNED');
  });
});

describe('single-value segments', () => {
  it('EQ keeps a segment whose only value equals the filter and counts it as fully satisfied', () => {
    expect(run([seg(0, 10, 10)], num('EQ', 10)).segments[0].reasonCode).toBe('RANGE_SATISFIES');
    expect(run([seg(0, 10, 10)], num('EQ', 11)).segments[0].reasonCode).toBe('OUTSIDE_RANGE');
  });

  it('NEQ eliminates a segment only when every value equals the excluded value', () => {
    expect(run([seg(0, 10, 10)], num('NEQ', 10)).segments[0].reasonCode).toBe('ALL_EQUAL_EXCLUDED');
    expect(run([seg(0, 10, 10)], num('NEQ', 11)).segments[0].reasonCode).toBe('RANGE_SATISFIES');
  });

  it('applies strict and non-strict comparisons correctly to a single value', () => {
    expect(run([seg(0, 10, 10)], num('GT', 10)).segments[0].decision).toBe('ELIMINATED');
    expect(run([seg(0, 10, 10)], num('GTE', 10)).segments[0].decision).toBe('SCANNED');
    expect(run([seg(0, 10, 10)], num('LT', 10)).segments[0].decision).toBe('ELIMINATED');
    expect(run([seg(0, 10, 10)], num('LTE', 10)).segments[0].decision).toBe('SCANNED');
  });
});

describe('BETWEEN edge cases', () => {
  it('BETWEEN with equal bounds behaves like equality', () => {
    const between = run([seg(0, 10, 20), seg(1, 30, 40)], num('BETWEEN', 15, 15));
    const equal = run([seg(0, 10, 20), seg(1, 30, 40)], num('EQ', 15));
    expect(between.segments.map((s) => s.decision)).toEqual(equal.segments.map((s) => s.decision));
  });

  it('eliminates every segment, with a clear reason, when the lower bound is above the upper bound', () => {
    const result = run([seg(0, 1, 5), seg(1, 6, 10)], num('BETWEEN', 9, 3));
    expect(result.segmentsEliminated).toBe(2);
    expect(result.segments.every((s) => s.reasonCode === 'EMPTY_PREDICATE')).toBe(true);
    expect(result.segments[0].reason).toMatch(/lower bound 9 is above the upper bound 3/);
  });
});

describe('overlapping and unordered segment ranges', () => {
  // Wide overlapping ranges, as produced by an unordered column.
  const unordered = [seg(0, 1, 100), seg(1, 5, 95), seg(2, 2, 98), seg(3, 3, 99)];

  it('scans every segment whose range overlaps the predicate, even when most values would not match', () => {
    const result = run(unordered, num('GT', 90));
    expect(result.segmentsScanned).toBe(4);
    expect(result.segmentsEliminated).toBe(0);
    expect(result.segments.every((s) => s.reasonCode === 'RANGE_OVERLAPS')).toBe(true);
    expect(result.rowEliminationPercentage).toBe(0);
  });

  it('eliminates only the segments whose range lies wholly outside, regardless of segment order', () => {
    const mixed = [seg(0, 50, 60), seg(1, 1, 100), seg(2, 10, 20), seg(3, 55, 58)];
    const result = run(mixed, num('BETWEEN', 52, 59));
    expect(result.segments.map((s) => s.decision)).toEqual(['SCANNED', 'SCANNED', 'ELIMINATED', 'SCANNED']);
  });

  it('keeps the wide segment but eliminates the narrow ones for a far-out filter', () => {
    const result = run([seg(0, 1, 1000), seg(1, 1, 10), seg(2, 2, 12)], num('GT', 500));
    expect(result.segments.map((s) => s.decision)).toEqual(['SCANNED', 'ELIMINATED', 'ELIMINATED']);
  });
});

describe('nulls', () => {
  it('always eliminates an all-null segment, for every operator', () => {
    const operators: EliminationPredicate[] = [
      num('GT', 5),
      num('GTE', 5),
      num('LT', 5),
      num('LTE', 5),
      num('EQ', 5),
      num('NEQ', 5),
      num('BETWEEN', 1, 9),
    ];
    for (const predicate of operators) {
      const result = run([seg(0, null, null, 10, 10)], predicate);
      expect(result.segments[0].decision).toBe('ELIMINATED');
      expect(result.segments[0].reasonCode).toBe('ALL_NULL');
    }
  });

  it('does not let null rows keep a segment alive when its non-null range is outside the predicate', () => {
    const result = run([seg(0, 10, 20, 10, 4)], num('GT', 50));
    expect(result.segments[0].decision).toBe('ELIMINATED');
    expect(result.segments[0].reason).toMatch(/4 null row\(s\) never match/);
    expect(result.rowsPotentiallyAvoided).toBe(10);
  });

  it('counts null rows inside scanned segments in rows potentially scanned', () => {
    const result = run([seg(0, 10, 20, 10, 4)], num('LT', 50));
    expect(result.segments[0].decision).toBe('SCANNED');
    expect(result.rowsPotentiallyScanned).toBe(10);
    expect(result.nullRowCount).toBe(4);
  });

  it('treats NEQ as never matching nulls: a segment of one value plus nulls is eliminated', () => {
    const result = run([seg(0, 7, 7, 10, 6)], num('NEQ', 7));
    expect(result.segments[0].reasonCode).toBe('ALL_EQUAL_EXCLUDED');
  });

  it('mentions nulls in the explanation only when there are some', () => {
    const none = explainEliminationResult(run([seg(0, 1, 5)], num('GT', 3))).join(' ');
    const some = explainEliminationResult(run([seg(0, 1, 5, 10, 2)], num('GT', 3))).join(' ');
    expect(none).not.toMatch(/null row/);
    expect(some).toMatch(/null row\(s\) never satisfy these comparisons/);
  });
});

describe('dates', () => {
  const dates = [seg(0, '2023-01-01', '2023-06-30'), seg(1, '2023-07-01', '2023-12-31'), seg(2, '2024-01-01', '2024-06-30')];
  const runDates = (predicate: EliminationPredicate) =>
    evaluateSegmentElimination(dates, predicate, { columnName: 'When', dataType: 'DATE' });

  it('compares ISO dates chronologically', () => {
    const result = runDates({ operator: 'GT', value: '2023-09-15' });
    expect(result.segments.map((s) => s.decision)).toEqual(['ELIMINATED', 'SCANNED', 'SCANNED']);
  });

  it('handles equality on the first and last day of a segment', () => {
    expect(runDates({ operator: 'EQ', value: '2023-06-30' }).segments.map((s) => s.decision)).toEqual([
      'SCANNED',
      'ELIMINATED',
      'ELIMINATED',
    ]);
    expect(runDates({ operator: 'EQ', value: '2023-07-01' }).segments.map((s) => s.decision)).toEqual([
      'ELIMINATED',
      'SCANNED',
      'ELIMINATED',
    ]);
  });

  it('handles BETWEEN across a year boundary and GT at an exact max', () => {
    expect(runDates({ operator: 'BETWEEN', value: '2023-12-31', upperValue: '2024-01-01' }).segments.map((s) => s.decision)).toEqual([
      'ELIMINATED',
      'SCANNED',
      'SCANNED',
    ]);
    expect(runDates({ operator: 'GT', value: '2024-06-30' }).segmentsEliminated).toBe(3);
  });

  it('formats dates unchanged in reasons', () => {
    const result = runDates({ operator: 'GT', value: '2023-09-15' });
    expect(result.segments[0].reason).toContain('2023-06-30');
    expect(result.predicateText).toBe('When > 2023-09-15');
  });
});

describe('decimals', () => {
  it('shows values with the column scale in reasons and predicate text', () => {
    const result = evaluateSegmentElimination([seg(0, 10.5, 20.25)], { operator: 'GT', value: 30 }, {
      columnName: 'Revenue',
      dataType: 'DECIMAL',
      scale: 2,
    });
    expect(result.predicateText).toBe('Revenue > 30.00');
    expect(result.segments[0].reason).toContain('20.25');
    expect(result.segments[0].reason).toContain('30.00');
  });
});

describe('predicate validation', () => {
  it('requires the value type to match the column type', () => {
    expect(validateEliminationPredicate({ operator: 'GT', value: '5' }, 'INTEGER')).toMatch(/must be a number/);
    expect(validateEliminationPredicate({ operator: 'GT', value: 5 }, 'DATE')).toMatch(/valid date/);
  });

  it('rejects NaN, infinite values, malformed and impossible dates', () => {
    expect(validateEliminationPredicate({ operator: 'EQ', value: Number.NaN }, 'INTEGER')).not.toBeNull();
    expect(validateEliminationPredicate({ operator: 'EQ', value: Infinity }, 'DECIMAL')).not.toBeNull();
    expect(validateEliminationPredicate({ operator: 'EQ', value: '' }, 'DATE')).not.toBeNull();
    expect(validateEliminationPredicate({ operator: 'EQ', value: '2024-2-3' }, 'DATE')).not.toBeNull();
    expect(validateEliminationPredicate({ operator: 'EQ', value: '2024-02-30' }, 'DATE')).not.toBeNull();
  });

  it('accepts a leap day and valid numbers, including decimals on integer columns', () => {
    expect(validateEliminationPredicate({ operator: 'EQ', value: '2024-02-29' }, 'DATE')).toBeNull();
    expect(validateEliminationPredicate({ operator: 'GT', value: 750.5 }, 'INTEGER')).toBeNull();
  });

  it('requires a valid upper bound for BETWEEN', () => {
    expect(validateEliminationPredicate({ operator: 'BETWEEN', value: 1 }, 'INTEGER')).toMatch(/upper bound/);
    expect(validateEliminationPredicate({ operator: 'BETWEEN', value: 1, upperValue: 2 }, 'INTEGER')).toBeNull();
    expect(validateEliminationPredicate({ operator: 'BETWEEN', value: '2024-01-01', upperValue: 'x' }, 'DATE')).toMatch(/upper bound/);
  });

  it('does not support text columns', () => {
    expect(validateEliminationPredicate({ operator: 'EQ', value: 'a' }, 'TEXT')).toMatch(/Text columns are not supported/);
  });

  it('evaluateSegmentElimination throws RangeError for an invalid predicate', () => {
    expect(() => run([seg(0, 1, 2)], { operator: 'GT', value: Number.NaN })).toThrow(RangeError);
    expect(() => run([seg(0, 1, 2)], { operator: 'EQ', value: 'a' as unknown as number }, 'TEXT')).toThrow(RangeError);
  });
});

describe('empty and degenerate input', () => {
  it('handles no segments without NaN', () => {
    const result = run([], num('GT', 5));
    expect(result.totalSegments).toBe(0);
    expect(result.totalRows).toBe(0);
    expect(result.rowEliminationPercentage).toBe(0);
    expect(result.segmentEliminationPercentage).toBe(0);
    expect(Number.isNaN(result.rowEliminationPercentage)).toBe(false);
    expect(explainEliminationResult(result)).toEqual(['There are no segments, so there is nothing to eliminate or scan.']);
  });

  it('handles an empty dataset produced by Module 3', () => {
    const empty = generateSegments(toSegmentColumn({ name: 'X', sourceType: 'int64', dataType: 'INTEGER', scale: 0, values: [] }), 100);
    const result = run(empty.segments, num('EQ', 1));
    expect(result.totalSegments).toBe(0);
  });

  it('handles a dataset of only nulls from Module 3', () => {
    const allNull = generateSegments({ name: 'X', sourceType: 'int64', dataType: 'INTEGER', scale: 0, values: [null, null, null, null] }, 2);
    const result = run(allNull.segments, num('GTE', 0));
    expect(result.segmentsEliminated).toBe(2);
    expect(result.rowsPotentiallyAvoided).toBe(4);
    expect(result.rowEliminationPercentage).toBe(100);
  });

  it('handles a single segment', () => {
    const result = run([seg(0, 1, 9, 9)], num('GT', 100));
    expect(result.rowEliminationPercentage).toBe(100);
    expect(result.segmentEliminationPercentage).toBe(100);
  });
});

describe('totals and consistency', () => {
  const segments = [seg(0, 1, 10, 10), seg(1, 11, 20, 10), seg(2, 21, 30, 5)];

  it('keeps scanned + eliminated = total and rows scanned + avoided = total rows', () => {
    for (const predicate of [num('GT', 15), num('LT', 15), num('EQ', 25), num('NEQ', 5), num('BETWEEN', 5, 12)]) {
      const r = run(segments, predicate);
      expect(r.segmentsScanned + r.segmentsEliminated).toBe(r.totalSegments);
      expect(r.rowsPotentiallyScanned + r.rowsPotentiallyAvoided).toBe(r.totalRows);
      expect(r.scannedOverlapCount + r.scannedSatisfiedCount).toBe(r.segmentsScanned);
      expect(r.totalRows).toBe(25);
    }
  });

  it('computes row and segment percentages separately', () => {
    const r = run(segments, num('GT', 20)); // eliminates the first two (20 rows), scans the 5-row segment
    expect(r.segmentsEliminated).toBe(2);
    expect(r.rowsPotentiallyAvoided).toBe(20);
    expect(r.rowEliminationPercentage).toBeCloseTo(80, 10);
    expect(r.segmentEliminationPercentage).toBeCloseTo((2 / 3) * 100, 10);
  });

  it('reports one decision and one non-empty reason per segment, in segment order', () => {
    const r = run(segments, num('GT', 15));
    expect(r.segments.map((s) => s.segmentId)).toEqual([0, 1, 2]);
    expect(r.segments.every((s) => s.reason.length > 0)).toBe(true);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(segments);
    run(segments, num('GT', 15));
    expect(JSON.stringify(segments)).toBe(before);
  });
});

describe('wording never claims a scanned segment holds matches', () => {
  const codes = new Set<EliminationReasonCode>();
  const reasons: string[] = [];
  for (const [, predicate] of BOUNDARY_CASES) {
    for (const segment of run([seg(0, 10, 20)], predicate).segments) {
      codes.add(segment.reasonCode);
      if (segment.decision === 'SCANNED') reasons.push(segment.reason);
    }
  }

  it('covers every reason code that can occur for a normal range', () => {
    expect(codes.has('OUTSIDE_RANGE')).toBe(true);
    expect(codes.has('RANGE_OVERLAPS')).toBe(true);
    expect(codes.has('RANGE_SATISFIES')).toBe(true);
  });

  it('says overlapping segments may or may not hold matches', () => {
    const overlapping = run([seg(0, 10, 20)], num('GT', 15)).segments[0].reason;
    expect(overlapping).toMatch(/cannot rule this segment out/);
    expect(overlapping).toMatch(/may or may not hold matching rows/);
  });

  it('never states that a scanned segment contains or has matching rows', () => {
    for (const reason of reasons) {
      expect(reason).not.toMatch(/\bcontains matching\b|\bhas matching\b|\bmust contain\b|\bwill match\b/i);
    }
  });

  it('explanations call elimination a possibility test and never promise a match', () => {
    const lines = explainEliminationResult(run([seg(0, 1, 100), seg(1, 2, 99)], num('GT', 50))).join(' ');
    expect(lines).toMatch(/possibility test/);
    expect(lines).toMatch(/may or may not contain matching rows/);
    expect(lines).toMatch(/never prove a match/);
  });
});

describe('consistency with the Module 3 segment model', () => {
  const column = (name: string) => getCustomerEncodingColumn(generateSyntheticCustomerRows(1000), name);
  const model = (name: string, size: number, rowOrder: 'AS_LOADED' | 'SORTED_ASCENDING' = 'AS_LOADED', nulls = 0) => {
    const col = column(name);
    return {
      col,
      segments: generateSegments(applyNullPattern(col, nulls), size, { rowOrder }),
    };
  };
  const evaluate = (name: string, size: number, predicate: EliminationPredicate, order: 'AS_LOADED' | 'SORTED_ASCENDING' = 'AS_LOADED', nulls = 0) => {
    const { col, segments } = model(name, size, order, nulls);
    return {
      segments,
      result: evaluateSegmentElimination(segments.segments, predicate, { columnName: name, dataType: col.dataType, scale: col.scale }),
    };
  };

  it('uses Module 3 segment boundaries, row counts, min and max exactly', () => {
    const { segments, result } = evaluate('CustomerID', 250, num('GT', 750));
    result.segments.forEach((detail, i) => {
      const source = segments.segments[i];
      expect(detail.segmentId).toBe(source.segmentId);
      expect(detail.startRowIndex).toBe(source.startRowIndex);
      expect(detail.endRowIndex).toBe(source.endRowIndex);
      expect(detail.rowCount).toBe(source.rowCount);
      expect(detail.minValue).toBe(source.statistics.minValue);
      expect(detail.maxValue).toBe(source.statistics.maxValue);
      expect(detail.nullCount).toBe(source.statistics.nullCount);
    });
  });

  it('leaves the Module 3 result unchanged by evaluation', () => {
    const { col, segments } = model('Revenue', 250);
    const before = JSON.stringify(segments);
    evaluateSegmentElimination(segments.segments, num('BETWEEN', 1000, 2000), { columnName: 'Revenue', dataType: col.dataType, scale: col.scale });
    expect(JSON.stringify(segments)).toBe(before);
  });

  it('page example: CustomerID > 750 eliminates 3 of 4 segments and 75% of rows', () => {
    const { result } = evaluate('CustomerID', 250, num('GT', 750));
    expect(result.segmentsEliminated).toBe(3);
    expect(result.segmentsScanned).toBe(1);
    expect(result.rowsPotentiallyAvoided).toBe(750);
    expect(result.rowEliminationPercentage).toBe(75);
    expect(result.segments[3].reasonCode).toBe('RANGE_SATISFIES');
  });

  it('page example: CustomerID = 250 keeps only segment 0, and = 251 keeps only segment 1', () => {
    const at250 = evaluate('CustomerID', 250, num('EQ', 250)).result;
    const at251 = evaluate('CustomerID', 250, num('EQ', 251)).result;
    expect(at250.segments.map((s) => s.decision)).toEqual(['SCANNED', 'ELIMINATED', 'ELIMINATED', 'ELIMINATED']);
    expect(at251.segments.map((s) => s.decision)).toEqual(['ELIMINATED', 'SCANNED', 'ELIMINATED', 'ELIMINATED']);
  });

  it('page example: LastPurchaseDate > 2024-06-01 scans all 4 as loaded and eliminates 2 when sorted', () => {
    const predicate: EliminationPredicate = { operator: 'GT', value: '2024-06-01' };
    const loaded = evaluate('LastPurchaseDate', 250, predicate).result;
    expect(loaded.segmentsEliminated).toBe(0);
    expect(loaded.segments.every((s) => s.reasonCode === 'RANGE_OVERLAPS')).toBe(true);

    const sorted = evaluate('LastPurchaseDate', 250, predicate, 'SORTED_ASCENDING').result;
    expect(sorted.segmentsEliminated).toBe(2);
    expect(sorted.segmentsScanned).toBe(2);
  });

  it('page example: Revenue between 1000 and 2000 eliminates none as loaded and 2 of 4 when sorted', () => {
    const predicate = num('BETWEEN', 1000, 2000);
    expect(evaluate('Revenue', 250, predicate).result.segmentsEliminated).toBe(0);
    const sorted = evaluate('Revenue', 250, predicate, 'SORTED_ASCENDING').result;
    expect(sorted.segmentsEliminated).toBe(2);
    expect(sorted.scannedOverlapCount).toBe(2);
  });

  it('only eliminates what the data allows: every eliminated segment truly has no matching value', () => {
    const col = column('Revenue');
    const predicate = num('BETWEEN', 1000, 2000);
    const { result } = evaluate('Revenue', 250, predicate, 'SORTED_ASCENDING');
    const sortedValues = (col.values as number[]).slice().sort((a, b) => a - b);
    result.segments.forEach((detail) => {
      const slice = sortedValues.slice(detail.startRowIndex, detail.endRowIndex);
      const matches = slice.filter((v) => v >= 1000 && v <= 2000).length;
      if (detail.decision === 'ELIMINATED') expect(matches).toBe(0);
    });
  });

  it('never wrongly eliminates a segment that holds a matching value, across all operators and columns', () => {
    const cases: Array<[string, EliminationPredicate]> = [
      ['CustomerID', num('GTE', 500)],
      ['CustomerID', num('LTE', 250)],
      ['CustomerID', num('NEQ', 100)],
      ['Revenue', num('LT', 500)],
      ['Revenue', num('GT', 4000)],
      ['Revenue', num('EQ', 2500)],
      ['LastPurchaseDate', { operator: 'BETWEEN', value: '2023-03-01', upperValue: '2023-04-01' }],
      ['LastPurchaseDate', { operator: 'LT', value: '2023-02-01' }],
    ];
    for (const [name, predicate] of cases) {
      for (const order of ['AS_LOADED', 'SORTED_ASCENDING'] as const) {
        const col = column(name);
        const ordered = order === 'SORTED_ASCENDING' ? (col.values as Array<number | string>).slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) : col.values;
        const { result } = evaluate(name, 100, predicate, order);
        const matches = (v: number | string): boolean => {
          const p = predicate;
          switch (p.operator) {
            case 'GT': return v > (p.value as number | string);
            case 'GTE': return v >= (p.value as number | string);
            case 'LT': return v < (p.value as number | string);
            case 'LTE': return v <= (p.value as number | string);
            case 'EQ': return v === p.value;
            case 'NEQ': return v !== p.value;
            default: return v >= (p.value as number | string) && v <= (p.upperValue as number | string);
          }
        };
        result.segments.forEach((detail) => {
          if (detail.decision === 'ELIMINATED') {
            const rows = ordered.slice(detail.startRowIndex, detail.endRowIndex);
            expect(rows.some(matches)).toBe(false);
          }
        });
      }
    }
  });

  it('handles nulls from the Module 3 null pattern: eliminated segments have no matching non-null value', () => {
    const col = column('CustomerID');
    const withNulls = applyNullPattern(col, 25);
    const segments = generateSegments(withNulls, 100);
    const result = evaluateSegmentElimination(segments.segments, num('GT', 800), { columnName: 'CustomerID', dataType: 'INTEGER' });
    expect(result.nullRowCount).toBe(segments.nullCount);
    result.segments.forEach((detail) => {
      if (detail.decision === 'ELIMINATED') {
        const rows = withNulls.values.slice(detail.startRowIndex, detail.endRowIndex);
        expect(rows.some((v) => v !== null && (v as number) > 800)).toBe(false);
      }
    });
  });

  it('is deterministic', () => {
    const a = evaluate('Revenue', 100, num('GT', 3000), 'AS_LOADED', 10).result;
    const b = evaluate('Revenue', 100, num('GT', 3000), 'AS_LOADED', 10).result;
    expect(a).toEqual(b);
  });
});

describe('formatting helpers and metadata', () => {
  it('formats predicates and values', () => {
    expect(formatEliminationValue(null, 0)).toBe('-');
    expect(formatEliminationValue(5, 2)).toBe('5.00');
    expect(formatEliminationValue('2024-01-01', 0)).toBe('2024-01-01');
    expect(formatEliminationPredicate('A', { operator: 'BETWEEN', value: 1, upperValue: 9 }, 0)).toBe('A BETWEEN 1 AND 9');
    expect(formatEliminationPredicate('A', { operator: 'NEQ', value: 3 }, 0)).toBe('A != 3');
  });

  it('offers all seven operators', () => {
    expect(ELIMINATION_OPERATORS.map((o) => o.value)).toEqual(['GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ', 'BETWEEN']);
  });

  it('cites a verified Microsoft Fabric page and does not present VertiPaq metadata as documented', () => {
    const sources = getEliminationSourceReferences();
    expect(sources.every((s) => s.url.startsWith('https://'))).toBe(true);
    expect(sources.some((s) => s.url.includes('/fabric/data-engineering/delta-lake-file-skipping'))).toBe(true);
    const segmentsSource = sources.find((s) => s.url.includes('info-storagetablecolumnsegments'));
    expect(segmentsSource?.section).toMatch(/does not document min\/max segment metadata/);
  });
});

describe('range chart geometry', () => {
  const segs = [seg(0, 0, 100), seg(1, 100, 200), seg(2, null, null, 10, 10)];
  const chart = (p: EliminationPredicate) => buildEliminationRangeChart(run(segs, p));

  it('maps ranges onto a shared 0-100 axis and leaves all-null segments without a bar', () => {
    const c = chart(num('GT', 150));
    expect(c.hasDomain).toBe(true);
    expect(c.domainMin).toBe(0);
    expect(c.domainMax).toBe(200);
    expect(c.bars[0]).toEqual({ segmentId: 0, leftPct: 0, widthPct: 50 });
    expect(c.bars[1]).toEqual({ segmentId: 1, leftPct: 50, widthPct: 50 });
    expect(c.bars[2]).toBeNull();
  });

  it('draws the accepted region for each operator', () => {
    expect(chart(num('GT', 150)).bands).toEqual([{ leftPct: 75, widthPct: 25 }]);
    expect(chart(num('LTE', 50)).bands).toEqual([{ leftPct: 0, widthPct: 25 }]);
    expect(chart(num('BETWEEN', 50, 150)).bands).toEqual([{ leftPct: 25, widthPct: 50 }]);
    expect(chart(num('EQ', 100)).markerPct).toBe(50);
    expect(chart(num('NEQ', 100)).bands).toEqual([{ leftPct: 0, widthPct: 50 }, { leftPct: 50, widthPct: 50 }]);
  });

  it('clips regions that extend past the data and omits markers outside it', () => {
    expect(chart(num('GT', 500)).bands).toEqual([]);
    expect(chart(num('LT', 500)).bands).toEqual([{ leftPct: 0, widthPct: 100 }]);
    expect(chart(num('GT', -50)).bands).toEqual([{ leftPct: 0, widthPct: 100 }]);
    expect(chart(num('EQ', 500)).markerPct).toBeNull();
  });

  it('draws no band for an empty BETWEEN and handles dates and no data', () => {
    expect(chart(num('BETWEEN', 150, 50)).bands).toEqual([]);
    const dates = buildEliminationRangeChart(
      evaluateSegmentElimination([seg(0, '2024-01-01', '2024-01-11'), seg(1, '2024-01-11', '2024-01-21')], { operator: 'GT', value: '2024-01-16' }, { columnName: 'D', dataType: 'DATE' }),
    );
    expect(dates.bands).toEqual([{ leftPct: 75, widthPct: 25 }]);
    const none = buildEliminationRangeChart(run([], num('GT', 1)));
    expect(none.hasDomain).toBe(false);
    expect(none.bars).toEqual([]);
  });

  it('gives a single-value domain a visible bar', () => {
    const c = buildEliminationRangeChart(run([seg(0, 5, 5)], num('EQ', 5)));
    expect(c.bars[0]?.widthPct).toBeGreaterThan(0);
    expect(c.markerPct).toBe(50);
  });
});
