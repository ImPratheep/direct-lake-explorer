import React, { useMemo, useState } from 'react';
import { EliminationOperator, EliminationPredicate, ExplanationMode, SegmentRowOrder } from '../types';
import { CUSTOMER_COLUMNS, dayNumberToIsoDate, generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../data/stage6-synthetic-dataset';
import { applyNullPattern, generateSegments } from '../data/stage6-segment-simulator';
import {
  buildEliminationRangeChart,
  ELIMINATION_OPERATORS,
  evaluateSegmentElimination,
  explainEliminationResult,
  formatEliminationValue,
  getEliminationSourceReferences,
  validateEliminationPredicate,
} from '../data/stage6-elimination-simulator';
// Shared Stage 6 panel styles (explorer header, explanation, controls, metric cards, concepts, limitations)
import './DictionaryEncodingExplorer.css';
import './SegmentEliminationSimulator.css';

interface SegmentEliminationSimulatorProps {
  explanationMode: ExplanationMode;
}

const DATA_TYPE_LABEL: Record<string, string> = { INTEGER: 'Integer', DECIMAL: 'Decimal', DATE: 'Date' };
const NULL_PERCENT_OPTIONS = [0, 5, 10, 25];

// Starting predicates per column. They are teaching defaults, chosen to show contrast between columns.
const DEFAULT_PREDICATES: Record<string, { operator: EliminationOperator; value: string; upper: string }> = {
  CustomerID: { operator: 'GT', value: '750', upper: '900' },
  Revenue: { operator: 'BETWEEN', value: '1000', upper: '2000' },
  LastPurchaseDate: { operator: 'GT', value: '2024-06-01', upper: '2024-09-01' },
};

const fmt = (n: number): string => n.toLocaleString('en-US');

const EXPLANATIONS: Record<ExplanationMode, string[]> = {
  beginner: [
    'Before reading a segment, a query can look at a small summary of it. Here the summary is the smallest and largest value in the segment.',
    'If the filter asks for values that cannot be inside that range, the segment can be skipped without reading its rows. If the range overlaps the filter, the summary cannot rule the segment out, so it is scanned.',
    'Scanned does not mean the segment has matching rows. It only means the summary could not prove it has none.',
  ],
  intermediate: [
    'A segment can be eliminated only when its min and max prove no value can match: greater than v needs max above v, greater than or equal needs max at or above v, less than v needs min below v, less than or equal needs min at or below v, equal needs v inside the range, between needs the ranges to intersect, and not equal can only rule out a segment whose values all equal v.',
    'Ranges are inclusive, so a range that touches the filter value exactly cannot be eliminated for greater-or-equal, less-or-equal, equal or between. Nulls never satisfy a comparison, so null rows do not keep a segment alive.',
    'When rows are not in order, every segment spans most of the value range and almost nothing can be eliminated. Sorting before segmenting (Module 3 controls) narrows the ranges.',
  ],
  advanced: [
    '[DOCUMENTED] Microsoft Fabric describes Delta file skipping: Delta Lake records per-file min, max and null count for indexed columns, the engine compares the predicate with each file\'s range, and a file whose range does not contain matches is skipped. The predicate value type must match the column type.',
    '[SIMPLIFIED MODEL] This module applies the same possibility test to the segment metadata computed in Module 3. It can rule a segment out; it can never prove a segment contains a match.',
    '[SIMULATION] The segments, their min, max and null counts, and every row count come from the synthetic Customer table through the Module 3 model.',
    '[PROPRIETARY INTERNAL] Whether VertiPaq segments carry min/max metadata, and how the Storage Engine would use it, is not covered by the documentation reviewed. This module does not claim it.',
  ],
};

const SegmentEliminationSimulator: React.FC<SegmentEliminationSimulatorProps> = ({ explanationMode }) => {
  const columns = CUSTOMER_COLUMNS.filter((column) => column.dataType !== 'TEXT');
  const [columnName, setColumnName] = useState<string>('CustomerID');
  const [rowCount, setRowCount] = useState<number>(1000);
  const [segmentRowCount, setSegmentRowCount] = useState<number>(250);
  const [rowOrder, setRowOrder] = useState<SegmentRowOrder>('AS_LOADED');
  const [nullPercent, setNullPercent] = useState<number>(0);
  const [operator, setOperator] = useState<EliminationOperator>(DEFAULT_PREDICATES.CustomerID.operator);
  const [valueText, setValueText] = useState<string>(DEFAULT_PREDICATES.CustomerID.value);
  const [upperText, setUpperText] = useState<string>(DEFAULT_PREDICATES.CustomerID.upper);

  const definition = columns.find((column) => column.name === columnName) ?? columns[0];
  const isDate = definition.dataType === 'DATE';

  const parseBound = (text: string): number | string => (isDate ? text : text.trim() === '' ? Number.NaN : Number(text));
  const predicate: EliminationPredicate = {
    operator,
    value: parseBound(valueText),
    upperValue: operator === 'BETWEEN' ? parseBound(upperText) : undefined,
  };
  const problem = validateEliminationPredicate(predicate, definition.dataType);

  // Segments come from the Module 3 model with the same controls. Module 4 does not generate its own.
  const segmentModel = useMemo(() => {
    const rows = generateSyntheticCustomerRows(rowCount);
    const column = applyNullPattern(getCustomerEncodingColumn(rows, definition.name), nullPercent);
    return generateSegments(column, segmentRowCount, { rowOrder });
  }, [rowCount, segmentRowCount, rowOrder, nullPercent, definition.name]);

  const result = useMemo(
    () =>
      problem
        ? null
        : evaluateSegmentElimination(segmentModel.segments, predicate, {
            columnName: definition.name,
            dataType: definition.dataType,
            scale: definition.scale,
          }),
    [segmentModel, problem, operator, valueText, upperText, definition.name],
  );

  const chart = useMemo(() => (result ? buildEliminationRangeChart(result) : null), [result]);
  const insights = useMemo(() => (result ? explainEliminationResult(result) : []), [result]);

  const formatAxis = (value: number | null): string => {
    if (value === null) return '-';
    return isDate ? dayNumberToIsoDate(value) : formatEliminationValue(value, definition.scale);
  };

  const changeColumn = (name: string): void => {
    const defaults = DEFAULT_PREDICATES[name];
    setColumnName(name);
    setOperator(defaults.operator);
    setValueText(defaults.value);
    setUpperText(defaults.upper);
  };

  const valueLabel = operator === 'BETWEEN' ? 'Lower bound (inclusive)' : 'Value';
  const inputType = isDate ? 'date' : 'number';

  return (
    <div className="dictionary-explorer elim-explorer">
      <div className="explorer-header">
        <h2>Segment Elimination Simulator</h2>
        <p className="explorer-description">
          See which segments a filter can rule out using only each segment's min and max, with the segments produced by
          the Module 3 model
        </p>
      </div>

      <div className="explanation-panel">
        <h3>Explanation ({explanationMode})</h3>
        {EXPLANATIONS[explanationMode].map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="controls-section">
        <h4 className="elim-controls-title">Predicate</h4>
        <div className="elim-controls">
          <div className="control-group">
            <label htmlFor="elim-column-select">Column</label>
            <select
              id="elim-column-select"
              className="elim-select"
              value={definition.name}
              onChange={(e) => changeColumn(e.target.value)}
            >
              {columns.map((column) => (
                <option key={column.name} value={column.name}>
                  {DATA_TYPE_LABEL[column.dataType]} - {column.name} ({column.sourceType})
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="elim-operator-select">Filter</label>
            <select
              id="elim-operator-select"
              className="elim-select"
              value={operator}
              onChange={(e) => setOperator(e.target.value as EliminationOperator)}
            >
              {ELIMINATION_OPERATORS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label} ({entry.symbol})
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="elim-value-input">{valueLabel}</label>
            <input
              id="elim-value-input"
              className="elim-input"
              type={inputType}
              step="any"
              value={valueText}
              onChange={(e) => setValueText(e.target.value)}
              aria-invalid={problem !== null}
            />
          </div>

          {operator === 'BETWEEN' && (
            <div className="control-group">
              <label htmlFor="elim-upper-input">Upper bound (inclusive)</label>
              <input
                id="elim-upper-input"
                className="elim-input"
                type={inputType}
                step="any"
                value={upperText}
                onChange={(e) => setUpperText(e.target.value)}
                aria-invalid={problem !== null}
              />
            </div>
          )}
        </div>

        <h4 className="elim-controls-title">Segments (Module 3 model settings)</h4>
        <div className="elim-controls">
          <div className="control-group">
            <label htmlFor="elim-rows-slider">Dataset size: {fmt(rowCount)} rows</label>
            <input
              id="elim-rows-slider"
              type="range"
              min="100"
              max="5000"
              step="100"
              value={rowCount}
              onChange={(e) => setRowCount(parseInt(e.target.value, 10))}
            />
          </div>

          <div className="control-group">
            <label htmlFor="elim-size-slider">Rows per segment: {fmt(segmentRowCount)} (educational assumption)</label>
            <input
              id="elim-size-slider"
              type="range"
              min="50"
              max="2000"
              step="50"
              value={segmentRowCount}
              onChange={(e) => setSegmentRowCount(parseInt(e.target.value, 10))}
            />
          </div>

          <div className="control-group">
            <label htmlFor="elim-order-select">Row order before segmenting</label>
            <select
              id="elim-order-select"
              className="elim-select"
              value={rowOrder}
              onChange={(e) => setRowOrder(e.target.value as SegmentRowOrder)}
            >
              <option value="AS_LOADED">As loaded</option>
              <option value="SORTED_ASCENDING">Sorted by this column (ascending)</option>
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="elim-null-select">Null share (approximate)</label>
            <select
              id="elim-null-select"
              className="elim-select"
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
      </div>

      {problem && (
        <p className="elim-problem" role="alert">
          {problem}
        </p>
      )}

      {result && chart && (
        <div className="results-section" aria-live="polite">
          <p className="elim-predicate-line">
            <strong>Predicate:</strong> <code>{result.predicateText}</code>. Null values never satisfy it.
          </p>

          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-label">Total Segments</div>
              <div className="metric-value">{fmt(result.totalSegments)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Segments Scanned</div>
              <div className="metric-value">{fmt(result.segmentsScanned)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Segments Eliminated</div>
              <div className="metric-value">{fmt(result.segmentsEliminated)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Rows Potentially Scanned</div>
              <div className="metric-value">{fmt(result.rowsPotentiallyScanned)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Rows Potentially Avoided</div>
              <div className="metric-value">{fmt(result.rowsPotentiallyAvoided)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Elimination Percentage</div>
              <div className="metric-value">{result.rowEliminationPercentage.toFixed(1)}%</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Segments Eliminated %</div>
              <div className="metric-value">{result.segmentEliminationPercentage.toFixed(1)}%</div>
            </div>
          </div>
          <p className="elim-note">
            Elimination Percentage is rows avoided divided by total rows. Scanned means the segment could not be ruled
            out from min and max. It does not mean the segment contains matching rows.
          </p>

          {result.totalSegments === 0 ? (
            <p className="elim-empty">There are no segments, so there is nothing to eliminate or scan.</p>
          ) : (
            <>
              <div className="elim-section">
                <h3>Segment ranges against the predicate</h3>
                <div className="elim-chart" aria-hidden="true">
                  {result.segments.map((segment, index) => {
                    const bar = chart.bars[index];
                    return (
                      <div className="elim-chart-row" key={segment.segmentId}>
                        <span className="elim-chart-label">Segment {segment.segmentId}</span>
                        <div className="elim-chart-track">
                          {chart.bands.map((band, bandIndex) => (
                            <span
                              key={bandIndex}
                              className="elim-chart-band"
                              style={{ left: `${band.leftPct}%`, width: `${band.widthPct}%` }}
                            />
                          ))}
                          {chart.markerPct !== null && (
                            <span className="elim-chart-marker" style={{ left: `${chart.markerPct}%` }} />
                          )}
                          {bar && (
                            <span
                              className={`elim-chart-bar ${segment.decision === 'ELIMINATED' ? 'elim-chart-bar-eliminated' : 'elim-chart-bar-scanned'}`}
                              style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                            />
                          )}
                        </div>
                        <span className="elim-chart-outcome">{segment.decision === 'ELIMINATED' ? 'Eliminated' : 'Scanned'}</span>
                      </div>
                    );
                  })}
                  {chart.hasDomain && (
                    <div className="elim-chart-axis">
                      <span>{formatAxis(chart.domainMin)}</span>
                      <span>{formatAxis(chart.domainMax)}</span>
                    </div>
                  )}
                </div>
                <p className="elim-legend">
                  Solid bar: a scanned segment's min-max range. Dashed bar: an eliminated segment's range. Shaded area:
                  the values the predicate accepts. The table below gives the same facts as text.
                </p>
              </div>

              <div className="elim-section">
                <h3>Why each segment was scanned or eliminated</h3>
                <div className="elim-table-scroll" role="region" aria-label="Segment elimination table" tabIndex={0}>
                  <table className="elim-table">
                    <caption>Decisions use only each segment's min, max and null count from the Module 3 model.</caption>
                    <thead>
                      <tr>
                        <th scope="col">Segment</th>
                        <th scope="col">Rows</th>
                        <th scope="col">Nulls</th>
                        <th scope="col">Min</th>
                        <th scope="col">Max</th>
                        <th scope="col">Decision</th>
                        <th scope="col">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.segments.map((segment) => (
                        <tr key={segment.segmentId} className={segment.decision === 'ELIMINATED' ? 'elim-row-eliminated' : 'elim-row-scanned'}>
                          <th scope="row">{segment.segmentId}</th>
                          <td>{fmt(segment.rowCount)}</td>
                          <td>{fmt(segment.nullCount)}</td>
                          <td>{formatEliminationValue(segment.minValue, definition.scale)}</td>
                          <td>{formatEliminationValue(segment.maxValue, definition.scale)}</td>
                          <td className="elim-decision">{segment.decision === 'ELIMINATED' ? 'Eliminated' : 'Scanned'}</td>
                          <td className="elim-reason">{segment.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <div className="elim-section elim-insights">
            <h3>What this result shows</h3>
            <ul>
              {insights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="concepts-panel">
        <h3>Key Concepts</h3>
        <ul>
          <li>
            <strong>Segment metadata:</strong> here, each segment's min, max and null count from the Module 3 model.
          </li>
          <li>
            <strong>Segment elimination:</strong> skipping a segment because its metadata proves no non-null value can
            match the filter.
          </li>
          <li>
            <strong>Possibility test:</strong> the metadata can rule a segment out but can never prove it has a match. A
            scanned segment may or may not contain matching rows.
          </li>
          <li>
            <strong>Overlap:</strong> when a segment's min-max range intersects the region the predicate accepts, min and
            max alone cannot eliminate it. Ranges are inclusive, so touching counts.
          </li>
          <li>
            <strong>Nulls:</strong> a comparison with null is never true. Null rows do not keep a segment alive, and a
            segment of only nulls is always eliminated.
          </li>
          <li>
            <strong>Segments scanned vs rows scanned:</strong> rows potentially scanned is every row in the scanned
            segments, including their nulls.
          </li>
          <li>
            <strong>[DOCUMENTED]</strong> Microsoft Fabric describes Delta file skipping with per-file min, max and null
            count. That is the Delta file layer, not VertiPaq segments.
          </li>
          <li>
            <strong>[SIMPLIFIED MODEL]</strong> The elimination rules applied to Module 3's segments.
          </li>
          <li>
            <strong>[SIMULATION]</strong> The synthetic data and every metadata value shown.
          </li>
          <li>
            <strong>[PROPRIETARY INTERNAL]</strong> Whether and how VertiPaq uses segment-level min and max.
          </li>
        </ul>
      </div>

      <div className="concepts-panel elim-examples">
        <h3>Practical Examples</h3>
        <ul>
          <li>
            <strong>CustomerID greater than 750</strong> (1,000 rows, 250 per segment, as loaded): the rows are in order,
            so 3 of 4 segments are eliminated and 75% of rows avoided. The last segment lies entirely inside the
            predicate, so it is scanned because its rows are needed.
          </li>
          <li>
            <strong>CustomerID equal to 250 or 251:</strong> 250 is exactly the max of segment 0, so that segment cannot
            be eliminated and the others can. Change the value to 251 and segment 1 is scanned instead.
          </li>
          <li>
            <strong>LastPurchaseDate greater than 2024-06-01:</strong> as loaded, the dates are not in order, so all 4
            segments overlap the predicate and none is eliminated. Choose "Sorted by this column" and 2 of 4 are
            eliminated.
          </li>
          <li>
            <strong>Revenue between 1,000 and 2,000:</strong> as loaded, no segment is eliminated. Sorted, 2 of 4 are
            eliminated, and the 2 scanned segments still overlap the predicate, so they may hold rows outside it.
          </li>
        </ul>
      </div>

      <div className="limitations-panel">
        <h3>Limitations & Assumptions</h3>
        <p>
          <strong>[SIMULATION]</strong> This module:
        </p>
        <ul>
          <li>Uses only the segments and statistics from the Module 3 model. It creates no segments or metadata of its own.</li>
          <li>Does not claim that VertiPaq segments carry min/max metadata or use it this way: that is [PROPRIETARY INTERNAL].</li>
          <li>Reports a possibility, not a result: it does not know how many rows in a scanned segment match.</li>
          <li>Treats segment ranges as closed, so a value equal to a segment's min or max keeps that segment.</li>
          <li>Treats nulls as never matching, including for not equal to.</li>
          <li>Supports numeric and date columns only. The value must match the column type. Text is not supported.</li>
          <li>Rows per segment is an educational assumption, and segment boundaries are not assumed to be even in value.</li>
          <li>Does not model filter evaluation inside scanned segments, compression, paging, or multiple predicates.</li>
        </ul>
      </div>

      <div className="elim-sources">
        <h3>Sources</h3>
        <ul>
          {getEliminationSourceReferences().map((source) => (
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

export default SegmentEliminationSimulator;
