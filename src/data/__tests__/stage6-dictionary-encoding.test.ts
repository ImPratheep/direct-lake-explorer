import { describe, expect, it } from 'vitest';
import { generateDictionaryEncoding } from '../stage6-vertipaq-simulator';
import { generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../stage6-synthetic-dataset';

describe('Module 1: generateDictionaryEncoding', () => {
  const data = [3, 1, 3, 2, 1];
  const result = generateDictionaryEncoding(data, 'Col');

  it('lists distinct values in first-seen order and counts cardinality', () => {
    expect(result.dictionary.distinctValues).toEqual([3, 1, 2]);
    expect(result.dictionary.cardinality).toBe(3);
    expect(result.dictionary.columnName).toBe('Col');
  });

  it('maps each value to a dictionary ID and encodes the column', () => {
    expect(result.encodedData).toEqual([0, 1, 0, 2, 1]);
    expect(result.dictionary.mappings.get(JSON.stringify(3))).toBe(0);
    expect(result.dictionary.mappings.get(JSON.stringify(2))).toBe(2);
  });

  it('is lossless: dictionary[id] reproduces the original data', () => {
    expect(result.encodedData.map((id) => result.dictionary.distinctValues[id])).toEqual(data);
    expect(result.originalData).toEqual(data);
  });

  it('applies the shared bit-packed size model', () => {
    expect(result.bitsPerId).toBe(2); // 3 distinct values
    expect(result.originalSize).toBe(40); // 5 numbers * 8 bytes
    expect(result.encodedSize).toBe(2); // 5 rows * 2 bits = 10 bits -> 2 bytes
    expect(result.dictionaryOverhead).toBe(24); // 3 distinct numbers * 8 bytes
    expect(result.dictionary.dictionarySize).toBe(24);
    expect(result.compressionRatio).toBeCloseTo(40 / 26, 10);
  });

  it('sizes text as a 4-byte length prefix plus UTF-8 bytes', () => {
    const text = generateDictionaryEncoding(['ab', 'ab'], 'T');
    expect(text.originalSize).toBe(2 * (2 + 4));
    expect(text.dictionaryOverhead).toBe(2 + 4);
  });

  it('sizes DATE values as 8-byte numbers even though they are ISO strings', () => {
    const dates = generateDictionaryEncoding(['2024-01-01', '2024-01-01'], 'D', 'DATE');
    expect(dates.originalSize).toBe(16);
    expect(dates.dictionaryOverhead).toBe(8);
  });

  it('encodes string values and keeps numbers and strings distinct', () => {
    const mixed = generateDictionaryEncoding(['a', 'b', 'a', 1, '1'], 'Mixed');
    expect(mixed.dictionary.cardinality).toBe(4);
    expect(mixed.encodedData).toEqual([0, 1, 0, 2, 3]);
  });

  it('cardinality grows with the number of distinct values', () => {
    const low = generateDictionaryEncoding(Array.from({ length: 200 }, (_, i) => i % 4), 'Low');
    const high = generateDictionaryEncoding(Array.from({ length: 200 }, (_, i) => i), 'High');
    expect(low.dictionary.cardinality).toBe(4);
    expect(high.dictionary.cardinality).toBe(200);
    expect(high.dictionaryOverhead).toBeGreaterThan(low.dictionaryOverhead);
  });

  it('reports a ratio below 1 when every row is distinct, because the dictionary is as big as the column', () => {
    const keys = generateDictionaryEncoding(Array.from({ length: 100 }, (_, i) => i + 1), 'Keys');
    expect(keys.compressionRatio).toBeLessThan(1);
  });

  it('compresses a low-cardinality column well', () => {
    const column = getCustomerEncodingColumn(generateSyntheticCustomerRows(1000), 'Region');
    const region = generateDictionaryEncoding(column.values, column.name, column.dataType);
    expect(region.dictionary.cardinality).toBe(5);
    expect(region.bitsPerId).toBe(3);
    expect(region.compressionRatio).toBeGreaterThan(5);
  });

  describe('edge cases', () => {
    it('handles an empty column without NaN', () => {
      const empty = generateDictionaryEncoding([], 'Empty');
      expect(empty.dictionary.cardinality).toBe(0);
      expect(empty.encodedData).toEqual([]);
      expect(empty.originalSize).toBe(0);
      expect(empty.encodedSize).toBe(0);
      expect(empty.dictionaryOverhead).toBe(0);
      expect(empty.compressionRatio).toBe(1);
      expect(Number.isNaN(empty.compressionRatio)).toBe(false);
    });

    it('models a one-value column as 1 bit per row, not 0 bytes', () => {
      const single = generateDictionaryEncoding([7, 7, 7], 'One');
      expect(single.dictionary.cardinality).toBe(1);
      expect(single.bitsPerId).toBe(1);
      expect(single.encodedSize).toBe(1); // 3 bits -> 1 byte
      expect(single.encodedData).toEqual([0, 0, 0]);
    });
  });

  describe('determinism and losslessness on the shared dataset', () => {
    const names = ['CustomerID', 'Revenue', 'LastPurchaseDate', 'Region', 'CustomerName'];

    it('gives identical results for identical input', () => {
      for (const name of names) {
        const column = () => getCustomerEncodingColumn(generateSyntheticCustomerRows(300), name);
        const a = generateDictionaryEncoding(column().values, name, column().dataType);
        const b = generateDictionaryEncoding(column().values, name, column().dataType);
        expect(a.encodedData).toEqual(b.encodedData);
        expect(a.compressionRatio).toBe(b.compressionRatio);
      }
    });

    it('round-trips every Customer column', () => {
      for (const name of names) {
        const column = getCustomerEncodingColumn(generateSyntheticCustomerRows(300), name);
        const encoded = generateDictionaryEncoding(column.values, name, column.dataType);
        expect(encoded.encodedData.map((id) => encoded.dictionary.distinctValues[id])).toEqual(column.values);
      }
    });
  });
});
