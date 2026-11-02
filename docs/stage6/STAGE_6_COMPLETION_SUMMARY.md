# Stage 6 Completion Summary: VertiPaq Simulator

**Project:** Microsoft Fabric Direct Lake Explorer (local, synthetic data only)
**Stage:** 6, VertiPaq Simulator
**Date:** November 1, 2026

## Overall status

| Question | Answer |
|---|---|
| Are all eight modules implemented and reachable? | **Yes** |
| Do lint, tests and the production build pass? | **Yes** (see [Test Results](./STAGE_6_TEST_RESULTS.md)) |
| Has the stage been checked in a browser? | **No. Browser validation is pending.** |
| Has the implementation been reviewed and approved? | **No. Review and approval are pending.** |
| Is the work committed? | **No.** Modules 2 to 8 are uncommitted (see the [Approval Checklist](./STAGE_6_APPROVAL_CHECKLIST.md)). |
| Is Stage 6 approved? | **No.** |

In one sentence: all eight simulator modules are implemented and automatically verified, and the stage is awaiting browser validation, review and approval.

> This is an educational simulator. It does not reproduce Microsoft's proprietary VertiPaq or Direct Lake engine, and no number in it is a Fabric measurement.

Related: [Implementation Report](./STAGE_6_IMPLEMENTATION_REPORT.md), [Technical Validation](./STAGE_6_TECHNICAL_VALIDATION.md), [Test Results](./STAGE_6_TEST_RESULTS.md), [Approval Checklist](./STAGE_6_APPROVAL_CHECKLIST.md).

---

## 1. Stage 6 objectives

The roadmap ([DirectLakeExplorer_Development_Roadmap_and_Prompts.md](./DirectLakeExplorer_Development_Roadmap_and_Prompts.md)) sets the goal "Teach VertiPaq concepts through a transparent educational model", with accuracy rules: label simulated data and results, do not claim to reproduce the proprietary compression algorithm, and explain the difference between a logical illustration and engine internals. Stage 6 grew into eight modules, and Modules 6 to 8 extend the roadmap prompt to cover Direct Lake column loading, memory and a Storage Engine scan.

### 1.1 Coverage of the roadmap prompt

| Roadmap item | Status | Where |
|---|---|---|
| Columnar storage | **Explained in text only.** There is no dedicated interactive visualization. | Key Concepts and the Module 6 flow (Parquet organizes data by column) |
| Dictionary encoding | Done | Module 1 |
| Value encoding | Done | Module 2 |
| Hash encoding | Done | Module 2 |
| Segment creation, row counts and boundaries | Done | Module 3 |
| Segment elimination using illustrative statistics | Done (statistics are computed from the actual values) | Module 4 |
| Compression concepts | Done | Module 5 |
| Column cardinality | Done | Modules 1, 5 |
| Column memory usage as an estimate | Done | Modules 5, 6, 7 |
| Column residency and loading state | Done | Modules 6, 7 |
| Synthetic dataset: row count, data types, repeated values, distribution and sort order, cardinality | Done: row count (all), data types and distributions (Module 5 scenarios), repeated values (Module 5), sort order (Modules 3, 4, 8), cardinality (Module 5) | |
| Synthetic dataset: **configurable column count** | **Not provided.** The shared Customer table has five fixed columns. | Deviation from the prompt |
| Change cardinality | Module 5 only. Module 1 originally had a cardinality slider; it was removed because cardinality now comes from the real shared data. | |
| Reproducible examples, tests, documentation of assumptions | Done | Practical Examples on each page; 670 tests; this document set |
| Do not claim to reproduce VertiPaq | Done and tested | Labels on every page |

---

## 2. Completed modules

| # | Module | Tab | Logic tests | Component tests | Status |
|---|---|---|---|---|---|
| 1 | Dictionary Encoding Explorer | Dictionary Encoding | 14 | 11 | Implemented, tested |
| 2 | Value vs Hash Encoding Simulator | Value vs Hash Encoding | 27 | 9 | Implemented, tested |
| 3 | Segment Explorer | Segment Explorer | 44 | 17 | Implemented, tested |
| 4 | Segment Elimination Simulator | Segment Elimination | 90 | 23 | Implemented, tested |
| 5 | Column Compression Explorer | Column Compression | 67 | 31 | Implemented, tested |
| 6 | Direct Lake Column Loading Simulator | Direct Lake Loading | 51 | 36 | Implemented, tested |
| 7 | Memory Residency and Eviction Simulator | Memory Residency | 54 | 42 | Implemented, tested |
| 8 | Storage Engine Scan Simulator | Storage Engine Scan | 80 | 42 | Implemented, tested |

Other tests: shared dataset 8, CSS scoping 18, container navigation and App regression 6. Total 670. Details per module are in the [Implementation Report](./STAGE_6_IMPLEMENTATION_REPORT.md).

---

## 3. Shared architecture

- **One synthetic Customer table** (five columns, seeded and deterministic, same schema as the Stage 5 Delta and Parquet modules) feeds every module.
- **One size model** (defined in Module 2, used through Module 5) so every module agrees on column sizes.
- **One session** (Module 6's `LoadingSession`) carries rows, segment size, null share and column residency through Modules 7 and 8.
- **Modules build on each other:** Module 4 uses Module 3's segments; Module 5 uses Modules 2 and 3; Module 6 uses Module 5's sizes; Module 7 acts on Module 6's session; Module 8 uses Modules 3, 4 and 6 and reacts to Module 7's evictions.
- **Pure logic, thin components.** Simulation lives in `src/data/stage6-*.ts` (no I/O, timers or randomness); components only hold UI state.
- **Consistent UI:** one container with eight tabs, one shared explanation mode, shared panel styles, per-module CSS prefixes, and the four-label convention (`[DOCUMENTED]`, `[SIMULATION]`, `[SIMPLIFIED MODEL]`, `[PROPRIETARY INTERNAL]`).
- **The five conceptual architecture areas** (Storage, Semantic, VertiPaq, Query, Memory) are a teaching organization, not five independent physical layers. See the [Technical Validation](./STAGE_6_TECHNICAL_VALIDATION.md#21-the-five-conceptual-architecture-areas).

---

## 4. Validation results

Run at the end of this documentation phase (the full record is in [Test Results](./STAGE_6_TEST_RESULTS.md)):

| Command | Result |
|---|---|
| `npm run lint` | Passed. This script is `tsc --noEmit`, a TypeScript compile check. It is **not** ESLint, and the project has no ESLint configuration. |
| `npm run test:run` | 19 test files, 670 tests, all passed |
| `npm run build` | Passed (`tsc && vite build`) |

Also verified: no Stage 6 source file uses `Math.random`, `Date.now` or timers; every module's CSS is scoped; all eight tabs render a real module.

---

## 5. Known limitations

**Scope and model**
- The simulator models parts of the Storage Engine's work and of Direct Lake column loading. The **Formula Engine and DAX are not simulated**.
- All sizes, ratios, loading steps (512 bytes per step), budgets, eviction behaviour, scan counts and the "values read" figure are educational calculations. None is a Fabric measurement.
- Only the five fixed Customer columns exist; there is no Boolean column and the column count is not configurable.
- Not modelled: framing, relationships, measures, join indexes, DirectQuery fallback, V-Order, deletion vectors, run-length and other compression, and the cold, semiwarm, warm and hot residency states that Microsoft documents.
- Eviction happens only when the user acts; the simulator says nothing about when the real engine evicts. The refresh scenario assumes every resident column is affected.
- Segment size is a user setting (default 500 rows). It is unrelated to the large segment sizes Microsoft discusses for Direct Lake.
- Segment elimination supports numeric and date columns only, so text filters scan every segment. One measure column, one filter and one aggregation per scan.
- The shared null pattern nulls the same rows in every column.
- The request line in Module 8 is a conceptual illustration, not xmSQL.

**Documentation and source issues** (reported, not fixed; details in the [Technical Validation](./STAGE_6_TECHNICAL_VALIDATION.md#10-findings-and-discrepancies))
- The older Stage 6 progress documents overclaim and describe only Module 1 (D1).
- The Stage 2 research summary contains statements Stage 6 does not adopt, such as segments of about 8,000 rows and LRU eviction (D2).
- Microsoft's pages describe encoding inconsistently, and the Module 2 and 5 pages do not reconcile them (D4). Module 6's `[PROPRIETARY INTERNAL]` wording is stricter than the documentation (D5).
- `RESEARCH_SOURCES.md` does not list every source Stage 6 uses (D3). Some unused code remains (D7).

**Verification limits**
- Components are tested in jsdom only. CSS is verified by reading the source.
- No screen-reader or assistive-technology testing.
- Mutation checks were manual and temporary.
- No coverage percentage was measured.

---

## 6. Outstanding browser-validation work

Nothing in Stage 6 has been viewed in a browser. The sandbox used during development blocked localhost, so every visual claim is unverified. A person should check, in a real browser (at desktop and phone widths, in dark and light system settings if relevant):

| Area | What to check |
|---|---|
| Container | Eight tabs fit and wrap sensibly; the active tab is clear; the app header controls (which return to their original Stage 4 layout after the CSS scoping fix) still look right |
| All modules | Shared panel styling is consistent with Stages 4 and 5; text contrast; focus rings on every control; no overlapping or clipped text |
| Module 3 | Segment list and statistics table layout; selecting a segment |
| Module 4 | The range chart and predicate marker; reason table readability |
| Module 5 | The stacked bars and original-size outline; the wide comparison table |
| Module 6 | The six-stage flow: spacing, the "→" connectors, columns drawn under stages, horizontal scrolling on narrow screens; `<progress>` bars; the memory meter |
| Module 7 | The budget meter (including the over-budget state); before/after table; long event log scrolling |
| Module 8 | The six-step execution sequence grid and status badges; the wide candidate segment table and its horizontal scroll; long metric values (such as "Requested Columns"); the controls layout when a filter adds inputs; the storage-order comparison |
| Accessibility | Keyboard-only walk through every module; a screen-reader pass over tables, live regions and the event logs |
| Behaviour | Explanation mode switching at the application level carries into every module |

Outstanding browser validation must be recorded as done only after someone actually performs it.

---

## 7. Open decisions

1. Review and approve the implementation (Approval Checklist).
2. Decide how to handle the findings D1 to D11, especially D2, D4, D5 and D6, which affect accuracy of explanatory text or older documents.
3. Perform browser validation.
4. Decide when to commit. Modules 2 to 8 and these documents are uncommitted.
5. Decide whether the older Stage 6 documents should be archived or given a "superseded" banner.

Stage 7, the DAX query execution simulator, is the next stage in the roadmap. It would be the natural home for Formula Engine behaviour, which Stage 6 deliberately stops short of.
