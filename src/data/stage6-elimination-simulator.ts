// Stage 6, Module 4 - Segment Elimination simulation logic
//
// [SIMULATION] Educational model. It is NOT Microsoft's VertiPaq implementation.
//
// Input is the segment metadata produced by Module 3 (min, max, null count and row count per segment).
// This module never creates segments or statistics of its own.
//
// What Microsoft documents:
//   [DOCUMENTED] Delta Lake records per-file min, max and null count for indexed columns, and the engine
//                skips a file when the predicate falls outside that file's range (Microsoft Fabric,
//                "File skipping for Delta tables"). That is the Delta file layer, not VertiPaq segments.
//   [PROPRIETARY INTERNAL] Whether VertiPaq segments carry min/max metadata, and how any such metadata is used,
//                is not covered by the documentation reviewed. This module does not claim it.
//
// What this file models:
//   [SIMPLIFIED MODEL] A possibility test. A segment can be ELIMINATED only when its min/max range proves that no
//                non-null value can satisfy the predicate. Otherwise it is SCANNED, which means "cannot be ruled out",
//                never "contains matching rows".
//   Comparisons with null are never true, so null rows never keep a segment alive. A segment holding only nulls is
//                always eliminated.
//   Ranges are closed: a predicate that touches a segment's min or max exactly is not eliminated when a value equal
//                to that bound could satisfy it.

import {
  EliminationDecision,
  EliminationOperator,
  EliminationPredicate,
  EliminationReasonCode,
  EncodingDataType,
  Segment,
  SegmentEliminationDetail,
  SegmentEliminationResult,
  SourceReference,
} from '../types';
import { compareSegmentValues } from './stage6-segment-simulator';
import { dayNumberToIsoDate, isoDateToDayNumber } from './stage6-synthetic-dataset';

type Comparable = number | string;

export const ELIMINATION_OPERATORS: ReadonlyArray<{ value: EliminationOperator; label: string; symbol: string }> = [
  { value: 'GT', label: 'Greater than', symbol: '>' },
  { value: 'GTE', label: 'Greater than or equal to', symbol: '>=' },
  { value: 'LT', label: 'Less than', symbol: '<' },
  { value: 'LTE', label: 'Less than or equal to', symbol: '<=' },
  { value: 'EQ', label: 'Equal to', symbol: '=' },
  { value: 'NEQ', label: 'Not equal to', symbol: '!=' },
  { value: 'BETWEEN', label: 'Between (inclusive)', symbol: 'BETWEEN' },
];

const operatorSymbol = (operator: EliminationOperator): string =>
  ELIMINATION_OPERATORS.find((entry) => entry.value === operator)?.symbol ?? operator;

function bound(value: Comparable | undefined): Comparable {
  return value as Comparable;
}

function isValidIsoDate(value: unknown): boolean {
  return (
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayNumberToIsoDate(isoDateToDayNumber(value)) === value
  );
}

function checkBound(value: unknown, dataType: EncodingDataType, label: string): string | null {
  if (dataType === 'DATE') {
    return isValidIsoDate(value) ? null : `${label} must be a valid date in yyyy-mm-dd form.`;
  }
  return typeof value === 'number' && Number.isFinite(value) ? null : `${label} must be a number.`;
}

/**
 * Returns a message when the predicate cannot be evaluated for this column type, otherwise null.
 * The predicate value must match the column type (a number for numeric columns, an ISO date for dates).
 * A BETWEEN whose lower bound is above its upper bound is valid: it matches nothing.
 */
export function validateEliminationPredicate(predicate: EliminationPredicate, dataType: EncodingDataType): string | null {
  if (dataType === 'TEXT') {
    return 'Text columns are not supported by this module. Choose a numeric or date column.';
  }
  const valueError = checkBound(predicate.value, dataType, predicate.operator === 'BETWEEN' ? 'The lower bound' : 'The value');
  if (valueError) return valueError;
  if (predicate.operator === 'BETWEEN') {
    return checkBound(predicate.upperValue, dataType, 'The upper bound');
  }
  return null;
}

export function formatEliminationValue(value: Comparable | null | undefined, scale: number): string {
  if (value === null || value === undefined) return '-';
  return typeof value === 'number' && scale > 0 ? value.toFixed(scale) : String(value);
}

export function formatEliminationPredicate(columnName: string, predicate: EliminationPredicate, scale: number): string {
  const lower = formatEliminationValue(predicate.value, scale);
  if (predicate.operator === 'BETWEEN') {
    return `${columnName} BETWEEN ${lower} AND ${formatEliminationValue(predicate.upperValue, scale)}`;
  }
  return `${columnName} ${operatorSymbol(predicate.operator)} ${lower}`;
}

interface Verdict {
  decision: EliminationDecision;
  code: EliminationReasonCode;
}

const eliminated = (code: EliminationReasonCode): Verdict => ({ decision: 'ELIMINATED', code });
const scanned = (satisfies: boolean): Verdict => ({
  decision: 'SCANNED',
  code: satisfies ? 'RANGE_SATISFIES' : 'RANGE_OVERLAPS',
});

/** Decision for one segment from its non-null min and max only. */
function decide(min: Comparable, max: Comparable, predicate: EliminationPredicate): Verdict {
  const value = bound(predicate.value);
  const cmp = compareSegmentValues;

  switch (predicate.operator) {
    case 'GT':
      return cmp(max, value) <= 0 ? eliminated('OUTSIDE_RANGE') : scanned(cmp(min, value) > 0);
    case 'GTE':
      return cmp(max, value) < 0 ? eliminated('OUTSIDE_RANGE') : scanned(cmp(min, value) >= 0);
    case 'LT':
      return cmp(min, value) >= 0 ? eliminated('OUTSIDE_RANGE') : scanned(cmp(max, value) < 0);
    case 'LTE':
      return cmp(min, value) > 0 ? eliminated('OUTSIDE_RANGE') : scanned(cmp(max, value) <= 0);
    case 'EQ':
      if (cmp(value, min) < 0 || cmp(value, max) > 0) return eliminated('OUTSIDE_RANGE');
      return scanned(cmp(min, max) === 0);
    case 'NEQ':
      // Only a segment whose every non-null value equals the excluded value can be ruled out.
      if (cmp(min, max) === 0 && cmp(min, value) === 0) return eliminated('ALL_EQUAL_EXCLUDED');
      return scanned(cmp(value, min) < 0 || cmp(value, max) > 0);
    case 'BETWEEN': {
      const upper = bound(predicate.upperValue);
      if (cmp(max, value) < 0 || cmp(min, upper) > 0) return eliminated('OUTSIDE_RANGE');
      return scanned(cmp(value, min) <= 0 && cmp(max, upper) <= 0);
    }
    default:
      return scanned(false);
  }
}

function buildReason(
  verdict: Verdict,
  min: Comparable | null,
  max: Comparable | null,
  nullCount: number,
  predicate: EliminationPredicate,
  scale: number,
): string {
  const f = (v: Comparable | null | undefined): string => formatEliminationValue(v, scale);
  const range = `${f(min)} to ${f(max)}`;
  const value = f(predicate.value);
  const upper = f(predicate.upperValue);
  let text: string;

  switch (verdict.code) {
    case 'EMPTY_PREDICATE':
      text = `The lower bound ${value} is above the upper bound ${upper}, so no value can satisfy this predicate.`;
      break;
    case 'ALL_NULL':
      text = 'This segment holds only nulls. A null never satisfies a comparison, so it can be eliminated.';
      break;
    case 'ALL_EQUAL_EXCLUDED':
      text = `Every non-null value equals ${value} (min and max are both ${f(min)}), so none can be different from ${value}.`;
      break;
    case 'OUTSIDE_RANGE':
      switch (predicate.operator) {
        case 'GT':
          text = `Range ${range}: max ${f(max)} is not greater than ${value}, so no value can be greater than ${value}.`;
          break;
        case 'GTE':
          text = `Range ${range}: max ${f(max)} is below ${value}, so no value can reach ${value}.`;
          break;
        case 'LT':
          text = `Range ${range}: min ${f(min)} is not less than ${value}, so no value can be less than ${value}.`;
          break;
        case 'LTE':
          text = `Range ${range}: min ${f(min)} is above ${value}, so no value can be at most ${value}.`;
          break;
        case 'EQ':
          text = `${value} is outside the range ${range}, so no value can equal it.`;
          break;
        default:
          text = `The range ${range} does not intersect ${value} to ${upper}, so no value can fall inside it.`;
          break;
      }
      break;
    case 'RANGE_SATISFIES':
      text =
        `Every non-null value in the range ${range} satisfies the predicate, so this segment's rows are needed. ` +
        'It is scanned because there is nothing to skip, not because elimination was uncertain.';
      break;
    default:
      text =
        `The range ${range} overlaps the predicate, so min and max alone cannot rule this segment out. ` +
        'It may or may not hold matching rows.';
      break;
  }

  if (nullCount > 0) {
    text += ` Its ${nullCount.toLocaleString('en-US')} null row(s) never match.`;
  }
  return text;
}

const asComparable = (value: unknown): Comparable | null =>
  typeof value === 'number' || typeof value === 'string' ? value : null;

/**
 * [SIMPLIFIED MODEL] Decides, for each segment, whether its min/max metadata can rule it out for the predicate.
 * `segments` should come from Module 3's generateSegments. Throws RangeError for an invalid predicate.
 * SCANNED means "cannot be ruled out from min/max", not "contains matching rows".
 */
export function evaluateSegmentElimination(
  segments: Segment[],
  predicate: EliminationPredicate,
  options: { columnName: string; dataType: EncodingDataType; scale?: number },
): SegmentEliminationResult {
  const problem = validateEliminationPredicate(predicate, options.dataType);
  if (problem) {
    throw new RangeError(problem);
  }

  const scale = options.scale ?? 0;
  const emptyPredicate =
    predicate.operator === 'BETWEEN' && compareSegmentValues(bound(predicate.value), bound(predicate.upperValue)) > 0;

  const details: SegmentEliminationDetail[] = segments.map((segment) => {
    const min = asComparable(segment.statistics.minValue);
    const max = asComparable(segment.statistics.maxValue);
    const nullCount = segment.statistics.nullCount;

    let verdict: Verdict;
    if (emptyPredicate) verdict = eliminated('EMPTY_PREDICATE');
    else if (min === null || max === null) verdict = eliminated('ALL_NULL');
    else verdict = decide(min, max, predicate);

    return {
      segmentId: segment.segmentId,
      startRowIndex: segment.startRowIndex,
      endRowIndex: segment.endRowIndex,
      rowCount: segment.rowCount,
      nullCount,
      minValue: min,
      maxValue: max,
      decision: verdict.decision,
      reasonCode: verdict.code,
      reason: buildReason(verdict, min, max, nullCount, predicate, scale),
    };
  });

  const eliminatedDetails = details.filter((d) => d.decision === 'ELIMINATED');
  const scannedDetails = details.filter((d) => d.decision === 'SCANNED');
  const totalRows = details.reduce((sum, d) => sum + d.rowCount, 0);
  const rowsAvoided = eliminatedDetails.reduce((sum, d) => sum + d.rowCount, 0);

  return {
    columnName: options.columnName,
    dataType: options.dataType,
    predicate,
    predicateText: formatEliminationPredicate(options.columnName, predicate, scale),
    totalSegments: details.length,
    segmentsScanned: scannedDetails.length,
    segmentsEliminated: eliminatedDetails.length,
    totalRows,
    rowsPotentiallyScanned: totalRows - rowsAvoided,
    rowsPotentiallyAvoided: rowsAvoided,
    rowEliminationPercentage: totalRows > 0 ? (rowsAvoided / totalRows) * 100 : 0,
    segmentEliminationPercentage: details.length > 0 ? (eliminatedDetails.length / details.length) * 100 : 0,
    scannedOverlapCount: scannedDetails.filter((d) => d.reasonCode === 'RANGE_OVERLAPS').length,
    scannedSatisfiedCount: scannedDetails.filter((d) => d.reasonCode === 'RANGE_SATISFIES').length,
    nullRowCount: details.reduce((sum, d) => sum + d.nullCount, 0),
    segments: details,
  };
}

/** Plain-language reading of one result. It describes this model only and never promises matching rows. */
export function explainEliminationResult(result: SegmentEliminationResult): string[] {
  const fmt = (n: number): string => n.toLocaleString('en-US');
  if (result.totalSegments === 0) {
    return ['There are no segments, so there is nothing to eliminate or scan.'];
  }

  const lines: string[] = [
    `${fmt(result.segmentsScanned)} of ${fmt(result.totalSegments)} segments (${fmt(result.rowsPotentiallyScanned)} of ` +
      `${fmt(result.totalRows)} rows) cannot be ruled out. ${fmt(result.segmentsEliminated)} segment(s) can be eliminated ` +
      `from min and max alone, avoiding ${fmt(result.rowsPotentiallyAvoided)} rows (${result.rowEliminationPercentage.toFixed(1)}%).`,
  ];

  if (result.scannedOverlapCount > 0) {
    lines.push(
      `${fmt(result.scannedOverlapCount)} scanned segment(s) have a min-max range that overlaps the predicate. ` +
        'Overlap only means the metadata cannot rule them out; they may or may not contain matching rows.',
    );
  }
  if (result.scannedSatisfiedCount > 0) {
    lines.push(
      `${fmt(result.scannedSatisfiedCount)} scanned segment(s) have a range entirely inside the predicate, so every ` +
        'non-null value there would match. Their rows are needed, so there is nothing to skip.',
    );
  }
  if (result.nullRowCount > 0) {
    lines.push(
      `${fmt(result.nullRowCount)} null row(s) never satisfy these comparisons, so nulls do not keep a segment alive ` +
        'and a segment of only nulls is always eliminated.',
    );
  }
  lines.push('Elimination is a possibility test on simulated metadata: it can rule a segment out, never prove a match.');
  return lines;
}

export interface EliminationRangeChart {
  hasDomain: boolean;
  domainMin: number | null;
  domainMax: number | null;
  bars: Array<{ segmentId: number; leftPct: number; widthPct: number } | null>;
  bands: Array<{ leftPct: number; widthPct: number }>;
  markerPct: number | null;
}

const MIN_BAR_WIDTH_PCT = 1.5;

/** Geometry for the range chart: each segment's min-max bar and the predicate region on one shared axis. */
export function buildEliminationRangeChart(result: SegmentEliminationResult): EliminationRangeChart {
  const toNumber = (value: Comparable): number => (typeof value === 'string' ? isoDateToDayNumber(value) : value);
  const ranged = result.segments.filter((s) => s.minValue !== null && s.maxValue !== null);

  if (ranged.length === 0) {
    return { hasDomain: false, domainMin: null, domainMax: null, bars: result.segments.map(() => null), bands: [], markerPct: null };
  }

  const domainMin = Math.min(...ranged.map((s) => toNumber(s.minValue as Comparable)));
  const domainMax = Math.max(...ranged.map((s) => toNumber(s.maxValue as Comparable)));
  const span = domainMax - domainMin;
  const pos = (x: number): number => (span === 0 ? 50 : ((x - domainMin) / span) * 100);
  const clamp = (x: number): number => Math.max(0, Math.min(100, x));

  const bars = result.segments.map((segment) => {
    if (segment.minValue === null || segment.maxValue === null) return null;
    const left = pos(toNumber(segment.minValue));
    const widthPct = Math.max(MIN_BAR_WIDTH_PCT, pos(toNumber(segment.maxValue)) - left);
    return { segmentId: segment.segmentId, leftPct: Math.min(left, 100 - widthPct), widthPct };
  });

  const band = (from: number, to: number): { leftPct: number; widthPct: number } | null => {
    const left = clamp(from);
    const width = clamp(to) - left;
    return width > 0 ? { leftPct: left, widthPct: width } : null;
  };

  const p = result.predicate;
  const at = pos(toNumber(bound(p.value)));
  let bands: Array<{ leftPct: number; widthPct: number } | null> = [];
  let markerPct: number | null = null;

  switch (p.operator) {
    case 'GT':
    case 'GTE':
      bands = [band(at, 100)];
      break;
    case 'LT':
    case 'LTE':
      bands = [band(0, at)];
      break;
    case 'EQ':
      markerPct = at >= 0 && at <= 100 ? at : null;
      break;
    case 'NEQ':
      bands = [band(0, at), band(at, 100)];
      markerPct = at >= 0 && at <= 100 ? at : null;
      break;
    case 'BETWEEN': {
      const upper = pos(toNumber(bound(p.upperValue)));
      if (at <= upper) bands = [band(at, upper)];
      break;
    }
  }

  return {
    hasDomain: true,
    domainMin,
    domainMax,
    bars,
    bands: bands.filter((b): b is { leftPct: number; widthPct: number } => b !== null),
    markerPct,
  };
}

export function getEliminationSourceReferences(): SourceReference[] {
  return [
    {
      title: 'File skipping for Delta tables - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/data-engineering/delta-lake-file-skipping',
      section: 'Delta Lake records per-file min, max and null count; files outside the predicate range are skipped',
    },
    {
      title: 'INFO.STORAGETABLECOLUMNSEGMENTS function (DAX)',
      url: 'https://learn.microsoft.com/en-us/dax/info-storagetablecolumnsegments-function-dax',
      section: 'Column storage is reported per segment (it does not document min/max segment metadata)',
    },
    {
      title: 'Direct Lake overview',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-overview',
      section: 'Direct Lake storage mode in Microsoft Fabric',
    },
  ];
}
