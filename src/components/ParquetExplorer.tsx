import React, { useState, useCallback } from 'react';
import { ExplanationMode, ParquetFileMetadata, ParquetRowGroup } from '../types';
import './ParquetExplorer.css';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';

interface ParquetExplorerProps {
  explanationMode: ExplanationMode;
  parquetFile: ParquetFileMetadata;
}

interface ExpandedRowGroups {
  [key: number]: boolean;
}

const ParquetExplorer: React.FC<ParquetExplorerProps> = ({ explanationMode, parquetFile }) => {
  const [expandedRowGroups, setExpandedRowGroups] = useState<ExpandedRowGroups>({
    0: true, // Expand first row group
  });

  const toggleRowGroupExpanded = useCallback((rowGroupIndex: number) => {
    setExpandedRowGroups((prev) => ({
      ...prev,
      [rowGroupIndex]: !prev[rowGroupIndex],
    }));
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatCompressionRatio = (uncompressed: number, compressed: number): number => {
    if (compressed === 0) return 0;
    return Math.round((uncompressed / compressed) * 100) / 100;
  };

  const renderRowGroupHeader = (rowGroup: ParquetRowGroup) => {
    const totalCompressed = rowGroup.columnChunks.reduce((sum, cc) => sum + cc.totalSize, 0);
    const compressionRatio = formatCompressionRatio(totalCompressed * 2, totalCompressed);

    return (
      <div className="parquet-rowgroup-header">
        <div className="rowgroup-info">
          <span className="rowgroup-number">Row Group {rowGroup.rowGroupIndex}</span>
          <span className="rowgroup-rows">{rowGroup.rowCount.toLocaleString()} rows</span>
          <span className="rowgroup-size">{formatBytes(rowGroup.totalSize)}</span>
          <span className="rowgroup-ratio">Compression: {compressionRatio}:1</span>
        </div>
        <button
          className="expand-button"
          onClick={() => toggleRowGroupExpanded(rowGroup.rowGroupIndex)}
          aria-label={expandedRowGroups[rowGroup.rowGroupIndex] ? 'Collapse' : 'Expand'}
        >
          {expandedRowGroups[rowGroup.rowGroupIndex] ? <FiChevronUp /> : <FiChevronDown />}
        </button>
      </div>
    );
  };

  const renderColumnChunk = (columnChunk: any) => (
    <div key={columnChunk.columnIndex} className="column-chunk">
      <div className="column-header">
        <span className="column-name">{columnChunk.columnName}</span>
        <span className="column-stats">
          {columnChunk.pages.length} pages • {formatBytes(columnChunk.totalSize)}
        </span>
      </div>

      {explanationMode !== 'beginner' && (
        <div className="column-statistics">
          <div className="stat-item">
            <span className="stat-label">Min:</span>
            <span className="stat-value">{String(columnChunk.statistics.min).substring(0, 30)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Max:</span>
            <span className="stat-value">{String(columnChunk.statistics.max).substring(0, 30)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Null Count:</span>
            <span className="stat-value">{columnChunk.statistics.nullCount}</span>
          </div>
        </div>
      )}

      {explanationMode === 'advanced' && (
        <div className="column-pages">
          <h5>Pages:</h5>
          {columnChunk.pages.map((page: any) => (
            <div key={page.pageIndex} className="page">
              <span className="page-index">Page {page.pageIndex}</span>
              <span className="page-rows">{page.rowCount} rows</span>
              <span className="page-size">
                {formatBytes(page.compressedSize)} ({formatBytes(page.uncompressedSize)} uncompressed)
              </span>
              <span className="page-compression">{page.compression}</span>
              <span className="page-encoding">{page.encoding}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="parquet-explorer">
      <div className="parquet-header">
        <h2>Parquet File Structure</h2>
        <p className="parquet-description">
          {explanationMode === 'beginner'
            ? 'Explore the internal structure of Parquet files including row groups and columns.'
            : 'Analyze Parquet file metadata, column chunks, pages, and compression statistics.'}
        </p>
      </div>

      <div className="parquet-file-info">
        <h3>File: {parquetFile.fileName}</h3>
        <div className="file-stats">
          <div className="stat">
            <span className="stat-label">File Size:</span>
            <span className="stat-value">{formatBytes(parquetFile.fileSize)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total Rows:</span>
            <span className="stat-value">{parquetFile.rowCount.toLocaleString()}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Columns:</span>
            <span className="stat-value">{parquetFile.columnCount}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Row Groups:</span>
            <span className="stat-value">{parquetFile.rowGroups.length}</span>
          </div>
        </div>
      </div>

      <div className="parquet-columns-overview">
        <h4>Columns</h4>
        <div className="columns-grid">
          {parquetFile.columns.map((col) => (
            <div key={col.name} className="column-overview">
              <span className="col-name">{col.name}</span>
              <span className="col-type">{col.type}</span>
              {col.logicalType && <span className="col-logical">{col.logicalType}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="parquet-rowgroups-list">
        {parquetFile.rowGroups.map((rowGroup) => (
          <div key={rowGroup.rowGroupIndex} className="parquet-rowgroup">
            {renderRowGroupHeader(rowGroup)}
            {expandedRowGroups[rowGroup.rowGroupIndex] && (
              <div className="rowgroup-content">
                <div className="column-chunks">
                  {rowGroup.columnChunks.map((chunk) => renderColumnChunk(chunk))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="parquet-concepts">
        <h4>Parquet Architecture</h4>
        <ul>
          <li>
            <strong>Row Groups:</strong> Horizontal partitions of data (~128MB typical), contain statistics for segment
            elimination
          </li>
          <li>
            <strong>Column Chunks:</strong> One column's data within a row group, independently compressed
          </li>
          <li>
            <strong>Pages:</strong> Smallest unit within a column chunk (~256KB typical), individually encoded
          </li>
          <li>
            <strong>Statistics:</strong> Min/max values per column chunk enable predicate pushdown and query optimization
          </li>
          <li>
            <strong>Encoding:</strong> Dictionary, plain, delta, or run-length encoding for compression
          </li>
        </ul>
      </div>

      {explanationMode === 'advanced' && (
        <div className="parquet-schema">
          <h4>Schema</h4>
          <pre className="schema-json">{JSON.parse(parquetFile.schemaJson)}</pre>
        </div>
      )}
    </div>
  );
};

export default ParquetExplorer;
