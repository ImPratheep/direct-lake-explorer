// Stage 6, Module 2 - Value vs Hash Encoding simulation logic
//
// [SIMULATION] Educational model. It is NOT Microsoft's VertiPaq implementation.
//
// What Microsoft documents (Microsoft Learn, Tabular Object Model reference,
// Column.EncodingHint and EncodingHintType):
//   [DOCUMENTED] A numeric column may use value-based or hash-based encoding.
//   [DOCUMENTED] The server normally detects which encoding to use; re-encoding may occur later.
//   [DOCUMENTED] A column can carry an encoding hint: Default, Hash or Value
//                (database compatibility level 1400 or above).
//
// What this file models (all [SIMPLIFIED MODEL]):
//   - Value encoding: scaled integer minus the column minimum, bit-packed.
//   - Hash encoding: distinct values stored once in a dictionary, rows store a bit-packed ID.
//   - Both use the same bit-packing rule, so sizes are comparable inside the model.
//
// What is deliberately NOT modelled ([PROPRIETARY INTERNAL]):
//   - The rule the engine uses to pick an encoding (not published).
//   - Real hash function, dictionary layout, run-length or other further compression.

import { EncodingColumn, EncodingSimulationResult, HashEncodingResult, SourceReference, ValueEncodingResult } from '../types';
import { isoDateToDayNumber } from './stage6-synthetic-dataset';

// [SIMPLIFIED MODEL] Size assumptions: educational constants, not engine values.
export const NUMERIC_VALUE_BYTES = 8;
export const TEXT_LENGTH_PREFIX_BYTES = 4;
export const VALUE_ENCODING_METADATA_BYTES = 16; // offset + scale factor
export const MIN_BITS = 1; // a constant column is still modelled with 1 bit per row

// Sentinel/outlier values used by the "add an outlier" demonstration.
const OUTLIER_INTEGER = 2_000_000_000;
const OUTLIER_DECIMAL = 99_999_999.99;
const OUTLIER_DATE = '9999-12-31';

/** Bits needed to distinguish `states` different values (minimum MIN_BITS). */
export function bitsRequired(states: number): number {
  let bits = MIN_BITS;
  while (2 ** bits < states) {
    bits++;
  }
  return bits;
}

/** UTF-8 byte length without relying on TextEncoder. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

// Size depends on the column's data type, not the JS type: DATE values are held as ISO strings
// for display but are modelled as numeric day numbers.
export function modelledValueBytes(dataType: EncodingColumn['dataType'], value: number | string): number {
  return dataType === 'TEXT' ? utf8ByteLength(String(value)) + TEXT_LENGTH_PREFIX_BYTES : NUMERIC_VALUE_BYTES;
}

function plainValueBytes(column: EncodingColumn, value: number | string): number {
  return modelledValueBytes(column.dataType, value);
}

function isTextColumn(column: EncodingColumn): boolean {
  return column.dataType === 'TEXT';
}

/** Scaled integer projection used by value encoding. Returns null for text columns. */
export function getNumericProjection(column: EncodingColumn): number[] | null {
  if (isTextColumn(column)) {
    return null;
  }
  const factor = 10 ** column.scale;
  return column.values.map((value) => {
    if (column.dataType === 'DATE') {
      return isoDateToDayNumber(value as string);
    }
    return Math.round((value as number) * factor);
  });
}

/** [SIMPLIFIED MODEL] Value encoding: (scaled value - minimum), bit-packed. Lossless for numeric columns. */
export function simulateValueEncoding(column: EncodingColumn): ValueEncodingResult {
  const projection = getNumericProjection(column);
  const scaleFactor = 10 ** column.scale;

  if (projection === null) {
    return {
      applicable: false,
      notApplicableReason:
        'Text is not numeric, so there is no offset to subtract. In this model text uses the dictionary (hash) path only.',
      offset: 0,
      scaleFactor,
      minValue: 0,
      maxValue: 0,
      range: 0,
      bitsPerValue: 0,
      storedValues: [],
      dataBytes: 0,
      metadataBytes: 0,
      totalBytes: 0,
    };
  }

  let minValue = Infinity;
  let maxValue = -Infinity;
  for (const value of projection) {
    if (value < minValue) minValue = value;
    if (value > maxValue) maxValue = value;
  }
  if (projection.length === 0) {
    minValue = 0;
    maxValue = 0;
  }

  const range = maxValue - minValue;
  const bitsPerValue = bitsRequired(range + 1);
  const dataBytes = Math.ceil((projection.length * bitsPerValue) / 8);

  return {
    applicable: true,
    offset: minValue,
    scaleFactor,
    minValue,
    maxValue,
    range,
    bitsPerValue,
    storedValues: projection.map((value) => value - minValue),
    dataBytes,
    metadataBytes: VALUE_ENCODING_METADATA_BYTES,
    totalBytes: dataBytes + VALUE_ENCODING_METADATA_BYTES,
  };
}

/** Reverses value encoding for one stored value (scaled integer, not formatted for display). */
export function decodeValueEncoded(result: ValueEncodingResult, storedValue: number): number {
  return (storedValue + result.offset) / result.scaleFactor;
}

/** [SIMPLIFIED MODEL] Hash (dictionary) encoding: distinct values stored once, rows keep a bit-packed ID. Lossless. */
export function simulateHashEncoding(column: EncodingColumn): HashEncodingResult {
  // A Map is a hash table: one lookup per row finds or assigns the ID.
  // The real engine's structure and hash function are [PROPRIETARY INTERNAL].
  const idByValue = new Map<number | string, number>();
  const dictionary: Array<number | string> = [];
  const ids: number[] = [];

  for (const value of column.values) {
    let id = idByValue.get(value);
    if (id === undefined) {
      id = dictionary.length;
      idByValue.set(value, id);
      dictionary.push(value);
    }
    ids.push(id);
  }

  const cardinality = dictionary.length;
  const bitsPerId = bitsRequired(cardinality);
  const dataBytes = Math.ceil((ids.length * bitsPerId) / 8);
  const dictionaryBytes = dictionary.reduce((sum: number, value) => sum + plainValueBytes(column, value), 0);

  return {
    dictionary,
    ids,
    cardinality,
    bitsPerId,
    dataBytes,
    dictionaryBytes,
    totalBytes: dataBytes + dictionaryBytes,
  };
}

/**
 * Replaces the last row with an extreme value (for example the common 9999-12-31 sentinel date).
 * It widens a numeric column's range while adding only one distinct value. Text is returned unchanged.
 */
export function applyOutlier(column: EncodingColumn): EncodingColumn {
  if (isTextColumn(column) || column.values.length === 0) {
    return column;
  }
  const outlier =
    column.dataType === 'DATE' ? OUTLIER_DATE : column.dataType === 'DECIMAL' ? OUTLIER_DECIMAL : OUTLIER_INTEGER;
  const values = column.values.slice();
  values[values.length - 1] = outlier;
  return { ...column, values };
}

/**
 * Runs both simulations on one column and compares total modelled size.
 * `smallerInModel` is a size comparison inside this simplified model only.
 * It is not the encoding VertiPaq would choose.
 */
export function compareValueAndHashEncoding(
  column: EncodingColumn,
  options: { includeOutlier?: boolean } = {},
): EncodingSimulationResult {
  const outlierApplied = Boolean(options.includeOutlier) && !isTextColumn(column) && column.values.length > 0;
  const source = outlierApplied ? applyOutlier(column) : column;

  const value = simulateValueEncoding(source);
  const hash = simulateHashEncoding(source);
  const baselineBytes = source.values.reduce((sum: number, item) => sum + plainValueBytes(source, item), 0);

  let smallerInModel: EncodingSimulationResult['smallerInModel'] = null;
  if (value.applicable) {
    if (value.totalBytes === hash.totalBytes) smallerInModel = 'TIE';
    else smallerInModel = value.totalBytes < hash.totalBytes ? 'VALUE' : 'HASH';
  }

  return {
    columnName: source.name,
    sourceType: source.sourceType,
    dataType: source.dataType,
    rowCount: source.values.length,
    outlierApplied,
    baselineBytes,
    value,
    hash,
    smallerInModel,
  };
}

/** Plain-language reading of one result. Never claims what the real engine chooses. */
export function explainEncodingResult(result: EncodingSimulationResult): string[] {
  const fmt = (n: number): string => n.toLocaleString('en-US');
  const lines: string[] = [];

  if (!result.value.applicable) {
    lines.push(`${result.columnName} is text, so value encoding does not apply in this model.`);
    lines.push(
      `Hash encoding stores ${fmt(result.hash.cardinality)} distinct values once (${fmt(result.hash.dictionaryBytes)} bytes) ` +
        `and ${result.hash.bitsPerId} bit(s) per row for the ID.`,
    );
    return lines;
  }

  lines.push(
    `Value encoding cost follows the range: max - min = ${fmt(result.value.range)}, so ${result.value.bitsPerValue} bit(s) per row.`,
  );
  lines.push(
    `Hash encoding cost follows the distinct count: ${fmt(result.hash.cardinality)} distinct values, ` +
      `${result.hash.bitsPerId} bit(s) per row plus a ${fmt(result.hash.dictionaryBytes)} byte dictionary.`,
  );

  if (result.smallerInModel === 'TIE') {
    lines.push('In this simplified model both representations have the same total size.');
  } else {
    const winner = result.smallerInModel === 'VALUE' ? 'Value' : 'Hash';
    const difference = Math.abs(result.value.totalBytes - result.hash.totalBytes);
    lines.push(
      `In this simplified model ${winner} encoding is ${fmt(difference)} bytes smaller. ` +
        'This is a size comparison only; it does not predict which encoding the engine selects.',
    );
  }
  return lines;
}

export function getEncodingSourceReferences(): SourceReference[] {
  return [
    {
      title: 'Column.EncodingHint Property (Microsoft.AnalysisServices.Tabular)',
      url: 'https://learn.microsoft.com/en-us/dotnet/api/microsoft.analysisservices.tabular.column.encodinghint',
      section: 'Numeric columns may use value-based or hash-based encoding; the server normally detects which',
    },
    {
      title: 'EncodingHintType Enum (Microsoft.AnalysisServices.Tabular)',
      url: 'https://learn.microsoft.com/en-us/dotnet/api/microsoft.analysisservices.tabular.encodinghinttype',
      section: 'Default, Hash and Value hints; compatibility level 1400 or above',
    },
    {
      title: 'Direct Lake overview',
      url: 'https://learn.microsoft.com/en-us/power-bi/enterprise/directlake-overview',
      section: 'Direct Lake loads Parquet column data for the semantic model',
    },
    {
      title: 'Apache Parquet encodings',
      url: 'https://parquet.apache.org/docs/file-format/data-pages/encodings/',
      section: 'Parquet dictionary and plain encodings (a different format from VertiPaq)',
    },
  ];
}
