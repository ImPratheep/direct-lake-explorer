import React, { useState, useCallback } from 'react';
import { ExplanationMode, FilterCondition, ParquetFileMetadata, PredicatePushdownResult } from '../types';
import './PredicatePushdownSimulator.css';
import { evaluatePredicatePushdown } from '../data/stage5-delta-lake-parquet';
import { FiInfo } from 'react-icons/fi';

interface PredicatePushdownSimulatorProps {
  explanationMode: ExplanationMode;
  parquetFile: ParquetFileMetadata;
  /** UI Review Mode: open with the default predicate already evaluated instead of an empty results area. */
  startRepresentative?: boolean;
}

const PredicatePushdownSimulator: React.FC<PredicatePushdownSimulatorProps> = ({
  explanationMode,
  parquetFile,
  startRepresentative = false,
}) => {
  const [columnName, setColumnName] = useState<string>('CustomerID');
  const [operator, setOperator] = useState<FilterCondition['operator']>('=');
  const [value, setValue] = useState<string>('2500');
  const [result, setResult] = useState<PredicatePushdownResult | null>(() =>
    startRepresentative ? evaluatePredicatePushdown(parquetFile, [{ columnName: 'CustomerID', operator: '=', value: 2500 }]) : null,
  );

  const handleSimulate = useCallback(() => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return;

    const condition: FilterCondition = {
      columnName,
      operator,
      value: numValue,
    };

    const evaluationResult = evaluatePredicatePushdown(parquetFile, [condition]);
    setResult(evaluationResult);
  }, [columnName, operator, value, parquetFile]);

  const getExplanation = (): string => {
    if (explanationMode === 'beginner') {
      return 'Predicate pushdown uses row group statistics to skip data blocks that cannot contain matching rows.';
    } else if (explanationMode === 'intermediate') {
      return 'Before scanning row groups, the query engine checks min/max statistics. If a condition cannot be satisfied by any row in a row group, the entire row group is skipped.';
    } else {
      return 'Predicate pushdown evaluation: (1) Extract min/max from row group footer; (2) For equality, eliminate if value < min or value > max; (3) For range conditions, eliminate if range is disjoint from [min, max]; (4) Eliminate row groups early without page-level IO.';
    }
  };

  const formatRowCount = (count: number): string => {
    return count.toLocaleString();
  };

  return (
    <div className="predicate-pushdown-simulator">
      <div className="simulator-header">
        <h2>Predicate Pushdown Simulator</h2>
        <p className="simulator-description">
          {explanationMode === 'beginner'
            ? 'See how the query engine uses row group statistics to skip data blocks.'
            : 'Simulate predicate pushdown evaluation using Parquet row group statistics.'}
        </p>
      </div>

      <div className="simulator-controls">
        <div className="control-group">
          <label htmlFor="column-select">Column:</label>
          <select id="column-select" value={columnName} onChange={(e) => setColumnName(e.target.value)}>
            {parquetFile.columns.map((col) => (
              <option key={col.name} value={col.name}>
                {col.name} ({col.type})
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="operator-select">Operator:</label>
          <select id="operator-select" value={operator} onChange={(e) => setOperator(e.target.value as any)}>
            <option value="=">=</option>
            <option value="!=">!=</option>
            <option value="<">&lt;</option>
            <option value=">">&gt;</option>
            <option value="<=">&lt;=</option>
            <option value=">=">&gt;=</option>
            <option value="IN">IN</option>
            <option value="BETWEEN">BETWEEN</option>
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="value-input">Value:</label>
          <input
            id="value-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter value"
          />
        </div>

        <button className="simulate-button" onClick={handleSimulate}>
          Simulate Predicate Pushdown
        </button>
      </div>

      {result && (
        <>
          <div className="simulator-explanation">
            <FiInfo className="info-icon" />
            <div>
              <h4>How This Works</h4>
              <p>{getExplanation()}</p>
            </div>
          </div>

          <div className="simulator-results">
            <div className="results-summary">
              <h4>Evaluation Results</h4>

              <div className="metrics-grid">
                <div className="metric">
                  <span className="metric-label">Total Row Groups:</span>
                  <span className="metric-value">{result.totalRowGroups}</span>
                </div>
                <div className="metric scanned">
                  <span className="metric-label">Row Groups Scanned:</span>
                  <span className="metric-value">{result.rowGroupsScanned}</span>
                </div>
                <div className="metric skipped">
                  <span className="metric-label">Row Groups Skipped:</span>
                  <span className="metric-value">{result.rowGroupsSkipped}</span>
                </div>
                <div className="metric reduction">
                  <span className="metric-label">Reduction:</span>
                  <span className="metric-value">{result.estimatedReduction}%</span>
                </div>
              </div>

              <div className="row-metrics">
                <div className="row-metric scanned">
                  <span className="metric-label">Rows Scanned:</span>
                  <span className="metric-value">{formatRowCount(result.rowsScanned)}</span>
                </div>
                <div className="row-metric skipped">
                  <span className="metric-label">Rows Avoided:</span>
                  <span className="metric-value">{formatRowCount(result.rowsSkipped)}</span>
                </div>
              </div>
            </div>

            {explanationMode !== 'beginner' && (
              <div className="evaluation-details">
                <h4>Row Group Evaluation</h4>
                <table className="evaluation-table">
                  <thead>
                    <tr>
                      <th>RG</th>
                      <th>Min Value</th>
                      <th>Max Value</th>
                      <th>Condition</th>
                      <th>Decision</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.evaluatedRowGroups.map((rowGroupEval) => (
                      <tr key={rowGroupEval.rowGroupIndex} className={rowGroupEval.canEliminate ? 'eliminated' : 'scanned'}>
                        <td>{rowGroupEval.rowGroupIndex}</td>
                        <td>{String(rowGroupEval.minValue).substring(0, 15)}</td>
                        <td>{String(rowGroupEval.maxValue).substring(0, 15)}</td>
                        <td>
                          {rowGroupEval.condition.columnName} {rowGroupEval.condition.operator} {String(rowGroupEval.condition.value)}
                        </td>
                        <td className={rowGroupEval.canEliminate ? 'skip-badge' : 'scan-badge'}>
                          {rowGroupEval.canEliminate ? 'SKIP' : 'SCAN'}
                        </td>
                        <td className="reason">{rowGroupEval.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="pushdown-concepts">
        <h4>Key Concepts</h4>
        <ul>
          <li>
            <strong>Statistics:</strong> Parquet files store min/max values per row group (footer metadata)
          </li>
          <li>
            <strong>Early Elimination:</strong> Query engine checks conditions before scanning row group data
          </li>
          <li>
            <strong>Query Performance:</strong> Skipping row groups reduces IO and processing time significantly
          </li>
          <li>
            <strong>Limitations:</strong> Cannot eliminate if: statistics unavailable, condition overlaps range, or
            statistics have wide ranges
          </li>
          <li>
            <strong>vs. DirectQuery:</strong> Direct Lake benefits from predicate pushdown on in-memory columns,
            unlike traditional SQL pushdown
          </li>
        </ul>
      </div>
    </div>
  );
};

export default PredicatePushdownSimulator;
