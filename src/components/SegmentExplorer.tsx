import React, { useMemo, useState } from 'react';
import { ColumnOrderState, ExplanationMode, SegmentRowOrder, SegmentValue } from '../types';
import { CUSTOMER_COLUMNS, generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../data/stage6-synthetic-dataset';
import {
  applyNullPattern,
  DEFAULT_SEGMENT_ROW_COUNT,
  explainSegmentResult,
  generateSegments,
  getSegmentSourceReferences,
  MODELLED_SEGMENT_METADATA_BYTES,
} from '../data/stage6-segment-simulator';
// Shared Stage 6 panel styles (explorer header, explanation, controls, metric cards, concepts, limitations)
import './DictionaryEncodingExplorer.css';
import './SegmentExplorer.css';

interface SegmentExplorerProps {
  explanationMode: ExplanationMode;
}

const DATA_TYPE_LABEL: Record<string, string> = {
  INTEGER: 'Integer',
  DECIMAL: 'Decimal',
  DATE: 'Date',
  TEXT: 'Text',
};

const ORDER_LABEL: Record<ColumnOrderState, string> = {
  EMPTY: 'empty (no values)',
  CONSTANT: 'constant (one value)',
  ASCENDING: 'ascending',
  DESCENDING: 'descending',
  UNORDERED: 'unordered',
};

const NULL_PERCENT_OPTIONS = [0, 5, 10, 25];

const fmt = (n: number): string => n.toLocaleString('en-US');

const formatValue = (value: SegmentValue | undefined, scale: number): string => {
  if (value === null || value === undefined) return '-';
  return typeof value === 'number' && scale > 0 ? value.toFixed(scale) : String(value);
};

const EXPLANATIONS: Record<ExplanationMode, string[]> = {
  beginner: [
    "A column's rows are not stored as one long block. They are split into chunks called segments, each holding a run of rows.",
    'This simulator also records a small summary for every segment (its smallest and largest value, and how many nulls and distinct values it holds) so you can see how the data is spread across segments.',
    'The rows-per-segment number is a setting you choose to explore. It is not a fixed rule of any real engine.',
  ],
  intermediate: [
    'Each segment covers consecutive rows in the stored order. All segments of a column share one dictionary, and each row stores an ID into it.',
    'When the rows are in order for a column, each segment covers its own stretch of values. When they are not, almost every segment spans most of the value range, so the ranges overlap. Sorting before segmenting tightens the ranges.',
    'Module 4 uses these ranges to show why overlap limits what a filter can skip.',
  ],
  advanced: [
    '[DOCUMENTED] Microsoft Learn (INFO.STORAGETABLECOLUMNSEGMENTS) reports column storage per segment, with a segment number, record count, size, and the count of bits needed to store the Data IDs. It documents no fixed segment row count and no min/max metadata.',
    '[SIMULATION] Rows per segment is a configurable educational assumption. Boundaries fall every N rows in the stored order, and segments are not assumed to be evenly distributed in value.',
    '[SIMPLIFIED MODEL] One dictionary per column shared by all its segments; every row stores a bit-packed ID sized for the whole dictionary; nulls use one reserved ID; each segment carries a fixed 64-byte metadata allowance; min, max, distinct and null counts are computed here from the values.',
    '[PROPRIETARY INTERNAL] How the engine chooses segment boundaries and row order, and what metadata it keeps per segment, is not covered by the documentation reviewed.',
  ],
};

const SegmentExplorer: React.FC<SegmentExplorerProps> = ({ explanationMode }) => {
  const [columnName, setColumnName] = useState<string>('CustomerID');
  const [rowCount, setRowCount] = useState<number>(1000);
  const [segmentRowCount, setSegmentRowCount] = useState<number>(DEFAULT_SEGMENT_ROW_COUNT);
  const [rowOrder, setRowOrder] = useState<SegmentRowOrder>('AS_LOADED');
  const [nullPercent, setNullPercent] = useState<number>(0);
  const [selectedId, setSelectedId] = useState<number>(0);

  const definition = CUSTOMER_COLUMNS.find((column) => column.name === columnName) ?? CUSTOMER_COLUMNS[0];

  const result = useMemo(() => {
    const rows = generateSyntheticCustomerRows(rowCount);
    const column = applyNullPattern(getCustomerEncodingColumn(rows, definition.name), nullPercent);
    return generateSegments(column, segmentRowCount, { rowOrder });
  }, [rowCount, segmentRowCount, rowOrder, nullPercent, definition.name]);

  const insights = useMemo(() => explainSegmentResult(result), [result]);
  const selected = result.segments[Math.min(selectedId, result.segments.length - 1)];
  const lastSegment = result.segments[result.segments.length - 1];

  return (
    <div className="dictionary-explorer seg-explorer">
      <div className="explorer-header">
        <h2>Segment Explorer</h2>
        <p className="explorer-description">
          See how one column splits into segments, and how each segment's statistics compare, using the same synthetic
          Customer table as the other modules
        </p>
      </div>

      <div className="explanation-panel">
        <h3>Explanation ({explanationMode})</h3>
        {EXPLANATIONS[explanationMode].map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="controls-section seg-controls">
        <div className="control-group">
          <label htmlFor="seg-column-select">Column</label>
          <select
            id="seg-column-select"
            className="seg-select"
            value={columnName}
            onChange={(e) => {
              setColumnName(e.target.value);
              setSelectedId(0);
            }}
          >
            {CUSTOMER_COLUMNS.map((column) => (
              <option key={column.name} value={column.name}>
                {DATA_TYPE_LABEL[column.dataType]} - {column.name} ({column.sourceType})
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="seg-rows-slider">Dataset size: {fmt(rowCount)} rows</label>
          <input
            id="seg-rows-slider"
            type="range"
            min="100"
            max="5000"
            step="100"
            value={rowCount}
            onChange={(e) => setRowCount(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="seg-size-slider">Rows per segment: {fmt(segmentRowCount)} (educational assumption)</label>
          <input
            id="seg-size-slider"
            type="range"
            min="50"
            max="2000"
            step="50"
            value={segmentRowCount}
            onChange={(e) => {
              setSegmentRowCount(parseInt(e.target.value, 10));
              setSelectedId(0);
            }}
          />
        </div>

        <div className="control-group">
          <label htmlFor="seg-order-select">Row order before segmenting</label>
          <select
            id="seg-order-select"
            className="seg-select"
            value={rowOrder}
            onChange={(e) => setRowOrder(e.target.value as SegmentRowOrder)}
          >
            <option value="AS_LOADED">As loaded</option>
            <option value="SORTED_ASCENDING">Sorted by this column (ascending)</option>
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="seg-null-select">Null share (approximate)</label>
          <select
            id="seg-null-select"
            className="seg-select"
            value={nullPercent}
            onChange={(e) => setNullPercent(parseInt(e.target.value, 10))}
          >
            {NULL_PERCENT_OPTIONS.map((percent) => (
              <option key={percent} value={percent}>
                {percent}%
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="results-section" aria-live="polite">
        <p className="seg-order-line">
          <strong>Column order as loaded:</strong> {ORDER_LABEL[result.loadedOrder]}.{' '}
          <strong>As segmented:</strong> {ORDER_LABEL[result.segmentedOrder]}.
        </p>

        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Rows</div>
            <div className="metric-value">{fmt(result.totalRows)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Segments</div>
            <div className="metric-value">{fmt(result.segments.length)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Last Segment Rows</div>
            <div className="metric-value">{lastSegment ? fmt(lastSegment.rowCount) : '-'}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Dictionary Entries</div>
            <div className="metric-value">{fmt(result.dictionary.entryCount)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Bits per ID</div>
            <div className="metric-value">{result.dictionary.bitsPerId}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Overlapping Segments</div>
            <div className="metric-value">
              {fmt(result.overlappingSegmentCount)} of {fmt(result.segments.length)}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Null Rows</div>
            <div className="metric-value">{fmt(result.nullCount)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Modelled Size</div>
            <div className="metric-value">{fmt(result.totals.totalBytes)} B</div>
          </div>
        </div>

        {result.segments.length === 0 ? (
          <p className="seg-empty">There are no rows, so there are no segments.</p>
        ) : (
          <>
            <div className="seg-section">
              <h3>Segments (select one to inspect)</h3>
              <ul className="seg-strip" aria-label="Segments">
                {result.segments.map((segment) => {
                  const isSelected = segment.segmentId === selected.segmentId;
                  const fill = Math.round((segment.rowCount / result.segmentRowCount) * 100);
                  return (
                    <li key={segment.segmentId}>
                      <button
                        type="button"
                        className={`seg-tile ${segment.rangeOverlapsAnotherSegment ? 'seg-tile-overlap' : 'seg-tile-clear'} ${isSelected ? 'seg-tile-selected' : ''}`}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedId(segment.segmentId)}
                      >
                        <span className="seg-tile-title">Segment {segment.segmentId}</span>{' '}
                        <span className="seg-tile-rows">
                          Rows {fmt(segment.startRowIndex + 1)}-{fmt(segment.endRowIndex)}
                        </span>{' '}
                        <span className="seg-tile-range">
                          {formatValue(segment.statistics.minValue as SegmentValue, definition.scale)} to{' '}
                          {formatValue(segment.statistics.maxValue as SegmentValue, definition.scale)}
                        </span>{' '}
                        <span className="seg-tile-bar" aria-hidden="true">
                          <span className="seg-tile-bar-fill" style={{ width: `${fill}%` }} />
                        </span>{' '}
                        <span className="seg-tile-flag">
                          {segment.rangeOverlapsAnotherSegment ? 'Range overlaps another' : 'Range is distinct'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <section className="seg-section seg-detail" aria-labelledby="seg-detail-heading">
              <h3 id="seg-detail-heading">Segment {selected.segmentId} details</h3>
              <dl className="seg-facts">
                <dt>Row boundaries</dt>
                <dd>
                  rows {fmt(selected.startRowIndex + 1)} to {fmt(selected.endRowIndex)} ({fmt(selected.rowCount)} rows
                  {selected.isPartial ? ', shorter than the configured size' : ''})
                </dd>
                <dt>Min / max</dt>
                <dd>
                  {formatValue(selected.statistics.minValue as SegmentValue, definition.scale)} /{' '}
                  {formatValue(selected.statistics.maxValue as SegmentValue, definition.scale)}
                </dd>
                <dt>Nulls / distinct values</dt>
                <dd>
                  {fmt(selected.statistics.nullCount)} / {fmt(selected.statistics.distinctCount)}
                </dd>
                {selected.statistics.averageValue !== undefined && (
                  <>
                    <dt>Average / spread</dt>
                    <dd>
                      {selected.statistics.averageValue.toFixed(2)} / {(selected.statistics.standardDeviation ?? 0).toFixed(2)}
                    </dd>
                  </>
                )}
                <dt>Shared dictionary entries used</dt>
                <dd>
                  {fmt(selected.dictionaryEntriesReferenced)} of {fmt(result.dictionary.cardinality)} (
                  {Math.round(selected.dictionaryCoverage * 100)}%)
                </dd>
                <dt>Bits per ID</dt>
                <dd>{selected.bitsPerId}</dd>
                <dt>ID data / metadata (modelled)</dt>
                <dd>
                  {fmt(selected.dataBytes)} B / {fmt(selected.metadataBytes)} B
                </dd>
                <dt>Range vs other segments</dt>
                <dd>{selected.rangeOverlapsAnotherSegment ? 'overlaps at least one other segment' : 'does not overlap any other segment'}</dd>
              </dl>
            </section>

            <div className="seg-section">
              <h3>Compare segment statistics</h3>
              <div className="seg-table-scroll" role="region" aria-label="Segment statistics table" tabIndex={0}>
                <table className="seg-table">
                  <caption>
                    Statistics computed from the values in each segment. Dictionary share is the part of the column's
                    shared dictionary the segment uses.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Segment</th>
                      <th scope="col">Rows</th>
                      <th scope="col">Nulls</th>
                      <th scope="col">Distinct</th>
                      <th scope="col">Min</th>
                      <th scope="col">Max</th>
                      <th scope="col">Dictionary share</th>
                      <th scope="col">Size (B)</th>
                      <th scope="col">Range overlap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.segments.map((segment) => (
                      <tr key={segment.segmentId} aria-current={segment.segmentId === selected.segmentId ? 'true' : undefined}>
                        <th scope="row">{segment.segmentId}</th>
                        <td>{fmt(segment.rowCount)}</td>
                        <td>{fmt(segment.statistics.nullCount)}</td>
                        <td>{fmt(segment.statistics.distinctCount)}</td>
                        <td>{formatValue(segment.statistics.minValue as SegmentValue, definition.scale)}</td>
                        <td>{formatValue(segment.statistics.maxValue as SegmentValue, definition.scale)}</td>
                        <td>{Math.round(segment.dictionaryCoverage * 100)}%</td>
                        <td>{fmt(segment.size)}</td>
                        <td>{segment.rangeOverlapsAnotherSegment ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        <div className="seg-section seg-insights">
          <h3>What this result shows</h3>
          <ul>
            {insights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="seg-lineage">
            <strong>Same column across stages:</strong> {result.columnName} is {result.sourceType} in the Stage 5 Delta
            Lake schema and Parquet file. Here its rows are grouped into segments of your chosen size, and every segment
            shares the column's single dictionary (the idea from Modules 1 and 2).
          </p>
        </div>
      </div>

      <div className="concepts-panel">
        <h3>Key Concepts</h3>
        <ul>
          <li>
            <strong>Segment:</strong> a chunk of consecutive rows of one column.
          </li>
          <li>
            <strong>Rows per segment:</strong> a setting here. <strong>[SIMULATION]</strong> It is an educational
            assumption, not a fixed limit of any real engine.
          </li>
          <li>
            <strong>Segment boundary:</strong> where one segment ends and the next begins. Here it falls every N rows in
            the stored order; the last segment may be shorter.
          </li>
          <li>
            <strong>Segment-level statistics:</strong> min, max, distinct count and null count for the rows in one
            segment. <strong>[SIMPLIFIED MODEL]</strong> They are computed here from the values; the metadata a real
            engine keeps is <strong>[PROPRIETARY INTERNAL]</strong>.
          </li>
          <li>
            <strong>Shared dictionary:</strong> <strong>[SIMPLIFIED MODEL]</strong> one dictionary per column, used by
            every segment of that column. A segment references only the entries for values it contains.
          </li>
          <li>
            <strong>Overlapping range:</strong> two segments whose min-max ranges intersect (touching at one value
            counts). Overlap is what limits how much a range filter could skip in Module 4.
          </li>
          <li>
            <strong>Ordered vs unordered:</strong> whether the column's values rise (or fall) down the rows.
          </li>
          <li>
            <strong>[DOCUMENTED]</strong> Microsoft Learn describes column storage reported per segment, with a record
            count, size and the bits needed for Data IDs.
          </li>
          <li>
            <strong>[SIMULATION]</strong> The synthetic Customer rows, the null pattern and every size shown.
          </li>
        </ul>
      </div>

      <div className="concepts-panel seg-examples">
        <h3>Practical Examples</h3>
        <ul>
          <li>
            <strong>CustomerID (ordered key):</strong> at 1,000 rows and 250 per segment each segment covers its own block
            of IDs and no ranges overlap.
          </li>
          <li>
            <strong>LastPurchaseDate (unordered):</strong> at 1,000 rows and 250 per segment every segment holds dates
            from across the whole two years, so every range overlaps. Choose "Sorted by this column" and each range
            narrows to a run of consecutive dates. Neighbouring segments can still touch at a shared boundary date,
            which counts as overlap.
          </li>
          <li>
            <strong>Revenue:</strong> at 1,000 rows and 250 per segment, add a 10% null share to see null counts differ
            from segment to segment, and watch the dictionary gain one reserved entry.
          </li>
          <li>
            <strong>Region (text, 5 values):</strong> at 1,000 rows and 50 rows per segment, every segment uses all five
            dictionary entries unless you sort the rows first.
          </li>
        </ul>
      </div>

      <div className="limitations-panel">
        <h3>Limitations & Assumptions</h3>
        <p>
          <strong>[SIMULATION]</strong> This module:
        </p>
        <ul>
          <li>Treats rows per segment as a setting you choose. It does not state or imply a real segment size.</li>
          <li>Cuts segments every N rows in the stored order. Real boundaries and row order are an engine decision.</li>
          <li>Does not assume segments are evenly distributed in value. Overlap is computed from the data.</li>
          <li>
            Uses fixed educational sizes: {MODELLED_SEGMENT_METADATA_BYTES} bytes of metadata per segment, 8 bytes per
            number or date, a 4-byte length prefix plus UTF-8 for text, bit-packed IDs.
          </li>
          <li>Models nulls as one reserved dictionary ID, and places them at deterministic pseudo-random rows.</li>
          <li>Compares text by code unit and dates as ISO text; a real engine may order text differently.</li>
          <li>Does not model compression beyond bit-packing, paging, partitions, or how segments are built or loaded.</li>
          <li>Presents calculated statistics only. They are not metadata read from any engine.</li>
        </ul>
      </div>

      <div className="seg-sources">
        <h3>Sources</h3>
        <ul>
          {getSegmentSourceReferences().map((source) => (
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

export default SegmentExplorer;
