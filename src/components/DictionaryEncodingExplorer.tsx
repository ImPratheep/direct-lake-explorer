import React, { useState, useCallback, useEffect } from 'react';
import { ExplanationMode, DictionaryEncodingResult } from '../types';
import { generateDictionaryEncoding } from '../data/stage6-vertipaq-simulator';
import './DictionaryEncodingExplorer.css';

interface DictionaryEncodingExplorerProps {
  explanationMode: ExplanationMode;
}

const DictionaryEncodingExplorer: React.FC<DictionaryEncodingExplorerProps> = ({ explanationMode }) => {
  const [datasetSize, setDatasetSize] = useState<number>(1000);
  const [cardinality, setCardinality] = useState<number>(20);
  const [result, setResult] = useState<DictionaryEncodingResult | null>(null);

  // Generate sample data
  const generateSampleData = useCallback((size: number, distinctValues: number): unknown[] => {
    const data: unknown[] = [];
    for (let i = 0; i < size; i++) {
      data.push(Math.floor(Math.random() * distinctValues));
    }
    return data;
  }, []);

  const handleGenerateDictionary = useCallback(() => {
    const sampleData = generateSampleData(datasetSize, cardinality);
    const encoding = generateDictionaryEncoding(sampleData, 'SampleColumn');
    setResult(encoding);
  }, [datasetSize, cardinality, generateSampleData]);

  useEffect(() => {
    handleGenerateDictionary();
  }, []);

  const getExplanation = (): string => {
    if (explanationMode === 'beginner') {
      return 'Dictionary encoding stores unique values once and replaces repeated values with numeric IDs, reducing memory usage.';
    } else if (explanationMode === 'intermediate') {
      return 'Dictionary encoding: (1) Extract distinct values; (2) Create ID mappings; (3) Encode column with IDs instead of original values; (4) Store dictionary separately. Effective when cardinality << row count.';
    } else {
      return '[DOCUMENTED] VertiPaq and Parquet use value encoding and dictionary encoding. [SIMULATION] This model simplifies cardinality-based selection. Actual VertiPaq uses complex cost models and segment boundaries to decide encoding strategies.';
    }
  };

  if (!result) {
    return <div className="dictionary-explorer">Loading...</div>;
  }

  return (
    <div className="dictionary-explorer">
      <div className="explorer-header">
        <h2>Dictionary Encoding Explorer</h2>
        <p className="explorer-description">
          Learn how dictionary encoding reduces column storage by mapping values to IDs
        </p>
      </div>

      <div className="explanation-panel">
        <h3>Explanation</h3>
        <p>{getExplanation()}</p>
      </div>

      <div className="controls-section">
        <div className="control-group">
          <label htmlFor="size-slider">Dataset Size: {datasetSize.toLocaleString()} rows</label>
          <input
            id="size-slider"
            type="range"
            min="100"
            max="10000"
            step="100"
            value={datasetSize}
            onChange={(e) => setDatasetSize(parseInt(e.target.value, 10))}
          />
        </div>

        <div className="control-group">
          <label htmlFor="cardinality-slider">Cardinality (Distinct Values): {cardinality}</label>
          <input
            id="cardinality-slider"
            type="range"
            min="2"
            max="1000"
            step="1"
            value={cardinality}
            onChange={(e) => setCardinality(parseInt(e.target.value, 10))}
          />
        </div>

        <button className="generate-button" onClick={handleGenerateDictionary}>
          Generate Dictionary
        </button>
      </div>

      <div className="results-section">
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Distinct Values</div>
            <div className="metric-value">{result.dictionary.cardinality}</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Original Size</div>
            <div className="metric-value">{(result.originalSize / 1024).toFixed(1)} KB</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Dictionary Size</div>
            <div className="metric-value">{(result.dictionaryOverhead / 1024).toFixed(1)} KB</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Encoded Size</div>
            <div className="metric-value">{((result.encodedSize + result.dictionaryOverhead) / 1024).toFixed(1)} KB</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Compression Ratio</div>
            <div className="metric-value">{result.compressionRatio.toFixed(2)}x</div>
          </div>

          <div className="metric-card">
            <div className="metric-label">Memory Saved</div>
            <div className="metric-value">{((1 - 1 / result.compressionRatio) * 100).toFixed(1)}%</div>
          </div>
        </div>

        <div className="dictionary-panel">
          <h3>Dictionary Mapping</h3>
          <div className="dictionary-list">
            {Array.from(result.dictionary.distinctValues.slice(0, 20)).map((value: unknown, index: number) => (
              <div key={index} className="dictionary-entry">
                <span className="entry-id">ID {index}:</span>
                <span className="entry-value">{String(value)}</span>
              </div>
            ))}
            {result.dictionary.cardinality > 20 && (
              <div className="dictionary-more">... and {result.dictionary.cardinality - 20} more distinct values</div>
            )}
          </div>
        </div>

        <div className="sample-data-panel">
          <h3>Sample Encoded Data (first 50 values)</h3>
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
            dictionary encoding.
          </li>
          <li>
            <strong>Dictionary ID:</strong> A small integer assigned to each distinct value, replacing the value itself
            in encoded storage.
          </li>
          <li>
            <strong>Compression Ratio:</strong> Ratio of original size to encoded size. Higher is better (more
            compression).
          </li>
          <li>
            <strong>[DOCUMENTED]</strong> Parquet and Delta Lake both support dictionary encoding for efficient storage
            of repeated values.
          </li>
          <li>
            <strong>[SIMULATION]</strong> This model uses simplified size estimates. Actual size depends on encoding,
            compression, and data type specifics.
          </li>
        </ul>
      </div>

      <div className="limitations-panel">
        <h3>Limitations & Assumptions</h3>
        <p>
          <strong>[SIMULATION]</strong> This dictionary encoding simulation:
        </p>
        <ul>
          <li>Uses simplified size estimates (8 bytes per value, 4 bytes per ID)</li>
          <li>Does not account for variable-length encoding or compression algorithms</li>
          <li>Assumes dictionary is always beneficial (actual systems decide per-column)</li>
          <li>Does not model dictionary lookup performance or L1/L2 cache effects</li>
          <li>
            Does not represent VertiPaq's actual internal segment and dictionary organization
            ([PROPRIETARY INTERNAL])
          </li>
        </ul>
      </div>
    </div>
  );
};

export default DictionaryEncodingExplorer;
