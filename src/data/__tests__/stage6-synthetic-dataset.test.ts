import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_COLUMNS,
  dayNumberToIsoDate,
  generateSyntheticCustomerRows,
  getCustomerEncodingColumn,
  isoDateToDayNumber,
} from '../stage6-synthetic-dataset';

describe('stage 6 synthetic Customer dataset', () => {
  it('is deterministic: the same inputs give identical rows', () => {
    expect(generateSyntheticCustomerRows(200)).toEqual(generateSyntheticCustomerRows(200));
  });

  it('gives different rows for a different seed', () => {
    expect(generateSyntheticCustomerRows(50, 1)).not.toEqual(generateSyntheticCustomerRows(50, 2));
  });

  it('produces the requested number of rows with sequential CustomerIDs', () => {
    const rows = generateSyntheticCustomerRows(120);
    expect(rows).toHaveLength(120);
    expect(rows.map((row) => row.customerId)).toEqual(Array.from({ length: 120 }, (_, i) => i + 1));
  });

  it('keeps values inside the documented synthetic ranges', () => {
    const rows = generateSyntheticCustomerRows(500);
    const regions = new Set(['East', 'West', 'North', 'South', 'Central']);
    for (const row of rows) {
      expect(regions.has(row.region)).toBe(true);
      expect(row.revenue).toBeGreaterThanOrEqual(10);
      expect(row.revenue).toBeLessThan(5000);
      expect(Math.round(row.revenue * 100) / 100).toBe(row.revenue);
      expect(row.lastPurchaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.lastPurchaseDate >= '2023-01-01' && row.lastPurchaseDate <= '2024-12-31').toBe(true);
    }
  });

  it('converts dates to day numbers and back without loss', () => {
    expect(isoDateToDayNumber('1970-01-01')).toBe(0);
    expect(isoDateToDayNumber('1970-01-11')).toBe(10);
    expect(dayNumberToIsoDate(isoDateToDayNumber('2024-02-29'))).toBe('2024-02-29');
  });

  it('exposes the same Customer columns and types as the Stage 5 schema', () => {
    const byName = Object.fromEntries(CUSTOMER_COLUMNS.map((column) => [column.name, column.sourceType]));
    expect(byName).toMatchObject({
      CustomerID: 'int64',
      CustomerName: 'utf8',
      Region: 'utf8',
      Revenue: 'decimal(18,2)',
      LastPurchaseDate: 'date',
    });
  });

  it('extracts a named column with the right data type and one value per row', () => {
    const rows = generateSyntheticCustomerRows(30);
    const column = getCustomerEncodingColumn(rows, 'Revenue');
    expect(column.dataType).toBe('DECIMAL');
    expect(column.scale).toBe(2);
    expect(column.values).toEqual(rows.map((row) => row.revenue));
  });

  it('throws for an unknown column name', () => {
    expect(() => getCustomerEncodingColumn(generateSyntheticCustomerRows(5), 'Nope')).toThrow(/Unknown/);
  });
});
