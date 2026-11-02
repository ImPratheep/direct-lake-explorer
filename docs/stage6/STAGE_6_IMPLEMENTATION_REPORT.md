# Stage 6 Implementation Report: VertiPaq Simulator

**Project:** Microsoft Fabric Direct Lake Explorer (local, synthetic data only)
**Stage:** 6, VertiPaq Simulator
**Report date:** November 1, 2026
**Status:** All eight modules are implemented and tested. Implementation review is pending. Browser validation is pending. Stage 6 is **not yet approved**.

> This is an educational simulator. It does **not** reproduce Microsoft's proprietary VertiPaq engine or the Direct Lake implementation. Every size, loading step, eviction and scan in this stage is a simulation calculated from synthetic data, and none of it is a Fabric measurement.

Companion documents: [Technical Validation](./STAGE_6_TECHNICAL_VALIDATION.md), [Test Results](./STAGE_6_TEST_RESULTS.md), [Completion Summary](./STAGE_6_COMPLETION_SUMMARY.md), [Approval Checklist](./STAGE_6_APPROVAL_CHECKLIST.md). The running work log is [PROJECT_CHECKPOINT.md](./PROJECT_CHECKPOINT.md).

How this report was written: from the source code and the tests, not from earlier status reports. The older Stage 6 progress documents (see the [index](./STAGE_6_DOCUMENTATION_INDEX.md)) describe only Module 1 and make claims the implementation does not support, so they were not used as a source.

---

## 1. Label convention

Every module states what is documented and what is simulated, using four labels. They appear in the UI, the code comments and these documents.

| Label | Meaning |
|---|---|
| `[DOCUMENTED]` | Behaviour described in Microsoft documentation that was actually read. |
| `[SIMULATION]` | Behaviour implemented by this educational simulator (synthetic data, deterministic calculation). |
| `[SIMPLIFIED MODEL]` | An assumption made so a calculation is possible (fixed byte sizes, whole-column residency, and so on). |
| `[PROPRIETARY INTERNAL]` | Engine internals that are not publicly documented, so they are neither modelled nor claimed. |

---

## 2. How the eight modules form one learning journey

All eight modules read the **same synthetic Customer table**. A learner follows one table from a single column's dictionary to a query result:

| # | Module | The question it answers | Builds on |
|---|---|---|---|
| 1 | Dictionary Encoding Explorer | How can a column store each distinct value once? | Shared dataset, Module 2 size rules |
| 2 | Value vs Hash Encoding Simulator | What is the alternative for numbers, and when is each smaller in this model? | Shared dataset |
| 3 | Segment Explorer | How is a column split into segments, and what does each segment know about its rows? | Shared dataset, Module 2 size rules |
| 4 | Segment Elimination Simulator | Which segments could a filter rule out from segment metadata alone? | Module 3 segments |
| 5 | Column Compression Explorer | How do cardinality, type and distribution change estimated storage? | Modules 2 and 3 |
| 6 | Direct Lake Column Loading Simulator | When a query needs a column, what must be loaded, and what is already available? | Modules 3 and 5 |
| 7 | Memory Residency and Eviction Simulator | What changes when resident columns are evicted, and what must load again? | Module 6 session |
| 8 | Storage Engine Scan Simulator | What does one query do end to end: load, eliminate, scan, aggregate, return? | Modules 3, 4 and 6 (and 7 through eviction) |

The thread: **a column's bytes (Modules 1, 2, 5) are split into segments (3) that a filter can skip (4); the estimated size of a column is the memory it occupies when loaded (6) and releases when evicted (7); a query uses all of it (8).**

### 2.1 The shared dataset

`src/data/stage6-synthetic-dataset.ts` generates deterministic rows (seeded pseudo-random generator, seed 42). It uses the same Customer schema as the Stage 5 Delta Lake and Parquet modules, so a learner can follow the same columns from Delta and Parquet to VertiPaq.

| Column | Source type | Model type | Notes |
|---|---|---|---|
| CustomerID | int64 | INTEGER | 1, 2, 3, ... one per row (ascending) |
| Revenue | decimal(18,2) | DECIMAL (scale 2) | 10.00 to 4999.99 |
| LastPurchaseDate | date | DATE | scattered over a two-year span from 2023-01-01 |
| Region | utf8 | TEXT | five values: East, West, North, South, Central |
| CustomerName | utf8 | TEXT | combinations of 12 first names and 12 last names |

The same rows are produced every time for the same row count, so every number in the UI and in the tests is reproducible. Modules do not create datasets of their own, except Module 5, which also offers clearly labelled synthetic *distributions* (such as sequential integers) for comparison next to the Customer columns.

### 2.2 Navigation and explanation modes

`App.tsx` offers a "VertiPaq" button that renders `VertiPaqSimulator.tsx`. That container has eight tabs (ids `dictionary`, `encoding`, `segment`, `elimination`, `compression`, `loading`, `memory`, `storage`) and passes one `explanationMode` value (beginner, intermediate or advanced, chosen at application level) to whichever module is active. No placeholder remains: a test clicks all eight tabs and asserts none shows "Coming Soon".

### 2.3 Dependency map (verified from the imports)

```
stage6-synthetic-dataset  <------------------------------------------------ all modules
stage6-encoding-simulator (M2: bitsRequired, modelledValueBytes, value model)
   ^         ^
   |         +-- stage6-vertipaq-simulator (M1: generateDictionaryEncoding)
   +-- stage6-segment-simulator (M3: applyNullPattern, generateSegments)
          ^         ^
          |         +-- stage6-elimination-simulator (M4)  [also uses M3 compareSegmentValues]
          +-- stage6-compression-simulator (M5)  [also uses M2 value model]
                 ^
                 +-- stage6-loading-simulator (M6)  [also uses M3 applyNullPattern]
                        ^         ^
                        |         +-- stage6-memory-simulator (M7)
                        +-- stage6-scan-simulator (M8)  [also uses M3 and M4]
```

---

## 3. Modules

Each module lists its source files. Component tests are in `src/components/__tests__/` and logic tests in `src/data/__tests__/`. Test counts are the actual counts from the final run (see [Test Results](./STAGE_6_TEST_RESULTS.md)).

### Module 1: Dictionary Encoding Explorer

**Educational objective.** Show that a column can store each distinct value once and replace every row with a small numeric ID, and when that helps or does not help.

**Main functionality.**
- Choose any of the five Customer columns and a dataset size (up to 5,000 rows).
- See the dictionary (value to ID), the original values next to their encoded IDs (first 12 rows), and the encoded ID column (first 50 IDs).
- See distinct values, bits per ID, original size, dictionary size, encoded size, compression ratio and memory saved.
- A warning appears when the dictionary makes a column larger than its original (for example CustomerID, where every value is distinct).
- Beginner, intermediate and advanced explanations; Key Concepts, Practical Examples, Limitations and Sources.

**Shared data and dependencies.** Shared Customer rows; the size rules of Module 2 (`bitsRequired`, `modelledValueBytes`). It has no nulls or segments: it dictionary-encodes the whole column.

**Important assumptions.** `[SIMPLIFIED MODEL]` IDs are assigned in first-seen order; each row stores a bit-packed ID of `ceil(log2(distinct values))` bits (minimum 1); numbers and dates cost 8 bytes; text costs a 4-byte length prefix plus its UTF-8 bytes; each distinct value is stored once at its original size. An empty column reports a ratio of 1.

**Documented versus simulated.**
- `[DOCUMENTED]` Parquet defines dictionary encoding; Microsoft documents hash-based and value-based encoding for numeric columns (Tabular Object Model `EncodingHint`) and says the server normally detects which to use.
- `[SIMULATION]` The synthetic data and every size and ratio.
- `[PROPRIETARY INTERNAL]` VertiPaq's real dictionary structure, hash function and any further compression.

**Source files.** `src/components/DictionaryEncodingExplorer.tsx` and `.css`; `generateDictionaryEncoding` in `src/data/stage6-vertipaq-simulator.ts`; tests `stage6-dictionary-encoding.test.ts` (14) and `DictionaryEncodingExplorer.test.tsx` (11).

### Module 2: Value vs Hash Encoding Simulator

**Educational objective.** Contrast two ways to represent a column: value encoding (numbers stored as offsets from the column minimum) and hash/dictionary encoding (distinct values plus IDs), and show when each is smaller *in this model*.

**Main functionality.**
- Choose a column and row count; optionally add an outlier to see how one extreme value widens the range value encoding must cover.
- See modelled size for each approach, a "smaller in this model" result (value, hash, tie, or not applicable), and an explanation.
- Value encoding is not applicable to text columns, and the page says so.

**Shared data and dependencies.** Shared Customer rows. Provides the size model reused by Modules 1, 3 and 5: `NUMERIC_VALUE_BYTES` 8, `TEXT_LENGTH_PREFIX_BYTES` 4, `VALUE_ENCODING_METADATA_BYTES` 16, `bitsRequired`, `modelledValueBytes`, `utf8ByteLength`.

**Important assumptions.** `[SIMPLIFIED MODEL]` Value encoding stores `(scaled value - column minimum)` bit-packed, with decimals scaled by 10^scale and dates as whole-day numbers, plus 16 bytes of metadata. Hash encoding is a dictionary plus bit-packed IDs. Both use the same bit-packing rule so their sizes are comparable inside the model.

**Documented versus simulated.**
- `[DOCUMENTED]` Microsoft Learn (`Column.EncodingHint`, `EncodingHintType`): a numeric column may use value-based or hash-based encoding, the server normally detects which, re-encoding may occur later, and a hint of Default, Hash or Value can be set (compatibility level 1400 or above).
- `[SIMULATION]` The outlier demonstration and every size.
- `[PROPRIETARY INTERNAL]` The engine's selection rule, hash function and dictionary layout. The page never states which encoding the engine would choose.

**Source files.** `src/data/stage6-encoding-simulator.ts`; `src/components/ValueHashEncodingSimulator.tsx` and `.css`; tests `stage6-encoding-simulator.test.ts` (27) and `ValueHashEncodingSimulator.test.tsx` (9).

### Module 3: Segment Explorer

**Educational objective.** Show how a column is divided into segments and what real statistics each segment has, using one dictionary shared by all segments.

**Main functionality.**
- Choose a column, row count, rows per segment (a configurable educational assumption, default 500), row order (as loaded, or sorted ascending with nulls last) and an approximate null share.
- See each segment's row range, minimum, maximum, distinct count, null count, and (for numeric columns) average and standard deviation, computed from the actual values.
- See bits per ID, modelled data and metadata bytes, dictionary coverage, whether a segment's range overlaps another, the column's order state (empty, constant, ascending, descending, unordered), and totals.
- Select a segment to inspect it; compare segment statistics.

**Shared data and dependencies.** Shared Customer rows; Module 2 size model. Exposes `applyNullPattern`, `generateSegments`, `compareSegmentValues`, `detectColumnOrder` and (added in Module 8) `sortedRowOrder`, which Modules 4 to 8 reuse.

**Important assumptions.**
- `[SIMPLIFIED MODEL]` One dictionary per column, shared by every segment and counted once; nulls use one reserved ID and no dictionary bytes; 64 bytes of metadata per segment (`MODELLED_SEGMENT_METADATA_BYTES`).
- `[SIMULATION]` Rows per segment is a setting you choose. Segment boundaries fall every N rows in stored order. Nothing assumes segments are evenly distributed by value. Nulls are placed by a deterministic hash of the row index, which means **the same rows are null in every column** (relevant to Module 8).
- Invalid segment sizes (not a whole number of at least 1) throw `RangeError`.

**Documented versus simulated.**
- `[DOCUMENTED]` Microsoft Learn (`INFO.STORAGETABLECOLUMNSEGMENTS`): column storage is reported per segment, with a segment number, record count, size and the bits needed for Data IDs. That page documents no fixed segment row count and no min/max metadata.
- `[SIMPLIFIED MODEL]` The one-dictionary-per-column structure and all byte constants. (The Direct Lake performance article, read for this report, also describes a global dictionary per column; see the Technical Validation.)
- `[PROPRIETARY INTERNAL]` Real segment boundaries, row ordering and per-segment metadata.

**Source files.** `src/data/stage6-segment-simulator.ts`; `src/components/SegmentExplorer.tsx` and `.css` (classes prefixed `seg-`); tests `stage6-segment-simulator.test.ts` (44) and `SegmentExplorer.test.tsx` (17).

### Module 4: Segment Elimination Simulator

**Educational objective.** Show that segment metadata can sometimes prove a segment cannot contain a match, so it need not be read, and that "cannot be ruled out" is not the same as "contains matches".

**Main functionality.**
- Choose a numeric or date column, a filter (greater than, greater than or equal, less than, less than or equal, equal, not equal, between), a value (and upper bound for between), dataset size, rows per segment, row order and null share.
- See total segments, segments scanned and eliminated, rows potentially scanned and avoided, the elimination percentage, a range chart, and a reason for every segment.

**Shared data and dependencies.** Takes segment metadata from Module 3; it never builds segments or statistics of its own.

**Important assumptions.** `[SIMPLIFIED MODEL]` A possibility test on each segment's min and max. A segment is eliminated only when its range proves no non-null value can satisfy the predicate; otherwise it is scanned. Ranges are closed, so a predicate touching a segment's min or max exactly is not eliminated when an equal value could satisfy it. A null never satisfies a comparison, and an all-null segment is always eliminated. A BETWEEN with its lower bound above its upper bound is valid and matches nothing. Text columns are rejected.

**Documented versus simulated.**
- `[DOCUMENTED]` Delta Lake records per-file min, max and null counts, and engines can skip a file whose range cannot match (Microsoft Fabric, "File skipping for Delta tables"). That is the Delta *file* layer, not VertiPaq segments.
- `[PROPRIETARY INTERNAL]` Whether VertiPaq segments carry min/max metadata, and how any such metadata is used. The module does not claim it.
- `[SIMULATION]` The segment statistics and every decision.

**Source files.** `src/data/stage6-elimination-simulator.ts`; `src/components/SegmentEliminationSimulator.tsx` and `.css` (`elim-`); tests `stage6-elimination-simulator.test.ts` (90) and `SegmentEliminationSimulator.test.tsx` (23).

### Module 5: Column Compression Explorer

**Educational objective.** Show how cardinality, data type, value distribution and the choice of representation change estimated storage, and why a dictionary can make a high-cardinality column larger.

**Main functionality.**
- Choose a distribution scenario (a Customer column, low-cardinality text, high-cardinality text, sequential integers, random integers, repeated decimals, dates spread randomly, dates sorted), a representation (dictionary, or value for numeric and date columns), row count, distinct values where free, rows per segment and null share.
- See rows, distinct values, cardinality ratio with a teaching band, original size, dictionary size, encoded size, other modelled overhead, total estimated size, compression ratio, signed savings and dictionary overhead percentage; a breakdown table and bar chart; a step-by-step calculation; previews; segment-level statistics; and a side-by-side comparison of all examples in both representations.

**Shared data and dependencies.** Built on Module 3 `generateSegments` (segments, shared dictionary counted once, per-segment metadata) and the Module 2 value model; size constants from Modules 1 to 3. A test checks the estimate equals Module 3's totals exactly. Its `estimateColumnCompression` is the **single source of column size** for Modules 6 to 8.

**Important assumptions.** `[SIMPLIFIED MODEL]` The two representations are chosen by the user and never automatically. The dictionary is counted once, never once per segment. Run-length and other compression are not modelled, so row order does not change a size. Savings are signed (negative when the model makes a column larger). Cardinality bands (below 0.1, above 0.9) are teaching labels, not engine thresholds. Boolean columns are not simulated because the shared dataset has none.

**Documented versus simulated.**
- `[DOCUMENTED]` Microsoft Learn ("Data reduction techniques for Import modeling"): VertiPaq keeps separate structures per column; numeric data uses value encoding; text and other non-numeric data uses hash encoding; converting text to numbers can reduce size, especially for high-cardinality columns. Also `EncodingHint` (numeric columns may use either) and `INFO.STORAGETABLECOLUMNSEGMENTS`.
- `[SIMULATION]` The synthetic distributions and every ratio.
- `[PROPRIETARY INTERNAL]` The engine's real encoding choice, bit layouts, further compression and actual sizes.

At the defaults (1,000 rows, 500 per segment, no nulls) the low-cardinality text example is estimated at 549 B against an original 8,977 B (16.35x), and high-cardinality text at 0.93x (larger than its original). These are this model's estimates, not VertiPaq measurements.

**Source files.** `src/data/stage6-compression-simulator.ts`; `src/components/ColumnCompressionExplorer.tsx` and `.css` (`compression-`); tests `stage6-compression-simulator.test.ts` (67) and `ColumnCompressionExplorer.test.tsx` (31).

### Module 6: Direct Lake Column Loading Simulator

**Educational objective.** Teach that Direct Lake loads the columns a query needs, when it needs them, and that a loaded column is resident and reused, without implying the whole model is loaded first.

**Main functionality.**
- A column table (name, type, rows, estimated storage, loading state as a symbol plus text plus a `<progress>` element, estimated memory), with load selected, select all or none, advance one step, finish loading.
- An interactive six-stage conceptual flow: OneLake, Delta Lake, Parquet, Column access, VertiPaq representation, Semantic model availability, with each column drawn at its current stage and a labelled explanation per stage.
- Memory metrics and a meter; a simulated query with a live plan (already available, still loading, needs loading); five one-click demonstrations; an event log.

**Shared data and dependencies.** Shared dataset; column sizes come from the Module 5 estimate; Module 3 null pattern. Settings (rows, rows per segment, null share, numeric representation) live in a `LoadingSession` that Modules 7 and 8 reuse.

**Important assumptions.** `[SIMPLIFIED MODEL]` A column's memory equals its Module 5 estimated total. Loading takes `ceil(bytes / 512)` simulated steps (512 bytes per step is an educational placeholder with no Microsoft basis), all loading columns advance together, and partial memory grows with progress. Memory is counted once per column by state, so repeated requests never double count. Empty columns load instantly at 0 B. The Customer table is the whole model, so a query needs exactly the columns selected. A column's position on the flow while it loads is a visual aid only. `executeQuery` models column loading only; running the query is Module 8.

**Documented versus simulated.**
- `[DOCUMENTED]` Microsoft Learn ("How Direct Lake works"): columns are loaded when a query first needs them (transcoding); the model works out the needed columns, checks which are in memory and loads all data for the rest; loaded columns are resident and later queries on resident columns load nothing; Delta tables are Parquet files in OneLake and Parquet organizes data by column; framing copies metadata only. Also "Direct Lake overview": only the data needed to answer a query is loaded, and queries are processed by VertiPaq.
- `[SIMULATION]` The steps, sizes and the whole run.
- `[PROPRIETARY INTERNAL]` Real load times, memory use and memory management. (See the Technical Validation for a labelling gap about the documented cold-query tasks.)

Default figures (1,000 rows, 500 per segment, Value representation; this model's estimates): CustomerID 1,394 B (3 steps), Revenue 2,520 B (5), LastPurchaseDate 1,394 B (3), Region 549 B (2), CustomerName 3,336 B (7); all five 9,193 B.

**Source files.** `src/data/stage6-loading-simulator.ts`; `src/components/DirectLakeLoadingSimulator.tsx` and `.css` (`loading-`); tests `stage6-loading-simulator.test.ts` (51) and `DirectLakeLoadingSimulator.test.tsx` (36).

### Module 7: Memory Residency and Eviction Simulator

**Educational objective.** Show what changes in memory when resident columns are evicted, and that a later query may have to load an evicted column again, without claiming to know when or how the real engine evicts.

**Main functionality.**
- Resident and non-resident lists; a column table with residency (symbol plus text), memory occupied and evicted/reloaded counts; select, load and evict; an unused-column scenario; a refresh scenario that evicts every resident column.
- An illustrative memory budget (chosen by the user, labelled a simulation setting, not a Fabric limit) with headroom or overage text and a meter; a memory-pressure scenario with a user-chosen order (largest first, or earliest loaded first) and protected columns.
- A before/after comparison per column, a simulated query that shows "was evicted earlier", five demonstrations, and an event history.

**Shared data and dependencies.** Operates directly on the Module 6 `LoadingSession`, so sizes (Module 5) and residency have one definition. It exports `snapshotMemory`, `evictColumns` and related functions that Module 8's UI reuses.

**Important assumptions.** `[SIMPLIFIED MODEL]` Whole-column residency; evicting releases exactly the column's Module 5 estimate and returns it to non-resident; its data stays in storage, so a later query loads the whole column again. Memory is always recomputed from column states. The memory-pressure policy is stated on the page in full: evict resident, unprotected, non-empty columns one at a time in the chosen order until memory is within the budget (equal counts as within) or no candidate remains. `[SIMULATION]` **Every eviction is triggered by the user**; nothing is evicted automatically. The reason (user action, refresh, unused, pressure) is a label and never changes the outcome. Loads finish within one action in this module's UI.

**Documented versus simulated.**
- `[DOCUMENTED]` Microsoft Learn ("How Direct Lake works"): a column stays resident until there is reason to evict it. Reasons include framing after the underlying data changed, no query using the column for some time, and other memory management reasons including memory pressure from concurrent operations. The Fabric SKU determines the maximum memory for a Direct Lake semantic model.
- `[SIMPLIFIED MODEL]` The budget, ordering and refresh scenario ("every resident column was affected").
- `[PROPRIETARY INTERNAL]` Real memory limits, eviction thresholds, algorithm, priority and timing. No least-recently-used or other real policy is claimed, and no Fabric memory figure appears on the page.

**Source files.** `src/data/stage6-memory-simulator.ts`; `src/components/MemoryResidencySimulator.tsx` and `.css` (`memory-`); tests `stage6-memory-simulator.test.ts` (54) and `MemoryResidencySimulator.test.tsx` (42).

### Module 8: Storage Engine Scan Simulator

**Educational objective.** Follow one query end to end, keeping four things apart: column loading, segment elimination, the scan of candidate segments, and Formula Engine work.

**Main functionality.**
- Six scenarios on real Customer columns (SUM of Revenue; Revenue for CustomerID 100 to 200; Revenue for Region = East; Revenue for March 2023 with the table as loaded; the same sorted by date; MAX of LastPurchaseDate) plus custom queries: one aggregation (SUM, COUNT, MIN, MAX, AVERAGE) of one column, one optional filter, and a storage order.
- A conceptual six-step sequence (query request, required column availability, segment elimination, candidate segment scan, aggregation, result) with "Done / Skipped / Not run yet" shown as symbol plus text.
- Statistics: requested columns, already resident, loaded for this query, total, eliminated and candidate segments, **rows in candidate segments**, **actual matching rows**, candidate rows not matching, values read (a modelled count), and the result; a segment table with the reason for each decision; a storage-order comparison; residency controls; an event history.
- Aggregations are validated by column type, with a clear message (for example "SUM is not meaningful for the date column LastPurchaseDate").

**Shared data and dependencies.** Module 3 supplies segments and metadata; Module 4 decides candidate segments, used unchanged; Module 6 `executeQuery` makes the required columns resident (reusing resident ones, so memory is never double counted); Module 7 eviction on the same session means an evicted column loads again before the next scan. Rows, segment size and null share come from the session settings.

**Important assumptions.** `[SIMPLIFIED MODEL]` Candidate segments from Module 4 metadata (numeric and date filters only; text filters have no elimination). The scan reads every row of each candidate segment in stored order, applies the filter row by row (a null never matches, BETWEEN is inclusive), and aggregates the non-null measure values of matching rows. Decimal sums are accumulated in whole units of the smallest decimal place. A result with no non-null input is blank, except COUNT, which is 0. "Values read" is candidate rows times columns read: a count of work in this model, never a cost. Storage order is a user assumption. `[SIMULATION]` There are no timings and no randomness; the answer comes from the actual rows. The conceptual request line (for example `SELECT SUM(Revenue) FROM Customer WHERE ...`) is labelled **not xmSQL and not captured from any engine**.

**Documented versus simulated.**
- `[DOCUMENTED]` Microsoft Learn ("Analysis Services tabular query interleaving"): a single DAX query can result in multiple VertiPaq storage engine queries, and formula engine operations are separate. Microsoft Learn ("Understand Direct Lake query performance"): the Formula Engine generates the query plan and retrieves the necessary data and initial aggregations from the Storage Engine. Plus the column-loading behaviour above.
- `[PROPRIETARY INTERNAL]` How the engine really scans segments, in what order, how it aggregates, its optimizations, the xmSQL it generates and its timings. Nothing claims to reproduce them, and no segment order here is the real engine's order.
- The Formula Engine is not simulated: no DAX is evaluated. The result is handed back "conceptually".

Example results (1,000 rows, 500 per segment; this model's results): Revenue for CustomerID 100 to 200 eliminates 1 of 2 segments, reads 500 rows in the candidate segment, and 101 actually match (result 249,311.15). The March 2023 query as loaded eliminates 0 segments and reads 1,000 rows for 39 matches; stored sorted by date it eliminates 1 and reads 500 rows, with the same 39 matches and the same 85,564.51.

**Source files.** `src/data/stage6-scan-simulator.ts`; `src/components/StorageEngineScanSimulator.tsx` and `.css` (`scan-`); tests `stage6-scan-simulator.test.ts` (80) and `StorageEngineScanSimulator.test.tsx` (42).

---

## 4. Drafts removed

Stage 6 began with pre-written simulator functions. Each was inspected before its module was built, and those found defective were removed rather than reused.

| Module | Draft behaviour removed | Reason |
|---|---|---|
| 1 | `Math.random` input | Not reproducible; replaced by the shared dataset |
| 2 | `compareEncodings` | Its "documented" notes were not supported by Microsoft documentation |
| 3 | draft `generateSegments` | Statistics were invented (distinct count 70% of rows, 5% nulls, evenly spaced min/max ranges) instead of computed from values |
| 4 | draft `evaluateSegmentElimination` and its types | Replaced by a metadata possibility test with explicit null and boundary rules |
| 5 | `analyzeColumnCompression`, `compareCompressionAcrossColumns` | Dates sized as text, invented recommendations, `Math.random` |
| 6 | `simulateDirectLakeColumnLoading` | Hard-coded columns not in the dataset, equal split of a fixed size, `Math.random` |
| 7 | `simulateMemoryEviction` | `Math.random`, invented eviction logic |
| 8 | `simulateStorageEngineScan` | First-N segments, `Date.now()`, `Math.random`, assumed INTEGER column, fabricated aggregates |

`src/data/stage6-vertipaq-simulator.ts` now holds only the Module 1 function and a source list.

---

## 5. Cross-cutting implementation notes

**CSS.** Stage 6 modules reuse the shared panel classes defined in `DictionaryEncodingExplorer.css` (scoped under `.dictionary-explorer`) and add their own prefixed classes: Module 2 `vh-`, Module 3 `seg-`, Module 4 `elim-`, Module 5 `compression-`, Module 6 `loading-`, Module 7 `memory-`, Module 8 `scan-`; the container uses `.vertipaq-simulator`. Colliding global selectors from earlier stages (`.simulator-header`, `.control-group`, `.metrics-grid`, `.metric-label`, `.metric-value`) were scoped so Stage 4 and Stage 5 appearance is preserved. This is guarded by `cssScoping.test.ts`, which reads the CSS source (jsdom does not apply stylesheets).

**Types.** All Stage 6 types are in `src/types/stage6-vertipaq.ts` and re-exported from `src/types/index.ts`.

**Accessibility patterns used consistently.** State shown as text plus a symbol (never colour alone); charts marked `aria-hidden` with table equivalents; labelled inputs; tables with captions and row and column headers; scrollable table regions that are named and focusable; `role="alert"` for validation, `aria-live` regions for results and event logs; sources open with `rel="noopener noreferrer"`. These are verified by jsdom tests only, not by assistive technology or a browser.

**Determinism.** No Stage 6 source file uses `Math.random`, `Date.now`, timers or wall-clock time. The only remaining uses in `src/` are in the Stage 5 file `stage5-delta-lake-parquet.ts`, which is out of scope for Stage 6.

---

## 6. What Stage 6 does not do

- It does not connect to Microsoft Fabric, Azure or any external service, and needs no credentials.
- It does not reproduce VertiPaq or Direct Lake internals, produce Fabric measurements, show real xmSQL, or model real memory limits.
- It does not simulate the Formula Engine or evaluate DAX. That is the subject of Stage 7 in the project roadmap.
- It does not model framing, relationships, measures, join indexes, DirectQuery fallback, V-Order, Delta deletion vectors, or the cold, semiwarm, warm and hot residency states that Microsoft documents.

See the [Technical Validation](./STAGE_6_TECHNICAL_VALIDATION.md) for the architecture, the labelled claims register and the discrepancies found while writing this documentation, and the [Completion Summary](./STAGE_6_COMPLETION_SUMMARY.md) for known limitations and outstanding browser validation.
