import React, { useState } from 'react';
import { ExplanationMode } from '../types';
import DictionaryEncodingExplorer from './DictionaryEncodingExplorer';
import './VertiPaqSimulator.css';

interface VertiPaqSimulatorProps {
  explanationMode: ExplanationMode;
}

const VertiPaqSimulator: React.FC<VertiPaqSimulatorProps> = ({ explanationMode }) => {
  const [activeModule, setActiveModule] = useState<string>('dictionary');

  const modules = [
    { id: 'dictionary', name: '📚 Dictionary Encoding', icon: '📚' },
    { id: 'encoding', name: '🔄 Value vs Hash Encoding', icon: '🔄' },
    { id: 'segment', name: '📊 Segment Explorer', icon: '📊' },
    { id: 'elimination', name: '🔍 Segment Elimination', icon: '🔍' },
    { id: 'compression', name: '📦 Column Compression', icon: '📦' },
    { id: 'loading', name: '⬆️ Direct Lake Loading', icon: '⬆️' },
    { id: 'memory', name: '💾 Memory Residency', icon: '💾' },
    { id: 'storage', name: '⚙️ Storage Engine Scan', icon: '⚙️' },
  ];

  return (
    <div className="vertipaq-simulator">
      <header className="simulator-header">
        <h1>VertiPaq Simulator</h1>
        <p className="simulator-subtitle">
          Learn how Microsoft Fabric Direct Lake uses VertiPaq storage internals for fast query execution
        </p>
      </header>

      <div className="modules-nav">
        {modules.map((module) => (
          <button
            key={module.id}
            className={`module-tab ${activeModule === module.id ? 'active' : ''}`}
            onClick={() => setActiveModule(module.id)}
            title={module.name}
          >
            <span className="module-icon">{module.icon}</span>
            <span className="module-label">{module.name}</span>
          </button>
        ))}
      </div>

      <main className="module-content">
        {activeModule === 'dictionary' && <DictionaryEncodingExplorer explanationMode={explanationMode} />}
        {activeModule === 'encoding' && (
          <div className="placeholder-module">
            <p>Value vs Hash Encoding Simulator - Coming Soon</p>
          </div>
        )}
        {activeModule === 'segment' && (
          <div className="placeholder-module">
            <p>Segment Explorer - Coming Soon</p>
          </div>
        )}
        {activeModule === 'elimination' && (
          <div className="placeholder-module">
            <p>Segment Elimination Simulator - Coming Soon</p>
          </div>
        )}
        {activeModule === 'compression' && (
          <div className="placeholder-module">
            <p>Column Compression Explorer - Coming Soon</p>
          </div>
        )}
        {activeModule === 'loading' && (
          <div className="placeholder-module">
            <p>Direct Lake Column Loading Simulator - Coming Soon</p>
          </div>
        )}
        {activeModule === 'memory' && (
          <div className="placeholder-module">
            <p>Memory Residency and Eviction Simulator - Coming Soon</p>
          </div>
        )}
        {activeModule === 'storage' && (
          <div className="placeholder-module">
            <p>Storage Engine Scan Simulator - Coming Soon</p>
          </div>
        )}
      </main>

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
