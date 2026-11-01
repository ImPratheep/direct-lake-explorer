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
  originalSize: number;
  encodedSize: number;
  dictionaryOverhead: number;
  compressionRatio: number;
}

// ===== ENCODING TYPES =====

export type EncodingType = 'VALUE' | 'HASH' | 'RLE' | 'DELTA' | 'BYTE_STREAM_SPLIT';

export interface EncodingComparison {
  columnName: string;
  columnType: string;
  dataType: 'INTEGER' | 'DECIMAL' | 'DATE' | 'TEXT';
  valueEncoding: {
    suitability: 'HIGH' | 'MEDIUM' | 'LOW';
    size: number;
    description: string;
  };
  hashEncoding: {
    suitability: 'HIGH' | 'MEDIUM' | 'LOW';
    size: number;
    description: string;
  };
  notes: string;
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
  startRowIndex: number;
  endRowIndex: number;
  rowCount: number;
  size: number; // bytes
  statistics: SegmentStatistics;
  dictionaryId?: number; // reference to dictionary if used
}

export interface SegmentExplorerState {
  totalRows: number;
  segmentSize: number; // configurable rows per segment
  segments: Segment[];
  totalMemory: number;
  avgSegmentSize: number;
  segmentMetadataSize: number;
}

// ===== SEGMENT ELIMINATION TYPES =====

export interface SegmentEvaluationResult {
  segmentId: number;
  canEliminate: boolean;
  reason: string;
  minValue: unknown;
  maxValue: unknown;
  matchPercentage: number;
}

export interface SegmentEliminationResult {
  filterCondition: string;
  totalSegments: number;
  segmentEvaluations: SegmentEvaluationResult[];
  segmentsScanned: number;
  segmentsEliminated: number;
  rowsScanned: number;
  rowsAvoided: number;
  eliminationPercentage: number;
  estimatedIOReduction: string; // percentage or factor
}

// ===== COMPRESSION TYPES =====

export interface ColumnCompressionMetrics {
  columnName: string;
  columnType: string;
  cardinality: number;
  distinctValuePercentage: number;
  dataDistribution: 'UNIFORM' | 'SKEWED' | 'SEQUENTIAL' | 'RANDOM';
  originalSize: number;
  dictionarySize: number;
  compressedSize: number;
  compressionRatio: number;
  estimatedMemorySavings: number;
  recommendedCompression: string;
}

export interface CompressionComparison {
  lowCardinalityColumn: ColumnCompressionMetrics;
  highCardinalityColumn: ColumnCompressionMetrics;
  sequentialColumn: ColumnCompressionMetrics;
  randomColumn: ColumnCompressionMetrics;
  repeatingTextColumn: ColumnCompressionMetrics;
}

// ===== DIRECT LAKE LOADING TYPES =====

export type LoadingState = 'UNLOADED' | 'LOADING' | 'LOADED' | 'COMPRESSED';

export interface ColumnLoadingInfo {
  columnName: string;
  columnType: string;
  loadingState: LoadingState;
  size: number; // bytes
  loadingTimeMs: number;
  memoryAddress?: string; // simulated
}

export interface DirectLakeLoadingSimulation {
  totalColumns: number;
  oneLakeSize: number;
  deltaLakeSize: number;
  parquetSize: number;
  loadedColumns: ColumnLoadingInfo[];
  unloadedColumns: ColumnLoadingInfo[];
  totalLoadedMemory: number;
  loadingSequence: Array<{
    step: number;
    action: string;
    timestamp: number;
    duration: number;
  }>;
  isAvailableForQueries: boolean;
}

// ===== MEMORY RESIDENCY TYPES =====

export interface MemoryResidencySnapshot {
  timestamp: number;
  memoryCapacity: number;
  memoryUsed: number;
  memoryAvailable: number;
  memoryPressure: number; // 0-100 percentage
  loadedColumns: string[];
  evictedColumns: string[];
  evictionEvents: Array<{
    columnName: string;
    timestamp: number;
    reason: string;
  }>;
}

export interface MemoryEvictionSimulation {
  memoryBudget: number; // bytes
  initialMemoryUsed: number;
  memorySnapshots: MemoryResidencySnapshot[];
  totalEvictionEvents: number;
  mostRecentlyEvicted: string[];
  reloadCount: number;
}

// ===== STORAGE ENGINE SCAN TYPES =====

export type AggregationFunction = 'SUM' | 'COUNT' | 'MIN' | 'MAX' | 'AVERAGE';

export interface StorageEngineScan {
  scanId: string;
  queryFilter?: string;
  requiredColumns: string[];
  applicableSegmentElimination: boolean;
  columnsAccessed: string[];
  segmentsScanned: number;
  segmentsSkipped: number;
  rowsScanned: number;
  rowsSkipped: number;
  executionSteps: Array<{
    step: number;
    action: string;
    detail: string;
    duration: number; // milliseconds, simulated
  }>;
  result: unknown;
  executionTimeMs: number;
  efficiency: number; // percentage of rows actually scanned vs total
}

export interface AggregationQuery {
  columns: string[];
  aggregation: AggregationFunction;
  filterCondition?: {
    column: string;
    operator: '=' | '<' | '>' | '<=' | '>=';
    value: unknown;
  };
  expectedResult?: unknown;
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
