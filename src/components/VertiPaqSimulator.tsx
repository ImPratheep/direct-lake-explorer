import React, { useState } from 'react';
import { ExplanationMode } from '../types';
import DictionaryEncodingExplorer from './DictionaryEncodingExplorer';
import ValueHashEncodingSimulator from './ValueHashEncodingSimulator';
import SegmentExplorer from './SegmentExplorer';
import SegmentEliminationSimulator from './SegmentEliminationSimulator';
import ColumnCompressionExplorer from './ColumnCompressionExplorer';
import DirectLakeLoadingSimulator from './DirectLakeLoadingSimulator';
import MemoryResidencySimulator from './MemoryResidencySimulator';
import StorageEngineScanSimulator from './StorageEngineScanSimulator';
import Icon from './Icon';
import './VertiPaqSimulator.css';

interface VertiPaqSimulatorProps {
  explanationMode: ExplanationMode;
  /** Optional tab to show first (used when another page links to a specific module). */
  initialModule?: string;
}

const VertiPaqSimulator: React.FC<VertiPaqSimulatorProps> = ({ explanationMode, initialModule }) => {
  const [activeModule, setActiveModule] = useState<string>(initialModule ?? 'dictionary');

  const modules = [
    { id: 'dictionary', name: '📚 Dictionary Encoding', label: 'Dictionary Encoding', icon: 'dictionary' },
    { id: 'encoding', name: '🔄 Value vs Hash Encoding', label: 'Value vs Hash Encoding', icon: 'encoding' },
    { id: 'segment', name: '📊 Segment Explorer', label: 'Segment Explorer', icon: 'segment' },
    { id: 'elimination', name: '🔍 Segment Elimination', label: 'Segment Elimination', icon: 'elimination' },
    { id: 'compression', name: '📦 Column Compression', label: 'Column Compression', icon: 'compression' },
    { id: 'loading', name: '⬆️ Direct Lake Loading', label: 'Direct Lake Loading', icon: 'loading' },
    { id: 'memory', name: '💾 Memory Residency', label: 'Memory Residency', icon: 'memory' },
    { id: 'storage', name: '⚙️ Storage Engine Scan', label: 'Storage Engine Scan', icon: 'scan' },
  ] as const;

  return (
    <div className="vertipaq-simulator">
      <header className="simulator-header">
        <h2>VertiPaq Simulator</h2>
        <p className="simulator-subtitle">
          Learn how Microsoft Fabric Direct Lake uses VertiPaq storage internals for fast query execution
        </p>
      </header>

      <div className="modules-nav" role="group" aria-label="VertiPaq simulator modules">
        {modules.map((module) => (
          <button
            key={module.id}
            type="button"
            className={`module-tab ${activeModule === module.id ? 'active' : ''}`}
            onClick={() => setActiveModule(module.id)}
            title={module.name}
            aria-pressed={activeModule === module.id}
          >
            <Icon name={module.icon} size={16} className="module-icon" />
            <span className="module-label">{module.label}</span>
          </button>
        ))}
      </div>

      <div className="module-content">
        {activeModule === 'dictionary' && <DictionaryEncodingExplorer explanationMode={explanationMode} />}
        {activeModule === 'encoding' && <ValueHashEncodingSimulator explanationMode={explanationMode} />}
        {activeModule === 'segment' && <SegmentExplorer explanationMode={explanationMode} />}
        {activeModule === 'elimination' && <SegmentEliminationSimulator explanationMode={explanationMode} />}
        {activeModule === 'compression' && <ColumnCompressionExplorer explanationMode={explanationMode} />}
        {activeModule === 'loading' && <DirectLakeLoadingSimulator explanationMode={explanationMode} />}
        {activeModule === 'memory' && <MemoryResidencySimulator explanationMode={explanationMode} />}
        {activeModule === 'storage' && <StorageEngineScanSimulator explanationMode={explanationMode} />}
      </div>

      <footer className="simulator-footer">
        <p>
          <strong>[SIMULATION]</strong> This is an educational simulator. It does not reproduce Microsoft's actual
          VertiPaq engine internals.
        </p>
        <p>
          <strong>[DOCUMENTED]</strong> Concepts are based on official Microsoft Fabric and Power BI documentation.
          <strong>[PROPRIETARY INTERNAL]</strong> Details about actual implementation are not publicly disclosed.
        </p>
      </footer>
    </div>
  );
};

export default VertiPaqSimulator;
