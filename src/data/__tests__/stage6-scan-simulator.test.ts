import { afterEach, describe, expect, it, vi } from 'vitest';
import { AggregationFunction, EliminationPredicate, LoadingSession, LoadingSettings, ScanQuery, SegmentColumn } from '../../types';
import { createLoadingSession, DEFAULT_LOADING_SETTINGS, finishLoading, requestLoad, summarizeMemory } from '../stage6-loading-simulator';
import { evictColumns, snapshotMemory } from '../stage6-memory-simulator';
import { applyNullPattern, generateSegments, sortedRowOrder } from '../stage6-segment-simulator';
import { evaluateSegmentElimination } from '../stage6-elimination-simulator';
import { CUSTOMER_COLUMNS, generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../stage6-synthetic-dataset';
import * as draftModule from '../stage6-vertipaq-simulator';
import {
  allowedAggregations,
  compareRowOrders,
  computeScanData,
  describeConceptualRequest,
  explainScan,
  getScanSourceReferences,
  predicateMatches,
  requiredColumnsFor,
  runScanScenario,
  runStorageScan,
  SCAN_SCENARIOS,
  validateScanQuery,
} from '../stage6-scan-simulator';

const settings = (changes: Partial<LoadingSettings> = {}): LoadingSettings => ({ ...DEFAULT_LOADING_SETTINGS, ...changes });
const session = (changes: Partial<LoadingSettings> = {}): LoadingSession => createLoadingSession(settings(changes));
const query = (
  aggregation: AggregationFunction,
  measureColumn: string,
  filter: ScanQuery['filter'] = null,
  rowOrder: ScanQuery['rowOrder'] = 'AS_LOADED',
): ScanQuery => ({ aggregation, measureColumn, filter, rowOrder });
const filterOn = (columnName: string, predicate: EliminationPredicate): ScanQuery['filter'] => ({ columnName, predicate });
const between = (lower: number | string, upper: number | string): EliminationPredicate => ({ operator: 'BETWEEN', value: lower, upperValue: upper });
const ids = (details: Array<{ segmentId: number }>): number[] => details.map((d) => d.segmentId);
const types = (s: LoadingSession): string[] => s.events.map((e) => e.type);

afterEach(() => {
  vi.restoreAllMocks();
});

// ---- Independent brute-force reference over the whole table (no segments, no elimination) ----
function holds(value: number | string | null, p: EliminationPredicate): boolean {
  if (value === null) return false;
  const v = value as never as number;
  const a = p.value as number;
  const b = p.upperValue as number;
  switch (p.operator) {
    case 'EQ': return v === a;
    case 'NEQ': return v !== a;
    case 'GT': return v > a;
    case 'GTE': return v >= a;
    case 'LT': return v < a;
    case 'LTE': return v <= a;
    default: return v >= a && v <= b;
  }
}

function reference(s: LoadingSettings, q: ScanQuery): { matching: number; inputs: Array<number | string> } {
  const rows = generateSyntheticCustomerRows(s.rowCount);
  const col = (name: string): SegmentColumn => applyNullPattern(getCustomerEncodingColumn(rows, name), s.nullPercent);
  const measure = col(q.measureColumn);
  const filter = q.filter ? col(q.filter.columnName) : null;
  let matching = 0;
  const inputs: Array<number | string> = [];
  for (let i = 0; i < measure.values.length; i++) {
    if (filter && q.filter && !holds(filter.values[i], q.filter.predicate)) continue;
    matching++;
    const value = measure.values[i];
    if (value !== null) inputs.push(value);
  }
  return { matching, inputs };
}

function expectedAggregate(fn: AggregationFunction, scale: number, inputs: Array<number | string>): number | string | null {
  if (fn === 'COUNT') return inputs.length;
  if (inputs.length === 0) return null;
  if (fn === 'MIN') return inputs.reduce((a, b) => (b < a ? b : a));
  if (fn === 'MAX') return inputs.reduce((a, b) => (b > a ? b : a));
  const cents = (inputs as number[]).reduce((sum, v) => sum + Math.round(v * 10 ** scale), 0);
  return fn === 'SUM' ? cents / 10 ** scale : cents / 10 ** scale / inputs.length;
}

describe('draft removal', () => {
  it('no longer exports the defective draft scan', () => {
    expect('simulateStorageEngineScan' in draftModule).toBe(false);
  });
});

describe('candidate segment selection (regression: never "the first N segments")', () => {
  const small = settings({ rowCount: 1000, segmentRowCount: 100 });
  const q = query('SUM', 'Revenue', filterOn('CustomerID', between(450, 520)));

  it('selects exactly the segments Module 4 leaves, here 4 and 5, and reads only their rows', () => {
    const data = computeScanData(small, q);
    const candidates = data.segments.filter((s) => s.decision === 'CANDIDATE');
    expect(ids(candidates)).toEqual([4, 5]);
    expect(data.candidateSegments).toBe(2);
    expect(data.eliminatedSegments).toBe(8);
    expect(data.rowsInCandidateSegments).toBe(200);
    expect(data.matchingRows).toBe(71); // CustomerID 450..520
    for (const segment of data.segments) {
      expect(segment.rowsRead).toBe(segment.decision === 'CANDIDATE' ? 100 : 0);
    }
  });

  it('a first-N implementation would fail: candidates are not segments 0 and 1', () => {
    const data = computeScanData(small, q);
    const firstTwo = data.segments.slice(0, 2);
    expect(firstTwo.every((s) => s.decision === 'ELIMINATED')).toBe(true);
    // Scanning only segments 0 and 1 could never find these 71 rows.
    expect(firstTwo.reduce((sum, s) => sum + s.matchingRows, 0)).toBe(0);
    expect(data.matchingRows).toBeGreaterThan(0);
  });

  it('when only the last segment survives, the scan reads the last segment', () => {
    const data = computeScanData(settings({ rowCount: 1000, segmentRowCount: 500 }), query('COUNT', 'Revenue', filterOn('CustomerID', { operator: 'GT', value: 600 })));
    expect(ids(data.segments.filter((s) => s.decision === 'CANDIDATE'))).toEqual([1]);
    expect(data.matchingRows).toBe(400);
    expect(data.segments[0].rowsRead).toBe(0);
  });
});

describe('Module 3 and Module 4 integration', () => {
  it('uses the Module 4 result for the same Module 3 segments, unchanged', () => {
    const s = settings({ rowCount: 1000, segmentRowCount: 100 });
    const predicate = between(450, 520);
    const data = computeScanData(s, query('SUM', 'Revenue', filterOn('CustomerID', predicate)));

    const rows = generateSyntheticCustomerRows(1000);
    const column = applyNullPattern(getCustomerEncodingColumn(rows, 'CustomerID'), 0);
    const direct = evaluateSegmentElimination(generateSegments(column, 100).segments, predicate, { columnName: 'CustomerID', dataType: 'INTEGER', scale: 0 });
    expect(data.elimination.available).toBe(true);
    expect(data.elimination.result).toEqual(direct);
    expect(data.segments.map((d) => d.decision)).toEqual(direct.segments.map((d) => (d.decision === 'ELIMINATED' ? 'ELIMINATED' : 'CANDIDATE')));
  });

  it('segment boundaries and row counts come from Module 3', () => {
    const s = settings({ rowCount: 1050, segmentRowCount: 400 });
    const data = computeScanData(s, query('COUNT', 'Revenue'));
    const module3 = generateSegments(applyNullPattern(getCustomerEncodingColumn(generateSyntheticCustomerRows(1050), 'Revenue'), 0), 400);
    expect(data.segments.map((d) => [d.segmentId, d.startRowIndex, d.endRowIndex, d.rowCount])).toEqual(
      module3.segments.map((d) => [d.segmentId, d.startRowIndex, d.endRowIndex, d.rowCount]),
    );
    expect(data.segments[2].rowCount).toBe(250); // last, shorter segment
  });

  it('with the table sorted by the filter column, the elimination uses Module 3 sorted segments', () => {
    const s = settings({ rowCount: 1000, segmentRowCount: 100 });
    const predicate = between('2023-03-01', '2023-03-31');
    const data = computeScanData(s, query('SUM', 'Revenue', filterOn('LastPurchaseDate', predicate), 'SORTED_ASCENDING'));
    const column = applyNullPattern(getCustomerEncodingColumn(generateSyntheticCustomerRows(1000), 'LastPurchaseDate'), 0);
    const direct = evaluateSegmentElimination(generateSegments(column, 100, { rowOrder: 'SORTED_ASCENDING' }).segments, predicate, {
      columnName: 'LastPurchaseDate',
      dataType: 'DATE',
    });
    expect(data.elimination.result).toEqual(direct);
    expect(data.eliminatedSegments).toBeGreaterThan(0);
  });

  it('sortedRowOrder agrees with Module 3 sorting: ascending, nulls last, ties in stored order', () => {
    expect(sortedRowOrder([5, null, 3, 5, 1, null])).toEqual([4, 2, 0, 3, 1, 5]);
    expect(sortedRowOrder([])).toEqual([]);
    const column = applyNullPattern(getCustomerEncodingColumn(generateSyntheticCustomerRows(200), 'Revenue'), 30);
    const order = sortedRowOrder(column.values);
    expect(new Set(order).size).toBe(200);
    const sorted = generateSegments(column, 50, { rowOrder: 'SORTED_ASCENDING' });
    const firstSegment = order.slice(0, 50).map((i) => column.values[i]).filter((v): v is number => v !== null);
    expect(Math.min(...firstSegment)).toBe(sorted.segments[0].statistics.minValue);
    expect(Math.max(...firstSegment)).toBe(sorted.segments[0].statistics.maxValue);
  });
});

describe('candidate rows are not matching rows', () => {
  it('reports rows in candidate segments and actual matching rows separately', () => {
    const data = computeScanData(settings(), query('SUM', 'Revenue', filterOn('CustomerID', between(100, 200))));
    expect(data.candidateSegments).toBe(1);
    expect(data.rowsInCandidateSegments).toBe(500);
    expect(data.matchingRows).toBe(101);
    expect(data.candidateRowsNotMatching).toBe(399);
    expect(data.rowsInEliminatedSegments).toBe(500);
    expect(data.rowsInCandidateSegments + data.rowsInEliminatedSegments).toBe(data.totalRows);
  });

  it('a candidate segment can hold no matching row at all', () => {
    const data = computeScanData(settings(), query('SUM', 'Revenue', filterOn('Revenue', { operator: 'EQ', value: 100.005 })));
    expect(data.candidateSegments).toBe(2); // 100.005 is inside every segment's range, so it cannot be ruled out
    expect(data.matchingRows).toBe(0);
    expect(data.candidateRowsNotMatching).toBe(1000);
    expect(data.aggregation.value).toBeNull();
  });

  it('the explanation says so', () => {
    const result = runStorageScan(session(), query('SUM', 'Revenue', filterOn('CustomerID', between(100, 200))));
    const text = explainScan(result).join(' ');
    expect(text).toMatch(/500 rows sit in candidate segments, but only 101 actually match/);
    expect(text).toMatch(/Candidate rows are not matching rows/);
  });
});

describe('aggregations over actual rows', () => {
  it.each<[AggregationFunction, string, number | string]>([
    ['SUM', 'Revenue', 2502487.79],
    ['COUNT', 'Revenue', 1000],
    ['COUNT', 'Region', 1000],
    ['COUNT', 'CustomerName', 1000],
    ['MIN', 'CustomerID', 1],
    ['MAX', 'CustomerID', 1000],
    ['SUM', 'CustomerID', 500500],
    ['AVERAGE', 'CustomerID', 500.5],
  ])('%s(%s) over all rows equals the known value', (fn, column, expected) => {
    const data = computeScanData(settings(), query(fn, column));
    expect(data.aggregation.value).toBe(expected);
  });

  it('MIN and MAX of dates over all rows equal the earliest and latest generated date', () => {
    const dates = generateSyntheticCustomerRows(1000).map((r) => r.lastPurchaseDate).sort();
    expect(computeScanData(settings(), query('MIN', 'LastPurchaseDate')).aggregation.value).toBe(dates[0]);
    expect(computeScanData(settings(), query('MAX', 'LastPurchaseDate')).aggregation.value).toBe(dates[dates.length - 1]);
    expect(dates[dates.length - 1]).toBe('2024-12-30');
  });

  it('SUM of a decimal column is exact: summed in whole cents', () => {
    const rows = generateSyntheticCustomerRows(1000);
    const cents = rows.reduce((sum, r) => sum + Math.round(r.revenue * 100), 0);
    const data = computeScanData(settings(), query('SUM', 'Revenue'));
    expect(data.aggregation.value).toBe(cents / 100);
    expect(data.aggregation.display).toBe('2,502,487.79');
  });

  it('AVERAGE of a decimal column divides the exact sum by the non-null count', () => {
    const data = computeScanData(settings(), query('AVERAGE', 'Revenue'));
    expect(data.aggregation.value).toBeCloseTo(2502.48779, 10);
    expect(data.aggregation.display).toBe('2,502.4878');
  });

  it('MIN and MAX of a decimal column and of dates restricted by a filter', () => {
    const min = computeScanData(settings(), query('MIN', 'Revenue', filterOn('CustomerID', between(1, 10))));
    const rows = generateSyntheticCustomerRows(10).map((r) => r.revenue);
    expect(min.aggregation.value).toBe(Math.min(...rows));
    const max = computeScanData(settings(), query('MAX', 'LastPurchaseDate', filterOn('CustomerID', between(1, 10))));
    const dates = generateSyntheticCustomerRows(10).map((r) => r.lastPurchaseDate).sort();
    expect(max.aggregation.value).toBe(dates[dates.length - 1]);
  });

  it('COUNT counts non-null values in the measure column, which is fewer than the matching rows when there is no filter', () => {
    const s = settings({ nullPercent: 50 });
    const q = query('COUNT', 'Revenue');
    const data = computeScanData(s, q);
    const ref = reference(s, q);
    expect(data.aggregation.value).toBe(ref.inputs.length);
    expect(data.matchingRows).toBe(1000);
    expect(data.matchingRows).toBeGreaterThan(data.aggregation.inputCount);
  });

  it('[SIMPLIFIED MODEL] the shared null pattern nulls the same rows in every column, so a row that passes a filter has a non-null measure', () => {
    const s = settings({ nullPercent: 50 });
    const data = computeScanData(s, query('COUNT', 'Revenue', filterOn('CustomerID', { operator: 'GTE', value: 1 })));
    expect(data.matchingRows).toBe(data.aggregation.inputCount);
    expect(data.matchingRows).toBeLessThan(1000);
  });
});

describe('the scan equals a brute-force scan of the whole table (elimination never loses a row)', () => {
  const configs: LoadingSettings[] = [
    settings({ rowCount: 250, segmentRowCount: 50 }),
    settings({ rowCount: 1000, segmentRowCount: 100 }),
    settings({ rowCount: 1000, segmentRowCount: 100, nullPercent: 40 }),
    settings({ rowCount: 600, segmentRowCount: 150, nullPercent: 100 }),
  ];
  const filters: Array<ScanQuery['filter']> = [
    null,
    filterOn('CustomerID', between(100, 200)),
    filterOn('CustomerID', { operator: 'GT', value: 600 }),
    filterOn('CustomerID', { operator: 'EQ', value: 1 }),
    filterOn('CustomerID', { operator: 'NEQ', value: 5 }),
    filterOn('CustomerID', between(200, 100)),
    filterOn('Revenue', { operator: 'GTE', value: 4000 }),
    filterOn('Revenue', { operator: 'LT', value: 100.5 }),
    filterOn('LastPurchaseDate', between('2023-03-01', '2023-03-31')),
    filterOn('LastPurchaseDate', { operator: 'GT', value: '2024-06-15' }),
    filterOn('Region', { operator: 'EQ', value: 'East' }),
    filterOn('Region', { operator: 'NEQ', value: 'West' }),
  ];
  const measures: Array<[AggregationFunction, string]> = [
    ['SUM', 'Revenue'],
    ['AVERAGE', 'Revenue'],
    ['MIN', 'Revenue'],
    ['MAX', 'LastPurchaseDate'],
    ['COUNT', 'CustomerID'],
    ['COUNT', 'Region'],
  ];

  it('matches rows and aggregates for every combination, in both row orders', () => {
    let checked = 0;
    for (const config of configs) {
      for (const filter of filters) {
        for (const [fn, column] of measures) {
          for (const rowOrder of ['AS_LOADED', 'SORTED_ASCENDING'] as const) {
            const q = query(fn, column, filter, rowOrder);
            const data = computeScanData(config, q);
            const ref = reference(config, q);
            const scale = CUSTOMER_COLUMNS.find((c) => c.name === column)?.scale ?? 0;
            expect(data.matchingRows).toBe(ref.matching);
            const expected = expectedAggregate(fn, scale, ref.inputs);
            if (typeof expected === 'number' && fn === 'AVERAGE') expect(data.aggregation.value).toBeCloseTo(expected, 9);
            else expect(data.aggregation.value).toBe(expected);
            expect(data.aggregation.inputCount).toBe(ref.inputs.length);
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(configs.length * filters.length * measures.length * 2);
  });

  it('row-level predicate agrees with the reference for every operator at its boundary', () => {
    const p = (operator: EliminationPredicate['operator']): EliminationPredicate => ({ operator, value: 5, upperValue: 7 });
    const expectations: Array<[EliminationPredicate['operator'], number, boolean]> = [
      ['EQ', 5, true], ['EQ', 6, false], ['NEQ', 5, false], ['NEQ', 6, true],
      ['GT', 5, false], ['GT', 6, true], ['GTE', 5, true], ['GTE', 4, false],
      ['LT', 5, false], ['LT', 4, true], ['LTE', 5, true], ['LTE', 6, false],
      ['BETWEEN', 5, true], ['BETWEEN', 7, true], ['BETWEEN', 4, false], ['BETWEEN', 8, false],
    ];
    for (const [operator, value, expected] of expectations) {
      expect(predicateMatches(value, p(operator))).toBe(expected);
      expect(holds(value, p(operator))).toBe(expected);
    }
    expect(predicateMatches(null, p('NEQ'))).toBe(false);
  });
});

describe('boundary predicates', () => {
  it('GT at a segment maximum eliminates the segment, GTE keeps it with exactly one match', () => {
    const s = settings({ rowCount: 1000, segmentRowCount: 500 });
    const gt = computeScanData(s, query('COUNT', 'Revenue', filterOn('CustomerID', { operator: 'GT', value: 500 })));
    expect(ids(gt.segments.filter((x) => x.decision === 'CANDIDATE'))).toEqual([1]);
    expect(gt.matchingRows).toBe(500);

    const gte = computeScanData(s, query('COUNT', 'Revenue', filterOn('CustomerID', { operator: 'GTE', value: 500 })));
    expect(ids(gte.segments.filter((x) => x.decision === 'CANDIDATE'))).toEqual([0, 1]);
    expect(gte.matchingRows).toBe(501);
    expect(gte.segments[0].matchingRows).toBe(1);
  });

  it('BETWEEN includes both bounds', () => {
    const data = computeScanData(settings(), query('COUNT', 'CustomerID', filterOn('CustomerID', between(500, 501))));
    expect(data.matchingRows).toBe(2);
    expect(data.candidateSegments).toBe(2);
  });

  it('an inverted BETWEEN matches nothing and eliminates every segment', () => {
    const data = computeScanData(settings(), query('SUM', 'Revenue', filterOn('CustomerID', between(200, 100))));
    expect(data.candidateSegments).toBe(0);
    expect(data.matchingRows).toBe(0);
    expect(data.segments.every((x) => x.reasonCode === 'EMPTY_PREDICATE')).toBe(true);
  });

  it('decimal and date filters include their exact bounds', () => {
    const rows = generateSyntheticCustomerRows(1000);
    const target = rows[10].revenue;
    const dec = computeScanData(settings(), query('COUNT', 'CustomerID', filterOn('Revenue', between(target, target))));
    expect(dec.matchingRows).toBe(rows.filter((r) => r.revenue === target).length);
    expect(dec.matchingRows).toBeGreaterThanOrEqual(1);

    const day = rows[10].lastPurchaseDate;
    const date = computeScanData(settings(), query('COUNT', 'CustomerID', filterOn('LastPurchaseDate', { operator: 'EQ', value: day })));
    expect(date.matchingRows).toBe(rows.filter((r) => r.lastPurchaseDate === day).length);
    expect(date.matchingRows).toBeGreaterThanOrEqual(1);
  });
});

describe('text filters', () => {
  it('have no segment elimination: every segment is a candidate, and matches are still exact', () => {
    const data = computeScanData(settings(), query('SUM', 'Revenue', filterOn('Region', { operator: 'EQ', value: 'East' })));
    expect(data.elimination.available).toBe(false);
    expect(data.elimination.result).toBeNull();
    expect(data.elimination.note).toMatch(/numeric and date columns only/);
    expect(data.eliminatedSegments).toBe(0);
    expect(data.segments.every((x) => x.reasonCode === 'ELIMINATION_UNAVAILABLE')).toBe(true);
    expect(data.matchingRows).toBe(generateSyntheticCustomerRows(1000).filter((r) => r.region === 'East').length);
    expect(data.matchingRows).toBe(193);
  });
});

describe('nulls, empty and no-match data', () => {
  it('empty dataset: no segments, blank or zero results, no NaN', () => {
    for (const fn of ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'] as const) {
      const data = computeScanData(settings({ rowCount: 0 }), query(fn, 'Revenue', filterOn('CustomerID', between(1, 5))));
      expect(data.totalSegments).toBe(0);
      expect(data.matchingRows).toBe(0);
      expect(data.valuesRead).toBe(0);
      expect(data.aggregation.value).toBe(fn === 'COUNT' ? 0 : null);
      expect(JSON.stringify(data)).not.toMatch(/NaN|Infinity/);
    }
  });

  it('an all-null filter column eliminates every segment (ALL_NULL) and returns blank', () => {
    const data = computeScanData(settings({ nullPercent: 100 }), query('SUM', 'Revenue', filterOn('CustomerID', { operator: 'GTE', value: 1 })));
    expect(data.candidateSegments).toBe(0);
    expect(data.segments.every((x) => x.reasonCode === 'ALL_NULL')).toBe(true);
    expect(data.aggregation.value).toBeNull();
    expect(data.aggregation.display).toBe('(blank)');
  });

  it('an all-null measure column: rows still match, but SUM is blank and COUNT is 0', () => {
    const sum = computeScanData(settings({ nullPercent: 100 }), query('SUM', 'Revenue'));
    expect(sum.matchingRows).toBe(1000);
    expect(sum.aggregation.value).toBeNull();
    const count = computeScanData(settings({ nullPercent: 100 }), query('COUNT', 'Revenue'));
    expect(count.aggregation.value).toBe(0);
    expect(computeScanData(settings({ nullPercent: 100 }), query('MAX', 'LastPurchaseDate')).aggregation.value).toBeNull();
  });

  it('nulls in the filter column never match, and nulls in the measure are ignored by the aggregate', () => {
    const s = settings({ nullPercent: 30 });
    const q = query('SUM', 'Revenue', filterOn('CustomerID', { operator: 'GTE', value: 1 }));
    const data = computeScanData(s, q);
    const ref = reference(s, q);
    expect(data.matchingRows).toBe(ref.matching);
    expect(data.matchingRows).toBeLessThan(1000);
    expect(data.aggregation.value).toBe(expectedAggregate('SUM', 2, ref.inputs));
  });

  it('no matching rows because every segment is eliminated: zero candidates, nothing read', () => {
    const data = computeScanData(settings(), query('SUM', 'Revenue', filterOn('CustomerID', { operator: 'GT', value: 5000 })));
    expect(data.candidateSegments).toBe(0);
    expect(data.rowsInCandidateSegments).toBe(0);
    expect(data.valuesRead).toBe(0);
    expect(data.matchingRows).toBe(0);
    expect(data.aggregation.value).toBeNull();
  });

  it('a single-row table works', () => {
    const data = computeScanData(settings({ rowCount: 1 }), query('SUM', 'CustomerID', filterOn('CustomerID', { operator: 'EQ', value: 1 })));
    expect(data.totalSegments).toBe(1);
    expect(data.aggregation.value).toBe(1);
  });
});

describe('invalid queries', () => {
  it.each<[string, ScanQuery, RegExp]>([
    ['SUM of a date column', query('SUM', 'LastPurchaseDate'), /SUM is not meaningful for the date column LastPurchaseDate\. For this column use COUNT, MIN, MAX\./],
    ['AVERAGE of a date column', query('AVERAGE', 'LastPurchaseDate'), /AVERAGE is not meaningful for the date column/],
    ['SUM of a text column', query('SUM', 'Region'), /SUM is not meaningful for the text column Region\. For this column use COUNT\./],
    ['MIN of a text column', query('MIN', 'CustomerName'), /MIN is not meaningful for the text column/],
    ['unknown measure column', query('SUM', 'Profit'), /Unknown column: Profit/],
    ['unknown filter column', query('SUM', 'Revenue', filterOn('Profit', { operator: 'EQ', value: 1 })), /Unknown filter column: Profit/],
    ['unknown aggregation', query('MEDIAN' as AggregationFunction, 'Revenue'), /Unknown aggregation/],
    ['text filter with GT', query('SUM', 'Revenue', filterOn('Region', { operator: 'GT', value: 'East' })), /only the equal and not-equal filters/],
    ['text filter with a number', query('SUM', 'Revenue', filterOn('Region', { operator: 'EQ', value: 5 })), /Enter the text value/],
    ['text filter with an empty value', query('SUM', 'Revenue', filterOn('Region', { operator: 'EQ', value: '' })), /Enter the text value/],
    ['date filter with a bad date', query('SUM', 'Revenue', filterOn('LastPurchaseDate', { operator: 'EQ', value: '2023-13-45' })), /valid date/],
    ['date filter with a number', query('SUM', 'Revenue', filterOn('LastPurchaseDate', { operator: 'EQ', value: 5 })), /valid date/],
    ['numeric filter with NaN', query('SUM', 'Revenue', filterOn('CustomerID', { operator: 'EQ', value: NaN })), /must be a number/],
    ['numeric filter with text', query('SUM', 'Revenue', filterOn('CustomerID', { operator: 'EQ', value: 'abc' })), /must be a number/],
    ['BETWEEN without an upper bound', query('SUM', 'Revenue', filterOn('CustomerID', { operator: 'BETWEEN', value: 1 })), /upper bound must be a number/],
    ['unknown operator', query('SUM', 'Revenue', filterOn('CustomerID', { operator: 'LIKE' as never, value: 1 })), /Unknown filter operator/],
    ['invalid row order', query('SUM', 'Revenue', null, 'RANDOM' as never), /Row order must be/],
  ])('rejects %s with a clear message', (_label, q, message) => {
    expect(validateScanQuery(q)).toMatch(message);
    expect(() => computeScanData(settings(), q)).toThrow(RangeError);
    expect(() => runStorageScan(session(), q)).toThrow(RangeError);
  });

  it('an invalid query changes nothing: no loading, no events, no memory', () => {
    const start = session();
    const frozen = JSON.stringify(start);
    expect(() => runStorageScan(start, query('SUM', 'Region'))).toThrow(RangeError);
    expect(JSON.stringify(start)).toBe(frozen);
    expect(summarizeMemory(start).totalSimulatedBytes).toBe(0);
  });

  it('accepts every valid combination and nothing else', () => {
    for (const column of CUSTOMER_COLUMNS) {
      const allowed = allowedAggregations(column.dataType);
      for (const fn of ['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT'] as const) {
        expect(validateScanQuery(query(fn, column.name)) === null).toBe(allowed.includes(fn));
      }
    }
    expect(allowedAggregations('TEXT')).toEqual(['COUNT']);
    expect(allowedAggregations('DATE')).toEqual(['COUNT', 'MIN', 'MAX']);
  });
});

describe('required columns, loading and residency (Modules 6 and 7)', () => {
  const q = query('SUM', 'Revenue', filterOn('CustomerID', between(100, 200)));

  it('lists the measure column first and the filter column once', () => {
    expect(requiredColumnsFor(q)).toEqual(['Revenue', 'CustomerID']);
    expect(requiredColumnsFor(query('SUM', 'Revenue'))).toEqual(['Revenue']);
    expect(requiredColumnsFor(query('SUM', 'Revenue', filterOn('Revenue', { operator: 'GT', value: 1 })))).toEqual(['Revenue']);
  });

  it('a cold scan loads both required columns, in the time of the slower one', () => {
    const result = runStorageScan(session(), q);
    expect(result.loading.alreadyResident).toEqual([]);
    expect(result.loading.loadedForThisQuery).toEqual(['Revenue', 'CustomerID']);
    expect(result.loading.ticksElapsed).toBe(5);
    expect(result.loading.memoryBeforeBytes).toBe(0);
    expect(result.loading.memoryAfterBytes).toBe(2520 + 1394);
    expect(snapshotMemory(result.session).residentColumns).toEqual(['CustomerID', 'Revenue']);
  });

  it('reuses columns that are already resident and loads only the missing one', () => {
    const warm = finishLoading(requestLoad(session(), ['Revenue']));
    const result = runStorageScan(warm, q);
    expect(result.loading.alreadyResident).toEqual(['Revenue']);
    expect(result.loading.loadedForThisQuery).toEqual(['CustomerID']);
    expect(result.loading.ticksElapsed).toBe(3);
    expect(result.loading.memoryBeforeBytes).toBe(2520);
    expect(result.loading.memoryAfterBytes).toBe(3914);
  });

  it('a scan on fully resident columns loads nothing and adds no memory', () => {
    const warm = finishLoading(requestLoad(session(), ['Revenue', 'CustomerID']));
    const result = runStorageScan(warm, q);
    expect(result.loading.loadedForThisQuery).toEqual([]);
    expect(result.loading.ticksElapsed).toBe(0);
    expect(result.loading.memoryAfterBytes).toBe(result.loading.memoryBeforeBytes);
    expect(result.steps[1].summary).toMatch(/Every required column was already resident, so nothing was loaded/);
  });

  it('never double counts memory: scanning again leaves memory unchanged', () => {
    const first = runStorageScan(session(), q);
    const second = runStorageScan(first.session, q);
    const third = runStorageScan(second.session, q);
    expect(summarizeMemory(second.session).totalSimulatedBytes).toBe(summarizeMemory(first.session).totalSimulatedBytes);
    expect(summarizeMemory(third.session).totalSimulatedBytes).toBe(3914);
    expect(second.loading.loadedForThisQuery).toEqual([]);
  });

  it('a column used as both measure and filter is counted once', () => {
    const result = runStorageScan(session(), query('SUM', 'Revenue', filterOn('Revenue', { operator: 'GTE', value: 4000 })));
    expect(result.requiredColumns).toEqual(['Revenue']);
    expect(result.loading.memoryAfterBytes).toBe(2520);
    expect(result.valuesRead).toBe(result.rowsInCandidateSegments);
  });

  it('reuses the Module 6 session: same settings, same sizes, same event log', () => {
    const custom = session({ rowCount: 300, segmentRowCount: 100 });
    const result = runStorageScan(custom, q);
    expect(result.totalRows).toBe(300);
    expect(result.segmentRowCount).toBe(100);
    expect(result.totalSegments).toBe(3);
    expect(result.session.settings).toEqual(custom.settings);
    expect(result.session.columns.map((c) => c.profile)).toEqual(custom.columns.map((c) => c.profile));
    expect(types(result.session).slice(0, 1)).toEqual(['QUERY_REQUESTED']);
    expect(types(result.session)[types(result.session).length - 1]).toBe('SCAN_COMPLETED');
    expect(types(result.session)).toContain('QUERY_READY');
  });

  it('does not change the input session', () => {
    const start = session();
    const frozen = JSON.stringify(start);
    runStorageScan(start, q);
    expect(JSON.stringify(start)).toBe(frozen);
  });

  it('a column evicted in Module 7 is loaded again before the next scan', () => {
    const first = runStorageScan(session(), q);
    const evicted = evictColumns(first.session, ['Revenue']).session;
    const again = runStorageScan(evicted, q);
    expect(again.loading.alreadyResident).toEqual(['CustomerID']);
    expect(again.loading.loadedForThisQuery).toEqual(['Revenue']);
    expect(again.loading.memoryBeforeBytes).toBe(1394);
    expect(again.loading.memoryAfterBytes).toBe(3914);
    expect(again.aggregation.value).toBe(first.aggregation.value);
  });

  it('the data result does not depend on residency', () => {
    const cold = runStorageScan(session(), q);
    const warm = runStorageScan(finishLoading(requestLoad(session(), ['Revenue', 'CustomerID'])), q);
    const strip = (r: typeof cold): unknown => ({ ...r, session: undefined, loading: undefined, steps: undefined });
    expect(strip(cold)).toEqual(strip(warm));
  });
});

describe('row order and the elimination comparison', () => {
  const dateQuery = query('SUM', 'Revenue', filterOn('LastPurchaseDate', between('2023-03-01', '2023-03-31')));

  it('storing the table sorted by the filter column eliminates segments that as-loaded storage cannot, with the same answer', () => {
    const { asLoaded, sorted } = compareRowOrders(settings({ rowCount: 1000, segmentRowCount: 100 }), dateQuery);
    expect(asLoaded.eliminatedSegments).toBe(0);
    expect(sorted.eliminatedSegments).toBeGreaterThan(0);
    expect(sorted.rowsInCandidateSegments).toBeLessThan(asLoaded.rowsInCandidateSegments);
    expect(sorted.matchingRows).toBe(asLoaded.matchingRows);
    expect(sorted.aggregation.value).toBe(asLoaded.aggregation.value);
  });

  it('with the default 500-row segments: 2 candidate segments as loaded, 1 when sorted, 39 matches either way', () => {
    const { asLoaded, sorted } = compareRowOrders(settings(), dateQuery);
    expect([asLoaded.candidateSegments, sorted.candidateSegments]).toEqual([2, 1]);
    expect([asLoaded.matchingRows, sorted.matchingRows]).toEqual([39, 39]);
    expect(sorted.aggregation.display).toBe('85,564.51');
  });

  it('row order is ignored when there is no filter', () => {
    const data = computeScanData(settings(), query('SUM', 'Revenue', null, 'SORTED_ASCENDING'));
    expect(data.effectiveRowOrder).toBe('AS_LOADED');
  });

  it('comparing needs no loading and changes no session', () => {
    const start = session();
    const frozen = JSON.stringify(start);
    compareRowOrders(start.settings, dateQuery);
    expect(JSON.stringify(start)).toBe(frozen);
  });
});

describe('scenarios', () => {
  it('runs every scenario in sequence on one session and reports exact figures', () => {
    let s = session();
    const out: Record<string, ReturnType<typeof runStorageScan>> = {};
    for (const scenario of SCAN_SCENARIOS) {
      const result = runScanScenario(s, scenario.id);
      s = result.session;
      out[scenario.id] = result;
    }
    expect(out.SUM_REVENUE.aggregation.display).toBe('2,502,487.79');
    expect(out.SUM_REVENUE.candidateSegments).toBe(2);
    expect(out.REVENUE_BY_CUSTOMERID).toMatchObject({ eliminatedSegments: 1, rowsInCandidateSegments: 500, matchingRows: 101 });
    expect(out.REVENUE_BY_CUSTOMERID.aggregation.display).toBe('249,311.15');
    expect(out.REVENUE_BY_REGION).toMatchObject({ eliminatedSegments: 0, matchingRows: 193 });
    expect(out.REVENUE_BY_REGION.aggregation.display).toBe('462,329.55');
    expect(out.DATE_RANGE_AS_LOADED).toMatchObject({ eliminatedSegments: 0, matchingRows: 39 });
    expect(out.DATE_RANGE_SORTED).toMatchObject({ eliminatedSegments: 1, matchingRows: 39 });
    expect(out.DATE_RANGE_SORTED.aggregation.display).toBe(out.DATE_RANGE_AS_LOADED.aggregation.display);
    expect(out.MAX_PURCHASE_DATE.aggregation.display).toBe('2024-12-30');
    expect(summarizeMemory(s).totalSimulatedBytes).toBe(2520 + 1394 + 549 + 1394);
  });

  it('every scenario uses only real columns and valid combinations', () => {
    const names = new Set(CUSTOMER_COLUMNS.map((c) => c.name));
    for (const scenario of SCAN_SCENARIOS) {
      expect(validateScanQuery(scenario.query)).toBeNull();
      for (const column of requiredColumnsFor(scenario.query)) expect(names.has(column)).toBe(true);
    }
    expect(SCAN_SCENARIOS.map((s) => s.id)).toEqual([
      'SUM_REVENUE', 'REVENUE_BY_CUSTOMERID', 'REVENUE_BY_REGION', 'DATE_RANGE_AS_LOADED', 'DATE_RANGE_SORTED', 'MAX_PURCHASE_DATE',
    ]);
  });

  it('rejects an unknown scenario', () => {
    expect(() => runScanScenario(session(), 'NOPE')).toThrow(RangeError);
  });
});

describe('steps, wording and sources', () => {
  it('has the six steps in order and marks elimination as skipped when unavailable', () => {
    const result = runStorageScan(session(), query('SUM', 'Revenue', filterOn('Region', { operator: 'EQ', value: 'East' })));
    expect(result.steps.map((s) => s.stage)).toEqual(['REQUEST', 'AVAILABILITY', 'ELIMINATION', 'SCAN', 'AGGREGATION', 'RESULT']);
    expect(result.steps[2].status).toBe('SKIPPED');
    expect(result.steps[5].summary).toMatch(/Formula Engine \(conceptual\)/);
    expect(result.steps[5].summary).toMatch(/not simulated/);
  });

  it('keeps the four stages apart in the explanation', () => {
    const text = explainScan(runStorageScan(session(), query('SUM', 'Revenue', filterOn('CustomerID', between(100, 200))))).join('\n');
    expect(text).toMatch(/Column loading \(Module 6\)/);
    expect(text).toMatch(/Segment elimination \(Module 4\)/);
    expect(text).toMatch(/Scan:/);
    expect(text).toMatch(/Formula Engine: .* not simulated/);
  });

  it('the conceptual request is a one-line illustration that is not xmSQL', () => {
    expect(describeConceptualRequest(query('SUM', 'Revenue', filterOn('CustomerID', between(100, 200))))).toBe(
      'SELECT SUM(Revenue) FROM Customer WHERE CustomerID BETWEEN 100 AND 200',
    );
    expect(describeConceptualRequest(query('AVERAGE', 'Revenue'))).toBe('SELECT AVG(Revenue) FROM Customer');
    expect(describeConceptualRequest(query('COUNT', 'Region', filterOn('Revenue', { operator: 'GTE', value: 4000 })))).toBe(
      'SELECT COUNT(Region) FROM Customer WHERE Revenue >= 4000.00',
    );
  });

  it('cites Microsoft Learn for what is documented and the Module 4 sources', () => {
    const urls = getScanSourceReferences().map((s) => s.url);
    expect(urls).toContain('https://learn.microsoft.com/en-us/analysis-services/tabular-models/query-interleaving');
    expect(urls).toContain('https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-how-it-works');
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('determinism', () => {
  it('gives identical results without using Math.random or the wall clock', () => {
    const random = vi.spyOn(Math, 'random');
    const now = vi.spyOn(Date, 'now');
    const run = (): unknown => {
      let s = session();
      return SCAN_SCENARIOS.map((scenario) => {
        const r = runScanScenario(s, scenario.id);
        s = r.session;
        return r;
      });
    };
    expect(run()).toEqual(run());
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it('never produces NaN, Infinity or negative counts across settings', () => {
    for (const rowCount of [0, 1, 99, 100, 101, 1000]) {
      for (const segmentRowCount of [1, 50, 1000]) {
        for (const nullPercent of [0, 50, 100]) {
          const data = computeScanData(settings({ rowCount, segmentRowCount, nullPercent }), query('AVERAGE', 'Revenue', filterOn('CustomerID', between(10, 90)), 'SORTED_ASCENDING'));
          for (const n of [data.totalSegments, data.candidateSegments, data.rowsInCandidateSegments, data.matchingRows, data.candidateRowsNotMatching, data.valuesRead]) {
            expect(Number.isFinite(n) && n >= 0).toBe(true);
          }
          expect(data.rowsInCandidateSegments + data.rowsInEliminatedSegments).toBe(data.totalRows);
          expect(data.candidateSegments + data.eliminatedSegments).toBe(data.totalSegments);
        }
      }
    }
  });
});
