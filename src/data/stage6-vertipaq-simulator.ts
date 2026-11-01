// Stage 6 - VertiPaq Simulator data and simulation logic
// [SIMULATION] Educational representation of VertiPaq concepts
// References: Microsoft Fabric and Power BI documentation

import {
  Dictionary,
  DictionaryEncodingResult,
  EncodingComparison,
  SegmentExplorerState,
  Segment,
  SegmentStatistics,
  SegmentEliminationResult,
  SegmentEvaluationResult,
  ColumnCompressionMetrics,
  CompressionComparison,
  DirectLakeLoadingSimulation,
  ColumnLoadingInfo,
  MemoryEvictionSimulation,
  MemoryResidencySnapshot,
  StorageEngineScan,
  AggregationQuery,
  SourceReference,
} from '../types';

// ===== DICTIONARY ENCODING SIMULATOR =====

/**
 * [SIMULATION] Generates dictionary encoding from sample data
 * Represents: Value-to-ID mapping used in VertiPaq storage
 */
export function generateDictionaryEncoding(
  columnData: unknown[],
  columnName: string,
): DictionaryEncodingResult {
  // Extract unique values while preserving order
  const uniqueValues: unknown[] = [];
  const valueSet = new Set<string>();

  for (const value of columnData) {
    const key = JSON.stringify(value);
    if (!valueSet.has(key)) {
      valueSet.add(key);
      uniqueValues.push(value);
    }
  }

  // Create ID mappings
  const mappings = new Map<string, number>();
  uniqueValues.forEach((value, index) => {
    mappings.set(JSON.stringify(value), index);
  });

  // Encode original data
  const encodedData: number[] = columnData.map((value) => {
    const key = JSON.stringify(value);
    return mappings.get(key) ?? -1;
  });

  // Calculate sizes (simplified estimation)
  const sizePerValue = 8; // bytes per value estimate
  const originalSize = columnData.length * sizePerValue;

  // Encoded size: integer IDs + dictionary overhead
  const bitsPerID = Math.ceil(Math.log2(uniqueValues.length || 1));
  const bytesPerID = Math.ceil(bitsPerID / 8);
  const encodedSize = columnData.length * bytesPerID;

  // Dictionary overhead: store unique values
  const dictionaryOverhead = uniqueValues.reduce((sum: number, val) => {
    const valStr = JSON.stringify(val);
    return sum + valStr.length;
  }, 0);

  const totalEncodedSize = encodedSize + dictionaryOverhead;
  const compressionRatio = originalSize / totalEncodedSize;

  const dictionary: Dictionary = {
    columnName,
    distinctValues: uniqueValues,
    cardinality: uniqueValues.length,
    dictionarySize: dictionaryOverhead,
    mappings,
  };

  return {
    originalData: columnData,
    dictionary,
    encodedData,
    originalSize,
    encodedSize,
    dictionaryOverhead,
    compressionRatio,
  };
}

// ===== ENCODING COMPARISON SIMULATOR =====

/**
 * [SIMULATION] Compares value encoding vs hash encoding for different data types
 * DOCUMENTED: Parquet and VertiPaq support multiple encoding strategies
 * SIMPLIFIED: Actual encoding selection is complex and depends on many factors
 */
export function compareEncodings(
  columnName: string,
  columnType: string,
  dataType: 'INTEGER' | 'DECIMAL' | 'DATE' | 'TEXT',
): EncodingComparison {
  const comparisons: Record<string, EncodingComparison> = {
    INTEGER: {
      columnName,
      columnType,
      dataType: 'INTEGER',
      valueEncoding: {
        suitability: 'HIGH',
        size: 4,
        description: 'Direct integer representation. Compact for sorted or sequential data.',
      },
      hashEncoding: {
        suitability: 'MEDIUM',
        size: 8,
        description: 'Hash-based. Useful when range queries are rare.',
      },
      notes:
        '[DOCUMENTED] Delta Lake and Parquet prefer direct encoding for integers. Hash encoding adds overhead but may enable better statistics.',
    },
    DECIMAL: {
      columnName,
      columnType,
      dataType: 'DECIMAL',
      valueEncoding: {
        suitability: 'HIGH',
        size: 16,
        description: 'Decimal representation with precision preservation.',
      },
      hashEncoding: {
        suitability: 'LOW',
        size: 8,
        description: 'Hash-based. Not recommended due to precision loss.',
      },
      notes:
        '[DOCUMENTED] Decimal types require value encoding to preserve precision. Hash encoding would lose information.',
    },
    DATE: {
      columnName,
      columnType,
      dataType: 'DATE',
      valueEncoding: {
        suitability: 'HIGH',
        size: 8,
        description: 'Date stored as epoch milliseconds or days since epoch.',
      },
      hashEncoding: {
        suitability: 'LOW',
        size: 8,
        description: 'Hash-based. Loses temporal ordering.',
      },
      notes:
        '[DOCUMENTED] Date types benefit from value encoding because range queries (e.g., "after 2024-01-01") are common.',
    },
    TEXT: {
      columnName,
      columnType,
      dataType: 'TEXT',
      valueEncoding: {
        suitability: 'MEDIUM',
        size: 32,
        description: 'Dictionary encoding of text values. Excellent for repetition.',
      },
      hashEncoding: {
        suitability: 'HIGH',
        size: 8,
        description: 'Hash value for text. Reduces memory, enables aggregations.',
      },
      notes:
        '[DOCUMENTED] Text columns often use dictionary encoding due to high repetition. Hash encoding is space-efficient when exact values are not needed.',
    },
  };

  return comparisons[dataType] || comparisons['TEXT'];
}

// ===== SEGMENT EXPLORER SIMULATOR =====

/**
 * [SIMULATION] Generates columnar segments with metadata
 * SIMPLIFIED: Actual segment size is not a fixed constant in VertiPaq
 * ASSUMPTION: For educational purposes, we use configurable segment sizes
 */
export function generateSegments(
  dataLength: number,
  segmentRowCount: number,
  minValue: number,
  maxValue: number,
): SegmentExplorerState {
  const segments: Segment[] = [];
  const segmentCount = Math.ceil(dataLength / segmentRowCount);
  const range = maxValue - minValue;

  for (let i = 0; i < segmentCount; i++) {
    const startRow = i * segmentRowCount;
    const endRow = Math.min(startRow + segmentRowCount, dataLength);
    const rowCount = endRow - startRow;

    // Simulate segment statistics
    const segmentMinValue = minValue + (range * i) / segmentCount;
    const segmentMaxValue = minValue + (range * (i + 1)) / segmentCount;

    const statistics: SegmentStatistics = {
      minValue: Math.floor(segmentMinValue),
      maxValue: Math.ceil(segmentMaxValue),
      distinctCount: Math.floor(rowCount * 0.7),
      nullCount: Math.floor(rowCount * 0.05),
      averageValue: (segmentMinValue + segmentMaxValue) / 2,
      standardDeviation: range / (segmentCount * 2),
    };

    const segment: Segment = {
      segmentId: i,
      startRowIndex: startRow,
      endRowIndex: endRow,
      rowCount,
      size: Math.floor(rowCount * 4 + 256), // rough estimate
      statistics,
    };

    segments.push(segment);
  }

  const totalMemory = segments.reduce((sum, seg) => sum + seg.size, 0);
  const segmentMetadataSize = segments.length * 128; // metadata per segment

  return {
    totalRows: dataLength,
    segmentSize: segmentRowCount,
    segments,
    totalMemory,
    avgSegmentSize: Math.floor(totalMemory / segments.length),
    segmentMetadataSize,
  };
}

// ===== SEGMENT ELIMINATION SIMULATOR =====

/**
 * [SIMULATION] Evaluates which segments can be eliminated based on filter predicates
 * Uses segment min/max statistics similar to Parquet row group elimination
 */
export function evaluateSegmentElimination(
  segments: Segment[],
  filterColumn: string,
  operator: '=' | '<' | '>' | '<=' | '>=',
  filterValue: number,
): SegmentEliminationResult {
  const evaluations: SegmentEvaluationResult[] = segments.map((segment) => {
    const stats = segment.statistics;
    const minVal = stats.minValue as number;
    const maxVal = stats.maxValue as number;

    let canEliminate = false;
    let reason = '';
    let matchPercentage = 0;

    switch (operator) {
      case '=':
        canEliminate = filterValue < minVal || filterValue > maxVal;
        reason = canEliminate
          ? `Value ${filterValue} is outside segment range [${minVal}, ${maxVal}]`
          : `Value ${filterValue} might exist in segment`;
        matchPercentage = canEliminate ? 0 : 50;
        break;

      case '<':
        canEliminate = filterValue <= minVal;
        reason = canEliminate
          ? `All values in segment are >= ${filterValue}`
          : `Some values might be < ${filterValue}`;
        matchPercentage = canEliminate ? 0 : (maxVal - filterValue) / (maxVal - minVal + 1);
        break;

      case '>':
        canEliminate = filterValue >= maxVal;
        reason = canEliminate
          ? `All values in segment are <= ${filterValue}`
          : `Some values might be > ${filterValue}`;
        matchPercentage = canEliminate ? 0 : (filterValue - minVal) / (maxVal - minVal + 1);
        break;

      case '<=':
        canEliminate = filterValue < minVal;
        reason = canEliminate
          ? `All values in segment are > ${filterValue}`
          : `Some values might be <= ${filterValue}`;
        matchPercentage = canEliminate ? 0 : (filterValue - minVal + 1) / (maxVal - minVal + 1);
        break;

      case '>=':
        canEliminate = filterValue > maxVal;
        reason = canEliminate
          ? `All values in segment are < ${filterValue}`
          : `Some values might be >= ${filterValue}`;
        matchPercentage = canEliminate ? 0 : (maxVal - filterValue) / (maxVal - minVal + 1);
        break;

      default:
        reason = 'Unknown operator';
    }

    return {
      segmentId: segment.segmentId,
      canEliminate,
      reason,
      minValue: minVal,
      maxValue: maxVal,
      matchPercentage: Math.max(0, Math.min(100, matchPercentage * 100)),
    };
  });

  const segmentsScanned = evaluations.filter((e) => !e.canEliminate).length;
  const segmentsEliminated = evaluations.filter((e) => e.canEliminate).length;

  const rowsScanned = segments
    .filter((_, i) => !evaluations[i].canEliminate)
    .reduce((sum, seg) => sum + seg.rowCount, 0);

  const rowsAvoided = segments
    .filter((_, i) => evaluations[i].canEliminate)
    .reduce((sum, seg) => sum + seg.rowCount, 0);

  const totalRows = segments.reduce((sum, seg) => sum + seg.rowCount, 0);

  return {
    filterCondition: `${filterColumn} ${operator} ${filterValue}`,
    totalSegments: segments.length,
    segmentEvaluations: evaluations,
    segmentsScanned,
    segmentsEliminated,
    rowsScanned,
    rowsAvoided,
    eliminationPercentage: (rowsAvoided / totalRows) * 100,
    estimatedIOReduction: `${Math.round((rowsAvoided / totalRows) * 100)}%`,
  };
}

// ===== COLUMN COMPRESSION EXPLORER SIMULATOR =====

/**
 * [SIMULATION] Estimates compression ratios for different column types
 * EDUCATIONAL: These are simplified estimates, not actual measurements
 */
export function analyzeColumnCompression(
  columnData: unknown[],
  columnName: string,
  columnType: string,
): ColumnCompressionMetrics {
  const encoding = generateDictionaryEncoding(columnData, columnName);

  // Estimate cardinality
  const uniqueCount = encoding.dictionary.cardinality;
  const distinctPercentage = (uniqueCount / columnData.length) * 100;

  // Determine data distribution
  let distribution: 'UNIFORM' | 'SKEWED' | 'SEQUENTIAL' | 'RANDOM' = 'RANDOM';

  if (distinctPercentage < 10) {
    distribution = 'SKEWED';
  } else if (distinctPercentage > 90) {
    distribution = 'UNIFORM';
  } else if (columnType.includes('int') || columnType.includes('date')) {
    distribution = 'SEQUENTIAL';
  }

  const recommendedCompression =
    distinctPercentage < 20 ? 'Dictionary (HIGH)' : distinctPercentage < 50 ? 'RLE (MEDIUM)' : 'Value (LOW)';

  return {
    columnName,
    columnType,
    cardinality: uniqueCount,
    distinctValuePercentage: distinctPercentage,
    dataDistribution: distribution,
    originalSize: encoding.originalSize,
    dictionarySize: encoding.dictionaryOverhead,
    compressedSize: encoding.encodedSize + encoding.dictionaryOverhead,
    compressionRatio: encoding.compressionRatio,
    estimatedMemorySavings: encoding.originalSize - (encoding.encodedSize + encoding.dictionaryOverhead),
    recommendedCompression,
  };
}

/**
 * [SIMULATION] Compares compression across multiple column types
 */
export function compareCompressionAcrossColumns(): CompressionComparison {
  // Generate synthetic data for different column types
  const lowCardinalityData = Array(10000).fill(0).map(() => Math.floor(Math.random() * 10)); // 10 distinct values
  const highCardinalityData = Array(10000).fill(0).map((_, i) => i + Math.floor(Math.random() * 100)); // ~10000 distinct
  const sequentialData = Array(10000).fill(0).map((_, i) => i); // 1-10000 in order
  const randomData = Array(10000).fill(0).map(() => Math.floor(Math.random() * 1000000)); // random integers
  const repeatingTextData = Array(10000)
    .fill(0)
    .map(() => ['USA', 'Canada', 'Mexico', 'Brazil'][Math.floor(Math.random() * 4)]); // 4 distinct text values

  return {
    lowCardinalityColumn: analyzeColumnCompression(lowCardinalityData, 'Region', 'string'),
    highCardinalityColumn: analyzeColumnCompression(highCardinalityData, 'TransactionID', 'bigint'),
    sequentialColumn: analyzeColumnCompression(sequentialData, 'RowNumber', 'int'),
    randomColumn: analyzeColumnCompression(randomData, 'RandomValue', 'int'),
    repeatingTextColumn: analyzeColumnCompression(repeatingTextData, 'Country', 'string'),
  };
}

// ===== DIRECT LAKE COLUMN LOADING SIMULATOR =====

/**
 * [SIMULATION] Simulates the conceptual column loading path:
 * OneLake → Delta Lake → Parquet → VertiPaq → Semantic Model
 * [PROPRIETARY INTERNAL] Actual loading mechanism is Microsoft proprietary
 */
export function simulateDirectLakeColumnLoading(columnNames: string[]): DirectLakeLoadingSimulation {
  const oneLakeSize = 500000; // bytes
  const deltaLakeSize = 480000;
  const parquetSize = 450000;

  const allColumns = ['CustomerID', 'CustomerName', 'Region', 'Sales', 'Profit', 'Date'];

  const loadedColumns: ColumnLoadingInfo[] = columnNames.map((colName) => ({
    columnName: colName,
    columnType: getColumnType(colName),
    loadingState: 'LOADED',
    size: Math.floor(parquetSize / allColumns.length),
    loadingTimeMs: Math.floor(Math.random() * 50 + 10),
    memoryAddress: `0x${Math.random().toString(16).substr(2, 8).toUpperCase()}`,
  }));

  const unloadedColumns: ColumnLoadingInfo[] = allColumns
    .filter((col) => !columnNames.includes(col))
    .map((colName) => ({
      columnName: colName,
      columnType: getColumnType(colName),
      loadingState: 'UNLOADED',
      size: Math.floor(parquetSize / allColumns.length),
      loadingTimeMs: 0,
    }));

  const totalLoadedMemory = loadedColumns.reduce((sum, col) => sum + col.size, 0);

  const loadingSequence = columnNames.map((col, idx) => ({
    step: idx + 1,
    action: `Load column: ${col}`,
    timestamp: idx * 5,
    duration: Math.floor(Math.random() * 40 + 5),
  }));

  return {
    totalColumns: allColumns.length,
    oneLakeSize,
    deltaLakeSize,
    parquetSize,
    loadedColumns,
    unloadedColumns,
    totalLoadedMemory,
    loadingSequence,
    isAvailableForQueries: loadedColumns.length > 0,
  };
}

// ===== MEMORY RESIDENCY AND EVICTION SIMULATOR =====

/**
 * [SIMULATION] Simulates memory pressure and column eviction
 * [PROPRIETARY INTERNAL] Actual eviction policy is not publicly documented
 */
export function simulateMemoryEviction(
  loadedColumns: string[],
  memoryBudget: number,
  pressureLevel: number, // 0-100
): MemoryEvictionSimulation {
  const columnSize = Math.floor(memoryBudget / (pressureLevel > 75 ? 2 : pressureLevel > 50 ? 3 : 4));
  const initialMemoryUsed = loadedColumns.length * columnSize;

  const snapshots: MemoryResidencySnapshot[] = [];
  let currentMemory = initialMemoryUsed;
  let evictionCount = 0;
  const evictionEvents: Array<{ columnName: string; timestamp: number; reason: string }> = [];

  // Simulate memory pressure increasing over time
  for (let t = 0; t < 10; t++) {
    const pressure = Math.min(100, pressureLevel + t * 3);
    const requiredMemory = (pressure / 100) * memoryBudget * 1.2; // overshoot slightly

    let resident = [...loadedColumns];
    let evicted: string[] = [];

    // Evict columns if memory pressure is high
    if (requiredMemory > memoryBudget && resident.length > 1) {
      const columnsToEvict = Math.ceil(resident.length * (pressure > 80 ? 0.4 : 0.2));
      for (let i = 0; i < columnsToEvict && resident.length > 0; i++) {
        const idx = Math.floor(Math.random() * resident.length);
        const evictedCol = resident.splice(idx, 1)[0];
        evicted.push(evictedCol);
        evictionCount++;

        evictionEvents.push({
          columnName: evictedCol,
          timestamp: t,
          reason: 'Memory pressure exceeded threshold',
        });
      }
    }

    currentMemory = Math.floor(resident.length * columnSize);

    snapshots.push({
      timestamp: t,
      memoryCapacity: memoryBudget,
      memoryUsed: currentMemory,
      memoryAvailable: memoryBudget - currentMemory,
      memoryPressure: pressure,
      loadedColumns: resident,
      evictedColumns: evicted,
      evictionEvents: evictionEvents.filter((e) => e.timestamp === t),
    });
  }

  return {
    memoryBudget,
    initialMemoryUsed,
    memorySnapshots: snapshots,
    totalEvictionEvents: evictionCount,
    mostRecentlyEvicted: snapshots[snapshots.length - 1].evictedColumns,
    reloadCount: evictionCount,
  };
}

// ===== STORAGE ENGINE SCAN SIMULATOR =====

/**
 * [SIMULATION] Simulates Storage Engine scan execution
 * Demonstrates: column selection, segment elimination, filter evaluation, aggregation
 */
export function simulateStorageEngineScan(
  query: AggregationQuery,
  segments: Segment[],
  _columnCompressions: ColumnCompressionMetrics[],
): StorageEngineScan {
  const scanId = `SCAN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const executionSteps: StorageEngineScan['executionSteps'] = [];

  // Step 1: Identify required columns
  executionSteps.push({
    step: 1,
    action: 'Identify required columns',
    detail: `Columns: ${query.columns.join(', ')}`,
    duration: 1,
  });

  // Step 2: Apply segment elimination if filter exists
  let segmentsScanned = segments.length;
  let segmentsSkipped = 0;

  if (query.filterCondition) {
    const { column, operator, value } = query.filterCondition;
    const elimination = evaluateSegmentElimination(
      segments,
      column,
      operator as any,
      value as number,
    );

    segmentsScanned = elimination.segmentsScanned;
    segmentsSkipped = elimination.segmentsEliminated;

    executionSteps.push({
      step: 2,
      action: 'Apply segment elimination',
      detail: `Filter: ${column} ${operator} ${value} → ${segmentsScanned} segments scanned`,
      duration: segments.length * 0.5,
    });
  }

  // Step 3: Scan encoded column data
  const rowsScanned = segments
    .slice(0, segmentsScanned)
    .reduce((sum, seg) => sum + seg.rowCount, 0);

  executionSteps.push({
    step: 3,
    action: 'Scan encoded column data',
    detail: `${rowsScanned} rows scanned across ${query.columns.length} columns`,
    duration: rowsScanned * 0.01,
  });

  // Step 4: Evaluate filters
  if (query.filterCondition) {
    executionSteps.push({
      step: 4,
      action: 'Evaluate filter conditions',
      detail: `Apply filter: ${query.filterCondition.column} ${query.filterCondition.operator} ${query.filterCondition.value}`,
      duration: rowsScanned * 0.005,
    });
  }

  // Step 5: Aggregate
  let result: unknown = 0;

  switch (query.aggregation) {
    case 'SUM':
      result = Math.floor(rowsScanned * 1000); // simulated
      break;
    case 'COUNT':
      result = rowsScanned;
      break;
    case 'MIN':
      result = segments[0]?.statistics.minValue ?? 0;
      break;
    case 'MAX':
      result = segments[segments.length - 1]?.statistics.maxValue ?? 1000;
      break;
    case 'AVERAGE':
      result = Math.floor(
        (segments[0]?.statistics.averageValue ?? 0) +
          (segments[segments.length - 1]?.statistics.averageValue ?? 0),
      ) / 2;
      break;
  }

  executionSteps.push({
    step: 5,
    action: `Execute ${query.aggregation} aggregation`,
    detail: `Result: ${result}`,
    duration: rowsScanned * 0.001,
  });

  // Step 6: Return results
  const totalDuration = executionSteps.reduce((sum, step) => sum + step.duration, 0);

  executionSteps.push({
    step: 6,
    action: 'Return results',
    detail: `Query completed`,
    duration: 0.5,
  });

  const rowsSkipped = segments.reduce((sum: number) => sum, 0) - rowsScanned;
  const efficiency = (rowsScanned / (rowsScanned + rowsSkipped + 1)) * 100;

  return {
    scanId,
    queryFilter: query.filterCondition ? `${query.filterCondition.column} ${query.filterCondition.operator} ${query.filterCondition.value}` : undefined,
    requiredColumns: query.columns,
    applicableSegmentElimination: !!query.filterCondition,
    columnsAccessed: query.columns,
    segmentsScanned,
    segmentsSkipped,
    rowsScanned,
    rowsSkipped,
    executionSteps,
    result,
    executionTimeMs: totalDuration,
    efficiency,
  };
}

// ===== HELPER FUNCTIONS =====

function getColumnType(columnName: string): string {
  const typeMap: Record<string, string> = {
    CustomerID: 'bigint',
    CustomerName: 'varchar(100)',
    Region: 'varchar(50)',
    Sales: 'decimal(12,2)',
    Profit: 'decimal(12,2)',
    Date: 'date',
  };
  return typeMap[columnName] || 'varchar(100)';
}

// ===== SOURCE REFERENCES =====

export function getVertiPaqSourceReferences(): SourceReference[] {
  return [
    {
      title: 'Microsoft Fabric Direct Lake',
      url: 'https://learn.microsoft.com/en-us/power-bi/enterprise/directlake-overview',
      section: 'Direct Lake storage and query',
    },
    {
      title: 'VertiPaq Analyzer for Power BI',
      url: 'https://www.daxstudio.org/',
      section: 'VertiPaq memory analysis',
    },
    {
      title: 'Apache Parquet Format Specification',
      url: 'https://parquet.apache.org/docs/file-format/',
      section: 'Encoding and compression methods',
    },
    {
      title: 'Delta Lake Encoding and Compression',
      url: 'https://docs.delta.io/latest/best-practices.html',
      section: 'Column encoding strategies',
    },
    {
      title: 'Understanding VertiPaq Internals',
      url: 'https://www.sqlbi.com/articles/storage-engine-in-analysis-services-tabular-models/',
      section: 'Segment and dictionary encoding',
    },
  ];
}
