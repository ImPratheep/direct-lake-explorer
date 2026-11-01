import React, { useState } from 'react';
import { ArchitectureComponent, ExplanationMode } from '../types';
import './DetailPanel.css';

interface DetailPanelProps {
  component: ArchitectureComponent;
  mode: ExplanationMode;
  onClose: () => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ component, mode, onClose }) => {
  const [activeTab, setActiveTab] = useState<'explanation' | 'io' | 'sources'>('explanation');

  const explanation = component.explanations[mode];
  const classificationColor = {
    DOCUMENTED: '#10b981',
    SIMULATION: '#f59e0b',
    INFERRED: '#8b5cf6',
  }[component.classification];

  return (
    <div className="detail-panel" role="region" aria-label="Component details">
      <div className="panel-header">
        <h2 className="panel-title">{component.name}</h2>
        <button
          className="close-button"
          onClick={onClose}
          aria-label="Close details"
          title="Close (Esc)"
        >
          ✕
        </button>
      </div>

      <div className="component-meta">
        <span className="layer-badge" style={{ backgroundColor: getLayerColor(component.layer) }}>
          {component.layer}
        </span>
        <span
          className="classification-badge"
          style={{ backgroundColor: classificationColor }}
        >
          [{component.classification}]
        </span>
      </div>

      <p className="component-purpose">{component.purpose}</p>

      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'explanation' ? 'active' : ''}`}
          onClick={() => setActiveTab('explanation')}
          aria-selected={activeTab === 'explanation'}
        >
          📖 Explanation
        </button>
        <button
          className={`tab-button ${activeTab === 'io' ? 'active' : ''}`}
          onClick={() => setActiveTab('io')}
          aria-selected={activeTab === 'io'}
        >
          🔄 Inputs/Outputs
        </button>
        <button
          className={`tab-button ${activeTab === 'sources' ? 'active' : ''}`}
          onClick={() => setActiveTab('sources')}
          aria-selected={activeTab === 'sources'}
        >
          📚 Sources
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'explanation' && (
          <div className="explanation-tab">
            <div className="mode-indicator">
              <span className="mode-label">
                Mode: <strong>{mode.charAt(0).toUpperCase() + mode.slice(1)}</strong>
              </span>
            </div>
            <p className="explanation-text">{explanation}</p>
          </div>
        )}

        {activeTab === 'io' && (
          <div className="io-tab">
            <div className="io-section">
              <h4>Inputs</h4>
              {component.inputs.length > 0 ? (
                <ul className="io-list">
                  {component.inputs.map((input, idx) => (
                    <li key={idx}>{input}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-io">No inputs specified</p>
              )}
            </div>

            <div className="io-section">
              <h4>Outputs</h4>
              {component.outputs.length > 0 ? (
                <ul className="io-list">
                  {component.outputs.map((output, idx) => (
                    <li key={idx}>{output}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-io">No outputs specified</p>
              )}
            </div>

            {component.relatedComponents && component.relatedComponents.length > 0 && (
              <div className="io-section">
                <h4>Related Components</h4>
                <ul className="io-list">
                  {component.relatedComponents.map((relComp, idx) => (
                    <li key={idx}>{relComp}</li>
                  ))}
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

function getLayerColor(layer: string): string {
  const colors: Record<string, string> = {
    Storage: '#1f77b4',
    Semantic: '#ff7f0e',
    VertiPaq: '#2ca02c',
    Query: '#d62728',
    Memory: '#9467bd',
  };
  return colors[layer] || '#6b7280';
}

export default DetailPanel;
