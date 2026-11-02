// Stage 6, Module 7: Memory Residency and Eviction Simulator.
// [SIMULATION] Educational model only. It builds on the Module 6 loading session, so column sizes (Module 5 estimates)
// and residency have a single definition. It has no timers and no randomness.
//
// [DOCUMENTED] Microsoft Learn ("How Direct Lake works"): a loaded column is resident and stays resident until there is
// reason to evict it. Documented reasons include a refresh (framing) when the underlying data changed, no query using the
// column for some time, and other memory management reasons such as memory pressure in the capacity. The Fabric SKU
// determines the maximum memory available to a Direct Lake semantic model.
//
// [PROPRIETARY INTERNAL] Not published, so not modelled as fact: the real memory limits, eviction thresholds, eviction
// algorithm, priority and timing. This module never decides on its own that a column is evicted. The user triggers every
// eviction, either directly or through a clearly labelled scenario, and the illustrative budget and ordering used by the
// memory-pressure scenario are simulation settings, not Fabric settings.

import {
  ColumnResidencyHistory,
  EvictionResult,
  EvictionSkip,
  LoadingColumnState,
  LoadingSession,
  MemoryBudgetStatus,
  MemoryComparisonRow,
  MemoryEvictionReason,
  MemoryPressureOrder,
  MemoryPressureResult,
  MemorySnapshot,
  QueryLoadResult,
  SourceReference,
} from '../types';
import { executeQuery, finishLoading, normaliseNames, requestLoad, summarizeMemory, withEvent } from './stage6-loading-simulator';

// [SIMULATION] A starting value for the illustrative budget. It is not a Fabric limit.
export const DEFAULT_ILLUSTRATIVE_BUDGET_BYTES = 3000;

export const MEMORY_EVICTION_REASON_LABELS: Record<MemoryEvictionReason, string> = {
  USER_ACTION: 'user action',
  REFRESH_SCENARIO: 'refresh scenario',
  UNUSED_SCENARIO: 'unused-column scenario',
  PRESSURE_SCENARIO: 'memory-pressure scenario',
};

export const MEMORY_PRESSURE_ORDER_LABELS: Record<MemoryPressureOrder, string> = {
  LARGEST_FIRST: 'largest column first',
  EARLIEST_LOADED_FIRST: 'earliest loaded first',
};

const fmt = (n: number): string => n.toLocaleString('en-US');

function assertBudget(budgetBytes: number): void {
  if (!Number.isInteger(budgetBytes) || budgetBytes < 0) {
    throw new RangeError('budgetBytes must be a whole number of at least 0');
  }
}

/** Residency and memory right now. Each column is counted once, in exactly one of the three groups. */
export function snapshotMemory(session: LoadingSession): MemorySnapshot {
  const summary = summarizeMemory(session);
  const named = (state: LoadingColumnState['state']): string[] =>
    session.columns.filter((column) => column.state === state).map((column) => column.profile.columnName);
  return {
    residentColumns: named('LOADED'),
    loadingColumns: named('LOADING'),
    nonResidentColumns: named('UNLOADED'),
    residentBytes: summary.residentBytes,
    inProgressBytes: summary.inProgressBytes,
    totalBytes: summary.totalSimulatedBytes,
  };
}

/** How the current memory compares with an illustrative budget. Throws RangeError for an invalid budget. */
export function budgetStatus(session: LoadingSession, budgetBytes: number): MemoryBudgetStatus {
  assertBudget(budgetBytes);
  const usedBytes = snapshotMemory(session).totalBytes;
  return {
    budgetBytes,
    usedBytes,
    headroomBytes: budgetBytes - usedBytes,
    overBudgetBytes: Math.max(0, usedBytes - budgetBytes),
    withinBudget: usedBytes <= budgetBytes,
    usedPercentOfBudget: budgetBytes > 0 ? (usedBytes / budgetBytes) * 100 : null,
  };
}

/** Evicts the listed columns without validating that the list is non-empty. */
function evictInternal(session: LoadingSession, names: string[], reason: MemoryEvictionReason): EvictionResult {
  const before = snapshotMemory(session);
  const label = MEMORY_EVICTION_REASON_LABELS[reason];
  let columns = session.columns;
  let events = session.events;
  const evictedColumns: string[] = [];
  const skipped: EvictionSkip[] = [];
  let freedBytes = 0;

  for (const name of names) {
    const index = columns.findIndex((column) => column.profile.columnName === name);
    const current = columns[index];
    if (current.state === 'LOADED') {
      freedBytes += current.profile.memoryBytes;
      evictedColumns.push(name);
      columns = columns.map((column, i) =>
        i === index ? { profile: current.profile, state: 'UNLOADED', progressTicks: 0, residentBytes: 0 } : column,
      );
      events = withEvent(
        events,
        session.tick,
        'EVICTED',
        `${name} was evicted (${label}). ${fmt(current.profile.memoryBytes)} B of simulated memory is released. Its data remains in storage, so a later query that needs it loads the whole column again.`,
        name,
      );
    } else if (current.state === 'LOADING') {
      skipped.push({ columnName: name, cause: 'STILL_LOADING' });
      events = withEvent(events, session.tick, 'EVICTION_SKIPPED', `${name} is still loading. This simulator does not cancel a load, so it was not evicted.`, name);
    } else {
      skipped.push({ columnName: name, cause: 'NOT_RESIDENT' });
      events = withEvent(events, session.tick, 'EVICTION_SKIPPED', `${name} is not resident, so there is nothing to evict.`, name);
    }
  }

  const next: LoadingSession = { ...session, columns, events };
  return { session: next, reason, requestedColumns: names, evictedColumns, skipped, freedBytes, before, after: snapshotMemory(next) };
}

/**
 * [SIMULATION] Evicts the named columns because the user asked. Only resident columns are evicted; a column that is not
 * resident or is still loading is skipped and reported. Throws RangeError for an empty selection or an unknown column.
 * `reason` is a label for the event log and never changes the outcome.
 */
export function evictColumns(session: LoadingSession, names: string[], reason: MemoryEvictionReason = 'USER_ACTION'): EvictionResult {
  const unique = normaliseNames(session, names, 'Select at least one column to evict');
  return evictInternal(session, unique, reason);
}

/**
 * [SIMULATION] Refresh scenario: evicts every resident column. [DOCUMENTED] Framing may evict resident column segments and
 * dictionaries when the underlying data changed, and incremental framing drops only the affected segments, so a real
 * refresh can leave unaffected data resident. This scenario assumes the one Customer table changed and every resident
 * column is affected, which is a deliberate simplification.
 */
export function evictAllResident(session: LoadingSession, reason: MemoryEvictionReason = 'REFRESH_SCENARIO'): EvictionResult {
  const resident = session.columns.filter((column) => column.state === 'LOADED').map((column) => column.profile.columnName);
  if (resident.length === 0) {
    const events = withEvent(session.events, session.tick, 'EVICTION_SKIPPED', 'No column is resident, so there is nothing to evict.');
    const next = { ...session, events };
    const snapshot = snapshotMemory(next);
    return { session: next, reason, requestedColumns: [], evictedColumns: [], skipped: [], freedBytes: 0, before: snapshot, after: snapshot };
  }
  return evictInternal(session, resident, reason);
}

function loadedSequence(session: LoadingSession, name: string): number {
  let sequence = 0;
  for (const event of session.events) {
    if (event.type === 'LOAD_COMPLETED' && event.columnName === name) sequence = event.sequence;
  }
  return sequence;
}

/**
 * [SIMULATION] Memory-pressure scenario against an illustrative budget chosen by the user. [SIMPLIFIED MODEL] The policy is
 * stated here in full: if simulated memory is above the budget, evict resident, unprotected columns one at a time in the
 * chosen order until memory is within the budget or no candidate is left. Columns that are protected, still loading or
 * empty (0 B) are never chosen. The budget and the order are not Fabric settings and the order is not Microsoft's policy.
 * Throws RangeError for a budget that is not a whole number of at least 0, or for an unknown protected column.
 */
export function applyMemoryPressure(
  session: LoadingSession,
  budgetBytes: number,
  order: MemoryPressureOrder = 'LARGEST_FIRST',
  protectedColumns: string[] = [],
): MemoryPressureResult {
  assertBudget(budgetBytes);
  const protectedNames = protectedColumns.length > 0 ? normaliseNames(session, protectedColumns, '') : [];
  const startBytes = snapshotMemory(session).totalBytes;
  const orderLabel = MEMORY_PRESSURE_ORDER_LABELS[order];

  const candidates = session.columns
    .filter((column) => column.state === 'LOADED' && !protectedNames.includes(column.profile.columnName) && column.profile.memoryBytes > 0)
    .map((column) => column.profile)
    .sort((a, b) =>
      order === 'LARGEST_FIRST'
        ? b.memoryBytes - a.memoryBytes || a.columnName.localeCompare(b.columnName)
        : loadedSequence(session, a.columnName) - loadedSequence(session, b.columnName) || a.columnName.localeCompare(b.columnName),
    );

  const chosen: string[] = [];
  let running = startBytes;
  for (const profile of candidates) {
    if (running <= budgetBytes) break;
    chosen.push(profile.columnName);
    running -= profile.memoryBytes;
  }

  const intro =
    startBytes <= budgetBytes
      ? `Memory-pressure scenario: simulated memory (${fmt(startBytes)} B) is within the illustrative budget of ${fmt(budgetBytes)} B, so nothing is evicted.`
      : `Memory-pressure scenario: simulated memory (${fmt(startBytes)} B) is above the illustrative budget of ${fmt(budgetBytes)} B. Evicting resident, unprotected columns in the order "${orderLabel}" until it fits. This budget and order are simulation settings, not Fabric behaviour.`;
  const primed: LoadingSession = { ...session, events: withEvent(session.events, session.tick, 'MEMORY_PRESSURE', intro) };

  const result = evictInternal(primed, chosen, 'PRESSURE_SCENARIO');
  const overBudgetBytes = Math.max(0, result.after.totalBytes - budgetBytes);
  let finalSession = result.session;
  if (overBudgetBytes > 0) {
    finalSession = {
      ...finalSession,
      events: withEvent(
        finalSession.events,
        finalSession.tick,
        'MEMORY_PRESSURE',
        `Still ${fmt(overBudgetBytes)} B over the illustrative budget: no further resident, unprotected column can be evicted.`,
      ),
    };
  }

  return {
    ...result,
    session: finalSession,
    requestedColumns: chosen,
    budgetBytes,
    order,
    protectedColumns: protectedNames,
    withinBudget: overBudgetBytes === 0,
    overBudgetBytes,
  };
}

/** Column-by-column comparison of two sessions of the same table, for before/after displays. */
export function compareMemory(before: LoadingSession, after: LoadingSession): MemoryComparisonRow[] {
  if (before.columns.length !== after.columns.length) {
    throw new RangeError('Sessions must describe the same columns');
  }
  return after.columns.map((afterColumn, index) => {
    const beforeColumn = before.columns[index];
    if (beforeColumn.profile.columnName !== afterColumn.profile.columnName) {
      throw new RangeError('Sessions must describe the same columns');
    }
    const wasInMemory = beforeColumn.state !== 'UNLOADED';
    const isInMemory = afterColumn.state !== 'UNLOADED';
    return {
      columnName: afterColumn.profile.columnName,
      stateBefore: beforeColumn.state,
      stateAfter: afterColumn.state,
      bytesBefore: beforeColumn.residentBytes,
      bytesAfter: afterColumn.residentBytes,
      change: wasInMemory && !isInMemory ? 'EVICTED' : !wasInMemory && isInMemory ? 'LOADED' : 'UNCHANGED',
    };
  });
}

/** How often each column was evicted and then loaded again, read from the session's event history. */
export function columnHistory(session: LoadingSession): ColumnResidencyHistory[] {
  return session.columns.map((column) => {
    const name = column.profile.columnName;
    let timesEvicted = 0;
    let reloadsAfterEviction = 0;
    let waitingForReload = false;
    for (const event of session.events) {
      if (event.columnName !== name) continue;
      if (event.type === 'EVICTED') {
        timesEvicted++;
        waitingForReload = true;
      } else if (event.type === 'LOAD_REQUESTED' && waitingForReload) {
        reloadsAfterEviction++;
        waitingForReload = false;
      }
    }
    return { columnName: name, timesEvicted, reloadsAfterEviction };
  });
}

/** Plain-language reading of an eviction result. */
export function explainEviction(result: EvictionResult): string[] {
  const lines: string[] = [];
  const label = MEMORY_EVICTION_REASON_LABELS[result.reason];
  if (result.evictedColumns.length > 0) {
    lines.push(
      `Evicted (${label}): ${result.evictedColumns.join(', ')}. Simulated memory fell from ${fmt(result.before.totalBytes)} B to ${fmt(result.after.totalBytes)} B, releasing ${fmt(result.freedBytes)} B.`,
    );
    lines.push('Eviction releases memory only. The data stays in storage, so a later query that needs an evicted column loads the whole column again.');
  } else {
    lines.push('Nothing was evicted, so memory is unchanged.');
  }
  for (const skip of result.skipped) {
    lines.push(skip.cause === 'STILL_LOADING' ? `${skip.columnName} was skipped: it is still loading.` : `${skip.columnName} was skipped: it is not resident.`);
  }
  return lines;
}

export interface MemoryDemo {
  id: string;
  label: string;
  kind: 'LOAD' | 'EVICT' | 'QUERY' | 'PRESSURE' | 'REFRESH';
  columns: string[];
}

export const MEMORY_DEMOS: ReadonlyArray<MemoryDemo> = [
  { id: 'LOAD_THREE', label: 'Load CustomerID, Revenue and Region', kind: 'LOAD', columns: ['CustomerID', 'Revenue', 'Region'] },
  { id: 'EVICT_REVENUE', label: 'Evict Revenue (user action)', kind: 'EVICT', columns: ['Revenue'] },
  { id: 'REQUERY_REVENUE', label: 'Query CustomerID and Revenue (Revenue was evicted)', kind: 'QUERY', columns: ['CustomerID', 'Revenue'] },
  { id: 'PRESSURE_PROTECT_ID', label: 'Memory-pressure scenario, protecting CustomerID', kind: 'PRESSURE', columns: ['CustomerID'] },
  { id: 'REFRESH_ALL', label: 'Refresh scenario: evict every resident column', kind: 'REFRESH', columns: [] },
];

export interface MemoryDemoOutcome {
  session: LoadingSession;
  eviction: EvictionResult | null;
  queryResult: QueryLoadResult | null;
}

/** Runs one scenario step on the session. Throws RangeError for an unknown demonstration or an invalid budget. */
export function applyMemoryDemo(
  session: LoadingSession,
  demoId: string,
  options: { budgetBytes?: number; order?: MemoryPressureOrder } = {},
): MemoryDemoOutcome {
  const demo = MEMORY_DEMOS.find((entry) => entry.id === demoId);
  if (!demo) throw new RangeError(`Unknown demonstration: ${demoId}`);

  switch (demo.kind) {
    case 'LOAD':
      return { session: finishLoading(requestLoad(session, demo.columns)), eviction: null, queryResult: null };
    case 'EVICT': {
      const eviction = evictColumns(session, demo.columns, 'USER_ACTION');
      return { session: eviction.session, eviction, queryResult: null };
    }
    case 'QUERY': {
      const queryResult = executeQuery(session, demo.columns);
      return { session: queryResult.session, eviction: null, queryResult };
    }
    case 'PRESSURE': {
      const eviction = applyMemoryPressure(session, options.budgetBytes ?? DEFAULT_ILLUSTRATIVE_BUDGET_BYTES, options.order ?? 'LARGEST_FIRST', demo.columns);
      return { session: eviction.session, eviction, queryResult: null };
    }
    default: {
      const eviction = evictAllResident(session, 'REFRESH_SCENARIO');
      return { session: eviction.session, eviction, queryResult: null };
    }
  }
}

export function getMemorySourceReferences(): SourceReference[] {
  return [
    {
      title: 'How Direct Lake works - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-how-it-works',
      section: 'Resident columns, the documented reasons a column may be evicted, framing, and that the SKU sets the maximum memory',
    },
    {
      title: 'Direct Lake overview - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-overview',
      section: 'Only the data needed to answer a query is loaded; capacity requirements and guardrails',
    },
  ];
}
