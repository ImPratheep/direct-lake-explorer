import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import VertiPaqSimulator from './VertiPaqSimulator';
import Icon, { IconName } from './Icon';

const NAV_ITEMS: Array<{ id: string; label: string; title: string; icon: IconName }> = [
  { id: 'architecture', label: 'Architecture', title: 'Architecture Overview', icon: 'architecture' },
  { id: 'deltaLake', label: 'Delta Lake', title: 'Delta Lake Explorer', icon: 'deltaLake' },
  { id: 'parquet', label: 'Parquet', title: 'Parquet Explorer', icon: 'parquet' },
  { id: 'predicatePushdown', label: 'Pushdown', title: 'Predicate Pushdown Simulator', icon: 'pushdown' },
  { id: 'partitioning', label: 'Partitions', title: 'Partitioning Explorer', icon: 'partitions' },
  { id: 'schemaEvolution', label: 'Schema', title: 'Schema Evolution Explorer', icon: 'schema' },
  { id: 'vertipaq', label: 'VertiPaq', title: 'VertiPaq Simulator', icon: 'vertipaq' },
];

interface ModalProps {
  label: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}

/** Accessible modal: labelled dialog, focus moves in on open, Tab stays inside, focus returns on close. */
const Modal: React.FC<ModalProps> = ({ label, onClose, className, children }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      previous?.focus?.();
    };
  }, []);

  const keepFocusInside = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`modal-content${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={keepFocusInside}
      >
        <button ref={closeRef} className="modal-close" onClick={onClose} aria-label={`Close ${label.toLowerCase()}`}>
          <Icon name="close" size={16} />
        </button>
        {children}
      </div>
    </div>
  );
};

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

  const [vertipaqStart, setVertipaqStart] = useState<string | undefined>(undefined);

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

  /** Opens a learning module from the Architecture Explorer, optionally a specific VertiPaq tab. */
  const openLearningModule = useCallback(
    (module: string, vertipaqTab?: string) => {
      setVertipaqStart(module === 'vertipaq' ? vertipaqTab : undefined);
      handleModuleChange(module);
      window.scrollTo({ top: 0 });
    },
    [handleModuleChange],
  );

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
    <div className="app" onKeyDown={handleKeyDown} tabIndex={-1}>
      <div className="app-chrome">
        <header className="app-brandbar">
          <div className="app-brand">
            <span className="app-brand-mark" aria-hidden="true">
              <Icon name="vertipaq" size={20} />
            </span>
            <div className="app-title">
              <h1>Microsoft Fabric Direct Lake Explorer</h1>
              <p className="subtitle">Interactive visualization of Direct Lake with Delta Lake and Parquet storage</p>
            </div>
          </div>

          <div className="app-brandbar-actions">
            <div className="control-group">
              <label htmlFor="mode-selector">Explanation mode</label>
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
          </div>
        </header>

        <nav className="app-controls" aria-label="Main sections">
          <div className="module-selector">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`module-button ${state.activeModule === item.id ? 'active' : ''}`}
                onClick={() => handleModuleChange(item.id)}
                title={item.title}
                aria-current={state.activeModule === item.id ? 'page' : undefined}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
              </button>
            ))}
          </div>
        </nav>

      </div>

      <main className={`app-main${state.activeModule === 'architecture' && selectedComponent ? ' has-open-details' : ''}`}>
        {state.activeModule === 'architecture' && (
          <>
            <div className="explorer-section">
              <div className="page-toolbar">
                <div className="page-toolbar-text">
                  <h2>Architecture overview</h2>
                  <p>
                    Select a component to read what it does, how it connects and where it is documented. The five
                    areas below group components for learning; they are a conceptual organization, not five
                    independent physical layers.
                  </p>
                </div>
                <div className="page-toolbar-actions">
                  <span className="meta-chip">
                    {components.length} components • {queryPhases.length}-phase pipeline
                  </span>
                  <button
                    className={`toggle-button ${state.showQueryWalkthrough ? 'active' : ''}`}
                    onClick={toggleQueryWalkthrough}
                    aria-pressed={state.showQueryWalkthrough}
                    title="Ctrl+W: Show query execution pipeline"
                  >
                    <Icon name="pipeline" size={16} />
                    Query Pipeline
                  </button>
                  <button
                    className={`toggle-button ${state.showLegend ? 'active' : ''}`}
                    onClick={toggleLegend}
                    aria-pressed={state.showLegend}
                    title="Ctrl+H: Show documentation legend"
                  >
                    <Icon name="info" size={16} />
                    Legend
                  </button>
                </div>
              </div>

              <ArchitectureExplorer
                components={components}
                selectedComponentId={state.selectedComponentId}
                hoveredComponentId={state.hoveredComponentId}
                onSelectComponent={handleSelectComponent}
                onHoverComponent={handleHoverComponent}
                onOpenModule={openLearningModule}
              />
            </div>

            <aside className={`details-section${selectedComponent ? '' : ' is-empty'}`} aria-label="Selected component">
              {selectedComponent ? (
                <DetailPanel
                  key={selectedComponent.id}
                  component={selectedComponent}
                  mode={state.explanationMode}
                  components={components}
                  onSelectComponent={(id) => setState((prev) => ({ ...prev, selectedComponentId: id }))}
                  onOpenModule={openLearningModule}
                  onClose={() => setState((prev) => ({ ...prev, selectedComponentId: null }))}
                />
              ) : (
                <div className="empty-state">
                  <span className="empty-state-icon" aria-hidden="true">
                    <Icon name="pointer" size={20} />
                  </span>
                  <p className="empty-state-title">Click a component to view details</p>
                  <p className="hint">
                    <kbd>Ctrl</kbd>+<kbd>H</kbd> legend • <kbd>Ctrl</kbd>+<kbd>W</kbd> query pipeline • <kbd>Esc</kbd> close
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

        {state.activeModule === 'vertipaq' && (
          <div className="full-width-module">
            <VertiPaqSimulator explanationMode={state.explanationMode} initialModule={vertipaqStart} />
          </div>
        )}
      </main>

      {state.showQueryWalkthrough && (
        <Modal label="Query pipeline" onClose={toggleQueryWalkthrough}>
          <DataFlowWalkthrough phase={state.currentQueryPhase} onPhaseChange={handleQueryPhaseChange} mode={state.explanationMode} />
        </Modal>
      )}

      {state.showLegend && (
        <Modal label="Legend" onClose={toggleLegend} className="legend-modal">
          <Legend />
        </Modal>
      )}

      <footer className="app-footer">
        <p>
          All components reference{' '}
          <a href="https://learn.microsoft.com/en-us/fabric/" target="_blank" rel="noopener noreferrer">
            Microsoft Learn
          </a>
        </p>
        <p>Educational simulation • Local-only operation • No Fabric account required</p>
        <p className="copyright">Direct Lake Explorer • Educational project using synthetic data</p>
      </footer>
    </div>
  );
};

export default App;
