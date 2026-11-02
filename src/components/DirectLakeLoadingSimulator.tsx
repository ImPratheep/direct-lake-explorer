import React, { useMemo, useState } from 'react';
import { CompressionEncodingModel, ExplanationMode, LoadingColumnState, LoadingSession, LoadingSettings, QueryLoadResult } from '../types';
import {
  advanceSession,
  applyLoadingDemo,
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
} from '../data/stage6-loading-simulator';
import './DictionaryEncodingExplorer.css';
import './DirectLakeLoadingSimulator.css';
import { representativeLoadingStart } from '../review/reviewFixtures';

interface DirectLakeLoadingSimulatorProps {
  explanationMode: ExplanationMode;
  /** UI Review Mode: open with CustomerID loaded and a CustomerID + Revenue query already run. */
  startRepresentative?: boolean;
}

const NULL_PERCENT_OPTIONS = [0, 5, 10, 25, 50, 100];
const DEFAULT_QUERY_COLUMNS = ['CustomerID', 'Revenue'];

const fmt = (n: number): string => n.toLocaleString('en-US');
const bytes = (n: number): string => `${fmt(n)} B`;

const STATE_SYMBOL: Record<string, string> = { UNLOADED: '○', LOADING: '◔', LOADED: '●' };
const STATE_CLASS: Record<string, string> = {
  UNLOADED: 'loading-badge-unloaded',
  LOADING: 'loading-badge-loading',
  LOADED: 'loading-badge-loaded',
};
const STATUS_LABEL: Record<string, string> = {
  ALREADY_RESIDENT: 'Already available (resident)',
  LOADING_IN_PROGRESS: 'Still loading, query waits',
  NEEDS_LOADING: 'Needs loading',
};

const EXPLANATIONS: Record<ExplanationMode, string[]> = {
  beginner: [
    'Direct Lake does not copy your whole model into memory up front. A column is brought into memory when a query needs it for the first time, and it then stays in memory so the next query can reuse it.',
    'Try it: load CustomerID, then run a query that needs CustomerID and Revenue. CustomerID is already available, so only Revenue has to be loaded.',
    'The sizes and the number of steps here are teaching estimates, not measurements of Fabric.',
  ],
  intermediate: [
    'A query is turned into a list of columns. Columns already in memory are reused. For each missing column, all of its data is loaded, and the query continues once they are available. Columns are loaded whole, not row by row.',
    'Loading a column is a different event from running the query. This module only models whether columns are resident. A column that is resident is available, which is not the same as the whole model being in memory.',
    'Memory is counted once per column. Requesting a column that is already resident or already loading changes nothing, so you can compare the memory total before and after.',
  ],
  advanced: [
    '[DOCUMENTED] Microsoft Learn (How Direct Lake works): data is loaded from OneLake when a query first needs a column (transcoding). The model works out the columns a query needs, including those required by relationships and measures, checks which are already in memory and loads all of the data for the others. Loaded columns are resident, and a later query that uses only resident columns loads nothing. Columns can be evicted, for example after a refresh, when unused for some time, or under memory pressure.',
    '[DOCUMENTED] Delta table data is stored as Parquet files in OneLake, and Parquet organizes data by column. A Direct Lake refresh (framing) copies only metadata. Direct Lake queries are processed by VertiPaq, as Import queries are.',
    '[SIMPLIFIED MODEL] Each column\'s memory is its Module 5 estimate. A column loads in ceil(bytes / 512) simulated steps, all loading columns advance together, and partial memory grows in proportion to progress. The Customer table has no relationships or measures, so a query needs exactly the columns you select.',
    '[SIMULATION] The data is synthetic and the whole run is deterministic: there are no timers and no randomness.',
    '[PROPRIETARY INTERNAL] The real loading sequence, how data is transformed, memory management, load times and memory use are not published. This module does not reproduce them.',
  ],
};

const DirectLakeLoadingSimulator: React.FC<DirectLakeLoadingSimulatorProps> = ({ explanationMode, startRepresentative = false }) => {
  const [start] = useState(() => (startRepresentative ? representativeLoadingStart() : null));
  const [settings, setSettings] = useState<LoadingSettings>(DEFAULT_LOADING_SETTINGS);
  const [session, setSession] = useState<LoadingSession>(() => start?.session ?? createLoadingSession(DEFAULT_LOADING_SETTINGS));
  const [loadSelection, setLoadSelection] = useState<string[]>([]);
  const [queryColumns, setQueryColumns] = useState<string[]>(start?.queryColumns ?? DEFAULT_QUERY_COLUMNS);
  const [lastQuery, setLastQuery] = useState<QueryLoadResult | null>(start?.lastQuery ?? null);
  const [activeStage, setActiveStage] = useState<string>('COLUMN_ACCESS');
  const [notice, setNotice] = useState<string>('');

  const memory = useMemo(() => summarizeMemory(session), [session]);
  const queryPlan = useMemo(() => (queryColumns.length > 0 ? planQuery(session, queryColumns) : null), [session, queryColumns]);
  const planLines = useMemo(() => (queryPlan ? explainQueryPlan(queryPlan) : []), [queryPlan]);
  const isLoading = memory.loadingColumns > 0;
  const stage = LOADING_FLOW_STAGES.find((entry) => entry.id === activeStage) ?? LOADING_FLOW_STAGES[0];

  const names = session.columns.map((column) => column.profile.columnName);
  const allEmpty = session.columns.every((column) => column.profile.rowCount === 0);

  const fresh = (next: LoadingSettings, message: string): void => {
    setSettings(next);
    setSession(createLoadingSession(next));
    setLastQuery(null);
    setNotice(message);
  };

  const updateSettings = (changes: Partial<LoadingSettings>): void =>
    fresh({ ...settings, ...changes }, 'Settings changed, so the simulation was reset and every column is unloaded again.');

  const reset = (): void => {
    fresh(DEFAULT_LOADING_SETTINGS, 'Simulation reset to its defaults.');
    setLoadSelection([]);
    setQueryColumns(DEFAULT_QUERY_COLUMNS);
    setActiveStage('COLUMN_ACCESS');
  };

  const toggle = (list: string[], name: string): string[] => (list.includes(name) ? list.filter((entry) => entry !== name) : [...list, name]);

  const guarded = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That action is not valid.');
    }
  };

  const loadSelected = (): void =>
    guarded(() => {
      setSession(requestLoad(session, loadSelection));
      setLastQuery(null);
      setNotice('');
    });

  const step = (): void => guarded(() => setSession(advanceSession(session, 1)));
  const finish = (): void => guarded(() => setSession(finishLoading(session)));

  const runQuery = (): void =>
    guarded(() => {
      const result = executeQuery(session, queryColumns);
      setSession(result.session);
      setLastQuery(result);
      setNotice('');
    });

  const runDemo = (demoId: string): void =>
    guarded(() => {
      const outcome = applyLoadingDemo(session, demoId);
      const demo = LOADING_DEMOS.find((entry) => entry.id === demoId);
      setSession(outcome.session);
      setLastQuery(outcome.queryResult);
      if (demo?.kind === 'QUERY') setQueryColumns(demo.columns);
      setNotice('');
    });

  const columnAt = (stageId: string): LoadingColumnState[] =>
    session.columns.filter((column) => {
      const fraction = column.profile.loadTicks > 0 ? column.progressTicks / column.profile.loadTicks : 1;
      return flowStageFor(column.state, fraction) === stageId;
    });

  return (
    <div className="dictionary-explorer loading-explorer">
      <div className="explorer-header">
        <h2>Direct Lake Column Loading Simulator</h2>
        <p className="explorer-description">
          Watch columns of the synthetic Customer table move from storage into memory as queries ask for them, and see
          which columns are already available and which need loading
        </p>
      </div>

      <div className="explanation-panel">
        <h3>Explanation ({explanationMode})</h3>
        {EXPLANATIONS[explanationMode].map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="controls-section">
        <div className="loading-controls-head">
          <h4 className="loading-controls-title">Data and sizing</h4>
          <button type="button" className="loading-button loading-button-secondary" onClick={reset}>
            Reset simulation
          </button>
        </div>
        <div className="loading-controls">
          <div className="control-group">
            <label htmlFor="loading-rows-slider">Row count: {fmt(settings.rowCount)}</label>
            <input
              id="loading-rows-slider"
              type="range"
              min="0"
              max="5000"
              step="100"
              value={settings.rowCount}
              onChange={(e) => updateSettings({ rowCount: parseInt(e.target.value, 10) })}
            />
          </div>
          <div className="control-group">
            <label htmlFor="loading-segment-slider">Rows per segment: {fmt(settings.segmentRowCount)} (educational assumption)</label>
            <input
              id="loading-segment-slider"
              type="range"
              min="50"
              max="2000"
              step="50"
              value={settings.segmentRowCount}
              onChange={(e) => updateSettings({ segmentRowCount: parseInt(e.target.value, 10) })}
            />
          </div>
          <div className="control-group">
            <label htmlFor="loading-null-select">Null share (approximate)</label>
            <select
              id="loading-null-select"
              className="loading-select"
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
            <label htmlFor="loading-encoding-select">Numeric and date representation</label>
            <select
              id="loading-encoding-select"
              className="loading-select"
              value={settings.numericEncoding}
              onChange={(e) => updateSettings({ numericEncoding: e.target.value as CompressionEncodingModel })}
            >
              <option value="VALUE">Value (offset from the minimum)</option>
              <option value="DICTIONARY">Dictionary (each distinct value once)</option>
            </select>
          </div>
        </div>
        <p className="loading-note">
          Column sizes come from the Module 5 estimate for each Customer column. Text columns always use the dictionary
          model. Changing a setting resets the simulation.
        </p>
      </div>

      <div className="results-section">
        <div className="loading-section">
          <h3>Conceptual flow</h3>
          <p className="loading-note">{LOADING_FLOW_DISCLAIMER}</p>
          <ol className="loading-flow" aria-label="Conceptual flow from OneLake to semantic model availability">
            {LOADING_FLOW_STAGES.map((entry, index) => {
              const here = columnAt(entry.id);
              return (
                <li key={entry.id} className="loading-flow-item">
                  <button
                    type="button"
                    className={`loading-flow-stage${activeStage === entry.id ? ' loading-flow-stage-active' : ''}`}
                    aria-pressed={activeStage === entry.id}
                    onClick={() => setActiveStage(entry.id)}
                  >
                    <span className="loading-flow-number">{index + 1}</span>
                    <span className="loading-flow-label">{entry.label}</span>
                    <span className="loading-flow-summary">{entry.summary}</span>
                  </button>
                  <ul className="loading-flow-columns" aria-label={`Columns at ${entry.label}`}>
                    {here.map((column) => (
                      <li key={column.profile.columnName} className={`loading-chip ${STATE_CLASS[column.state]}`}>
                        {STATE_SYMBOL[column.state]} {column.profile.columnName}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
          <div className="loading-stage-detail" aria-live="polite">
            <h4>
              {stage.label}
            </h4>
            {stage.details.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>

        <div className="loading-section">
          <h3>Columns</h3>
          <div className="loading-table-scroll" tabIndex={0} role="region" aria-label="Customer columns">
            <table className="loading-table">
              <caption>
                Sizes are Module 5 simulated estimates. Memory is counted once per column, however often it is requested.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Load</th>
                  <th scope="col">Column</th>
                  <th scope="col">Data type</th>
                  <th scope="col">Rows</th>
                  <th scope="col">Estimated storage</th>
                  <th scope="col">Loading state</th>
                  <th scope="col">Estimated memory consumption</th>
                </tr>
              </thead>
              <tbody>
                {session.columns.map((column) => {
                  const name = column.profile.columnName;
                  return (
                    <tr key={name}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${name} to load`}
                          checked={loadSelection.includes(name)}
                          onChange={() => setLoadSelection((current) => toggle(current, name))}
                        />
                      </td>
                      <th scope="row">{name}</th>
                      <td>{column.profile.dataType}</td>
                      <td>{fmt(column.profile.rowCount)}</td>
                      <td>{bytes(column.profile.memoryBytes)}</td>
                      <td>
                        <span className={`loading-badge ${STATE_CLASS[column.state]}`}>
                          {STATE_SYMBOL[column.state]} {describeColumnState(column)}
                        </span>
                        {column.profile.loadTicks > 0 && (
                          <progress
                            className="loading-progress"
                            aria-label={`${name} loading progress`}
                            max={column.profile.loadTicks}
                            value={column.progressTicks}
                          />
                        )}
                      </td>
                      <td>{bytes(column.residentBytes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="loading-actions">
            <button type="button" className="loading-button" disabled={loadSelection.length === 0} onClick={loadSelected}>
              Load selected
            </button>
            <button type="button" className="loading-button loading-button-secondary" onClick={() => setLoadSelection(names)}>
              Select all
            </button>
            <button type="button" className="loading-button loading-button-secondary" onClick={() => setLoadSelection([])}>
              Select none
            </button>
            <button type="button" className="loading-button loading-button-secondary" disabled={!isLoading} onClick={step}>
              Advance one step
            </button>
            <button type="button" className="loading-button loading-button-secondary" disabled={!isLoading} onClick={finish}>
              Finish loading
            </button>
          </div>
          {loadSelection.length === 0 && <p className="loading-note">Select at least one column to enable loading.</p>}
          {allEmpty && <p className="loading-empty">There are no rows, so every column is empty: loading is instant and uses 0 B.</p>}
          {notice && (
            <p className="loading-notice" role="status">
              {notice}
            </p>
          )}
        </div>

        <div className="loading-section">
          <h3>Simulated memory</h3>
          <div className="metrics-grid" aria-live="polite">
            <div className="metric-card">
              <div className="metric-label">Resident Columns</div>
              <div className="metric-value">
                {memory.residentColumns} of {memory.totalColumns}
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Loading Columns</div>
              <div className="metric-value">{memory.loadingColumns}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Unloaded Columns</div>
              <div className="metric-value">{memory.unloadedColumns}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Resident Memory</div>
              <div className="metric-value">{bytes(memory.residentBytes)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">In-progress Memory</div>
              <div className="metric-value">{bytes(memory.inProgressBytes)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Total Simulated Memory</div>
              <div className="metric-value">{bytes(memory.totalSimulatedBytes)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">All Columns Together</div>
              <div className="metric-value">{bytes(memory.fullColumnSetBytes)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Share Of All Columns</div>
              <div className="metric-value">{memory.shareOfFullSetPercent.toFixed(1)}%</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Simulated Steps</div>
              <div className="metric-value">{fmt(session.tick)}</div>
            </div>
          </div>
          <div
            className="loading-meter"
            role="meter"
            aria-label="Simulated memory as a share of all columns"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(memory.shareOfFullSetPercent)}
          >
            <span className="loading-meter-resident" style={{ width: `${memory.fullColumnSetBytes > 0 ? (memory.residentBytes / memory.fullColumnSetBytes) * 100 : 0}%` }} />
            <span className="loading-meter-progress" style={{ width: `${memory.fullColumnSetBytes > 0 ? (memory.inProgressBytes / memory.fullColumnSetBytes) * 100 : 0}%` }} />
          </div>
          <p className="loading-note">
            <strong>Availability is not a full import.</strong> Only the columns that were requested are in memory. The
            rest stay in storage. Each step loads about {LOAD_BYTES_PER_TICK} B of a column, a [SIMPLIFIED MODEL]
            placeholder with no Microsoft basis.
          </p>
        </div>

        <div className="loading-section">
          <h3>Simulated query</h3>
          <fieldset className="loading-fieldset">
            <legend>Columns the query needs</legend>
            {names.map((name) => (
              <label key={name} className="loading-check">
                <input
                  type="checkbox"
                  checked={queryColumns.includes(name)}
                  onChange={() => setQueryColumns((current) => toggle(current, name))}
                />{' '}
                {name}
              </label>
            ))}
          </fieldset>

          {queryPlan ? (
            <div className="loading-table-scroll" tabIndex={0} role="region" aria-label="Query column plan">
              <table className="loading-table">
                <caption>What this query would cause, given the current state</caption>
                <thead>
                  <tr>
                    <th scope="col">Column</th>
                    <th scope="col">Availability</th>
                    <th scope="col">Memory if loaded</th>
                    <th scope="col">Steps to load</th>
                  </tr>
                </thead>
                <tbody>
                  {queryPlan.entries.map((entry) => (
                    <tr key={entry.columnName}>
                      <th scope="row">{entry.columnName}</th>
                      <td>{STATUS_LABEL[entry.status]}</td>
                      <td>{bytes(entry.memoryBytes)}</td>
                      <td>{entry.status === 'ALREADY_RESIDENT' ? '0' : fmt(entry.loadTicks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="loading-note">Select at least one column for the query.</p>
          )}
          {planLines.length > 0 && (
            <ul className="loading-plan">
              {planLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <div className="loading-actions">
            <button type="button" className="loading-button" disabled={queryColumns.length === 0} onClick={runQuery}>
              Run simulated query
            </button>
          </div>

          {lastQuery && (
            <div className="loading-result" role="status" aria-live="polite">
              <h4>Last query result</h4>
              <ul>
                <li>
                  <strong>Reused (already resident):</strong> {lastQuery.columnsReused.length > 0 ? lastQuery.columnsReused.join(', ') : 'none'}
                </li>
                <li>
                  <strong>Loaded by this query:</strong> {lastQuery.columnsLoadedByQuery.length > 0 ? lastQuery.columnsLoadedByQuery.join(', ') : 'none'}
                </li>
                {lastQuery.columnsAwaited.length > 0 && (
                  <li>
                    <strong>Waited for (already loading):</strong> {lastQuery.columnsAwaited.join(', ')}
                  </li>
                )}
                <li>
                  <strong>Simulated steps spent loading:</strong> {fmt(lastQuery.ticksElapsed)}
                </li>
                <li>
                  <strong>Simulated memory:</strong> {bytes(lastQuery.memoryBeforeBytes)} before, {bytes(lastQuery.memoryAfterBytes)} after
                </li>
              </ul>
              <p className="loading-note">
                This shows column loading only. Scanning, filtering and aggregating are not simulated here.
              </p>
            </div>
          )}
        </div>

        <div className="loading-section">
          <h3>Demonstrations</h3>
          <p className="loading-note">
            Run these in order from a fresh simulation to follow the story. Each button acts on the current state.
          </p>
          <div className="loading-actions">
            {LOADING_DEMOS.map((demo, index) => (
              <button key={demo.id} type="button" className="loading-button loading-button-secondary" onClick={() => runDemo(demo.id)}>
                {index + 1}. {demo.label}
              </button>
            ))}
          </div>
        </div>

        <div className="loading-section">
          <h3>Event log</h3>
          <ol className="loading-log" role="log" aria-live="polite" aria-label="Simulation event log" tabIndex={0}>
            {session.events.length === 0 ? (
              <li className="loading-log-empty">Nothing has happened yet.</li>
            ) : (
              session.events.map((event) => (
                <li key={event.sequence}>
                  <span className="loading-log-tick">step {event.tick}</span> {event.message}
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
            <strong>Resident column:</strong> a column currently in memory. <strong>[DOCUMENTED]</strong> A query that uses
            only resident columns does not need to load more.
          </li>
          <li>
            <strong>Column loading:</strong> <strong>[DOCUMENTED]</strong> When a query needs a column that is not in
            memory, all of that column's data is loaded from the Delta table. Microsoft calls this transcoding.
          </li>
          <li>
            <strong>Availability versus import:</strong> a resident column is available. The semantic model is not loaded
            as a whole, and data that no query needs can stay in storage.
          </li>
          <li>
            <strong>Loading versus query execution:</strong> loading puts columns in memory. Running the query happens
            after, and is not part of this module.
          </li>
          <li>
            <strong>OneLake, Delta and Parquet:</strong> <strong>[DOCUMENTED]</strong> Delta tables are stored as Parquet
            files in OneLake, and Parquet organizes data by column, which is why whole columns can be loaded on demand.
          </li>
          <li>
            <strong>Framing:</strong> <strong>[DOCUMENTED]</strong> A Direct Lake refresh copies only metadata. It is not
            simulated here.
          </li>
          <li>
            <strong>[SIMPLIFIED MODEL]</strong> Column memory equals the Module 5 estimate, and loading takes ceil(bytes /
            512) steps.
          </li>
          <li>
            <strong>[SIMULATION]</strong> The synthetic data, the steps and every size shown.
          </li>
          <li>
            <strong>[PROPRIETARY INTERNAL]</strong> The real loading sequence, memory management, timings and memory use.
          </li>
        </ul>
      </div>

      <div className="concepts-panel loading-examples">
        <h3>Practical Examples</h3>
        <p className="loading-example-intro">
          At 1,000 rows, 500 rows per segment, no nulls and the Value representation (this model's estimates):
        </p>
        <ul>
          <li>
            <strong>Load CustomerID only:</strong> 1 column resident, 1,394 B, after 3 steps. The other four columns stay
            in storage.
          </li>
          <li>
            <strong>Then load Revenue and Region:</strong> 3 columns resident, 4,463 B, which is 48.5% of all five columns.
          </li>
          <li>
            <strong>Query CustomerID and Revenue:</strong> both are already resident, so nothing loads and 0 steps are spent.
          </li>
          <li>
            <strong>Query Region:</strong> already resident, so again nothing loads.
          </li>
          <li>
            <strong>Query LastPurchaseDate:</strong> not resident, so it loads: 3 steps, memory rises from 4,463 B to
            5,857 B (about 64%), with 4 columns resident and CustomerName still unloaded.
          </li>
          <li>
            <strong>Cold query:</strong> from a fresh start, a query on CustomerID and Revenue loads both together in 5
            steps (the slower one decides) and uses 3,914 B.
          </li>
        </ul>
      </div>

      <div className="limitations-panel">
        <h3>Limitations & Assumptions</h3>
        <p>
          <strong>[SIMULATION]</strong> This module:
        </p>
        <ul>
          <li>Is an educational model. It does not reproduce Fabric's loading implementation, sequence or memory management.</li>
          <li>Uses Module 5 size estimates as memory, and a fixed number of bytes per step as the loading rate. Neither is a Microsoft figure.</li>
          <li>Shows a column's place on the conceptual flow while it loads as a visual aid. Microsoft does not document internal sub-steps.</li>
          <li>Does not model framing, eviction, memory limits, concurrent queries, relationships or measures. Eviction is covered in a later module.</li>
          <li>Models loading only. It does not scan, filter or aggregate data.</li>
          <li>Treats the Customer table as the whole model, so a query needs exactly the columns you select.</li>
          <li>Does not claim that the whole semantic model must be loaded before a query runs.</li>
        </ul>
      </div>

      <div className="loading-sources">
        <h3>Sources</h3>
        <ul>
          {getLoadingSourceReferences().map((source) => (
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

export default DirectLakeLoadingSimulator;
