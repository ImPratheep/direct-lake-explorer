// Stage 6, Module 8: Storage Engine Scan Simulator.
//
// [SIMULATION] Educational model. It is NOT Microsoft's VertiPaq implementation and does not reproduce it.
// Everything here is computed from the real synthetic Customer rows. There is no timing, no wall clock and no randomness.
//
// How it reuses the earlier modules (it defines no sizes, residency or segment boundaries of its own):
//   Module 3  generateSegments supplies the segments and their min/max/null metadata for the filter column.
//   Module 4  evaluateSegmentElimination decides which of those segments can be ruled out.
//   Module 6  executeQuery makes the required columns resident (reusing resident ones, loading missing ones), and the
//             LoadingSession carries the settings (rows, rows per segment, null share), so the scan reads the same data.
//   Module 7  eviction acts on the same session, so an evicted column is loaded again before a later scan.
//
// What Microsoft documents:
//   [DOCUMENTED] A DAX query can result in multiple VertiPaq storage engine queries, and formula engine operations are
//                separate from storage engine queries (Microsoft Learn, "Analysis Services tabular query interleaving").
//   [DOCUMENTED] Direct Lake loads the columns a query needs when it first needs them (Microsoft Learn, "How Direct Lake works").
// What is not documented there and is therefore not claimed:
//   [PROPRIETARY INTERNAL] How the engine scans segments, in what order, how it aggregates, its optimizations, its
//                actual xmSQL for a query, and its timings. The conceptual request text below is NOT xmSQL.
//
// The four stages stay separate: column loading (Module 6), segment elimination (Module 4), the scan of candidate
// segments (this module), and Formula Engine work (not simulated: no DAX is evaluated here).

import {
  AggregationFunction,
  EncodingDataType,
  EliminationPredicate,
  LoadingSession,
  LoadingSettings,
  ScanAggregation,
  ScanData,
  ScanEliminationSummary,
  ScanQuery,
  ScanSegmentDetail,
  ScanSegmentReason,
  ScanStep,
  SegmentColumn,
  SegmentRowOrder,
  SegmentValue,
  SourceReference,
  StorageScanResult,
} from '../types';
import { executeQuery, withEvent } from './stage6-loading-simulator';
import { applyNullPattern, compareSegmentValues, generateSegments, sortedRowOrder } from './stage6-segment-simulator';
import {
  ELIMINATION_OPERATORS,
  evaluateSegmentElimination,
  formatEliminationPredicate,
  getEliminationSourceReferences,
  validateEliminationPredicate,
} from './stage6-elimination-simulator';
import { CUSTOMER_COLUMNS, generateSyntheticCustomerRows, getCustomerEncodingColumn } from './stage6-synthetic-dataset';

type Comparable = number | string;

export const SCAN_AGGREGATIONS: ReadonlyArray<{ value: AggregationFunction; label: string }> = [
  { value: 'SUM', label: 'SUM' },
  { value: 'COUNT', label: 'COUNT (non-null values)' },
  { value: 'MIN', label: 'MIN' },
  { value: 'MAX', label: 'MAX' },
  { value: 'AVERAGE', label: 'AVERAGE' },
];

// Which aggregations are meaningful for which column types. COUNT counts non-null values in the measure column.
const ALLOWED: Record<AggregationFunction, EncodingDataType[]> = {
  SUM: ['INTEGER', 'DECIMAL'],
  AVERAGE: ['INTEGER', 'DECIMAL'],
  MIN: ['INTEGER', 'DECIMAL', 'DATE'],
  MAX: ['INTEGER', 'DECIMAL', 'DATE'],
  COUNT: ['INTEGER', 'DECIMAL', 'DATE', 'TEXT'],
};

const TYPE_WORD: Record<EncodingDataType, string> = { INTEGER: 'integer', DECIMAL: 'decimal', DATE: 'date', TEXT: 'text' };

const fmt = (n: number): string => n.toLocaleString('en-US');
const formatNumber = (n: number, digits: number): string => n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** The aggregations that are meaningful for a column type, in display order. */
export function allowedAggregations(dataType: EncodingDataType): AggregationFunction[] {
  return SCAN_AGGREGATIONS.map((entry) => entry.value).filter((fn) => ALLOWED[fn].includes(dataType));
}

/** Returns a message when the query cannot be run, otherwise null. Never changes any state. */
export function validateScanQuery(query: ScanQuery): string | null {
  const measure = CUSTOMER_COLUMNS.find((column) => column.name === query.measureColumn);
  if (!measure) return `Unknown column: ${query.measureColumn}`;
  if (!Object.prototype.hasOwnProperty.call(ALLOWED, query.aggregation)) return `Unknown aggregation: ${String(query.aggregation)}`;
  if (!ALLOWED[query.aggregation].includes(measure.dataType)) {
    return `${query.aggregation} is not meaningful for the ${TYPE_WORD[measure.dataType]} column ${measure.name}. For this column use ${allowedAggregations(measure.dataType).join(', ')}.`;
  }
  if (query.rowOrder !== 'AS_LOADED' && query.rowOrder !== 'SORTED_ASCENDING') {
    return 'Row order must be as loaded or sorted by the filter column.';
  }
  if (!query.filter) return null;

  const definition = CUSTOMER_COLUMNS.find((column) => column.name === query.filter?.columnName);
  if (!definition) return `Unknown filter column: ${query.filter.columnName}`;
  const { predicate } = query.filter;
  if (!ELIMINATION_OPERATORS.some((entry) => entry.value === predicate.operator)) {
    return `Unknown filter operator: ${String(predicate.operator)}`;
  }
  if (definition.dataType === 'TEXT') {
    if (predicate.operator !== 'EQ' && predicate.operator !== 'NEQ') {
      return 'Text columns support only the equal and not-equal filters.';
    }
    if (typeof predicate.value !== 'string' || predicate.value.length === 0) {
      return 'Enter the text value to compare with.';
    }
    return null;
  }
  return validateEliminationPredicate(predicate, definition.dataType);
}

/** Row-level test. A null never satisfies a comparison. BETWEEN is inclusive. */
export function predicateMatches(value: SegmentValue, predicate: EliminationPredicate): boolean {
  if (value === null) return false;
  const target = predicate.value as Comparable;
  switch (predicate.operator) {
    case 'EQ':
      return compareSegmentValues(value, target) === 0;
    case 'NEQ':
      return compareSegmentValues(value, target) !== 0;
    case 'GT':
      return compareSegmentValues(value, target) > 0;
    case 'GTE':
      return compareSegmentValues(value, target) >= 0;
    case 'LT':
      return compareSegmentValues(value, target) < 0;
    case 'LTE':
      return compareSegmentValues(value, target) <= 0;
    case 'BETWEEN':
      return compareSegmentValues(value, target) >= 0 && compareSegmentValues(value, predicate.upperValue as Comparable) <= 0;
    default:
      return false;
  }
}

/** The columns the query reads: the measure column first, then the filter column when it is a different column. */
export function requiredColumnsFor(query: ScanQuery): string[] {
  const names = [query.measureColumn];
  if (query.filter && query.filter.columnName !== query.measureColumn) names.push(query.filter.columnName);
  return names;
}

/** A conceptual one-line illustration of the request. It is NOT xmSQL and not captured from any engine. */
export function describeConceptualRequest(query: ScanQuery): string {
  const filterDefinition = query.filter ? CUSTOMER_COLUMNS.find((column) => column.name === query.filter?.columnName) : undefined;
  const where = query.filter ? ` WHERE ${formatEliminationPredicate(query.filter.columnName, query.filter.predicate, filterDefinition?.scale ?? 0)}` : '';
  const fn = query.aggregation === 'AVERAGE' ? 'AVG' : query.aggregation;
  return `SELECT ${fn}(${query.measureColumn}) FROM Customer${where}`;
}

interface Accumulator {
  count: number;
  scaledSum: number;
  min: Comparable | null;
  max: Comparable | null;
}

function aggregateResult(fn: AggregationFunction, column: SegmentColumn, acc: Accumulator): ScanAggregation {
  const base = { function: fn, columnName: column.name, inputCount: acc.count };
  if (fn === 'COUNT') {
    return { ...base, value: acc.count, display: fmt(acc.count) };
  }
  if (acc.count === 0) {
    return { ...base, value: null, display: '(blank)' };
  }
  const unit = 10 ** column.scale;
  switch (fn) {
    case 'SUM': {
      const value = acc.scaledSum / unit;
      return { ...base, value, display: formatNumber(value, column.scale) };
    }
    case 'AVERAGE': {
      const value = acc.scaledSum / unit / acc.count;
      return { ...base, value, display: formatNumber(value, column.scale + 2) };
    }
    default: {
      const value = (fn === 'MIN' ? acc.min : acc.max) as Comparable;
      return { ...base, value, display: typeof value === 'number' ? formatNumber(value, column.scale) : value };
    }
  }
}

/**
 * [SIMULATION] The data side of a scan, from the real synthetic rows. It does not depend on which columns are resident.
 * Candidate segments come from Module 4 (non-text filters); the rows of exactly those segments are then read and the
 * filter is applied to each row, so "rows in candidate segments" and "matching rows" are counted separately.
 * Throws RangeError when the query is invalid.
 */
export function computeScanData(settings: LoadingSettings, query: ScanQuery): ScanData {
  const problem = validateScanQuery(query);
  if (problem) throw new RangeError(problem);

  const rows = generateSyntheticCustomerRows(settings.rowCount);
  const column = (name: string): SegmentColumn => applyNullPattern(getCustomerEncodingColumn(rows, name), settings.nullPercent);
  const measure = column(query.measureColumn);
  const filterColumn = query.filter ? column(query.filter.columnName) : null;

  // [SIMPLIFIED MODEL] "Sorted" means the whole table is stored ordered by the filter column, so every column follows
  // the same row order and the segment boundaries are the same for all columns.
  const effectiveRowOrder: SegmentRowOrder = query.filter ? query.rowOrder : 'AS_LOADED';
  const order = filterColumn && effectiveRowOrder === 'SORTED_ASCENDING' ? sortedRowOrder(filterColumn.values) : null;
  const rowAt = (position: number): number => (order ? order[position] : position);

  // Module 3 supplies the segment boundaries and min/max metadata.
  const explorer = generateSegments(filterColumn ?? measure, settings.segmentRowCount, { rowOrder: effectiveRowOrder });

  let elimination: ScanEliminationSummary;
  if (!query.filter || !filterColumn) {
    elimination = { available: false, note: 'There is no filter, so there is nothing to eliminate on. Every segment is a candidate.', result: null };
  } else if (filterColumn.dataType === 'TEXT') {
    elimination = {
      available: false,
      note: 'Segment elimination in this simulator supports numeric and date columns only (Module 4), so every segment is a candidate for a text filter.',
      result: null,
    };
  } else {
    const result = evaluateSegmentElimination(explorer.segments, query.filter.predicate, {
      columnName: filterColumn.name,
      dataType: filterColumn.dataType,
      scale: filterColumn.scale,
    });
    elimination = {
      available: true,
      note: '[SIMPLIFIED MODEL] Eliminated from segment min/max metadata alone (Module 4). A candidate segment may still hold no matching row.',
      result,
    };
  }

  const acc: Accumulator = { count: 0, scaledSum: 0, min: null, max: null };
  const segments: ScanSegmentDetail[] = explorer.segments.map((segment, index) => {
    const verdict = elimination.result?.segments[index];
    const eliminated = verdict?.decision === 'ELIMINATED';
    const reasonCode: ScanSegmentReason = verdict
      ? verdict.reasonCode
      : query.filter
        ? 'ELIMINATION_UNAVAILABLE'
        : 'NO_FILTER';
    const reason = verdict
      ? verdict.reason
      : query.filter
        ? 'Elimination is not available for this column, so the segment is scanned.'
        : 'No filter, so the segment is scanned.';

    let matchingRows = 0;
    let nonNull = 0;
    if (!eliminated) {
      for (let position = segment.startRowIndex; position < segment.endRowIndex; position++) {
        const source = rowAt(position);
        if (filterColumn && query.filter && !predicateMatches(filterColumn.values[source], query.filter.predicate)) continue;
        matchingRows++;
        const value = measure.values[source];
        if (value === null) continue;
        nonNull++;
        acc.count++;
        if (typeof value === 'number') acc.scaledSum += Math.round(value * 10 ** measure.scale);
        if (acc.min === null || compareSegmentValues(value, acc.min) < 0) acc.min = value;
        if (acc.max === null || compareSegmentValues(value, acc.max) > 0) acc.max = value;
      }
    }

    return {
      segmentId: segment.segmentId,
      startRowIndex: segment.startRowIndex,
      endRowIndex: segment.endRowIndex,
      rowCount: segment.rowCount,
      decision: eliminated ? 'ELIMINATED' : 'CANDIDATE',
      reasonCode,
      reason,
      rowsRead: eliminated ? 0 : segment.rowCount,
      matchingRows,
      nonNullMeasureValues: nonNull,
    };
  });

  const candidates = segments.filter((segment) => segment.decision === 'CANDIDATE');
  const rowsInCandidateSegments = candidates.reduce((sum, segment) => sum + segment.rowCount, 0);
  const matchingRows = segments.reduce((sum, segment) => sum + segment.matchingRows, 0);
  const totalRows = explorer.totalRows;

  return {
    effectiveRowOrder,
    totalRows,
    segmentRowCount: settings.segmentRowCount,
    elimination,
    segments,
    totalSegments: segments.length,
    eliminatedSegments: segments.length - candidates.length,
    candidateSegments: candidates.length,
    rowsInCandidateSegments,
    rowsInEliminatedSegments: totalRows - rowsInCandidateSegments,
    matchingRows,
    candidateRowsNotMatching: rowsInCandidateSegments - matchingRows,
    valuesRead: rowsInCandidateSegments * requiredColumnsFor(query).length,
    aggregation: aggregateResult(query.aggregation, measure, acc),
  };
}

function buildSteps(query: ScanQuery, data: ScanData, loading: StorageScanResult['loading'], conceptualRequest: string): ScanStep[] {
  const list = (names: string[]): string => (names.length > 0 ? names.join(', ') : 'none');
  const loadingText =
    loading.loadedForThisQuery.length === 0 && loading.awaited.length === 0
      ? 'Every required column was already resident, so nothing was loaded.'
      : `Loaded for this query: ${list(loading.loadedForThisQuery)} (${fmt(loading.ticksElapsed)} simulated step(s); simulated memory ${fmt(loading.memoryBeforeBytes)} B to ${fmt(loading.memoryAfterBytes)} B).`;

  let eliminationSummary: string;
  if (data.elimination.available && data.elimination.result) {
    eliminationSummary = `${fmt(data.eliminatedSegments)} of ${fmt(data.totalSegments)} segment(s) were ruled out from min/max metadata, leaving ${fmt(data.candidateSegments)} candidate segment(s).`;
  } else {
    eliminationSummary = `${data.elimination.note} ${fmt(data.candidateSegments)} of ${fmt(data.totalSegments)} segment(s) are candidates.`;
  }

  const scanSummary =
    data.candidateSegments === 0
      ? 'There are no candidate segments, so no rows were read.'
      : `Read the actual rows of ${fmt(data.candidateSegments)} candidate segment(s): ${fmt(data.rowsInCandidateSegments)} rows in candidate segments, of which ${fmt(data.matchingRows)} actually match the filter.`;

  const aggregationSummary =
    data.aggregation.value === null
      ? `${query.aggregation}(${query.measureColumn}) over ${fmt(data.matchingRows)} matching row(s) has no non-null value, so the result is blank.`
      : `${query.aggregation}(${query.measureColumn}) over the matching rows, using ${fmt(data.aggregation.inputCount)} non-null value(s): ${data.aggregation.display}.`;

  return [
    { stage: 'REQUEST', status: 'DONE', summary: `Conceptual request: ${conceptualRequest}. Columns needed: ${list(loading.requiredColumns)}.` },
    {
      stage: 'AVAILABILITY',
      status: 'DONE',
      summary: `Already resident: ${list(loading.alreadyResident)}. ${loadingText}`,
    },
    { stage: 'ELIMINATION', status: data.elimination.available ? 'DONE' : 'SKIPPED', summary: eliminationSummary },
    { stage: 'SCAN', status: 'DONE', summary: scanSummary },
    { stage: 'AGGREGATION', status: 'DONE', summary: aggregationSummary },
    {
      stage: 'RESULT',
      status: 'DONE',
      summary: `Result ${data.aggregation.display} handed back to the Formula Engine (conceptual). Formula Engine work, such as evaluating DAX, is not simulated.`,
    },
  ];
}

/**
 * [SIMULATION] Runs one scan on a Module 6 session. The query is validated first, so an invalid query changes nothing.
 * The required columns are made resident with Module 6's executeQuery (resident columns are reused, so memory is never
 * counted twice; an evicted column is loaded again). Then computeScanData reads the actual candidate rows.
 * Throws RangeError for an invalid query.
 */
export function runStorageScan(session: LoadingSession, query: ScanQuery): StorageScanResult {
  const problem = validateScanQuery(query);
  if (problem) throw new RangeError(problem);

  const requiredColumns = requiredColumnsFor(query);
  const load = executeQuery(session, requiredColumns);
  const data = computeScanData(session.settings, query);
  const conceptualRequest = describeConceptualRequest(query);

  const loading = {
    requiredColumns,
    alreadyResident: load.columnsReused,
    loadedForThisQuery: load.columnsLoadedByQuery,
    awaited: load.columnsAwaited,
    ticksElapsed: load.ticksElapsed,
    memoryBeforeBytes: load.memoryBeforeBytes,
    memoryAfterBytes: load.memoryAfterBytes,
  };

  const finished: LoadingSession = {
    ...load.session,
    events: withEvent(
      load.session.events,
      load.session.tick,
      'SCAN_COMPLETED',
      `Scan finished: ${fmt(data.candidateSegments)} of ${fmt(data.totalSegments)} segment(s) were candidates, ${fmt(data.matchingRows)} row(s) matched, ${query.aggregation}(${query.measureColumn}) = ${data.aggregation.display}. The result goes back to the Formula Engine (conceptual).`,
    ),
  };

  return { ...data, query, requiredColumns, conceptualRequest, loading, steps: buildSteps(query, data, loading, conceptualRequest), session: finished };
}

/** The same query with the table stored as loaded and sorted by the filter column. Needs no loading and changes nothing. */
export function compareRowOrders(settings: LoadingSettings, query: ScanQuery): { asLoaded: ScanData; sorted: ScanData } {
  return {
    asLoaded: computeScanData(settings, { ...query, rowOrder: 'AS_LOADED' }),
    sorted: computeScanData(settings, { ...query, rowOrder: 'SORTED_ASCENDING' }),
  };
}

/** Plain-language reading of a scan. Keeps candidate rows and matching rows apart. */
export function explainScan(result: StorageScanResult): string[] {
  const lines: string[] = [];
  if (result.loading.loadedForThisQuery.length > 0) {
    lines.push(`Column loading (Module 6): ${result.loading.loadedForThisQuery.join(', ')} had to be loaded before the scan could read it.`);
  }
  if (result.loading.alreadyResident.length > 0) {
    lines.push(`Already resident: ${result.loading.alreadyResident.join(', ')}. Nothing was loaded for ${result.loading.alreadyResident.length === 1 ? 'it' : 'them'}.`);
  }
  lines.push(
    `Segment elimination (Module 4): ${fmt(result.eliminatedSegments)} of ${fmt(result.totalSegments)} segment(s) eliminated.${result.elimination.available ? '' : ` ${result.elimination.note}`}`,
  );
  lines.push(
    `Scan: ${fmt(result.rowsInCandidateSegments)} rows sit in candidate segments, but only ${fmt(result.matchingRows)} actually match the filter. The other ${fmt(result.candidateRowsNotMatching)} were read and then discarded. Candidate rows are not matching rows.`,
  );
  lines.push(`Aggregation: ${result.aggregation.function}(${result.aggregation.columnName}) = ${result.aggregation.display}.`);
  lines.push('Formula Engine: the result is handed back to it conceptually. Its own work is not simulated.');
  return lines;
}

export interface ScanScenario {
  id: string;
  label: string;
  description: string;
  query: ScanQuery;
}

const MARCH_2023: EliminationPredicate = { operator: 'BETWEEN', value: '2023-03-01', upperValue: '2023-03-31' };

export const SCAN_SCENARIOS: ReadonlyArray<ScanScenario> = [
  {
    id: 'SUM_REVENUE',
    label: 'Scan Revenue and calculate SUM',
    description: 'No filter: every segment is a candidate and every row is read.',
    query: { aggregation: 'SUM', measureColumn: 'Revenue', filter: null, rowOrder: 'AS_LOADED' },
  },
  {
    id: 'REVENUE_BY_CUSTOMERID',
    label: 'Revenue for CustomerID 100 to 200',
    description: 'CustomerID is stored in ascending order, so the min/max ranges of the segments do not overlap and elimination works well.',
    query: {
      aggregation: 'SUM',
      measureColumn: 'Revenue',
      filter: { columnName: 'CustomerID', predicate: { operator: 'BETWEEN', value: 100, upperValue: 200 } },
      rowOrder: 'AS_LOADED',
    },
  },
  {
    id: 'REVENUE_BY_REGION',
    label: 'Revenue for Region = East',
    description: 'Text filter: elimination is not available in this simulator, so every segment is a candidate.',
    query: {
      aggregation: 'SUM',
      measureColumn: 'Revenue',
      filter: { columnName: 'Region', predicate: { operator: 'EQ', value: 'East' } },
      rowOrder: 'AS_LOADED',
    },
  },
  {
    id: 'DATE_RANGE_AS_LOADED',
    label: 'Revenue for March 2023, table as loaded',
    description: 'The synthetic purchase dates are scattered, so every segment spans the whole date range and none can be eliminated.',
    query: { aggregation: 'SUM', measureColumn: 'Revenue', filter: { columnName: 'LastPurchaseDate', predicate: MARCH_2023 }, rowOrder: 'AS_LOADED' },
  },
  {
    id: 'DATE_RANGE_SORTED',
    label: 'Revenue for March 2023, table sorted by date',
    description: 'The same query, with the table stored sorted by LastPurchaseDate: segment ranges no longer overlap, so some can be eliminated. The answer is the same.',
    query: { aggregation: 'SUM', measureColumn: 'Revenue', filter: { columnName: 'LastPurchaseDate', predicate: MARCH_2023 }, rowOrder: 'SORTED_ASCENDING' },
  },
  {
    id: 'MAX_PURCHASE_DATE',
    label: 'Latest LastPurchaseDate (MAX)',
    description: 'A date aggregation over every row.',
    query: { aggregation: 'MAX', measureColumn: 'LastPurchaseDate', filter: null, rowOrder: 'AS_LOADED' },
  },
];

/** Runs one of the named scenarios on the session. Throws RangeError for an unknown scenario. */
export function runScanScenario(session: LoadingSession, scenarioId: string): StorageScanResult {
  const scenario = SCAN_SCENARIOS.find((entry) => entry.id === scenarioId);
  if (!scenario) throw new RangeError(`Unknown scenario: ${scenarioId}`);
  return runStorageScan(session, scenario.query);
}

export function getScanSourceReferences(): SourceReference[] {
  const own: SourceReference[] = [
    {
      title: 'Analysis Services tabular query interleaving - Microsoft Learn',
      url: 'https://learn.microsoft.com/en-us/analysis-services/tabular-models/query-interleaving',
      section: 'A DAX query can result in multiple VertiPaq storage engine queries; formula engine operations are separate',
    },
    {
      title: 'How Direct Lake works - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-how-it-works',
      section: 'Columns are loaded when a query first needs them, and stay resident until evicted',
    },
  ];
  const known = new Set(own.map((source) => source.url));
  return [...own, ...getEliminationSourceReferences().filter((source) => !known.has(source.url))];
}
