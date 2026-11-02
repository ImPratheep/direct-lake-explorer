import {
  DeltaTransactionLog,
  EvictionResult,
  LoadingSession,
  ParquetFileMetadata,
  PartitionedFile,
  QueryLoadResult,
  SchemaEvolutionState,
  StorageScanResult,
} from '../types';
import {
  generateSchemaEvolutionHistory,
  generateSyntheticDeltaLog,
  generateSyntheticParquetFile,
  generateSyntheticPartitionedTable,
} from '../data/stage5-delta-lake-parquet';
import { applyLoadingDemo, createLoadingSession, DEFAULT_LOADING_SETTINGS } from '../data/stage6-loading-simulator';
import { applyMemoryDemo } from '../data/stage6-memory-simulator';
import { runScanScenario, SCAN_SCENARIOS } from '../data/stage6-scan-simulator';
import { withFixedEntropy } from './deterministic';

export interface ReviewFixtures {
  deltaLog: DeltaTransactionLog;
  parquetFile: ParquetFileMetadata;
  partitionedFiles: PartitionedFile[];
  schemaState: SchemaEvolutionState;
}

/** Stage 5 synthetic data generated with a fixed clock and seed, so every review session shows the same values. */
export function createReviewFixtures(): ReviewFixtures {
  return {
    deltaLog: withFixedEntropy(generateSyntheticDeltaLog),
    parquetFile: withFixedEntropy(generateSyntheticParquetFile),
    partitionedFiles: withFixedEntropy(generateSyntheticPartitionedTable),
    schemaState: withFixedEntropy(generateSchemaEvolutionHistory),
  };
}

/*
 * Representative starting states for the modules that otherwise open empty (Modules 6 to 8 and the two Stage 5
 * simulators that need a first run). Each is built only by calling the simulator's own demonstration functions,
 * the same ones its buttons call, so no calculation is duplicated or changed here.
 */

export interface RepresentativeLoadingStart {
  session: LoadingSession;
  lastQuery: QueryLoadResult | null;
  queryColumns: string[];
}

/** CustomerID loaded, then a query for CustomerID and Revenue: one column already available, one loaded on demand. */
export function representativeLoadingStart(): RepresentativeLoadingStart {
  const loaded = applyLoadingDemo(createLoadingSession(DEFAULT_LOADING_SETTINGS), 'LOAD_CUSTOMERID');
  const queried = applyLoadingDemo(loaded.session, 'QUERY_ID_REVENUE');
  return { session: queried.session, lastQuery: queried.queryResult, queryColumns: ['CustomerID', 'Revenue'] };
}

export interface RepresentativeMemoryStart {
  session: LoadingSession;
  comparison: { label: string; before: LoadingSession; after: LoadingSession };
  lastEviction: EvictionResult | null;
}

/** Three columns resident, then Revenue evicted by a user action, with the before/after comparison filled in. */
export function representativeMemoryStart(): RepresentativeMemoryStart {
  const loaded = applyMemoryDemo(createLoadingSession(DEFAULT_LOADING_SETTINGS), 'LOAD_THREE').session;
  const evicted = applyMemoryDemo(loaded, 'EVICT_REVENUE');
  return {
    session: evicted.session,
    comparison: { label: 'Evict Revenue (user action)', before: loaded, after: evicted.session },
    lastEviction: evicted.eviction,
  };
}

export const REPRESENTATIVE_SCAN_SCENARIO_ID = 'REVENUE_BY_CUSTOMERID';

export interface RepresentativeScanStart {
  scenarioId: string;
  result: StorageScanResult;
  session: LoadingSession;
}

/** The "Revenue for CustomerID 100 to 200" scenario already run, so segment elimination has real numbers. */
export function representativeScanStart(): RepresentativeScanStart {
  if (!SCAN_SCENARIOS.some((entry) => entry.id === REPRESENTATIVE_SCAN_SCENARIO_ID)) {
    throw new RangeError(`Unknown scenario: ${REPRESENTATIVE_SCAN_SCENARIO_ID}`);
  }
  const result = runScanScenario(createLoadingSession(DEFAULT_LOADING_SETTINGS), REPRESENTATIVE_SCAN_SCENARIO_ID);
  return { scenarioId: REPRESENTATIVE_SCAN_SCENARIO_ID, result, session: result.session };
}
