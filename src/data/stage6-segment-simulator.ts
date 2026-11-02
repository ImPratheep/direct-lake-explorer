// Stage 6, Module 3 - Segment Explorer simulation logic
//
// [SIMULATION] Educational model. It is NOT Microsoft's VertiPaq implementation.
//
// What Microsoft documents (Microsoft Learn, DAX INFO.STORAGETABLECOLUMNSEGMENTS):
//   [DOCUMENTED] Column storage in a semantic model is reported per segment, with a segment number,
//                a record count, allocated and used size, and the count of bits needed to store the Data IDs.
//   The page documents no fixed segment row count and no min/max metadata.
//
// What this file models:
//   [SIMULATION] Segment size is a configurable educational assumption, not a limit of any real engine.
//                Boundaries are simply every N rows in the stored row order; real boundaries are an engine decision
//                and are not assumed to be evenly distributed in value.
//   [SIMPLIFIED MODEL] One dictionary per column, shared by every segment of that column. Each row stores a
//                bit-packed ID sized for the whole dictionary. Nulls use one reserved ID and no dictionary bytes.
//   [SIMPLIFIED MODEL] Per-segment min, max, distinct and null counts are computed here from the actual column values.
//                Whether and how the engine stores equivalent metadata is [PROPRIETARY INTERNAL].
//   Sizes use the same educational constants as Modules 1 and 2. They are not measurements.

import { ColumnOrderState, EncodingColumn, SegmentColumn, SegmentDetail, SegmentExplorerResult, SegmentRowOrder, SegmentValue, SourceReference } from '../types';
import { bitsRequired, modelledValueBytes } from './stage6-encoding-simulator';

// [SIMPLIFIED MODEL] Educational constants, not engine values.
export const MODELLED_SEGMENT_METADATA_BYTES = 64;
export const DEFAULT_SEGMENT_ROW_COUNT = 500;

type Comparable = number | string;

/** Numbers sort numerically, strings by code unit (ISO dates therefore sort chronologically). */
export function compareSegmentValues(a: Comparable, b: Comparable): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return typeof a === 'number' ? -1 : 1;
}

/** Order of the non-null values as stored. Nulls are ignored. */
export function detectColumnOrder(values: SegmentValue[]): ColumnOrderState {
  let previous: Comparable | undefined;
  let hasPrevious = false;
  let ascending = true;
  let descending = true;

  for (const value of values) {
    if (value === null) continue;
    if (hasPrevious) {
      const comparison = compareSegmentValues(previous as Comparable, value);
      if (comparison > 0) ascending = false;
      if (comparison < 0) descending = false;
    }
    previous = value;
    hasPrevious = true;
  }

  if (!hasPrevious) return 'EMPTY';
  if (ascending && descending) return 'CONSTANT';
  if (ascending) return 'ASCENDING';
  if (descending) return 'DESCENDING';
  return 'UNORDERED';
}

export function toSegmentColumn(column: EncodingColumn): SegmentColumn {
  return { ...column, values: column.values.slice() };
}

// Small integer hash (murmur3 finaliser) mapped to [0, 1). Deterministic and well mixed.
function hashToUnit(index: number): number {
  let h = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * [SIMULATION] Replaces about `nullPercent` percent of the values with null, at deterministic pseudo-random rows.
 * The share is approximate: 0 gives no nulls and 100 makes every value null.
 */
export function applyNullPattern(column: EncodingColumn, nullPercent: number): SegmentColumn {
  if (!Number.isFinite(nullPercent) || nullPercent < 0 || nullPercent > 100) {
    throw new RangeError('nullPercent must be between 0 and 100');
  }
  const threshold = nullPercent / 100;
  return {
    ...column,
    values: column.values.map((value, index): SegmentValue => (hashToUnit(index) < threshold ? null : value)),
  };
}

/** Row positions that put `values` in ascending order, nulls last, ties kept in stored order. */
export function sortedRowOrder(values: SegmentValue[]): number[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.index - b.index;
        return a.value === null ? 1 : -1;
      }
      return compareSegmentValues(a.value, b.value) || a.index - b.index;
    })
    .map((entry) => entry.index);
}

function sortAscendingNullsLast(values: SegmentValue[]): SegmentValue[] {
  return sortedRowOrder(values).map((index) => values[index]);
}

interface SegmentSummary {
  nullCount: number;
  distinctCount: number;
  min: Comparable | null;
  max: Comparable | null;
  average?: number;
  standardDeviation?: number;
}

function summarise(rows: SegmentValue[], numeric: boolean): SegmentSummary {
  const distinct = new Set<Comparable>();
  let nullCount = 0;
  let min: Comparable | null = null;
  let max: Comparable | null = null;
  const numbers: number[] = [];

  for (const value of rows) {
    if (value === null) {
      nullCount++;
      continue;
    }
    distinct.add(value);
    if (min === null || compareSegmentValues(value, min) < 0) min = value;
    if (max === null || compareSegmentValues(value, max) > 0) max = value;
    if (numeric && typeof value === 'number') numbers.push(value);
  }

  const summary: SegmentSummary = { nullCount, distinctCount: distinct.size, min, max };
  // Average and spread are only meaningful for INTEGER and DECIMAL columns.
  if (numeric && numbers.length > 0) {
    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const variance = numbers.reduce((sum, n) => sum + (n - mean) ** 2, 0) / numbers.length;
    summary.average = mean;
    summary.standardDeviation = Math.sqrt(variance);
  }
  return summary;
}

/** Marks segments whose closed [min, max] range intersects another segment's range. All-null segments are skipped. */
function findOverlappingSegments(segments: Array<{ min: Comparable | null; max: Comparable | null }>): boolean[] {
  const flags = segments.map(() => false);
  const ranged = segments
    .map((segment, index) => ({ index, min: segment.min, max: segment.max }))
    .filter((entry): entry is { index: number; min: Comparable; max: Comparable } => entry.min !== null && entry.max !== null)
    .sort((a, b) => compareSegmentValues(a.min, b.min) || compareSegmentValues(a.max, b.max));

  let runningMax: Comparable | null = null;
  ranged.forEach((entry, position) => {
    const overlapsEarlier = runningMax !== null && compareSegmentValues(runningMax, entry.min) >= 0;
    const next = ranged[position + 1];
    const overlapsLater = next !== undefined && compareSegmentValues(next.min, entry.max) <= 0;
    if (overlapsEarlier || overlapsLater) flags[entry.index] = true;
    if (runningMax === null || compareSegmentValues(entry.max, runningMax) > 0) runningMax = entry.max;
  });
  return flags;
}

/**
 * [SIMULATION] Splits a column into segments of `segmentRowCount` rows (the last may be shorter)
 * and computes real statistics from the values in each segment.
 * Throws RangeError unless `segmentRowCount` is a whole number of at least 1.
 */
export function generateSegments(
  column: SegmentColumn,
  segmentRowCount: number,
  options: { rowOrder?: SegmentRowOrder } = {},
): SegmentExplorerResult {
  if (!Number.isInteger(segmentRowCount) || segmentRowCount < 1) {
    throw new RangeError('segmentRowCount must be a whole number of at least 1');
  }

  const rowOrder: SegmentRowOrder = options.rowOrder ?? 'AS_LOADED';
  const loadedOrder = detectColumnOrder(column.values);
  const rows = rowOrder === 'SORTED_ASCENDING' ? sortAscendingNullsLast(column.values) : column.values.slice();
  const segmentedOrder = rowOrder === 'AS_LOADED' ? loadedOrder : detectColumnOrder(rows);

  // One dictionary for the whole column, shared by every segment.
  const distinctValues = new Set<Comparable>();
  let nullCount = 0;
  for (const value of rows) {
    if (value === null) nullCount++;
    else distinctValues.add(value);
  }
  const cardinality = distinctValues.size;
  const hasNullEntry = nullCount > 0;
  const entryCount = cardinality + (hasNullEntry ? 1 : 0);
  const bitsPerId = bitsRequired(entryCount);
  let dictionaryBytes = 0;
  for (const value of distinctValues) {
    dictionaryBytes += modelledValueBytes(column.dataType, value);
  }

  const numeric = column.dataType === 'INTEGER' || column.dataType === 'DECIMAL';
  const segmentCount = Math.ceil(rows.length / segmentRowCount);
  const ranges: Array<{ min: Comparable | null; max: Comparable | null }> = [];
  const segments: SegmentDetail[] = [];

  for (let id = 0; id < segmentCount; id++) {
    const start = id * segmentRowCount;
    const end = Math.min(start + segmentRowCount, rows.length);
    const summary = summarise(rows.slice(start, end), numeric);
    const rowCount = end - start;
    const dataBytes = Math.ceil((rowCount * bitsPerId) / 8);

    ranges.push({ min: summary.min, max: summary.max });
    segments.push({
      segmentId: id,
      startRowIndex: start,
      endRowIndex: end,
      rowCount,
      size: dataBytes + MODELLED_SEGMENT_METADATA_BYTES,
      statistics: {
        minValue: summary.min,
        maxValue: summary.max,
        distinctCount: summary.distinctCount,
        nullCount: summary.nullCount,
        averageValue: summary.average,
        standardDeviation: summary.standardDeviation,
      },
      dictionaryId: 0,
      dataBytes,
      metadataBytes: MODELLED_SEGMENT_METADATA_BYTES,
      bitsPerId,
      dictionaryEntriesReferenced: summary.distinctCount,
      dictionaryCoverage: cardinality > 0 ? summary.distinctCount / cardinality : 0,
      isPartial: rowCount < segmentRowCount,
      rangeOverlapsAnotherSegment: false,
    });
  }

  const overlapFlags = findOverlappingSegments(ranges);
  segments.forEach((segment, index) => {
    segment.rangeOverlapsAnotherSegment = overlapFlags[index];
  });

  const dataTotal = segments.reduce((sum, segment) => sum + segment.dataBytes, 0);
  const metadataTotal = segments.reduce((sum, segment) => sum + segment.metadataBytes, 0);
  const totalBytes = dataTotal + metadataTotal + dictionaryBytes;

  return {
    columnName: column.name,
    sourceType: column.sourceType,
    dataType: column.dataType,
    totalRows: rows.length,
    segmentRowCount,
    rowOrder,
    loadedOrder,
    segmentedOrder,
    nullCount,
    dictionary: { cardinality, hasNullEntry, entryCount, bitsPerId, bytes: dictionaryBytes },
    segments,
    totals: { dataBytes: dataTotal, metadataBytes: metadataTotal, dictionaryBytes, totalBytes },
    averageSegmentBytes:
      segments.length > 0 ? Math.round(segments.reduce((sum, segment) => sum + segment.size, 0) / segments.length) : 0,
    overlappingSegmentCount: overlapFlags.filter(Boolean).length,
  };
}

/** Plain-language reading of one result. It describes this model only. */
export function explainSegmentResult(result: SegmentExplorerResult): string[] {
  const fmt = (n: number): string => n.toLocaleString('en-US');
  if (result.totalRows === 0) {
    return ['There are no rows, so there are no segments and nothing to compare.'];
  }

  const lines: string[] = [];
  const count = result.segments.length;
  const last = result.segments[count - 1];
  lines.push(
    `${fmt(result.totalRows)} rows at ${fmt(result.segmentRowCount)} rows per segment give ${fmt(count)} segment(s)` +
      (last.isPartial ? `; the last one holds only ${fmt(last.rowCount)} rows.` : '.') +
      ' The segment size is an educational setting, not an engine limit.',
  );

  if (result.overlappingSegmentCount === 0) {
    lines.push('No segment has a min-max range that overlaps another segment in this model.');
  } else {
    lines.push(
      `${fmt(result.overlappingSegmentCount)} of ${fmt(count)} segments have a min-max range that overlaps another ` +
        "segment's range. A range filter could not rule those segments out from min and max alone (see Module 4).",
    );
  }

  const coverages = result.segments.map((segment) => segment.dictionaryEntriesReferenced);
  lines.push(
    `All segments share one dictionary of ${fmt(result.dictionary.cardinality)} distinct value(s); each row stores a ` +
      `${result.dictionary.bitsPerId}-bit ID. A segment references between ${fmt(Math.min(...coverages))} and ` +
      `${fmt(Math.max(...coverages))} of those entries.`,
  );

  if (result.nullCount > 0) {
    lines.push(`${fmt(result.nullCount)} null row(s) use one reserved ID and add no dictionary bytes in this model.`);
  }
  return lines;
}

export function getSegmentSourceReferences(): SourceReference[] {
  return [
    {
      title: 'INFO.STORAGETABLECOLUMNSEGMENTS function (DAX)',
      url: 'https://learn.microsoft.com/en-us/dax/info-storagetablecolumnsegments-function-dax',
      section: 'Per-segment record count, size and bits needed for Data IDs',
    },
    {
      title: 'Direct Lake overview',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-overview',
      section: 'Direct Lake storage mode in Microsoft Fabric',
    },
    {
      title: 'Apache Parquet file format',
      url: 'https://parquet.apache.org/docs/file-format/',
      section: 'Column chunks and file metadata (a different format from VertiPaq)',
    },
  ];
}
