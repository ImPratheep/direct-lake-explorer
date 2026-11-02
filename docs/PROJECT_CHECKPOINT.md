# PROJECT CHECKPOINT

Project: Microsoft Fabric Direct Lake Explorer (local, synthetic data only)
Last updated: after the final Stage 6 documentation and consolidated validation (all eight modules built; review pending)

## Stage status

| Stage | Status |
|---|---|
| 3 Illustration, 4 Architecture Explorer, 5 Delta Lake & Parquet | Accepted. Stage 5 contrast remediation applied. |
| 6 VertiPaq Simulator | **Not approved.** All 8 modules are built and tested and the five final docs are written (see `STAGE_6_DOCUMENTATION_INDEX.md`), but browser validation and review are pending. |

Stage 6 stays unapproved until browser validation is done and the implementation and final docs are reviewed and approved.

## UI Review Mode

A review aid for visual design reviews. Opens from the **UI Review** button in the header, or from a link such as `/?review=1&screen=loading&viewport=1366x768` (screen ids are in `src/review/reviewScreens.ts`; viewport is `fit`, `1920x1080`, `1600x900` or `1366x768`). It is off by default and normal behaviour is unchanged.

- **Navigation:** 14 screens (Architecture, five Stage 5 modules, eight Stage 6 modules) as grouped buttons, plus Prev/Next. The existing navigation keeps working and the review bar follows it.
- **Deterministic data:** `withFixedEntropy` (`src/review/deterministic.ts`) runs the Stage 5 generators with a fixed clock (15 June 2024, 12:00 UTC) and a seeded random sequence. The generators themselves are unchanged. Displayed times still use the browser's time zone.
- **Representative starting states:** Pushdown and Partitioning open with a result; Modules 6, 7 and 8 open with a query run, a column evicted with before/after memory, and a scan scenario run. They are built only by calling each simulator's existing demo functions (`src/review/reviewFixtures.ts`), through an optional `startRepresentative` prop on those modules. Modules 1 to 5 and the other Stage 5 pages are already populated by default.
- **Reset to default state:** closes dialogs and details, sets Beginner mode, remounts the current screen so it returns to its starting state, and stays on the same screen.
- **Viewports:** a fixed viewport limits the layout width and draws a dashed line at that height, as a guide. It is not a device emulation. For pixel-exact captures, size the browser window too; the bar says whether the window matches.
- **Also changed:** the Predicate Pushdown "How This Works" panel was empty once a result existed; it now always shows its explanation text.
- **Tests:** `src/review/__tests__/review.test.ts` and `components/__tests__/reviewMode.test.tsx`. Validation: lint pass, 23 files / 727 tests pass, build pass.
- **Browser checks performed** (Vite dev server, one browser): all 14 screens reached with no horizontal overflow at 1366 wide; Modules 6 to 8 and the Stage 5 simulators confirmed populated; reset, exit, URL sync and width emulation confirmed at 1920×1080, 1600×900 and 1366×768 windows; review bar contrast audit had 0 failures. Not done: a visual pass of every screen at all three sizes.

## UI modernization (light theme redesign)

Presentation-only change. No simulator logic, data model, or `src/data` file was edited.

- **Root cause of the "greyed" Architecture page:** a theme mismatch, not an overlay. Tokens switched to light with the OS, but the four Stage 4 stylesheets hard-coded dark-theme colours (for example `rgba(0,0,0,0.2)` backgrounds). Those four CSS files were recreated on tokens; the old versions are in git.
- **Design system:** `src/styles/index.css` is the single token source (light only; OS-dependent dark mode was removed). `App.css` no longer redefines `:root`. Added status, area and `[LABEL]` badge tokens, type scale, focus ring, and a `Courier New` alias to local monospace fonts.
- **Shell:** sticky brand bar with tab navigation (`aria-current`), labelled explanation-mode select, one `h1`, accessible modals (focus trap, Escape, focus return), details panel as a sticky aside that becomes a bottom sheet at 1024px and below.
- **Architecture:** area cards are buttons with text status labels; areas with no cards show an explicit empty state linking to the relevant simulator modules. Legend states the five areas are conceptual teaching areas, not physical layers. Details panel uses ARIA tabs.
- **Stage 5 / 6:** hard-coded Schema, Partitioning and Pushdown colours moved to tokens; VertiPaq container restyled (text tab labels plus SVG icons, h1 changed to h2, nested `<main>` removed); Module 6 flow now scrolls inside its own box on narrow screens.
- **Data finding (updated):** `data-core.ts` originally held 14 architecture components, all in Storage, while earlier Stage 4 notes cite 121. Those notes are not matched by the data. The four empty areas now have 17 components in total (Semantic 4, VertiPaq 5, Query 4, Memory 4), written only from facts already recorded in `RESEARCH_SOURCES.md` and Modules 6 to 8, with Microsoft Learn sources only. Components without a single Learn citation are labelled INFERRED (Formula Engine, Storage Engine) or SIMULATION (simplified dictionary encoding, compression, segment elimination). The 121 figure is still not reached and should not be quoted. The details panel also gained other explanation levels, hands-on links and linked related components.
- **Tests:** `uiShell.test.tsx` added (10 tests); `cssScoping.test.ts` guard updated from `h1` to `h2` for the VertiPaq header.
- **Validation:** `npm run lint` pass, `npm run test:run` 20 files / 680 tests pass, `npm run build` pass.
- **Browser validation (performed, Vite dev server, one browser):** scripted contrast check over text in every page and all eight VertiPaq tabs found 0 failures (4.5:1 normal, 3:1 large text); no horizontal page overflow at 1920, 1600, 1366, 1024, 768 and 390 px wide on all pages and VertiPaq tabs; visual inspection of Architecture, modals, Delta Lake and the Storage Engine Scan tab.
- **Not done:** visual review of each Stage 5 and Stage 6 page at every width, bottom-sheet behaviour on a real touch device, screen-reader testing, other browsers. Remaining styling debt: legacy px units and orphan selectors in Stage 5/6 CSS.

## Stage 6 modules

| # | Module | State |
|---|---|---|
| 1 | Dictionary Encoding Explorer | Built, stabilized, tested |
| 2 | Value vs Hash Encoding Simulator | Built, tested |
| 3 | Segment Explorer | Built, tested |
| 4 | Segment Elimination Simulator | Built, tested |
| 5 | Column Compression Explorer | Built, tested |
| 6 | Direct Lake Column Loading Simulator | Built, tested |
| 7 | Memory Residency and Eviction Simulator | Built, tested |
| 8 | Storage Engine Scan Simulator | Built, tested (awaiting review) |

No placeholder or draft simulator remains in `src/data/stage6-vertipaq-simulator.ts`; it now holds only the Module 1 dictionary encoding function and a source list.

## Module 8 work completed

- Investigation: the draft `simulateStorageEngineScan` and its types `StorageEngineScan` and `AggregationQuery` had no tests and no other users. It counted rows with `segments.slice(0, segmentsScanned)` (the first N segments, not the ones elimination selected), built its id from `Date.now()` and `Math.random()`, assumed `dataType: 'INTEGER'` for any filter column, produced `SUM` as `rowsScanned * 1000`, `MIN`/`MAX`/`AVERAGE` from the first and last segment statistics, and computed `rowsSkipped` and `efficiency` from nonsense (`reduce((sum) => sum)`), plus made-up millisecond durations. None of it was reused; the function, both types and the helper import/operator map were removed.
- `src/data/stage6-scan-simulator.ts` (pure, deterministic; no `Math.random`, no `Date.now`, no timers, no durations). Exports: `validateScanQuery`, `computeScanData`, `runStorageScan`, `compareRowOrders`, `explainScan`, `predicateMatches`, `requiredColumnsFor`, `describeConceptualRequest`, `allowedAggregations`, `SCAN_SCENARIOS` / `runScanScenario`, `getScanSourceReferences`.
- How the scan uses Modules 3 and 4: the filter column (the measure column when there is no filter) is built with the shared dataset plus Module 3 `applyNullPattern`, and `generateSegments` supplies the segment boundaries and min/max/null metadata. For numeric and date filters `evaluateSegmentElimination` (Module 4) is called on exactly those segments and its decisions are used unchanged (the Module 4 result is exposed on the scan result and a test asserts it equals a direct Module 4 call). The scan then reads the real rows of exactly the candidate segments, evaluates the filter on each row (`predicateMatches`; nulls never match; BETWEEN inclusive) and aggregates the non-null measure values of matching rows. "Rows in candidate segments" and "actual matching rows" are separate numbers throughout. Eliminated segments are never read. A brute-force reference over the whole table (no segments) is compared with the scan across 4 settings x 12 filters x 6 measures x 2 storage orders in a test, which proves elimination never loses a matching row. The old first-N behaviour is covered by regression tests (candidates 4 and 5 of 10 must be read, segments 0 and 1 must not; the first-N mutation fails 6 tests).
- How loading and residency are integrated (Modules 6 and 7): the scan runs on a Module 6 `LoadingSession`. The required columns (measure column first, then the filter column if different) go through Module 6 `executeQuery`, which reuses resident columns, awaits columns already loading and loads the rest, so memory is counted once per column; a column evicted with Module 7 `evictColumns`/`evictAllResident` is loaded again before the next scan. The scan reads rows, segment size and null share from `session.settings`, so there is one definition of the data, and column sizes remain the Module 5 estimates. The data result does not depend on residency (tested), and an invalid query is rejected before any state change. A `SCAN_COMPLETED` event is appended to the session log.
- Storage order: `ScanQuery.rowOrder` (`AS_LOADED` or `SORTED_ASCENDING`, applied to the whole table by the filter column and ignored without a filter) uses Module 3's `rowOrder`. For this the smallest targeted change to Module 3 was made: `sortedRowOrder(values)` is now exported (the existing sort was refactored to call it; tested, and tested to agree with `generateSegments` sorting). The date-range scenarios show that sorting changes the work (1 of 2 segments eliminated instead of 0) but never the answer.
- Aggregations: SUM, COUNT (non-null values of the measure column), MIN, MAX, AVERAGE, validated by column type (SUM and AVERAGE for integer and decimal; MIN and MAX also for dates; COUNT for any column). Anything else returns a clear message (for example "SUM is not meaningful for the date column LastPurchaseDate. For this column use COUNT, MIN, MAX."). Decimal sums are accumulated in whole units of the column's smallest decimal place, then divided, so no floating-point drift. A result with no non-null input is blank (`null`, shown "(blank)"), except COUNT, which is 0. Text filters accept only equal and not-equal.
- Text filters have no elimination, because Module 4 supports numeric and date columns only and was not changed; every segment is a candidate and the page says why. Step 3 of the sequence is then "skipped".
- `src/components/StorageEngineScanSimulator.tsx` + `.css`: all new classes `scan-` prefixed; shared panels from `DictionaryEncodingExplorer.css`. Shows: documented-versus-simulated panel with the four labels; settings (rows, rows per segment, null share, numeric representation, Reset); a scenario selector (six scenarios, plus custom edits) with aggregation, measure column, filter column, operator, value or bounds and storage order; live validation (`role="alert"`, Run disabled); the six-step execution sequence (query request, required column availability, segment elimination, candidate segment scan, aggregation, result) with "✓ Done / – Skipped / ○ Not run yet" and a per-step summary, labelled a conceptual visualization; statistics (requested columns, already resident, loaded for this query, simulated memory before and after, total, eliminated and candidate segments, rows in candidate segments, actual matching rows, candidate rows not matching, values read (modelled), aggregation result); a candidate segment table (decision as "✓ Candidate (scanned)" or "✗ Eliminated", the Module 4 reason, rows read, matching rows); a storage-order comparison; residency with user eviction buttons (Module 7); an `aria-live` event history; Key Concepts, Practical Examples, Limitations and Sources. The conceptual request line (for example `SELECT SUM(Revenue) FROM Customer WHERE CustomerID BETWEEN 100 AND 200`) is labelled "not xmSQL and not captured from any engine". Formula Engine work is shown only as the result being handed back conceptually; no DAX is evaluated.
- Wired into `VertiPaqSimulator.tsx` (the last placeholder replaced; the placeholder test became "every tab shows a real module"). `cssScoping.test.ts` covers the new CSS file (unscoped-selector guard and `scan-` prefix). Types added to `src/types/stage6-vertipaq.ts` and re-exported from `src/types/index.ts`; `LoadingEventType` gained `SCAN_COMPLETED`. Module 6's `QUERY_READY` log text was reworded to "Running the query itself is not simulated by column loading." so it reads correctly in the Module 8 log (a Module 6 test already asserted "not simulated").
- Tests: 80 simulation tests (draft removed; first-N regression; Module 3 and 4 integration and equality with direct calls; candidate versus matching rows; each aggregation with exact values; exact decimal sums; the brute-force equivalence sweep; row-level predicate boundaries; GT/GTE at a segment maximum; inverted BETWEEN; decimal and date bounds; text filters; empty, single-row, all-null and partly-null data; 17 invalid-query cases; required-column loading, reuse of resident columns, no double-counted memory, a column used as measure and filter, reuse of the Module 6 session and settings, input not mutated, eviction then reload; result independent of residency; row order and comparison; the six scenarios with exact figures; steps and wording; determinism with `Math.random` and `Date.now` spied on; a no-NaN/no-negative sweep) and 42 component tests (scenarios through the UI, custom boundaries, all aggregations, validation messages, zero rows, all-null, settings reset, residency and eviction, event history, explanation modes and labels, no timing or xmSQL claims, accessibility names, headers and live regions, CSS prefix) plus the 2 new CSS guard cases and the updated container test. Mutation checks: scanning the first N segments was caught by 6 tests, skipping the row-level filter by 16, and the UI ignoring the storage order by 2.

Figures at the defaults (1,000 rows, 500 per segment, no nulls, Value representation; this model's results), run in sequence on one session:

| Scenario | Candidate segments (of 2) | Rows in candidate segments | Matching rows | Result |
|---|---|---|---|---|
| SUM Revenue, no filter (loads Revenue: 5 steps, 2,520 B) | 2 | 1,000 | 1,000 | 2,502,487.79 |
| Revenue, CustomerID 100 to 200 (loads CustomerID: 3 steps, 3,914 B) | 1 | 500 | 101 | 249,311.15 |
| Revenue, Region = East (text: no elimination) | 2 | 1,000 | 193 | 462,329.55 |
| Revenue, March 2023, as loaded (loads LastPurchaseDate) | 2 | 1,000 | 39 | 85,564.51 |
| Revenue, March 2023, sorted by date | 1 | 500 | 39 | 85,564.51 |
| MAX LastPurchaseDate | 2 | 1,000 | 1,000 | 2024-12-30 |

## Assumptions and documented behaviour (Module 8)

- [DOCUMENTED] Microsoft Learn, "Analysis Services tabular query interleaving": a single DAX query can result in multiple VertiPaq storage engine queries, and formula engine operations are separate. Microsoft Learn, "How Direct Lake works": the columns a query needs are loaded when first needed and stay resident until evicted. (The Module 4 sources on Delta file skipping are also listed.)
- [SIMULATION] Synthetic data; the scan and every count come from the actual rows; there are no timings.
- [SIMPLIFIED MODEL] Candidate segments from Module 4 metadata (numeric and date filters only); whole candidate segments read in stored order with a row-by-row filter; whole-column residency; "values read" is candidate rows x columns read, a count and not a cost; the table is optionally stored sorted by the filter column; the conceptual request line.
- [PROPRIETARY INTERNAL] How the engine really scans segments, in what order, how it aggregates, its optimizations, the xmSQL it generates, and its timings. Nothing claims to reproduce them, to show real xmSQL, to show Fabric performance or the real segment order, or that candidate rows are matching rows. No Microsoft Learn page was found that documents the scan internals, so none is cited for them.

## Module 7 work completed

- Investigation: the draft `simulateMemoryEviction` and its types `MemoryResidencySnapshot` and `MemoryEvictionSimulation` had no tests and no other users. It used `Math.random()` to pick evicted columns, invented a "pressure level" that decided a made-up per-column size (budget divided by 2, 3 or 4) instead of Module 5 sizes, and invented eviction counts (20% or 40% of columns). None of its behaviour was reused; it and the two types were removed.
- `src/data/stage6-memory-simulator.ts` (pure, deterministic, no timers, no `Math.random`) works directly on the Module 6 `LoadingSession`, so column sizes (Module 5 estimates) and residency have one definition. Exports: `snapshotMemory`, `budgetStatus`, `evictColumns`, `evictAllResident`, `applyMemoryPressure`, `compareMemory`, `columnHistory`, `explainEviction`, `MEMORY_DEMOS` / `applyMemoryDemo`, sources. To share the Module 6 session machinery, `withEvent` and `normaliseNames` in `stage6-loading-simulator.ts` were exported (no behaviour change).
- Residency model: a column is `LOADED` (resident), `LOADING` or `UNLOADED` (not resident), as in Module 6. Evicting a resident column returns it to `UNLOADED`, with 0 progress and 0 B, and releases exactly its Module 5 estimate; its data is assumed to remain in storage, so a later `executeQuery` or `requestLoad` loads the whole column again. Memory is always recomputed from column states (never carried as a separate running total), so `before - freed = after`. Evicting a column that is not resident, or is still loading, is skipped and reported (this simulator does not cancel loads). Empty (0 B) columns can be evicted and release nothing.
- Every eviction is triggered by the user, directly or through a labelled scenario. Nothing is evicted automatically. Scenarios: user action; unused-column scenario (user picks the columns); refresh scenario (evicts every resident column, assuming every column was affected); memory-pressure scenario. The reason is a label in the event log and never changes the outcome.
- Memory-pressure scenario (the policy is stated on the page): the user chooses an illustrative budget (whole bytes, 0 or more; invalid values throw `RangeError` and disable the button) and an order, `LARGEST_FIRST` (ties by name) or `EARLIEST_LOADED_FIRST` (by completion order in the event history). If simulated memory is above the budget, resident, unprotected, non-empty columns are evicted one at a time in that order until memory is within the budget (equal counts as within) or no candidate is left. Protected and still-loading columns are never chosen; any shortfall is reported ("Still N B over the illustrative budget"). The order is an illustration, not a model of Microsoft's policy.
- New event types `EVICTED`, `EVICTION_SKIPPED`, `MEMORY_PRESSURE` added to `LoadingEventType`; the Module 6 component renders events generically and was not changed. `columnHistory` derives evictions and reloads-after-eviction from the event log.
- `src/components/MemoryResidencySimulator.tsx` + `.css`: all new classes `memory-` prefixed; shared panels come from `DictionaryEncodingExplorer.css`. Shows: a documented-vs-simulated panel with the four labels; settings (rows, rows per segment, null share, numeric representation, Reset); resident and not-resident lists and a column table (type, estimated size, residency as symbol plus word, memory occupied, evicted/reloaded counts); select, load, evict, unused-column scenario; memory metrics; the illustrative budget input, labelled as a simulation setting not a Fabric limit, with headroom/over text and a `role="meter"`, order select, protected columns, memory-pressure and refresh scenarios; a before/after summary and per-column comparison; a simulated query with a plan that notes "was evicted earlier"; five demonstration buttons; an `aria-live` event history; Key Concepts, Practical Examples, Limitations and Sources. Changing a setting resets the session and says so.
- Loads in this module finish within one action (step-by-step loading is Module 6), so the UI has no step buttons and a column is never seen part-way through loading; the "still loading" skip path is covered by logic tests only.
- Wired into `VertiPaqSimulator.tsx` (the `memory` placeholder replaced). `cssScoping.test.ts` covers the new CSS file (unscoped-selector guard and `memory-` prefix). Types added to `src/types/stage6-vertipaq.ts` and re-exported from `src/types/index.ts`.
- Tests: 54 simulation tests (initial residency, one definition of memory shared with Module 6, loading and evicting, recomputation, repeated eviction, skips for non-resident and loading columns, immutability, re-requesting an evicted column and reload history, before/after comparison, empty/unknown/case-sensitive selections, zero rows, all-null data, budget boundaries (equal, one byte below, zero, invalid values), pressure scenario (largest and earliest-loaded order, protection, shortfall, ties, loading columns), the five scenarios with exact figures, determinism with `Math.random` spied on, and a no-NaN/no-negative sweep over row counts, null shares, budgets and orders) and 42 component tests (all of the above through the UI, accessibility names, roles, table headers and symbols, no real Fabric memory figures or automatic-eviction claims, CSS prefix) plus 2 CSS guard cases. Mutation checks: changing the budget boundary (`<=` to `<`) was caught by 1 test, ignoring protected columns by 2 logic tests, and ignoring the protected selection in the component by 2 component tests.

Figures at the defaults (1,000 rows, 500 per segment, no nulls, Value representation; this model's estimates): load CustomerID, Revenue and Region = 4,463 B; evict Revenue = 1,943 B (releases 2,520 B); query CustomerID and Revenue reuses CustomerID, reloads Revenue in 5 steps and returns to 4,463 B; pressure at a 3,000 B budget with CustomerID protected, largest first, evicts Revenue (1,943 B); earliest-loaded first evicts Region then Revenue (1,394 B); a 1,000 B budget with CustomerID protected leaves memory 394 B over.

## Assumptions and documented behaviour (Module 7)

- [DOCUMENTED] Microsoft Learn, "How Direct Lake works": loaded columns are resident and stay resident until there is reason to evict them; reasons include framing after the underlying data changed, no query using the column for some time, and other memory management reasons including memory pressure in the capacity from concurrent operations; the Fabric SKU determines the maximum memory for a Direct Lake semantic model; framing might evict resident column segments and dictionaries if the data changed, incremental framing drops only the affected segments and dictionaries usually are not dropped.
- [SIMULATION] Every eviction is user-triggered; the refresh scenario (every resident column) and the memory-pressure scenario are labelled illustrations. Data, steps and sizes are synthetic.
- [SIMPLIFIED MODEL] Whole-column residency; memory equals the Module 5 estimate; the budget and eviction order are settings chosen by the user; segments and dictionaries are not evicted separately.
- [PROPRIETARY INTERNAL] Real memory limits, eviction thresholds, the eviction algorithm, priority and timing. The page states no Fabric memory figure, does not claim a least-recently-used or any other real policy, and does not claim to reproduce Fabric memory management.

## Module 6 work completed

- Investigation: the draft `simulateDirectLakeColumnLoading` hard-coded columns that are not in the Customer dataset (Sales, Profit, Date), split a fixed 500,000 bytes equally between columns instead of using Module 5 sizes, and used `Math.random` for times and addresses. It, its helper `getColumnType` and the types `ColumnLoadingInfo` and `DirectLakeLoadingSimulation` were removed. `LoadingState` was redefined as `UNLOADED | LOADING | LOADED`. The Module 7 and 8 drafts did not depend on them.
- `src/data/stage6-loading-simulator.ts` (pure, deterministic, no timers and no `Math.random`): `buildColumnProfiles`, `createLoadingSession`, `requestLoad`, `advanceSession`, `finishLoading`, `summarizeMemory`, `planQuery`, `executeQuery`, `describeColumnState`, `explainQueryPlan`, `LOADING_DEMOS` and `applyLoadingDemo`, `LOADING_FLOW_STAGES`, `flowStageFor`, sources. Sessions are immutable; every function returns a new session.
- Reuses the shared Customer dataset and the Module 5 `estimateColumnCompression` for every column size (numeric and date columns use the Value representation by default, text uses the dictionary; the user can switch). Module 3 segments and the null pattern come through the same Module 5 path.
- Loading is step driven ("ticks"). A column needs `ceil(memoryBytes / 512)` steps; all loading columns advance together, so a query on several cold columns takes as long as the slowest. Partial memory while loading is `floor(memoryBytes x progress)`. Memory is counted once per column according to its state, so repeated requests never double count. Empty columns load instantly with 0 B. An empty or unknown column selection throws `RangeError`; the UI disables the buttons first.
- `executeQuery` models column loading only: columns already resident are reused, columns already loading are awaited, the rest are loaded; it then logs that the query is ready and says running it is not simulated (Module 8).
- `src/components/DirectLakeLoadingSimulator.tsx` + `.css`: all new classes `loading-` prefixed; shared panels come from `DictionaryEncodingExplorer.css`. Shows: settings (rows, rows per segment, null share, numeric representation, Reset); a six-stage interactive flow (OneLake, Delta Lake, Parquet, Column access, VertiPaq representation, Semantic model availability) with columns drawn at their current stage, a per-stage labelled explanation, and a disclaimer that it is a simplified conceptual flow; a column table (name, type, rows, estimated storage, loading state with symbol, text and `<progress>`, estimated memory); Load selected / Select all / none / Advance one step / Finish loading; memory metrics and a meter (not colour only); a query panel with a live plan (already available, still loading, needs loading) and a run button; the five required demonstrations as buttons; an `aria-live` event log; Key Concepts, Practical Examples, Limitations and Sources. Changing a setting resets the session and says so.
- Wired into `VertiPaqSimulator.tsx` (the `loading` placeholder is replaced). `cssScoping.test.ts` now covers the new CSS file (unscoped-selector guard and `loading-` prefix).
- Types added to `src/types/stage6-vertipaq.ts` and re-exported from `src/types/index.ts`.
- Tests: 51 simulation tests (profiles match Module 5 exactly, one and several columns, repeated and in-progress requests, immutability, query plans and results, already-resident versus unloaded, memory never double counted, zero rows, all-null, invalid and unknown selections, invalid tick counts, determinism with `Math.random` spied on, the five demonstrations with exact figures, flow positions) and 36 component tests (all of the above through the UI, accessibility roles, labels, CSS prefix check). Mutation checks: ignoring the "already loaded" rule was caught by the repeated-loading test; mislabelling a resident column in the plan was caught by the component tests.

Figures at the defaults (1,000 rows, 500 per segment, no nulls, Value representation; these are this model's estimates): CustomerID 1,394 B (3 steps), Revenue 2,520 B (5), LastPurchaseDate 1,394 B (3), Region 549 B (2), CustomerName 3,336 B (7); all five 9,193 B. Demonstration: load CustomerID (1,394 B); load Revenue and Region (4,463 B, 48.5%); query CustomerID and Revenue (both reused, 0 steps); query Region (reused); query LastPurchaseDate (loads, 3 steps, 4,463 B to 5,857 B, about 64%, CustomerName still unloaded). A cold query on CustomerID and Revenue takes 5 steps and 3,914 B.

## Calculation assumptions (Module 6)

- [SIMPLIFIED MODEL] Column memory equals the Module 5 estimated total compressed size. Loading rate is a fixed 512 B per step, an educational placeholder with no Microsoft basis. All loading columns advance together.
- [SIMPLIFIED MODEL] The Customer table is the whole model and has no relationships or measures, so a query needs exactly the columns the user selects.
- [SIMPLIFIED MODEL] A column's place on the conceptual flow while loading (Column access before half way, VertiPaq representation after) is a visual aid only.
- Not modelled: framing, eviction (Module 7), memory limits, concurrent queries, relationships, measures, query execution (Module 8).

## What is documented vs simulated (Module 6)

- [DOCUMENTED] Microsoft Learn, "How Direct Lake works": data is loaded from OneLake when a query first needs a column (transcoding); the model determines the columns a query needs (used directly, plus those needed by relationships and measures), checks which are in memory and loads all the data for those that are not; loaded columns are resident and later queries that use only resident columns load nothing; columns can be evicted (after a refresh, when unused for some time, or under memory pressure); framing copies only metadata; Delta tables are Parquet files in OneLake and Parquet organizes data by column.
- [DOCUMENTED] Microsoft Learn, "Direct Lake overview": only the data needed to answer a query is loaded; Direct Lake and Import queries are processed by VertiPaq.
- [SIMULATION] The synthetic data, the step counts, the sizes and the whole run. [SIMPLIFIED MODEL] The constants and flow above.
- [PROPRIETARY INTERNAL] The real loading sequence, how data is transformed while loading, memory management, load times and memory use. The page never claims the whole model must load first, never treats a resident column as a full model import, and keeps column loading separate from query execution.

## Module 5 work completed

- Investigation: the drafts `analyzeColumnCompression` and `compareCompressionAcrossColumns` were run and found incompatible with the Module 1 and Module 3 models: dates were sized as text (14,000 B original against Module 1's 8,000 B for the same column), the output invented "Dictionary (HIGH) / RLE / Value (LOW)" recommendations with made-up thresholds, `compareCompressionAcrossColumns` used `Math.random` (not deterministic), and there were no segments, nulls or shared-dictionary accounting. Both drafts and the types `ColumnCompressionMetrics` and `CompressionComparison` were removed.
- `src/data/stage6-compression-simulator.ts` (all simulation maths; no `Math.random`; deterministic hash-based data): `estimateColumnCompression(column, rowsPerSegment, { encoding })`, `estimateFromInputs`, `compareCompression`, scenario generators, `buildEncodedPreview`, `buildCompressionChart`, `explainCompressionEstimate`, `describeCompressionAssumptions`, sources.
- Built on the existing models rather than a new one: segments, the shared dictionary (counted once) and per-segment metadata come from Module 3's `generateSegments`; the value model comes from Module 2; size constants from Modules 1-3. A test asserts the estimate equals Module 3's totals exactly, and equals Module 1's sizes (plus one segment's metadata) for one segment with no nulls.
- Distributions: Customer table column (all five columns), low-cardinality text, high-cardinality text, sequential integers, random integers, repeated decimals, dates (random), dates (sorted). Cardinality is exact (shuffled slots) and capped by rows and by a per-scenario maximum. Boolean is not simulated because the shared Customer dataset has no boolean column; the page says so.
- Two modelled representations, chosen by the user and never automatically: dictionary (every distinct value once plus bit-packed IDs) and value (offset from the minimum, numeric and date only). This was added because Microsoft Learn documents numeric data using value encoding; a dictionary-only estimate would mislead for integers (for example sequential integers are 0.85x as a dictionary but about 5.7x as value).
- `src/components/ColumnCompressionExplorer.tsx` + `.css`: all new classes `compression-` prefixed. Controls: value distribution, Customer column, representation, row count (0 to 5,000), distinct values (where free), rows per segment, null share, Reset. Shows rows, distinct values, cardinality ratio and teaching band, original size, dictionary size, encoded size, other modelled overhead, total, ratio, savings and dictionary overhead %; a breakdown table and bar; a step-by-step calculation; original vs encoded rows and the dictionary; segment-level statistics; a side-by-side comparison (six examples plus all five Customer columns, both representations) with a bar chart; the list of assumptions. Charts are `aria-hidden` and every value is also in a table.
- Types added to `src/types/stage6-vertipaq.ts` and re-exported from `src/types/index.ts`. The Module 8 draft's unused `_columnCompressions` parameter now has type `CompressionEstimate[]`; nothing else in Module 8 changed.
- Tests: 67 simulation tests (hand-checked arithmetic for both models, cardinality and bands, shared-dictionary accounting, segment-size changes, zero/one-row/single-value/all-null/high-cardinality/100,000-row cases, an exhaustive no-NaN/no-negative-size sweep, determinism with `Math.random` spied on, consistency with Modules 1 and 3, comparison, chart geometry, previews, explanations) and 31 component tests. A mutation check (counting the dictionary once per segment) was caught by 11 tests.

## Calculation assumptions (Module 5)

- [SIMPLIFIED MODEL] Original size: 8 bytes per number or date; 4-byte length prefix plus UTF-8 bytes per text value; a null takes the same fixed width (the prefix only, for text).
- Dictionary: one per column, counted once; each distinct value stored once at its original size; nulls use one reserved ID and no dictionary bytes.
- IDs: ceil(log2(dictionary entries)) bits, minimum 1, packed and rounded up to whole bytes per segment.
- Value model: (value - minimum) in ceil(log2(range + 1)) bits, plus one state when nulls exist, plus 16 bytes of column metadata; dates are whole-day numbers.
- Segment overhead: 64 bytes per segment (educational allowance); rows per segment is a setting, not an engine limit.
- Cardinality ratio = distinct / non-null rows. Low (< 0.1), medium and high (>= 0.9) are teaching labels, not engine thresholds.
- Savings are signed: they are negative when the model makes a column larger. No size is ever negative, NaN or Infinity; an empty column has ratio 1.
- Not modelled: run-length or other compression (so row order never changes a size), paging, relationships, calculated columns, the engine's real encoding choice.

## What is documented vs simulated (Module 5)

- [DOCUMENTED] Microsoft Learn, "Data reduction techniques for Import modeling": VertiPaq keeps separate internal data structures per column; numeric data uses value encoding; text and other non-numeric data uses hash encoding (a numeric ID per unique value, needing a hash lookup); converting text to numbers can reduce size, especially for unique or high-cardinality columns.
- [DOCUMENTED] Microsoft Learn, TOM `Column.EncodingHint`: a numeric column may use value-based or hash-based encoding; the server normally detects which; re-encoding may occur later.
- [DOCUMENTED] `INFO.STORAGETABLECOLUMNSEGMENTS`: per-segment sizes and the bits needed for Data IDs.
- [SIMULATION] All data and every size and ratio. [SIMPLIFIED MODEL] The two representations and the constants above. [PROPRIETARY INTERNAL] The engine's real encoding choice, bit layouts, further compression and actual sizes. The page does not select an encoding or claim one is always used.

## Module 4 work completed

- `src/data/stage6-elimination-simulator.ts`: `evaluateSegmentElimination(segments, predicate, { columnName, dataType, scale })` takes the `Segment[]` that Module 3's `generateSegments` produces and uses only each segment's min, max, null count and row count. It creates no segments or statistics of its own.
- Operators: `>`, `>=`, `<`, `<=`, `=`, `!=` and inclusive `BETWEEN`. Rules (closed ranges): `>` eliminated when max <= v; `>=` when max < v; `<` when min >= v; `<=` when min > v; `=` when v is outside [min, max]; `!=` only when every value equals v; `BETWEEN` when the ranges do not intersect (touching a bound keeps the segment). A BETWEEN with lower bound above upper bound matches nothing and eliminates everything.
- Nulls: a comparison with null is never true, so null rows never keep a segment alive (including for `!=`); an all-null segment is always eliminated; null rows inside scanned segments still count as rows potentially scanned.
- Result per segment: decision, a reason code (`ALL_NULL`, `EMPTY_PREDICATE`, `OUTSIDE_RANGE`, `ALL_EQUAL_EXCLUDED`, `RANGE_OVERLAPS`, `RANGE_SATISFIES`) and a plain-language reason. Scanned means "cannot be ruled out", never "contains matching rows". `RANGE_SATISFIES` marks a scanned segment whose whole range lies inside the predicate.
- Totals: segments scanned/eliminated, rows potentially scanned/avoided, row and segment elimination percentages (0, not `NaN`, when there is nothing to divide).
- Supports INTEGER, DECIMAL and DATE columns. The predicate value must match the column type (as Microsoft's Delta file-skipping page also notes); invalid input is rejected with a message. Text is not supported.
- Chart geometry helper (`buildEliminationRangeChart`) for the range bars and the predicate region.
- Replaced the draft `evaluateSegmentElimination` and removed the draft types `SegmentEvaluationResult` and the old `SegmentEliminationResult`. The draft's `matchPercentage` was an invented number and is gone.
- The Module 8 draft (`simulateStorageEngineScan`) was adapted at its one call site (operator map, assumes an INTEGER column) so it still compiles. Nothing else in Module 8 changed.
- `src/components/SegmentEliminationSimulator.tsx` + `.css`: all new classes `elim-` prefixed. Segments come from the Module 3 model via `generateSegments` with the same column, dataset size, rows per segment, row order and null share controls. Shows total/scanned/eliminated segments, rows potentially scanned/avoided, elimination percentages, a range chart (decorative, with the table as the text equivalent), and a per-segment decision and reason table. Invalid input shows an alert and hides results.
- Tests: 90 simulation tests (boundary matrix for every operator, single-value segments, BETWEEN edge cases, overlap, nulls, dates, decimals, validation, empty/degenerate input, consistency with Module 3, and a brute-force check that no eliminated segment holds a matching value), 23 component tests, and an extended CSS guard. A mutation check (breaking the `>` boundary) was caught by 5 tests.

## What is documented vs simulated (Module 4)

- [DOCUMENTED] Microsoft Fabric, "File skipping for Delta tables": Delta Lake records per-file min, max and null count; the engine skips a file whose range does not contain matches; the predicate type must match the column type. This is the Delta file layer in Spark, not VertiPaq segments.
- [SIMPLIFIED MODEL] The same possibility test applied to Module 3's segment metadata.
- [SIMULATION] Segments, their min/max/null counts and row counts come from the synthetic Customer table through the Module 3 model.
- [PROPRIETARY INTERNAL] Whether VertiPaq segments carry min/max metadata, and how the Storage Engine would use it, is not covered by the documentation reviewed. The module says so and does not claim it. `INFO.STORAGETABLECOLUMNSEGMENTS` documents segments but not min/max metadata.

## CSS remediation (done)

Verified by cascade order (not visually): two global class names collided across stages.

- `.simulator-header`: the VertiPaq container's rules overrode Stage 5's Predicate Pushdown header (centred text, 2px border). Now scoped under `.vertipaq-simulator`.
- `.control-group`: App.css uses it for the app header controls; Stage 5 Pushdown and Module 1 redefined it globally (column layout, label and input styles, extra margin). Pushdown's rules are now scoped under `.predicate-pushdown-simulator`; Module 1/2 rules under `.dictionary-explorer` / `.vh-simulator`.
- Module 1's `.metrics-grid`, `.metric-label`, `.metric-value` (also in Pushdown and Partitioning) are scoped under `.dictionary-explorer`.
- Effect: Stage 5 module internals are unchanged. The app header controls (including the Explanation Mode selector) return to the App.css design they had at Stage 4.
- Guard: `src/components/__tests__/cssScoping.test.ts` reads the CSS source and fails if these selectors become unscoped again (checked against the pre-fix CSS in Git).
- Left alone (all inside Stage 4/5, none involve Stage 6): divergent duplicates `.column-header .column-name .columns-grid .file-stats .metric .metric-value .mode-indicator .schema-json .source-link .sources-list .stat-label .stat-value .version-content .version-info`. Identical duplicates (`.col-name .col-type .expand-button .metric-label .stat .version-number .version-timestamp`) are harmless. Scope them when those modules are next touched.

## Module 3 work completed

- `src/data/stage6-segment-simulator.ts`: `generateSegments(column, rowsPerSegment, { rowOrder })` computes real per-segment statistics (min, max, distinct, nulls, average and spread for numbers) from the column values; ordered/unordered detection; optional sort-before-segmenting; deterministic null pattern; one shared dictionary per column; overlap detection (closed ranges, exact O(s log s) sweep); explanations; sources. Rejects segment sizes that are not whole numbers of at least 1.
- Replaced the draft `generateSegments` and removed the draft-era `SegmentExplorerState` type. `Segment` and `SegmentStatistics` are reused unchanged, so the Module 4 and 8 drafts still compile.
- New types in `src/types/stage6-vertipaq.ts`, re-exported from `src/types/index.ts`.
- `src/components/SegmentExplorer.tsx` + `.css`: all new classes are `seg-` prefixed. Reuses explanation modes, container navigation and the Module 1 panel styles. Controls: column, dataset size, rows per segment, row order, null share. Segment tiles (buttons with text state, not colour alone), detail panel, comparison table.
- Tile accessible names include spaces between parts (found while testing).

## What is documented vs simulated (Module 3)

- [DOCUMENTED] Microsoft Learn, DAX `INFO.STORAGETABLECOLUMNSEGMENTS`: column storage is reported per segment, with a segment number, record count, size, and the bits needed for Data IDs. It documents no fixed segment row count and no min/max metadata.
- [SIMULATION] Rows per segment is a user setting (educational assumption); boundaries fall every N rows in stored order; nothing assumes even distribution by value.
- [SIMPLIFIED MODEL] One dictionary per column shared by all segments; IDs bit-packed for the whole dictionary; nulls use one reserved ID; 64 bytes of metadata per segment; statistics are computed here.
- [PROPRIETARY INTERNAL] Real segment boundaries, row ordering and per-segment metadata.

## Validation (last run)

- `npm run lint` (this is `tsc --noEmit`; there is no ESLint): pass
- `npm run test:run`: 19 files, 670 tests passed (Modules 1-7, the CSS guard and container navigation all still pass; Module 8 adds 80 logic and 42 component tests, and 2 CSS guard cases)
- `npm run build`: pass
- Not measured: coverage. Not done: visual check in a browser (localhost is blocked by the sandbox; a headless preview could not connect).

## Module 2 work completed

- `src/data/stage6-synthetic-dataset.ts`: deterministic (seeded) Customer rows using the Stage 5 schema (CustomerID, Revenue, LastPurchaseDate, Region, CustomerName). Intended as the shared dataset for the remaining modules.
- `src/data/stage6-encoding-simulator.ts`: value encoding (offset + bit-packing), hash/dictionary encoding, comparison, extreme-value demo, explanations, source list.
- `src/components/ValueHashEncodingSimulator.tsx` + `.css`: reuses Module 1 panel styles; wired into `VertiPaqSimulator.tsx`.
- Types added to `src/types/stage6-vertipaq.ts` and re-exported from `src/types/index.ts`.
- Removed the old `compareEncodings` / `EncodingComparison`: its "[DOCUMENTED]" notes were not supported by Microsoft documentation (for example, that hash encoding loses information).
- Tests added for Module 1 logic, Module 2 logic, the dataset, both components, container navigation and App integration.

## What is documented vs simulated (Module 2)

- [DOCUMENTED] Microsoft Learn, TOM `Column.EncodingHint` / `EncodingHintType`: numeric columns may use value or hash encoding; the server normally detects which; re-encoding may occur later; hints are Default/Hash/Value (compatibility level 1400+).
- [SIMPLIFIED MODEL] Offset + bit-packing, dictionary sizing, fixed byte constants, dates as day numbers, text as dictionary-only.
- [PROPRIETARY INTERNAL] Engine selection rule, hash function, dictionary layout, further compression, and which encoding Direct Lake applies when loading Parquet columns.
- The module shows "smaller in this model" only. It never states which encoding the engine would pick.

## Module 1 stabilization (done)

- Replaced `Math.random` input with the shared deterministic Customer dataset: same column and row count always give the same result. Column picker added; the cardinality slider was removed because cardinality now comes from the data. Results update live, so the Generate button was removed.
- `generateDictionaryEncoding` now uses the Module 2 size model: bit-packed IDs (minimum 1 bit), 8 bytes per number or date, 4-byte length prefix plus UTF-8 for text. It takes an optional data type and returns `bitsPerId`.
- Fixed edge cases: a one-value column was 0 bytes per ID; an empty column gave `NaN` (now ratio 1).
- Added a warning when the dictionary makes the column larger than the original (for example CustomerID).
- Corrected the explanation, concepts and limitations text: the limitations quoted sizes the code did not use, and the old "[DOCUMENTED]" lines blurred Parquet, Delta Lake and VertiPaq. Added a sources list.
- Tests: 14 logic tests (including edge cases, determinism, round-trip on every Customer column) and 11 component tests.

## Known issues

1. Module 8 limitations: one measure column, one filter and one aggregation; no grouping, relationships, measures or DAX (Formula Engine work is not simulated); no segment elimination for text filters (Module 4 supports numeric and date only); the shared null pattern nulls the same rows in every column (a Module 3 property), so a row that passes a filter always has a non-null measure; storage order is a user assumption; scan work is a count, never a cost; the request line is conceptual and not xmSQL.
2. Module 7 limitations: eviction happens only when the user acts, so the module says nothing about when the real engine evicts; the budget, the ordering and the refresh scenario ("every resident column") are illustrations; segments and dictionaries are not evicted separately; there is no time passage, concurrency or capacity memory; loads finish in one action in this module's UI.
3. Module 6 limitations: the 512 B per step loading rate and the use of Module 5 estimates as memory are teaching assumptions; the flow position of a loading column is a visual aid; framing, memory limits, relationships, measures and query execution are not modelled (eviction is Module 7; scans are Module 8).
4. Module 5 limitations: estimates use a deliberately simple model (fixed byte sizes, bit-packing, no run-length or other compression), so the ratios are teaching values only; the dictionary model applied to numeric columns is not what Microsoft documents for them (value encoding), which is why both representations are offered and the page says so; the cardinality labels are teaching aids; Boolean columns are not simulated.
5. `docs/stage2/STAGE_2_RESEARCH_SUMMARY.md` calls value encoding "(dictionary)". Per Microsoft's TOM docs, value and hash are separate encodings. The Stage 2 text should be corrected in a later pass.
6. Earlier Stage 6 progress docs (`docs/stage6/STAGE_6_*.md`) say "approved for production" and make "100%" quality claims. These overstate the state. The five final docs now exist and `STAGE_6_DOCUMENTATION_INDEX.md` lists the older ones as historical and superseded; the older files themselves are unchanged. Further findings D1 to D11 are in `STAGE_6_TECHNICAL_VALIDATION.md`.
7. `STAGE_4_*` and `STAGE_5_*` report files still sit in the project root.
8. The CSS remediation and Modules 1-8 are verified only by jsdom tests and by reading the CSS. Nothing has been checked visually in a browser (including the Module 4 range chart, the Module 5 stacked bars, the Module 6 flow diagram, the Module 7 budget meter and the Module 8 execution sequence and wide segment table). The app header controls change back to their original (Stage 4) layout as a result of the scoping fix; please eyeball them.
9. Module 2 cites `.../power-bi/enterprise/directlake-overview`, which redirects to the canonical Fabric URL used by Module 3. Harmless; update when Module 2 is next touched.
10. Stage 4/5-internal duplicate CSS selectors remain (listed under CSS remediation).

## Next

The five final Stage 6 docs are written: `STAGE_6_IMPLEMENTATION_REPORT.md`, `STAGE_6_TECHNICAL_VALIDATION.md`, `STAGE_6_TEST_RESULTS.md`, `STAGE_6_COMPLETION_SUMMARY.md` and `STAGE_6_APPROVAL_CHECKLIST.md`. Next: browser validation by a person, review of the findings D1 to D11, a git review and commit decision, then approval of Stage 6.

Needs a browser check by a person (never done in this environment): the Module 8 execution sequence grid and status badges, the wide candidate segment table and its horizontal scrolling, the metric cards with long values (such as the requested columns), the controls layout when a filter adds inputs, plus the items in known issue 8 (including the app header controls).
