// Stage 6 - VertiPaq Simulator data and simulation logic
// [SIMULATION] Educational representation of VertiPaq concepts
// References: Microsoft Fabric and Power BI documentation

import {
  Dictionary,
  DictionaryEncodingResult,
  EncodingDataType,
  SourceReference,
} from '../types';
import { bitsRequired, modelledValueBytes } from './stage6-encoding-simulator';

// ===== DICTIONARY ENCODING SIMULATOR =====

/**
 * [SIMULATION] Generates dictionary encoding from sample data.
 * [SIMPLIFIED MODEL] Sizes use the same educational model as Module 2:
 *   - original: 8 bytes per number/date, or 4-byte length prefix + UTF-8 bytes per text value
 *   - IDs: bit-packed, ceil(log2(distinct values)) bits per row, minimum 1 bit
 *   - dictionary: each distinct value stored once at its original size
 * These are not measurements of any real engine.
 * `dataType` defaults to TEXT for string values and INTEGER otherwise.
 */
export function generateDictionaryEncoding(
  columnData: unknown[],
  columnName: string,
  dataType?: EncodingDataType,
): DictionaryEncodingResult {
  const resolvedType: EncodingDataType =
    dataType ?? (columnData.some((value) => typeof value === 'string') ? 'TEXT' : 'INTEGER');
  const sizeOf = (value: unknown): number =>
    modelledValueBytes(resolvedType, typeof value === 'number' || typeof value === 'string' ? value : String(value));

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

  const originalSize = columnData.reduce((sum: number, value) => sum + sizeOf(value), 0);
  const bitsPerId = bitsRequired(uniqueValues.length);
  const encodedSize = Math.ceil((columnData.length * bitsPerId) / 8);
  const dictionaryOverhead = uniqueValues.reduce((sum: number, value) => sum + sizeOf(value), 0);

  // An empty column has nothing to compare, so the ratio is reported as 1 (no change).
  const totalEncodedSize = encodedSize + dictionaryOverhead;
  const compressionRatio = totalEncodedSize > 0 ? originalSize / totalEncodedSize : 1;

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
    bitsPerId,
    originalSize,
    encodedSize,
    dictionaryOverhead,
    compressionRatio,
  };
}

// Value vs hash encoding (Module 2) lives in ./stage6-encoding-simulator.ts
// Segment generation (Module 3) lives in ./stage6-segment-simulator.ts
// Segment elimination (Module 4) lives in ./stage6-elimination-simulator.ts
// Column compression (Module 5) lives in ./stage6-compression-simulator.ts
// Column loading (Module 6) lives in ./stage6-loading-simulator.ts

// Memory residency and eviction (Module 7) lives in ./stage6-memory-simulator.ts

// ===== STORAGE ENGINE SCAN SIMULATOR =====
// Storage Engine scan (Module 8) lives in ./stage6-scan-simulator.ts

// ===== HELPER FUNCTIONS =====

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
