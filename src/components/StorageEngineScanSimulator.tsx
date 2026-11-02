import React, { useMemo, useState } from 'react';
import { AggregationFunction, CompressionEncodingModel, EliminationOperator, ExplanationMode, LoadingSession, LoadingSettings, ScanQuery, ScanStageId, SegmentRowOrder, StorageScanResult } from '../types';
import { createLoadingSession, DEFAULT_LOADING_SETTINGS } from '../data/stage6-loading-simulator';
import { evictAllResident, evictColumns, snapshotMemory } from '../data/stage6-memory-simulator';
import { ELIMINATION_OPERATORS } from '../data/stage6-elimination-simulator';
import { CUSTOMER_COLUMNS } from '../data/stage6-synthetic-dataset';
import {
  compareRowOrders,
  explainScan,
  getScanSourceReferences,
  runStorageScan,
  SCAN_AGGREGATIONS,
  SCAN_SCENARIOS,
  validateScanQuery,
} from '../data/stage6-scan-simulator';
import './DictionaryEncodingExplorer.css';
import './StorageEngineScanSimulator.css';

interface StorageEngineScanSimulatorProps {
  explanationMode: ExplanationMode;
}

const NULL_PERCENT_OPTIONS = [0, 5, 10, 25, 50, 100];
const CUSTOM = 'CUSTOM';

const fmt = (n: number): string => n.toLocaleString('en-US');
const bytes = (n: number): string => `${fmt(n)} B`;

const STAGES: Array<{ id: ScanStageId; label: string }> = [
  { id: 'REQUEST', label: 'Query request' },
  { id: 'AVAILABILITY', label: 'Required column availability' },
  { id: 'ELIMINATION', label: 'Segment elimination' },
  { id: 'SCAN', label: 'Candidate segment scan' },
  { id: 'AGGREGATION', label: 'Aggregation' },
  { id: 'RESULT', label: 'Result' },
];

const TEXT_OPERATORS: EliminationOperator[] = ['EQ', 'NEQ'];

const EXPLANATIONS: Record<ExplanationMode, string[]> = {
  beginner: [
    'A query asks for some columns. Before anything can be read, those columns have to be in memory. Then the engine can skip whole chunks of rows (segments) that cannot possibly match, read the chunks that remain, and add up the values that match.',
    'Try it: run "Revenue for CustomerID 100 to 200". One segment is skipped. The other segment has 500 rows, but only 101 of them match. Rows in a segment that was read are not the same as rows that match.',
    'Everything here is a teaching model built on made-up data. It is not how Fabric actually runs a query.',
  ],
  intermediate: [
    'The steps are kept separate on purpose. Column loading makes the needed columns resident (Module 6). Segment elimination uses each segment\'s min and max to rule segments out (Module 4). The scan then reads the actual rows of the candidate segments and applies the filter to each row. Aggregation adds up the matching values. The Formula Engine, which evaluates DAX, is not simulated.',
    'A candidate segment is one that could not be ruled out, so its rows are read, and the filter is then checked row by row. That is why "rows in candidate segments" is usually larger than "matching rows".',
    'Elimination depends on how rows are stored. Sorted CustomerID gives segments with separate ranges, so many can be skipped. Scattered dates give every segment almost the full range, so none can. Compare the two date scenarios, and change the storage order to sorted: the answer is identical, only the work changes.',
  ],
  advanced: [
    '[DOCUMENTED] Microsoft Learn (Analysis Services tabular query interleaving): a single DAX query can result in multiple VertiPaq storage engine queries, and formula engine operations are separate from them. Microsoft Learn (How Direct Lake works): the model works out the columns a query needs, loads those not yet in memory, and keeps them resident until evicted.',
    '[SIMPLIFIED MODEL] Candidate segments come from Module 4 on Module 3 segment metadata (numeric and date filters only). The scan then reads every row of each candidate segment in stored order, applies the filter row by row (a null never matches), and aggregates the non-null measure values of matching rows. Decimal sums are accumulated in whole units of the smallest decimal place. "Values read" is candidate rows times columns read, a count and not a cost.',
    '[SIMULATION] The data are synthetic and deterministic, the answer is calculated from the actual rows, and there are no timings. The conceptual request line is an illustration, not xmSQL. Text filters have no elimination here. In this shared model the same rows are null in every column.',
    '[PROPRIETARY INTERNAL] How the engine really scans segments, in what order, how it aggregates, its optimizations, the xmSQL it generates and its timings are not published. Nothing on this page claims to reproduce them, and no segment order here is the real engine\'s order.',
  ],
};

const parseValue = (text: string, numeric: boolean): number | string => {
  if (!numeric) return text;
  return text.trim() === '' ? NaN : Number(text);
};

const defaultValues = (dataType: string): { operator: EliminationOperator; value: string; upper: string } => {
  switch (dataType) {
    case 'DATE':
      return { operator: 'BETWEEN', value: '2023-03-01', upper: '2023-03-31' };
    case 'TEXT':
      return { operator: 'EQ', value: 'East', upper: '' };
    case 'DECIMAL':
      return { operator: 'BETWEEN', value: '1000', upper: '2000' };
    default:
      return { operator: 'BETWEEN', value: '100', upper: '200' };
  }
};

const StorageEngineScanSimulator: React.FC<StorageEngineScanSimulatorProps> = ({ explanationMode }) => {
  const first = SCAN_SCENARIOS[0].query;
  const [settings, setSettings] = useState<LoadingSettings>(DEFAULT_LOADING_SETTINGS);
  const [session, setSession] = useState<LoadingSession>(() => createLoadingSession(DEFAULT_LOADING_SETTINGS));
  const [scenarioId, setScenarioId] = useState<string>(SCAN_SCENARIOS[0].id);
  const [aggregation, setAggregation] = useState<AggregationFunction>(first.aggregation);
  const [measureColumn, setMeasureColumn] = useState<string>(first.measureColumn);
  const [filterColumn, setFilterColumn] = useState<string>('');
  const [operator, setOperator] = useState<EliminationOperator>('BETWEEN');
  const [valueText, setValueText] = useState<string>('');
  const [upperText, setUpperText] = useState<string>('');
  const [rowOrder, setRowOrder] = useState<SegmentRowOrder>('AS_LOADED');
  const [result, setResult] = useState<StorageScanResult | null>(null);
  const [evictTarget, setEvictTarget] = useState<string>('');
  const [notice, setNotice] = useState<string>('');

  const filterDefinition = CUSTOMER_COLUMNS.find((column) => column.name === filterColumn);
  const numericFilter = filterDefinition ? filterDefinition.dataType === 'INTEGER' || filterDefinition.dataType === 'DECIMAL' : false;
  const operatorChoices = ELIMINATION_OPERATORS.filter((entry) => filterDefinition?.dataType !== 'TEXT' || TEXT_OPERATORS.includes(entry.value));

  const query: ScanQuery = useMemo(
    () => ({
      aggregation,
      measureColumn,
      filter: filterColumn
        ? {
            columnName: filterColumn,
            predicate: {
              operator,
              value: parseValue(valueText, numericFilter),
              ...(operator === 'BETWEEN' ? { upperValue: parseValue(upperText, numericFilter) } : {}),
            },
          }
        : null,
      rowOrder,
    }),
    [aggregation, measureColumn, filterColumn, operator, valueText, upperText, numericFilter, rowOrder],
  );
  const problem = useMemo(() => validateScanQuery(query), [query]);
  const comparison = useMemo(
    () => (problem === null && query.filter ? compareRowOrders(session.settings, query) : null),
    [problem, query, session.settings],
  );
  const snapshot = useMemo(() => snapshotMemory(session), [session]);

  const edited = (): void => setScenarioId(CUSTOM);

  const loadQuery = (next: ScanQuery, id: string): void => {
    setScenarioId(id);
    setAggregation(next.aggregation);
    setMeasureColumn(next.measureColumn);
    setRowOrder(next.rowOrder);
    if (next.filter) {
      setFilterColumn(next.filter.columnName);
      setOperator(next.filter.predicate.operator);
      setValueText(String(next.filter.predicate.value));
      setUpperText(next.filter.predicate.upperValue === undefined ? '' : String(next.filter.predicate.upperValue));
    } else {
      setFilterColumn('');
      setOperator('BETWEEN');
      setValueText('');
      setUpperText('');
    }
  };

  const chooseScenario = (id: string): void => {
    const scenario = SCAN_SCENARIOS.find((entry) => entry.id === id);
    if (scenario) loadQuery(scenario.query, scenario.id);
  };

  const changeFilterColumn = (name: string): void => {
    edited();
    setFilterColumn(name);
    const definition = CUSTOMER_COLUMNS.find((column) => column.name === name);
    if (definition) {
      const next = defaultValues(definition.dataType);
      setOperator(next.operator);
      setValueText(next.value);
      setUpperText(next.upper);
    }
  };

  const fresh = (next: LoadingSettings, message: string): void => {
    setSettings(next);
    setSession(createLoadingSession(next));
    setResult(null);
    setNotice(message);
  };

  const updateSettings = (changes: Partial<LoadingSettings>): void =>
    fresh({ ...settings, ...changes }, 'Settings changed, so the simulation was reset and every column is non-resident again.');

  const reset = (): void => {
    fresh(DEFAULT_LOADING_SETTINGS, 'Simulation reset to its defaults.');
    loadQuery(first, SCAN_SCENARIOS[0].id);
    setEvictTarget('');
  };

  const guarded = (action: () => void): void => {
    try {
      action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That action is not valid.');
    }
  };

  const run = (): void =>
    guarded(() => {
      const scan = runStorageScan(session, query);
      setSession(scan.session);
      setResult(scan);
      setNotice('');
    });

  const residentNames = snapshot.residentColumns;
  const effectiveEvictTarget = residentNames.includes(evictTarget) ? evictTarget : (residentNames[0] ?? '');
  const evict = (): void =>
    guarded(() => {
      const outcome = evictColumns(session, [effectiveEvictTarget], 'USER_ACTION');
      setSession(outcome.session);
      setNotice('');
    });
  const evictAll = (): void =>
    guarded(() => {
      setSession(evictAllResident(session, 'USER_ACTION').session);
      setNotice('');
    });

  const scenario = SCAN_SCENARIOS.find((entry) => entry.id === scenarioId);
  const stageData = (id: ScanStageId): { status: string; summary: string } => {
    const step = result?.steps.find((entry) => entry.stage === id);
    if (!step) return { status: '○ Not run yet', summary: '' };
    return { status: step.status === 'DONE' ? '✓ Done' : '– Skipped', summary: step.summary };
  };

  return (
    <div className="dictionary-explorer scan-explorer">
      <div className="explorer-header">
        <h2>Storage Engine Scan Simulator</h2>
        <p className="explorer-description">
          Follow one query over the synthetic Customer table: columns made available, segments ruled out, candidate segments
          scanned, and a result calculated from the actual rows
        </p>
      </div>

      <div className="explanation-panel">
        <h3>Explanation ({explanationMode})</h3>
        {EXPLANATIONS[explanationMode].map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="scan-facts" aria-label="What is documented and what is simulated">
        <h3>What is documented and what is simulated</h3>
        <dl>
          <dt>[DOCUMENTED]</dt>
          <dd>
            One DAX query can result in several VertiPaq storage engine queries, and formula engine work is separate. Direct
            Lake loads the columns a query needs when it first needs them, and they stay resident until evicted.
          </dd>
          <dt>[SIMULATION]</dt>
          <dd>Synthetic data, and a scan calculated from its actual rows. No timings, no randomness, no DAX engine.</dd>
          <dt>[SIMPLIFIED MODEL]</dt>
          <dd>
            Candidate segments from Module 4 metadata, a row-by-row filter over candidate segments, whole-column residency
            from Modules 6 and 7, and a conceptual request line that is not xmSQL.
          </dd>
          <dt>[PROPRIETARY INTERNAL]</dt>
          <dd>The real scan, its order, aggregation, optimizations, xmSQL and timings. Not published, not modelled.</dd>
        </dl>
      </div>

      <div className="controls-section">
        <div className="scan-controls-head">
          <h4 className="scan-controls-title">Data and sizing</h4>
          <button type="button" className="scan-button scan-button-secondary" onClick={reset}>
            Reset simulation
          </button>
        </div>
        <div className="scan-controls">
          <div className="control-group">
            <label htmlFor="scan-rows-slider">Row count: {fmt(settings.rowCount)}</label>
            <input
              id="scan-rows-slider"
              type="range"
              min="0"
              max="5000"
              step="100"
              value={settings.rowCount}
              onChange={(e) => updateSettings({ rowCount: parseInt(e.target.value, 10) })}
            />
          </div>
          <div className="control-group">
            <label htmlFor="scan-segment-slider">Rows per segment: {fmt(settings.segmentRowCount)} (educational assumption)</label>
            <input
              id="scan-segment-slider"
              type="range"
              min="50"
              max="2000"
              step="50"
              value={settings.segmentRowCount}
              onChange={(e) => updateSettings({ segmentRowCount: parseInt(e.target.value, 10) })}
            />
          </div>
          <div className="control-group">
            <label htmlFor="scan-null-select">Null share (approximate)</label>
            <select id="scan-null-select" className="scan-select" value={settings.nullPercent} onChange={(e) => updateSettings({ nullPercent: parseInt(e.target.value, 10) })}>
              {NULL_PERCENT_OPTIONS.map((percent) => (
                <option key={percent} value={percent}>
                  {percent}%
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="scan-encoding-select">Numeric and date representation</label>
            <select
              id="scan-encoding-select"
              className="scan-select"
              value={settings.numericEncoding}
              onChange={(e) => updateSettings({ numericEncoding: e.target.value as CompressionEncodingModel })}
            >
              <option value="VALUE">Value (offset from the minimum)</option>
              <option value="DICTIONARY">Dictionary (each distinct value once)</option>
            </select>
          </div>
        </div>
        <p className="scan-note">
          Rows, segments, nulls and column sizes come from the Module 6 session (Modules 3 and 5). Changing a setting resets
          the simulation. In this shared model the same rows are null in every column.
        </p>
      </div>

      <div className="results-section">
        <div className="scan-section">
          <h3>Query</h3>
          <div className="scan-controls">
            <div className="control-group">
              <label htmlFor="scan-scenario-select">Query scenario</label>
              <select id="scan-scenario-select" className="scan-select" value={scenarioId} onChange={(e) => chooseScenario(e.target.value)}>
                {SCAN_SCENARIOS.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
                <option value={CUSTOM} disabled>
                  Custom query
                </option>
              </select>
            </div>
            <div className="control-group">
              <label htmlFor="scan-aggregation-select">Aggregation</label>
              <select
                id="scan-aggregation-select"
                className="scan-select"
                value={aggregation}
                onChange={(e) => {
                  edited();
                  setAggregation(e.target.value as AggregationFunction);
                }}
              >
                {SCAN_AGGREGATIONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <label htmlFor="scan-measure-select">Column to aggregate</label>
              <select
                id="scan-measure-select"
                className="scan-select"
                value={measureColumn}
                onChange={(e) => {
                  edited();
                  setMeasureColumn(e.target.value);
                }}
              >
                {CUSTOMER_COLUMNS.map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name} ({column.dataType.toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <label htmlFor="scan-filter-select">Filter column</label>
              <select id="scan-filter-select" className="scan-select" value={filterColumn} onChange={(e) => changeFilterColumn(e.target.value)}>
                <option value="">No filter</option>
                {CUSTOMER_COLUMNS.map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name} ({column.dataType.toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
            {filterColumn && (
              <>
                <div className="control-group">
                  <label htmlFor="scan-operator-select">Filter operator</label>
                  <select
                    id="scan-operator-select"
                    className="scan-select"
                    value={operator}
                    onChange={(e) => {
                      edited();
                      setOperator(e.target.value as EliminationOperator);
                    }}
                  >
                    {operatorChoices.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="control-group">
                  <label htmlFor="scan-value-input">{operator === 'BETWEEN' ? 'Lower bound' : 'Filter value'}</label>
                  <input
                    id="scan-value-input"
                    className="scan-input"
                    type="text"
                    value={valueText}
                    onChange={(e) => {
                      edited();
                      setValueText(e.target.value);
                    }}
                  />
                </div>
                {operator === 'BETWEEN' && (
                  <div className="control-group">
                    <label htmlFor="scan-upper-input">Upper bound (inclusive)</label>
                    <input
                      id="scan-upper-input"
                      className="scan-input"
                      type="text"
                      value={upperText}
                      onChange={(e) => {
                        edited();
                        setUpperText(e.target.value);
                      }}
                    />
                  </div>
                )}
              </>
            )}
            <div className="control-group">
              <label htmlFor="scan-order-select">Table storage order</label>
              <select
                id="scan-order-select"
                className="scan-select"
                value={rowOrder}
                disabled={!filterColumn}
                onChange={(e) => {
                  edited();
                  setRowOrder(e.target.value as SegmentRowOrder);
                }}
              >
                <option value="AS_LOADED">As loaded</option>
                <option value="SORTED_ASCENDING">Sorted by the filter column</option>
              </select>
            </div>
          </div>
          {scenario && <p className="scan-note">{scenario.description}</p>}
          {!filterColumn && <p className="scan-note">The storage order only matters when there is a filter.</p>}
          {problem && (
            <p className="scan-notice" role="alert">
              {problem}
            </p>
          )}
          <div className="scan-actions">
            <button type="button" className="scan-button" disabled={problem !== null} onClick={run}>
              Run scan
            </button>
          </div>
          {notice && (
            <p className="scan-notice" role="status">
              {notice}
            </p>
          )}
        </div>

        <div className="scan-section">
          <h3>Execution sequence</h3>
          <p className="scan-note">
            [SIMPLIFIED MODEL] A conceptual visualization of the stages. It makes no claim about the proprietary internal order of
            execution.
          </p>
          <ol className="scan-flow" aria-label="Conceptual execution sequence">
            {STAGES.map((stage, index) => {
              const data = stageData(stage.id);
              return (
                <li key={stage.id} className="scan-flow-item">
                  <span className="scan-flow-number">{index + 1}</span>
                  <span className="scan-flow-label">{stage.label}</span>
                  <span className={`scan-flow-status ${data.status.startsWith('✓') ? 'scan-status-done' : data.status.startsWith('–') ? 'scan-status-skipped' : 'scan-status-pending'}`}>
                    {data.status}
                  </span>
                  {data.summary && <span className="scan-flow-summary">{data.summary}</span>}
                </li>
              );
            })}
          </ol>
        </div>

        {result ? (
          <div className="scan-section" aria-live="polite">
            <h3>Scan statistics</h3>
            <p className="scan-summary">
              <strong>Last scan:</strong> {result.conceptualRequest}. <em>This line is a conceptual illustration, not xmSQL and not captured from any engine.</em>
            </p>
            <div className="metrics-grid">
              <div className="metric-card">
                <div className="metric-label">Requested Columns</div>
                <div className="metric-value">{result.requiredColumns.join(', ')}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Already Resident</div>
                <div className="metric-value">{result.loading.alreadyResident.length > 0 ? result.loading.alreadyResident.join(', ') : 'none'}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Loaded For This Query</div>
                <div className="metric-value">{result.loading.loadedForThisQuery.length > 0 ? result.loading.loadedForThisQuery.join(', ') : 'none'}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Simulated Memory</div>
                <div className="metric-value">
                  {bytes(result.loading.memoryBeforeBytes)} to {bytes(result.loading.memoryAfterBytes)}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Total Segments</div>
                <div className="metric-value">{fmt(result.totalSegments)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Eliminated Segments</div>
                <div className="metric-value">{fmt(result.eliminatedSegments)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Candidate Segments</div>
                <div className="metric-value">{fmt(result.candidateSegments)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Rows In Candidate Segments</div>
                <div className="metric-value">{fmt(result.rowsInCandidateSegments)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Actual Matching Rows</div>
                <div className="metric-value">{fmt(result.matchingRows)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Candidate Rows Not Matching</div>
                <div className="metric-value">{fmt(result.candidateRowsNotMatching)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Values Read (modelled)</div>
                <div className="metric-value">{fmt(result.valuesRead)}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Aggregation Result</div>
                <div className="metric-value">
                  {result.aggregation.function}({result.aggregation.columnName}) = {result.aggregation.display}
                </div>
              </div>
            </div>
            <p className="scan-note">
              <strong>Candidate rows are not matching rows.</strong> Rows in candidate segments are the rows that were read
              because their segment could not be ruled out. Matching rows are the ones that actually satisfy the filter.
            </p>
            <ul className="scan-plan">
              {explainScan(result).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>

            <h3>Segment elimination summary</h3>
            <p className="scan-note">{result.elimination.note}</p>

            <div className="scan-table-scroll" tabIndex={0} role="region" aria-label="Segments and whether they were scanned">
              <table className="scan-table">
                <caption>Candidate segment table: segments the scan read, and segments it did not</caption>
                <thead>
                  <tr>
                    <th scope="col">Segment</th>
                    <th scope="col">Rows (from, to)</th>
                    <th scope="col">Decision</th>
                    <th scope="col">Why</th>
                    <th scope="col">Rows read</th>
                    <th scope="col">Matching rows</th>
                  </tr>
                </thead>
                <tbody>
                  {result.segments.map((segment) => (
                    <tr key={segment.segmentId}>
                      <th scope="row">{segment.segmentId}</th>
                      <td>
                        {fmt(segment.startRowIndex)} to {fmt(segment.endRowIndex - 1)} ({fmt(segment.rowCount)})
                      </td>
                      <td>{segment.decision === 'CANDIDATE' ? '✓ Candidate (scanned)' : '✗ Eliminated'}</td>
                      <td className="scan-why">{segment.reason}</td>
                      <td>{fmt(segment.rowsRead)}</td>
                      <td>{segment.decision === 'CANDIDATE' ? fmt(segment.matchingRows) : '-'}</td>
                    </tr>
                  ))}
                  {result.segments.length === 0 && (
                    <tr>
                      <td colSpan={6}>There are no rows, so there are no segments.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="scan-section">
            <h3>Scan statistics</h3>
            <p className="scan-note">Run a scan to see the statistics, the segment table and the result.</p>
          </div>
        )}

        <div className="scan-section">
          <h3>Compare storage orders</h3>
          {comparison ? (
            <div className="scan-table-scroll" tabIndex={0} role="region" aria-label="Comparison of storage orders">
              <table className="scan-table">
                <caption>The same query with the table stored as loaded and sorted by the filter column. The answer does not change.</caption>
                <thead>
                  <tr>
                    <th scope="col">Storage order</th>
                    <th scope="col">Eliminated segments</th>
                    <th scope="col">Candidate segments</th>
                    <th scope="col">Rows in candidate segments</th>
                    <th scope="col">Matching rows</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'As loaded', data: comparison.asLoaded },
                    { label: `Sorted by ${filterColumn}`, data: comparison.sorted },
                  ].map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td>{fmt(row.data.eliminatedSegments)}</td>
                      <td>{fmt(row.data.candidateSegments)}</td>
                      <td>{fmt(row.data.rowsInCandidateSegments)}</td>
                      <td>{fmt(row.data.matchingRows)}</td>
                      <td>{row.data.aggregation.display}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="scan-note">Choose a valid filter to compare how storage order changes the work. This comparison does not load any column.</p>
          )}
        </div>

        <div className="scan-section">
          <h3>Residency</h3>
          <div className="scan-groups" aria-live="polite">
            <p>
              <strong>Resident:</strong> {snapshot.residentColumns.length > 0 ? snapshot.residentColumns.join(', ') : 'none'}
            </p>
            <p>
              <strong>Not resident:</strong> {snapshot.nonResidentColumns.length > 0 ? snapshot.nonResidentColumns.join(', ') : 'none'}
            </p>
            <p>
              <strong>Simulated memory:</strong> {bytes(snapshot.totalBytes)} (each resident column counted once)
            </p>
          </div>
          <p className="scan-note">
            Evicting a column (Module 7) means the next scan that needs it must load it again. Evictions here are your own
            actions, not decisions by this simulator.
          </p>
          <div className="scan-controls">
            <div className="control-group">
              <label htmlFor="scan-evict-select">Resident column to evict</label>
              <select
                id="scan-evict-select"
                className="scan-select"
                value={effectiveEvictTarget}
                disabled={residentNames.length === 0}
                onChange={(e) => setEvictTarget(e.target.value)}
              >
                {residentNames.length === 0 && <option value="">No column is resident</option>}
                {residentNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="scan-actions">
            <button type="button" className="scan-button scan-button-secondary" disabled={residentNames.length === 0} onClick={evict}>
              Evict column
            </button>
            <button type="button" className="scan-button scan-button-secondary" disabled={residentNames.length === 0} onClick={evictAll}>
              Evict every resident column
            </button>
          </div>
        </div>

        <div className="scan-section">
          <h3>Event history</h3>
          <ol className="scan-log" role="log" aria-live="polite" aria-label="Simulation event history" tabIndex={0}>
            {session.events.length === 0 ? (
              <li className="scan-log-empty">Nothing has happened yet.</li>
            ) : (
              session.events.map((event) => (
                <li key={event.sequence}>
                  <span className="scan-log-tick">step {event.tick}</span> {event.message}
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
            <strong>Column loading:</strong> making a column resident so it can be read. <strong>[DOCUMENTED]</strong> Direct
            Lake loads the columns a query needs when it first needs them (Module 6).
          </li>
          <li>
            <strong>Segment elimination:</strong> ruling out segments from their min and max, without reading their rows
            (Module 4). <strong>[SIMPLIFIED MODEL]</strong> Available here for numeric and date filters only.
          </li>
          <li>
            <strong>Candidate segment:</strong> a segment that could not be ruled out. Its rows are read, and it may hold few
            or no matching rows.
          </li>
          <li>
            <strong>Scan:</strong> reading the rows of the candidate segments and applying the filter to each row.
          </li>
          <li>
            <strong>Aggregation:</strong> combining the non-null values of the matching rows. A result with no non-null
            input is blank, except COUNT, which is 0.
          </li>
          <li>
            <strong>Formula Engine:</strong> <strong>[DOCUMENTED]</strong> Formula engine work is separate from storage engine
            queries. This simulator hands the result back conceptually and does not evaluate DAX.
          </li>
          <li>
            <strong>Storage order:</strong> how the rows are arranged decides how well min and max can rule segments out.
          </li>
          <li>
            <strong>[SIMULATION]</strong> The data, the scan and every count shown. <strong>[PROPRIETARY INTERNAL]</strong>{' '}
            The engine's real scan, segment order, optimizations, xmSQL and timings.
          </li>
        </ul>
      </div>

      <div className="concepts-panel scan-examples">
        <h3>Practical Examples</h3>
        <p className="scan-example-intro">At 1,000 rows, 500 rows per segment, no nulls and the Value representation (this model's results):</p>
        <ul>
          <li>
            <strong>SUM of Revenue, no filter:</strong> 2 of 2 segments are candidates, 1,000 rows read, result 2,502,487.79.
            Revenue loads first (5 simulated steps, 2,520 B).
          </li>
          <li>
            <strong>Revenue for CustomerID 100 to 200:</strong> 1 segment eliminated, 1 candidate with 500 rows, but only 101
            rows match. Result 249,311.15. CustomerID has to load (3 steps) while Revenue is already resident.
          </li>
          <li>
            <strong>Revenue for Region = East:</strong> no elimination for a text filter, so 1,000 rows are read and 193 match.
            Result 462,329.55.
          </li>
          <li>
            <strong>Revenue for March 2023, table as loaded:</strong> the dates are scattered, so no segment can be ruled out:
            1,000 rows read, 39 match. Result 85,564.51.
          </li>
          <li>
            <strong>The same, sorted by date:</strong> 1 segment is eliminated and 500 rows are read, still 39 matches and the
            same 85,564.51. Sorting changed the work, not the answer.
          </li>
          <li>
            <strong>Evict Revenue, then scan it again:</strong> it is loaded again before the scan, and memory returns to its
            earlier total.
          </li>
        </ul>
      </div>

      <div className="limitations-panel">
        <h3>Limitations & Assumptions</h3>
        <p>
          <strong>[SIMULATION]</strong> This module:
        </p>
        <ul>
          <li>Is an educational model. It does not reproduce the VertiPaq engine, its scan order, its optimizations or its performance, and it shows no timings.</li>
          <li>Reads whole candidate segments in stored order, filters row by row, and aggregates the real values. Candidate rows are never treated as matching rows.</li>
          <li>Uses an illustrative request line. It is not xmSQL and was not captured from any engine.</li>
          <li>Has no segment elimination for text filters, because Module 4 supports numeric and date columns only.</li>
          <li>Supports one measure column, one filter and one aggregation. It is not a DAX engine: no relationships, measures, grouping or row context. Formula Engine work is not simulated.</li>
          <li>Counts values read as candidate rows times columns read. That is a count of work in this model, not a cost.</li>
          <li>Nulls the same rows in every column, so a row that passes a filter always has a non-null value in the aggregated column. Null and invalid values never match a filter.</li>
          <li>Treats storage order as an assumption you choose; real storage order depends on how the data was loaded.</li>
        </ul>
      </div>

      <div className="scan-sources">
        <h3>Sources</h3>
        <ul>
          {getScanSourceReferences().map((source) => (
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

export default StorageEngineScanSimulator;
