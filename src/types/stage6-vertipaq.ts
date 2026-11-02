// TypeScript definitions for Stage 6 - VertiPaq Simulator
// [SIMULATION] Educational representation of Microsoft Fabric VertiPaq internals
// NOT a reproduction of actual Microsoft implementation

// ===== DICTIONARY ENCODING TYPES =====

export interface DictionaryValue {
  originalValue: unknown;
  dictionaryId: number;
}

export interface Dictionary {
  columnName: string;
  distinctValues: unknown[];
  cardinality: number;
  dictionarySize: number; // bytes
  mappings: Map<string, number>; // value -> ID mapping
}

export interface DictionaryEncodingResult {
  originalData: unknown[];
  dictionary: Dictionary;
  encodedData: number[];
  bitsPerId: number;
  originalSize: number;
  encodedSize: number;
  dictionaryOverhead: number;
  compressionRatio: number;
}

// ===== ENCODING TYPES =====

export type EncodingType = 'VALUE' | 'HASH' | 'RLE' | 'DELTA' | 'BYTE_STREAM_SPLIT';

// ===== VALUE vs HASH ENCODING TYPES (Module 2) =====

export type EncodingDataType = 'INTEGER' | 'DECIMAL' | 'DATE' | 'TEXT';

/** [SIMULATION] One synthetic column drawn from the shared Customer dataset. */
export interface EncodingColumn {
  name: string;
  sourceType: string; // Stage 5 schema type, e.g. 'int64', 'decimal(18,2)', 'date', 'utf8'
  dataType: EncodingDataType;
  scale: number; // decimal places (DECIMAL only; 0 otherwise)
  values: Array<number | string>; // DATE values are ISO yyyy-mm-dd strings
}

/** [SIMPLIFIED MODEL] Offset + bit-packed representation of a numeric column. */
export interface ValueEncodingResult {
  applicable: boolean;
  notApplicableReason?: string;
  offset: number; // minimum of the scaled numeric projection
  scaleFactor: number; // 10^scale
  minValue: number;
  maxValue: number;
  range: number; // max - min
  bitsPerValue: number;
  storedValues: number[]; // scaled value - offset
  dataBytes: number;
  metadataBytes: number;
  totalBytes: number;
}

/** [SIMPLIFIED MODEL] Dictionary (hash-table based) representation; lossless. */
export interface HashEncodingResult {
  dictionary: Array<number | string>;
  ids: number[];
  cardinality: number;
  bitsPerId: number;
  dataBytes: number;
  dictionaryBytes: number;
  totalBytes: number;
}

export interface EncodingSimulationResult {
  columnName: string;
  sourceType: string;
  dataType: EncodingDataType;
  rowCount: number;
  outlierApplied: boolean;
  baselineBytes: number;
  value: ValueEncodingResult;
  hash: HashEncodingResult;
  // Smaller total in THIS model only. It is not the engine's encoding choice.
  smallerInModel: 'VALUE' | 'HASH' | 'TIE' | null;
}

// ===== SEGMENT TYPES =====

export interface SegmentStatistics {
  minValue: unknown;
  maxValue: unknown;
  distinctCount: number;
  nullCount: number;
  averageValue?: number;
  standardDeviation?: number;
}

export interface Segment {
  segmentId: number;
  startRowIndex: number; // first row of the segment (0-based, inclusive)
  endRowIndex: number; // exclusive
  rowCount: number;
  size: number; // bytes: modelled ID data + modelled metadata (the shared dictionary is counted once, separately)
  statistics: SegmentStatistics;
  dictionaryId?: number; // the column's shared dictionary (Module 3 uses 0)
}

// ===== SEGMENT EXPLORER TYPES (Module 3) =====

export type SegmentValue = number | string | null;

/** [SIMULATION] A column whose values may include nulls. */
export interface SegmentColumn {
  name: string;
  sourceType: string;
  dataType: EncodingDataType;
  scale: number;
  values: SegmentValue[];
}

/** AS_LOADED keeps the stored row order; SORTED_ASCENDING sorts rows by this column first (nulls last). */
export type SegmentRowOrder = 'AS_LOADED' | 'SORTED_ASCENDING';

export type ColumnOrderState = 'EMPTY' | 'CONSTANT' | 'ASCENDING' | 'DESCENDING' | 'UNORDERED';

/** [SIMPLIFIED MODEL] One dictionary per column, shared by all of its segments. */
export interface SegmentDictionaryInfo {
  cardinality: number; // distinct non-null values
  hasNullEntry: boolean; // nulls use one reserved ID and no dictionary bytes
  entryCount: number; // cardinality + (hasNullEntry ? 1 : 0)
  bitsPerId: number;
  bytes: number;
}

export interface SegmentDetail extends Segment {
  dataBytes: number;
  metadataBytes: number;
  bitsPerId: number;
  dictionaryEntriesReferenced: number; // distinct non-null values used in this segment
  dictionaryCoverage: number; // referenced entries / dictionary cardinality, 0 to 1
  isPartial: boolean; // fewer rows than the configured segment size
  rangeOverlapsAnotherSegment: boolean; // min-max range (closed) intersects another segment's range
}

export interface SegmentExplorerResult {
  columnName: string;
  sourceType: string;
  dataType: EncodingDataType;
  totalRows: number;
  segmentRowCount: number; // configured rows per segment (an educational assumption)
  rowOrder: SegmentRowOrder;
  loadedOrder: ColumnOrderState; // order of the column as loaded
  segmentedOrder: ColumnOrderState; // order after rowOrder is applied
  nullCount: number;
  dictionary: SegmentDictionaryInfo;
  segments: SegmentDetail[];
  totals: {
    dataBytes: number;
    metadataBytes: number;
    dictionaryBytes: number;
    totalBytes: number;
  };
  averageSegmentBytes: number;
  overlappingSegmentCount: number;
}

// ===== SEGMENT ELIMINATION TYPES (Module 4) =====

export type EliminationOperator = 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'BETWEEN';

/** BETWEEN is inclusive of both bounds. DATE values are ISO yyyy-mm-dd strings. */
export interface EliminationPredicate {
  operator: EliminationOperator;
  value: number | string;
  upperValue?: number | string;
}

export type EliminationDecision = 'ELIMINATED' | 'SCANNED';

/**
 * Why a segment was eliminated or scanned, using segment metadata only.
 * ELIMINATED: ALL_NULL, EMPTY_PREDICATE, OUTSIDE_RANGE, ALL_EQUAL_EXCLUDED.
 * SCANNED: RANGE_OVERLAPS (cannot be ruled out), RANGE_SATISFIES (every non-null value in the range matches).
 */
export type EliminationReasonCode =
  | 'ALL_NULL'
  | 'EMPTY_PREDICATE'
  | 'OUTSIDE_RANGE'
  | 'ALL_EQUAL_EXCLUDED'
  | 'RANGE_OVERLAPS'
  | 'RANGE_SATISFIES';

export interface SegmentEliminationDetail {
  segmentId: number;
  startRowIndex: number;
  endRowIndex: number;
  rowCount: number;
  nullCount: number;
  minValue: number | string | null;
  maxValue: number | string | null;
  decision: EliminationDecision;
  reasonCode: EliminationReasonCode;
  reason: string;
}

/** [SIMPLIFIED MODEL] A possibility test on segment metadata. A scanned segment may or may not hold matching rows. */
export interface SegmentEliminationResult {
  columnName: string;
  dataType: EncodingDataType;
  predicate: EliminationPredicate;
  predicateText: string;
  totalSegments: number;
  segmentsScanned: number;
  segmentsEliminated: number;
  totalRows: number;
  rowsPotentiallyScanned: number;
  rowsPotentiallyAvoided: number;
  rowEliminationPercentage: number; // rows avoided / total rows, 0 when there are no rows
  segmentEliminationPercentage: number; // segments eliminated / total segments, 0 when there are none
  scannedOverlapCount: number; // scanned with RANGE_OVERLAPS
  scannedSatisfiedCount: number; // scanned with RANGE_SATISFIES
  nullRowCount: number;
  segments: SegmentEliminationDetail[];
}

// ===== COLUMN COMPRESSION TYPES (Module 5) =====

export type CompressionScenarioId =
  | 'CUSTOMER_COLUMN'
  | 'LOW_CARDINALITY_TEXT'
  | 'HIGH_CARDINALITY_TEXT'
  | 'SEQUENTIAL_INTEGERS'
  | 'RANDOM_INTEGERS'
  | 'REPEATED_DECIMALS'
  | 'DATES_RANDOM'
  | 'DATES_SORTED';

/** [SIMPLIFIED MODEL] The two representations modelled. The user chooses; nothing is selected automatically. */
export type CompressionEncodingModel = 'DICTIONARY' | 'VALUE';

/** Teaching labels for the distinct-to-rows ratio. They are not engine thresholds. */
export type CardinalityBand = 'EMPTY' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface CompressionInputs {
  scenario: CompressionScenarioId;
  customerColumn: string; // used when scenario is CUSTOMER_COLUMN
  rowCount: number;
  cardinality: number; // requested distinct values, for scenarios that allow it
  segmentRowCount: number;
  nullPercent: number;
  encoding: CompressionEncodingModel;
}

/** [SIMULATION] Educational storage estimate. It is not a VertiPaq measurement. */
export interface CompressionEstimate {
  columnName: string;
  dataType: EncodingDataType;
  sourceType: string;
  encodingModel: CompressionEncodingModel;
  rowCount: number;
  nullCount: number;
  nonNullCount: number;
  cardinality: number; // distinct non-null values
  cardinalityRatio: number; // distinct non-null values / non-null rows, 0 when there are none
  cardinalityBand: CardinalityBand;
  bitsPerStoredValue: number; // bits per ID (dictionary) or per offset value (value encoding)
  dictionaryEntryCount: number; // includes the reserved null entry; 0 for value encoding
  segmentCount: number;
  segmentRowCount: number;
  originalBytes: number;
  dictionaryBytes: number; // shared dictionary, counted once for the whole column
  encodedValueBytes: number;
  segmentOverheadBytes: number;
  columnOverheadBytes: number; // column-level metadata (value encoding only)
  totalCompressedBytes: number;
  compressionRatio: number; // original / total, 1 when there is nothing to compare
  savingsBytes: number; // original - total; negative when the model makes the column larger
  savingsPercent: number;
  dictionaryOverheadPercent: number; // dictionary / total compressed
  breakdownPercent: { dictionary: number; encodedValues: number; overhead: number }; // of total compressed
  segments: SegmentDetail[];
}

export interface CompressionComparisonRow {
  id: string;
  label: string;
  group: 'EXAMPLE' | 'CUSTOMER';
  dictionary: CompressionEstimate;
  value: CompressionEstimate | null; // null for text columns
}

// ===== DIRECT LAKE COLUMN LOADING TYPES (Module 6) =====

export type LoadingState = 'UNLOADED' | 'LOADING' | 'LOADED';

/** Stages of the conceptual flow shown to the user. A visual aid, not Microsoft's internal sequence. */
export type LoadingFlowStageId = 'ONELAKE' | 'DELTA_LAKE' | 'PARQUET' | 'COLUMN_ACCESS' | 'VERTIPAQ' | 'AVAILABLE';

export interface LoadingSettings {
  rowCount: number;
  segmentRowCount: number;
  nullPercent: number;
  numericEncoding: CompressionEncodingModel; // representation used to size numeric and date columns; text uses a dictionary
}

/** [SIMULATION] One Customer column, sized with the Module 5 estimate. */
export interface LoadingColumnProfile {
  columnName: string;
  dataType: EncodingDataType;
  sourceType: string;
  rowCount: number;
  nullCount: number;
  cardinality: number;
  encodingModel: CompressionEncodingModel;
  uncompressedBytes: number; // modelled original size
  memoryBytes: number; // Module 5 estimated total compressed size, used as simulated memory
  loadTicks: number; // simulated steps to load; 0 for an empty column
}

export interface LoadingColumnState {
  profile: LoadingColumnProfile;
  state: LoadingState;
  progressTicks: number;
  residentBytes: number; // memory counted for this column right now (partial while loading, full when loaded)
}

export type LoadingEventType =
  | 'LOAD_REQUESTED'
  | 'LOAD_COMPLETED'
  | 'ALREADY_RESIDENT'
  | 'ALREADY_LOADING'
  | 'QUERY_REQUESTED'
  | 'QUERY_READY'
  | 'EVICTED'
  | 'EVICTION_SKIPPED'
  | 'MEMORY_PRESSURE'
  | 'SCAN_COMPLETED'
  | 'SESSION_RESET';

export interface LoadingEvent {
  sequence: number;
  tick: number;
  type: LoadingEventType;
  columnName?: string;
  message: string;
}

export interface LoadingSession {
  settings: LoadingSettings;
  columns: LoadingColumnState[];
  tick: number;
  events: LoadingEvent[];
}

export interface LoadingMemorySummary {
  totalColumns: number;
  residentColumns: number;
  loadingColumns: number;
  unloadedColumns: number;
  residentBytes: number;
  inProgressBytes: number;
  totalSimulatedBytes: number; // resident + in progress, each column counted once
  fullColumnSetBytes: number; // what every column would need, for comparison only
  shareOfFullSetPercent: number;
}

export type QueryColumnStatus = 'ALREADY_RESIDENT' | 'LOADING_IN_PROGRESS' | 'NEEDS_LOADING';

export interface QueryLoadPlanEntry {
  columnName: string;
  status: QueryColumnStatus;
  memoryBytes: number;
  loadTicks: number;
}

/** What a query's column requests would cause. It does not run the query. */
export interface QueryLoadPlan {
  requestedColumns: string[];
  entries: QueryLoadPlanEntry[];
  alreadyResident: string[];
  loadingInProgress: string[];
  needsLoading: string[];
  additionalBytesToLoad: number;
}

export interface QueryLoadResult {
  plan: QueryLoadPlan;
  session: LoadingSession;
  columnsLoadedByQuery: string[]; // columns the query triggered loading for
  columnsAwaited: string[]; // columns already loading that the query waited for
  columnsReused: string[]; // columns that were already resident
  memoryBeforeBytes: number;
  memoryAfterBytes: number;
  ticksElapsed: number;
}

// ===== MEMORY RESIDENCY AND EVICTION TYPES (Module 7) =====

/**
 * Why the user (or a labelled scenario) evicted columns. Mirrors the reasons Microsoft documents. The reason is a label
 * only: every reason has the same effect in this simulator. It is not an engine decision.
 */
export type MemoryEvictionReason = 'USER_ACTION' | 'REFRESH_SCENARIO' | 'UNUSED_SCENARIO' | 'PRESSURE_SCENARIO';

/** [SIMPLIFIED MODEL] Illustrative order for the memory-pressure scenario. Not a Fabric policy. */
export type MemoryPressureOrder = 'LARGEST_FIRST' | 'EARLIEST_LOADED_FIRST';

/** Memory and residency at one moment. Sizes are the Module 5 estimates carried by the Module 6 session. */
export interface MemorySnapshot {
  residentColumns: string[];
  loadingColumns: string[];
  nonResidentColumns: string[];
  residentBytes: number;
  inProgressBytes: number;
  totalBytes: number; // resident + in progress, each column counted once
}

export interface EvictionSkip {
  columnName: string;
  cause: 'NOT_RESIDENT' | 'STILL_LOADING';
}

export interface EvictionResult {
  session: LoadingSession;
  reason: MemoryEvictionReason;
  requestedColumns: string[];
  evictedColumns: string[];
  skipped: EvictionSkip[];
  freedBytes: number;
  before: MemorySnapshot;
  after: MemorySnapshot;
}

/** Result of the memory-pressure scenario: an eviction against a user-chosen illustrative budget. */
export interface MemoryPressureResult extends EvictionResult {
  budgetBytes: number;
  order: MemoryPressureOrder;
  protectedColumns: string[];
  withinBudget: boolean;
  overBudgetBytes: number; // 0 when within budget
}

export interface MemoryBudgetStatus {
  budgetBytes: number;
  usedBytes: number;
  headroomBytes: number; // negative when over budget
  overBudgetBytes: number;
  withinBudget: boolean;
  usedPercentOfBudget: number | null; // null when the budget is 0
}

export interface MemoryComparisonRow {
  columnName: string;
  stateBefore: LoadingState;
  stateAfter: LoadingState;
  bytesBefore: number;
  bytesAfter: number;
  change: 'EVICTED' | 'LOADED' | 'UNCHANGED';
}

export interface ColumnResidencyHistory {
  columnName: string;
  timesEvicted: number;
  reloadsAfterEviction: number;
}

// ===== STORAGE ENGINE SCAN TYPES (Module 8) =====

export type AggregationFunction = 'SUM' | 'COUNT' | 'MIN' | 'MAX' | 'AVERAGE';

export interface ScanFilter {
  columnName: string;
  predicate: EliminationPredicate;
}

/** [SIMULATION] One simplified Storage Engine request over the shared Customer table. */
export interface ScanQuery {
  aggregation: AggregationFunction;
  measureColumn: string;
  filter: ScanFilter | null;
  // [SIMPLIFIED MODEL] Whether the table is stored sorted by the filter column. Ignored when there is no filter.
  rowOrder: SegmentRowOrder;
}

export type ScanStageId = 'REQUEST' | 'AVAILABILITY' | 'ELIMINATION' | 'SCAN' | 'AGGREGATION' | 'RESULT';

export interface ScanStep {
  stage: ScanStageId;
  status: 'DONE' | 'SKIPPED';
  summary: string;
}

/** Why a segment was or was not a candidate. Elimination codes come from Module 4. */
export type ScanSegmentReason = EliminationReasonCode | 'NO_FILTER' | 'ELIMINATION_UNAVAILABLE';

export interface ScanSegmentDetail {
  segmentId: number;
  startRowIndex: number;
  endRowIndex: number;
  rowCount: number;
  decision: 'ELIMINATED' | 'CANDIDATE';
  reasonCode: ScanSegmentReason;
  reason: string;
  rowsRead: number; // rows scanned: the segment's rows when a candidate, otherwise 0
  matchingRows: number; // rows that actually satisfy the filter; 0 for eliminated segments (they are never read)
  nonNullMeasureValues: number; // matching rows with a non-null value in the measure column
}

export interface ScanAggregation {
  function: AggregationFunction;
  columnName: string;
  value: number | string | null; // null is a blank result: no matching non-null values
  display: string;
  inputCount: number; // non-null measure values aggregated
}

export interface ScanEliminationSummary {
  available: boolean;
  note: string;
  result: SegmentEliminationResult | null; // the Module 4 result when elimination applied
}

/** The data side of a scan: independent of which columns happen to be resident. */
export interface ScanData {
  effectiveRowOrder: SegmentRowOrder;
  totalRows: number;
  segmentRowCount: number;
  elimination: ScanEliminationSummary;
  segments: ScanSegmentDetail[];
  totalSegments: number;
  eliminatedSegments: number;
  candidateSegments: number;
  rowsInCandidateSegments: number;
  rowsInEliminatedSegments: number;
  matchingRows: number;
  candidateRowsNotMatching: number; // rows in candidate segments that do not satisfy the filter
  valuesRead: number; // [SIMPLIFIED MODEL] rows in candidate segments x columns read
  aggregation: ScanAggregation;
}

export interface ScanLoadingSummary {
  requiredColumns: string[];
  alreadyResident: string[];
  loadedForThisQuery: string[];
  awaited: string[];
  ticksElapsed: number;
  memoryBeforeBytes: number;
  memoryAfterBytes: number;
}

export interface StorageScanResult extends ScanData {
  query: ScanQuery;
  requiredColumns: string[];
  conceptualRequest: string; // a conceptual illustration, not actual xmSQL
  loading: ScanLoadingSummary;
  steps: ScanStep[];
  session: LoadingSession;
}

// ===== STAGE 6 APPLICATION STATE =====

export interface Stage6State {
  activeModule:
    | 'dictionary'
    | 'encoding'
    | 'segment'
    | 'elimination'
    | 'compression'
    | 'loading'
    | 'memory'
    | 'storage';
  explanationMode: 'beginner' | 'intermediate' | 'advanced';
}
