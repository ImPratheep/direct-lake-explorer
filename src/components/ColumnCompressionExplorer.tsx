import React, { useMemo, useState } from 'react';
import { CompressionEncodingModel, CompressionEstimate, CompressionInputs, CompressionScenarioId, ExplanationMode } from '../types';
import { CUSTOMER_COLUMNS } from '../data/stage6-synthetic-dataset';
import {
  buildCompressionChart,
  buildCompressionColumn,
  buildEncodedPreview,
  compareCompression,
  COMPRESSION_SCENARIOS,
  DEFAULT_COMPRESSION_INPUTS,
  defaultInputsFor,
  describeCompressionAssumptions,
  effectiveCardinality,
  estimateColumnCompression,
  explainCompressionEstimate,
  getCompressionSourceReferences,
  getScenario,
} from '../data/stage6-compression-simulator';
// Shared Stage 6 panel styles (explorer header, explanation, controls, metric cards, concepts, limitations)
import './DictionaryEncodingExplorer.css';
import './ColumnCompressionExplorer.css';

interface ColumnCompressionExplorerProps {
  explanationMode: ExplanationMode;
}

const NULL_PERCENT_OPTIONS = [0, 5, 10, 25, 50, 100];
const BAND_LABEL: Record<string, string> = { EMPTY: 'none (no non-null values)', LOW: 'low', MEDIUM: 'medium', HIGH: 'high' };

const fmt = (n: number): string => n.toLocaleString('en-US');
const bytes = (n: number): string => `${fmt(n)} B`;
const signedBytes = (n: number): string => (n < 0 ? `-${fmt(-n)} B` : `${fmt(n)} B`);

const formatStat = (value: unknown, scale: number): string => {
  if (value === null || value === undefined) return '-';
  return typeof value === 'number' && scale > 0 ? value.toFixed(scale) : String(value);
};

const EXPLANATIONS: Record<ExplanationMode, string[]> = {
  beginner: [
    'In this simulator a column uses memory in three main ways: a dictionary of its distinct values, a small code stored for every row, and a little bookkeeping for each segment.',
    'Few distinct values (low cardinality) mean a tiny dictionary and small codes, so the column shrinks a lot. Almost every value different (high cardinality) means the dictionary is nearly as big as the data, so it may not shrink at all.',
    'Every size here is a teaching estimate, not a measurement of a real engine.',
  ],
  intermediate: [
    'Cardinality drives both parts of the dictionary model: dictionary entries grow with the number of distinct values, and the bits stored per row grow with log2 of that number.',
    'Numeric and date columns have a second option: store each value as its distance from the column minimum. Its cost follows the value range instead of the distinct count. Choose the model under Data source and compare. This module never decides which one a real engine uses.',
    'All segments of a column share one dictionary, which is counted once. Each segment adds a fixed bookkeeping allowance and rounds its codes up to whole bytes, so very small segments cost more.',
  ],
  advanced: [
    '[DOCUMENTED] Microsoft Learn (data reduction techniques for Import models): VertiPaq keeps separate internal data structures per column; numeric data uses value encoding; text and other non-numeric data uses hash encoding, which assigns a numeric ID to each unique value; converting text to numbers can reduce size, especially for unique or high-cardinality columns. Microsoft Learn (TOM EncodingHint) adds that a numeric column may use either encoding, the server normally detects which, and re-encoding may occur later.',
    '[DOCUMENTED] INFO.STORAGETABLECOLUMNSEGMENTS reports per-segment sizes and the count of bits needed to store the Data IDs.',
    '[SIMPLIFIED MODEL] Dictionary model: each distinct value stored once for the whole column, each row a bit-packed ID. Value model: (value - column minimum) bit-packed, with no dictionary. Segments, the shared dictionary and per-segment metadata come from the Module 3 model; the value model comes from Module 2. You choose the model; nothing is selected automatically.',
    '[SIMULATION] The data is synthetic and deterministic, and every size and ratio is an estimate.',
    '[PROPRIETARY INTERNAL] The engine\'s real encoding choice, bit layouts, any further compression and actual sizes are not published. This module does not predict them and does not claim a strategy is always selected.',
  ],
};

interface ChartRowsProps {
  rows: ReturnType<typeof buildCompressionChart>['rows'];
}

const CompressionBars: React.FC<ChartRowsProps> = ({ rows }) => (
  <div className="compression-chart" aria-hidden="true">
    {rows.map((row) => (
      <div className="compression-chart-row" key={row.id}>
        <span className="compression-chart-label">{row.label}</span>
        <div className="compression-chart-track">
          <span className="compression-chart-original" style={{ width: `${row.originalWidthPct}%` }} />
          <span className="compression-chart-stack">
            <span className="compression-part compression-part-dictionary" style={{ width: `${row.dictionaryWidthPct}%` }} />
            <span className="compression-part compression-part-encoded" style={{ width: `${row.encodedWidthPct}%` }} />
            <span className="compression-part compression-part-overhead" style={{ width: `${row.overheadWidthPct}%` }} />
          </span>
        </div>
        <span className="compression-chart-value">{row.totalPctOfOriginal.toFixed(0)}%</span>
      </div>
    ))}
  </div>
);

const ColumnCompressionExplorer: React.FC<ColumnCompressionExplorerProps> = ({ explanationMode }) => {
  const [inputs, setInputs] = useState<CompressionInputs>(DEFAULT_COMPRESSION_INPUTS);

  const scenario = getScenario(inputs.scenario);
  const dataType = scenario.dataType ?? CUSTOMER_COLUMNS.find((column) => column.name === inputs.customerColumn)?.dataType ?? 'INTEGER';
  const valueAllowed = dataType !== 'TEXT';
  const encoding: CompressionEncodingModel = valueAllowed ? inputs.encoding : 'DICTIONARY';
  const cardinalityControl = scenario.cardinalityControl;
  const shownCardinality = effectiveCardinality(inputs.scenario, inputs.rowCount, inputs.cardinality);
  const maxCardinality = Math.max(1, Math.min(inputs.rowCount, scenario.maxCardinality));

  const update = (changes: Partial<CompressionInputs>): void => setInputs((current) => ({ ...current, ...changes }));
  const changeScenario = (id: CompressionScenarioId): void => setInputs((current) => defaultInputsFor(id, current));

  // The encoding model does not change the generated column, so it is not a dependency.
  const column = useMemo(
    () => buildCompressionColumn(inputs),
    [inputs.scenario, inputs.customerColumn, inputs.rowCount, inputs.cardinality, inputs.nullPercent],
  );
  const estimate: CompressionEstimate = useMemo(
    () => estimateColumnCompression(column, inputs.segmentRowCount, { encoding }),
    [column, inputs.segmentRowCount, encoding],
  );
  const preview = useMemo(() => buildEncodedPreview(column, encoding), [column, encoding]);
  const insights = useMemo(() => explainCompressionEstimate(estimate), [estimate]);
  const singleChart = useMemo(
    () => buildCompressionChart([{ id: 'selected', label: estimate.columnName, estimate }]),
    [estimate],
  );

  const comparison = useMemo(
    () => compareCompression({ rowCount: inputs.rowCount, segmentRowCount: inputs.segmentRowCount, nullPercent: inputs.nullPercent }),
    [inputs.rowCount, inputs.segmentRowCount, inputs.nullPercent],
  );
  const comparisonChart = useMemo(
    () =>
      buildCompressionChart(
        comparison.flatMap((row) => [
          { id: `${row.id}-dictionary`, label: `${row.label} - dictionary`, estimate: row.dictionary },
          ...(row.value ? [{ id: `${row.id}-value`, label: `${row.label} - value`, estimate: row.value }] : []),
        ]),
      ),
    [comparison],
  );

  const otherOverhead = estimate.segmentOverheadBytes + estimate.columnOverheadBytes;
  const scale = column.scale;

  const breakdown = [
    { part: 'Original (uncompressed, modelled)', amount: estimate.originalBytes, how: 'Sum of every value at its modelled width' },
    ...(encoding === 'DICTIONARY'
      ? [
          {
            part: 'Dictionary (shared, counted once)',
            amount: estimate.dictionaryBytes,
            how: `${fmt(estimate.dictionaryEntryCount)} entr${estimate.dictionaryEntryCount === 1 ? 'y' : 'ies'}; each distinct value stored once at its original size`,
          },
        ]
      : []),
    {
      part: encoding === 'DICTIONARY' ? 'Encoded IDs' : 'Encoded values',
      amount: estimate.encodedValueBytes,
      how: `${fmt(estimate.rowCount)} rows x ${estimate.bitsPerStoredValue} bit(s), packed per segment and rounded up to whole bytes`,
    },
    {
      part: 'Segment overhead',
      amount: estimate.segmentOverheadBytes,
      how: `${fmt(estimate.segmentCount)} segment(s) x a fixed allowance`,
    },
    ...(estimate.columnOverheadBytes > 0
      ? [{ part: 'Column metadata (value model)', amount: estimate.columnOverheadBytes, how: 'Fixed allowance for the offset and scale' }]
      : []),
    { part: 'Total estimated compressed size', amount: estimate.totalCompressedBytes, how: 'Dictionary + encoded + overheads' },
  ];

  return (
    <div className="dictionary-explorer compression-explorer">
      <div className="explorer-header">
        <h2>Column Compression Explorer</h2>
        <p className="explorer-description">
          See how cardinality, data type and distribution change the estimated storage of one column, using the shared
          synthetic Customer table and the Module 3 segment model
        </p>
      </div>

      <div className="explanation-panel">
        <h3>Explanation ({explanationMode})</h3>
        {EXPLANATIONS[explanationMode].map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="controls-section">
        <div className="compression-controls-head">
          <h4 className="compression-controls-title">Data source</h4>
          <button type="button" className="compression-reset" onClick={() => setInputs(DEFAULT_COMPRESSION_INPUTS)}>
            Reset simulation
          </button>
        </div>
        <div className="compression-controls">
          <div className="control-group">
            <label htmlFor="compression-scenario-select">Value distribution</label>
            <select
              id="compression-scenario-select"
              className="compression-select"
              value={inputs.scenario}
              onChange={(e) => changeScenario(e.target.value as CompressionScenarioId)}
            >
              {COMPRESSION_SCENARIOS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>

          {inputs.scenario === 'CUSTOMER_COLUMN' && (
            <div className="control-group">
              <label htmlFor="compression-column-select">Customer column</label>
              <select
                id="compression-column-select"
                className="compression-select"
                value={inputs.customerColumn}
                onChange={(e) => update({ customerColumn: e.target.value })}
              >
                {CUSTOMER_COLUMNS.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name} ({entry.sourceType})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="control-group">
            <label htmlFor="compression-encoding-select">Modelled representation</label>
            <select
              id="compression-encoding-select"
              className="compression-select"
              value={encoding}
              onChange={(e) => update({ encoding: e.target.value as CompressionEncodingModel })}
            >
              <option value="DICTIONARY">Dictionary (each distinct value stored once)</option>
              <option value="VALUE" disabled={!valueAllowed}>
                Value (offset from the minimum, numeric and date only)
              </option>
            </select>
          </div>
        </div>
        <p className="compression-note">{scenario.description}</p>
        {!valueAllowed && <p className="compression-note">Text columns use the dictionary model only in this simulator.</p>}
        {valueAllowed && (
          <p className="compression-note">
            Microsoft documents that numeric data uses value encoding, so for numeric and date columns also try the
            Value representation. This module never decides which one a real engine uses.
          </p>
        )}

        <h4 className="compression-controls-title">Size and shape</h4>
        <div className="compression-controls">
          <div className="control-group">
            <label htmlFor="compression-rows-slider">Row count: {fmt(inputs.rowCount)}</label>
            <input
              id="compression-rows-slider"
              type="range"
              min="0"
              max="5000"
              step="100"
              value={inputs.rowCount}
              onChange={(e) => update({ rowCount: parseInt(e.target.value, 10) })}
            />
          </div>

          <div className="control-group">
            <label htmlFor="compression-cardinality-slider">
              Distinct values: {shownCardinality === null ? 'set by the data' : fmt(shownCardinality)}
              {cardinalityControl === 'ROWS' ? ' (one per row)' : ''}
            </label>
            <input
              id="compression-cardinality-slider"
              type="range"
              min="1"
              max={maxCardinality}
              step="1"
              value={Math.max(1, shownCardinality ?? 1)}
              disabled={cardinalityControl !== 'USER' || inputs.rowCount === 0}
              onChange={(e) => update({ cardinality: parseInt(e.target.value, 10) })}
            />
            {cardinalityControl !== 'USER' && (
              <span className="compression-hint">
                {cardinalityControl === 'ROWS' ? 'Every row is distinct in this distribution.' : 'Cardinality comes from the Customer data.'}
              </span>
            )}
          </div>

          <div className="control-group">
            <label htmlFor="compression-segment-slider">Rows per segment: {fmt(inputs.segmentRowCount)} (educational assumption)</label>
            <input
              id="compression-segment-slider"
              type="range"
              min="50"
              max="2000"
              step="50"
              value={inputs.segmentRowCount}
              onChange={(e) => update({ segmentRowCount: parseInt(e.target.value, 10) })}
            />
          </div>

          <div className="control-group">
            <label htmlFor="compression-null-select">Null share (approximate)</label>
            <select
              id="compression-null-select"
              className="compression-select"
              value={inputs.nullPercent}
              onChange={(e) => update({ nullPercent: parseInt(e.target.value, 10) })}
            >
              {NULL_PERCENT_OPTIONS.map((percent) => (
                <option key={percent} value={percent}>
                  {percent}%
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="compression-note">
          Boolean columns are not part of the shared Customer dataset, so they are not simulated here.
        </p>
      </div>

      <div className="results-section" aria-live="polite">
        <p className="compression-summary">
          <strong>Column:</strong> {estimate.columnName} ({estimate.sourceType}) &nbsp;
          <strong>Model:</strong> {encoding === 'DICTIONARY' ? 'dictionary' : 'value'} &nbsp;
          <strong>Every number below is a simulation, not a VertiPaq measurement.</strong>
        </p>

        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Rows</div>
            <div className="metric-value">{fmt(estimate.rowCount)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Distinct Values</div>
            <div className="metric-value">{fmt(estimate.cardinality)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Cardinality Ratio</div>
            <div className="metric-value">
              {estimate.cardinalityRatio.toFixed(3)} ({BAND_LABEL[estimate.cardinalityBand]})
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Original Estimated Size</div>
            <div className="metric-value">{bytes(estimate.originalBytes)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Dictionary Size</div>
            <div className="metric-value">{bytes(estimate.dictionaryBytes)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Encoded Value Size</div>
            <div className="metric-value">{bytes(estimate.encodedValueBytes)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Other Modelled Overhead</div>
            <div className="metric-value">{bytes(otherOverhead)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Total Estimated Compressed Size</div>
            <div className="metric-value">{bytes(estimate.totalCompressedBytes)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Compression Ratio</div>
            <div className="metric-value">{estimate.compressionRatio.toFixed(2)}x</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Estimated Memory Savings</div>
            <div className="metric-value">
              {signedBytes(estimate.savingsBytes)} ({estimate.savingsPercent.toFixed(1)}%)
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Dictionary Overhead %</div>
            <div className="metric-value">{estimate.dictionaryOverheadPercent.toFixed(1)}%</div>
          </div>
        </div>

        {estimate.savingsBytes < 0 && (
          <p className="compression-warning" role="status">
            In this model the column is larger than its original size. Negative savings are shown as a negative number;
            no size is ever negative.
          </p>
        )}

        {estimate.rowCount === 0 ? (
          <p className="compression-empty">There are no rows, so every size is 0 and there is nothing to compress.</p>
        ) : (
          <>
            <div className="compression-section">
              <h3>Estimated storage breakdown</h3>
              <CompressionBars rows={singleChart.rows} />
              <p className="compression-legend">
                Outline: the original size. Bar: the compressed parts as a share of it, in three parts:{' '}
                <span className="compression-key compression-key-dictionary">dictionary</span>{' '}
                <span className="compression-key compression-key-encoded">encoded values</span>{' '}
                <span className="compression-key compression-key-overhead">overhead</span>. The table gives the same
                numbers as text.
              </p>
              <table className="compression-table">
                <caption>Where the estimated bytes come from</caption>
                <thead>
                  <tr>
                    <th scope="col">Part</th>
                    <th scope="col">Bytes</th>
                    <th scope="col">Share of total compressed</th>
                    <th scope="col">How it is calculated</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row, index) => (
                    <tr key={row.part}>
                      <th scope="row">{row.part}</th>
                      <td>{fmt(row.amount)}</td>
                      <td>
                        {index === 0
                          ? '-'
                          : estimate.totalCompressedBytes > 0
                            ? `${((row.amount / estimate.totalCompressedBytes) * 100).toFixed(1)}%`
                            : '0.0%'}
                      </td>
                      <td className="compression-how">{row.how}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="compression-section compression-insights">
              <h3>How this estimate was calculated</h3>
              <ul>
                {insights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>

            <div className="compression-section">
              <h3>Original and encoded representation (first {preview.rows.length} rows)</h3>
              <div className="compression-split">
                <table className="compression-table">
                  <caption>
                    {encoding === 'DICTIONARY'
                      ? 'Each row stores a dictionary ID (IDs assigned in first-seen order, an assumption)'
                      : `Each row stores its distance from the minimum${preview.offset !== null ? ` (${fmt(preview.offset)} after scaling)` : ''}`}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Original</th>
                      <th scope="col">{encoding === 'DICTIONARY' ? 'Encoded ID' : 'Stored value'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.row}>
                        <td>{row.row}</td>
                        <td>{row.original}</td>
                        <td>{row.encoded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {encoding === 'DICTIONARY' && (
                  <table className="compression-table compression-dictionary-table">
                    <caption>
                      Dictionary: {fmt(preview.totalEntries)} entr{preview.totalEntries === 1 ? 'y' : 'ies'}
                      {preview.nullEntryId !== null ? `, including reserved ID ${preview.nullEntryId} for null` : ''}
                      {preview.totalEntries > preview.entries.length ? ` (first ${preview.entries.length} shown)` : ''}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">ID</th>
                        <th scope="col">Value</th>
                        <th scope="col">Bytes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.id}</td>
                          <td>{entry.value}</td>
                          <td>{entry.bytes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="compression-section">
              <h3>Segment-level statistics</h3>
              <div className="compression-table-scroll" role="region" aria-label="Segment statistics table" tabIndex={0}>
                <table className="compression-table compression-segment-table">
                  <caption>
                    Statistics computed from the values in each segment by the Module 3 model. The dictionary is shared, so
                    its bytes are not repeated per segment.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Segment</th>
                      <th scope="col">Rows</th>
                      <th scope="col">Nulls</th>
                      <th scope="col">Distinct</th>
                      <th scope="col">Min</th>
                      <th scope="col">Max</th>
                      <th scope="col">{encoding === 'DICTIONARY' ? 'ID bytes' : 'Value bytes'}</th>
                      <th scope="col">Metadata bytes</th>
                      <th scope="col">Segment bytes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.segments.map((segment) => (
                      <tr key={segment.segmentId}>
                        <th scope="row">{segment.segmentId}</th>
                        <td>{fmt(segment.rowCount)}</td>
                        <td>{fmt(segment.statistics.nullCount)}</td>
                        <td>{fmt(segment.statistics.distinctCount)}</td>
                        <td>{formatStat(segment.statistics.minValue, scale)}</td>
                        <td>{formatStat(segment.statistics.maxValue, scale)}</td>
                        <td>{fmt(segment.dataBytes)}</td>
                        <td>{fmt(segment.metadataBytes)}</td>
                        <td>{fmt(segment.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="compression-section">
          <h3>Compare examples and columns side by side</h3>
          <p className="compression-note">
            Same row count, segment size and null share as above. Each example uses its default distinct-value count.
            The smaller total is a comparison inside this model only, not an engine choice.
          </p>
          <div className="compression-table-scroll" role="region" aria-label="Comparison table" tabIndex={0}>
            <table className="compression-table compression-compare-table">
              <caption>Estimated storage by column and modelled representation</caption>
              <thead>
                <tr>
                  <th scope="col">Column</th>
                  <th scope="col">Type</th>
                  <th scope="col">Distinct</th>
                  <th scope="col">Cardinality</th>
                  <th scope="col">Original</th>
                  <th scope="col">Dictionary total</th>
                  <th scope="col">Dictionary ratio</th>
                  <th scope="col">Value total</th>
                  <th scope="col">Value ratio</th>
                  <th scope="col">Smaller in model</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => {
                  const d = row.dictionary;
                  const v = row.value;
                  const smaller = v === null ? 'Dictionary only' : v.totalCompressedBytes === d.totalCompressedBytes ? 'Tie' : v.totalCompressedBytes < d.totalCompressedBytes ? 'Value' : 'Dictionary';
                  return (
                    <tr key={row.id}>
                      <th scope="row">{row.label}</th>
                      <td>{d.dataType.toLowerCase()}</td>
                      <td>{fmt(d.cardinality)}</td>
                      <td>{BAND_LABEL[d.cardinalityBand].split(' ')[0]}</td>
                      <td>{fmt(d.originalBytes)}</td>
                      <td>{fmt(d.totalCompressedBytes)}</td>
                      <td>{d.compressionRatio.toFixed(2)}x</td>
                      <td>{v ? fmt(v.totalCompressedBytes) : 'n/a'}</td>
                      <td>{v ? `${v.compressionRatio.toFixed(2)}x` : 'n/a'}</td>
                      <td>{smaller}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CompressionBars rows={comparisonChart.rows} />
          <p className="compression-legend">
            Each bar is one column in one representation, as a share of that column's own original size (the outline).
            Bars longer than the outline are columns the model makes larger.
          </p>
        </div>

        <div className="compression-section">
          <h3>Assumptions behind every estimate</h3>
          <dl className="compression-assumptions">
            {describeCompressionAssumptions().map((item) => (
              <React.Fragment key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.text}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>
      </div>

      <div className="concepts-panel">
        <h3>Key Concepts</h3>
        <ul>
          <li>
            <strong>Cardinality:</strong> the number of distinct values in a column. The cardinality ratio is distinct
            values divided by non-null rows. The low, medium and high labels are teaching labels, not engine thresholds.
          </li>
          <li>
            <strong>Dictionary:</strong> each distinct value stored once. <strong>[SIMPLIFIED MODEL]</strong> One
            dictionary per column, shared by every segment and counted once.
          </li>
          <li>
            <strong>Encoded IDs:</strong> a small code per row, ceil(log2(entries)) bits, packed per segment.
          </li>
          <li>
            <strong>Value encoding:</strong> storing each number as its distance from the column minimum, so cost follows
            the range instead of the distinct count.
          </li>
          <li>
            <strong>Segment overhead:</strong> a fixed bookkeeping allowance per segment. Rows per segment is a setting,
            not an engine limit.
          </li>
          <li>
            <strong>Compression ratio and savings:</strong> original size divided by total estimated size. Savings are
            negative when the model makes the column larger.
          </li>
          <li>
            <strong>[DOCUMENTED]</strong> Numeric data uses value encoding and text uses hash encoding with a numeric ID
            per unique value; a numeric column may use either and the server normally detects which.
          </li>
          <li>
            <strong>[SIMULATION]</strong> The synthetic data and every size shown.
          </li>
          <li>
            <strong>[PROPRIETARY INTERNAL]</strong> The engine's real encoding choice, layouts and actual sizes.
          </li>
        </ul>
      </div>

      <div className="concepts-panel compression-examples">
        <h3>Practical Examples</h3>
        <p className="compression-example-intro">
          At 1,000 rows and 500 rows per segment with no nulls (ratios are this model's estimates):
        </p>
        <ul>
          <li>
            <strong>Low-cardinality text:</strong> 5 values, 3 bits per row. The dictionary is under 10% of the total and
            the ratio is about 16x.
          </li>
          <li>
            <strong>High-cardinality text:</strong> every row distinct, so the dictionary is over 90% of the total and the
            ratio is 0.93x: larger than the original.
          </li>
          <li>
            <strong>Sequential integers:</strong> 0.85x as a dictionary but about 5.7x with the Value representation,
            because the range is small while every value is distinct.
          </li>
          <li>
            <strong>Random integers:</strong> 500 distinct values over a wide range: about 1.5x as a dictionary and 4.0x
            as Value.
          </li>
          <li>
            <strong>Repeated decimals:</strong> 20 distinct values over a wide range: the dictionary wins, about 8.8x
            against 3.3x.
          </li>
          <li>
            <strong>Dates:</strong> 365 distinct days: about 1.9x as a dictionary and 5.7x as Value. Sorted dates give the
            same sizes, because this model has no run-length compression.
          </li>
          <li>
            <strong>Segment size:</strong> lower rows per segment to 50 and watch segment overhead grow while the
            dictionary stays the same.
          </li>
        </ul>
      </div>

      <div className="limitations-panel">
        <h3>Limitations & Assumptions</h3>
        <p>
          <strong>[SIMULATION]</strong> This module:
        </p>
        <ul>
          <li>Produces educational estimates. No ratio here is a VertiPaq measurement or a prediction of one.</li>
          <li>Models two representations that you choose between. It does not select an encoding and does not claim an engine always uses one.</li>
          <li>Uses fixed sizes: 8 bytes per number or date, a 4-byte prefix plus UTF-8 for text, bit-packed codes, 64 bytes per segment, 16 bytes of value-model metadata.</li>
          <li>Does not model run-length or other compression, paging, relationships, calculated columns or real dictionary layouts.</li>
          <li>Treats dates as whole-day numbers and compares them as ISO text; assigns dictionary IDs in first-seen order.</li>
          <li>Does not include Boolean columns, which the shared Customer dataset does not have.</li>
          <li>Treats the low, medium and high cardinality labels as teaching aids with no engine meaning.</li>
          <li>Actual VertiPaq compression depends on implementation details that are not fully documented publicly.</li>
        </ul>
      </div>

      <div className="compression-sources">
        <h3>Sources</h3>
        <ul>
          {getCompressionSourceReferences().map((source) => (
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

export default ColumnCompressionExplorer;
