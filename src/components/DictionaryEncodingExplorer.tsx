import React, { useMemo, useState } from 'react';
import { ExplanationMode } from '../types';
import { generateDictionaryEncoding } from '../data/stage6-vertipaq-simulator';
import { CUSTOMER_COLUMNS, generateSyntheticCustomerRows, getCustomerEncodingColumn } from '../data/stage6-synthetic-dataset';
import { getEncodingSourceReferences } from '../data/stage6-encoding-simulator';
import './DictionaryEncodingExplorer.css';

interface DictionaryEncodingExplorerProps {
  explanationMode: ExplanationMode;
}

const DATA_TYPE_LABEL: Record<string, string> = {
  INTEGER: 'Integer',
  DECIMAL: 'Decimal',
  DATE: 'Date',
  TEXT: 'Text',
};

const formatBytes = (bytes: number): string => `${bytes.toLocaleString('en-US')} B`;

const formatValue = (value: unknown, scale: number): string =>
  typeof value === 'number' ? value.toFixed(scale) : String(value);

const DictionaryEncodingExplorer: React.FC<DictionaryEncodingExplorerProps> = ({ explanationMode }) => {
  const [columnName, setColumnName] = useState<string>('Region');
  const [rowCount, setRowCount] = useState<number>(1000);

  const definition = CUSTOMER_COLUMNS.find((column) => column.name === columnName) ?? CUSTOMER_COLUMNS[0];

  // Deterministic: the same column and row count always give the same result.
  const result = useMemo(() => {
    const rows = generateSyntheticCustomerRows(rowCount);
    const column = getCustomerEncodingColumn(rows, definition.name);
    return generateDictionaryEncoding(column.values, column.name, column.dataType);
  }, [rowCount, definition.name]);

  const getExplanation = (): string => {
    if (explanationMode === 'beginner') {
      return 'Dictionary encoding stores each distinct value once and replaces every row with a small numeric ID, so repeated values take less space.';
    } else if (explanationMode === 'intermediate') {
      return 'Dictionary encoding: (1) find the distinct values; (2) give each one an ID; (3) store the column as IDs; (4) keep the dictionary separately. It pays off when the number of distinct values (cardinality) is much smaller than the row count. With a high cardinality the dictionary itself can be larger than the original column.';
    } else {
      return '[SIMPLIFIED MODEL] Each distinct value is stored once; each row stores a bit-packed ID of ceil(log2(cardinality)) bits (minimum 1). Module 2 compares this dictionary form with value encoding. [DOCUMENTED] Microsoft documents hash-based and value-based encoding for numeric columns (TOM EncodingHint) and says the server normally detects which to use. [PROPRIETARY INTERNAL] The real dictionary layout, hash function and any further compression are not published and are not modelled here.';
    }
  };

  const memorySaved = (1 - 1 / result.compressionRatio) * 100;
  const encodedTotal = result.encodedSize + result.dictionaryOverhead;

  return (
    <div className="dictionary-explorer">
      <div className="explorer-header">
        <h2>Dictionary Encoding Explorer</h2>
        <p className="explorer-description">
          Learn how dictionary encoding maps values to IDs, using the same synthetic Customer table as the Delta Lake
          and Parquet modules
        </p>
      </div>

      <div className="explanation-panel">
        <h3>Explanation</h3>
        <p>{getExplanation()}</p>
      </div>

      <div className="controls-section">
        <div className="control-group">
          <label htmlFor="dictionary-column-select">Column</label>
          <select
            id="dictionary-column-select"
            className="dictionary-select"
            value={columnName}
            onChange={(e) => setColumnName(e.target.value)}
          >
            {CUSTOMER_COLUMNS.map((column) => (
              <option key={column.name} value={column.name}>
                {DATA_TYPE_LABEL[column.dataType]} - {column.name} ({column.sourceType})
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label htmlFor="size-slider">Dataset Size: {rowCount.toLocaleString('en-US')} rows</label>
          <input
            id="size-slider"
            type="range"
            min="100"
            max="5000"
            step="100"
            value={rowCount}
            onChange={(e) => setRowCount(parseInt(e.target.value, 10))}
          />
        </div>
        <p className="controls-note">
          Cardinality is set by the data: change the column or the row count and watch it move. Results update
          immediately and are the same every time.
        </p>
      </div>

      <div className="results-section" aria-live="polite">
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Distinct Values</div>
            <div className="metric-value">{result.dictionary.cardinality.toLocaleString('en-US')}</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Bits per ID</div>
            <div className="metric-value">{result.bitsPerId}</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Original Size</div>
            <div className="metric-value">{formatBytes(result.originalSize)}</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Dictionary Size</div>
            <div className="metric-value">{formatBytes(result.dictionaryOverhead)}</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Encoded Size</div>
            <div className="metric-value">{formatBytes(encodedTotal)}</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Compression Ratio</div>
            <div className="metric-value">{result.compressionRatio.toFixed(2)}x</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Memory Saved</div>
            <div className="metric-value">{memorySaved.toFixed(1)}%</div>
          </div>
        </div>

        {memorySaved < 0 && (
          <p className="dictionary-warning" role="status">
            The dictionary costs more than the IDs save: for this column the encoded form is bigger than the original
            in this model.
          </p>
        )}

        <div className="dictionary-panel">
          <h3>Dictionary Mapping</h3>
          <div className="dictionary-list">
            {result.dictionary.distinctValues.slice(0, 20).map((value: unknown, index: number) => (
              <div key={index} className="dictionary-entry">
                <span className="entry-id">ID {index}:</span>
                <span className="entry-value">{formatValue(value, definition.scale)}</span>
              </div>
            ))}
            {result.dictionary.cardinality > 20 && (
              <div className="dictionary-more">... and {result.dictionary.cardinality - 20} more distinct values</div>
            )}
          </div>
        </div>

        <div className="sample-data-panel">
          <h3>Original vs Encoded (first 12 rows)</h3>
          <table className="dictionary-table">
            <caption>Each row stores the dictionary ID instead of the value</caption>
            <thead>
              <tr>
                <th scope="col">Row</th>
                <th scope="col">Original</th>
                <th scope="col">Encoded ID</th>
              </tr>
            </thead>
            <tbody>
              {result.encodedData.slice(0, 12).map((id, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{formatValue(result.originalData[index], definition.scale)}</td>
                  <td>{id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sample-data-panel">
          <h3>Encoded Column (first 50 IDs)</h3>
          <div className="encoded-data">
            {result.encodedData.slice(0, 50).map((id, index) => (
              <span key={index} className="encoded-id">
                {id}
              </span>
            ))}
            {result.encodedData.length > 50 && <span className="data-more">... {result.encodedData.length - 50} more</span>}
          </div>
        </div>
      </div>

      <div className="concepts-panel">
        <h3>Key Concepts</h3>
        <ul>
          <li>
            <strong>Cardinality:</strong> The number of distinct values in a column. Low cardinality benefits most from
            dictionary encoding; a key column where every row is distinct gains nothing.
          </li>
          <li>
            <strong>Dictionary ID:</strong> A small integer assigned to each distinct value, replacing the value itself
            in encoded storage.
          </li>
          <li>
            <strong>Bit-packing:</strong> n distinct values need ceil(log2 n) bits per row (minimum 1 in this model).
          </li>
          <li>
            <strong>Compression Ratio:</strong> Original size divided by (IDs + dictionary). Below 1 means the encoded
            form is larger.
          </li>
          <li>
            <strong>[DOCUMENTED]</strong> Apache Parquet defines dictionary encoding as one of its encodings, and Delta
            Lake tables store their data in Parquet files. VertiPaq's own encodings are a separate format.
          </li>
          <li>
            <strong>[SIMPLIFIED MODEL]</strong> The ID bit-packing and the byte sizes used here.
          </li>
          <li>
            <strong>[SIMULATION]</strong> The synthetic Customer rows and every size shown.
          </li>
          <li>
            <strong>[PROPRIETARY INTERNAL]</strong> VertiPaq's actual dictionary structure and compression.
          </li>
        </ul>
      </div>

      <div className="concepts-panel dictionary-examples">
        <h3>Practical Examples</h3>
        <ul>
          <li>
            <strong>Region (5 distinct values):</strong> each row needs only 3 bits, so the dictionary is tiny and the
            column shrinks a lot.
          </li>
          <li>
            <strong>CustomerName (up to 144 distinct values):</strong> more IDs and a bigger dictionary, still well
            under the original text.
          </li>
          <li>
            <strong>CustomerID (every row distinct):</strong> the dictionary holds as many entries as there are rows, so
            it saves nothing. Module 2 shows why value encoding suits such a column in this model.
          </li>
        </ul>
      </div>

      <div className="limitations-panel">
        <h3>Limitations & Assumptions</h3>
        <p>
          <strong>[SIMULATION]</strong> This dictionary encoding simulation:
        </p>
        <ul>
          <li>Uses fixed educational sizes: 8 bytes per number or date, a 4-byte length prefix plus UTF-8 bytes per text value, and bit-packed IDs.</li>
          <li>Always builds a dictionary; it does not decide whether a real engine would use one for this column.</li>
          <li>Does not model run-length or other compression, dictionary lookup speed, or caches.</li>
          <li>Models a one-value column as 1 bit per row.</li>
          <li>
            Does not represent VertiPaq's actual internal segment and dictionary organization
            ([PROPRIETARY INTERNAL])
          </li>
        </ul>
      </div>

      <div className="dictionary-sources">
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

export default DictionaryEncodingExplorer;
