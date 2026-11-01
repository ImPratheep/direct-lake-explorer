# Technical Glossary - Microsoft Fabric Direct Lake Architecture

**Purpose:** Quick reference for terminology used in Direct Lake architecture documentation.

**Date:** November 1, 2026  
**Source:** Microsoft Learn official documentation  

---

## A

### ACID (Atomicity, Consistency, Isolation, Durability)
**Definition:** Set of properties ensuring reliable database transactions.
- **Atomicity:** All-or-nothing transaction execution
- **Consistency:** Data moves from valid state to valid state
- **Isolation:** Transactions don't interfere with each other
- **Durability:** Committed data survives system failures
**Context:** Delta Lake provides ACID guarantees; Parquet files alone do not
**Related:** Transaction log, Delta Lake table

---

## C

### ACID (Atomicity, Consistency, Isolation, Durability)
**Definition:** Set of properties ensuring reliable database transactions.
**Context:** Delta Lake provides ACID; Parquet does not
**Related:** Transaction log, Delta Lake, VertiPaq

### Cache / Column Cache
**Definition:** In-memory storage of loaded columns for quick reuse.
**Mechanism:** Frequently accessed columns stay in VertiPaq memory
**Eviction:** Removed under memory pressure (LRU policy)
**Performance:** Cache hits avoid re-transcoding from Parquet
**Related:** Column residency, memory pressure, eviction

### Column Chunk
**Definition:** Individual column's data within a Parquet row group.
**Storage:** One per column per row group (~128 MB)
**Statistics:** Min/max values for segment elimination
**Related:** Parquet file, row group, statistics

### Column Dictionary
**See:** Dictionary encoding

### Column Residency
**Definition:** State of columns loaded in VertiPaq memory.
**Duration:** Until evicted due to memory pressure
**Performance:** Subsequent queries avoid reload if column cached
**Related:** Column loading, cache, eviction

### Composite Modeling
**Definition:** Mixing multiple storage modes in single semantic model.
**Modes:** Import + DirectQuery + Direct Lake in one model
**Benefit:** Flexible performance optimization per table
**Related:** Import mode, DirectQuery mode, Direct Lake mode

---

## D

### DAX (Data Analysis Expressions)
**Definition:** Formula language for Power BI semantic models.
**Execution:** Parsed by Formula Engine into query plan
**Examples:** EVALUATE, FILTER, SUMX, CALCULATE
**Related:** Formula Engine, Query execution

### Delta Lake / Delta Table
**Definition:** Parquet + transaction log for ACID transactions.
**Features:** ACID, time travel, schema evolution, unified batch/streaming
**Advantages:** Reliability and governance vs. Parquet alone
**Fabric Default:** Standard format for OneLake analytical tables
**Related:** Parquet, transaction log, table snapshot

### Dictionary Encoding
**Definition:** Compression storing unique values once.
**Implementation:** Dictionary holds uniques; rows store indices
**Compression Ratio:** 10:1+ for repetitive data
**Performance:** Enables fast aggregations on categorical data
**Alternative:** Hash encoding for high-cardinality columns
**Related:** Value encoding, VertiPaq, hash encoding

### Direct Lake
**Definition:** Storage mode loading required columns on-demand from OneLake.
**Performance:** Import speed + scalability (no full reload)
**Data Latency:** Near real-time with metadata refresh
**Fallback:** DirectQuery if memory insufficient
**Related:** OneLake, VertiPaq, transcoding

### Direct Lake Framing
**Definition:** Creating semantic model understanding of Delta table structure.
**Process:** Reading Delta metadata to understand columns/types/relationships
**Lightweight:** Structural knowledge only, not data loading
**Related:** Metadata refresh, semantic model

### DirectQuery
**Definition:** Storage mode executing queries live against source database.
**Execution:** Real-time SQL against source (no import)
**Performance:** Slower than Import/Direct Lake but unlimited data size
**Use Case:** Real-time data, dynamic data, security at source
**Fallback:** Used when Direct Lake can't handle query
**Related:** Direct Lake, Import mode

---

## E

### Encoding
**Definition:** Compression technique for efficient storage.
**Types:** Dictionary, hash, run-length encoding
**Purpose:** Reduce memory footprint and speed queries
**Automatic:** VertiPaq selects optimal encoding per column
**Related:** Dictionary encoding, compression, VertiPaq

### Eviction (Memory Eviction)
**Definition:** Removing columns from VertiPaq memory under pressure.
**Trigger:** Memory full and new columns needed
**Policy:** LRU (Least Recently Used) mechanism
**Consequence:** Evicted column must reload on demand (slower)
**Benefit:** Working set > capacity via column paging
**Related:** Memory pressure, column residency, cache

---

## F

### Formula Engine (FE)
**Definition:** DAX query processing component.
**Responsibilities:**
  - Parse DAX formulas
  - Create query plans
  - Identify columns/aggregations needed
  - Coordinate Storage Engine requests
  - Assemble final results
**Interaction:** Works with Storage Engine for data
**Related:** Storage Engine, DAX, query execution

---

## H

### Hash Encoding
**Definition:** Compression for high-cardinality columns.
**Use Case:** Columns with many unique values (IDs, dates)
**Alternative:** Dictionary encoding for low-cardinality
**Automatic:** VertiPaq chooses based on column characteristics
**Related:** Dictionary encoding, encoding, compression

---

## I

### Import Mode
**Definition:** Loading data into Power BI with VertiPaq compression.
**Process:** Load once, compress, store, cache in memory
**Refresh:** Full refresh needed when source data changes
**Performance:** Fast queries (in-memory), slow refresh
**Limitation:** Data size limited by available memory
**Related:** DirectQuery, Direct Lake, storage modes

---

## L

### Lakehouse
**Definition:** Data architecture combining data lake and warehouse.
**Components:** Raw zone, cleaned zone, analytics zone
**Engines:** Single query engine accessing all zones
**Benefit:** Unified analytics without separate systems
**Fabric:** First-class Fabric experience backed by OneLake
**Related:** OneLake, Delta Lake, medallion architecture

---

## M

### Medallion Architecture
**Definition:** Data lake pattern: bronze (raw), silver (clean), gold (analytics).
**OneLake Integration:** Lakehouse naturally supports medallion pattern
**Delta Lake:** Ensures transaction safety across layers
**Related:** Lakehouse, OneLake, Delta Lake

### Memory Pressure
**Definition:** Condition when VertiPaq capacity is full.
**Trigger:** New columns needed AND available space exhausted
**Resolution:** Column eviction or DirectQuery fallback
**Impact:** Performance degradation; evicted columns reload slower
**Related:** Column residency, eviction, memory capacity

### Metadata Refresh (Framing Refresh)
**Definition:** Lightweight refresh updating semantic structure, not data.
**Process:** Reads Delta metadata for column updates
**Speed:** Milliseconds (vs. data refresh taking minutes/hours)
**Benefit:** New data available without full reload
**Related:** Direct Lake framing, refresh, OneLake

---

## O

### OneLake
**Definition:** Fabric's unified cloud data lake (Azure Data Lake Storage).
**Single Namespace:** All Fabric data in one place
**Default Storage:** Used by Lakehouse, Warehouse, KQL
**Single Security:** One auth/authz model
**Delta Format:** Data stored as Delta Lake tables
**Access:** All Fabric engines access same tables
**Related:** Lakehouse, Delta Lake, Fabric

---

## P

### Parquet
**Definition:** Open-source columnar file format.
**Structure:** Row groups → column chunks → encoded data
**Advantages:** High compression, predicate pushdown, fast column queries
**Limitations:** No transactions, no schema evolution, no time travel
**Fabric Usage:** Underlying storage for Delta Lake
**Related:** Columnar storage, row group, column chunk

---

## Q

### Query Execution (Direct Lake)
**Definition:** Process executing DAX in Direct Lake model.
**Steps:**
  1. DAX submitted
  2. Formula Engine parses, creates plan
  3. Formula Engine requests columns from Storage Engine
  4. Storage Engine checks memory cache
  5. If needed, transcodes from OneLake Parquet
  6. Storage Engine applies segment elimination
  7. Returns data to Formula Engine
  8. Formula Engine performs calculations
  9. Results to user
**Related:** Formula Engine, Storage Engine, transcoding

### Query Plan
**Definition:** Optimized execution strategy for a query.
**Creator:** Formula Engine from DAX
**Content:** Columns needed, aggregations, filters, execution order
**Transmission:** Sent to Storage Engine for retrieval
**Related:** Formula Engine, DAX, query optimization

---

## R

### Row Group
**Definition:** Logical grouping of rows in Parquet (~128 MB typically).
**Structure:** Multiple column chunks (one per column)
**Statistics:** Min/max per column enables segment elimination
**Parallel Processing:** Multiple row groups processed in parallel
**Related:** Parquet file, column chunk, segment elimination

---

## S

### Segment (VertiPaq Segment)
**Definition:** Logical row grouping in VertiPaq column (~8,000 rows).
**Metadata:** Min/max values per segment
**Elimination:** Segments skipped if predicate can't match
**Example:** WHERE Date > '2024' skips segments with max date < 2024
**Performance:** Can reduce query time 10-100x for filtered data
**Related:** Segment elimination, VertiPaq, predicate pushdown

### Segment Elimination
**Definition:** Query optimization skipping non-matching segments.
**Mechanism:** Uses segment min/max to determine non-matching segments
**Benefit:** Avoids loading/scanning irrelevant data
**Performance Impact:** Dramatically speeds filtered queries
**Related:** Segment, metadata, predicate pushdown, optimization

### Semantic Model
**Definition:** Logical data model layer in Power BI.
**Components:** Tables, columns, relationships, measures (DAX), hierarchies
**Access:** Reports query model, not raw data
**Language:** DAX
**Execution:** Engine translates DAX to storage queries
**Related:** Direct Lake, Import mode, DAX

### Shortcuts (OneLake Shortcuts)
**Definition:** References to external data within OneLake.
**Benefit:** Access external data without copy
**Transformation:** Can auto-convert Parquet/CSV to Delta tables
**Use Case:** Unify external data with Fabric
**Related:** OneLake, Delta Lake, Lakehouse

### Storage Engine (SE)
**Definition:** VertiPaq component managing data retrieval and memory.
**Responsibilities:**
  - Check column cache
  - Retrieve Parquet from OneLake if needed
  - Transcode Parquet → VertiPaq
  - Apply segment elimination
  - Manage memory residency
  - Handle eviction
  - Return data to Formula Engine
**Related:** Formula Engine, VertiPaq, transcoding

---

## T

### Table Snapshot
**Definition:** Read-only view of a table at specific point in time.
**Enabled By:** Delta Lake transaction log
**Use Case:** Query history, audit, mistake recovery
**Efficiency:** No data copy; just metadata pointer
**Related:** Delta Lake, transaction log, time travel

### Time Travel
**Definition:** Query previous table versions via Delta Lake.
**Mechanism:** Transaction log records all changes
**Syntax:** Version or timestamp in query
**Use Cases:** Audit, recovery, change analysis
**Requirement:** Needs Delta Lake (not raw Parquet)
**Related:** Delta Lake, table snapshot, transaction log

### Transaction Log (Delta Lake)
**Definition:** JSON files recording all table changes.
**Location:** `_delta_log` directory alongside Parquet
**Content:** Commit records, metadata, statistics
**Purpose:** ACID, time travel, schema evolution
**Interoperability:** All engines read same log for consistency
**Related:** Delta Lake, ACID, time travel

### Transcoding
**Definition:** Converting data from Parquet to VertiPaq in-memory format.
**Process:** Decompress Parquet, apply VertiPaq encoding, load memory
**Trigger:** Column needed but not in memory
**Efficiency:** Only required columns transcoded
**Latency:** First query slower (transcoding); repeats fast (cached)
**Related:** Column loading, VertiPaq, Storage Engine, cache

---

## U

### Underlying Storage / OneLake Storage
**See:** OneLake

---

## V

### VertiPaq
**Definition:** In-memory columnar storage engine in Power BI.
**Compression:** ~10:1 via dictionary encoding and techniques
**Performance:** Enables in-memory query speeds (milliseconds)
**Usage:** Import mode (refresh cycles), Direct Lake (on-demand)
**Encoding:** Automatic dictionary vs. hash selection
**Related:** Dictionary encoding, columnar storage, in-memory analytics

### V-Order Optimization
**Definition:** Reorganizing Parquet data within Delta tables.
**Purpose:** Cluster related data for faster queries
**Benefit:** Faster queries, standard Parquet compatible
**Related:** Delta Lake, Parquet, optimization

---

## W

### Warehouse (Fabric Warehouse)
**Definition:** SQL-based analytics database in Fabric.
**Query Language:** Transact-SQL
**Storage:** Delta tables in OneLake
**Integration:** Power BI connects via Direct Lake
**Shared:** Shares OneLake with Lakehouse, KQL
**Related:** OneLake, Lakehouse, Direct Lake

---

## X

### xmSQL
**Definition:** SQL-like diagnostic representation of Storage Engine requests.
**Important:** Not actual SQL; conceptual tool
**Observability:** Visible in SQL Profiler, diagnostics
**Educational:** Shows query execution logic
**Limitation:** Real engine may optimize further
**Related:** Storage Engine, query execution, diagnostics

---

**Last Updated:** November 1, 2026  
**Source:** Microsoft Learn documentation  
**Scope:** Educational reference for Direct Lake  
