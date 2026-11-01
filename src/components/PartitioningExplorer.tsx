import React, { useState, useCallback } from 'react';
import { ExplanationMode, PartitionedFile } from '../types';
import './PartitioningExplorer.css';
import { evaluatePartitionPruning, generateSyntheticPartitionedTable } from '../data/stage5-delta-lake-parquet';

interface PartitioningExplorerProps {
  explanationMode: ExplanationMode;
}

interface PartitionFilter {
  [key: string]: string;
}

const PartitioningExplorer: React.FC<PartitioningExplorerProps> = ({ explanationMode }) => {
  const [partitionedFiles] = useState<PartitionedFile[]>(generateSyntheticPartitionedTable());
  const [filters, setFilters] = useState<PartitionFilter>({
    Region: 'North',
    Year: '2024',
  });
  const [evaluationResult, setEvaluationResult] = useState<any>(null);

  const getUniqueValues = useCallback(
    (partitionName: string): string[] => {
      const uniqueValues = new Set<string>();
      partitionedFiles.forEach((file) => {
        const pk = file.partitionKeys.find((k) => k.name === partitionName);
        if (pk) {
          uniqueValues.add(pk.value);
        }
      });
      return Array.from(uniqueValues).sort();
    },
    [partitionedFiles],
  );

  const partitionNames = Array.from(new Set(partitionedFiles.flatMap((f) => f.partitionKeys.map((pk) => pk.name))));

  const handleFilterChange = useCallback((partitionName: string, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [partitionName]: value,
    }));
  }, []);

  const handleEvaluate = useCallback(() => {
    const result = evaluatePartitionPruning(partitionedFiles, filters);
    setEvaluationResult(result);
  }, [filters, partitionedFiles]);

  const getPartitionExplanation = (): string => {
    if (explanationMode === 'beginner') {
      return 'Partitioning organizes data into folders based on column values. The query engine only reads folders that match your filter conditions.';
    } else if (explanationMode === 'intermediate') {
      return 'Partition pruning: Before scanning any data files, the query engine evaluates partition filters against the directory structure. Only files in matching partitions are opened.';
    } else {
      return 'Partition pruning implementation: (1) Parse filter conditions from query; (2) Traverse partition directory structure; (3) Match partition key values against filter predicates; (4) Skip entire directory branches with no matching rows; (5) Result: I/O and processing only on relevant files.';
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="partitioning-explorer">
      <div className="partitioning-header">
        <h2>Partitioning and Partition Pruning</h2>
        <p className="partitioning-description">
          {explanationMode === 'beginner'
            ? 'Explore how partitioning improves query performance.'
            : 'Simulate partition pruning to see how filters eliminate data directories.'}
        </p>
      </div>

      <div className="partitioning-explanation">
        <h4>How Partitioning Works</h4>
        <p>{getPartitionExplanation()}</p>
      </div>

      <div className="partitioning-controls">
        <h4>Apply Partition Filters</h4>
        <div className="filters-grid">
          {partitionNames.map((partName) => (
            <div key={partName} className="filter-group">
              <label htmlFor={`filter-${partName}`}>{partName}:</label>
              <select
                id={`filter-${partName}`}
                value={filters[partName] || ''}
                onChange={(e) => handleFilterChange(partName, e.target.value)}
              >
                <option value="">-- Any --</option>
                {getUniqueValues(partName).map((val) => (
                  <option key={val} value={val}>
                    {val}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <button className="evaluate-button" onClick={handleEvaluate}>
          Evaluate Partition Pruning
        </button>
      </div>

      {evaluationResult && (
        <div className="partitioning-results">
          <h4>Partition Pruning Results</h4>

          <div className="partition-metrics">
            <div className="metric">
              <span className="metric-label">Total Partitions:</span>
              <span className="metric-value">{evaluationResult.totalPartitions}</span>
            </div>
            <div className="metric matched">
              <span className="metric-label">Matching Partitions:</span>
              <span className="metric-value">{evaluationResult.matchingPartitions}</span>
            </div>
            <div className="metric pruned">
              <span className="metric-label">Pruned Partitions:</span>
              <span className="metric-value">{evaluationResult.prunedPartitions}</span>
            </div>
            <div className="metric reduction">
              <span className="metric-label">Reduction:</span>
              <span className="metric-value">{evaluationResult.reductionPercentage}%</span>
            </div>
          </div>

          {explanationMode !== 'beginner' && (
            <div className="matched-files">
              <h5>Matching Files ({evaluationResult.files.length})</h5>
              <div className="file-list">
                {evaluationResult.files.slice(0, 10).map((file: PartitionedFile, index: number) => (
                  <div key={index} className="file-item">
                    <div className="file-path">
                      <code>{file.path.substring(0, 80)}</code>
                    </div>
                    <div className="file-stats">
                      <span>{formatBytes(file.size)}</span>
                      <span>{file.rowCount.toLocaleString()} rows</span>
                    </div>
                  </div>
                ))}
                {evaluationResult.files.length > 10 && (
                  <div className="file-more">... and {evaluationResult.files.length - 10} more files</div>
                )}
              </div>
            </div>
          )}

          <div className="partition-visualization">
            <h5>Directory Structure (Pruned)</h5>
            <div className="directory-tree">
              <div className="tree-node">
                <span className="tree-label">table/</span>
                {partitionNames.map((partName) => (
                  <div key={partName} className="tree-child">
                    <span className="tree-label">{partName}={filters[partName] || '*'}</span>
                    <div className="tree-child">
                      <span className="tree-label">
                        {evaluationResult.files.length} file(s) - {formatBytes(
                          evaluationResult.files.reduce((sum: number, f: PartitionedFile) => sum + f.size, 0),
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="partitioning-concepts">
        <h4>Partitioning Best Practices</h4>
        <ul>
          <li>
            <strong>Choose Low Cardinality:</strong> Use columns with limited distinct values (Region, Date, Year)
          </li>
          <li>
            <strong>Align with Queries:</strong> Partition by dimensions frequently used in WHERE clauses
          </li>
          <li>
            <strong>Avoid Over-Partitioning:</strong> Too many small partitions = overhead; 100s-1000s of files per
            partition
          </li>
          <li>
            <strong>Multi-level Partitioning:</strong> Combine multiple columns (Region/Year/Month) for better pruning
          </li>
          <li>
            <strong>Direct Lake Integration:</strong> Partition pruning reduces VertiPaq loading scope; fewer columns to
            load
          </li>
        </ul>
      </div>

      {explanationMode === 'advanced' && (
        <div className="partition-schema">
          <h4>Partition Directory Structure</h4>
          <pre className="schema-text">
            {`table/
├── Region=North/Year=2024/Month=01/data_0.parquet
├── Region=North/Year=2024/Month=02/data_1.parquet
├── Region=North/Year=2024/Month=03/data_2.parquet
├── Region=South/Year=2024/Month=01/data_36.parquet
├── Region=East/Year=2023/Month=12/data_180.parquet
└── ... (${evaluationResult?.files.length || partitionedFiles.length} total files)`}
          </pre>
        </div>
      )}
    </div>
  );
};

export default PartitioningExplorer;
