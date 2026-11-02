// Stage 6, Module 5 - Column Compression simulation logic
//
// [SIMULATION] Educational model. It is NOT Microsoft's VertiPaq compression engine, and no ratio produced here
// is a VertiPaq measurement.
//
// What Microsoft documents:
//   [DOCUMENTED] Microsoft Learn, "Data reduction techniques for Import modeling": VertiPaq keeps separate internal
//                data structures per column; numeric data uses value encoding; text and other non-numeric data uses
//                hash encoding, which assigns a numeric identifier to each unique value; converting text to numbers
//                can reduce size noticeably, especially for unique or high-cardinality columns.
//   [DOCUMENTED] Microsoft Learn, TOM Column.EncodingHint: a numeric column may use value-based or hash-based
//                encoding; the server normally detects which, and re-encoding may occur later.
//   [DOCUMENTED] Microsoft Learn, INFO.STORAGETABLECOLUMNSEGMENTS: column storage is reported per segment, with sizes
//                and the count of bits needed to store the Data IDs.
//
// What this file models (all [SIMPLIFIED MODEL]; the engine's choice of encoding and its real sizes are
// [PROPRIETARY INTERNAL] and are not modelled):
//   - Segments, one shared dictionary per column (counted once), bit-packed IDs and per-segment metadata come from the
//     Module 3 segment model, so the two modules always agree.
//   - Dictionary model: every distinct value stored once; each row stores a bit-packed ID.
//   - Value model: (value - column minimum) bit-packed, no dictionary, numeric and date columns only (Module 2).
//   - The user chooses between the two. Nothing here selects an encoding or claims the engine would.
//   - Original (uncompressed) size: 8 bytes per number or date; a 4-byte length prefix plus UTF-8 bytes per text value.
//     A null takes the same fixed width (just the prefix for text).
//   - No run-length encoding or other compression is modelled, so row order does not change any size.

import {
  CardinalityBand,
  CompressionComparisonRow,
  CompressionEncodingModel,
  CompressionEstimate,
  CompressionInputs,
  CompressionScenarioId,
  EncodingColumn,
  EncodingDataType,
  SegmentColumn,
  SegmentDetail,
  SegmentValue,
  SourceReference,
} from '../types';
import {
  bitsRequired,
  modelledValueBytes,
  NUMERIC_VALUE_BYTES,
  simulateValueEncoding,
  TEXT_LENGTH_PREFIX_BYTES,
  VALUE_ENCODING_METADATA_BYTES,
} from './stage6-encoding-simulator';
import { applyNullPattern, DEFAULT_SEGMENT_ROW_COUNT, generateSegments, MODELLED_SEGMENT_METADATA_BYTES } from './stage6-segment-simulator';
import { CUSTOMER_COLUMNS, dayNumberToIsoDate, generateSyntheticCustomerRows, getCustomerEncodingColumn, isoDateToDayNumber } from './stage6-synthetic-dataset';

// Teaching labels for the distinct-to-rows ratio. They are not engine thresholds.
export const LOW_CARDINALITY_RATIO = 0.1;
export const HIGH_CARDINALITY_RATIO = 0.9;

export interface CompressionScenarioDefinition {
  id: CompressionScenarioId;
  label: string;
  description: string;
  dataType: EncodingDataType | null; // null: depends on the chosen Customer column
  sourceType: string;
  cardinalityControl: 'USER' | 'ROWS' | 'DATA';
  defaultCardinality: number;
  maxCardinality: number;
}

export const COMPRESSION_SCENARIOS: ReadonlyArray<CompressionScenarioDefinition> = [
  {
    id: 'CUSTOMER_COLUMN',
    label: 'Customer table column',
    description: 'A column of the shared synthetic Customer table. Its cardinality comes from the data.',
    dataType: null,
    sourceType: '',
    cardinalityControl: 'DATA',
    defaultCardinality: 1,
    maxCardinality: 5000,
  },
  {
    id: 'LOW_CARDINALITY_TEXT',
    label: 'Low-cardinality text',
    description: 'Text drawn repeatedly from a small set of values, such as regions.',
    dataType: 'TEXT',
    sourceType: 'utf8',
    cardinalityControl: 'USER',
    defaultCardinality: 5,
    maxCardinality: 1000,
  },
  {
    id: 'HIGH_CARDINALITY_TEXT',
    label: 'High-cardinality text',
    description: 'Text where every row is a different value, such as customer names or codes.',
    dataType: 'TEXT',
    sourceType: 'utf8',
    cardinalityControl: 'ROWS',
    defaultCardinality: 1000,
    maxCardinality: 5000,
  },
  {
    id: 'SEQUENTIAL_INTEGERS',
    label: 'Sequential integers',
    description: 'Integers 1, 2, 3, ... one per row, such as a surrogate key.',
    dataType: 'INTEGER',
    sourceType: 'int64',
    cardinalityControl: 'ROWS',
    defaultCardinality: 1000,
    maxCardinality: 5000,
  },
  {
    id: 'RANDOM_INTEGERS',
    label: 'Random integers',
    description: 'Integers scattered across a wide range, with a chosen number of distinct values.',
    dataType: 'INTEGER',
    sourceType: 'int64',
    cardinalityControl: 'USER',
    defaultCardinality: 500,
    maxCardinality: 5000,
  },
  {
    id: 'REPEATED_DECIMALS',
    label: 'Repeated decimals',
    description: 'Decimal amounts (two places) that repeat from a small pool, such as list prices.',
    dataType: 'DECIMAL',
    sourceType: 'decimal(18,2)',
    cardinalityControl: 'USER',
    defaultCardinality: 20,
    maxCardinality: 1000,
  },
  {
    id: 'DATES_RANDOM',
    label: 'Dates (spread randomly)',
    description: 'Dates from a two-year span used in no particular order.',
    dataType: 'DATE',
    sourceType: 'date',
    cardinalityControl: 'USER',
    defaultCardinality: 365,
    maxCardinality: 730,
  },
  {
    id: 'DATES_SORTED',
    label: 'Dates (sorted)',
    description: 'The same kind of dates stored in ascending order. Order does not change sizes in this model.',
    dataType: 'DATE',
    sourceType: 'date',
    cardinalityControl: 'USER',
    defaultCardinality: 365,
    maxCardinality: 730,
  },
];

export const DEFAULT_COMPRESSION_INPUTS: CompressionInputs = {
  scenario: 'LOW_CARDINALITY_TEXT',
  customerColumn: 'Region',
  rowCount: 1000,
  cardinality: 5,
  segmentRowCount: DEFAULT_SEGMENT_ROW_COUNT,
  nullPercent: 0,
  encoding: 'DICTIONARY',
};

export function getScenario(id: CompressionScenarioId): CompressionScenarioDefinition {
  const scenario = COMPRESSION_SCENARIOS.find((entry) => entry.id === id);
  if (!scenario) throw new RangeError(`Unknown compression scenario: ${id}`);
  return scenario;
}

/** Inputs for a scenario with its own default cardinality, leaving the shared settings untouched. */
export function defaultInputsFor(scenario: CompressionScenarioId, base: CompressionInputs = DEFAULT_COMPRESSION_INPUTS): CompressionInputs {
  return { ...base, scenario, cardinality: getScenario(scenario).defaultCardinality };
}

function assertWholeNumber(value: number, label: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be a whole number of at least ${minimum}`);
  }
}

/** Distinct values the scenario will produce, or null when the data decides (Customer columns). */
export function effectiveCardinality(scenario: CompressionScenarioId, rowCount: number, requested: number): number | null {
  const definition = getScenario(scenario);
  assertWholeNumber(rowCount, 'rowCount', 0);
  if (definition.cardinalityControl === 'DATA') return null;
  if (rowCount === 0) return 0;
  if (definition.cardinalityControl === 'ROWS') return rowCount;
  if (!Number.isFinite(requested)) throw new RangeError('cardinality must be a finite number');
  return Math.max(1, Math.min(Math.floor(requested), rowCount, definition.maxCardinality));
}

// Deterministic 32-bit mixer (murmur3 finaliser). Replaces any use of random numbers.
function hash32(n: number): number {
  let h = Math.imul(n | 0, 0x85ebca6b) ^ 0x9e3779b9;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Shuffled slots 0..c-1, so the first c rows hit every slot exactly once (exact cardinality) without looking sorted.
function slotPermutation(count: number): number[] {
  const slots = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = hash32(i * 2654435761) % (i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

function slotsForRows(rowCount: number, cardinality: number): number[] {
  const permutation = slotPermutation(cardinality);
  const rows = new Array<number>(rowCount);
  for (let i = 0; i < rowCount; i++) {
    rows[i] = i < cardinality ? permutation[i] : permutation[hash32(i + 0x1234) % cardinality];
  }
  return rows;
}

const REGION_NAMES = ['East', 'West', 'North', 'South', 'Central'];
const FIRST_DAY = isoDateToDayNumber('2023-01-01');

/** [SIMULATION] Deterministic column for a distribution scenario. Not used for CUSTOMER_COLUMN. */
export function generateScenarioColumn(scenario: Exclude<CompressionScenarioId, 'CUSTOMER_COLUMN'>, rowCount: number, requestedCardinality: number): EncodingColumn {
  const definition = getScenario(scenario);
  const cardinality = effectiveCardinality(scenario, rowCount, requestedCardinality) as number;
  const dataType = definition.dataType as EncodingDataType;
  const base = {
    name: definition.label.replace(/[^A-Za-z]+/g, ''),
    sourceType: definition.sourceType,
    dataType,
    scale: dataType === 'DECIMAL' ? 2 : 0,
  };

  if (rowCount === 0) return { ...base, values: [] };

  switch (scenario) {
    case 'HIGH_CARDINALITY_TEXT':
      return { ...base, values: Array.from({ length: rowCount }, (_, i) => `Customer ${String(i + 1).padStart(6, '0')}`) };
    case 'SEQUENTIAL_INTEGERS':
      return { ...base, values: Array.from({ length: rowCount }, (_, i) => i + 1) };
    default:
      break;
  }

  const slots = slotsForRows(rowCount, cardinality);
  switch (scenario) {
    case 'LOW_CARDINALITY_TEXT':
      return { ...base, values: slots.map((slot) => (slot < REGION_NAMES.length ? REGION_NAMES[slot] : `Region ${slot + 1}`)) };
    case 'RANDOM_INTEGERS':
      return { ...base, values: slots.map((slot) => 1000 + slot * 37) };
    case 'REPEATED_DECIMALS':
      return { ...base, values: slots.map((slot) => (1000 + ((slot * 7919) % 499000)) / 100) };
    default: {
      const dates = slots.map((slot) => dayNumberToIsoDate(FIRST_DAY + ((slot * 211) % 730)));
      return { ...base, values: scenario === 'DATES_SORTED' ? dates.slice().sort() : dates };
    }
  }
}

/** The column for the given inputs, including the Module 3 null pattern. */
export function buildCompressionColumn(inputs: CompressionInputs): SegmentColumn {
  assertWholeNumber(inputs.rowCount, 'rowCount', 0);
  const base =
    inputs.scenario === 'CUSTOMER_COLUMN'
      ? getCustomerEncodingColumn(generateSyntheticCustomerRows(inputs.rowCount), inputs.customerColumn)
      : generateScenarioColumn(inputs.scenario, inputs.rowCount, inputs.cardinality);
  return applyNullPattern(base, inputs.nullPercent);
}

export function classifyCardinality(ratio: number, nonNullCount: number): CardinalityBand {
  if (nonNullCount === 0) return 'EMPTY';
  if (ratio < LOW_CARDINALITY_RATIO) return 'LOW';
  if (ratio >= HIGH_CARDINALITY_RATIO) return 'HIGH';
  return 'MEDIUM';
}

function originalBytesOf(column: SegmentColumn): number {
  let total = 0;
  for (const value of column.values) {
    if (value === null) total += column.dataType === 'TEXT' ? TEXT_LENGTH_PREFIX_BYTES : NUMERIC_VALUE_BYTES;
    else total += modelledValueBytes(column.dataType, value);
  }
  return total;
}

const percentOf = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * [SIMPLIFIED MODEL] Estimated storage for one column. Segments, the shared dictionary and per-segment metadata come
 * from the Module 3 model. Throws RangeError for an invalid segment size, or for value encoding of a text column.
 * Every size is a whole number of bytes, finite and not negative. Savings can be negative when the model makes a
 * column larger.
 */
export function estimateColumnCompression(
  column: SegmentColumn,
  segmentRowCount: number,
  options: { encoding?: CompressionEncodingModel } = {},
): CompressionEstimate {
  const encoding = options.encoding ?? 'DICTIONARY';
  if (encoding === 'VALUE' && column.dataType === 'TEXT') {
    throw new RangeError('Value encoding does not apply to text columns in this model');
  }

  const layout = generateSegments(column, segmentRowCount);
  const rowCount = layout.totalRows;
  const nullCount = layout.nullCount;
  const nonNullCount = rowCount - nullCount;
  const cardinality = layout.dictionary.cardinality;
  const originalBytes = originalBytesOf(column);

  let bitsPerStoredValue: number;
  let dictionaryBytes = 0;
  let dictionaryEntryCount = 0;
  let columnOverheadBytes = 0;
  let segments: SegmentDetail[] = layout.segments;

  if (encoding === 'DICTIONARY') {
    bitsPerStoredValue = layout.dictionary.bitsPerId;
    dictionaryBytes = layout.dictionary.bytes; // one dictionary for the whole column, counted once
    dictionaryEntryCount = layout.dictionary.entryCount;
  } else {
    const nonNullValues = column.values.filter((value): value is number | string => value !== null);
    const valueModel = simulateValueEncoding({ ...column, values: nonNullValues });
    bitsPerStoredValue = bitsRequired(valueModel.range + 1 + (nullCount > 0 ? 1 : 0)); // nulls take one extra state
    columnOverheadBytes = rowCount > 0 ? VALUE_ENCODING_METADATA_BYTES : 0;
    segments = layout.segments.map((segment) => {
      const dataBytes = Math.ceil((segment.rowCount * bitsPerStoredValue) / 8);
      return { ...segment, dataBytes, bitsPerId: bitsPerStoredValue, size: dataBytes + segment.metadataBytes };
    });
  }

  const encodedValueBytes = segments.reduce((sum, segment) => sum + segment.dataBytes, 0);
  const segmentOverheadBytes = segments.reduce((sum, segment) => sum + segment.metadataBytes, 0);
  const totalCompressedBytes = dictionaryBytes + encodedValueBytes + segmentOverheadBytes + columnOverheadBytes;
  const savingsBytes = originalBytes - totalCompressedBytes;
  const cardinalityRatio = nonNullCount > 0 ? cardinality / nonNullCount : 0;

  return {
    columnName: column.name,
    dataType: column.dataType,
    sourceType: column.sourceType,
    encodingModel: encoding,
    rowCount,
    nullCount,
    nonNullCount,
    cardinality,
    cardinalityRatio,
    cardinalityBand: classifyCardinality(cardinalityRatio, nonNullCount),
    bitsPerStoredValue,
    dictionaryEntryCount,
    segmentCount: segments.length,
    segmentRowCount,
    originalBytes,
    dictionaryBytes,
    encodedValueBytes,
    segmentOverheadBytes,
    columnOverheadBytes,
    totalCompressedBytes,
    compressionRatio: totalCompressedBytes > 0 ? originalBytes / totalCompressedBytes : 1,
    savingsBytes,
    savingsPercent: percentOf(savingsBytes, originalBytes),
    dictionaryOverheadPercent: percentOf(dictionaryBytes, totalCompressedBytes),
    breakdownPercent: {
      dictionary: percentOf(dictionaryBytes, totalCompressedBytes),
      encodedValues: percentOf(encodedValueBytes, totalCompressedBytes),
      overhead: percentOf(segmentOverheadBytes + columnOverheadBytes, totalCompressedBytes),
    },
    segments,
  };
}

export function estimateFromInputs(inputs: CompressionInputs): CompressionEstimate {
  return estimateColumnCompression(buildCompressionColumn(inputs), inputs.segmentRowCount, { encoding: inputs.encoding });
}

const EXAMPLE_SCENARIOS: CompressionScenarioId[] = [
  'LOW_CARDINALITY_TEXT',
  'HIGH_CARDINALITY_TEXT',
  'SEQUENTIAL_INTEGERS',
  'RANDOM_INTEGERS',
  'REPEATED_DECIMALS',
  'DATES_RANDOM',
];

/** Side-by-side rows: the six required examples, then every Customer table column. Same rows, segment size and nulls. */
export function compareCompression(settings: { rowCount: number; segmentRowCount: number; nullPercent: number }): CompressionComparisonRow[] {
  const shared = { ...DEFAULT_COMPRESSION_INPUTS, ...settings };
  const make = (id: string, label: string, group: 'EXAMPLE' | 'CUSTOMER', inputs: CompressionInputs): CompressionComparisonRow => {
    const column = buildCompressionColumn(inputs);
    const dictionary = estimateColumnCompression(column, inputs.segmentRowCount, { encoding: 'DICTIONARY' });
    const value = column.dataType === 'TEXT' ? null : estimateColumnCompression(column, inputs.segmentRowCount, { encoding: 'VALUE' });
    return { id, label, group, dictionary, value };
  };

  const examples = EXAMPLE_SCENARIOS.map((id) => make(id, getScenario(id).label, 'EXAMPLE', defaultInputsFor(id, shared)));
  const customer = CUSTOMER_COLUMNS.map((column) =>
    make(`CUSTOMER_${column.name}`, `${column.name} (Customer table)`, 'CUSTOMER', {
      ...shared,
      scenario: 'CUSTOMER_COLUMN',
      customerColumn: column.name,
    }),
  );
  return [...examples, ...customer];
}

export interface CompressionChartRow {
  id: string;
  label: string;
  originalWidthPct: number;
  dictionaryWidthPct: number;
  encodedWidthPct: number;
  overheadWidthPct: number;
  totalPctOfOriginal: number;
}

/**
 * Stacked-bar geometry. Each bar shows a model's compressed parts as a share of that column's own original size;
 * the axis stretches only when a column grows beyond its original size.
 */
export function buildCompressionChart(entries: Array<{ id: string; label: string; estimate: CompressionEstimate }>): {
  scalePct: number;
  rows: CompressionChartRow[];
} {
  const pctOfOriginal = (bytes: number, original: number): number => percentOf(bytes, original);
  const totals = entries.map((entry) => pctOfOriginal(entry.estimate.totalCompressedBytes, entry.estimate.originalBytes));
  const scalePct = Math.max(100, ...totals);
  const width = (pct: number): number => (pct / scalePct) * 100;

  return {
    scalePct,
    rows: entries.map((entry, index) => {
      const e = entry.estimate;
      return {
        id: entry.id,
        label: entry.label,
        originalWidthPct: width(100),
        dictionaryWidthPct: width(pctOfOriginal(e.dictionaryBytes, e.originalBytes)),
        encodedWidthPct: width(pctOfOriginal(e.encodedValueBytes, e.originalBytes)),
        overheadWidthPct: width(pctOfOriginal(e.segmentOverheadBytes + e.columnOverheadBytes, e.originalBytes)),
        totalPctOfOriginal: totals[index],
      };
    }),
  };
}

export interface EncodedPreview {
  encoding: CompressionEncodingModel;
  totalEntries: number;
  entries: Array<{ id: number; value: string; bytes: number }>;
  nullEntryId: number | null;
  offset: number | null; // value encoding: the column minimum subtracted from every value (after scaling)
  rows: Array<{ row: number; original: string; encoded: string }>;
}

const formatOriginal = (value: SegmentValue, scale: number): string => {
  if (value === null) return 'null';
  return typeof value === 'number' && scale > 0 ? value.toFixed(scale) : String(value);
};

/** First dictionary entries and first rows, original beside encoded. IDs are assigned in first-seen order (an assumption). */
export function buildEncodedPreview(
  column: SegmentColumn,
  encoding: CompressionEncodingModel,
  limits: { rowLimit?: number; entryLimit?: number } = {},
): EncodedPreview {
  const rowLimit = limits.rowLimit ?? 10;
  const entryLimit = limits.entryLimit ?? 12;
  const preview = column.values.slice(0, rowLimit);

  if (encoding === 'VALUE') {
    if (column.dataType === 'TEXT') throw new RangeError('Value encoding does not apply to text columns in this model');
    const nonNull = column.values.filter((value): value is number | string => value !== null);
    const model = simulateValueEncoding({ ...column, values: nonNull });
    const factor = 10 ** column.scale;
    const project = (value: number | string): number => (typeof value === 'string' ? isoDateToDayNumber(value) : Math.round(value * factor));
    return {
      encoding,
      totalEntries: 0,
      entries: [],
      nullEntryId: null,
      offset: nonNull.length > 0 ? model.offset : null,
      rows: preview.map((value, row) => ({
        row: row + 1,
        original: formatOriginal(value, column.scale),
        encoded: value === null ? 'null (reserved state)' : String(project(value) - model.offset),
      })),
    };
  }

  const ids = new Map<number | string, number>();
  const order: Array<number | string> = [];
  let hasNull = false;
  for (const value of column.values) {
    if (value === null) hasNull = true;
    else if (!ids.has(value)) {
      ids.set(value, order.length);
      order.push(value);
    }
  }
  const nullEntryId = hasNull ? order.length : null;

  return {
    encoding,
    totalEntries: order.length + (hasNull ? 1 : 0),
    entries: order.slice(0, entryLimit).map((value, id) => ({
      id,
      value: formatOriginal(value, column.scale),
      bytes: modelledValueBytes(column.dataType, value),
    })),
    nullEntryId,
    offset: null,
    rows: preview.map((value, row) => ({
      row: row + 1,
      original: formatOriginal(value, column.scale),
      encoded: value === null ? `ID ${nullEntryId} (null)` : `ID ${ids.get(value)}`,
    })),
  };
}

export function describeCompressionAssumptions(): Array<{ label: string; text: string }> {
  return [
    { label: 'Original size', text: `${NUMERIC_VALUE_BYTES} bytes per number or date; ${TEXT_LENGTH_PREFIX_BYTES}-byte length prefix plus UTF-8 bytes per text value. A null takes the same fixed width (the prefix only, for text).` },
    { label: 'Dictionary', text: 'One dictionary per column, shared by every segment and counted once. Each distinct value is stored once at its original size. Nulls use one reserved ID and no dictionary bytes.' },
    { label: 'Encoded IDs', text: 'ceil(log2(dictionary entries)) bits per row, minimum 1, packed per segment and rounded up to whole bytes.' },
    { label: 'Value encoding', text: `(value - column minimum) packed in ceil(log2(range + 1)) bits, plus one extra state when nulls exist, and ${VALUE_ENCODING_METADATA_BYTES} bytes of column metadata. Numeric and date columns only; dates are whole-day numbers.` },
    { label: 'Segment overhead', text: `${MODELLED_SEGMENT_METADATA_BYTES} bytes of metadata per segment (an educational allowance). Rows per segment is a setting, not a fixed engine limit.` },
    { label: 'Not modelled', text: 'Run-length encoding, paging, relationships, calculated columns, and the engine\'s real choice of encoding. Row order does not change any size here.' },
  ];
}

/** Calculation walk-through and plain-language reading for one estimate. Never claims the engine's choice or a measurement. */
export function explainCompressionEstimate(estimate: CompressionEstimate): string[] {
  const fmt = (n: number): string => n.toLocaleString('en-US');
  if (estimate.rowCount === 0) {
    return ['There are no rows, so every size is 0 and there is nothing to compress.'];
  }

  const lines: string[] = [];
  lines.push(
    `Original (uncompressed, modelled): ${fmt(estimate.originalBytes)} B for ${fmt(estimate.rowCount)} rows` +
      (estimate.nullCount > 0 ? `, including ${fmt(estimate.nullCount)} null row(s).` : '.'),
  );

  if (estimate.encodingModel === 'DICTIONARY') {
    lines.push(
      `Dictionary: ${fmt(estimate.dictionaryEntryCount)} entr${estimate.dictionaryEntryCount === 1 ? 'y' : 'ies'} stored once for the whole column = ` +
        `${fmt(estimate.dictionaryBytes)} B. It is counted once, not once per segment.`,
    );
    lines.push(
      `Encoded IDs: ${fmt(estimate.rowCount)} rows x ${estimate.bitsPerStoredValue} bit(s), packed per segment and rounded up to whole bytes = ${fmt(estimate.encodedValueBytes)} B.`,
    );
  } else {
    lines.push(
      `Value encoding: each value stored as its distance from the column minimum in ${estimate.bitsPerStoredValue} bit(s); ` +
        `${fmt(estimate.rowCount)} rows packed per segment = ${fmt(estimate.encodedValueBytes)} B. There is no dictionary.`,
    );
    lines.push(`Column metadata for value encoding: ${fmt(estimate.columnOverheadBytes)} B.`);
  }

  lines.push(
    `Segment overhead: ${fmt(estimate.segmentCount)} segment(s) x ${MODELLED_SEGMENT_METADATA_BYTES} B = ${fmt(estimate.segmentOverheadBytes)} B.`,
  );
  lines.push(
    `Total estimated compressed size: ${fmt(estimate.totalCompressedBytes)} B. Compression ratio ${estimate.compressionRatio.toFixed(2)}x. ` +
      (estimate.savingsBytes >= 0
        ? `Estimated saving ${fmt(estimate.savingsBytes)} B (${estimate.savingsPercent.toFixed(1)}%).`
        : `In this model the column is ${fmt(-estimate.savingsBytes)} B larger than the original.`),
  );

  if (estimate.encodingModel === 'DICTIONARY') {
    lines.push(`The dictionary is ${estimate.dictionaryOverheadPercent.toFixed(1)}% of the estimated total.`);
  }
  if (estimate.cardinalityBand !== 'EMPTY') {
    lines.push(
      `Cardinality: ${fmt(estimate.cardinality)} distinct value(s) over ${fmt(estimate.nonNullCount)} non-null rows (ratio ${estimate.cardinalityRatio.toFixed(3)}, ` +
        `labelled ${estimate.cardinalityBand.toLowerCase()} for teaching only; these labels are not engine thresholds).`,
    );
  }
  lines.push('These are educational estimates from a simplified model, not VertiPaq measurements.');
  return lines;
}

export function getCompressionSourceReferences(): SourceReference[] {
  return [
    {
      title: 'Data reduction techniques for Import modeling - Power BI',
      url: 'https://learn.microsoft.com/en-us/power-bi/guidance/import-modeling-data-reduction',
      section: 'Numeric columns use value encoding; text uses hash encoding with a numeric ID per unique value',
    },
    {
      title: 'Column.EncodingHint Property (Microsoft.AnalysisServices.Tabular)',
      url: 'https://learn.microsoft.com/en-us/dotnet/api/microsoft.analysisservices.tabular.column.encodinghint',
      section: 'A numeric column may use value-based or hash-based encoding; the server normally detects which',
    },
    {
      title: 'INFO.STORAGETABLECOLUMNSEGMENTS function (DAX)',
      url: 'https://learn.microsoft.com/en-us/dax/info-storagetablecolumnsegments-function-dax',
      section: 'Per-segment sizes and the bits needed to store Data IDs',
    },
    {
      title: 'Direct Lake overview',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-overview',
      section: 'Direct Lake storage mode in Microsoft Fabric',
    },
  ];
}
