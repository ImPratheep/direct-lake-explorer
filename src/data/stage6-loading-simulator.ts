// Stage 6, Module 6 - Direct Lake Column Loading simulation logic
//
// [SIMULATION] Educational model. It is NOT Microsoft's Direct Lake implementation. It never runs a query: it only
// shows which columns a query needs, which are already available in memory, and which would have to be loaded.
//
// What Microsoft documents (Microsoft Learn, "How Direct Lake works" and "Direct Lake overview"):
//   [DOCUMENTED] Direct Lake loads data from OneLake only when a query requests a column for the first time. This
//                on-demand loading is called transcoding.
//   [DOCUMENTED] The semantic model first works out which columns a query needs (columns used directly, plus columns
//                required by relationships and measures), checks which are already in memory, and loads all the data for
//                the columns that are not.
//   [DOCUMENTED] Loaded columns are resident. Later queries that involve only resident columns load nothing more.
//   [DOCUMENTED] Loading is typically fast but can depend on factors such as the cardinality of the column data.
//   [DOCUMENTED] Only the data needed to answer a query is loaded; the whole semantic model is not loaded up front. A
//                Direct Lake refresh (framing) copies only metadata, unlike an Import refresh.
//   [DOCUMENTED] A Delta table's storage is Parquet files in OneLake, and Parquet organizes data by column.
//   [DOCUMENTED] Resident columns can later be evicted (after framing, when unused for some time, or under memory
//                pressure). Eviction is Module 7 and is not simulated here.
//
// What this file models:
//   [SIMPLIFIED MODEL] Each Customer column's in-memory size is the Module 5 estimate. Memory is counted once per column
//                and only for columns that are loading or loaded.
//   [SIMPLIFIED MODEL] Loading advances in abstract steps ("ticks") driven by the user. The number of ticks is
//                proportional to the column's estimated size. Microsoft documents no timings or step counts.
//   [SIMPLIFIED MODEL] Columns that are loading advance together. The order and concurrency of real loading is not
//                documented.
//   [PROPRIETARY INTERNAL] The real loading sequence, memory management and the in-memory layout are not published and
//                are not reproduced.

import {
  CompressionEncodingModel,
  LoadingColumnProfile,
  LoadingColumnState,
  LoadingEvent,
  LoadingEventType,
  LoadingFlowStageId,
  LoadingMemorySummary,
  LoadingSession,
  LoadingSettings,
  LoadingState,
  QueryLoadPlan,
  QueryLoadPlanEntry,
  QueryLoadResult,
  SourceReference,
} from '../types';
import { estimateColumnCompression } from './stage6-compression-simulator';
import { applyNullPattern, DEFAULT_SEGMENT_ROW_COUNT } from './stage6-segment-simulator';
import { CUSTOMER_COLUMNS, generateSyntheticCustomerRows, getCustomerEncodingColumn } from './stage6-synthetic-dataset';

// [SIMPLIFIED MODEL] Educational placeholder: modelled bytes loaded per simulated step.
export const LOAD_BYTES_PER_TICK = 512;

export const DEFAULT_LOADING_SETTINGS: LoadingSettings = {
  rowCount: 1000,
  segmentRowCount: DEFAULT_SEGMENT_ROW_COUNT,
  nullPercent: 0,
  numericEncoding: 'VALUE',
};

export interface LoadingFlowStage {
  id: LoadingFlowStageId;
  label: string;
  summary: string;
  details: string[];
}

export const LOADING_FLOW_STAGES: ReadonlyArray<LoadingFlowStage> = [
  {
    id: 'ONELAKE',
    label: 'OneLake',
    summary: 'The single store for analytics data',
    details: [
      '[DOCUMENTED] OneLake is the single store for all analytics data. Direct Lake loads data into memory from Delta tables available in OneLake.',
    ],
  },
  {
    id: 'DELTA_LAKE',
    label: 'Delta Lake',
    summary: 'The tables the model points at',
    details: [
      '[DOCUMENTED] The source tables are Delta tables. A Direct Lake refresh (framing) reads only Delta table metadata to update which Parquet files the model references. It does not copy data.',
      'Framing is not simulated in this module.',
    ],
  },
  {
    id: 'PARQUET',
    label: 'Parquet',
    summary: 'Column-organised files in OneLake',
    details: [
      '[DOCUMENTED] The underlying storage for a Delta table is one or more Parquet files in OneLake. Parquet files organize data by column rather than by row, and semantic models load entire columns from Delta tables into memory as queries require them.',
      'An unloaded column rests here: its data exists in storage but is not in memory.',
    ],
  },
  {
    id: 'COLUMN_ACCESS',
    label: 'Column access',
    summary: 'Work out which columns a query needs',
    details: [
      '[DOCUMENTED] When a query arrives, the semantic model works out which columns it needs: any column the query uses directly, plus columns required by relationships and measures. It then checks which are already in memory and loads all the data for those that are not. This on-demand loading is called transcoding.',
      '[SIMPLIFIED MODEL] The Customer table here has no relationships or measures, so a query needs exactly the columns you choose.',
    ],
  },
  {
    id: 'VERTIPAQ',
    label: 'VertiPaq representation',
    summary: 'The column as the engine holds it',
    details: [
      '[DOCUMENTED] Direct Lake queries are processed by the VertiPaq engine, as Import queries are.',
      '[SIMPLIFIED MODEL] The size shown for a column here is the Module 5 estimate of its in-memory representation.',
      '[PROPRIETARY INTERNAL] The exact transformation applied while loading and the in-memory layout are not published.',
    ],
  },
  {
    id: 'AVAILABLE',
    label: 'Semantic model availability',
    summary: 'Resident and ready for queries',
    details: [
      '[DOCUMENTED] Columns loaded into memory are resident. Future queries that involve only resident columns do not need to load any more columns.',
      '[DOCUMENTED] A resident column stays until there is a reason to evict it: a refresh after a source update, no query using it for some time, or memory pressure. Eviction is Module 7 and is not simulated here.',
      'A resident column is available. That does not mean the whole semantic model is in memory.',
    ],
  },
];

export const LOADING_FLOW_DISCLAIMER =
  '[SIMPLIFIED MODEL] This is a simplified conceptual flow, not the complete internal Fabric implementation. Where a column appears on it while it loads is a visual aid: Microsoft does not document internal sub-steps.';

/** Where a column is drawn on the conceptual flow. A visual aid only. */
export function flowStageFor(state: LoadingState, progressFraction: number): LoadingFlowStageId {
  if (state === 'UNLOADED') return 'PARQUET';
  if (state === 'LOADED') return 'AVAILABLE';
  return progressFraction < 0.5 ? 'COLUMN_ACCESS' : 'VERTIPAQ';
}

function assertWholeNumber(value: number, label: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be a whole number of at least ${minimum}`);
  }
}

/** The Customer columns, sized with Module 5. Throws RangeError for invalid settings. */
export function buildColumnProfiles(settings: LoadingSettings): LoadingColumnProfile[] {
  assertWholeNumber(settings.rowCount, 'rowCount', 0);
  const rows = generateSyntheticCustomerRows(settings.rowCount);

  return CUSTOMER_COLUMNS.map((definition) => {
    const column = applyNullPattern(getCustomerEncodingColumn(rows, definition.name), settings.nullPercent);
    const encoding: CompressionEncodingModel = definition.dataType === 'TEXT' ? 'DICTIONARY' : settings.numericEncoding;
    const estimate = estimateColumnCompression(column, settings.segmentRowCount, { encoding });
    return {
      columnName: definition.name,
      dataType: definition.dataType,
      sourceType: definition.sourceType,
      rowCount: estimate.rowCount,
      nullCount: estimate.nullCount,
      cardinality: estimate.cardinality,
      encodingModel: encoding,
      uncompressedBytes: estimate.originalBytes,
      memoryBytes: estimate.totalCompressedBytes,
      loadTicks: estimate.totalCompressedBytes > 0 ? Math.max(1, Math.ceil(estimate.totalCompressedBytes / LOAD_BYTES_PER_TICK)) : 0,
    };
  });
}

export function createLoadingSession(settings: LoadingSettings = DEFAULT_LOADING_SETTINGS): LoadingSession {
  return {
    settings,
    columns: buildColumnProfiles(settings).map((profile) => ({ profile, state: 'UNLOADED', progressTicks: 0, residentBytes: 0 })),
    tick: 0,
    events: [],
  };
}

export function withEvent(events: LoadingEvent[], tick: number, type: LoadingEventType, message: string, columnName?: string): LoadingEvent[] {
  return [...events, { sequence: events.length + 1, tick, type, columnName, message }];
}

const fmt = (n: number): string => n.toLocaleString('en-US');

export function normaliseNames(session: LoadingSession, names: string[], emptyMessage: string): string[] {
  if (!Array.isArray(names) || names.length === 0) {
    throw new RangeError(emptyMessage);
  }
  const unique = Array.from(new Set(names));
  const known = new Set(session.columns.map((column) => column.profile.columnName));
  const unknown = unique.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    throw new RangeError(`Unknown column(s): ${unknown.join(', ')}`);
  }
  return unique;
}

/**
 * Starts loading the named columns. A column that is already resident or already loading is left alone, so repeated
 * requests never add memory twice. Throws RangeError for an empty selection or an unknown column.
 */
export function requestLoad(session: LoadingSession, names: string[]): LoadingSession {
  const unique = normaliseNames(session, names, 'Select at least one column to load');
  let columns = session.columns;
  let events = session.events;

  for (const name of unique) {
    const index = columns.findIndex((column) => column.profile.columnName === name);
    const current = columns[index];
    const { profile } = current;

    if (current.state === 'LOADED') {
      events = withEvent(events, session.tick, 'ALREADY_RESIDENT', `${name} is already resident, so nothing is loaded and no memory is added.`, name);
      continue;
    }
    if (current.state === 'LOADING') {
      events = withEvent(events, session.tick, 'ALREADY_LOADING', `${name} is already loading, so the request changes nothing.`, name);
      continue;
    }

    const next: LoadingColumnState =
      profile.loadTicks === 0
        ? { profile, state: 'LOADED', progressTicks: 0, residentBytes: 0 }
        : { profile, state: 'LOADING', progressTicks: 0, residentBytes: 0 };
    columns = columns.map((column, i) => (i === index ? next : column));
    events = withEvent(
      events,
      session.tick,
      'LOAD_REQUESTED',
      profile.loadTicks === 0
        ? `Load requested for ${name}: the column is empty, so there is nothing to load.`
        : `Load requested for ${name}: the entire column is loaded (about ${fmt(profile.memoryBytes)} B in memory, ${profile.loadTicks} step(s)).`,
      name,
    );
    if (profile.loadTicks === 0) {
      events = withEvent(events, session.tick, 'LOAD_COMPLETED', `${name} is resident (0 B).`, name);
    }
  }

  return { ...session, columns, events };
}

/** Moves every loading column forward by `ticks` simulated steps. Does nothing when nothing is loading. */
export function advanceSession(session: LoadingSession, ticks = 1): LoadingSession {
  assertWholeNumber(ticks, 'ticks', 1);
  let current = session;

  for (let step = 0; step < ticks; step++) {
    if (!current.columns.some((column) => column.state === 'LOADING')) break;
    const tick = current.tick + 1;
    let events = current.events;

    const columns = current.columns.map((column): LoadingColumnState => {
      if (column.state !== 'LOADING') return column;
      const progressTicks = column.progressTicks + 1;
      const { profile } = column;
      if (progressTicks >= profile.loadTicks) {
        events = withEvent(events, tick, 'LOAD_COMPLETED', `${profile.columnName} is now resident (${fmt(profile.memoryBytes)} B).`, profile.columnName);
        return { profile, state: 'LOADED', progressTicks: profile.loadTicks, residentBytes: profile.memoryBytes };
      }
      return { profile, state: 'LOADING', progressTicks, residentBytes: Math.floor((profile.memoryBytes * progressTicks) / profile.loadTicks) };
    });
    current = { ...current, columns, tick, events };
  }
  return current;
}

/** Advances until nothing is loading. */
export function finishLoading(session: LoadingSession): LoadingSession {
  let current = session;
  const limit = session.columns.reduce((sum, column) => sum + column.profile.loadTicks, 0) + 1;
  for (let i = 0; i < limit && current.columns.some((column) => column.state === 'LOADING'); i++) {
    current = advanceSession(current, 1);
  }
  return current;
}

/** Memory is counted once per column: full size when loaded, a partial amount while loading, nothing when unloaded. */
export function summarizeMemory(session: LoadingSession): LoadingMemorySummary {
  let residentBytes = 0;
  let inProgressBytes = 0;
  let fullColumnSetBytes = 0;
  let residentColumns = 0;
  let loadingColumns = 0;

  for (const column of session.columns) {
    fullColumnSetBytes += column.profile.memoryBytes;
    if (column.state === 'LOADED') {
      residentBytes += column.profile.memoryBytes;
      residentColumns++;
    } else if (column.state === 'LOADING') {
      inProgressBytes += column.residentBytes;
      loadingColumns++;
    }
  }
  const totalSimulatedBytes = residentBytes + inProgressBytes;
  return {
    totalColumns: session.columns.length,
    residentColumns,
    loadingColumns,
    unloadedColumns: session.columns.length - residentColumns - loadingColumns,
    residentBytes,
    inProgressBytes,
    totalSimulatedBytes,
    fullColumnSetBytes,
    shareOfFullSetPercent: fullColumnSetBytes > 0 ? (totalSimulatedBytes / fullColumnSetBytes) * 100 : 0,
  };
}

/** What a query's column requests would cause. It does not run the query or change the session. */
export function planQuery(session: LoadingSession, names: string[]): QueryLoadPlan {
  const unique = normaliseNames(session, names, 'Select at least one column for the query');
  const entries: QueryLoadPlanEntry[] = unique.map((name) => {
    const column = session.columns.find((entry) => entry.profile.columnName === name) as LoadingColumnState;
    const status = column.state === 'LOADED' ? 'ALREADY_RESIDENT' : column.state === 'LOADING' ? 'LOADING_IN_PROGRESS' : 'NEEDS_LOADING';
    return { columnName: name, status, memoryBytes: column.profile.memoryBytes, loadTicks: column.profile.loadTicks };
  });
  return {
    requestedColumns: unique,
    entries,
    alreadyResident: entries.filter((e) => e.status === 'ALREADY_RESIDENT').map((e) => e.columnName),
    loadingInProgress: entries.filter((e) => e.status === 'LOADING_IN_PROGRESS').map((e) => e.columnName),
    needsLoading: entries.filter((e) => e.status === 'NEEDS_LOADING').map((e) => e.columnName),
    additionalBytesToLoad: entries.filter((e) => e.status === 'NEEDS_LOADING').reduce((sum, e) => sum + e.memoryBytes, 0),
  };
}

/**
 * Makes a query's columns available: resident columns are reused, columns already loading are awaited, and the rest are
 * loaded. This is column loading only. Scanning, filtering and aggregating are not simulated here (see Module 8).
 */
export function executeQuery(session: LoadingSession, names: string[]): QueryLoadResult {
  const plan = planQuery(session, names);
  const memoryBeforeBytes = summarizeMemory(session).totalSimulatedBytes;
  const startTick = session.tick;

  let current: LoadingSession = {
    ...session,
    events: withEvent(session.events, session.tick, 'QUERY_REQUESTED', `Query needs: ${plan.requestedColumns.join(', ')}.`),
  };
  if (plan.needsLoading.length > 0) {
    current = requestLoad(current, plan.needsLoading);
  }
  for (const name of plan.alreadyResident) {
    current = { ...current, events: withEvent(current.events, current.tick, 'ALREADY_RESIDENT', `${name} is already resident, so the query reuses it without loading.`, name) };
  }

  const limit = current.columns.reduce((sum, column) => sum + column.profile.loadTicks, 0) + 1;
  for (let i = 0; i < limit && plan.requestedColumns.some((name) => current.columns.find((c) => c.profile.columnName === name)?.state !== 'LOADED'); i++) {
    current = advanceSession(current, 1);
  }
  current = {
    ...current,
    events: withEvent(current.events, current.tick, 'QUERY_READY', 'Every column the query needs is resident. Running the query itself is not simulated by column loading.'),
  };

  return {
    plan,
    session: current,
    columnsLoadedByQuery: plan.needsLoading,
    columnsAwaited: plan.loadingInProgress,
    columnsReused: plan.alreadyResident,
    memoryBeforeBytes,
    memoryAfterBytes: summarizeMemory(current).totalSimulatedBytes,
    ticksElapsed: current.tick - startTick,
  };
}

export function describeColumnState(column: LoadingColumnState): string {
  if (column.state === 'UNLOADED') return 'Unloaded';
  if (column.state === 'LOADED') return 'Loaded (resident)';
  return `Loading (${column.progressTicks} of ${column.profile.loadTicks} steps)`;
}

/** Plain-language reading of a query plan. Separates column loading from query execution. */
export function explainQueryPlan(plan: QueryLoadPlan): string[] {
  const list = (names: string[]): string => names.join(', ');
  const lines: string[] = [];
  if (plan.alreadyResident.length > 0) {
    lines.push(`Already available (resident, no loading needed): ${list(plan.alreadyResident)}.`);
  }
  if (plan.loadingInProgress.length > 0) {
    lines.push(`Still loading (the query waits for them): ${list(plan.loadingInProgress)}.`);
  }
  if (plan.needsLoading.length > 0) {
    lines.push(
      `Need loading: ${list(plan.needsLoading)}. Each is loaded as a whole column, about ${plan.additionalBytesToLoad.toLocaleString('en-US')} B of simulated memory in total.`,
    );
  }
  if (plan.needsLoading.length === 0 && plan.loadingInProgress.length === 0) {
    lines.push('Every column the query needs is already resident, so no additional loading is needed.');
  }
  lines.push('Column loading is separate from query execution. Only the columns the query needs are loaded, not the whole semantic model.');
  return lines;
}

export interface LoadingDemo {
  id: string;
  label: string;
  kind: 'LOAD' | 'QUERY';
  columns: string[];
}

export const LOADING_DEMOS: ReadonlyArray<LoadingDemo> = [
  { id: 'LOAD_CUSTOMERID', label: 'Load CustomerID only', kind: 'LOAD', columns: ['CustomerID'] },
  { id: 'LOAD_REVENUE_REGION', label: 'Load Revenue and Region', kind: 'LOAD', columns: ['Revenue', 'Region'] },
  { id: 'QUERY_ID_REVENUE', label: 'Run a query needing CustomerID and Revenue', kind: 'QUERY', columns: ['CustomerID', 'Revenue'] },
  { id: 'QUERY_RESIDENT_COLUMN', label: 'Run another query using an already-loaded column (Region)', kind: 'QUERY', columns: ['Region'] },
  { id: 'QUERY_UNLOADED_COLUMN', label: 'Request a previously unloaded column (LastPurchaseDate)', kind: 'QUERY', columns: ['LastPurchaseDate'] },
];

/** Runs one demonstration step on the session. LOAD demos load to completion; QUERY demos return the query result. */
export function applyLoadingDemo(session: LoadingSession, demoId: string): { session: LoadingSession; queryResult: QueryLoadResult | null } {
  const demo = LOADING_DEMOS.find((entry) => entry.id === demoId);
  if (!demo) throw new RangeError(`Unknown demonstration: ${demoId}`);
  if (demo.kind === 'LOAD') {
    return { session: finishLoading(requestLoad(session, demo.columns)), queryResult: null };
  }
  const result = executeQuery(session, demo.columns);
  return { session: result.session, queryResult: result };
}

export function getLoadingSourceReferences(): SourceReference[] {
  return [
    {
      title: 'How Direct Lake works - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-how-it-works',
      section: 'Column loading (transcoding), resident columns, framing, and why columns can be evicted',
    },
    {
      title: 'Direct Lake overview - Microsoft Fabric',
      url: 'https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-overview',
      section: 'Only the data needed to answer a query is loaded; refresh copies metadata only; VertiPaq processes the queries',
    },
    {
      title: 'Apache Parquet file format',
      url: 'https://parquet.apache.org/docs/file-format/',
      section: 'Column chunks and file metadata',
    },
    {
      title: 'Data reduction techniques for Import modeling - Power BI',
      url: 'https://learn.microsoft.com/en-us/power-bi/guidance/import-modeling-data-reduction',
      section: 'Numeric columns use value encoding; text uses hash encoding (basis of the Module 5 size estimates)',
    },
  ];
}
