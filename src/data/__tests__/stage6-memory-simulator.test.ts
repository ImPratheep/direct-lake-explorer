import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadingSession, LoadingSettings } from '../../types';
import {
  advanceSession,
  createLoadingSession,
  DEFAULT_LOADING_SETTINGS,
  executeQuery,
  finishLoading,
  requestLoad,
  summarizeMemory,
} from '../stage6-loading-simulator';
import {
  applyMemoryDemo,
  applyMemoryPressure,
  budgetStatus,
  columnHistory,
  compareMemory,
  DEFAULT_ILLUSTRATIVE_BUDGET_BYTES,
  evictAllResident,
  evictColumns,
  explainEviction,
  getMemorySourceReferences,
  MEMORY_DEMOS,
  snapshotMemory,
} from '../stage6-memory-simulator';

const settings = (changes: Partial<LoadingSettings> = {}): LoadingSettings => ({ ...DEFAULT_LOADING_SETTINGS, ...changes });
const loaded = (names: string[], s: LoadingSettings = DEFAULT_LOADING_SETTINGS): LoadingSession =>
  finishLoading(requestLoad(createLoadingSession(s), names));
const eventTypes = (session: LoadingSession): string[] => session.events.map((e) => e.type);
const stateOf = (session: LoadingSession, name: string): string => session.columns.find((c) => c.profile.columnName === name)?.state ?? '';

// Default sizes (1,000 rows, 500 per segment, Value representation) from the Module 5 estimate:
// CustomerID 1,394, Revenue 2,520, LastPurchaseDate 1,394, Region 549, CustomerName 3,336.
const THREE = ['CustomerID', 'Revenue', 'Region'];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('initial residency state', () => {
  it('starts with every column non-resident and no memory used', () => {
    const snapshot = snapshotMemory(createLoadingSession());
    expect(snapshot.residentColumns).toEqual([]);
    expect(snapshot.loadingColumns).toEqual([]);
    expect(snapshot.nonResidentColumns).toEqual(['CustomerID', 'Revenue', 'LastPurchaseDate', 'Region', 'CustomerName']);
    expect(snapshot.totalBytes).toBe(0);
  });

  it('counts each column in exactly one group', () => {
    let session = requestLoad(createLoadingSession(), ['CustomerID', 'Revenue']);
    session = advanceSession(session, 3);
    const snapshot = snapshotMemory(session);
    expect(snapshot.residentColumns).toEqual(['CustomerID']);
    expect(snapshot.loadingColumns).toEqual(['Revenue']);
    expect(snapshot.nonResidentColumns).toHaveLength(3);
    expect(snapshot.residentColumns.length + snapshot.loadingColumns.length + snapshot.nonResidentColumns.length).toBe(5);
  });

  it('reports the same memory as the Module 6 summary (one definition of size and residency)', () => {
    const session = loaded(THREE);
    const summary = summarizeMemory(session);
    const snapshot = snapshotMemory(session);
    expect(snapshot.residentBytes).toBe(summary.residentBytes);
    expect(snapshot.totalBytes).toBe(summary.totalSimulatedBytes);
    expect(snapshot.totalBytes).toBe(1394 + 2520 + 549);
  });
});

describe('evicting columns', () => {
  it('evicts a resident column, releasing exactly its size and nothing else', () => {
    const result = evictColumns(loaded(THREE), ['Revenue']);
    expect(result.evictedColumns).toEqual(['Revenue']);
    expect(result.freedBytes).toBe(2520);
    expect(result.before.totalBytes).toBe(4463);
    expect(result.after.totalBytes).toBe(1943);
    expect(result.after.residentColumns).toEqual(['CustomerID', 'Region']);
    expect(result.after.nonResidentColumns).toContain('Revenue');
    expect(stateOf(result.session, 'Revenue')).toBe('UNLOADED');
  });

  it('recomputes memory from the columns, so before minus freed equals after', () => {
    const result = evictColumns(loaded(THREE), ['Revenue', 'Region']);
    expect(result.before.totalBytes - result.freedBytes).toBe(result.after.totalBytes);
    expect(result.freedBytes).toBe(2520 + 549);
  });

  it('evicts several columns and logs one event per column in order', () => {
    const before = loaded(THREE);
    const result = evictColumns(before, ['Region', 'CustomerID']);
    const added = result.session.events.slice(before.events.length);
    expect(added.map((e) => e.type)).toEqual(['EVICTED', 'EVICTED']);
    expect(added.map((e) => e.columnName)).toEqual(['Region', 'CustomerID']);
    expect(added[0].message).toMatch(/Its data remains in storage/);
  });

  it('does not change the input session (immutability)', () => {
    const before = loaded(THREE);
    const frozen = JSON.stringify(before);
    evictColumns(before, ['Revenue']);
    expect(JSON.stringify(before)).toBe(frozen);
  });

  it('removes a duplicate name from the request', () => {
    const result = evictColumns(loaded(THREE), ['Revenue', 'Revenue']);
    expect(result.evictedColumns).toEqual(['Revenue']);
    expect(result.freedBytes).toBe(2520);
  });

  it('labels the reason in the log without changing the outcome', () => {
    const base = loaded(THREE);
    const user = evictColumns(base, ['Revenue'], 'USER_ACTION');
    const unused = evictColumns(base, ['Revenue'], 'UNUSED_SCENARIO');
    expect(unused.after).toEqual(user.after);
    expect(unused.freedBytes).toBe(user.freedBytes);
    expect(unused.session.events[unused.session.events.length - 1].message).toMatch(/unused-column scenario/);
    expect(user.session.events[user.session.events.length - 1].message).toMatch(/user action/);
  });
});

describe('repeated eviction and skipped columns', () => {
  it('evicting the same column twice frees nothing the second time', () => {
    const first = evictColumns(loaded(THREE), ['Revenue']);
    const second = evictColumns(first.session, ['Revenue']);
    expect(second.evictedColumns).toEqual([]);
    expect(second.freedBytes).toBe(0);
    expect(second.skipped).toEqual([{ columnName: 'Revenue', cause: 'NOT_RESIDENT' }]);
    expect(second.after.totalBytes).toBe(first.after.totalBytes);
    expect(eventTypes(second.session).filter((t) => t === 'EVICTED')).toHaveLength(1);
    expect(eventTypes(second.session)).toContain('EVICTION_SKIPPED');
  });

  it('skips a column that was never loaded', () => {
    const result = evictColumns(createLoadingSession(), ['Region']);
    expect(result.skipped).toEqual([{ columnName: 'Region', cause: 'NOT_RESIDENT' }]);
    expect(result.after.totalBytes).toBe(0);
  });

  it('does not evict a column that is still loading and keeps its partial memory', () => {
    const loading = advanceSession(requestLoad(createLoadingSession(), ['Revenue']), 1);
    const result = evictColumns(loading, ['Revenue']);
    expect(result.evictedColumns).toEqual([]);
    expect(result.skipped).toEqual([{ columnName: 'Revenue', cause: 'STILL_LOADING' }]);
    expect(stateOf(result.session, 'Revenue')).toBe('LOADING');
    expect(result.after.inProgressBytes).toBe(result.before.inProgressBytes);
    expect(result.after.inProgressBytes).toBeGreaterThan(0);
  });

  it('evicts everything resident repeatedly without going negative', () => {
    let session = loaded(THREE);
    for (let i = 0; i < 3; i++) {
      session = evictAllResident(session).session;
      expect(snapshotMemory(session).totalBytes).toBe(0);
    }
    expect(columnHistory(session).every((h) => h.timesEvicted <= 1)).toBe(true);
  });
});

describe('re-requesting an evicted column', () => {
  it('needs to load the evicted column again but reuses the others', () => {
    const evicted = evictColumns(loaded(THREE), ['Revenue']).session;
    const result = executeQuery(evicted, ['CustomerID', 'Revenue']);
    expect(result.columnsReused).toEqual(['CustomerID']);
    expect(result.columnsLoadedByQuery).toEqual(['Revenue']);
    expect(result.ticksElapsed).toBe(5);
    expect(result.memoryBeforeBytes).toBe(1943);
    expect(result.memoryAfterBytes).toBe(4463);
  });

  it('returns memory to its earlier value after evict then reload', () => {
    const start = loaded(THREE);
    const reloaded = finishLoading(requestLoad(evictColumns(start, ['Revenue']).session, ['Revenue']));
    expect(snapshotMemory(reloaded).totalBytes).toBe(snapshotMemory(start).totalBytes);
    expect(snapshotMemory(reloaded).residentColumns.sort()).toEqual(snapshotMemory(start).residentColumns.sort());
  });

  it('counts evictions and reloads in the history', () => {
    let session = loaded(THREE);
    session = evictColumns(session, ['Revenue']).session;
    session = finishLoading(requestLoad(session, ['Revenue']));
    session = evictColumns(session, ['Revenue']).session;
    const revenue = columnHistory(session).find((h) => h.columnName === 'Revenue');
    expect(revenue).toEqual({ columnName: 'Revenue', timesEvicted: 2, reloadsAfterEviction: 1 });
    const region = columnHistory(session).find((h) => h.columnName === 'Region');
    expect(region).toEqual({ columnName: 'Region', timesEvicted: 0, reloadsAfterEviction: 0 });
  });

  it('does not count the first load as a reload', () => {
    const history = columnHistory(loaded(THREE));
    expect(history.every((h) => h.reloadsAfterEviction === 0 && h.timesEvicted === 0)).toBe(true);
  });
});

describe('before and after comparison', () => {
  it('labels each column as evicted, loaded or unchanged', () => {
    const before = loaded(THREE);
    const after = evictColumns(before, ['Revenue']).session;
    const rows = compareMemory(before, after);
    expect(rows.find((r) => r.columnName === 'Revenue')).toMatchObject({ change: 'EVICTED', bytesBefore: 2520, bytesAfter: 0 });
    expect(rows.find((r) => r.columnName === 'Region')).toMatchObject({ change: 'UNCHANGED', bytesBefore: 549, bytesAfter: 549 });
    expect(rows.find((r) => r.columnName === 'CustomerName')).toMatchObject({ change: 'UNCHANGED', bytesBefore: 0, bytesAfter: 0 });
    expect(rows.reduce((sum, r) => sum + r.bytesBefore - r.bytesAfter, 0)).toBe(2520);
  });

  it('reports a reloaded column as loaded', () => {
    const evicted = evictColumns(loaded(THREE), ['Revenue']).session;
    const reloaded = finishLoading(requestLoad(evicted, ['Revenue']));
    expect(compareMemory(evicted, reloaded).find((r) => r.columnName === 'Revenue')?.change).toBe('LOADED');
  });

  it('rejects sessions that describe different columns', () => {
    const a = createLoadingSession();
    const b = { ...a, columns: a.columns.slice(1) };
    expect(() => compareMemory(a, b)).toThrow(RangeError);
  });
});

describe('invalid selections', () => {
  it('rejects an empty eviction selection', () => {
    expect(() => evictColumns(loaded(THREE), [])).toThrow(/Select at least one column to evict/);
  });

  it('rejects unknown columns and does not partly evict', () => {
    const session = loaded(THREE);
    expect(() => evictColumns(session, ['Revenue', 'Profit'])).toThrow(/Unknown column\(s\): Profit/);
    expect(snapshotMemory(session).residentColumns).toHaveLength(3);
  });

  it('rejects an unknown protected column and an unknown demonstration', () => {
    expect(() => applyMemoryPressure(loaded(THREE), 1000, 'LARGEST_FIRST', ['Nope'])).toThrow(/Unknown column\(s\): Nope/);
    expect(() => applyMemoryDemo(createLoadingSession(), 'NOPE')).toThrow(RangeError);
  });

  it('is case sensitive about column names', () => {
    expect(() => evictColumns(loaded(THREE), ['revenue'])).toThrow(/Unknown column/);
  });
});

describe('empty, all-null and zero-row data', () => {
  it('handles a zero-row dataset: columns are resident at 0 B and evicting frees nothing', () => {
    const empty = loaded(['CustomerID', 'Revenue'], settings({ rowCount: 0 }));
    expect(snapshotMemory(empty).residentColumns).toEqual(['CustomerID', 'Revenue']);
    expect(snapshotMemory(empty).totalBytes).toBe(0);
    const result = evictColumns(empty, ['CustomerID']);
    expect(result.evictedColumns).toEqual(['CustomerID']);
    expect(result.freedBytes).toBe(0);
    expect(stateOf(result.session, 'CustomerID')).toBe('UNLOADED');
    const reload = finishLoading(requestLoad(result.session, ['CustomerID']));
    expect(stateOf(reload, 'CustomerID')).toBe('LOADED');
  });

  it('memory pressure on a zero-row dataset evicts nothing and stays within a zero budget', () => {
    const empty = loaded(THREE, settings({ rowCount: 0 }));
    const result = applyMemoryPressure(empty, 0);
    expect(result.evictedColumns).toEqual([]);
    expect(result.withinBudget).toBe(true);
    expect(result.overBudgetBytes).toBe(0);
  });

  it('handles all-null columns with no NaN, Infinity or negative memory', () => {
    const allNull = loaded(['CustomerID', 'Region', 'CustomerName'], settings({ nullPercent: 100 }));
    const result = evictColumns(allNull, ['Region']);
    for (const snapshot of [result.before, result.after]) {
      for (const n of [snapshot.residentBytes, snapshot.inProgressBytes, snapshot.totalBytes]) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }
    }
    expect(result.freedBytes).toBe(result.before.totalBytes - result.after.totalBytes);
    const status = budgetStatus(allNull, 100);
    expect(Number.isFinite(status.usedPercentOfBudget ?? 0)).toBe(true);
  });

  it('refresh scenario with nothing resident evicts nothing and says so', () => {
    const result = evictAllResident(createLoadingSession());
    expect(result.evictedColumns).toEqual([]);
    expect(result.freedBytes).toBe(0);
    expect(result.session.events[result.session.events.length - 1].message).toMatch(/nothing to evict/);
  });
});

describe('memory budget', () => {
  it('reports headroom and the percentage used', () => {
    const status = budgetStatus(loaded(THREE), 5000);
    expect(status).toMatchObject({ usedBytes: 4463, headroomBytes: 537, overBudgetBytes: 0, withinBudget: true });
    expect(status.usedPercentOfBudget).toBeCloseTo(89.26, 2);
  });

  it('treats a budget exactly equal to the memory used as within budget', () => {
    const status = budgetStatus(loaded(THREE), 4463);
    expect(status.withinBudget).toBe(true);
    expect(status.headroomBytes).toBe(0);
    expect(status.usedPercentOfBudget).toBe(100);
  });

  it('is over budget by exactly one byte below the memory used', () => {
    const status = budgetStatus(loaded(THREE), 4462);
    expect(status.withinBudget).toBe(false);
    expect(status.overBudgetBytes).toBe(1);
    expect(status.headroomBytes).toBe(-1);
  });

  it('reports a null percentage for a zero budget instead of dividing by zero', () => {
    expect(budgetStatus(loaded(THREE), 0).usedPercentOfBudget).toBeNull();
    expect(budgetStatus(createLoadingSession(), 0)).toMatchObject({ withinBudget: true, usedBytes: 0 });
  });

  it.each([-1, 1.5, NaN, Infinity])('rejects an invalid budget (%s)', (budget) => {
    expect(() => budgetStatus(createLoadingSession(), budget)).toThrow(RangeError);
    expect(() => applyMemoryPressure(createLoadingSession(), budget)).toThrow(RangeError);
  });
});

describe('memory-pressure scenario', () => {
  it('evicts nothing when memory is within the budget, and when it equals the budget', () => {
    const session = loaded(THREE);
    for (const budget of [4463, 4464, 100000]) {
      const result = applyMemoryPressure(session, budget);
      expect(result.evictedColumns).toEqual([]);
      expect(result.withinBudget).toBe(true);
      expect(result.after.totalBytes).toBe(4463);
    }
    expect(applyMemoryPressure(session, 4463).session.events.slice(-1)[0].message).toMatch(/within the illustrative budget/);
  });

  it('evicts the largest column first, and stops as soon as memory fits', () => {
    const result = applyMemoryPressure(loaded(THREE), 3000, 'LARGEST_FIRST');
    expect(result.evictedColumns).toEqual(['Revenue']);
    expect(result.after.totalBytes).toBe(1943);
    expect(result.withinBudget).toBe(true);
  });

  it('one byte below the memory used still evicts, and stops at the first column that makes it fit', () => {
    const result = applyMemoryPressure(loaded(THREE), 4462);
    expect(result.evictedColumns).toEqual(['Revenue']);
    expect(result.after.totalBytes).toBe(1943);
  });

  it('evicts the earliest-loaded column first when asked, which can differ from largest first', () => {
    // Load order here: Region (2 steps), CustomerID (3), Revenue (5).
    const largest = applyMemoryPressure(loaded(THREE), 3000, 'LARGEST_FIRST');
    const earliest = applyMemoryPressure(loaded(THREE), 3000, 'EARLIEST_LOADED_FIRST', ['CustomerID']);
    expect(largest.evictedColumns).toEqual(['Revenue']);
    expect(earliest.evictedColumns).toEqual(['Region', 'Revenue']);
    expect(earliest.after.totalBytes).toBe(1394);
  });

  it('never evicts a protected column, and reports the shortfall', () => {
    const result = applyMemoryPressure(loaded(THREE), 1000, 'LARGEST_FIRST', ['CustomerID']);
    expect(result.evictedColumns).toEqual(['Revenue', 'Region']);
    expect(result.protectedColumns).toEqual(['CustomerID']);
    expect(stateOf(result.session, 'CustomerID')).toBe('LOADED');
    expect(result.withinBudget).toBe(false);
    expect(result.overBudgetBytes).toBe(1394 - 1000);
    expect(result.session.events.slice(-1)[0].message).toMatch(/Still 394 B over the illustrative budget/);
  });

  it('with a zero budget evicts every unprotected resident column', () => {
    const result = applyMemoryPressure(loaded(THREE), 0);
    expect(result.after.totalBytes).toBe(0);
    expect(result.withinBudget).toBe(true);
    expect(result.evictedColumns).toHaveLength(3);
  });

  it('cannot evict a column that is still loading, so it can remain over budget', () => {
    const mixed = advanceSession(requestLoad(loaded(['Region']), ['Revenue']), 2);
    const result = applyMemoryPressure(mixed, 0);
    expect(result.evictedColumns).toEqual(['Region']);
    expect(stateOf(result.session, 'Revenue')).toBe('LOADING');
    expect(result.withinBudget).toBe(false);
    expect(result.overBudgetBytes).toBe(result.after.inProgressBytes);
  });

  it('breaks ties between equal-sized columns by name, deterministically', () => {
    const tie = loaded(['LastPurchaseDate', 'CustomerID']); // both 1,394 B
    const result = applyMemoryPressure(tie, 1400, 'LARGEST_FIRST');
    expect(result.evictedColumns).toEqual(['CustomerID']);
  });

  it('states the simplified policy and that it is not a Fabric setting, in the log', () => {
    const result = applyMemoryPressure(loaded(THREE), 3000);
    const intro = result.session.events.find((e) => e.type === 'MEMORY_PRESSURE')?.message ?? '';
    expect(intro).toMatch(/illustrative budget of 3,000 B/);
    expect(intro).toMatch(/largest column first/);
    expect(intro).toMatch(/simulation settings, not Fabric behaviour/);
  });
});

describe('scenarios', () => {
  it('walks the demonstrations with exact figures', () => {
    let session = createLoadingSession();

    let outcome = applyMemoryDemo(session, 'LOAD_THREE');
    session = outcome.session;
    expect(snapshotMemory(session).totalBytes).toBe(4463);

    outcome = applyMemoryDemo(session, 'EVICT_REVENUE');
    session = outcome.session;
    expect(outcome.eviction?.before.totalBytes).toBe(4463);
    expect(outcome.eviction?.after.totalBytes).toBe(1943);

    outcome = applyMemoryDemo(session, 'REQUERY_REVENUE');
    session = outcome.session;
    expect(outcome.queryResult?.columnsLoadedByQuery).toEqual(['Revenue']);
    expect(outcome.queryResult?.columnsReused).toEqual(['CustomerID']);
    expect(snapshotMemory(session).totalBytes).toBe(4463);

    outcome = applyMemoryDemo(session, 'PRESSURE_PROTECT_ID', { budgetBytes: 3000 });
    session = outcome.session;
    expect(outcome.eviction?.evictedColumns).toEqual(['Revenue']);
    expect(snapshotMemory(session).totalBytes).toBe(1943);

    outcome = applyMemoryDemo(session, 'REFRESH_ALL');
    session = outcome.session;
    expect(outcome.eviction?.evictedColumns).toEqual(['CustomerID', 'Region']);
    expect(snapshotMemory(session).totalBytes).toBe(0);
  });

  it('lists five demonstrations covering load, evict, query, pressure and refresh', () => {
    expect(MEMORY_DEMOS.map((d) => d.kind)).toEqual(['LOAD', 'EVICT', 'QUERY', 'PRESSURE', 'REFRESH']);
  });

  it('uses the default illustrative budget when none is given', () => {
    const outcome = applyMemoryDemo(loaded(THREE), 'PRESSURE_PROTECT_ID');
    const message = outcome.session.events.find((e) => e.type === 'MEMORY_PRESSURE')?.message ?? '';
    expect(message).toMatch(new RegExp(`illustrative budget of ${DEFAULT_ILLUSTRATIVE_BUDGET_BYTES.toLocaleString('en-US')} B`));
  });

  it('refresh scenario documents that it is a simplification', () => {
    const result = evictAllResident(loaded(THREE));
    expect(result.reason).toBe('REFRESH_SCENARIO');
    expect(result.session.events.slice(-1)[0].message).toMatch(/refresh scenario/);
  });
});

describe('explanations and sources', () => {
  it('explains an eviction in words, including that data stays in storage', () => {
    const lines = explainEviction(evictColumns(loaded(THREE), ['Revenue']));
    expect(lines[0]).toMatch(/Evicted \(user action\): Revenue\. Simulated memory fell from 4,463 B to 1,943 B, releasing 2,520 B/);
    expect(lines.join(' ')).toMatch(/data stays in storage/);
  });

  it('explains a no-op eviction and skipped columns', () => {
    const lines = explainEviction(evictColumns(createLoadingSession(), ['Region']));
    expect(lines).toContain('Nothing was evicted, so memory is unchanged.');
    expect(lines.join(' ')).toMatch(/Region was skipped: it is not resident/);
  });

  it('cites Microsoft Learn pages', () => {
    const urls = getMemorySourceReferences().map((s) => s.url);
    expect(urls).toContain('https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-how-it-works');
    expect(urls.every((u) => u.startsWith('https://learn.microsoft.com/'))).toBe(true);
  });
});

describe('determinism', () => {
  it('produces identical results across runs without using Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const run = (): unknown => {
      const pressure = applyMemoryPressure(loaded(THREE), 3000, 'EARLIEST_LOADED_FIRST', ['CustomerID']);
      const back = executeQuery(pressure.session, ['Revenue', 'Region']);
      return { pressure, back, history: columnHistory(back.session) };
    };
    expect(run()).toEqual(run());
    expect(random).not.toHaveBeenCalled();
  });

  it('never produces NaN, Infinity or negative memory over a sweep of budgets and settings', () => {
    for (const rowCount of [0, 1, 250, 5000]) {
      for (const nullPercent of [0, 50, 100]) {
        const base = loaded(['CustomerID', 'Revenue', 'Region', 'CustomerName'], settings({ rowCount, nullPercent }));
        for (const budget of [0, 1, 500, 4000, 100000]) {
          for (const order of ['LARGEST_FIRST', 'EARLIEST_LOADED_FIRST'] as const) {
            const r = applyMemoryPressure(base, budget, order);
            for (const n of [r.before.totalBytes, r.after.totalBytes, r.freedBytes, r.overBudgetBytes]) {
              expect(Number.isFinite(n) && n >= 0).toBe(true);
            }
            expect(r.before.totalBytes - r.freedBytes).toBe(r.after.totalBytes);
            expect(r.after.totalBytes <= budget || !r.withinBudget).toBe(true);
          }
        }
      }
    }
  });
});
