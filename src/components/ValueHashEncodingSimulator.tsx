import React, { useMemo, useState } from 'react';
import { ExplanationMode } from '../types';
import { CUSTOMER_COLUMNS, generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../data/stage6-synthetic-dataset';
import {
  compareValueAndHashEncoding,
  explainEncodingResult,
  getEncodingSourceReferences,
} from '../data/stage6-encoding-simulator';
// Shared Stage 6 panel styles (explorer header, explanation, controls, metric cards, concepts, limitations)
import './DictionaryEncodingExplorer.css';
import './ValueHashEncodingSimulator.css';

interface ValueHashEncodingSimulatorProps {
  explanationMode: ExplanationMode;
}

const DATA_TYPE_LABEL: Record<string, string> = {
  INTEGER: 'Integer',
  DECIMAL: 'Decimal',
  DATE: 'Date',
  TEXT: 'Text',
};

const SAMPLE_ROWS = 8;

const formatBytes = (bytes: number): string => `${bytes.toLocaleString('en-US')} B`;

const formatOriginal = (value: number | string | undefined, scale: number): string =>
  typeof value === 'number' ? value.toFixed(scale) : String(value);

const EXPLANATIONS: Record<ExplanationMode, string[]> = {
  beginner: [
    'A column can be stored in two ways. Value encoding keeps numbers as numbers but stores how far each one is from the smallest value, which needs fewer bits.',
    'Hash encoding puts each distinct value into a lookup list (a dictionary) and stores a small ID for every row.',
    'Both are lossless: the original value can always be recovered.',
  ],
  intermediate: [
    'Value encoding cost follows the range (max - min). Hash encoding cost follows the number of distinct values plus the dictionary itself.',
    'A sequential key has a small range but as many distinct values as rows. A column with few distinct values spread over a huge range is the opposite. One extreme value (such as the sentinel date 9999-12-31) widens the range for every row.',
    'This module compares modelled sizes only. It does not predict which encoding the engine selects.',
  ],
  advanced: [
    '[DOCUMENTED] Microsoft Learn (TOM reference) states that a numeric column may use value-based or hash-based encoding, that the server normally detects which to use, and that re-encoding may occur later. An encoding hint (Default, Hash, Value) exists at compatibility level 1400 or above.',
    '[SIMPLIFIED MODEL] Both encodings are bit-packed here: value states = range + 1, hash states = distinct values, bits = ceil(log2(states)), minimum 1. Dictionary entries and metadata use fixed educational byte sizes.',
    '[PROPRIETARY INTERNAL] The engine\'s selection rule, hash function, dictionary layout and any further compression are not published and are not modelled. Which encoding Direct Lake applies when it loads Parquet columns is also not documented in the sources reviewed.',
  ],
};

const SizeBar: React.FC<{ label: string; bytes: number; maxBytes: number; variant: string }> = ({
  label,
  bytes,
  maxBytes,
  variant,
}) => {
  const percent = maxBytes > 0 ? Math.max(2, Math.round((bytes / maxBytes) * 100)) : 0;
  return (
    <div className="vh-bar-row">
      <span className="vh-bar-label">{label}</span>
      <div className="vh-bar-track" aria-hidden="true">
        <div className={`vh-bar-fill vh-bar-${variant}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="vh-bar-amount">{formatBytes(bytes)}</span>
    </div>
  );
};

const ValueHashEncodingSimulator: React.FC<ValueHashEncodingSimulatorProps> = ({ explanationMode }) => {
  const [columnName, setColumnName] = useState<string>('CustomerID');
  const [rowCount, setRowCount] = useState<number>(1000);
  const [includeOutlier, setIncludeOutlier] = useState<boolean>(false);

  const definition = CUSTOMER_COLUMNS.find((column) => column.name === columnName) ?? CUSTOMER_COLUMNS[0];
  const isText = definition.dataType === 'TEXT';

  const result = useMemo(() => {
    const rows = generateSyntheticCustomerRows(rowCount);
    const column = getCustomerEncodingColumn(rows, definition.name);
    return compareValueAndHashEncoding(column, { includeOutlier });
  }, [rowCount, definition.name, includeOutlier]);

  const sampleIndexes = useMemo(() => {
    const indexes = Array.from({ length: Math.min(SAMPLE_ROWS, result.rowCount) }, (_, i) => i);
    if (result.rowCount > SAMPLE_ROWS) {
      indexes.push(result.rowCount - 1);
    }
    return indexes;
  }, [result.rowCount]);

  const insights = useMemo(() => explainEncodingResult(result), [result]);
  const maxBits = Math.max(result.value.bitsPerValue, result.hash.bitsPerId, 1);
  const maxBytes = Math.max(result.baselineBytes, result.value.totalBytes, result.hash.totalBytes);
  const smallerLabel =
    result.smallerInModel === null
      ? 'Hash only (text)'
      : result.smallerInModel === 'TIE'
        ? 'Tie'
        : result.smallerInModel === 'VALUE'
          ? 'Value'
          : 'Hash';

  return (
    <div className="dictionary-explorer vh-simulator">
      <div className="explorer-header">
        <h2>Value vs Hash Encoding Simulator</h2>
        <p className="explorer-description">
          Compare two ways a column can be encoded, using the same synthetic Customer table as the Delta Lake and
          Parquet modules
        </p>
      </div>

      <div className="explanation-panel">
        <h3>Explanation ({explanationMode})</h3>
        {EXPLANATIONS[explanationMode].map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>

      <div className="controls-section">
        <div className="control-group">
          <label htmlFor="vh-column-select">Column</label>
          <select
            id="vh-column-select"
            className="vh-select"
            value={columnName}
            onChange={(e) => {
              setColumnName(e.target.value);
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
          <label htmlFor="vh-rows-slider">Rows: {rowCount.toLocaleString('en-US')}</label>
          <input
            id="vh-rows-slider"
            type="range"
            min="100"
            max="5000"
            step="100"
            value={rowCount}
            onChange={(e) => setRowCount(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="control-group vh-checkbox-group">
          <label htmlFor="vh-outlier-checkbox" className="vh-checkbox-label">
            <input
              id="vh-outlier-checkbox"
              type="checkbox"
              checked={includeOutlier && !isText}
              disabled={isText}
              onChange={(e) => setIncludeOutlier(e.target.checked)}
            />
            Add one extreme value to the last row (widens the range)
          </label>
          {isText && <span className="vh-hint">Not available for text columns: text has no numeric range.</span>}
        </div>
      </div>

      <div className="results-section" aria-live="polite">
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Rows</div>
            <div className="metric-value">{result.rowCount.toLocaleString('en-US')}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Distinct Values</div>
            <div className="metric-value">{result.hash.cardinality.toLocaleString('en-US')}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Uncompressed (model)</div>
            <div className="metric-value">{formatBytes(result.baselineBytes)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Value Encoded</div>
            <div className="metric-value">{result.value.applicable ? formatBytes(result.value.totalBytes) : 'N/A'}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Hash Encoded</div>
            <div className="metric-value">{formatBytes(result.hash.totalBytes)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Smaller In This Model</div>
            <div className="metric-value">{smallerLabel}</div>
          </div>
        </div>

        <div className="vh-chart" role="group" aria-label="Modelled size comparison">
          <h3>Modelled size</h3>
          <SizeBar label="Uncompressed" bytes={result.baselineBytes} maxBytes={maxBytes} variant="base" />
          {result.value.applicable && (
            <SizeBar label="Value encoded" bytes={result.value.totalBytes} maxBytes={maxBytes} variant="value" />
          )}
          <SizeBar label="Hash encoded" bytes={result.hash.totalBytes} maxBytes={maxBytes} variant="hash" />
        </div>

        <div className="vh-panels">
          <section className="vh-panel" aria-labelledby="vh-value-heading">
            <h3 id="vh-value-heading">Value encoding</h3>
            {result.value.applicable ? (
              <>
                <dl className="vh-facts">
                  <dt>Offset (minimum)</dt>
                  <dd>{result.value.offset.toLocaleString('en-US')}</dd>
                  <dt>Range (max - min)</dt>
                  <dd>{result.value.range.toLocaleString('en-US')}</dd>
                  <dt>Bits per value</dt>
                  <dd>{result.value.bitsPerValue}</dd>
                  <dt>Data / metadata</dt>
                  <dd>
                    {formatBytes(result.value.dataBytes)} / {formatBytes(result.value.metadataBytes)}
                  </dd>
                </dl>
                <div className="vh-bits" aria-hidden="true">
                  <div className="vh-bits-fill vh-bar-value" style={{ width: `${(result.value.bitsPerValue / maxBits) * 100}%` }} />
                </div>
                <table className="vh-table">
                  <caption>Original value to stored value (stored = scaled original - offset)</caption>
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">Original</th>
                      <th scope="col">Stored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sampleIndexes.map((index) => (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td>{formatOriginal(result.hash.dictionary[result.hash.ids[index]], definition.scale)}</td>
                        <td>{result.value.storedValues[index].toLocaleString('en-US')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="vh-na">{result.value.notApplicableReason}</p>
            )}
          </section>

          <section className="vh-panel" aria-labelledby="vh-hash-heading">
            <h3 id="vh-hash-heading">Hash encoding</h3>
            <dl className="vh-facts">
              <dt>Distinct values</dt>
              <dd>{result.hash.cardinality.toLocaleString('en-US')}</dd>
              <dt>Bits per ID</dt>
              <dd>{result.hash.bitsPerId}</dd>
              <dt>Data / dictionary</dt>
              <dd>
                {formatBytes(result.hash.dataBytes)} / {formatBytes(result.hash.dictionaryBytes)}
              </dd>
            </dl>
            <div className="vh-bits" aria-hidden="true">
              <div className="vh-bits-fill vh-bar-hash" style={{ width: `${(result.hash.bitsPerId / maxBits) * 100}%` }} />
            </div>
            <table className="vh-table">
              <caption>Original value to dictionary ID (lossless lookup)</caption>
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Original</th>
                  <th scope="col">ID</th>
                </tr>
              </thead>
              <tbody>
                {sampleIndexes.map((index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>{formatOriginal(result.hash.dictionary[result.hash.ids[index]], definition.scale)}</td>
                    <td>{result.hash.ids[index]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div className="vh-insights">
          <h3>What this result shows</h3>
          <ul>
            {insights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="vh-lineage">
            <strong>Same column across stages:</strong> {result.columnName} is {result.sourceType} in the Stage 5
            Delta Lake schema and Parquet file; here it is shown as {result.value.applicable ? 'an offset integer and as a dictionary' : 'a dictionary'}.
            <strong> [PROPRIETARY INTERNAL]</strong> How Direct Lake chooses a VertiPaq encoding while loading a Parquet
            column is not documented in the sources reviewed.
          </p>
        </div>
      </div>

      <div className="concepts-panel">
        <h3>Key Concepts</h3>
        <ul>
          <li>
            <strong>Value encoding:</strong> stores each number as its distance from the column minimum. Cost follows
            the range (max - min).
          </li>
          <li>
            <strong>Hash encoding:</strong> stores each distinct value once in a dictionary and an ID per row. Cost
            follows the distinct count. It is lossless; it does not replace data with an irreversible hash.
          </li>
          <li>
            <strong>Bit-packing:</strong> n possible values need ceil(log2 n) bits per row.
          </li>
          <li>
            <strong>Cardinality:</strong> the number of distinct values in the column.
          </li>
          <li>
            <strong>[DOCUMENTED]</strong> A numeric column may use either encoding; the server normally detects which,
            and an encoding hint (Default, Hash, Value) can be set at compatibility level 1400 or above.
          </li>
          <li>
            <strong>[SIMPLIFIED MODEL]</strong> The offset and bit-packing description above, and the fixed byte sizes
            used for dictionary entries and metadata.
          </li>
          <li>
            <strong>[SIMULATION]</strong> The synthetic Customer rows and the size totals shown.
          </li>
          <li>
            <strong>[PROPRIETARY INTERNAL]</strong> The engine's selection rule and re-encoding triggers.
          </li>
        </ul>
      </div>

      <div className="concepts-panel vh-examples">
        <h3>Practical Examples</h3>
        <ul>
          <li>
            <strong>Integer, CustomerID:</strong> sequential 1..n. The range is small, but every row is distinct, so
            the dictionary is as large as the column. Compare both sizes at 1,000 rows.
          </li>
          <li>
            <strong>Decimal, Revenue:</strong> two decimal places are scaled by 100 into whole numbers, then offset.
          </li>
          <li>
            <strong>Date, LastPurchaseDate:</strong> dates are treated as whole-day numbers (a simplification). Tick the
            extreme-value box and move to 5,000 rows: the 9999-12-31 sentinel widens the range enough for hash
            encoding to become smaller in this model.
          </li>
          <li>
            <strong>Text, Region / CustomerName:</strong> no numeric range exists, so only the dictionary path applies.
          </li>
        </ul>
      </div>

      <div className="limitations-panel">
        <h3>Limitations & Assumptions</h3>
        <p>
          <strong>[SIMULATION]</strong> This module:
        </p>
        <ul>
          <li>Does not decide or predict which encoding VertiPaq or Direct Lake would select.</li>
          <li>Uses fixed educational sizes: 8 bytes per number, 4-byte text length prefix, 16 bytes of value-encoding metadata.</li>
          <li>Models a constant column as 1 bit per row.</li>
          <li>Does not model run-length or any other compression, re-encoding, or segment boundaries.</li>
          <li>Treats dates as whole-day numbers and text as dictionary-only.</li>
          <li>Reports sizes in this model only; they are not measurements of any real engine.</li>
        </ul>
      </div>

      <div className="vh-sources">
        <h3>Sources</h3>
        <ul>
          {getEncodingSourceReferences().map((source) => (
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

export default ValueHashEncodingSimulator;
