import React, { useState, useCallback } from 'react';
import './App.css';
import { ExplanationMode, ApplicationState } from '../types';
import { getArchitectureComponents, getQueryPhases, generateSyntheticDeltaLog, generateSyntheticParquetFile } from '../data';
import ArchitectureExplorer from './ArchitectureExplorer';
import DetailPanel from './DetailPanel';
import DataFlowWalkthrough from './DataFlowWalkthrough';
import Legend from './Legend';
import DeltaLakeExplorer from './DeltaLakeExplorer';
import ParquetExplorer from './ParquetExplorer';
import PredicatePushdownSimulator from './PredicatePushdownSimulator';
import PartitioningExplorer from './PartitioningExplorer';
import SchemaEvolutionExplorer from './SchemaEvolutionExplorer';

const App: React.FC = () => {
  const [state, setState] = useState<ApplicationState>({
    selectedComponentId: null,
    explanationMode: 'beginner',
    currentQueryPhase: 1,
    showQueryWalkthrough: false,
    showLegend: false,
    hoveredComponentId: null,
    activeModule: 'architecture',
  });

  const components = getArchitectureComponents();
  const queryPhases = getQueryPhases();

  const selectedComponent = state.selectedComponentId
    ? components.find((c) => c.id === state.selectedComponentId)
    : null;

  const handleSelectComponent = useCallback((componentId: string) => {
    setState((prev) => ({
      ...prev,
      selectedComponentId: prev.selectedComponentId === componentId ? null : componentId,
    }));
  }, []);

  const handleHoverComponent = useCallback((componentId: string | null) => {
    setState((prev) => ({
      ...prev,
      hoveredComponentId: componentId,
    }));
  }, []);

  const handleExplanationModeChange = useCallback((mode: ExplanationMode) => {
    setState((prev) => ({
      ...prev,
      explanationMode: mode,
    }));
  }, []);

  const handleQueryPhaseChange = useCallback((phase: number) => {
    setState((prev) => ({
      ...prev,
      currentQueryPhase: Math.max(1, Math.min(6, phase)),
    }));
  }, []);

  const toggleQueryWalkthrough = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showQueryWalkthrough: !prev.showQueryWalkthrough,
    }));
  }, []);

  const toggleLegend = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showLegend: !prev.showLegend,
    }));
  }, []);

  const handleModuleChange = useCallback((module: string) => {
    setState((prev) => ({
      ...prev,
      activeModule: module as any,
    }));
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          setState((prev) => ({
            ...prev,
            selectedComponentId: null,
            showQueryWalkthrough: false,
            showLegend: false,
          }));
          break;
        case 'ArrowRight':
          if (state.showQueryWalkthrough) {
            handleQueryPhaseChange(state.currentQueryPhase + 1);
            event.preventDefault();
          }
          break;
        case 'ArrowLeft':
          if (state.showQueryWalkthrough) {
            handleQueryPhaseChange(state.currentQueryPhase - 1);
            event.preventDefault();
          }
          break;
        case 'h':
        case 'H':
          if (event.ctrlKey || event.metaKey) {
            toggleLegend();
            event.preventDefault();
          }
          break;
        case 'w':
        case 'W':
          if (event.ctrlKey || event.metaKey) {
            toggleQueryWalkthrough();
            event.preventDefault();
          }
          break;
        default:
          break;
      }
    },
    [state.showQueryWalkthrough, state.currentQueryPhase, handleQueryPhaseChange, toggleLegend, toggleQueryWalkthrough],
  );

  return (
    <div className="app" onKeyDown={handleKeyDown} tabIndex={0} role="application">
      <header className="app-header">
        <h1>Microsoft Fabric Direct Lake Explorer</h1>
        <p className="subtitle">Interactive visualization of Direct Lake with Delta Lake and Parquet storage</p>
      </header>

      <nav className="app-controls">
        <div className="module-selector">
          <button
            className={`module-button ${state.activeModule === 'architecture' ? 'active' : ''}`}
            onClick={() => handleModuleChange('architecture')}
            title="Architecture Overview"
          >
            🏗️ Architecture
          </button>
          <button
            className={`module-button ${state.activeModule === 'deltaLake' ? 'active' : ''}`}
            onClick={() => handleModuleChange('deltaLake')}
            title="Delta Lake Explorer"
          >
            📜 Delta Lake
          </button>
          <button
            className={`module-button ${state.activeModule === 'parquet' ? 'active' : ''}`}
            onClick={() => handleModuleChange('parquet')}
            title="Parquet Explorer"
          >
            📦 Parquet
          </button>
          <button
            className={`module-button ${state.activeModule === 'predicatePushdown' ? 'active' : ''}`}
            onClick={() => handleModuleChange('predicatePushdown')}
            title="Predicate Pushdown Simulator"
          >
            🔍 Pushdown
          </button>
          <button
            className={`module-button ${state.activeModule === 'partitioning' ? 'active' : ''}`}
            onClick={() => handleModuleChange('partitioning')}
            title="Partitioning Explorer"
          >
            📂 Partitions
          </button>
          <button
            className={`module-button ${state.activeModule === 'schemaEvolution' ? 'active' : ''}`}
            onClick={() => handleModuleChange('schemaEvolution')}
            title="Schema Evolution Explorer"
          >
            📋 Schema
          </button>
        </div>

        <div className="control-group">
          <label htmlFor="mode-selector">Explanation Mode:</label>
          <select
            id="mode-selector"
            value={state.explanationMode}
            onChange={(e) => handleExplanationModeChange(e.target.value as ExplanationMode)}
            className="mode-selector"
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>

        {state.activeModule === 'architecture' && (
          <>
            <div className="control-group">
              <button
                className={`toggle-button ${state.showQueryWalkthrough ? 'active' : ''}`}
                onClick={toggleQueryWalkthrough}
                aria-pressed={state.showQueryWalkthrough}
                title="Ctrl+W: Show query execution pipeline"
              >
                📊 Query Pipeline
              </button>
            </div>

            <div className="control-group">
              <button
                className={`toggle-button ${state.showLegend ? 'active' : ''}`}
                onClick={toggleLegend}
                aria-pressed={state.showLegend}
                title="Ctrl+H: Show documentation legend"
              >
                📋 Legend
              </button>
            </div>

            <div className="control-group info">
              <span>{components.length} components • {queryPhases.length}-phase pipeline</span>
            </div>
          </>
        )}
      </nav>

      <main className="app-main">
        {state.activeModule === 'architecture' && (
          <>
            <div className="explorer-section">
              <ArchitectureExplorer
                components={components}
                selectedComponentId={state.selectedComponentId}
                hoveredComponentId={state.hoveredComponentId}
                onSelectComponent={handleSelectComponent}
                onHoverComponent={handleHoverComponent}
              />
            </div>

            <aside className="details-section">
              {selectedComponent ? (
                <DetailPanel
                  component={selectedComponent}
                  mode={state.explanationMode}
                  onClose={() => setState((prev) => ({ ...prev, selectedComponentId: null }))}
                />
              ) : (
                <div className="empty-state">
                  <p>👆 Click a component to view details</p>
                  <p className="hint">
                    Press <kbd>Ctrl+H</kbd> for legend • <kbd>Ctrl+W</kbd> for query pipeline
                  </p>
                </div>
              )}
            </aside>
          </>
        )}

        {state.activeModule === 'deltaLake' && (
          <div className="full-width-module">
            <DeltaLakeExplorer explanationMode={state.explanationMode} transactionLog={generateSyntheticDeltaLog()} />
          </div>
        )}

        {state.activeModule === 'parquet' && (
          <div className="full-width-module">
            <ParquetExplorer explanationMode={state.explanationMode} parquetFile={generateSyntheticParquetFile()} />
          </div>
        )}

        {state.activeModule === 'predicatePushdown' && (
          <div className="full-width-module">
            <PredicatePushdownSimulator
              explanationMode={state.explanationMode}
              parquetFile={generateSyntheticParquetFile()}
            />
          </div>
        )}

        {state.activeModule === 'partitioning' && (
          <div className="full-width-module">
            <PartitioningExplorer explanationMode={state.explanationMode} />
          </div>
        )}

        {state.activeModule === 'schemaEvolution' && (
          <div className="full-width-module">
            <SchemaEvolutionExplorer explanationMode={state.explanationMode} />
          </div>
        )}
      </main>

      {state.showQueryWalkthrough && (
        <div className="modal-overlay" onClick={toggleQueryWalkthrough}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={toggleQueryWalkthrough} aria-label="Close query pipeline">
              ✕
            </button>
            <DataFlowWalkthrough phase={state.currentQueryPhase} onPhaseChange={handleQueryPhaseChange} mode={state.explanationMode} />
          </div>
        </div>
      )}

      {state.showLegend && (
        <div className="modal-overlay" onClick={toggleLegend}>
          <div className="modal-content legend-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={toggleLegend} aria-label="Close legend">
              ✕
            </button>
            <Legend />
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>
          📚 All components reference{' '}
          <a href="https://learn.microsoft.com/en-us/fabric/" target="_blank" rel="noopener noreferrer">
            Microsoft Learn
          </a>
        </p>
        <p>🎓 Educational simulation • 🔒 Local-only operation • 🆓 No Fabric account required</p>
        <p className="copyright">Stage 4-5 Deliverable • Microsoft Fabric Direct Lake Explorer</p>
      </footer>
    </div>
  );
};

export default App;
