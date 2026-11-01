import React, { useState, useCallback } from 'react';
import { ExplanationMode, SchemaEvolutionState, SchemaVersion } from '../types';
import './SchemaEvolutionExplorer.css';
import { generateSchemaEvolutionHistory } from '../data/stage5-delta-lake-parquet';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';

interface SchemaEvolutionExplorerProps {
  explanationMode: ExplanationMode;
}

interface ExpandedVersions {
  [key: number]: boolean;
}

const SchemaEvolutionExplorer: React.FC<SchemaEvolutionExplorerProps> = ({ explanationMode }) => {
  const [schemaState] = useState<SchemaEvolutionState>(generateSchemaEvolutionHistory());
  const [expandedVersions, setExpandedVersions] = useState<ExpandedVersions>({
    [schemaState.schemaVersions.length - 1]: true,
  });

  const toggleVersionExpanded = useCallback((version: number) => {
    setExpandedVersions((prev) => ({
      ...prev,
      [version]: !prev[version],
    }));
  }, []);

  const getChangeDescription = (change: SchemaVersion['change']): string => {
    if (!change) return '';

    if (explanationMode === 'beginner') {
      switch (change.type) {
        case 'ADD':
          return `Added new column: ${change.columnName}`;
        case 'MODIFY':
          return `Changed type of ${change.columnName}`;
        case 'DROP':
          return `Removed column: ${change.columnName}`;
        case 'RENAME':
          return `Renamed ${change.oldName} to ${change.newName}`;
        default:
          return '';
      }
    } else if (explanationMode === 'intermediate') {
      switch (change.type) {
        case 'ADD':
          return `Added new nullable column ${change.columnName} (${change.newType}). Existing rows have NULL values.`;
        case 'MODIFY':
          return `Modified ${change.columnName} from ${change.oldType} to ${change.newType}. May require data conversion.`;
        case 'DROP':
          return `Removed column ${change.columnName}. Data is not physically deleted; schema just omits it.`;
        case 'RENAME':
          return `Renamed column ${change.oldName} to ${change.newName}. Logical operation; no data movement.`;
        default:
          return '';
      }
    } else {
      switch (change.type) {
        case 'ADD':
          return `Added new column ${change.columnName} of type ${change.newType}. Delta Lake records schema metadata. Column is required in new writes; old rows show as NULL. Compatible with BACKWARD mode.`;
        case 'MODIFY':
          return `Modified ${change.columnName} from ${change.oldType} to ${change.newType}. Delta Lake records the change. Readers must handle type coercion or rejection based on protocol version.`;
        case 'DROP':
          return `Dropped column ${change.columnName}. Schema evolution records removal; physical parquet files retain the column (readers ignore it). Recoverable via time travel.`;
        case 'RENAME':
          return `Renamed ${change.oldName} to ${change.newName}. Delta Lake records the rename operation. Backward-compatible if old code can match by position or metadata.`;
        default:
          return '';
      }
    }
  };

  const getCompatibilityInfo = (): string => {
    if (explanationMode === 'beginner') {
      return 'Schema evolution tracks changes to table structure over time.';
    } else if (explanationMode === 'intermediate') {
      return `Compatibility mode: ${schemaState.compatibilityMode}. This allows old readers to access newer schemas. BACKWARD compatibility means new columns must be optional.`;
    } else {
      return `Schema compatibility mode: ${schemaState.compatibilityMode}. Controls whether readers/writers from other versions can safely access the table. BACKWARD: new schema readable by old readers (new columns nullable). FORWARD: old schema readable by new readers. BOTH: mutual compatibility. STRICT: no compatibility (all versions must match).`;
    }
  };

  const renderColumnChange = (col: any, prevVersion?: SchemaVersion) => {
    const prevCol = prevVersion?.columns.find((c) => c.name === col.name);
    const isNew = !prevCol;
    const isModified = prevCol && prevCol.type !== col.type;

    let className = '';
    let badge = '';
    if (isNew) {
      className = 'column-new';
      badge = 'NEW';
    } else if (isModified) {
      className = 'column-modified';
      badge = 'MODIFIED';
    }

    return (
      <div key={col.name} className={`schema-column ${className}`}>
        <div className="column-header">
          <span className="column-name">{col.name}</span>
          <span className="column-type">{col.type}</span>
          {badge && <span className="column-badge">{badge}</span>}
          {col.nullable && <span className="column-nullable">NULLABLE</span>}
        </div>
        {isModified && prevCol && (
          <div className="column-change">
            {prevCol.type} → {col.type}
          </div>
        )}
        {col.metadata && (
          <div className="column-metadata">
            <code>{JSON.stringify(col.metadata)}</code>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="schema-evolution-explorer">
      <div className="schema-header">
        <h2>Schema Evolution Explorer</h2>
        <p className="schema-description">
          {explanationMode === 'beginner'
            ? 'Track how a table schema changes over time as new columns are added and structures evolve.'
            : 'Explore Delta Lake schema versioning and backward/forward compatibility.'}
        </p>
      </div>

      <div className="schema-info">
        <h4>Compatibility Mode</h4>
        <p className="compatibility-info">{getCompatibilityInfo()}</p>
      </div>

      <div className="schema-overview">
        <h4>Current Schema ({schemaState.schemaVersions.length} versions)</h4>
        <div className="columns-grid">
          {schemaState.currentSchema.map((col) => (
            <div key={col.name} className="column-card">
              <span className="col-name">{col.name}</span>
              <span className="col-type">{col.type}</span>
              {col.nullable && <span className="col-badge">optional</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="schema-versions-list">
        <h4>Schema Versions</h4>
        {schemaState.schemaVersions.map((version, index) => (
          <div key={version.version} className="schema-version">
            <div className="version-header">
              <div className="version-info">
                <span className="version-number">Version {version.version}</span>
                <span className="version-timestamp">{new Date(version.timestamp).toLocaleString()}</span>
                <span className="column-count">{version.columns.length} columns</span>
              </div>

              {version.change && (
                <div className="version-change-badge">
                  <span className={`change-type ${version.change.type.toLowerCase()}`}>{version.change.type}</span>
                  {explanationMode !== 'beginner' && <span className="change-column">{version.change.columnName}</span>}
                </div>
              )}

              <button
                className="expand-button"
                onClick={() => toggleVersionExpanded(version.version)}
                aria-label={expandedVersions[version.version] ? 'Collapse' : 'Expand'}
              >
                {expandedVersions[version.version] ? <FiChevronUp /> : <FiChevronDown />}
              </button>
            </div>

            {version.change && (
              <div className="version-change-description">{getChangeDescription(version.change)}</div>
            )}

            {expandedVersions[version.version] && (
              <div className="version-content">
                <div className="schema-columns">
                  {version.columns.map((col) => renderColumnChange(col, index > 0 ? schemaState.schemaVersions[index - 1] : undefined))}
                </div>

                {explanationMode === 'advanced' && (
                  <div className="version-raw">
                    <h5>Raw Schema (JSON)</h5>
                    <pre className="schema-json">
                      {JSON.stringify(
                        {
                          version: version.version,
                          timestamp: new Date(version.timestamp).toISOString(),
                          columns: version.columns,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="schema-concepts">
        <h4>Schema Evolution Concepts</h4>
        <ul>
          <li>
            <strong>Version History:</strong> Delta Lake tracks all schema changes in the transaction log
          </li>
          <li>
            <strong>Backward Compatibility:</strong> New columns must be optional (nullable) for old readers to work
          </li>
          <li>
            <strong>Time Travel:</strong> Query any table version and get the schema that was active at that time
          </li>
          <li>
            <strong>Data Handling:</strong> Existing rows have NULL for newly added columns; old readers ignore new
            columns
          </li>
          <li>
            <strong>Column Renaming:</strong> Logical operation in metadata; original data files unchanged
          </li>
          <li>
            <strong>Type Modifications:</strong> Allowed with compatibility restrictions; readers may need to cast or
            validate
          </li>
        </ul>
      </div>

      {explanationMode === 'advanced' && (
        <div className="evolution-advanced">
          <h4>Schema Evolution in Direct Lake</h4>
          <p>
            When a Direct Lake semantic model has an associated Delta table whose schema evolves, the semantic model
            must perform metadata refresh to detect:
          </p>
          <ul>
            <li>New columns → new VertiPaq columns to load on demand</li>
            <li>Removed columns → VertiPaq columns no longer populated</li>
            <li>Type changes → potential impact on query formulas (must recompile DAX)</li>
            <li>Metadata changes → refresh relationship definitions and hierarchies</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default SchemaEvolutionExplorer;
