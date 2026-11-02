import { describe, expect, it, vi } from 'vitest';
import { LoadingSession, LoadingSettings } from '../../types';
import {
  advanceSession,
  applyLoadingDemo,
  buildColumnProfiles,
  createLoadingSession,
  DEFAULT_LOADING_SETTINGS,
  describeColumnState,
  executeQuery,
  explainQueryPlan,
  finishLoading,
  flowStageFor,
  getLoadingSourceReferences,
  LOAD_BYTES_PER_TICK,
  LOADING_DEMOS,
  LOADING_FLOW_DISCLAIMER,
  LOADING_FLOW_STAGES,
  planQuery,
  requestLoad,
  summarizeMemory,
} from '../stage6-loading-simulator';
import { estimateColumnCompression } from '../stage6-compression-simulator';
import { applyNullPattern } from '../stage6-segment-simulator';
import { CUSTOMER_COLUMNS, generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../stage6-synthetic-dataset';

const settings = (overrides: Partial<LoadingSettings> = {}): LoadingSettings => ({ ...DEFAULT_LOADING_SETTINGS, ...overrides });
const stateOf = (s: LoadingSession, name: string) => s.columns.find((c) => c.profile.columnName === name)!;
const eventTypes = (s: LoadingSession): string[] => s.events.map((e) => e.type);

// Default settings (1,000 rows, 500 rows per segment, no nulls, numeric columns as value encoding):
// CustomerID 1,394 B / 3 steps, Revenue 2,520 B / 5, LastPurchaseDate 1,394 B / 3, Region 549 B / 2, CustomerName 3,336 B / 7. Full set 9,193 B.

describe('column profiles (sized with Module 5)', () => {
  const profiles = buildColumnProfiles(DEFAULT_LOADING_SETTINGS);

  it('lists the shared Customer columns in dataset order with their data types and row count', () => {
    expect(profiles.map((p) => p.columnName)).toEqual(CUSTOMER_COLUMNS.map((c) => c.name));
    expect(profiles.map((p) => p.dataType)).toEqual(['INTEGER', 'DECIMAL', 'DATE', 'TEXT', 'TEXT']);
    expect(profiles.every((p) => p.rowCount === 1000)).toBe(true);
    expect(profiles.map((p) => p.sourceType)).toEqual(['int64', 'decimal(18,2)', 'date', 'utf8', 'utf8']);
  });

  it('uses the Module 5 estimate as the simulated memory size, exactly', () => {
    for (const profile of profiles) {
      const column = getCustomerEncodingColumn(generateSyntheticCustomerRows(1000), profile.columnName);
      const estimate = estimateColumnCompression(applyNullPattern(column, 0), 500, { encoding: profile.encodingModel });
      expect(profile.memoryBytes).toBe(estimate.totalCompressedBytes);
      expect(profile.uncompressedBytes).toBe(estimate.originalBytes);
      expect(profile.cardinality).toBe(estimate.cardinality);
    }
  });

  it('has the documented default sizes and step counts', () => {
    expect(profiles.map((p) => [p.columnName, p.memoryBytes, p.loadTicks])).toEqual([
      ['CustomerID', 1394, 3],
      ['Revenue', 2520, 5],
      ['LastPurchaseDate', 1394, 3],
      ['Region', 549, 2],
      ['CustomerName', 3336, 7],
    ]);
  });

  it('proportions steps to size: ceil(bytes / bytes-per-step), at least 1', () => {
    expect(LOAD_BYTES_PER_TICK).toBe(512);
    for (const p of profiles) {
      expect(p.loadTicks).toBe(Math.max(1, Math.ceil(p.memoryBytes / LOAD_BYTES_PER_TICK)));
    }
  });

  it('always uses a dictionary for text, and the chosen representation for numeric and date columns', () => {
    const value = buildColumnProfiles(settings({ numericEncoding: 'VALUE' }));
    const dictionary = buildColumnProfiles(settings({ numericEncoding: 'DICTIONARY' }));
    expect(value.filter((p) => p.dataType === 'TEXT').every((p) => p.encodingModel === 'DICTIONARY')).toBe(true);
    expect(dictionary.every((p) => p.encodingModel === 'DICTIONARY')).toBe(true);
    expect(dictionary[0].memoryBytes).toBeGreaterThan(value[0].memoryBytes); // CustomerID: dictionary is larger
    expect(dictionary[3].memoryBytes).toBe(value[3].memoryBytes); // Region: text, same either way
  });

  it('scales with the settings: more rows and smaller segments cost more', () => {
    const base = buildColumnProfiles(DEFAULT_LOADING_SETTINGS);
    const more = buildColumnProfiles(settings({ rowCount: 2000 }));
    const smallSegments = buildColumnProfiles(settings({ segmentRowCount: 50 }));
    expect(more.every((p, i) => p.memoryBytes > base[i].memoryBytes)).toBe(true);
    expect(smallSegments.every((p, i) => p.memoryBytes > base[i].memoryBytes)).toBe(true);
  });

  it('sizes null-heavy and all-null columns without error', () => {
    const nulls = buildColumnProfiles(settings({ nullPercent: 25 }));
    expect(nulls.every((p) => p.nullCount > 0)).toBe(true);
    const allNull = buildColumnProfiles(settings({ nullPercent: 100 }));
    expect(allNull.every((p) => p.nullCount === 1000 && p.cardinality === 0 && p.memoryBytes > 0)).toBe(true);
  });

  it('gives empty columns zero size and zero loading steps', () => {
    const empty = buildColumnProfiles(settings({ rowCount: 0 }));
    expect(empty.every((p) => p.rowCount === 0 && p.memoryBytes === 0 && p.uncompressedBytes === 0 && p.loadTicks === 0)).toBe(true);
  });

  it('rejects invalid settings', () => {
    expect(() => buildColumnProfiles(settings({ rowCount: -1 }))).toThrow(RangeError);
    expect(() => buildColumnProfiles(settings({ rowCount: 1.5 }))).toThrow(RangeError);
    expect(() => buildColumnProfiles(settings({ segmentRowCount: 0 }))).toThrow(RangeError);
    expect(() => buildColumnProfiles(settings({ nullPercent: 101 }))).toThrow(RangeError);
  });
});

describe('a new session', () => {
  it('starts with every column unloaded, no memory and no events', () => {
    const session = createLoadingSession();
    expect(session.tick).toBe(0);
    expect(session.events).toEqual([]);
    expect(session.columns).toHaveLength(5);
    expect(session.columns.every((c) => c.state === 'UNLOADED' && c.progressTicks === 0 && c.residentBytes === 0)).toBe(true);
    const memory = summarizeMemory(session);
    expect(memory).toMatchObject({ totalColumns: 5, residentColumns: 0, loadingColumns: 0, unloadedColumns: 5, totalSimulatedBytes: 0, fullColumnSetBytes: 9193, shareOfFullSetPercent: 0 });
  });
});

describe('loading one column', () => {
  it('moves through loading to loaded, adding memory gradually and exactly once', () => {
    const start = createLoadingSession();
    const requested = requestLoad(start, ['CustomerID']);
    expect(stateOf(requested, 'CustomerID')).toMatchObject({ state: 'LOADING', progressTicks: 0, residentBytes: 0 });
    expect(summarizeMemory(requested).totalSimulatedBytes).toBe(0);

    const one = advanceSession(requested, 1);
    expect(stateOf(one, 'CustomerID')).toMatchObject({ state: 'LOADING', progressTicks: 1, residentBytes: Math.floor(1394 / 3) });
    const two = advanceSession(one, 1);
    expect(stateOf(two, 'CustomerID').residentBytes).toBe(Math.floor((1394 * 2) / 3));
    const done = advanceSession(two, 1);
    expect(stateOf(done, 'CustomerID')).toMatchObject({ state: 'LOADED', progressTicks: 3, residentBytes: 1394 });
    expect(done.tick).toBe(3);
    expect(summarizeMemory(done)).toMatchObject({ residentColumns: 1, loadingColumns: 0, unloadedColumns: 4, residentBytes: 1394, inProgressBytes: 0, totalSimulatedBytes: 1394 });
  });

  it('never decreases memory while loading', () => {
    let session = requestLoad(createLoadingSession(), ['CustomerName']);
    let previous = -1;
    for (let i = 0; i < 8; i++) {
      session = advanceSession(session, 1);
      const total = summarizeMemory(session).totalSimulatedBytes;
      expect(total).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
    expect(previous).toBe(3336);
  });

  it('records the request and completion as events with the step they happened on', () => {
    const done = finishLoading(requestLoad(createLoadingSession(), ['CustomerID']));
    expect(eventTypes(done)).toEqual(['LOAD_REQUESTED', 'LOAD_COMPLETED']);
    expect(done.events[0].tick).toBe(0);
    expect(done.events[1].tick).toBe(3);
    expect(done.events.map((e) => e.sequence)).toEqual([1, 2]);
    expect(done.events[0].message).toMatch(/the entire column is loaded/);
  });

  it('does not change the session it was given', () => {
    const start = createLoadingSession();
    const before = JSON.stringify(start);
    requestLoad(start, ['Region']);
    finishLoading(requestLoad(start, ['Region']));
    expect(JSON.stringify(start)).toBe(before);
  });
});

describe('loading several columns', () => {
  it('loads them together and finishes each when its own steps are done', () => {
    let session = requestLoad(createLoadingSession(), ['Revenue', 'Region']);
    session = advanceSession(session, 2);
    expect(stateOf(session, 'Region').state).toBe('LOADED'); // 2 steps
    expect(stateOf(session, 'Revenue')).toMatchObject({ state: 'LOADING', progressTicks: 2 });
    const mid = summarizeMemory(session);
    expect(mid).toMatchObject({ residentColumns: 1, loadingColumns: 1, residentBytes: 549, inProgressBytes: Math.floor((2520 * 2) / 5), unloadedColumns: 3 });

    session = advanceSession(session, 3);
    expect(summarizeMemory(session)).toMatchObject({ residentColumns: 2, loadingColumns: 0, totalSimulatedBytes: 2520 + 549 });
    expect(session.tick).toBe(5);
  });

  it('finishLoading stops at the slowest column and loads all five in the longest column\'s steps', () => {
    const all = finishLoading(requestLoad(createLoadingSession(), CUSTOMER_COLUMNS.map((c) => c.name)));
    expect(all.tick).toBe(7);
    expect(summarizeMemory(all)).toMatchObject({ residentColumns: 5, totalSimulatedBytes: 9193, shareOfFullSetPercent: 100 });
  });

  it('leaves columns that were not requested unloaded: only what is asked for is loaded', () => {
    const session = finishLoading(requestLoad(createLoadingSession(), ['CustomerID', 'Revenue']));
    expect(session.columns.filter((c) => c.state === 'UNLOADED').map((c) => c.profile.columnName)).toEqual(['LastPurchaseDate', 'Region', 'CustomerName']);
    const memory = summarizeMemory(session);
    expect(memory.totalSimulatedBytes).toBe(1394 + 2520);
    expect(memory.totalSimulatedBytes).toBeLessThan(memory.fullColumnSetBytes);
    expect(memory.shareOfFullSetPercent).toBeCloseTo((3914 / 9193) * 100, 8);
  });

  it('collapses a column named twice in one request into one request', () => {
    const session = requestLoad(createLoadingSession(), ['Region', 'Region']);
    expect(session.events).toHaveLength(1);
  });
});

describe('repeated loading', () => {
  it('does nothing and adds no memory when a column is requested while it is loading', () => {
    const loading = advanceSession(requestLoad(createLoadingSession(), ['CustomerID']), 1);
    const again = requestLoad(loading, ['CustomerID']);
    expect(eventTypes(again).slice(-1)).toEqual(['ALREADY_LOADING']);
    expect(stateOf(again, 'CustomerID')).toEqual(stateOf(loading, 'CustomerID'));
    expect(summarizeMemory(again).totalSimulatedBytes).toBe(summarizeMemory(loading).totalSimulatedBytes);
  });

  it('does not double-count memory for a column that is already resident', () => {
    const loaded = finishLoading(requestLoad(createLoadingSession(), ['CustomerID']));
    let session = loaded;
    for (let i = 0; i < 5; i++) session = requestLoad(session, ['CustomerID']);
    expect(summarizeMemory(session).totalSimulatedBytes).toBe(1394);
    expect(session.tick).toBe(loaded.tick);
    expect(eventTypes(session).filter((t) => t === 'ALREADY_RESIDENT')).toHaveLength(5);
    expect(eventTypes(session).filter((t) => t === 'LOAD_COMPLETED')).toHaveLength(1);
  });

  it('requesting every column twice still totals the full set once', () => {
    const names = CUSTOMER_COLUMNS.map((c) => c.name);
    let session = finishLoading(requestLoad(createLoadingSession(), names));
    session = finishLoading(requestLoad(session, names));
    expect(summarizeMemory(session).totalSimulatedBytes).toBe(9193);
  });

  it('advancing when nothing is loading changes nothing', () => {
    const session = createLoadingSession();
    expect(advanceSession(session, 4)).toBe(session);
    const loaded = finishLoading(requestLoad(session, ['Region']));
    expect(advanceSession(loaded, 3)).toBe(loaded);
    expect(finishLoading(loaded)).toBe(loaded);
  });

  it('stops advancing as soon as the last column finishes, even if more steps are asked for', () => {
    const session = advanceSession(requestLoad(createLoadingSession(), ['Region']), 50);
    expect(session.tick).toBe(2);
    expect(stateOf(session, 'Region').state).toBe('LOADED');
  });
});

describe('invalid selections', () => {
  it('rejects an empty selection and names unknown columns', () => {
    const session = createLoadingSession();
    expect(() => requestLoad(session, [])).toThrow(/at least one column/);
    expect(() => requestLoad(session, ['Nope'])).toThrow(/Unknown column\(s\): Nope/);
    expect(() => requestLoad(session, ['Region', 'Nope', 'Other'])).toThrow(/Nope, Other/);
    expect(() => requestLoad(session, 'Region' as unknown as string[])).toThrow(RangeError);
    expect(() => planQuery(session, [])).toThrow(/at least one column/);
    expect(() => planQuery(session, ['Nope'])).toThrow(RangeError);
    expect(() => executeQuery(session, ['Nope'])).toThrow(RangeError);
  });

  it('a rejected request leaves the session untouched', () => {
    const session = createLoadingSession();
    try {
      requestLoad(session, ['Region', 'Nope']);
    } catch {
      // expected
    }
    expect(session.events).toEqual([]);
    expect(stateOf(session, 'Region').state).toBe('UNLOADED');
  });

  it('rejects advancing by an invalid number of steps', () => {
    const session = requestLoad(createLoadingSession(), ['Region']);
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => advanceSession(session, bad)).toThrow(RangeError);
    }
  });

  it('rejects an unknown demonstration', () => {
    expect(() => applyLoadingDemo(createLoadingSession(), 'NOPE')).toThrow(/Unknown demonstration/);
  });
});

describe('empty datasets', () => {
  it('loads empty columns instantly with zero memory', () => {
    const empty = createLoadingSession(settings({ rowCount: 0 }));
    const loaded = requestLoad(empty, ['CustomerID', 'Region']);
    expect(stateOf(loaded, 'CustomerID')).toMatchObject({ state: 'LOADED', residentBytes: 0 });
    expect(loaded.tick).toBe(0);
    expect(eventTypes(loaded)).toEqual(['LOAD_REQUESTED', 'LOAD_COMPLETED', 'LOAD_REQUESTED', 'LOAD_COMPLETED']);
    expect(loaded.events[0].message).toMatch(/column is empty/);
    const memory = summarizeMemory(loaded);
    expect(memory).toMatchObject({ residentColumns: 2, totalSimulatedBytes: 0, fullColumnSetBytes: 0, shareOfFullSetPercent: 0 });
    expect(Number.isNaN(memory.shareOfFullSetPercent)).toBe(false);
  });

  it('queries over empty columns are ready immediately', () => {
    const result = executeQuery(createLoadingSession(settings({ rowCount: 0 })), ['CustomerID', 'Revenue']);
    expect(result.ticksElapsed).toBe(0);
    expect(result.memoryAfterBytes).toBe(0);
    expect(result.session.columns.filter((c) => c.state === 'LOADED')).toHaveLength(2);
  });
});

describe('query-driven column requests', () => {
  it('plans a query without running it: statuses, bytes to load and no change to the session', () => {
    const session = finishLoading(requestLoad(createLoadingSession(), ['CustomerID']));
    const before = JSON.stringify(session);
    const plan = planQuery(session, ['CustomerID', 'Revenue']);
    expect(plan.entries.map((e) => [e.columnName, e.status])).toEqual([
      ['CustomerID', 'ALREADY_RESIDENT'],
      ['Revenue', 'NEEDS_LOADING'],
    ]);
    expect(plan.alreadyResident).toEqual(['CustomerID']);
    expect(plan.needsLoading).toEqual(['Revenue']);
    expect(plan.additionalBytesToLoad).toBe(2520);
    expect(JSON.stringify(session)).toBe(before);
  });

  it('reports a column that is still loading as in progress', () => {
    const session = advanceSession(requestLoad(createLoadingSession(), ['Revenue']), 1);
    const plan = planQuery(session, ['Revenue', 'Region']);
    expect(plan.loadingInProgress).toEqual(['Revenue']);
    expect(plan.needsLoading).toEqual(['Region']);
    expect(plan.additionalBytesToLoad).toBe(549);
  });

  it('dedupes and keeps the order of the requested columns', () => {
    const plan = planQuery(createLoadingSession(), ['Region', 'CustomerID', 'Region']);
    expect(plan.requestedColumns).toEqual(['Region', 'CustomerID']);
  });

  it('loads every needed column on a fresh session, waiting for the slowest', () => {
    const result = executeQuery(createLoadingSession(), ['CustomerID', 'Revenue']);
    expect(result.columnsLoadedByQuery).toEqual(['CustomerID', 'Revenue']);
    expect(result.columnsReused).toEqual([]);
    expect(result.ticksElapsed).toBe(5);
    expect(result.memoryBeforeBytes).toBe(0);
    expect(result.memoryAfterBytes).toBe(1394 + 2520);
    expect(eventTypes(result.session)).toEqual([
      'QUERY_REQUESTED',
      'LOAD_REQUESTED',
      'LOAD_REQUESTED',
      'LOAD_COMPLETED',
      'LOAD_COMPLETED',
      'QUERY_READY',
    ]);
  });

  it('reuses columns that are already resident without loading anything', () => {
    const warm = finishLoading(requestLoad(createLoadingSession(), ['CustomerID', 'Revenue']));
    const result = executeQuery(warm, ['CustomerID', 'Revenue']);
    expect(result.columnsLoadedByQuery).toEqual([]);
    expect(result.columnsReused).toEqual(['CustomerID', 'Revenue']);
    expect(result.ticksElapsed).toBe(0);
    expect(result.memoryAfterBytes).toBe(result.memoryBeforeBytes);
    const queryEvents = result.session.events.slice(warm.events.length).map((e) => e.type);
    expect(queryEvents).not.toContain('LOAD_REQUESTED');
    expect(queryEvents).toEqual(['QUERY_REQUESTED', 'ALREADY_RESIDENT', 'ALREADY_RESIDENT', 'QUERY_READY']);
  });

  it('loads only the missing column for a mixed request and adds only its memory', () => {
    const warm = finishLoading(requestLoad(createLoadingSession(), ['Revenue', 'Region']));
    const result = executeQuery(warm, ['Region', 'LastPurchaseDate']);
    expect(result.columnsReused).toEqual(['Region']);
    expect(result.columnsLoadedByQuery).toEqual(['LastPurchaseDate']);
    expect(result.memoryAfterBytes - result.memoryBeforeBytes).toBe(1394);
    expect(result.ticksElapsed).toBe(3);
    expect(stateOf(result.session, 'CustomerName').state).toBe('UNLOADED'); // never needed, never loaded
  });

  it('waits for a column that is already loading instead of loading it again', () => {
    const loading = advanceSession(requestLoad(createLoadingSession(), ['Revenue']), 2);
    const result = executeQuery(loading, ['Revenue']);
    expect(result.columnsAwaited).toEqual(['Revenue']);
    expect(result.columnsLoadedByQuery).toEqual([]);
    expect(result.ticksElapsed).toBe(3); // 5 steps in total, 2 already done
    expect(result.memoryAfterBytes).toBe(2520);
    expect(result.session.events.slice(loading.events.length).filter((e) => e.type === 'LOAD_REQUESTED')).toHaveLength(0);
    expect(eventTypes(result.session).filter((t) => t === 'LOAD_REQUESTED')).toHaveLength(1);
  });

  it('says that running the query is not simulated, and does not change non-requested columns', () => {
    const result = executeQuery(createLoadingSession(), ['Region']);
    const ready = result.session.events[result.session.events.length - 1];
    expect(ready.type).toBe('QUERY_READY');
    expect(ready.message).toMatch(/Running the query itself is not simulated/);
    expect(result.session.columns.filter((c) => c.state === 'LOADED')).toHaveLength(1);
  });

  it('keeps memory equal to the sum of resident columns however queries repeat', () => {
    let session = createLoadingSession();
    for (const columns of [['CustomerID'], ['CustomerID', 'Revenue'], ['Revenue'], ['CustomerID', 'Revenue', 'Region'], ['Region']]) {
      session = executeQuery(session, columns).session;
      const expected = session.columns.filter((c) => c.state === 'LOADED').reduce((sum, c) => sum + c.profile.memoryBytes, 0);
      expect(summarizeMemory(session).totalSimulatedBytes).toBe(expected);
    }
    expect(summarizeMemory(session).totalSimulatedBytes).toBe(1394 + 2520 + 549);
  });
});

describe('required demonstrations', () => {
  it('lists the five demonstrations in order', () => {
    expect(LOADING_DEMOS.map((d) => d.label)).toEqual([
      'Load CustomerID only',
      'Load Revenue and Region',
      'Run a query needing CustomerID and Revenue',
      'Run another query using an already-loaded column (Region)',
      'Request a previously unloaded column (LastPurchaseDate)',
    ]);
  });

  it('plays them in sequence with the numbers quoted on the page', () => {
    let session = createLoadingSession();
    const run = (id: string) => {
      const r = applyLoadingDemo(session, id);
      session = r.session;
      return r;
    };

    run('LOAD_CUSTOMERID');
    expect(summarizeMemory(session)).toMatchObject({ residentColumns: 1, totalSimulatedBytes: 1394 });
    expect(session.tick).toBe(3);

    run('LOAD_REVENUE_REGION');
    expect(summarizeMemory(session)).toMatchObject({ residentColumns: 3, totalSimulatedBytes: 4463 });

    const q1 = run('QUERY_ID_REVENUE').queryResult!;
    expect(q1.columnsReused).toEqual(['CustomerID', 'Revenue']);
    expect(q1.columnsLoadedByQuery).toEqual([]);
    expect(q1.memoryAfterBytes).toBe(4463);

    const q2 = run('QUERY_RESIDENT_COLUMN').queryResult!;
    expect(q2.columnsReused).toEqual(['Region']);
    expect(q2.ticksElapsed).toBe(0);

    const q3 = run('QUERY_UNLOADED_COLUMN').queryResult!;
    expect(q3.columnsLoadedByQuery).toEqual(['LastPurchaseDate']);
    expect(q3.columnsReused).toEqual([]);
    expect(q3.memoryBeforeBytes).toBe(4463);
    expect(q3.memoryAfterBytes).toBe(5857);
    expect(summarizeMemory(session)).toMatchObject({ residentColumns: 4, unloadedColumns: 1 });
    expect(Math.round(summarizeMemory(session).shareOfFullSetPercent)).toBe(64);
  });

  it('shows the difference when the same query runs on a cold and a warm session', () => {
    const cold = executeQuery(createLoadingSession(), ['CustomerID', 'Revenue']);
    const warm = executeQuery(cold.session, ['CustomerID', 'Revenue']);
    expect(cold.columnsLoadedByQuery).toHaveLength(2);
    expect(warm.columnsLoadedByQuery).toHaveLength(0);
    expect(warm.ticksElapsed).toBe(0);
  });
});

describe('determinism', () => {
  it('gives identical results every time and never uses random numbers', () => {
    const spy = vi.spyOn(Math, 'random');
    const play = () => {
      let s = createLoadingSession(settings({ nullPercent: 10 }));
      for (const demo of LOADING_DEMOS) s = applyLoadingDemo(s, demo.id).session;
      return s;
    };
    expect(play()).toEqual(play());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('conceptual flow', () => {
  it('has the six stages in the documented order', () => {
    expect(LOADING_FLOW_STAGES.map((s) => s.id)).toEqual(['ONELAKE', 'DELTA_LAKE', 'PARQUET', 'COLUMN_ACCESS', 'VERTIPAQ', 'AVAILABLE']);
    expect(LOADING_FLOW_STAGES.map((s) => s.label)).toEqual([
      'OneLake',
      'Delta Lake',
      'Parquet',
      'Column access',
      'VertiPaq representation',
      'Semantic model availability',
    ]);
    expect(LOADING_FLOW_STAGES.every((s) => s.summary.length > 0 && s.details.length > 0)).toBe(true);
  });

  it('places a column on the flow from its state and progress, as a visual aid', () => {
    expect(flowStageFor('UNLOADED', 0)).toBe('PARQUET');
    expect(flowStageFor('LOADING', 0)).toBe('COLUMN_ACCESS');
    expect(flowStageFor('LOADING', 0.49)).toBe('COLUMN_ACCESS');
    expect(flowStageFor('LOADING', 0.5)).toBe('VERTIPAQ');
    expect(flowStageFor('LOADING', 0.99)).toBe('VERTIPAQ');
    expect(flowStageFor('LOADED', 1)).toBe('AVAILABLE');
  });

  it('labels every stage and states the flow is a simplification, not the internal implementation', () => {
    const text = LOADING_FLOW_STAGES.flatMap((s) => s.details).join(' ');
    for (const label of ['[DOCUMENTED]', '[SIMPLIFIED MODEL]', '[PROPRIETARY INTERNAL]']) {
      expect(text).toContain(label);
    }
    expect(LOADING_FLOW_DISCLAIMER).toMatch(/simplified conceptual flow, not the complete internal Fabric implementation/);
    expect(LOADING_FLOW_DISCLAIMER).toMatch(/Microsoft does not document internal sub-steps/);
  });

  it('does not claim the whole model must be loaded and keeps availability separate from import', () => {
    const text = [...LOADING_FLOW_STAGES.flatMap((s) => s.details), LOADING_FLOW_DISCLAIMER].join(' ');
    expect(text).toMatch(/does not mean the whole semantic model is in memory/);
    expect(text).not.toMatch(/entire (semantic )?model (must|is|has to) (be )?loaded/i);
    expect(text).toMatch(/not simulated here/); // framing and eviction are out of scope
  });

  it('describes each column state in words', () => {
    const session = createLoadingSession();
    expect(describeColumnState(stateOf(session, 'Region'))).toBe('Unloaded');
    const loading = advanceSession(requestLoad(session, ['Region']), 1);
    expect(describeColumnState(stateOf(loading, 'Region'))).toBe('Loading (1 of 2 steps)');
    expect(describeColumnState(stateOf(finishLoading(loading), 'Region'))).toBe('Loaded (resident)');
  });
});

describe('query plan explanations', () => {
  it('names available, loading and needed columns and separates loading from execution', () => {
    const base = advanceSession(requestLoad(finishLoading(requestLoad(createLoadingSession(), ['CustomerID'])), ['Revenue']), 1);
    const lines = explainQueryPlan(planQuery(base, ['CustomerID', 'Revenue', 'Region'])).join(' ');
    expect(lines).toMatch(/Already available \(resident, no loading needed\): CustomerID/);
    expect(lines).toMatch(/Still loading \(the query waits for them\): Revenue/);
    expect(lines).toMatch(/Need loading: Region/);
    expect(lines).toMatch(/Column loading is separate from query execution/);
    expect(lines).toMatch(/not the whole semantic model/);
  });

  it('says so when nothing needs loading', () => {
    const warm = finishLoading(requestLoad(createLoadingSession(), ['Region']));
    expect(explainQueryPlan(planQuery(warm, ['Region'])).join(' ')).toMatch(/already resident, so no additional loading is needed/);
  });

  it('does not describe the query as executed or give result values', () => {
    const lines = explainQueryPlan(planQuery(createLoadingSession(), ['Region'])).join(' ');
    expect(lines).not.toMatch(/returned|executed the query|result is/i);
  });
});

describe('sources', () => {
  it('cites the verified Microsoft Learn pages over https', () => {
    const sources = getLoadingSourceReferences();
    expect(sources.every((s) => s.url.startsWith('https://'))).toBe(true);
    expect(sources.some((s) => s.url.includes('/fabric/fundamentals/direct-lake-how-it-works'))).toBe(true);
    expect(sources.some((s) => s.url.includes('/fabric/fundamentals/direct-lake-overview'))).toBe(true);
  });
});
