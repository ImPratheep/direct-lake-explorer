// TypeScript type definitions for Direct Lake Architecture Explorer

export interface SourceReference {
  title: string;
  url: string;
  section?: string;
}

export interface Explanations {
  beginner: string;
  intermediate: string;
  advanced: string;
}

export interface ArchitectureComponent {
  id: string;
  name: string;
  layer: 'Storage' | 'Semantic' | 'VertiPaq' | 'Query' | 'Memory';
  classification: 'DOCUMENTED' | 'SIMULATION' | 'INFERRED';
  purpose: string;
  inputs: string[];
  outputs: string[];
  explanations: Explanations;
  sources: SourceReference[];
  relatedComponents: string[];
}

export interface QueryPhase {
  phase: number;
  name: string;
  description: string;
  inputs: string[];
  processes: string[];
  outputs: string[];
  visualization: string;
  explanations: Explanations;
  sources: SourceReference[];
  relatedComponents: string[];
}

export type ExplanationMode = 'beginner' | 'intermediate' | 'advanced';

export interface ApplicationState {
  selectedComponentId: string | null;
  explanationMode: ExplanationMode;
  currentQueryPhase: number;
  showQueryWalkthrough: boolean;
  showLegend: boolean;
  hoveredComponentId: string | null;
  activeModule: 'architecture' | 'deltaLake' | 'parquet' | 'predicatePushdown' | 'partitioning' | 'schemaEvolution' | 'vertipaq';
}

// ===== Delta Lake Types =====
export interface DeltaCommitAction {
  type: 'Add' | 'Remove' | 'Metadata' | 'Protocol';
  timestamp: number;
  description: string;
  details: Record<string, unknown>;
}

export interface DeltaTableVersion {
  version: number;
  timestamp: number;
  actions: DeltaCommitAction[];
  rowCount: number;
  fileCount: number;
}

export interface DeltaTransactionLog {
  tableName: string;
  versions: DeltaTableVersion[];
  currentVersion: number;
  checkpointInterval: number;
}

// ===== Parquet Types =====
export interface ParquetPageStatistics {
  min: unknown;
  max: unknown;
  nullCount: number;
  distinctCount: number;
}

export interface ParquetPage {
  pageIndex: number;
  rowCount: number;
  compressedSize: number;
  uncompressedSize: number;
  compression: 'SNAPPY' | 'GZIP' | 'LZ4' | 'ZSTD' | 'UNCOMPRESSED';
  encoding: 'DICTIONARY' | 'PLAIN' | 'RLE' | 'DELTA' | 'BYTE_STREAM_SPLIT';
  statistics: ParquetPageStatistics;
}

export interface ParquetColumnChunk {
  columnName: string;
  columnIndex: number;
  pages: ParquetPage[];
  statistics: ParquetPageStatistics;
  dictionaryPageSize: number;
  totalSize: number;
}

export interface ParquetRowGroup {
  rowGroupIndex: number;
  rowCount: number;
  columnChunks: ParquetColumnChunk[];
  totalSize: number;
  statistics: Record<string, ParquetPageStatistics>;
}

export interface ParquetFileMetadata {
  fileName: string;
  fileSize: number;
  rowCount: number;
  columnCount: number;
  rowGroups: ParquetRowGroup[];
  columns: ParquetColumnMetadata[];
  createdBy: string;
  schemaJson: string;
}

export interface ParquetColumnMetadata {
  name: string;
  type: string;
  logicalType?: string;
  repetitionType: 'REQUIRED' | 'OPTIONAL' | 'REPEATED';
  encoding: string;
  compression: string;
}

// ===== Predicate Pushdown Types =====
export interface FilterCondition {
  columnName: string;
  operator: '=' | '!=' | '<' | '>' | '<=' | '>=' | 'IN' | 'BETWEEN';
  value: unknown;
  value2?: unknown;
}

export interface RowGroupEvaluation {
  rowGroupIndex: number;
  condition: FilterCondition;
  canEliminate: boolean;
  reason: string;
  minValue: unknown;
  maxValue: unknown;
}

export interface PredicatePushdownResult {
  totalRowGroups: number;
  evaluatedRowGroups: RowGroupEvaluation[];
  rowGroupsScanned: number;
  rowGroupsSkipped: number;
  rowsScanned: number;
  rowsSkipped: number;
  estimatedReduction: number;
}

// ===== Partitioning Types =====
export interface PartitionKey {
  name: string;
  value: string;
}

export interface PartitionedFile {
  path: string;
  partitionKeys: PartitionKey[];
  size: number;
  rowCount: number;
}

export interface PartitionPruneResult {
  totalPartitions: number;
  matchingPartitions: number;
  scannedPartitions: number;
  prunedPartitions: number;
  files: PartitionedFile[];
  reductionPercentage: number;
}

// ===== Schema Evolution Types =====
export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  metadata?: Record<string, unknown>;
}

export interface SchemaVersion {
  version: number;
  timestamp: number;
  columns: SchemaColumn[];
  change?: {
    type: 'ADD' | 'MODIFY' | 'DROP' | 'RENAME';
    columnName: string;
    oldType?: string;
    newType?: string;
    oldName?: string;
    newName?: string;
  };
}

export interface SchemaEvolutionState {
  currentSchema: SchemaColumn[];
  schemaVersions: SchemaVersion[];
  compatibilityMode: 'STRICT' | 'BACKWARD' | 'FORWARD' | 'BOTH';
}

// Re-export Stage 6 types
export type {
  Dictionary,
  DictionaryValue,
  DictionaryEncodingResult,
  EncodingType,
  EncodingDataType,
  EncodingColumn,
  ValueEncodingResult,
  HashEncodingResult,
  EncodingSimulationResult,
  SegmentStatistics,
  Segment,
  SegmentValue,
  SegmentColumn,
  SegmentRowOrder,
  ColumnOrderState,
  SegmentDictionaryInfo,
  SegmentDetail,
  SegmentExplorerResult,
  EliminationOperator,
  EliminationPredicate,
  EliminationDecision,
  EliminationReasonCode,
  SegmentEliminationDetail,
  SegmentEliminationResult,
  CompressionScenarioId,
  CompressionEncodingModel,
  CardinalityBand,
  CompressionInputs,
  CompressionEstimate,
  CompressionComparisonRow,
  LoadingState,
  LoadingFlowStageId,
  LoadingSettings,
  LoadingColumnProfile,
  LoadingColumnState,
  LoadingEventType,
  LoadingEvent,
  LoadingSession,
  LoadingMemorySummary,
  QueryColumnStatus,
  QueryLoadPlanEntry,
  QueryLoadPlan,
  QueryLoadResult,
  MemoryEvictionReason,
  MemoryPressureOrder,
  MemorySnapshot,
  EvictionSkip,
  EvictionResult,
  MemoryPressureResult,
  MemoryBudgetStatus,
  MemoryComparisonRow,
  ColumnResidencyHistory,
  AggregationFunction,
  ScanFilter,
  ScanQuery,
  ScanStageId,
  ScanStep,
  ScanSegmentReason,
  ScanSegmentDetail,
  ScanAggregation,
  ScanEliminationSummary,
  ScanData,
  ScanLoadingSummary,
  StorageScanResult,
  Stage6State,
} from './stage6-vertipaq';
