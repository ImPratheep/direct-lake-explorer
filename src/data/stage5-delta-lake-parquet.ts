// Stage 5 - Delta Lake and Parquet data definitions
// [SIMULATION] Synthetic data for educational purposes
import {
  DeltaTransactionLog,
  DeltaTableVersion,
  DeltaCommitAction,
  ParquetFileMetadata,
  ParquetRowGroup,
  ParquetColumnChunk,
  ParquetPage,
  ParquetColumnMetadata,
  FilterCondition,
  RowGroupEvaluation,
  PredicatePushdownResult,
  PartitionPruneResult,
  PartitionedFile,
  SchemaEvolutionState,
  SchemaVersion,
  SourceReference,
} from '../types';

// ===== DELTA LAKE TRANSACTION LOG DATA =====

/**
 * [SIMULATION] Generates a synthetic Delta Lake transaction log
 * representing typical INSERT, UPDATE, DELETE operations
 */
export function generateSyntheticDeltaLog(): DeltaTransactionLog {
  const baseTimestamp = Date.now() - 86400000; // 1 day ago

  const actions: DeltaCommitAction[] = [
    {
      type: 'Metadata',
      timestamp: baseTimestamp,
      description: 'Initial table creation',
      details: {
        schema: 'CustomerData',
        format: 'parquet',
        partitionColumns: ['Region'],
      },
    },
    {
      type: 'Protocol',
      timestamp: baseTimestamp + 3600000,
      description: 'Protocol version set',
      details: {
        minReaderVersion: 1,
        minWriterVersion: 2,
      },
    },
    {
      type: 'Add',
      timestamp: baseTimestamp + 7200000,
      description: 'Initial data load (1000 rows)',
      details: {
        path: 'part-00000-abc123.parquet',
        size: 25000,
        rowCount: 1000,
        partitionValues: { Region: 'North' },
      },
    },
    {
      type: 'Add',
      timestamp: baseTimestamp + 10800000,
      description: 'Additional partition data',
      details: {
        path: 'part-00001-def456.parquet',
        size: 28000,
        rowCount: 1050,
        partitionValues: { Region: 'South' },
      },
    },
    {
      type: 'Add',
      timestamp: baseTimestamp + 14400000,
      description: 'Insert new customer records (500 rows)',
      details: {
        path: 'part-00002-ghi789.parquet',
        size: 15000,
        rowCount: 500,
        partitionValues: { Region: 'East' },
      },
    },
    {
      type: 'Remove',
      timestamp: baseTimestamp + 18000000,
      description: 'Delete invalid records',
      details: {
        path: 'part-00000-abc123.parquet',
        deletionTimestamp: baseTimestamp + 18000000,
      },
    },
    {
      type: 'Add',
      timestamp: baseTimestamp + 18000000,
      description: 'Recreate partition with cleaned data',
      details: {
        path: 'part-00003-jkl012.parquet',
        size: 24000,
        rowCount: 950,
        partitionValues: { Region: 'North' },
      },
    },
    {
      type: 'Metadata',
      timestamp: baseTimestamp + 21600000,
      description: 'Schema evolution - add new column',
      details: {
        newColumn: 'LoyaltyTier',
        dataType: 'string',
        nullable: true,
      },
    },
  ];

  const versions: DeltaTableVersion[] = [];
  let cumulativeRowCount = 0;
  let cumulativeFileCount = 0;

  actions.forEach((action, index) => {
    if (action.type === 'Add') {
      cumulativeRowCount += (action.details.rowCount as number) || 0;
      cumulativeFileCount += 1;
    } else if (action.type === 'Remove') {
      cumulativeRowCount = Math.max(0, cumulativeRowCount - 1000);
      cumulativeFileCount = Math.max(0, cumulativeFileCount - 1);
    }

    versions.push({
      version: index,
      timestamp: action.timestamp,
      actions: [action],
      rowCount: cumulativeRowCount,
      fileCount: cumulativeFileCount,
    });
  });

  return {
    tableName: 'customer_analytics',
    versions,
    currentVersion: versions.length - 1,
    checkpointInterval: 10,
  };
}

/**
 * Get Delta Lake documentation references
 */
export function getDeltaLakeSourceReferences(): SourceReference[] {
  return [
    {
      title: 'Delta Lake Overview - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/delta-lake-overview',
      section: 'Transaction logs and ACID guarantees',
    },
    {
      title: 'Delta Lake Table Format Interoperability',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/delta-lake-interoperability',
      section: 'Version control and time travel',
    },
    {
      title: 'Lakehouse and Delta Tables',
      url: 'https://learn.microsoft.com/en-us/fabric/data-engineering/lakehouse-and-delta-tables',
      section: 'Transaction log structure',
    },
  ];
}

// ===== PARQUET FILE DATA =====

/**
 * [SIMULATION] Generates a synthetic Parquet file with realistic structure
 */
export function generateSyntheticParquetFile(): ParquetFileMetadata {
  const columns: ParquetColumnMetadata[] = [
    {
      name: 'CustomerID',
      type: 'int64',
      repetitionType: 'REQUIRED',
      encoding: 'PLAIN',
      compression: 'SNAPPY',
    },
    {
      name: 'CustomerName',
      type: 'utf8',
      repetitionType: 'REQUIRED',
      encoding: 'DICTIONARY',
      compression: 'SNAPPY',
    },
    {
      name: 'Region',
      type: 'utf8',
      repetitionType: 'OPTIONAL',
      encoding: 'DICTIONARY',
      compression: 'SNAPPY',
    },
    {
      name: 'Revenue',
      type: 'decimal(18,2)',
      repetitionType: 'REQUIRED',
      encoding: 'DELTA',
      compression: 'SNAPPY',
    },
    {
      name: 'LastPurchaseDate',
      type: 'int32',
      logicalType: 'DATE',
      repetitionType: 'OPTIONAL',
      encoding: 'DELTA',
      compression: 'SNAPPY',
    },
  ];

  // Create pages with statistics
  const createPages = (columnName: string, rowGroupRowCount: number): ParquetPage[] => {
    const pageSize = Math.ceil(rowGroupRowCount / 3);
    return [
      {
        pageIndex: 0,
        rowCount: pageSize,
        compressedSize: Math.floor(pageSize * 4),
        uncompressedSize: Math.floor(pageSize * 8),
        compression: 'SNAPPY',
        encoding: columnName === 'CustomerName' || columnName === 'Region' ? 'DICTIONARY' : 'PLAIN',
        statistics: {
          min: columnName === 'CustomerID' ? 1 : 'AAA',
          max: columnName === 'CustomerID' ? pageSize : 'ZZZ',
          nullCount: columnName === 'Region' || columnName === 'LastPurchaseDate' ? 5 : 0,
          distinctCount: Math.floor(pageSize * 0.95),
        },
      },
      {
        pageIndex: 1,
        rowCount: pageSize,
        compressedSize: Math.floor(pageSize * 4),
        uncompressedSize: Math.floor(pageSize * 8),
        compression: 'SNAPPY',
        encoding: columnName === 'CustomerName' || columnName === 'Region' ? 'DICTIONARY' : 'PLAIN',
        statistics: {
          min: columnName === 'CustomerID' ? pageSize + 1 : 'AAA',
          max: columnName === 'CustomerID' ? pageSize * 2 : 'ZZZ',
          nullCount: 3,
          distinctCount: Math.floor(pageSize * 0.93),
        },
      },
      {
        pageIndex: 2,
        rowCount: rowGroupRowCount - pageSize * 2,
        compressedSize: Math.floor((rowGroupRowCount - pageSize * 2) * 4),
        uncompressedSize: Math.floor((rowGroupRowCount - pageSize * 2) * 8),
        compression: 'SNAPPY',
        encoding: columnName === 'CustomerName' || columnName === 'Region' ? 'DICTIONARY' : 'PLAIN',
        statistics: {
          min: columnName === 'CustomerID' ? pageSize * 2 + 1 : 'AAA',
          max: columnName === 'CustomerID' ? rowGroupRowCount : 'ZZZ',
          nullCount: 2,
          distinctCount: Math.floor((rowGroupRowCount - pageSize * 2) * 0.92),
        },
      },
    ];
  };

  // Create row groups
  const rowGroups: ParquetRowGroup[] = [];
  const totalRows = 5000;
  const rowsPerGroup = 1000;

  for (let i = 0; i < 5; i++) {
    const rgRowCount = Math.min(rowsPerGroup, totalRows - i * rowsPerGroup);
    const columnChunks: ParquetColumnChunk[] = columns.map((col) => ({
      columnName: col.name,
      columnIndex: columns.indexOf(col),
      pages: createPages(col.name, rgRowCount),
      statistics: {
        min: col.type.includes('int') ? i * rowsPerGroup + 1 : 'AAA',
        max: col.type.includes('int') ? (i + 1) * rowsPerGroup : 'ZZZ',
        nullCount: col.repetitionType === 'OPTIONAL' ? Math.floor(rgRowCount * 0.02) : 0,
        distinctCount: Math.floor(rgRowCount * 0.98),
      },
      dictionaryPageSize: col.encoding === 'DICTIONARY' ? 2048 : 0,
      totalSize: rgRowCount * 8 + 1024,
    }));

    rowGroups.push({
      rowGroupIndex: i,
      rowCount: rgRowCount,
      columnChunks,
      totalSize: columnChunks.reduce((sum, cc) => sum + cc.totalSize, 0),
      statistics: {
        CustomerID: {
          min: i * rowsPerGroup + 1,
          max: (i + 1) * rowsPerGroup,
          nullCount: 0,
          distinctCount: rgRowCount,
        },
      },
    });
  }

  return {
    fileName: 'customer_data_2024.parquet',
    fileSize: 125000,
    rowCount: totalRows,
    columnCount: columns.length,
    rowGroups,
    columns,
    createdBy: 'DirectLakeExplorer/1.0',
    schemaJson: JSON.stringify({
      type: 'struct',
      fields: columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: c.repetitionType === 'OPTIONAL',
      })),
    }),
  };
}

/**
 * Get Parquet documentation references
 */
export function getParquetSourceReferences(): SourceReference[] {
  return [
    {
      title: 'Apache Parquet Format Overview',
      url: 'https://parquet.apache.org/docs/overview/',
      section: 'File format and row groups',
    },
    {
      title: 'Lakehouse and Delta Tables - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/data-engineering/lakehouse-and-delta-tables',
      section: 'Parquet files and row groups',
    },
    {
      title: 'Optimize Delta Lake Tables with V-Order',
      url: 'https://learn.microsoft.com/en-us/fabric/data-engineering/delta-optimization-and-v-order',
      section: 'Parquet optimization',
    },
  ];
}

// ===== PREDICATE PUSHDOWN SIMULATOR =====

/**
 * [SIMULATION] Simulates predicate pushdown on Parquet row groups
 * Demonstrates how row-group statistics enable data skipping
 */
export function evaluatePredicatePushdown(
  parquetFile: ParquetFileMetadata,
  conditions: FilterCondition[],
): PredicatePushdownResult {
  const evaluations: RowGroupEvaluation[] = [];
  let rowGroupsScanned = 0;
  let rowGroupsSkipped = 0;
  let rowsScanned = 0;
  let rowsSkipped = 0;

  parquetFile.rowGroups.forEach((rg) => {
    const colName = conditions[0]?.columnName;
    if (!colName) return;

    const stats = rg.statistics[colName];
    if (!stats) {
      // If stats not available, must scan
      evaluations.push({
        rowGroupIndex: rg.rowGroupIndex,
        condition: conditions[0],
        canEliminate: false,
        reason: 'Statistics not available',
        minValue: null,
        maxValue: null,
      });
      rowGroupsScanned++;
      rowsScanned += rg.rowCount;
      return;
    }

    // Check if row group statistics can eliminate this row group
    const condition = conditions[0];
    let canEliminate = false;
    let reason = '';

    if (condition.operator === '=') {
      const val = condition.value as number;
      if (val < (stats.min as number) || val > (stats.max as number)) {
        canEliminate = true;
        reason = `Value ${val} is outside range [${stats.min}, ${stats.max}]`;
      }
    } else if (condition.operator === '<') {
      const val = condition.value as number;
      if ((stats.min as number) >= val) {
        canEliminate = true;
        reason = `All values >= ${stats.min}, condition requires < ${val}`;
      }
    } else if (condition.operator === '>') {
      const val = condition.value as number;
      if ((stats.max as number) <= val) {
        canEliminate = true;
        reason = `All values <= ${stats.max}, condition requires > ${val}`;
      }
    }

    evaluations.push({
      rowGroupIndex: rg.rowGroupIndex,
      condition,
      canEliminate,
      reason: reason || 'Row group must be scanned',
      minValue: stats.min,
      maxValue: stats.max,
    });

    if (canEliminate) {
      rowGroupsSkipped++;
      rowsSkipped += rg.rowCount;
    } else {
      rowGroupsScanned++;
      rowsScanned += rg.rowCount;
    }
  });

  const totalRowGroups = parquetFile.rowGroups.length;
  const estimatedReduction = rowsScanned > 0 ? Math.round((rowsSkipped / (rowsScanned + rowsSkipped)) * 100) : 0;

  return {
    totalRowGroups,
    evaluatedRowGroups: evaluations,
    rowGroupsScanned,
    rowGroupsSkipped,
    rowsScanned,
    rowsSkipped,
    estimatedReduction,
  };
}

/**
 * Get predicate pushdown documentation references
 */
export function getPredicatePushdownSourceReferences(): SourceReference[] {
  return [
    {
      title: 'Understand Direct Lake query performance - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-understand-storage',
      section: 'Segment elimination and predicate pushdown',
    },
  ];
}

// ===== PARTITIONING EXPLORER =====

/**
 * [SIMULATION] Generates a synthetic partitioned Delta table
 */
export function generateSyntheticPartitionedTable(): PartitionedFile[] {
  const regions = ['North', 'South', 'East', 'West', 'Central'];
  const years = [2022, 2023, 2024];
  const files: PartitionedFile[] = [];
  let fileId = 0;

  regions.forEach((region) => {
    years.forEach((year) => {
      for (let month = 1; month <= 12; month++) {
        const monthStr = String(month).padStart(2, '0');
        files.push({
          path: `Region=${region}/Year=${year}/Month=${monthStr}/data_${fileId}.parquet`,
          partitionKeys: [
            { name: 'Region', value: region },
            { name: 'Year', value: year.toString() },
            { name: 'Month', value: monthStr },
          ],
          size: 15000 + Math.random() * 10000,
          rowCount: 500 + Math.floor(Math.random() * 300),
        });
        fileId++;
      }
    });
  });

  return files;
}

/**
 * [SIMULATION] Simulates partition pruning based on filter conditions
 */
export function evaluatePartitionPruning(
  files: PartitionedFile[],
  filterConditions: Record<string, string>,
): PartitionPruneResult {
  let matchingPartitions = 0;
  let scannedPartitions = 0;
  const matchedFiles: PartitionedFile[] = [];

  files.forEach((file) => {
    let matches = true;

    for (const [partitionName, requiredValue] of Object.entries(filterConditions)) {
      const pkMatch = file.partitionKeys.find((pk) => pk.name === partitionName);
      if (!pkMatch || pkMatch.value !== requiredValue) {
        matches = false;
        break;
      }
    }

    if (matches) {
      matchingPartitions++;
      scannedPartitions++;
      matchedFiles.push(file);
    }
  });

  const prunedPartitions = files.length - matchingPartitions;
  const reductionPercentage = files.length > 0 ? Math.round((prunedPartitions / files.length) * 100) : 0;

  return {
    totalPartitions: files.length,
    matchingPartitions,
    scannedPartitions,
    prunedPartitions,
    files: matchedFiles,
    reductionPercentage,
  };
}

/**
 * Get partitioning documentation references
 */
export function getPartitioningSourceReferences(): SourceReference[] {
  return [
    {
      title: 'How Direct Lake works - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-how-it-works',
      section: 'Table snapshots and partition pruning',
    },
  ];
}

// ===== SCHEMA EVOLUTION =====

/**
 * [SIMULATION] Generates schema evolution history
 */
export function generateSchemaEvolutionHistory(): SchemaEvolutionState {
  const baseTimestamp = Date.now() - 2592000000; // 30 days ago

  const schemaVersions: SchemaVersion[] = [
    {
      version: 0,
      timestamp: baseTimestamp,
      columns: [
        { name: 'CustomerID', type: 'int64', nullable: false },
        { name: 'CustomerName', type: 'utf8', nullable: false },
        { name: 'Region', type: 'utf8', nullable: true },
        { name: 'Revenue', type: 'decimal(18,2)', nullable: false },
      ],
      change: undefined,
    },
    {
      version: 1,
      timestamp: baseTimestamp + 604800000, // 7 days later
      columns: [
        { name: 'CustomerID', type: 'int64', nullable: false },
        { name: 'CustomerName', type: 'utf8', nullable: false },
        { name: 'Region', type: 'utf8', nullable: true },
        { name: 'Revenue', type: 'decimal(18,2)', nullable: false },
        { name: 'LastPurchaseDate', type: 'date', nullable: true },
      ],
      change: {
        type: 'ADD',
        columnName: 'LastPurchaseDate',
        newType: 'date',
      },
    },
    {
      version: 2,
      timestamp: baseTimestamp + 1209600000, // 14 days later
      columns: [
        { name: 'CustomerID', type: 'int64', nullable: false },
        { name: 'CustomerName', type: 'utf8', nullable: false },
        { name: 'Region', type: 'utf8', nullable: true },
        { name: 'Revenue', type: 'decimal(18,2)', nullable: false },
        { name: 'LastPurchaseDate', type: 'date', nullable: true },
        { name: 'LoyaltyTier', type: 'utf8', nullable: true, metadata: { values: 'Gold,Silver,Bronze' } },
      ],
      change: {
        type: 'ADD',
        columnName: 'LoyaltyTier',
        newType: 'utf8',
      },
    },
    {
      version: 3,
      timestamp: baseTimestamp + 1814400000, // 21 days later
      columns: [
        { name: 'CustomerID', type: 'int64', nullable: false },
        { name: 'CustomerName', type: 'utf8', nullable: false },
        { name: 'Country', type: 'utf8', nullable: true }, // Renamed from Region
        { name: 'Revenue', type: 'decimal(18,2)', nullable: false },
        { name: 'LastPurchaseDate', type: 'date', nullable: true },
        { name: 'LoyaltyTier', type: 'utf8', nullable: true, metadata: { values: 'Gold,Silver,Bronze' } },
      ],
      change: {
        type: 'RENAME',
        columnName: 'Region',
        oldName: 'Region',
        newName: 'Country',
      },
    },
  ];

  return {
    currentSchema: schemaVersions[schemaVersions.length - 1].columns,
    schemaVersions,
    compatibilityMode: 'BACKWARD',
  };
}

/**
 * Get schema evolution documentation references
 */
export function getSchemaEvolutionSourceReferences(): SourceReference[] {
  return [
    {
      title: 'Delta Lake Overview - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/delta-lake-overview',
      section: 'Schema evolution',
    },
  ];
}
