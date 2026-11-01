import React, { useState, useCallback } from 'react';
import { ExplanationMode, DeltaTransactionLog, DeltaTableVersion } from '../types';
import './DeltaLakeExplorer.css';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';

interface DeltaLakeExplorerProps {
  explanationMode: ExplanationMode;
  transactionLog: DeltaTransactionLog;
}

interface ExpandedVersions {
  [key: number]: boolean;
}

const DeltaLakeExplorer: React.FC<DeltaLakeExplorerProps> = ({ explanationMode, transactionLog }) => {
  const [expandedVersions, setExpandedVersions] = useState<ExpandedVersions>({
    [transactionLog.versions.length - 1]: true, // Expand latest version
  });

  const toggleVersionExpanded = useCallback((version: number) => {
    setExpandedVersions((prev) => ({
      ...prev,
      [version]: !prev[version],
    }));
  }, []);

  const getActionIcon = (actionType: string): string => {
    switch (actionType) {
      case 'Add':
        return '➕';
      case 'Remove':
        return '➖';
      case 'Metadata':
        return '📋';
      case 'Protocol':
        return '⚙️';
      default:
        return '•';
    }
  };

  const getActionExplanation = (actionType: string): string => {
    if (explanationMode === 'beginner') {
      switch (actionType) {
        case 'Add':
          return 'Adding new data files to the table';
        case 'Remove':
          return 'Removing data files from the table';
        case 'Metadata':
          return 'Updating table structure information';
        case 'Protocol':
          return 'Setting protocol version requirements';
        default:
          return '';
      }
    } else if (explanationMode === 'intermediate') {
      switch (actionType) {
        case 'Add':
          return 'Adds one or more data files with their metadata (size, statistics, partition values)';
        case 'Remove':
          return 'Marks files for deletion without immediately removing them (for time travel support)';
        case 'Metadata':
          return 'Updates table-level metadata including schema, table properties, and configuration';
        case 'Protocol':
          return 'Specifies minimum reader/writer versions required for safe access';
        default:
          return '';
      }
    } else {
      switch (actionType) {
        case 'Add':
          return 'Adds a LogicalFile, specifying path, dataChange flag, size, modificationTime, and partition values. Includes row count, tags, and optional statistics.';
        case 'Remove':
          return 'Records file removal with deletion timestamp and dataChange flag. Enables point-in-time recovery without immediate file deletion.';
        case 'Metadata':
          return 'Captures schema evolution, table properties, description, and partition column details. Critical for schema versioning.';
        case 'Protocol':
          return 'Defines reader/writer protocol versions. Enables forward/backward compatibility management.';
        default:
          return '';
      }
    }
  };

  const renderVersionHeader = (version: DeltaTableVersion) => (
    <div className="delta-version-header">
      <div className="version-info">
        <span className="version-number">Version {version.version}</span>
        <span className="version-timestamp">{new Date(version.timestamp).toLocaleString()}</span>
        <span className="version-stats">
          {version.rowCount.toLocaleString()} rows • {version.fileCount} files
        </span>
      </div>
      <button
        className="expand-button"
        onClick={() => toggleVersionExpanded(version.version)}
        aria-label={expandedVersions[version.version] ? 'Collapse' : 'Expand'}
      >
        {expandedVersions[version.version] ? <FiChevronUp /> : <FiChevronDown />}
      </button>
    </div>
  );

  const renderAction = (action: any, index: number) => (
    <div key={index} className="delta-action">
      <div className="action-header">
        <span className="action-icon">{getActionIcon(action.type)}</span>
        <span className="action-type">{action.type}</span>
        <span className="action-description">{action.description}</span>
      </div>
      <div className="action-explanation">{getActionExplanation(action.type)}</div>
      {explanationMode !== 'beginner' && (
        <div className="action-details">
          <pre className="details-json">{JSON.stringify(action.details, null, 2)}</pre>
        </div>
      )}
    </div>
  );

  return (
    <div className="delta-lake-explorer">
      <div className="delta-header">
        <h2>Delta Lake Transaction Log</h2>
        <p className="delta-description">
          {explanationMode === 'beginner'
            ? 'View the sequence of changes made to the table over time.'
            : 'Explore transaction log entries showing all structural and data changes.'}
        </p>
      </div>

      <div className="delta-table-info">
        <h3>Table: {transactionLog.tableName}</h3>
        <div className="table-stats">
          <div className="stat">
            <span className="stat-label">Current Version:</span>
            <span className="stat-value">{transactionLog.currentVersion}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total Versions:</span>
            <span className="stat-value">{transactionLog.versions.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Checkpoint Interval:</span>
            <span className="stat-value">Every {transactionLog.checkpointInterval} commits</span>
          </div>
        </div>
      </div>

      <div className="delta-versions-list">
        {transactionLog.versions.map((version) => (
          <div key={version.version} className="delta-version">
            {renderVersionHeader(version)}
            {expandedVersions[version.version] && (
              <div className="version-content">
                <div className="actions-list">
                  {version.actions.map((action, index) => renderAction(action, index))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="delta-concepts">
        <h4>Key Concepts</h4>
        <ul>
          <li>
            <strong>Transaction Log:</strong> Immutable sequence of action records in{' '}
            <code>_delta_log/</code> directory
          </li>
          <li>
            <strong>ACID Guarantees:</strong> All operations are atomic, consistent, isolated, and durable
          </li>
          <li>
            <strong>Time Travel:</strong> Query any historical version using <code>VERSION AS OF</code>
          </li>
          <li>
            <strong>Checkpoints:</strong> Optimized snapshots created periodically for faster startup
          </li>
        </ul>
      </div>
    </div>
  );
};

export default DeltaLakeExplorer;
