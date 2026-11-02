import React from 'react';
import { ArchitectureComponent } from '../types';
import Icon, { IconName } from './Icon';
import './ArchitectureExplorer.css';

type AreaName = 'Storage' | 'Semantic' | 'VertiPaq' | 'Query' | 'Memory';

interface ArchitectureExplorerProps {
  components: ArchitectureComponent[];
  selectedComponentId: string | null;
  hoveredComponentId: string | null;
  onSelectComponent: (componentId: string) => void;
  onHoverComponent: (componentId: string | null) => void;
  /** Opens a learning module, optionally a specific VertiPaq simulator tab. */
  onOpenModule?: (module: string, vertipaqTab?: string) => void;
}

interface RelatedModule {
  label: string;
  module: string;
  vertipaqTab?: string;
}

interface AreaDefinition {
  id: AreaName;
  description: string;
  icon: IconName;
  related: RelatedModule[];
}

/**
 * The five areas are a conceptual grouping used for teaching. They are not five independent
 * physical layers. `related` lists the simulator modules that explain each area; it is shown
 * only when an area has no component cards of its own.
 */
const AREAS: AreaDefinition[] = [
  {
    id: 'Storage',
    description: 'OneLake, Lakehouse, Delta Lake, Parquet files',
    icon: 'deltaLake',
    related: [
      { label: 'Delta Lake Explorer', module: 'deltaLake' },
      { label: 'Parquet Explorer', module: 'parquet' },
    ],
  },
  {
    id: 'Semantic',
    description: 'Direct Lake semantic model configuration',
    icon: 'schema',
    related: [{ label: 'Direct Lake Column Loading', module: 'vertipaq', vertipaqTab: 'loading' }],
  },
  {
    id: 'VertiPaq',
    description: 'In-memory columnar engine: framing, loading, encoding',
    icon: 'vertipaq',
    related: [
      { label: 'Dictionary Encoding', module: 'vertipaq', vertipaqTab: 'dictionary' },
      { label: 'Segment Explorer', module: 'vertipaq', vertipaqTab: 'segment' },
      { label: 'Column Compression', module: 'vertipaq', vertipaqTab: 'compression' },
    ],
  },
  {
    id: 'Query',
    description: 'Formula Engine, Storage Engine, xmSQL',
    icon: 'scan',
    related: [
      { label: 'Segment Elimination', module: 'vertipaq', vertipaqTab: 'elimination' },
      { label: 'Storage Engine Scan', module: 'vertipaq', vertipaqTab: 'storage' },
    ],
  },
  {
    id: 'Memory',
    description: 'Column residency, caching, eviction strategies',
    icon: 'memory',
    related: [
      { label: 'Direct Lake Column Loading', module: 'vertipaq', vertipaqTab: 'loading' },
      { label: 'Memory Residency', module: 'vertipaq', vertipaqTab: 'memory' },
    ],
  },
];

const ArchitectureExplorer: React.FC<ArchitectureExplorerProps> = ({
  components,
  selectedComponentId,
  hoveredComponentId,
  onSelectComponent,
  onHoverComponent,
  onOpenModule,
}) => {
  return (
    <div className="architecture-explorer">
      <div className="architecture-visualization">
        {AREAS.map((area, index) => {
          const areaComponents = components.filter((c) => c.layer === area.id);
          const headingId = `arch-area-${area.id.toLowerCase()}`;
          const count = areaComponents.length;

          return (
            <section key={area.id} className="arch-area" data-area={area.id.toLowerCase()} aria-labelledby={headingId}>
              <header className="arch-area-header">
                <span className="arch-area-icon" aria-hidden="true">
                  <Icon name={area.icon} size={20} />
                </span>
                <div className="arch-area-heading">
                  <p className="arch-area-eyebrow">Area {index + 1} of {AREAS.length}</p>
                  <h3 id={headingId} className="arch-area-title">
                    {area.id}
                  </h3>
                  <p className="arch-area-description">{area.description}</p>
                </div>
                <span className="arch-area-count">
                  {count} {count === 1 ? 'component' : 'components'}
                </span>
              </header>

              {count > 0 ? (
                <div className="arch-grid">
                  {areaComponents.map((component) => {
                    const isSelected = component.id === selectedComponentId;
                    const isHovered = component.id === hoveredComponentId;
                    const classification = component.classification.toLowerCase();
                    const classNames = [
                      'arch-card',
                      isSelected && 'is-selected',
                      isHovered && 'is-hovered',
                      `arch-card-${classification}`,
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <button
                        key={component.id}
                        type="button"
                        className={classNames}
                        onClick={() => onSelectComponent(component.id)}
                        onMouseEnter={() => onHoverComponent(component.id)}
                        onMouseLeave={() => onHoverComponent(null)}
                        onFocus={() => onHoverComponent(component.id)}
                        onBlur={() => onHoverComponent(null)}
                        aria-pressed={isSelected}
                        aria-labelledby={`${component.id}-name`}
                        aria-describedby={`${component.id}-purpose ${component.id}-class`}
                      >
                        <span className="arch-card-top">
                          <span id={`${component.id}-name`} className="arch-card-name">
                            {component.name}
                          </span>
                          {isSelected && <Icon name="check" size={16} className="arch-card-check" />}
                        </span>
                        <span id={`${component.id}-purpose`} className="arch-card-purpose">
                          {component.purpose}
                        </span>
                        <span className="arch-card-foot">
                          <span id={`${component.id}-class`} className={`label-badge label-${classification}`}>
                            [{component.classification}]
                          </span>
                          <span className="arch-card-hint" aria-hidden="true">
                            {isSelected ? 'Selected' : 'View details'}
                            {!isSelected && <Icon name="chevronRight" size={14} />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="arch-empty">
                  <p className="arch-empty-title">No component cards in this area yet</p>
                  <p className="arch-empty-text">
                    Individual components for {area.id} are not listed in this explorer yet. These simulator modules
                    explain the area:
                  </p>
                  {onOpenModule && (
                    <ul className="arch-empty-links">
                      {area.related.map((item) => (
                        <li key={item.label}>
                          <button
                            type="button"
                            className="ui-button"
                            onClick={() => onOpenModule(item.module, item.vertipaqTab)}
                          >
                            {item.label}
                            <Icon name="chevronRight" size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="arch-tip">
        <strong>Tip:</strong> Click any component to see detailed explanations, inputs, outputs, and source references.
      </p>
    </div>
  );
};

export default ArchitectureExplorer;
