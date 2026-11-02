# Stage 6 Technical Validation: VertiPaq Simulator

**Project:** Microsoft Fabric Direct Lake Explorer (local, synthetic data only)
**Stage:** 6, VertiPaq Simulator
**Date:** November 1, 2026
**Status:** Technical architecture verified against source code and tests. Browser validation pending. Stage 6 is **not yet approved**.

> **What this project is not.** It does not reproduce Microsoft's proprietary VertiPaq engine or the Direct Lake implementation. Simulated sizes, loading steps, eviction behaviour and scan behaviour in this stage are educational calculations on synthetic data. **None of them is a Fabric measurement.**

Companion documents: [Implementation Report](./STAGE_6_IMPLEMENTATION_REPORT.md), [Test Results](./STAGE_6_TEST_RESULTS.md), [Completion Summary](./STAGE_6_COMPLETION_SUMMARY.md), [Approval Checklist](./STAGE_6_APPROVAL_CHECKLIST.md).

Evidence used: the source files in `src/data/stage6-*.ts` and `src/components`, the 670 automated tests, the Stage 2 research notes ([RESEARCH_SOURCES.md](../RESEARCH_SOURCES.md), [stage2/STAGE_2_RESEARCH_SUMMARY.md](../stage2/STAGE_2_RESEARCH_SUMMARY.md)), and Microsoft Learn pages read during Stage 6 and during this documentation phase (section 9).

---

## 1. Labels

| Label | Meaning |
|---|---|
| `[DOCUMENTED]` | Described in Microsoft documentation that was actually read. |
| `[SIMULATION]` | Implemented by this simulator (synthetic data, deterministic calculation). |
| `[SIMPLIFIED MODEL]` | An assumption made so a calculation is possible. |
| `[PROPRIETARY INTERNAL]` | Engine internals that are not publicly documented. Not modelled and not claimed. |

---

## 2. Keeping the terms precise

These four terms are related but are not interchangeable, and the simulator treats them separately.

| Term | What it is | Source |
|---|---|---|
| **Direct Lake** | A way a Power BI semantic model gets its data: it loads columns from Delta tables (Parquet files in OneLake) into memory when queries need them, rather than copying the whole model in advance. A refresh ("framing") copies metadata only. | `[DOCUMENTED]` Direct Lake overview; How Direct Lake works |
| **VertiPaq** | The in-memory columnar engine. Direct Lake queries are processed by VertiPaq, as Import queries are. In Import and Direct Lake modes, the Storage Engine uses VertiPaq to maintain a columnar in-memory store. | `[DOCUMENTED]` Direct Lake overview; Understand Direct Lake query performance |
| **Storage Engine** | Retrieves data (and initial aggregations) for the Formula Engine from the in-memory store. A single DAX query can result in several VertiPaq storage engine queries. | `[DOCUMENTED]` Understand Direct Lake query performance; Analysis Services tabular query interleaving |
| **Formula Engine** | Generates the query plan for a DAX query and retrieves the data it needs from the Storage Engine. Formula engine operations are separate from storage engine queries. | `[DOCUMENTED]` same two pages |

Stage 6 simulates parts of the Storage Engine's work and of Direct Lake's column loading. It does **not** simulate the Formula Engine, and it is not a DAX engine (section 8).

### 2.1 The five conceptual architecture areas

Stage 3 and Stage 4 organize the architecture into five areas, which those stages call layers: Storage, Semantic, VertiPaq, Query and Memory. They are a **teaching organization**, not five independent physical layers. For example, the Storage Engine and Formula Engine are query-processing components, VertiPaq is the in-memory store the Storage Engine uses, and Direct Lake is how column data reaches that store. Stage 6 modules relate to the areas as follows.

| Conceptual area | Where it appears in Stage 6 | How far it is simulated |
|---|---|---|
| Storage (OneLake, Delta, Parquet) | Background and source citations in Modules 1, 2, 3; first three stages of the Module 6 flow | Described, not simulated: there are no Delta or Parquet files in Stage 6. The Customer rows stand in for table data. |
| Semantic (framing, metadata) | Module 6 flow explanation; Module 7 refresh scenario | Described. Framing is **not** simulated. |
| VertiPaq (dictionaries, encodings, segments, compression) | Modules 1 to 5 | Simulated with simplified models |
| Query (Storage Engine, Formula Engine) | Module 4 (elimination) and Module 8 (scan) | Storage Engine scan simulated simply; Formula Engine only as a conceptual hand-off |
| Memory (loading, residency, eviction) | Modules 6 and 7 | Simulated with simplified models |

---

## 3. Architecture

### 3.1 Code structure

- **Pure logic modules** (`src/data/stage6-*.ts`): deterministic functions with no I/O, timers or randomness. Each module's functions take plain data and return new data. Sessions (Modules 6 to 8) are immutable: every action returns a new session and never mutates its input (tested).
- **Components** (`src/components/*.tsx`): thin views over those functions, holding only UI state (selected controls, the current session, the last result). They contain no simulation arithmetic.
- **Container** (`VertiPaqSimulator.tsx`): eight tabs and one shared explanation mode.
- **Types** (`src/types/stage6-vertipaq.ts`): the shared types for all eight modules.

### 3.2 Shared data model

`generateSyntheticCustomerRows(rowCount, seed = 42)` returns the Customer rows; `getCustomerEncodingColumn` extracts one column as an `EncodingColumn` (name, source type, model type, decimal scale, values). `applyNullPattern(column, percent)` (Module 3) turns a deterministic, well-mixed share of values into nulls by hashing the **row index**.

`[SIMULATION]` Because the null pattern depends only on the row index, **the same rows are null in every column** at a given null share. This is a property of the shared model, and it has a consequence in Module 8: a row that passes a filter always has a non-null value in the aggregated column (a test documents this).

### 3.3 Size model (one definition, reused)

`[SIMPLIFIED MODEL]` Defined once in Module 2 and reused by Modules 1, 3, 5 and, through Module 5, 6 to 8:

| Quantity | Rule |
|---|---|
| Number or date | 8 bytes (`NUMERIC_VALUE_BYTES`) |
| Text | 4-byte length prefix plus UTF-8 bytes (`TEXT_LENGTH_PREFIX_BYTES`) |
| ID per row | `ceil(log2(entries))` bits, minimum 1 (`bitsRequired`), bit-packed per segment and rounded up to whole bytes |
| Dictionary | each distinct value once, at its original size, **counted once per column** |
| Nulls | one reserved ID, no dictionary bytes |
| Segment metadata | 64 bytes per segment (`MODELLED_SEGMENT_METADATA_BYTES`) |
| Value-encoding metadata | 16 bytes per column (`VALUE_ENCODING_METADATA_BYTES`) |
| Dates | whole-day numbers for sizing; ISO strings for display and comparison |

These are teaching constants. They are not VertiPaq's.

---

## 4. Concepts and how they are modelled

### 4.1 Dictionary and encoding (Modules 1 and 2)

- `[DOCUMENTED]` Parquet defines dictionary encoding. Microsoft documents that both Parquet files and VertiPaq use dictionary encoding (Understand Direct Lake query performance). Microsoft also documents that a numeric column may use value-based or hash-based encoding, that the server normally detects which, and that re-encoding may occur later (`Column.EncodingHint`); and that, for Import models, numeric data uses value encoding and text uses hash encoding (Data reduction techniques for Import modeling).
- `[SIMPLIFIED MODEL]` Dictionary encoding stores each distinct value once and each row as a bit-packed ID. Value encoding stores `(scaled value - minimum)` bit-packed plus 16 bytes of metadata. Both use the same bit-packing rule so sizes are comparable.
- `[SIMULATION]` The module reports "smaller in this model" only. It never says which representation the engine uses.
- `[PROPRIETARY INTERNAL]` The engine's selection rule, hash function, dictionary layout and any further compression.
- See finding **D4** below: Microsoft's pages do not state this in one consistent way, and the Stage 6 pages do not reconcile them.

### 4.2 Segments and segment elimination (Modules 3 and 4)

- `[DOCUMENTED]` Column data is divided into chunks that VertiPaq calls segments; `INFO.STORAGETABLECOLUMNSEGMENTS` reports segment number, record count, size and the bits needed for Data IDs. In Direct Lake, the number of segments per column corresponds to the total number of row groups in the Delta table, and Direct Lake prefers large segments (the article suggests 1 million to 16 million rows for large tables).
- `[DOCUMENTED]` Delta Lake records per-file min, max and null counts, and engines can skip files whose range cannot match (Fabric, "File skipping for Delta tables"). This is the Delta *file* layer.
- `[SIMULATION]` Rows per segment is a user setting (default 500, so a 1,000-row table shows two segments). Boundaries fall every N rows in stored order. Statistics (min, max, distinct count, null count, average, standard deviation) are **computed from the actual values** of each segment.
- `[SIMPLIFIED MODEL]` Elimination is a **possibility test**: a segment is eliminated only if its closed min/max range proves no non-null value can satisfy the predicate. "Scanned" means "cannot be ruled out", never "contains matching rows".
- `[PROPRIETARY INTERNAL]` Whether VertiPaq segments carry min/max metadata and how any such metadata is used. Neither Module 3 nor Module 4 claims it. The 500-row default is not related to the segment sizes Microsoft discusses; it exists so small tables show several segments (finding **D6**).

### 4.3 Compression estimates (Module 5)

- `[SIMPLIFIED MODEL]` `estimateColumnCompression` combines Module 3 segments (shared dictionary counted once, 64 bytes per segment) with the Module 2 value model. The result splits into original size, dictionary, encoded values, segment overhead, column metadata, total, ratio and signed savings. Run-length and other compression are not modelled.
- `[SIMULATION]` Ratios are properties of this model on synthetic data. For example, at 1,000 rows and 500 rows per segment, low-cardinality text (5 values) is estimated at 549 B against 8,977 B, while high-cardinality text is estimated at 0.93x (larger than its original) because the dictionary is nearly as large as the data.
- `[PROPRIETARY INTERNAL]` Real VertiPaq sizes. The simulator never presents a ratio as a VertiPaq measurement and never says a strategy is always selected.
- Documentation note: Microsoft describes dictionary encoding as RLE/bit-packing hybrid. This model's fixed bit-packing is a deliberate simplification (a listed limitation).

### 4.4 Column loading and residency (Module 6)

- `[DOCUMENTED]` Semantic models load entire columns from Delta tables into memory as queries require them. The model works out which columns a query needs, checks which are in memory, and loads all data for those that are not. Loaded columns are resident, and later queries using only resident columns do not load more. Only the data needed to answer a query is loaded.
- `[SIMPLIFIED MODEL]` A column is `UNLOADED`, `LOADING` or `LOADED`. Its memory is its Module 5 estimate. Loading takes `ceil(bytes / 512)` simulated steps and all loading columns advance together; memory while loading grows in proportion to progress. Where a loading column sits on the conceptual flow is a visual aid.
- `[SIMULATION]` A "query" is a list of columns. Resident ones are reused, columns already loading are awaited, the rest are loaded. This is **column loading only**; it does not run the query.
- `[PROPRIETARY INTERNAL]` Real load times, memory use and memory management.
- What Microsoft documents but the simulator does **not** model: the cold, semiwarm, warm and hot states; dictionary transcoding that merges local Parquet dictionaries into a global one; loading Parquet column chunks into segments; join indexes; Delta deletion vectors; DirectQuery fallback (finding **D5**).

### 4.5 Memory accounting and eviction (Module 7)

- `[DOCUMENTED]` A column remains resident until there is reason to evict it. Reasons include framing after the underlying data changed, no query using the column for some time, and other memory management reasons, including memory pressure from concurrent operations. The Fabric SKU determines the maximum memory for a Direct Lake semantic model. Framing might evict resident column segments and dictionaries if data changed; incremental framing drops only the affected segments and usually keeps dictionaries.
- `[SIMPLIFIED MODEL]` Memory is always **recomputed from column states**, never carried as a separate running total, so `before - freed = after` and a column is never counted twice. Evicting a resident column releases exactly its estimate and returns it to non-resident; its data stays in storage, so a later query loads the whole column again. Segments and dictionaries are not evicted separately.
- `[SIMULATION]` **Every eviction is triggered by the user**, directly or through a labelled scenario (user action, unused-column, refresh, memory pressure). The label never changes the outcome. The refresh scenario assumes every resident column was affected. The memory-pressure scenario uses a budget and an order chosen by the user and states its policy in full: evict resident, unprotected, non-empty columns one at a time until memory is within the budget (equal counts as within) or none remain.
- `[PROPRIETARY INTERNAL]` Real memory limits, eviction thresholds, the eviction algorithm, priority and timing. The page shows no Fabric memory figure and claims no least-recently-used or other real policy.

### 4.6 Storage Engine scan (Module 8)

- `[DOCUMENTED]` A single DAX query can result in multiple VertiPaq storage engine queries. The Storage Engine retrieves data and initial aggregations for the Formula Engine.
- `[SIMULATION]` The scan runs on the Module 6 session. The query's columns (the aggregated column first, then the filter column if different) are made resident through `executeQuery`; then the data side is computed from the real rows:
  1. Module 3 `generateSegments` gives the segment boundaries and min/max/null metadata for the filter column.
  2. For numeric and date filters, Module 4 `evaluateSegmentElimination` decides which segments are candidates. Its result is used unchanged.
  3. Exactly the rows of the candidate segments are read, the filter is applied to **each row** (a null never matches, BETWEEN is inclusive), and the non-null values of the aggregated column in matching rows are aggregated.
- `[SIMPLIFIED MODEL]` "Rows in candidate segments" and "actual matching rows" are separate numbers; candidate rows are never treated as matching. SUM, COUNT (non-null values), MIN, MAX and AVERAGE are validated by column type. Decimal sums are accumulated in whole units of the smallest decimal place. A result with no non-null input is blank, except COUNT, which is 0. "Values read" is candidate rows times columns read, a count and not a cost. Text filters have no elimination, because Module 4 supports numeric and date columns only.
- `[SIMULATION]` There are no timings.
- `[PROPRIETARY INTERNAL]` How the engine really scans segments, in what order, how it aggregates, its optimizations, the xmSQL it generates and its timings. The request line shown (for example `SELECT SUM(Revenue) FROM Customer WHERE CustomerID BETWEEN 100 AND 200`) is a **conceptual illustration, not xmSQL and not captured from any engine**.

---

## 5. Data flow between modules

```
Customer rows (seeded, deterministic)
   |
   |  getCustomerEncodingColumn / applyNullPattern  (M3)
   v
Column values -------------------------------------------------------------+
   |                                                                         |
   +--> M1 generateDictionaryEncoding   (whole column, size model of M2)    |
   +--> M2 simulateValueEncoding / simulateHashEncoding                      |
   v                                                                         |
M3 generateSegments --> segments with real min/max/null metadata             |
   |                         |                                               |
   |                         +--> M4 evaluateSegmentElimination              |
   v                                      (candidate vs eliminated)          |
M5 estimateColumnCompression  (M3 segments + M2 value model)                 |
   |   totalCompressedBytes                                                  |
   v                                                                         |
M6 LoadingSession: column memory = M5 estimate; requestLoad / executeQuery   |
   |                          ^                                              |
   |                          +-- M7 evictColumns, applyMemoryPressure        |
   v                                                                         |
M8 runStorageScan: executeQuery (M6) -> candidate segments (M3 + M4) -> read |
   rows of candidate segments <--------------------------------------------+
   -> filter per row -> aggregate -> result handed back to the Formula Engine
      (conceptual only)
```

Key hand-offs, each checked by a test:

| From | To | What is passed | Test evidence |
|---|---|---|---|
| Dataset | all | the same rows for the same row count | `stage6-synthetic-dataset.test.ts` |
| M2 | M1, M3, M5 | size rules (`bitsRequired`, `modelledValueBytes`) | Shared code, not copies: M1, M3 and M5 import these from Module 2. M1 size rules are checked in `stage6-dictionary-encoding.test.ts` (text length prefix, dates as 8-byte numbers); M5 tests assert agreement with both M1 sizes and M3 totals |
| M3 | M4 | segment metadata; M4 never builds its own | M4 tests consume `generateSegments` output; scan test compares with a direct call |
| M3, M2 | M5 | segments and value model | M5 test: estimate equals M3 totals exactly; equals M1 sizes (plus one segment's metadata) for one segment with no nulls |
| M5 | M6 | `totalCompressedBytes` becomes a column's memory | M6 test: profiles match M5 exactly |
| M6 | M7 | the `LoadingSession` itself | M7 tests: one definition of memory shared with M6 |
| M3, M4, M6 | M8 | segments, candidate decisions, residency | M8 tests: Module 4 result equals a direct call; memory not double counted; evicted column reloaded |
| M4 | M8 | candidate vs eliminated segments | M8 brute-force equivalence test: the scan equals a whole-table scan for every combination tried |

---

## 6. Invariants and how they are verified

| Invariant | Where verified |
|---|---|
| A shared dictionary is counted once, not once per segment | M5 tests, including a mutation check that was caught by 11 tests |
| Memory is counted once per column, however often it is requested or scanned | M6, M7 and M8 tests (repeat requests, repeat scans) |
| `before - freed = after` for every eviction | M7 tests, including a sweep over row counts, null shares, budgets and orders |
| Candidate rows are not matching rows | M8 tests (candidate segment with zero matches; explicit counts) |
| Elimination never loses a matching row | M4 brute-force test; M8 brute-force sweep (4 settings x 12 filters x 6 measures x 2 storage orders) |
| The scan reads the segments elimination selected, not "the first N" | M8 regression tests; a deliberate first-N mutation fails 6 tests |
| Sorting storage changes the work, never the answer | M8 tests on the date-range scenarios |
| The data result does not depend on which columns are resident | M8 test |
| An invalid query or selection changes nothing | M6, M7, M8 tests (input session unchanged) |
| No NaN, Infinity or negative size | sweeps in M5, M7, M8 tests |
| Determinism: same inputs, same output; no `Math.random` or `Date.now` | tests spy on `Math.random` (M5, M6, M7, M8) and `Date.now` (M8); M1 to M4 assert identical repeated output |

---

## 7. Claims register

The accuracy rules for Stage 6: a claim is labelled `[DOCUMENTED]` only when a Microsoft page that was read says it.

| # | Claim | Label | Basis |
|---|---|---|---|
| 1 | Parquet and VertiPaq both use dictionary encoding | `[DOCUMENTED]` | Parquet encodings page; Understand Direct Lake query performance |
| 2 | A numeric column may use value or hash encoding; the server normally detects which | `[DOCUMENTED]` | TOM `Column.EncodingHint`, `EncodingHintType` |
| 3 | Import models: numeric data uses value encoding, text uses hash encoding | `[DOCUMENTED]` | Data reduction techniques for Import modeling (see D4) |
| 4 | Offset plus bit-packing; 8 B, 4 B + UTF-8, 16 B constants | `[SIMPLIFIED MODEL]` | Module 2 |
| 5 | Which encoding the engine selects; hash function; real layouts | `[PROPRIETARY INTERNAL]` | not published |
| 6 | VertiPaq calls column chunks segments; segment info is reported per segment | `[DOCUMENTED]` | `INFO.STORAGETABLECOLUMNSEGMENTS`; Understand Direct Lake query performance |
| 7 | Direct Lake segments per column correspond to Delta row groups; large segments preferred | `[DOCUMENTED]` | Understand Direct Lake query performance (not modelled; D6) |
| 8 | Direct Lake uses a global dictionary per column | `[DOCUMENTED]` | Understand Direct Lake query performance. Stage 6 models one shared dictionary per column as a `[SIMPLIFIED MODEL]` size accounting |
| 9 | Rows per segment 50 to 2,000, default 500 | `[SIMULATION]` | educational assumption, labelled in the UI |
| 10 | Per-file min/max skipping in Delta | `[DOCUMENTED]` | Fabric "File skipping for Delta tables" (Delta layer only) |
| 11 | VertiPaq segments carry min/max used for elimination | `[PROPRIETARY INTERNAL]` | not claimed |
| 12 | Elimination as a closed-range possibility test | `[SIMPLIFIED MODEL]` | Module 4 |
| 13 | Compression ratios and estimated sizes | `[SIMULATION]` | Module 5; real sizes are `[PROPRIETARY INTERNAL]` |
| 14 | Columns load on first need, as entire columns; resident columns are reused | `[DOCUMENTED]` | How Direct Lake works |
| 15 | Framing copies metadata only | `[DOCUMENTED]` | How Direct Lake works; Direct Lake overview |
| 16 | 512 B per step; memory = Module 5 estimate; whole-column residency | `[SIMPLIFIED MODEL]` | Modules 6 and 7 |
| 17 | Real load times, memory use, memory management | `[PROPRIETARY INTERNAL]` | not published |
| 18 | Eviction reasons: framing after data change, unused for some time, memory pressure | `[DOCUMENTED]` | How Direct Lake works |
| 19 | The SKU sets the maximum memory for a semantic model | `[DOCUMENTED]` | How Direct Lake works (no figure is shown) |
| 20 | Cold, semiwarm, warm, hot states | `[DOCUMENTED]` | Understand Direct Lake query performance (not modelled) |
| 21 | User-triggered eviction; illustrative budget; ordering | `[SIMULATION]` and `[SIMPLIFIED MODEL]` | Module 7 |
| 22 | Real eviction algorithm, thresholds, priority, timing | `[PROPRIETARY INTERNAL]` | not published; none claimed |
| 23 | A DAX query can produce several VertiPaq storage engine queries; formula engine work is separate | `[DOCUMENTED]` | Analysis Services tabular query interleaving |
| 24 | The Formula Engine generates the plan and gets data and initial aggregations from the Storage Engine | `[DOCUMENTED]` | Understand Direct Lake query performance |
| 25 | Candidate segment rows are read and filtered row by row, then aggregated | `[SIMULATION]` and `[SIMPLIFIED MODEL]` | Module 8 |
| 26 | The request line shown for a query | conceptual illustration | not xmSQL, not captured; real xmSQL is `[PROPRIETARY INTERNAL]` |
| 27 | Scan order, optimizations, timings | `[PROPRIETARY INTERNAL]` | not published; no timings are shown |

Claims the simulator deliberately **does not make**: that it reproduces xmSQL; that scan timings represent Fabric performance; that its segment order is the engine's; that its aggregation reproduces every VertiPaq optimization; that candidate rows are matching rows; that the whole model must load before a query runs; any real memory limit, threshold or eviction algorithm.

---

## 8. The Formula Engine boundary

Module 8 stops where the Formula Engine would start. In the model:

| Stage | Owner in Stage 6 | Simulated? |
|---|---|---|
| Work out which columns the query needs | Module 6 (`executeQuery` / `planQuery`) | Yes, trivially: the columns the user selects |
| Load missing columns | Module 6 | Yes (column loading only) |
| Rule out segments | Module 4 | Yes (metadata possibility test) |
| Scan candidate segments, filter, aggregate | Module 8 | Yes (actual rows, simplified) |
| Hand the result back | Module 8 | Conceptually: one line in the sequence |
| Parse DAX, build a query plan, evaluate measures, relationships, row context, further calculation | Formula Engine | **No.** No DAX is parsed or evaluated. |

One measure column, one optional filter and one aggregation are supported. There is no grouping, no relationship and no measure. The DAX query execution simulator is a separate, later stage in the project roadmap.

---

## 9. Source register

All Microsoft Learn URLs below appear in the code (`get*SourceReferences` functions) or were read to write this document. "Read" means the page content was retrieved and checked for the statements attributed to it; the live status of each URL was **not** re-checked in this phase except where noted.

| Source | Used for | When read |
|---|---|---|
| [How Direct Lake works](https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-how-it-works) | loading, resident columns, eviction reasons, framing, SKU memory | Modules 6 and 7 |
| [Direct Lake overview](https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-overview) | only needed data is loaded; VertiPaq processes queries; framing copies metadata | Module 6 |
| [Understand Direct Lake query performance](https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-understand-storage) | Storage and Formula Engine roles, VertiPaq store, global dictionary, row groups and segments, memory states, cold-query tasks | **this documentation phase** (first ~20 KB retrieved; the page may continue). Not used when Modules 1 to 8 were labelled (D4, D5, D6). Already listed as source 3 in `RESEARCH_SOURCES.md` |
| [Analysis Services tabular query interleaving](https://learn.microsoft.com/en-us/analysis-services/tabular-models/query-interleaving) | a DAX query can produce several storage engine queries; formula engine work is separate | Module 8 |
| [`Column.EncodingHint`](https://learn.microsoft.com/en-us/dotnet/api/microsoft.analysisservices.tabular.column.encodinghint) and [`EncodingHintType`](https://learn.microsoft.com/en-us/dotnet/api/microsoft.analysisservices.tabular.encodinghinttype) | value or hash encoding, server detection, hints | Module 2 |
| [`INFO.STORAGETABLECOLUMNSEGMENTS`](https://learn.microsoft.com/en-us/dax/info-storagetablecolumnsegments-function-dax) | per-segment reporting | Module 3 |
| [File skipping for Delta tables](https://learn.microsoft.com/en-us/fabric/data-engineering/delta-lake-file-skipping) | Delta per-file min/max skipping | Module 4 |
| [Data reduction techniques for Import modeling](https://learn.microsoft.com/en-us/power-bi/guidance/import-modeling-data-reduction) | numeric value encoding, text hash encoding | Module 5 |
| Apache Parquet [file format](https://parquet.apache.org/docs/file-format/) and [encodings](https://parquet.apache.org/docs/file-format/data-pages/encodings/) (not Microsoft) | Parquet is column oriented; dictionary encoding | Modules 1, 2, 3, 6 |

Not displayed anywhere: `getVertiPaqSourceReferences` in `stage6-vertipaq-simulator.ts` lists third-party pages (DAX Studio, SQLBI, delta.io) and a redirecting Module 2 URL; it is not used by any component (D7).

---

## 10. Findings and discrepancies

These were found while verifying claims. **No code or earlier document was changed to resolve them.** Each is reported for a decision.

| ID | Finding | Evidence | Impact | Suggested follow-up |
|---|---|---|---|---|
| D1 | The older Stage 6 progress documents describe only Module 1 and claim "APPROVED FOR PRODUCTION", "100%" type safety and documentation coverage | `STAGE_6_BUILD_VERIFICATION.md`, `STAGE_6_PROGRESS.md`, `STAGE_6_SESSION_COMPLETION_SUMMARY.md`; `STAGE_6_PENDING_MODULES.md` and `STAGE_6_QUICK_START.md` describe modules 2 to 8 as pending | Contradicts the current state; Stage 6 is not approved | The index now lists them as historical. Consider archiving or adding a banner |
| D2 | The Stage 2 research summary contains statements Stage 6 does **not** adopt: "Value encoding (dictionary)"; segments "typically ~8,000 rows" with min/max stored per segment as fact; eviction by "LRU or similar"; the Storage Engine "controls column loading and memory management". The Microsoft pages read do not state these (the Direct Lake performance article instead attributes loading to Direct Lake, prefers large segments, and the eviction page gives reasons only) | `stage2/STAGE_2_RESEARCH_SUMMARY.md` lines 79 and the sections on segments, the SE/FE and eviction | Anyone reading Stage 2 may take unverified statements as documented | Correct the Stage 2 text in a later pass |
| D2b | The same Stage 2 summary says there are 4 major layers in one place and lists 5 in another (Stage 3 and 4 use 5) | summary lines 203 and 241 to 245 | Inconsistent terminology | Align on the five conceptual areas (section 2.1) |
| D3 | `RESEARCH_SOURCES.md` says only learn.microsoft.com sources are used and lists topics for source 3 including "Segment elimination". In the portion of that page retrieved (about 20 KB; the page may continue) there is no discussion of segment elimination, xmSQL or LRU. Stage 6 also cites Apache Parquet pages and several Microsoft pages not listed there | grep of the retrieved text; section 9 | The source list is incomplete and one topic is unverified | Update `RESEARCH_SOURCES.md` in a later pass |
| D4 | Microsoft's pages do not state encoding in one consistent way. The Direct Lake performance article says VertiPaq "always uses dictionary encoding" (using an RLE/bit-packing hybrid), while the TOM and Import pages describe value or hash encoding for numeric columns. Modules 2 and 5 offer both as user-chosen representations and never say which the engine uses, and Module 5 states that Microsoft documents numeric data using value encoding, which is true of the Import page but is not reconciled with the Direct Lake article | Module 5 and Module 2 UI text; source pages | A learner could read the pages as contradicting each other | Add a short note to the Module 2 and Module 5 pages |
| D5 | Module 6 labels the real loading sequence `[PROPRIETARY INTERNAL]` ("not published"). Microsoft documents the main cold-query tasks: merging local Parquet dictionaries into a global dictionary, loading Parquet column chunks into segments, building join indexes, applying deletion vectors. The exact internals are still not published, but the labelling is more absolute than the documentation | `DirectLakeLoadingSimulator.tsx` explanation text; `stage6-loading-simulator.ts` header | Labelling is conservative but incomplete | Refine the Module 6 `[PROPRIETARY INTERNAL]` wording and mention these tasks as `[DOCUMENTED]` but not modelled |
| D6 | Microsoft documents that a Direct Lake column's segment count follows the Delta table's row-group count and that large segments (1 to 16 million rows for large tables) are preferred. Stage 6 segments are a free user setting with a 500-row default, labelled an educational assumption, and the Module 3 page says Microsoft documents no fixed segment row count (true of the `INFO.STORAGETABLECOLUMNSEGMENTS` page it cites) | `SegmentExplorer.tsx`; Module 3 test forbids stating specific segment sizes | Educational assumption is labelled, but the documented guidance is not surfaced | Mention the guidance in Module 3 in a later pass |
| D7 | Unused leftovers: `getVertiPaqSourceReferences` (third-party sources, Module 2-era redirecting URL), the `.placeholder-module` CSS in `VertiPaqSimulator.css`, and the `Stage6State` type | grep of `src/` | Dead code only | Remove in a cleanup pass |
| D8 | Module 2 cites `.../power-bi/enterprise/directlake-overview`, which redirects to the canonical Fabric URL used elsewhere | `stage6-encoding-simulator.ts` | Harmless | Update when Module 2 is next touched |
| D9 | The shared null pattern nulls the same rows in every column | `applyNullPattern` | In Module 8, a matching row never has a null measure; documented in the UI and tests | Keep, or vary the pattern per column in a future change |
| D10 | Stage 4/5 report files remain in the project root, and Stage 5's final documents are in the root while Stage 6's are in `docs/` (as instructed) | file listing | Inconsistent locations | Decide on one convention |
| D11 | Stage 4/5-internal duplicate CSS selectors remain; Stage 6 only scoped the selectors that collided | `PROJECT_CHECKPOINT.md` | None for Stage 6 | Optional cleanup |

No defect in the simulator logic was found while writing this documentation. That is not a full code audit: it reflects the verification described in sections 5 to 7 and the passing test suite.

---

## 11. Limits of this validation

- **Jsdom, not a browser.** Components are tested in jsdom, which does not apply stylesheets or lay out pages. Layout, chart rendering, scrolling, colour contrast, focus rings and responsive behaviour have **not** been verified visually. The CSS-scoping tests read the CSS source.
- **No assistive-technology testing.** Accessibility checks are structural (labels, roles, headers, live regions, symbols with text), not tested with a screen reader.
- **Simulated numbers are not benchmarks.** Do not compare any size, step count or scan count with Fabric.
- **Sources were checked at the time they were read.** Pages can change; URL liveness was not re-checked for all sources in this phase.
- **Mutation checks were manual and temporary** (a line was altered, the tests were run, the line was restored). They are not an automated mutation-testing run.
