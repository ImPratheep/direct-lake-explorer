// Stage 6 - shared synthetic Customer dataset
// [SIMULATION] Entirely synthetic and deterministic (seeded PRNG). No real data.
//
// Uses the same Customer schema as the Stage 5 Delta/Parquet modules
// (see generateSchemaEvolutionHistory in stage5-delta-lake-parquet.ts):
//   CustomerID int64, CustomerName utf8, Region utf8,
//   Revenue decimal(18,2), LastPurchaseDate date
// so the same columns can be followed from Delta Lake -> Parquet -> VertiPaq.

import { EncodingColumn, EncodingDataType } from '../types';

export interface SyntheticCustomerRow {
  customerId: number;
  customerName: string;
  region: string;
  revenue: number; // two decimal places
  lastPurchaseDate: string; // ISO yyyy-mm-dd
}

export interface CustomerColumnDefinition {
  name: string;
  sourceType: string;
  dataType: EncodingDataType;
  scale: number;
}

export const CUSTOMER_COLUMNS: readonly CustomerColumnDefinition[] = [
  { name: 'CustomerID', sourceType: 'int64', dataType: 'INTEGER', scale: 0 },
  { name: 'Revenue', sourceType: 'decimal(18,2)', dataType: 'DECIMAL', scale: 2 },
  { name: 'LastPurchaseDate', sourceType: 'date', dataType: 'DATE', scale: 0 },
  { name: 'Region', sourceType: 'utf8', dataType: 'TEXT', scale: 0 },
  { name: 'CustomerName', sourceType: 'utf8', dataType: 'TEXT', scale: 0 },
];

const REGIONS = ['East', 'West', 'North', 'South', 'Central'];
const FIRST_NAMES = [
  'Alex', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley',
  'Gray', 'Harper', 'Indigo', 'Jordan', 'Kai', 'Logan',
];
const LAST_NAMES = [
  'Adams', 'Brooks', 'Carter', 'Diaz', 'Evans', 'Foster',
  'Garcia', 'Hughes', 'Ibarra', 'Jensen', 'Khan', 'Lopez',
];

const DEFAULT_SEED = 42;
const FIRST_DATE_DAY = Date.UTC(2023, 0, 1) / 86_400_000;
const DATE_SPAN_DAYS = 730;

// mulberry32: small deterministic PRNG, so every run produces identical rows
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dayNumberToIsoDate(dayNumber: number): string {
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10);
}

export function isoDateToDayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map((part) => parseInt(part, 10));
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** [SIMULATION] Deterministic synthetic Customer rows. Same inputs always give the same rows. */
export function generateSyntheticCustomerRows(rowCount: number, seed: number = DEFAULT_SEED): SyntheticCustomerRow[] {
  const random = createRandom(seed);
  const rows: SyntheticCustomerRow[] = [];

  for (let i = 0; i < rowCount; i++) {
    const first = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(random() * LAST_NAMES.length)];
    const cents = 1000 + Math.floor(random() * 499_000); // 10.00 .. 4999.99
    rows.push({
      customerId: i + 1,
      customerName: `${first} ${last}`,
      region: REGIONS[Math.floor(random() * REGIONS.length)],
      revenue: cents / 100,
      lastPurchaseDate: dayNumberToIsoDate(FIRST_DATE_DAY + Math.floor(random() * DATE_SPAN_DAYS)),
    });
  }

  return rows;
}

/** Extracts one named column from the rows as an EncodingColumn. */
export function getCustomerEncodingColumn(rows: SyntheticCustomerRow[], columnName: string): EncodingColumn {
  const definition = CUSTOMER_COLUMNS.find((column) => column.name === columnName);
  if (!definition) {
    throw new Error(`Unknown synthetic Customer column: ${columnName}`);
  }

  const values = rows.map((row): number | string => {
    switch (definition.name) {
      case 'CustomerID':
        return row.customerId;
      case 'Revenue':
        return row.revenue;
      case 'LastPurchaseDate':
        return row.lastPurchaseDate;
      case 'Region':
        return row.region;
      default:
        return row.customerName;
    }
  });

  return { ...definition, values };
}
