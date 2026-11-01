# Query Execution Flow - Direct Lake Architecture

**Project:** Microsoft Fabric Direct Lake Explorer  
**Stage:** 2 - Research Direct Lake architecture  
**Date:** November 1, 2026  
**Scope:** Educational reference for query execution pipeline  

---

## Overview

This document traces the complete flow of a query through the Direct Lake architecture, from initial user interaction through result delivery. Each step identifies the component responsible and the operations performed.

---

## 1. Query Submission Phase

### Step 1a: User Interaction
```
Power BI Desktop / Fabric Portal
  ↓
User selects visualization / enters DAX query
  ↓
Report interactions (filter, drill-down, measure selection)
```

**What Happens:**
- User clicks visualization or types DAX expression
- Report engine captures the request
- Context variables set (selected filters, drill-down values)

**Component:** Power BI Client (Frontend)  
**Output:** DAX Query String

---

### Step 1b: DAX Query Compilation
```
DAX Query String
  ↓
Power BI sends to Analysis Services
  ↓
Formula Engine receives query
```

**What Happens:**
- Query transmitted to Analysis Services backend
- Query string received at Formula Engine
- Basic syntax validation performed

**Component:** Formula Engine (FE)  
**Output:** Query ready for parsing

---

## 2. Formula Engine Phase (Query Planning)

### Step 2a: Query Parsing
```
Formula Engine receives DAX
  ↓
Tokenize and parse DAX syntax
  ↓
Build abstract syntax tree (AST)
  ↓
Validate against semantic model
```

**What Happens:**
- DAX broken into tokens (keywords, operators, functions)
- Parsed according to DAX grammar rules
- Validated against semantic model definitions
- Functions resolved (SUMX, FILTER, CALCULATE, etc.)

**Component:** Formula Engine  
**Output:** Abstract Syntax Tree (internal representation)

---

### Step 2b: Query Planning
```
AST from Formula Engine
  ↓
Analyze required columns
  ↓
Identify necessary tables
  ↓
Determine aggregation needs
  ↓
Apply relationship traversals
  ↓
Generate logical query plan
```

**Detailed Process:**

1. **Column Identification**
   - Which columns needed to satisfy query?
   - Example: `SUMX(Sales, [Amount] * [Quantity])`
   - Requires: Sales.Amount, Sales.Quantity

2. **Table Analysis**
   - Which tables must be accessed?
   - Which related tables needed via relationships?
   - Cardinality effects on joins

3. **Aggregation Determination**
   - Will result be aggregated or row-level?
   - Which aggregations can be pushed down to Storage Engine?
   - Which calculations must happen at Formula Engine?

4. **Filter Context**
   - Explicit filters: WHERE, FILTER()
   - Implicit filters: Report-level filters, slicers, drill-down context
   - Filter interaction and precedence

5. **Relationship Traversal**
   - Which relationships must be followed?
   - One-to-many vs. many-to-one implications
   - Multiple relationship handling

**Component:** Formula Engine  
**Output:** Logical Query Plan (columns, tables, conditions)

---

### Step 2c: Request Generation
```
Logical Query Plan
  ↓
Generate Storage Engine request list
  ↓
Create batch of column requests
  ↓
Prioritize by likeliness to be cached
```

**What Happens:**
- Logical plan translated to Storage Engine request format
- Columns grouped by table
- Estimated selectivity calculated (how many rows will match filters)
- Requests ordered for likely cache hits first

**Component:** Formula Engine  
**Output:** Storage Engine Request Batch

---

## 3. Storage Engine Phase (Data Retrieval)

### Step 3a: Column Cache Check
```
Storage Engine receives request for column(s)
  ↓
For each requested column:
  ├─ Is column in memory cache? ✓
  │  └─ [YES] → Use cached data, apply filters, return
  └─ Is column in memory cache? ✗
     └─ [NO] → Proceed to Step 3b
```

**Decision Tree:**

```
Column Request
  ├─ Check cache metadata
  │  ├─ Column present? YES → return cached data
  │  └─ Column present? NO → continue
  ├─ Check available memory
  │  ├─ Space available? YES → proceed to transcode
  │  └─ Space available? NO → evict + proceed
  └─ Transcode from OneLake Parquet
```

**Performance Note:**
- Cache hit: ~1-10 milliseconds (no transcoding)
- Cache miss: ~100-1000 milliseconds (depends on column size, compression)

**Component:** Storage Engine  
**Output:** Column Data (cached or newly transcoded)

---

### Step 3b: OneLake Retrieval (Cache Miss)
```
Column NOT in cache
  ↓
Storage Engine queries OneLake
  ↓
Locate Delta table for column
  ↓
Read Parquet file metadata
  ↓
Identify row groups containing data
```

**Detailed Process:**

1. **Delta Table Lookup**
   - Find Delta table corresponding to query table
   - Verify table version/snapshot (via transaction log)
   - Read table metadata (columns, types, statistics)

2. **Parquet File Analysis**
   - Locate Parquet file(s) containing column data
   - May be single file or multiple files (partitioned tables)
   - Read file footer (contains metadata)

3. **Row Group Identification**
   - Parquet organized as row groups (~128 MB each)
   - Each row group contains column chunks for all columns
   - Identify which row groups match filter conditions

**Component:** Storage Engine communicating with OneLake  
**Output:** Parquet metadata and file locations

---

### Step 3c: Segment Elimination
```
Row group metadata available
  ↓
For each row group:
  ├─ Examine column statistics (min/max per chunk)
  └─ Can this chunk match query filters?
     ├─ YES (might match) → include chunk
     └─ NO (can't match) → skip chunk (eliminated!)
```

**Example:**

Query: `WHERE Date >= '2024-01-01'`

Parquet Statistics per row group:
- Row Group 1: Date min='2023-01-15', max='2023-12-31' → **SKIP** (max < query min)
- Row Group 2: Date min='2024-01-01', max='2024-06-30' → **INCLUDE** (overlaps range)
- Row Group 3: Date min='2024-07-01', max='2024-12-31' → **INCLUDE** (overlaps range)

**Performance Impact:**
- Segment elimination can reduce data scanned by 90%+
- Critical for performance on large tables with range filters

**Component:** Storage Engine  
**Output:** Filtered set of row groups / column chunks to transcode

---

### Step 3d: Transcoding (Parquet → VertiPaq)
```
Row groups selected for inclusion
  ↓
For each row group:
  ├─ Read Parquet column chunk data
  ├─ Decompress (Snappy, Gzip, etc.)
  ├─ Decode column values
  ├─ Apply VertiPaq encoding
  │  ├─ Dictionary encoding OR
  │  └─ Hash encoding (automatic selection)
  ├─ Create VertiPaq segments (~8,000 rows per segment)
  ├─ Store segment statistics (min/max)
  └─ Load into memory
```

**Transcoding Example - Dictionary Encoding:**

Original Parquet Data:
```
Country: ["USA", "Canada", "USA", "Mexico", "USA", "Canada", "USA", "Mexico"]
```

Transcoded to VertiPaq:
```
Dictionary:
  [0] = "USA"
  [1] = "Canada"
  [2] = "Mexico"

Column Data (indices):
  [0, 1, 0, 2, 0, 1, 0, 2]

Memory Saving: 8 strings → 3 unique + 8 indices
  Original: ~50 bytes (strings in UTF-8)
  Encoded: ~15 bytes (3 strings + 8 small integers)
  Compression Ratio: ~3.3x
```

**Memory Usage:**
- Typical compression ratio: 10:1 (10 GB data → 1 GB memory)
- Varies by data type and cardinality
- Well-known data compresses better (categorical, repeated values)

**Component:** Storage Engine  
**Output:** VertiPaq-encoded column data in memory

---

### Step 3e: Filter Application
```
Column data now in VertiPaq memory
  ↓
Apply filter predicates
  ├─ For range filter (Date > X):
  │  └─ Examine segment min/max, skip non-matching segments
  ├─ For equality filter (Country = "USA"):
  │  └─ Dictionary lookup returns matching indices
  └─ For complex filters:
     └─ Apply expression logic per row/value
```

**Filter Efficiency with Dictionary:**

Filter: `WHERE Country = "USA"`

With Dictionary Encoding:
1. Dictionary lookup: "USA" → index 0
2. Find all rows with index 0 in column data
3. Result: rows [0, 2, 4, 6]

**Without Dictionary:**
1. Compare every row's string value to "USA"
2. Slower string comparisons, no index optimization

**Component:** Storage Engine  
**Output:** Filtered column data

---

### Step 3f: Aggregation (if applicable)
```
Filtered column data available
  ↓
If query uses aggregations:
  ├─ SUM: Add all values in filtered column
  ├─ COUNT: Count rows in filtered column
  ├─ AVG: Sum / Count for filtered column
  ├─ GROUP BY: Aggregate per category
  └─ Can return aggregate instead of detail rows
```

**Pushdown Example:**

Query: `EVALUATE SUMMARIZECOLUMNS( 'Sales'[Country], "Total", SUM('Sales'[Amount]) )`

Storage Engine can return:
```
Country  | Total
---------|-------
Canada   | 125000
Mexico   | 87500
USA      | 250000
```

Instead of all detail rows, reducing data returned to FE.

**Component:** Storage Engine  
**Output:** Filtered and aggregated data

---

### Step 3g: Data Return
```
Processed column data ready
  ↓
Serialize for transmission
  ↓
Send to Formula Engine
```

**What's Transmitted:**
- Column data subset (filtered by predicates)
- Aggregations (if calculated at Storage Engine)
- Metadata (row counts, statistics)

**Component:** Storage Engine → Formula Engine  
**Output:** Result set

---

## 4. Formula Engine Phase (Results Assembly)

### Step 4a: Data Reception
```
Formula Engine receives data from Storage Engine
  ↓
Deserialize result set
  ↓
Match to query plan expectations
```

**What Happens:**
- Data received from Storage Engine
- Validated against expected schema
- Organized according to query structure

**Component:** Formula Engine  
**Output:** Result data in FE structures

---

### Step 4b: Final Calculations
```
Data from Storage Engine
  ↓
Apply Formula Engine-level calculations:
  ├─ Measures not pushed to SE
  ├─ DAX expressions on aggregated data
  ├─ Calculated columns
  ├─ Row-level security filters
  ├─ Context manipulation
  └─ Final aggregations
```

**Examples:**

1. **Measure Calculation:**
   ```dax
   Revenue per Customer = [Total Revenue] / [Customer Count]
   ```
   Storage Engine returns total, count; FE divides

2. **Conditional Logic:**
   ```dax
   Status = IF([Amount] > 100, "High", "Low")
   ```
   Storage Engine returns amounts; FE applies logic

3. **Cross-table Calculations:**
   ```dax
   Margin % = ([Sales Amount] - [Cost]) / [Sales Amount]
   ```
   May require data from multiple tables; FE orchestrates

**Component:** Formula Engine  
**Output:** Final calculated results

---

### Step 4c: Format and Sort
```
Calculated results
  ↓
Apply requested sort order
  ↓
Format for presentation
  ├─ Convert to display format (dates, currencies)
  ├─ Apply number formatting
  ├─ Truncate/limit result set if needed
  └─ Prepare for visualization
```

**Component:** Formula Engine  
**Output:** Formatted result set ready for rendering

---

## 5. Return to Client

### Step 5a: Result Transmission
```
Formatted results from Formula Engine
  ↓
Serialize for network transmission
  ↓
Send to Power BI Client (Desktop/Web)
  ↓
Typically JSON or proprietary format
```

**Component:** Analysis Services  
**Output:** HTTP response with results

---

### Step 5b: Client Rendering
```
Results received at Power BI Client
  ↓
Parse result set
  ↓
Update visualization
  ├─ Chart rendering
  ├─ Table rendering
  ├─ Gauge/KPI rendering
  └─ Custom visual rendering
  ↓
Display to user
```

**Component:** Power BI Client (Frontend)  
**Output:** User sees updated visualization

---

## 6. Memory Management Phase

### Ongoing: Cache Residency
```
While system is active:
  ├─ Frequently used columns stay in memory
  ├─ Infrequently used columns eligible for eviction
  ├─ Monitor memory capacity utilization
  └─ When memory pressure occurs → eviction
```

**Eviction Decision:**

```
Memory Full? 
  ├─ NO → Keep column cached
  └─ YES → Evict least recently used column
           Storage Engine will reload if needed in future query
```

**Performance Impact:**
- Cache hits: Fast queries (1-10 ms)
- Eviction + reload: Slower (100-1000 ms)
- Enables > capacity datasets by smart eviction

**Component:** Storage Engine Memory Manager  
**Output:** Optimized memory utilization

---

## Complete Query Flow Diagram

```
┌─────────────────────────────────────┐
│ User Query in Power BI              │
│ (Filter, measure, drill-down)       │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ DAX Query Generation                │
│ Power BI Client                     │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│ FORMULA ENGINE - Query Planning Phase                   │
│                                                         │
│ 1. Parse DAX query                                     │
│ 2. Build query plan (columns, tables, filters)        │
│ 3. Generate Storage Engine requests                   │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│ STORAGE ENGINE - Data Retrieval Phase                   │
│                                                         │
│ 1. Check column cache                                 │
│    ├─ Cache hit? → Use cached data                   │
│    └─ Cache miss? → Proceed to retrieval             │
│                                                         │
│ 2. Retrieve from OneLake                             │
│    ├─ Locate Delta table                             │
│    ├─ Read Parquet metadata                          │
│    ├─ Segment elimination (skip non-matching rows)   │
│    └─ Identify row groups to transcode               │
│                                                         │
│ 3. Transcoding (Parquet → VertiPaq)                 │
│    ├─ Decompress Parquet                             │
│    ├─ Apply dictionary/hash encoding                 │
│    ├─ Create VertiPaq segments                       │
│    └─ Load into memory                               │
│                                                         │
│ 4. Apply filters                                      │
│    └─ Reduce row set by predicates                   │
│                                                         │
│ 5. Calculate aggregations (if possible)              │
│    └─ Push aggregations to Storage Engine            │
│                                                         │
│ 6. Return data to Formula Engine                     │
└────────────┬────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ FORMULA ENGINE - Results Assembly Phase     │
│                                              │
│ 1. Receive data from Storage Engine         │
│ 2. Apply FE-level calculations              │
│    ├─ Measures and expressions              │
│    ├─ Calculated columns                    │
│    ├─ Row-level security                    │
│    └─ Final aggregations                    │
│ 3. Format and sort results                  │
│ 4. Return to client                         │
└────────────┬─────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────┐
│ Power BI Client                              │
│ Render visualization with results            │
│ Display to user                              │
└──────────────────────────────────────────────┘
```

---

## Performance Characteristics

### Typical Query Latency

```
Cache Hit Scenario:
┌────────────────────────────┐
│ FE: Parse & Plan   2 ms    │
│ SE: Get from cache 1 ms    │
│ SE: Filter & agg   3 ms    │
│ FE: Assemble      1 ms     │
├────────────────────────────┤
│ Total:            ~7 ms    │
└────────────────────────────┘

Cache Miss Scenario:
┌────────────────────────────┐
│ FE: Parse & Plan   2 ms    │
│ SE: Get from OneLake       │
│   - Segment elim  10 ms    │
│   - Transcode    300 ms    │
│   - Filter & agg  50 ms    │
│ FE: Assemble      1 ms     │
├────────────────────────────┤
│ Total:          ~363 ms    │
└────────────────────────────┘
```

### Memory Requirements
- Column: ~100 MB raw
- Compressed (VertiPaq): ~10 MB (10:1 ratio)
- Cache management optimizes for working set

---

## Fallback Scenario: DirectQuery Mode

If Direct Lake cannot execute query:

```
Query → Formula Engine
  ↓
"Direct Lake doesn't support this operation"
  ↓
FALLBACK: DirectQuery to SQL Endpoint
  ↓
  ├─ Convert DAX to SQL
  ├─ Execute on SQL database
  ├─ Return results
  └─ (Slower, but enables unsupported scenarios)
```

**Fallback Triggers:**
- Unsupported DAX functions in Direct Lake
- Memory capacity exceeded (can't cache columns)
- Security requirements (fall back to SQL-level RLS)

---

## Key Optimization Points

### 1. Segment Elimination
- Pre-filter data at Storage Engine
- Use statistics (min/max) to skip irrelevant segments
- Can reduce data scanned by 90%+

### 2. Column Cache
- Keep frequently accessed columns in memory
- Avoid transcoding cost for repeat queries
- Smart LRU eviction under memory pressure

### 3. Aggregation Pushdown
- Move aggregations to Storage Engine when possible
- Return aggregated results instead of detail rows
- Reduces data transmitted between SE and FE

### 4. Predicate Pushdown
- Push filters to Storage Engine early
- Reduce rows processed before aggregation
- Standard database optimization technique

### 5. Encoding Selection
- Automatic dictionary vs. hash encoding choice
- Dictionary for low-cardinality (high compression)
- Hash for high-cardinality (acceptable compression)

---

## Summary

**Direct Lake Query Execution is optimized for:**
1. ✅ **Speed** - VertiPaq in-memory processing (milliseconds)
2. ✅ **Scale** - No full-table load; on-demand column access
3. ✅ **Efficiency** - Segment elimination, smart caching, encoding
4. ✅ **Consistency** - Single Delta table source for all engines
5. ✅ **Reliability** - ACID guarantees, time travel, error recovery

---

**Document Status:** ✅ Complete - Ready for Stage 3 visualization  
**Next Use:** Stage 3 will create isometric illustration of this flow  
**Date:** November 1, 2026  
