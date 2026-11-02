// Data module - exports functions that wrap architecture components and query phases
import { ArchitectureComponent, QueryPhase } from '../types';
import { architectureComponents, queryPhases } from './data-core';

// Re-export Stage 5 data functions
export {
  generateSyntheticDeltaLog,
  getDeltaLakeSourceReferences,
  generateSyntheticParquetFile,
  getParquetSourceReferences,
  evaluatePredicatePushdown,
  getPredicatePushdownSourceReferences,
  generateSyntheticPartitionedTable,
  evaluatePartitionPruning,
  getPartitioningSourceReferences,
  generateSchemaEvolutionHistory,
  getSchemaEvolutionSourceReferences,
} from './stage5-delta-lake-parquet';

/**
 * Get all architecture components organized by layer
 */
export function getArchitectureComponents(): ArchitectureComponent[] {
  return architectureComponents;
}

/**
 * Get all query execution phases
 */
export function getQueryPhases(): QueryPhase[] {
  return queryPhases;
}
