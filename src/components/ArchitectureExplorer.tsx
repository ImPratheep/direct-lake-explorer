import React, { useRef } from 'react';
import { ArchitectureComponent } from '../types';
import './ArchitectureExplorer.css';

interface ArchitectureExplorerProps {
  components: ArchitectureComponent[];
  selectedComponentId: string | null;
  hoveredComponentId: string | null;
  onSelectComponent: (componentId: string) => void;
  onHoverComponent: (componentId: string | null) => void;
}

const ArchitectureExplorer: React.FC<ArchitectureExplorerProps> = ({
  components,
  selectedComponentId,
  hoveredComponentId,
  onSelectComponent,
  onHoverComponent,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Group components by layer for visualization
  const layers = {
    Storage: components.filter(c => c.layer === 'Storage'),
    Semantic: components.filter(c => c.layer === 'Semantic'),
    VertiPaq: components.filter(c => c.layer === 'VertiPaq'),
    Query: components.filter(c => c.layer === 'Query'),
    Memory: components.filter(c => c.layer === 'Memory'),
  };

  const layerOrder: Array<'Storage' | 'Semantic' | 'VertiPaq' | 'Query' | 'Memory'> = [
    'Storage',
    'Semantic',
    'VertiPaq',
    'Query',
    'Memory',
  ];

  const layerDescriptions = {
    Storage: 'OneLake, Lakehouse, Delta Lake, Parquet files',
    Semantic: 'Direct Lake semantic model configuration',
    VertiPaq: 'In-memory columnar engine: framing, loading, encoding',
    Query: 'Formula Engine, Storage Engine, xmSQL',
    Memory: 'Column residency, caching, eviction strategies',
  };

  const layerColors = {
    Storage: '#1f77b4',
    Semantic: '#ff7f0e',
    VertiPaq: '#2ca02c',
    Query: '#d62728',
    Memory: '#9467bd',
  };

  return (
    <div className="architecture-explorer" ref={containerRef}>
      <div className="architecture-visualization">
        {layerOrder.map((layerName) => {
          const layerComponents = layers[layerName];
          return (
            <section
              key={layerName}
              className="architecture-layer"
              style={{
                borderLeftColor: layerColors[layerName],
              }}
            >
              <div className="layer-header">
                <h2 className="layer-title">{layerName} Layer</h2>
                <p className="layer-description">{layerDescriptions[layerName]}</p>
                <span className="component-count">{layerComponents.length} components</span>
              </div>

              <div className="components-grid">
                {layerComponents.map((component) => {
                  const isSelected = component.id === selectedComponentId;
                  const isHovered = component.id === hoveredComponentId;
                  const classNames = [
                    'component-card',
                    isSelected && 'selected',
                    isHovered && 'hovered',
                    `classification-${component.classification.toLowerCase()}`,
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <button
                      key={component.id}
                      className={classNames}
                      onClick={() => onSelectComponent(component.id)}
                      onMouseEnter={() => onHoverComponent(component.id)}
                      onMouseLeave={() => onHoverComponent(null)}
                      onFocus={() => onHoverComponent(component.id)}
                      onBlur={() => onHoverComponent(null)}
                      aria-pressed={isSelected}
                      title={`${component.name} (${component.classification})`}
                    >
                      <div className="component-name">{component.name}</div>
                      <div className="component-classification">
                        [{component.classification}]
                      </div>
                      <div className="component-hint">Click for details</div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="explorer-info">
        <p className="info-text">
          💡 <strong>Tip:</strong> Click any component to see detailed explanations, inputs, outputs, and source references.
        </p>
      </div>
    </div>
  );
};

export default ArchitectureExplorer;
