import React, { useRef, useState } from 'react';
import { ArchitectureComponent, ExplanationMode } from '../types';
import Icon from './Icon';
import './DetailPanel.css';

interface DetailPanelProps {
  component: ArchitectureComponent;
  mode: ExplanationMode;
  onClose: () => void;
  /** All components, used to turn related-component names into links. */
  components?: ArchitectureComponent[];
  onSelectComponent?: (componentId: string) => void;
  onOpenModule?: (module: string, vertipaqTab?: string) => void;
}

type TabKey = 'explanation' | 'io' | 'sources';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'explanation', label: 'Explanation' },
  { key: 'io', label: 'Inputs/Outputs' },
  { key: 'sources', label: 'Sources' },
];

const MODES: ExplanationMode[] = ['beginner', 'intermediate', 'advanced'];
const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

interface TryIt {
  module: string;
  vertipaqTab?: string;
  label: string;
  why: string;
}

/**
 * Hand-curated links from an architecture component to the hands-on module that actually covers
 * the concept. Components without an honest match have no entry.
 */
const TRY_IT: Record<string, TryIt[]> = {
  onelake: [
    { module: 'vertipaq', vertipaqTab: 'loading', label: 'Direct Lake Loading', why: 'Follow columns from OneLake through Delta and Parquet into memory.' },
  ],
  lakehouse: [{ module: 'deltaLake', label: 'Delta Lake Explorer', why: 'Look inside a Delta table, the storage format a Lakehouse table uses.' }],
  'delta-lake': [{ module: 'deltaLake', label: 'Delta Lake Explorer', why: 'Browse a synthetic Delta table and its transaction log.' }],
  'transaction-log': [{ module: 'deltaLake', label: 'Delta Lake Explorer', why: 'See commits and versions in a synthetic Delta log.' }],
  parquet: [{ module: 'parquet', label: 'Parquet Explorer', why: 'Explore row groups, columns and statistics in a synthetic Parquet file.' }],
  partitioning: [{ module: 'partitioning', label: 'Partitioning Explorer', why: 'Compare partition layouts and see which partitions a filter needs.' }],
  statistics: [
    { module: 'predicatePushdown', label: 'Predicate Pushdown Simulator', why: 'See min/max statistics let a filter skip data.' },
    { module: 'vertipaq', vertipaqTab: 'elimination', label: 'Segment Elimination', why: 'Watch segments ruled out using min/max ranges.' },
  ],
  encoding: [
    { module: 'vertipaq', vertipaqTab: 'dictionary', label: 'Dictionary Encoding', why: 'Build a dictionary and see the codes it produces.' },
    { module: 'vertipaq', vertipaqTab: 'encoding', label: 'Value vs Hash Encoding', why: 'Compare two simplified encoding strategies.' },
  ],
  compression: [{ module: 'vertipaq', vertipaqTab: 'compression', label: 'Column Compression', why: 'See how simulated column size changes with the data.' }],
  'metadata-store': [{ module: 'schemaEvolution', label: 'Schema Evolution Explorer', why: 'See how table schemas change across versions.' }],
  'direct-lake-model': [{ module: 'vertipaq', vertipaqTab: 'loading', label: 'Direct Lake Loading', why: 'Watch columns move from storage into memory as queries ask for them.' }],
  framing: [{ module: 'vertipaq', vertipaqTab: 'memory', label: 'Memory Residency', why: 'Evict columns, as a refresh may, and see a later query load them again.' }],
  'import-vs-direct-lake': [{ module: 'vertipaq', vertipaqTab: 'loading', label: 'Direct Lake Loading', why: 'See the on-demand column loading that Direct Lake relies on.' }],
  'vertipaq-engine': [{ module: 'vertipaq', vertipaqTab: 'dictionary', label: 'Dictionary Encoding', why: 'Start the VertiPaq simulator journey.' }],
  'vertipaq-segments': [{ module: 'vertipaq', vertipaqTab: 'segment', label: 'Segment Explorer', why: 'Split a synthetic column into segments and inspect each one.' }],
  'vertipaq-dictionary-encoding': [
    { module: 'vertipaq', vertipaqTab: 'dictionary', label: 'Dictionary Encoding', why: 'Build a dictionary and see the codes it produces.' },
    { module: 'vertipaq', vertipaqTab: 'encoding', label: 'Value vs Hash Encoding', why: 'Compare two simplified encoding strategies.' },
  ],
  'vertipaq-compression': [{ module: 'vertipaq', vertipaqTab: 'compression', label: 'Column Compression', why: 'See how simulated column size changes with the data.' }],
  'query-column-requirements': [{ module: 'vertipaq', vertipaqTab: 'loading', label: 'Direct Lake Loading', why: 'Run a simulated query and see which columns are available or need loading.' }],
  'storage-engine': [{ module: 'vertipaq', vertipaqTab: 'storage', label: 'Storage Engine Scan', why: 'Scan synthetic rows and see candidate versus matching rows.' }],
  'query-segment-elimination': [{ module: 'vertipaq', vertipaqTab: 'elimination', label: 'Segment Elimination', why: 'Watch segments ruled out by min/max ranges.' }],
  'column-loading': [{ module: 'vertipaq', vertipaqTab: 'loading', label: 'Direct Lake Loading', why: 'Load columns and see memory change.' }],
  'resident-columns': [{ module: 'vertipaq', vertipaqTab: 'memory', label: 'Memory Residency', why: 'See resident and non-resident columns and the memory they use.' }],
  eviction: [{ module: 'vertipaq', vertipaqTab: 'memory', label: 'Memory Residency', why: 'Evict columns yourself and request one again.' }],
  'memory-limits': [{ module: 'vertipaq', vertipaqTab: 'memory', label: 'Memory Residency', why: 'Try an illustrative memory budget (not a Fabric setting).' }],
};

const normalize = (text: string): string => text.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();

const DetailPanel: React.FC<DetailPanelProps> = ({ component, mode, onClose, components = [], onSelectComponent, onOpenModule }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('explanation');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const explanation = component.explanations[mode];
  const classification = component.classification.toLowerCase();
  const idBase = `detail-${component.id}`;
  const tryIt = TRY_IT[component.id] ?? [];

  // A related name links only when it matches a listed component by name or id.
  const findRelated = (name: string): ArchitectureComponent | undefined => {
    const key = normalize(name);
    return components.find((c) => c.id !== component.id && (normalize(c.name) === key || c.id === key.replace(/\s+/g, '-')));
  };

  // Arrow keys, Home and End move between tabs (roving tabindex), as expected for ARIA tabs.
  const handleTabKeyDown = (event: React.KeyboardEvent, index: number): void => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    setActiveTab(TABS[next].key);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="detail-panel" role="region" aria-label="Component details">
      <div className="panel-header">
        <h2 className="panel-title">{component.name}</h2>
        <button className="close-button" onClick={onClose} aria-label="Close details" title="Close (Esc)">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="component-meta">
        <span className="detail-area-badge" data-area={component.layer.toLowerCase()}>
          {component.layer}
        </span>
        <span className={`label-badge label-${classification}`}>[{component.classification}]</span>
      </div>

      <p className="component-purpose">{component.purpose}</p>

      <div className="tabs" role="tablist" aria-label="Component information">
        {TABS.map((tab, index) => (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            id={`${idBase}-tab-${tab.key}`}
            role="tab"
            className={`tab-button ${activeTab === tab.key ? 'active' : ''}`}
            aria-selected={activeTab === tab.key}
            aria-controls={`${idBase}-panel-${tab.key}`}
            tabIndex={activeTab === tab.key ? 0 : -1}
            onClick={() => setActiveTab(tab.key)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="tab-content"
        role="tabpanel"
        id={`${idBase}-panel-${activeTab}`}
        aria-labelledby={`${idBase}-tab-${activeTab}`}
      >
        {activeTab === 'explanation' && (
          <div className="explanation-tab">
            <div className="mode-indicator">
              <span className="mode-label">
                Mode: <strong>{mode.charAt(0).toUpperCase() + mode.slice(1)}</strong>
              </span>
            </div>
            <p className="explanation-text">{explanation}</p>

            <div className="deeper">
              <h4>Other levels of detail</h4>
              {MODES.filter((m) => m !== mode).map((other) => (
                <details key={other} className="deeper-item">
                  <summary>{capitalize(other)}</summary>
                  <p>{component.explanations[other]}</p>
                </details>
              ))}
            </div>

            {tryIt.length > 0 && onOpenModule && (
              <div className="try-it">
                <h4>Try it hands-on</h4>
                <p className="try-it-note">These open a simulator built on synthetic data.</p>
                <ul className="try-it-list">
                  {tryIt.map((item) => (
                    <li key={`${item.module}-${item.vertipaqTab ?? ''}`}>
                      <button type="button" className="try-it-button" onClick={() => onOpenModule(item.module, item.vertipaqTab)}>
                        <span className="try-it-label">{item.label}</span>
                        <span className="try-it-why">{item.why}</span>
                        <Icon name="chevronRight" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'io' && (
          <div className="io-tab">
            <div className="io-flow" role="group" aria-label={`Data flow for ${component.name}`}>
              <div className="io-flow-col">
                <span className="io-flow-title">Inputs</span>
                {component.inputs.length > 0 ? (
                  component.inputs.map((input) => (
                    <span key={input} className="io-flow-chip">{input}</span>
                  ))
                ) : (
                  <span className="empty-io">None specified</span>
                )}
              </div>
              <Icon name="chevronRight" size={18} className="io-flow-arrow" />
              <div className="io-flow-core">{component.name}</div>
              <Icon name="chevronRight" size={18} className="io-flow-arrow" />
              <div className="io-flow-col">
                <span className="io-flow-title">Outputs</span>
                {component.outputs.length > 0 ? (
                  component.outputs.map((output) => (
                    <span key={output} className="io-flow-chip">{output}</span>
                  ))
                ) : (
                  <span className="empty-io">None specified</span>
                )}
              </div>
            </div>

            {component.relatedComponents && component.relatedComponents.length > 0 && (
              <div className="io-section">
                <h4>Related Components</h4>
                <ul className="related-list">
                  {component.relatedComponents.map((relComp) => {
                    const target = findRelated(relComp);
                    return (
                      <li key={relComp}>
                        {target && onSelectComponent ? (
                          <button type="button" className="related-link" onClick={() => onSelectComponent(target.id)}>
                            {relComp}
                            <span className="related-hint">Open details</span>
                          </button>
                        ) : (
                          <span className="related-concept">
                            {relComp}
                            <span className="related-hint">Related concept</span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'sources' && (
          <div className="sources-tab">
            {component.sources.length > 0 ? (
              <ul className="sources-list">
                {component.sources.map((source, idx) => (
                  <li key={idx} className="source-item">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="source-link"
                    >
                      {source.title}
                    </a>
                    {source.section && (
                      <span className="source-section">Section: {source.section}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="no-sources">No sources available</p>
            )}
            <div className="classification-note">
              <strong>Classification:</strong> {component.classification}
              <p className="classification-explanation">
                {component.classification === 'DOCUMENTED'
                  ? 'This component is documented in Microsoft Learn'
                  : component.classification === 'SIMULATION'
                  ? 'This is a conceptual simulation based on documented behavior'
                  : 'This is an inferred component based on research'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DetailPanel;
