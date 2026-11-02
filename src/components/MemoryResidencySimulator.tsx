import React, { useMemo, useState } from 'react';
import { CompressionEncodingModel, EvictionResult, ExplanationMode, LoadingSession, LoadingSettings, MemoryPressureOrder, QueryLoadResult } from '../types';
import {
  createLoadingSession,
  DEFAULT_LOADING_SETTINGS,
  executeQuery,
  explainQueryPlan,
  finishLoading,
  planQuery,
  requestLoad,
} from '../data/stage6-loading-simulator';
import {
  applyMemoryDemo,
  applyMemoryPressure,
  budgetStatus,
  columnHistory,
  compareMemory,
  DEFAULT_ILLUSTRATIVE_BUDGET_BYTES,
  evictColumns,
  explainEviction,
  getMemorySourceReferences,
  MEMORY_DEMOS,
  MEMORY_PRESSURE_ORDER_LABELS,
  snapshotMemory,
} from '../data/stage6-memory-simulator';
import './DictionaryEncodingExplorer.css';
import './MemoryResidencySimulator.css';

interface MemoryResidencySimulatorProps {
  explanationMode: ExplanationMode;
}

interface Comparison {
  label: string;
  before: LoadingSession;
  after: LoadingSession;
}

const NULL_PERCENT_OPTIONS = [0, 5, 10, 25, 50, 100];
const DEFAULT_QUERY_COLUMNS = ['CustomerID', 'Revenue'];

const fmt = (n: number): string => n.toLocaleString('en-US');
const bytes = (n: number): string => `${fmt(n)} B`;
const signedBytes = (n: number): string => (n > 0 ? `+${fmt(n)} B` : n < 0 ? `-${fmt(-n)} B` : '0 B');

const STATE_TEXT: Record<string, string> = { UNLOADED: '○ Not resident', LOADING: '◔ Loading', LOADED: '● Resident' };
const STATE_CLASS: Record<string, string> = {
  UNLOADED: 'memory-badge-absent',
  LOADING: 'memory-badge-loading',
  LOADED: 'memory-badge-resident',
};
const CHANGE_TEXT: Record<string, string> = { EVICTED: 'Evicted', LOADED: 'Loaded', UNCHANGED: 'Unchanged' };
const STATUS_LABEL: Record<string, string> = {
  ALREADY_RESIDENT: 'Already available (resident)',
  LOADING_IN_PROGRESS: 'Still loading, query waits',
  NEEDS_LOADING: 'Needs loading',
};

const EXPLANATIONS: Record<ExplanationMode, string[]> = {
  beginner: [
    'Once a column has been loaded it stays in memory so later queries can reuse it. Memory is not unlimited, though, so a column can later be removed. Removing it is called eviction.',
    'Try it: load a few columns, then evict one and watch the memory total fall. The data is not gone, it is still in storage. If a later query needs that column, it has to be loaded again.',
    'Every size, budget and scenario here is a teaching tool. This page does not decide by itself what to evict, and it is not how Fabric manages memory.',
  ],
  intermediate: [
    'A column is resident when it is in memory. Evicting it releases its memory and makes it non-resident. A query that needs it afterwards loads the whole column again, which you can see in the event log and in the before and after tables.',
    'Microsoft documents three kinds of reason a column may be evicted: a refresh after the underlying data changed, no query using the column for some time, and memory pressure. Here you trigger each yourself through a labelled scenario, and all of them have the same effect: the column becomes non-resident.',
    'The memory-pressure scenario uses a budget you choose and a simple ordering that the page states. Neither is a Fabric setting. If every remaining column is protected or still loading, the scenario reports that memory is still over budget.',
  ],
  advanced: [
    '[DOCUMENTED] Microsoft Learn (How Direct Lake works): a column loaded into memory is resident and remains resident until there is reason to evict it. Reasons include framing after the underlying data changed, no query using the column for some time, and other memory management reasons, including memory pressure in the capacity from concurrent operations. The Fabric SKU determines the maximum memory available to a Direct Lake semantic model.',
    '[DOCUMENTED] When framing occurs, the process might evict resident column segments and dictionaries if the underlying data changed. Incremental framing drops only the affected segments, and dictionaries usually are not dropped.',
    '[SIMPLIFIED MODEL] A column is resident or not, as a whole, and its memory is the Module 5 estimate from the Module 6 session. Evicting releases that amount and nothing else. Segments and dictionaries are not evicted separately.',
    '[SIMULATION] Every eviction is triggered by you. The refresh scenario evicts every resident column, which assumes every column was affected. The memory-pressure scenario evicts resident, unprotected columns, one at a time in the order you choose, until memory fits the budget you choose.',
    '[PROPRIETARY INTERNAL] The real memory limits, eviction thresholds and algorithm, eviction priority and timing are not published. This page does not model them and does not claim to reproduce Fabric memory management.',
  ],
};

const MemoryResidencySimulator: React.FC<MemoryResidencySimulatorProps> = ({ explanationMode }) => {
  const [settings, setSettings] = useState<LoadingSettings>(DEFAULT_LOADING_SETTINGS);
  const [session, setSession] = useState<LoadingSession>(() => createLoadingSession(DEFAULT_LOADING_SETTINGS));
  const [selection, setSelection] = useState<string[]>([]);
  const [protectedColumns, setProtectedColumns] = useState<string[]>([]);
  const [queryColumns, setQueryColumns] = useState<string[]>(DEFAULT_QUERY_COLUMNS);
  const [budgetText, setBudgetText] = useState<string>(String(DEFAULT_ILLUSTRATIVE_BUDGET_BYTES));
  const [order, setOrder] = useState<MemoryPressureOrder>('LARGEST_FIRST');
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [lastEviction, setLastEviction] = useState<EvictionResult | null>(null);
  const [lastQuery, setLastQuery] = useState<QueryLoadResult | null>(null);
  const [notice, setNotice] = useState<string>('');

  const snapshot = useMemo(() => snapshotMemory(session), [session]);
  const history = useMemo(() => columnHistory(session), [session]);
  const queryPlan = useMemo(() => (queryColumns.length > 0 ? planQuery(session, queryColumns) : null), [session, queryColumns]);
  const planLines = useMemo(() => (queryPlan ? explainQueryPlan(queryPlan) : []), [queryPlan]);
  const rows = useMemo(() => (comparison ? compareMemory(comparison.before, comparison.after) : []), [comparison]);

  const parsedBudget = budgetText.trim() === '' ? NaN : Number(budgetText);
  const budgetValid = Number.isInteger(parsedBudget) && parsedBudget >= 0;
  const status = useMemo(() => (budgetValid ? budgetStatus(session, parsedBudget) : null), [session, budgetValid, parsedBudget]);

  const names = session.columns.map((column) => column.profile.columnName);
  const allEmpty = session.columns.every((column) => column.profile.rowCount === 0);
  const fullSet = session.columns.reduce((sum, column) => sum + column.profile.memoryBytes, 0);

  const toggle = (list: string[], name: string): string[] => (list.includes(name) ? list.filter((entry) => entry !== name) : [...list, name]);

  const guarded = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That action is not valid.');
    }
  };

  const commit = (label: string, next: LoadingSession, eviction: EvictionResult | null, query: QueryLoadResult | null): void => {
    setComparison({ label, before: session, after: next });
    setSession(next);
    setLastEviction(eviction);
    setLastQuery(query);
    setNotice('');
  };

  const fresh = (next: LoadingSettings, message: string): void => {
    setSettings(next);
    setSession(createLoadingSession(next));
    setComparison(null);
    setLastEviction(null);
    setLastQuery(null);
    setNotice(message);
  };

  const updateSettings = (changes: Partial<LoadingSettings>): void =>
    fresh({ ...settings, ...changes }, 'Settings changed, so the simulation was reset and every column is non-resident again.');

  const reset = (): void => {
    fresh(DEFAULT_LOADING_SETTINGS, 'Simulation reset to its defaults.');
    setSelection([]);
    setProtectedColumns([]);
    setQueryColumns(DEFAULT_QUERY_COLUMNS);
    setBudgetText(String(DEFAULT_ILLUSTRATIVE_BUDGET_BYTES));
    setOrder('LARGEST_FIRST');
  };

  const loadSelected = (): void => guarded(() => commit('Load selected columns', finishLoading(requestLoad(session, selection)), null, null));
  const evictSelected = (reason: 'USER_ACTION' | 'UNUSED_SCENARIO'): void =>
    guarded(() => {
      const result = evictColumns(session, selection, reason);
      commit(reason === 'USER_ACTION' ? 'Evict selected columns' : 'Unused-column scenario', result.session, result, null);
    });
  const applyPressure = (): void =>
    guarded(() => {
      const result = applyMemoryPressure(session, parsedBudget, order, protectedColumns);
      commit('Memory-pressure scenario', result.session, result, null);
    });
  const runQuery = (): void =>
    guarded(() => {
      const result = executeQuery(session, queryColumns);
      commit('Run simulated query', result.session, null, result);
    });
  const runDemo = (demoId: string, label: string): void =>
    guarded(() => {
      const outcome = applyMemoryDemo(session, demoId, { budgetBytes: budgetValid ? parsedBudget : undefined, order });
      commit(label, outcome.session, outcome.eviction, outcome.queryResult);
    });

  const meterPercent = status && status.usedPercentOfBudget !== null ? Math.min(100, status.usedPercentOfBudget) : status && status.usedBytes > 0 ? 100 : 0;
  const explanation = lastEviction ? explainEviction(lastEviction) : [];

  return (
    <div className="dictionary-explorer memory-explorer">
      <div className="explorer-header">
        <h2>Memory Residency and Eviction Simulator</h2>
        <p className="explorer-description">
          Load columns of the synthetic Customer table, evict them yourself, and see how memory changes and what a later query
          has to load again
        </p>
      </div>

      <div className="explanation-panel">
        <h3>Explanation ({explanationMode})</h3>
        {EXPLANATIONS[explanationMode].map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="memory-facts" aria-label="What is documented and what is simulated">
        <h3>What is documented and what is simulated</h3>
        <dl>
          <dt>[DOCUMENTED]</dt>
          <dd>
            Columns loaded into memory are resident until there is a reason to evict them: a refresh (framing) after the
            underlying data changed, no query using the column for some time, or memory pressure. A later query that needs
            an evicted column loads it again. The Fabric SKU sets the maximum memory for a semantic model.
          </dd>
          <dt>[SIMULATION]</dt>
          <dd>Every eviction here is triggered by you or by a labelled scenario. Nothing is evicted automatically.</dd>
          <dt>[SIMPLIFIED MODEL]</dt>
          <dd>
            Whole-column residency, column memory equal to the Module 5 estimate, and an illustrative budget and ordering
            that you choose.
          </dd>
          <dt>[PROPRIETARY INTERNAL]</dt>
          <dd>Real memory limits, eviction thresholds, algorithm, priority and timing. Not published, not modelled.</dd>
        </dl>
      </div>

      <div className="controls-section">
        <div className="memory-controls-head">
          <h4 className="memory-controls-title">Data and sizing</h4>
          <button type="button" className="memory-button memory-button-secondary" onClick={reset}>
            Reset simulation
          </button>
        </div>
        <div className="memory-controls">
          <div className="control-group">
            <label htmlFor="memory-rows-slider">Row count: {fmt(settings.rowCount)}</label>
            <input
              id="memory-rows-slider"
              type="range"
              min="0"
              max="5000"
              step="100"
              value={settings.rowCount}
              onChange={(e) => updateSettings({ rowCount: parseInt(e.target.value, 10) })}
            />
          </div>
          <div className="control-group">
            <label htmlFor="memory-segment-slider">Rows per segment: {fmt(settings.segmentRowCount)} (educational assumption)</label>
            <input
              id="memory-segment-slider"
              type="range"
              min="50"
              max="2000"
              step="50"
              value={settings.segmentRowCount}
              onChange={(e) => updateSettings({ segmentRowCount: parseInt(e.target.value, 10) })}
            />
          </div>
          <div className="control-group">
            <label htmlFor="memory-null-select">Null share (approximate)</label>
            <select
              id="memory-null-select"
              className="memory-select"
              value={settings.nullPercent}
              onChange={(e) => updateSettings({ nullPercent: parseInt(e.target.value, 10) })}
            >
              {NULL_PERCENT_OPTIONS.map((percent) => (
                <option key={percent} value={percent}>
                  {percent}%
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="memory-encoding-select">Numeric and date representation</label>
            <select
              id="memory-encoding-select"
              className="memory-select"
              value={settings.numericEncoding}
              onChange={(e) => updateSettings({ numericEncoding: e.target.value as CompressionEncodingModel })}
            >
              <option value="VALUE">Value (offset from the minimum)</option>
              <option value="DICTIONARY">Dictionary (each distinct value once)</option>
            </select>
          </div>
        </div>
        <p className="memory-note">
          Column sizes come from the Module 5 estimate through the Module 6 loading session. Changing a setting resets the
          simulation.
        </p>
      </div>

      <div className="results-section">
        <div className="memory-section">
          <h3>Resident and non-resident columns</h3>
          <div className="memory-groups" aria-live="polite">
            <p>
              <strong>Resident:</strong> {snapshot.residentColumns.length > 0 ? snapshot.residentColumns.join(', ') : 'none'}
            </p>
            <p>
              <strong>Not resident:</strong> {snapshot.nonResidentColumns.length > 0 ? snapshot.nonResidentColumns.join(', ') : 'none'}
            </p>
          </div>
          <div className="memory-table-scroll" tabIndex={0} role="region" aria-label="Customer columns and their residency">
            <table className="memory-table">
              <caption>
                Sizes are Module 5 simulated estimates. Memory is counted once per column, only while it is resident or loading.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Select</th>
                  <th scope="col">Column</th>
                  <th scope="col">Data type</th>
                  <th scope="col">Estimated size</th>
                  <th scope="col">Residency</th>
                  <th scope="col">Memory occupied now</th>
                  <th scope="col">Evicted / reloaded</th>
                </tr>
              </thead>
              <tbody>
                {session.columns.map((column) => {
                  const name = column.profile.columnName;
                  const h = history.find((entry) => entry.columnName === name);
                  return (
                    <tr key={name}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${name}`}
                          checked={selection.includes(name)}
                          onChange={() => setSelection((current) => toggle(current, name))}
                        />
                      </td>
                      <th scope="row">{name}</th>
                      <td>{column.profile.dataType}</td>
                      <td>{bytes(column.profile.memoryBytes)}</td>
                      <td>
                        <span className={`memory-badge ${STATE_CLASS[column.state]}`}>{STATE_TEXT[column.state]}</span>
                      </td>
                      <td>{bytes(column.residentBytes)}</td>
                      <td>
                        {h?.timesEvicted ?? 0} / {h?.reloadsAfterEviction ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="memory-actions">
            <button type="button" className="memory-button" disabled={selection.length === 0} onClick={loadSelected}>
              Load selected
            </button>
            <button type="button" className="memory-button" disabled={selection.length === 0} onClick={() => evictSelected('USER_ACTION')}>
              Evict selected
            </button>
            <button
              type="button"
              className="memory-button memory-button-secondary"
              disabled={selection.length === 0}
              onClick={() => evictSelected('UNUSED_SCENARIO')}
            >
              Evict selected as an unused-column scenario
            </button>
            <button type="button" className="memory-button memory-button-secondary" onClick={() => setSelection(names)}>
              Select all
            </button>
            <button type="button" className="memory-button memory-button-secondary" onClick={() => setSelection([])}>
              Select none
            </button>
          </div>
          {selection.length === 0 && <p className="memory-note">Select at least one column to enable loading and eviction.</p>}
          {allEmpty && <p className="memory-empty">There are no rows, so every column is empty: it occupies 0 B, and evicting it releases nothing.</p>}
          {notice && (
            <p className="memory-notice" role="status">
              {notice}
            </p>
          )}
        </div>

        <div className="memory-section">
          <h3>Memory occupied</h3>
          <div className="metrics-grid" aria-live="polite">
            <div className="metric-card">
              <div className="metric-label">Resident Columns</div>
              <div className="metric-value">
                {snapshot.residentColumns.length} of {session.columns.length}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Resident Memory</div>
              <div className="metric-value">{bytes(snapshot.residentBytes)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total Simulated Memory</div>
              <div className="metric-value">{bytes(snapshot.totalBytes)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">All Columns Together</div>
              <div className="metric-value">{bytes(fullSet)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Simulated Steps</div>
              <div className="metric-value">{fmt(session.tick)}</div>
            </div>
          </div>
        </div>

        <div className="memory-section">
          <h3>Illustrative memory budget</h3>
          <p className="memory-note">
            <strong>[SIMULATION] This budget is a setting of this simulator, not a Fabric limit or setting.</strong> Choose any
            value to see how the scenario below behaves.
          </p>
          <div className="memory-controls">
            <div className="control-group">
              <label htmlFor="memory-budget-input">Illustrative memory budget (bytes)</label>
              <input
                id="memory-budget-input"
                className="memory-input"
                type="number"
                min="0"
                step="1"
                value={budgetText}
                aria-invalid={!budgetValid}
                onChange={(e) => setBudgetText(e.target.value)}
              />
            </div>
            <div className="control-group">
              <label htmlFor="memory-order-select">Eviction order used by the scenario</label>
              <select id="memory-order-select" className="memory-select" value={order} onChange={(e) => setOrder(e.target.value as MemoryPressureOrder)}>
                {(Object.keys(MEMORY_PRESSURE_ORDER_LABELS) as MemoryPressureOrder[]).map((key) => (
                  <option key={key} value={key}>
                    {MEMORY_PRESSURE_ORDER_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!budgetValid && (
            <p className="memory-notice" role="alert">
              Enter a whole number of bytes, 0 or more.
            </p>
          )}
          {status && (
            <p className="memory-budget-status" aria-live="polite">
              {status.withinBudget ? 'Within the illustrative budget' : 'Over the illustrative budget'}: {bytes(status.usedBytes)} used of{' '}
              {bytes(status.budgetBytes)}
              {status.withinBudget ? `, headroom ${bytes(status.headroomBytes)}` : `, over by ${bytes(status.overBudgetBytes)}`}
              {status.usedPercentOfBudget !== null ? ` (${status.usedPercentOfBudget.toFixed(1)}% of the budget)` : ''}.
            </p>
          )}
          {status && (
            <div
              className="memory-meter"
              role="meter"
              aria-label="Simulated memory as a share of the illustrative budget"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(meterPercent)}
            >
              <span className={status.withinBudget ? 'memory-meter-fill' : 'memory-meter-fill memory-meter-over'} style={{ width: `${meterPercent}%` }} />
            </div>
          )}
          <fieldset className="memory-fieldset">
            <legend>Columns the scenario must not evict</legend>
            {names.map((name) => (
              <label key={name} className="memory-check">
                <input type="checkbox" checked={protectedColumns.includes(name)} onChange={() => setProtectedColumns((current) => toggle(current, name))} /> {name}
              </label>
            ))}
          </fieldset>
          <p className="memory-note">
            [SIMPLIFIED MODEL] Policy of this scenario: if simulated memory is above the budget, evict resident, unprotected
            columns one at a time in the chosen order until it fits or none is left. It is not Microsoft's policy.
          </p>
          <div className="memory-actions">
            <button type="button" className="memory-button" disabled={!budgetValid} onClick={applyPressure}>
              Apply memory-pressure scenario
            </button>
            <button
              type="button"
              className="memory-button memory-button-secondary"
              onClick={() =>
                guarded(() => {
                  const outcome = applyMemoryDemo(session, 'REFRESH_ALL');
                  commit('Refresh scenario', outcome.session, outcome.eviction, null);
                })
              }
            >
              Refresh scenario: evict every resident column
            </button>
          </div>
        </div>

        <div className="memory-section">
          <h3>Before and after</h3>
          {comparison ? (
            <div aria-live="polite">
              <p className="memory-summary">
                <strong>{comparison.label}:</strong> memory before {bytes(snapshotMemory(comparison.before).totalBytes)}, after{' '}
                {bytes(snapshotMemory(comparison.after).totalBytes)} (change{' '}
                {signedBytes(snapshotMemory(comparison.after).totalBytes - snapshotMemory(comparison.before).totalBytes)}).
              </p>
              <div className="memory-table-scroll" tabIndex={0} role="region" aria-label="Before and after comparison">
                <table className="memory-table">
                  <caption>Per-column memory before and after the last action</caption>
                  <thead>
                    <tr>
                      <th scope="col">Column</th>
                      <th scope="col">Before</th>
                      <th scope="col">After</th>
                      <th scope="col">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.columnName}>
                        <th scope="row">{row.columnName}</th>
                        <td>
                          {STATE_TEXT[row.stateBefore]}, {bytes(row.bytesBefore)}
                        </td>
                        <td>
                          {STATE_TEXT[row.stateAfter]}, {bytes(row.bytesAfter)}
                        </td>
                        <td>{CHANGE_TEXT[row.change]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {explanation.length > 0 && (
                <ul className="memory-plan">
                  {explanation.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="memory-note">Load, evict or run a query to compare memory before and after.</p>
          )}
        </div>

        <div className="memory-section">
          <h3>Simulated query</h3>
          <fieldset className="memory-fieldset">
            <legend>Columns the query needs</legend>
            {names.map((name) => (
              <label key={name} className="memory-check">
                <input type="checkbox" checked={queryColumns.includes(name)} onChange={() => setQueryColumns((current) => toggle(current, name))} /> {name}
              </label>
            ))}
          </fieldset>
          {queryPlan ? (
            <div className="memory-table-scroll" tabIndex={0} role="region" aria-label="Query column plan">
              <table className="memory-table">
                <caption>What this query would cause, given the current residency</caption>
                <thead>
                  <tr>
                    <th scope="col">Column</th>
                    <th scope="col">Availability</th>
                    <th scope="col">Memory if loaded</th>
                    <th scope="col">Steps to load</th>
                  </tr>
                </thead>
                <tbody>
                  {queryPlan.entries.map((entry) => {
                    const evictedBefore = (history.find((h) => h.columnName === entry.columnName)?.timesEvicted ?? 0) > 0;
                    return (
                      <tr key={entry.columnName}>
                        <th scope="row">{entry.columnName}</th>
                        <td>
                          {STATUS_LABEL[entry.status]}
                          {entry.status === 'NEEDS_LOADING' && evictedBefore ? ' (was evicted earlier)' : ''}
                        </td>
                        <td>{bytes(entry.memoryBytes)}</td>
                        <td>{entry.status === 'ALREADY_RESIDENT' ? '0' : fmt(entry.loadTicks)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="memory-note">Select at least one column for the query.</p>
          )}
          {planLines.length > 0 && (
            <ul className="memory-plan">
              {planLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <div className="memory-actions">
            <button type="button" className="memory-button" disabled={queryColumns.length === 0} onClick={runQuery}>
              Run simulated query
            </button>
          </div>
          {lastQuery && (
            <div className="memory-result" role="status">
              <h4>Last query result</h4>
              <ul>
                <li>
                  <strong>Reused (already resident):</strong> {lastQuery.columnsReused.length > 0 ? lastQuery.columnsReused.join(', ') : 'none'}
                </li>
                <li>
                  <strong>Loaded by this query:</strong> {lastQuery.columnsLoadedByQuery.length > 0 ? lastQuery.columnsLoadedByQuery.join(', ') : 'none'}
                </li>
                <li>
                  <strong>Simulated steps spent loading:</strong> {fmt(lastQuery.ticksElapsed)}
                </li>
                <li>
                  <strong>Simulated memory:</strong> {bytes(lastQuery.memoryBeforeBytes)} before, {bytes(lastQuery.memoryAfterBytes)} after
                </li>
              </ul>
              <p className="memory-note">This shows column loading only. Running the query itself is not simulated here.</p>
            </div>
          )}
        </div>

        <div className="memory-section">
          <h3>Demonstrations</h3>
          <p className="memory-note">
            Run these in order from a fresh simulation. Each button acts on the current state. The memory-pressure step uses
            the budget and order chosen above.
          </p>
          <div className="memory-actions">
            {MEMORY_DEMOS.map((demo, index) => (
              <button
                key={demo.id}
                type="button"
                className="memory-button memory-button-secondary"
                onClick={() => runDemo(demo.id, demo.label)}
              >
                {index + 1}. {demo.label}
              </button>
            ))}
          </div>
        </div>

        <div className="memory-section">
          <h3>Event history</h3>
          <ol className="memory-log" role="log" aria-live="polite" aria-label="Simulation event history" tabIndex={0}>
            {session.events.length === 0 ? (
              <li className="memory-log-empty">Nothing has happened yet.</li>
            ) : (
              session.events.map((event) => (
                <li key={event.sequence}>
                  <span className="memory-log-tick">step {event.tick}</span> {event.message}
                </li>
              ))
            )}
          </ol>
        </div>
      </div>

      <div className="concepts-panel">
        <h3>Key Concepts</h3>
        <ul>
          <li>
            <strong>Resident:</strong> a column that is in memory. <strong>[DOCUMENTED]</strong> It stays resident until there
            is reason to evict it.
          </li>
          <li>
            <strong>Eviction:</strong> removing a column from memory. The data stays in storage, so a later query that needs
            it loads the whole column again.
          </li>
          <li>
            <strong>Why a column may be evicted:</strong> <strong>[DOCUMENTED]</strong> a refresh after the underlying data
            changed, no query using it for some time, or memory pressure, including pressure from other concurrent
            operations.
          </li>
          <li>
            <strong>Memory limits:</strong> <strong>[DOCUMENTED]</strong> The Fabric SKU determines the maximum memory for a
            Direct Lake semantic model. This page uses no real limit; its budget is your own illustrative number.
          </li>
          <li>
            <strong>Retaining a column:</strong> protecting a column in the scenario shows the effect of keeping it
            resident while others are evicted. It is a feature of this simulator.
          </li>
          <li>
            <strong>[SIMPLIFIED MODEL]</strong> Whole-column residency, with memory equal to the Module 5 estimate.
          </li>
          <li>
            <strong>[SIMULATION]</strong> Every eviction, the budget, the ordering, the steps and every size shown.
          </li>
          <li>
            <strong>[PROPRIETARY INTERNAL]</strong> The real limits, thresholds, algorithm, priority and timing of eviction.
          </li>
        </ul>
      </div>

      <div className="concepts-panel memory-examples">
        <h3>Practical Examples</h3>
        <p className="memory-example-intro">
          At 1,000 rows, 500 rows per segment, no nulls and the Value representation (this model's estimates):
        </p>
        <ul>
          <li>
            <strong>Load CustomerID, Revenue and Region:</strong> 4,463 B resident (1,394 + 2,520 + 549).
          </li>
          <li>
            <strong>Evict Revenue:</strong> memory falls from 4,463 B to 1,943 B, releasing 2,520 B.
          </li>
          <li>
            <strong>Then query CustomerID and Revenue:</strong> CustomerID is reused, Revenue loads again in 5 steps, and
            memory returns to 4,463 B.
          </li>
          <li>
            <strong>Memory pressure, budget 3,000 B, largest first, CustomerID protected:</strong> Revenue is evicted and
            memory fits at 1,943 B.
          </li>
          <li>
            <strong>Same budget, earliest loaded first:</strong> Region (loaded first) and then Revenue are evicted,
            leaving 1,394 B. The order you choose changes the outcome.
          </li>
          <li>
            <strong>Budget 1,000 B with CustomerID protected:</strong> Revenue and Region are evicted, but CustomerID alone
            is 1,394 B, so memory stays 394 B over the budget.
          </li>
        </ul>
      </div>

      <div className="limitations-panel">
        <h3>Limitations & Assumptions</h3>
        <p>
          <strong>[SIMULATION]</strong> This module:
        </p>
        <ul>
          <li>Is an educational model. It does not reproduce Fabric memory management and makes no claim about when or why the engine evicts a column.</li>
          <li>Evicts only when you act. It never decides on its own, and does not model a least-recently-used or any other real policy.</li>
          <li>Uses an illustrative budget and ordering chosen by you. Neither is a Fabric setting, limit or threshold.</li>
          <li>Treats a column as wholly resident or not. It does not evict segments or dictionaries separately, and its refresh scenario assumes every resident column was affected.</li>
          <li>Does not model real framing, the passage of time, concurrent operations, other semantic models or capacity memory.</li>
          <li>Loads finish within one action here (step-by-step loading is Module 6), so no column is ever caught part-way through loading.</li>
          <li>Models column loading only; scanning, filtering and aggregating are not simulated.</li>
        </ul>
      </div>

      <div className="memory-sources">
        <h3>Sources</h3>
        <ul>
          {getMemorySourceReferences().map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.title}
              </a>
              {source.section ? ` - ${source.section}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default MemoryResidencySimulator;
