import { describe, expect, it } from 'vitest';
import { EncodingColumn } from '../../types';
import {
  applyOutlier,
  bitsRequired,
  compareValueAndHashEncoding,
  decodeValueEncoded,
  explainEncodingResult,
  getEncodingSourceReferences,
  getNumericProjection,
  simulateHashEncoding,
  simulateValueEncoding,
  utf8ByteLength,
  VALUE_ENCODING_METADATA_BYTES,
} from '../stage6-encoding-simulator';
import { generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../stage6-synthetic-dataset';

const intColumn = (values: number[]): EncodingColumn => ({
  name: 'Ints',
  sourceType: 'int64',
  dataType: 'INTEGER',
  scale: 0,
  values,
});

const textColumn = (values: string[]): EncodingColumn => ({
  name: 'Text',
  sourceType: 'utf8',
  dataType: 'TEXT',
  scale: 0,
  values,
});

const customerColumn = (name: string, rowCount: number): EncodingColumn =>
  getCustomerEncodingColumn(generateSyntheticCustomerRows(rowCount), name);

describe('bit and byte helpers', () => {
  it('bitsRequired returns ceil(log2(states)) with a minimum of 1', () => {
    expect(bitsRequired(0)).toBe(1);
    expect(bitsRequired(1)).toBe(1);
    expect(bitsRequired(2)).toBe(1);
    expect(bitsRequired(3)).toBe(2);
    expect(bitsRequired(4)).toBe(2);
    expect(bitsRequired(5)).toBe(3);
    expect(bitsRequired(1024)).toBe(10);
    expect(bitsRequired(1025)).toBe(11);
  });

  it('utf8ByteLength counts UTF-8 bytes', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
  });
});

describe('value encoding (simplified model)', () => {
  it('stores value - minimum and bit-packs the result', () => {
    const result = simulateValueEncoding(intColumn([100, 105, 103]));
    expect(result.applicable).toBe(true);
    expect(result.offset).toBe(100);
    expect(result.range).toBe(5);
    expect(result.storedValues).toEqual([0, 5, 3]);
    expect(result.bitsPerValue).toBe(3); // 6 possible values -> 3 bits
    expect(result.dataBytes).toBe(2); // 3 rows * 3 bits = 9 bits -> 2 bytes
    expect(result.totalBytes).toBe(2 + VALUE_ENCODING_METADATA_BYTES);
  });

  it('is lossless for integers', () => {
    const values = [7, 3, 9, 3, 1_000_000];
    const result = simulateValueEncoding(intColumn(values));
    expect(result.storedValues.map((stored) => decodeValueEncoded(result, stored))).toEqual(values);
  });

  it('scales decimals to whole numbers and decodes them exactly', () => {
    const column: EncodingColumn = {
      name: 'Money',
      sourceType: 'decimal(18,2)',
      dataType: 'DECIMAL',
      scale: 2,
      values: [10.25, 10.5, 99.99],
    };
    expect(getNumericProjection(column)).toEqual([1025, 1050, 9999]);
    const result = simulateValueEncoding(column);
    expect(result.offset).toBe(1025);
    expect(result.storedValues).toEqual([0, 25, 8974]);
    expect(result.storedValues.map((stored) => decodeValueEncoded(result, stored))).toEqual([10.25, 10.5, 99.99]);
  });

  it('round-trips every synthetic numeric column', () => {
    for (const name of ['CustomerID', 'Revenue']) {
      const column = customerColumn(name, 400);
      const result = simulateValueEncoding(column);
      const decoded = result.storedValues.map((stored) => decodeValueEncoded(result, stored));
      decoded.forEach((value, i) => expect(value).toBeCloseTo(column.values[i] as number, 9));
    }
  });

  it('treats dates as whole-day numbers', () => {
    const column: EncodingColumn = {
      name: 'When',
      sourceType: 'date',
      dataType: 'DATE',
      scale: 0,
      values: ['2024-01-01', '2024-01-03', '2024-01-02'],
    };
    const result = simulateValueEncoding(column);
    expect(result.range).toBe(2);
    expect(result.storedValues).toEqual([0, 2, 1]);
  });

  it('models a constant column as one bit per row with range 0', () => {
    const result = simulateValueEncoding(intColumn([5, 5, 5, 5]));
    expect(result.range).toBe(0);
    expect(result.bitsPerValue).toBe(1);
    expect(result.storedValues).toEqual([0, 0, 0, 0]);
  });

  it('is not applicable to text and says why', () => {
    const result = simulateValueEncoding(textColumn(['a', 'b']));
    expect(result.applicable).toBe(false);
    expect(result.notApplicableReason).toMatch(/not numeric/i);
    expect(result.totalBytes).toBe(0);
    expect(getNumericProjection(textColumn(['a']))).toBeNull();
  });

  it('handles an empty column without throwing', () => {
    const result = simulateValueEncoding(intColumn([]));
    expect(result.applicable).toBe(true);
    expect(result.dataBytes).toBe(0);
  });
});

describe('hash encoding (simplified model)', () => {
  it('assigns IDs in first-seen order and builds a dictionary', () => {
    const result = simulateHashEncoding(textColumn(['b', 'a', 'b', 'c']));
    expect(result.dictionary).toEqual(['b', 'a', 'c']);
    expect(result.ids).toEqual([0, 1, 0, 2]);
    expect(result.cardinality).toBe(3);
    expect(result.bitsPerId).toBe(2);
    expect(result.dataBytes).toBe(1); // 4 rows * 2 bits = 8 bits
    expect(result.dictionaryBytes).toBe(3 * (1 + 4)); // 1 text byte + 4-byte length prefix, three entries
    expect(result.totalBytes).toBe(1 + 15);
  });

  it('is lossless: dictionary[id] reproduces every original value', () => {
    for (const name of ['CustomerID', 'Revenue', 'LastPurchaseDate', 'Region', 'CustomerName']) {
      const column = customerColumn(name, 400);
      const result = simulateHashEncoding(column);
      expect(result.ids.map((id) => result.dictionary[id])).toEqual(column.values);
    }
  });

  it('uses ceil(log2(cardinality)) bits per ID', () => {
    const result = simulateHashEncoding(customerColumn('CustomerName', 500));
    expect(result.bitsPerId).toBe(bitsRequired(result.cardinality));
  });

  it('keeps numbers and numeric-looking strings distinct', () => {
    const column: EncodingColumn = { ...textColumn([]), values: [1, '1', 1] };
    expect(simulateHashEncoding(column).cardinality).toBe(2);
  });
});

describe('comparison', () => {
  it('computes the uncompressed baseline as 8 bytes per numeric value', () => {
    const result = compareValueAndHashEncoding(intColumn([1, 2, 3, 4]));
    expect(result.baselineBytes).toBe(32);
    expect(result.rowCount).toBe(4);
  });

  it('sizes DATE values as 8-byte numbers, not as their ISO text', () => {
    const rows = generateSyntheticCustomerRows(100);
    const result = compareValueAndHashEncoding(getCustomerEncodingColumn(rows, 'LastPurchaseDate'));
    expect(result.baselineBytes).toBe(100 * 8);
    expect(result.hash.dictionaryBytes).toBe(result.hash.cardinality * 8);
  });

  it('reports value as smaller in the model for a sequential key', () => {
    const result = compareValueAndHashEncoding(customerColumn('CustomerID', 1000));
    expect(result.value.range).toBe(999);
    expect(result.hash.cardinality).toBe(1000);
    expect(result.smallerInModel).toBe('VALUE');
  });

  it('reports no model winner for text, because value encoding does not apply', () => {
    const result = compareValueAndHashEncoding(customerColumn('Region', 500));
    expect(result.value.applicable).toBe(false);
    expect(result.smallerInModel).toBeNull();
    expect(result.hash.cardinality).toBe(5);
    expect(result.hash.bitsPerId).toBe(3);
  });

  it('reports hash as smaller when a wide range meets few distinct values', () => {
    const values = Array.from({ length: 1000 }, (_, i) => (i % 2 === 0 ? 1 : 1_000_000_000));
    const result = compareValueAndHashEncoding(intColumn(values));
    expect(result.value.bitsPerValue).toBe(30);
    expect(result.hash.bitsPerId).toBe(1);
    expect(result.smallerInModel).toBe('HASH');
  });

  it('is deterministic for the same input', () => {
    const a = compareValueAndHashEncoding(customerColumn('Revenue', 300));
    const b = compareValueAndHashEncoding(customerColumn('Revenue', 300));
    expect(a).toEqual(b);
  });
});

describe('outlier demonstration', () => {
  it('widens the range of a numeric column without mutating the input', () => {
    const column = customerColumn('LastPurchaseDate', 500);
    const before = column.values.slice();
    const plain = compareValueAndHashEncoding(column);
    const withOutlier = compareValueAndHashEncoding(column, { includeOutlier: true });

    expect(column.values).toEqual(before);
    expect(withOutlier.outlierApplied).toBe(true);
    expect(withOutlier.value.range).toBeGreaterThan(plain.value.range);
    expect(withOutlier.value.bitsPerValue).toBeGreaterThan(plain.value.bitsPerValue);
  });

  it('uses the 9999-12-31 sentinel for dates', () => {
    const outlier = applyOutlier(customerColumn('LastPurchaseDate', 10));
    expect(outlier.values[outlier.values.length - 1]).toBe('9999-12-31');
  });

  it('leaves text columns unchanged and reports it was not applied', () => {
    const column = customerColumn('Region', 100);
    expect(applyOutlier(column)).toBe(column);
    expect(compareValueAndHashEncoding(column, { includeOutlier: true }).outlierApplied).toBe(false);
  });

  it('flips the model result for LastPurchaseDate as the practical example on the page claims', () => {
    const plain1000 = compareValueAndHashEncoding(customerColumn('LastPurchaseDate', 1000));
    const outlier5000 = compareValueAndHashEncoding(customerColumn('LastPurchaseDate', 5000), { includeOutlier: true });
    expect(plain1000.smallerInModel).toBe('VALUE');
    expect(outlier5000.smallerInModel).toBe('HASH');
  });
});

describe('explanations and sources', () => {
  it('never claims to predict the engine choice for numeric columns', () => {
    const lines = explainEncodingResult(compareValueAndHashEncoding(customerColumn('CustomerID', 200)));
    const text = lines.join(' ');
    expect(text).toMatch(/does not predict which encoding the engine selects/);
    expect(text).not.toMatch(/will choose|engine chooses|VertiPaq chooses/i);
  });

  it('explains that text uses the dictionary path only', () => {
    const lines = explainEncodingResult(compareValueAndHashEncoding(customerColumn('Region', 200)));
    expect(lines.join(' ')).toMatch(/does not apply/);
  });

  it('cites verified Microsoft Learn pages and uses https links', () => {
    const sources = getEncodingSourceReferences();
    expect(sources.length).toBeGreaterThanOrEqual(3);
    expect(sources.every((source) => source.url.startsWith('https://'))).toBe(true);
    expect(sources.some((source) => source.url.includes('column.encodinghint'))).toBe(true);
    expect(sources.some((source) => source.url.includes('encodinghinttype'))).toBe(true);
  });
});
