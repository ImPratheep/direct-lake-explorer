import React from 'react';
import Icon from './Icon';
import './Legend.css';

const Legend: React.FC = () => {
  return (
    <div className="legend">
      <h2>Documentation Legend & Information</h2>

      <section className="legend-section">
        <h3>Component Classifications</h3>
        <p className="section-description">
          Each component is classified based on its documentation status in Microsoft Fabric:
        </p>

        <div className="classification-guide">
          <div className="classification-item documented">
            <span className="badge-icon">[DOCUMENTED]</span>
            <div className="classification-content">
              <h4>Documented</h4>
              <p>
                This component is explicitly documented in Microsoft Learn and official Microsoft
                Fabric documentation. The behavior and implementation details are verified against
                official sources.
              </p>
              <p className="example">
                Example: OneLake, Lakehouse, Delta Lake format, Direct Lake semantic model
              </p>
            </div>
          </div>

          <div className="classification-item simulation">
            <span className="badge-icon">[SIMULATION]</span>
            <div className="classification-content">
              <h4>Simulation / Conceptual</h4>
              <p>
                This component represents a conceptual simulation or educational visualization of
                documented behavior. While based on Microsoft documentation, the specific
                implementation details are simplified or inferred for educational purposes. This is
                NOT the actual proprietary implementation.
              </p>
              <p className="example">
                Example: VertiPaq column encoding, framing operations, query optimizer internals
              </p>
            </div>
          </div>

          <div className="classification-item inferred">
            <span className="badge-icon">[INFERRED]</span>
            <div className="classification-content">
              <h4>Inferred</h4>
              <p>
                This component represents a reasonable interpretation based on available
                documentation, industry standards, and context. It is not explicitly documented but
                is a logical inference from documented components and behavior.
              </p>
              <p className="example">
                Example: Specific encoding algorithms, cache eviction policies, query plan details
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="legend-section">
        <h3>Architectural Areas</h3>
        <p className="section-description">
          Direct Lake Explorer groups components into five conceptual areas. They are a teaching organization, not five
          independent physical layers:
        </p>

        <div className="layers-guide">
          <div className="layer-item storage-layer">
            <h4>Storage</h4>
            <p>
              The data foundation: OneLake, Lakehouse, Delta Lake, and Parquet files. This is where
              data physically resides.
            </p>
          </div>

          <div className="layer-item semantic-layer">
            <h4>Semantic</h4>
            <p>
              The Direct Lake semantic model configuration that maps storage data to business
              concepts and measures.
            </p>
          </div>

          <div className="layer-item vertipaq-layer">
            <h4>VertiPaq</h4>
            <p>
              The in-memory columnar engine that loads and manages data: framing, column loading,
              encoding, and compression.
            </p>
          </div>

          <div className="layer-item query-layer">
            <h4>Query</h4>
            <p>
              Query execution engines: Formula Engine (calculations), Storage Engine (data access),
              and xmSQL (internal query language).
            </p>
          </div>

          <div className="layer-item memory-layer">
            <h4>Memory</h4>
            <p>
              Memory management: column residency, caching strategies, and cache eviction policies.
            </p>
          </div>
        </div>
      </section>

      <section className="legend-section">
        <h3>Key Concepts</h3>
        <div className="concepts-guide">
          <div className="concept-item">
            <h4>Direct Lake</h4>
            <p>
              A semantic model storage mode that allows the in-memory VertiPaq engine to directly
              query data in Delta Lake format without importing it. This is documented in Microsoft
              Learn.
            </p>
          </div>

          <div className="concept-item">
            <h4>VertiPaq</h4>
            <p>
              The columnar in-memory database engine used by Power BI and Analysis Services. It
              loads and caches data in compressed columnar format for fast query execution.
            </p>
          </div>

          <div className="concept-item">
            <h4>Framing</h4>
            <p>
              The process of organizing and preparing data in columnar format for VertiPaq's
              in-memory cache. This is a [SIMULATION] of actual implementation details.
            </p>
          </div>

          <div className="concept-item">
            <h4>xmSQL</h4>
            <p>
              An internal query representation language used by the query engines. It is NOT SQL
              submitted directly to a relational database, but an internal format for query
              execution planning.
            </p>
          </div>

          <div className="concept-item">
            <h4>Formula Engine</h4>
            <p>
              Responsible for evaluating DAX measures, calculated columns, and other calculations.
              It orchestrates the query execution and caching logic.
            </p>
          </div>

          <div className="concept-item">
            <h4>Storage Engine</h4>
            <p>
              Responsible for reading raw data from storage and managing the column cache. It
              communicates with the Formula Engine about available data.
            </p>
          </div>
        </div>
      </section>

      <section className="legend-section">
        <h3>Important Disclaimers</h3>
        <div className="disclaimers">
          <div className="disclaimer-item">
            <span className="disclaimer-icon" aria-hidden="true"><Icon name="info" size={18} /></span>
            <p>
              <strong>This is an Educational Simulation:</strong> This application is a
              conceptual visualization and learning tool. It does NOT implement actual Microsoft
              Fabric or VertiPaq internals. Proprietary implementation details are simulated or
              inferred for educational purposes.
            </p>
          </div>

          <div className="disclaimer-item">
            <span className="disclaimer-icon" aria-hidden="true"><Icon name="info" size={18} /></span>
            <p>
              <strong>Local-Only Operation:</strong> This application runs entirely on your local
              machine. No data is sent to Microsoft or external services. No Fabric account is
              required.
            </p>
          </div>

          <div className="disclaimer-item">
            <span className="disclaimer-icon" aria-hidden="true"><Icon name="info" size={18} /></span>
            <p>
              <strong>Synthetic Data:</strong> All data in this application is synthetic and
              created for demonstration purposes. It does not represent actual Fabric data or
              performance characteristics.
            </p>
          </div>

          <div className="disclaimer-item">
            <span className="disclaimer-icon" aria-hidden="true"><Icon name="info" size={18} /></span>
            <p>
              <strong>For Accurate Documentation:</strong> Refer to official Microsoft Learn
              articles and documentation. Links to authoritative sources are provided for each
              component.
            </p>
          </div>
        </div>
      </section>

      <section className="legend-section">
        <h3>How to Use This Explorer</h3>
        <div className="usage-guide">
          <ol className="usage-steps">
            <li>
              <strong>Select a Component:</strong> Click any component card in the explorer to view
              detailed information.
            </li>
            <li>
              <strong>Choose Explanation Mode:</strong> Use the dropdown to switch between Beginner,
              Intermediate, and Advanced explanations tailored to your knowledge level.
            </li>
            <li>
              <strong>View Query Pipeline:</strong> Click "Query Pipeline" to see a 6-phase
              walkthrough of query execution.
            </li>
            <li>
              <strong>Check Source References:</strong> Every component includes links to Microsoft
              Learn documentation for further reading.
            </li>
            <li>
              <strong>Explore Relationships:</strong> See how components relate to each other through
              inputs, outputs, and dependencies.
            </li>
            <li>
              <strong>Keyboard Navigation:</strong> Use Tab to navigate, Enter to select, Arrow keys
              to navigate phases, Escape to close panels.
            </li>
          </ol>
        </div>
      </section>

      <section className="legend-section">
        <h3>Resources</h3>
        <div className="resources">
          <p>
            📖{' '}
            <a
              href="https://learn.microsoft.com/en-us/fabric/data-engineering/onelake-overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              OneLake Documentation
            </a>
          </p>
          <p>
            📖{' '}
            <a
              href="https://learn.microsoft.com/en-us/fabric/data-warehouse/data-warehousing"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fabric Data Warehouse
            </a>
          </p>
          <p>
            📖{' '}
            <a
              href="https://learn.microsoft.com/en-us/power-bi/enterprise/service-premium-direct-lake"
              target="_blank"
              rel="noopener noreferrer"
            >
              Direct Lake Overview
            </a>
          </p>
          <p>
            📖{' '}
            <a
              href="https://learn.microsoft.com/en-us/power-bi/fundamentals/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Power BI Fundamentals
            </a>
          </p>
        </div>
      </section>
    </div>
  );
};

export default Legend;
