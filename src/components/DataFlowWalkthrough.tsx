import React from 'react';
import { ExplanationMode } from '../types';
import { getQueryPhases } from '../data';
import './DataFlowWalkthrough.css';

interface DataFlowWalkthroughProps {
  phase: number;
  onPhaseChange: (phase: number) => void;
  mode: ExplanationMode;
}

const DataFlowWalkthrough: React.FC<DataFlowWalkthroughProps> = ({
  phase,
  onPhaseChange,
  mode,
}) => {
  const phases = getQueryPhases();
  const currentPhase = phases.find(p => p.phase === phase) || phases[0];

  const handlePrevious = () => {
    if (phase > 1) {
      onPhaseChange(phase - 1);
    }
  };

  const handleNext = () => {
    if (phase < 6) {
      onPhaseChange(phase + 1);
    }
  };

  return (
    <div className="data-flow-walkthrough">
      <header className="walkthrough-header">
        <h2>Query Execution Pipeline</h2>
        <p className="walkthrough-subtitle">Step through 6 phases of Direct Lake query processing</p>
      </header>

      <div className="phase-progress">
        {phases.map((p) => (
          <button
            key={p.phase}
            className={`phase-dot ${p.phase === currentPhase.phase ? 'active' : ''} ${
              p.phase < currentPhase.phase ? 'completed' : ''
            }`}
            onClick={() => onPhaseChange(p.phase)}
            title={p.name}
            aria-label={`Phase ${p.phase}: ${p.name}`}
            aria-current={p.phase === currentPhase.phase ? 'step' : undefined}
          >
            {p.phase}
          </button>
        ))}
      </div>

      <div className="phase-content">
        <div className="phase-info">
          <h3 className="phase-name">
            Phase {currentPhase.phase}: {currentPhase.name}
          </h3>
          <p className="phase-description">{currentPhase.description}</p>

          <div className="phase-details">
            <div className="detail-section">
              <h4>📥 Inputs</h4>
              <ul className="detail-list">
                {currentPhase.inputs.map((input, idx) => (
                  <li key={idx}>{input}</li>
                ))}
              </ul>
            </div>

            <div className="detail-section">
              <h4>⚙️ Processes</h4>
              <ul className="detail-list">
                {currentPhase.processes.map((process, idx) => (
                  <li key={idx}>{process}</li>
                ))}
              </ul>
            </div>

            <div className="detail-section">
              <h4>📤 Outputs</h4>
              <ul className="detail-list">
                {currentPhase.outputs.map((output, idx) => (
                  <li key={idx}>{output}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mode-content">
            <div className="mode-indicator">
              Mode: <strong>{mode.charAt(0).toUpperCase() + mode.slice(1)}</strong>
            </div>
            <p className="mode-explanation">
              {currentPhase.explanations[mode]}
            </p>
          </div>

          {currentPhase.sources.length > 0 && (
            <div className="phase-sources">
              <h4>📚 Source References</h4>
              <ul className="sources-list">
                {currentPhase.sources.map((source, idx) => (
                  <li key={idx}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="source-link"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {currentPhase.relatedComponents.length > 0 && (
            <div className="related-components">
              <h4>🔗 Related Components</h4>
              <div className="component-tags">
                {currentPhase.relatedComponents.map((comp, idx) => (
                  <span key={idx} className="component-tag">
                    {comp}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="visualization">
          <div className="phase-diagram">
            <div className="diagram-label">Conceptual Visualization</div>
            {renderPhaseDiagram(currentPhase.phase)}
          </div>
        </div>
      </div>

      <div className="walkthrough-controls">
        <button
          onClick={handlePrevious}
          disabled={phase === 1}
          className="nav-button prev-button"
          aria-label="Previous phase"
        >
          ← Previous
        </button>

        <span className="phase-counter" aria-live="polite" aria-atomic="true">
          Phase {phase} of {phases.length}
        </span>

        <button
          onClick={handleNext}
          disabled={phase === 6}
          className="nav-button next-button"
          aria-label="Next phase"
        >
          Next →
        </button>
      </div>

      <div className="walkthrough-hints">
        <p>💡 <strong>Keyboard:</strong> Use ← and → arrow keys to navigate phases</p>
      </div>
    </div>
  );
};

function renderPhaseDiagram(phase: number): React.ReactNode {
  const diagrams: Record<number, string> = {
    1: '📋 DAX Query → Parse Query String → Syntax Tree',
    2: '🔍 Query Optimizer → Analyze Plan → Optimized Query',
    3: '📦 Column Loader → Select Columns → Load to Cache',
    4: '🔄 Formula Engine → Execute Measures → Compute Results',
    5: '💾 Storage Engine → Read Encoded Data → Return Cache',
    6: '📊 Formatter → Aggregate Results → Return to Client',
  };

  return <div className="diagram-content">{diagrams[phase] || ''}</div>;
}

export default DataFlowWalkthrough;
