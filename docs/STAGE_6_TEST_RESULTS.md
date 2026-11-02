# Stage 6 Test Results: VertiPaq Simulator

**Project:** Microsoft Fabric Direct Lake Explorer (local, synthetic data only)
**Stage:** 6, VertiPaq Simulator
**Environment:** Windows, Node.js, TypeScript (strict), Vite 5.4.21, Vitest with jsdom and Testing Library
**Status:** All automated checks pass. **No browser validation was performed.** Stage 6 is not yet approved.

Companion documents: [Implementation Report](./STAGE_6_IMPLEMENTATION_REPORT.md), [Technical Validation](./STAGE_6_TECHNICAL_VALIDATION.md), [Completion Summary](./STAGE_6_COMPLETION_SUMMARY.md), [Approval Checklist](./STAGE_6_APPROVAL_CHECKLIST.md).

---

## 1. Summary

The baseline reported before this documentation phase was 19 test files, 670 passing tests, lint passing and build passing. **The commands were rerun, twice, and the results were not assumed.** Both runs match the baseline.

| Check | Run 1 (start of documentation phase) | Run 2 (after all documents were written) |
|---|---|---|
| Time started (local) | 2026-11-01 22:11:41 (tests) | 2026-11-01 22:24:29 |
| `npm run lint` | passed, exit 0 | passed, exit 0 |
| `npm run test:run` | **19 files, 670 tests passed**, 0 failed | **19 files, 670 tests passed**, 0 failed |
| Test duration | 27.80 s | 13.33 s |
| `npm run build` | passed; 85 modules transformed; built in 3.70 s | passed; 85 modules transformed; built in 2.93 s |

Durations vary from run to run with machine load; the counts did not change. Only documentation files changed between the two runs, and no source or test file was modified in this phase.

### 1.1 What the commands are

| Command | What it runs |
|---|---|
| `npm run lint` | `tsc --noEmit`: a **TypeScript compile check** under strict settings (including no unused locals or parameters). It is **not ESLint**. The project has no ESLint configuration or dependency. |
| `npm run test:run` | `vitest run`: all tests once. (`npm test` is `vitest` in watch mode, which does not exit.) |
| `npm run build` | `tsc && vite build`: a type check followed by the production bundle. |

### 1.2 Build output (Run 2)

```
vite v5.4.21 building for production...
✓ 85 modules transformed.
dist/index.html                   0.56 kB | gzip:   0.34 kB
dist/assets/index-DmrO5SR-.css   87.93 kB | gzip:  12.17 kB
dist/assets/index-DYgLpJFY.js   441.07 kB | gzip: 117.63 kB | map: 1,236.85 kB
✓ built in 2.93s
```

Bundle sizes were identical in both runs. They are reported for completeness, not as a performance claim; no performance testing was done.

---

## 2. Results by file (Run 2)

| Test file | Covers | Tests |
|---|---|---|
| `src/data/__tests__/stage6-synthetic-dataset.test.ts` | Shared Customer dataset | 8 |
| `src/data/__tests__/stage6-dictionary-encoding.test.ts` | Module 1 logic | 14 |
| `src/components/__tests__/DictionaryEncodingExplorer.test.tsx` | Module 1 component | 11 |
| `src/data/__tests__/stage6-encoding-simulator.test.ts` | Module 2 logic | 27 |
| `src/components/__tests__/ValueHashEncodingSimulator.test.tsx` | Module 2 component | 9 |
| `src/data/__tests__/stage6-segment-simulator.test.ts` | Module 3 logic | 44 |
| `src/components/__tests__/SegmentExplorer.test.tsx` | Module 3 component | 17 |
| `src/data/__tests__/stage6-elimination-simulator.test.ts` | Module 4 logic | 90 |
| `src/components/__tests__/SegmentEliminationSimulator.test.tsx` | Module 4 component | 23 |
| `src/data/__tests__/stage6-compression-simulator.test.ts` | Module 5 logic | 67 |
| `src/components/__tests__/ColumnCompressionExplorer.test.tsx` | Module 5 component | 31 |
| `src/data/__tests__/stage6-loading-simulator.test.ts` | Module 6 logic | 51 |
| `src/components/__tests__/DirectLakeLoadingSimulator.test.tsx` | Module 6 component | 36 |
| `src/data/__tests__/stage6-memory-simulator.test.ts` | Module 7 logic | 54 |
| `src/components/__tests__/MemoryResidencySimulator.test.tsx` | Module 7 component | 42 |
| `src/data/__tests__/stage6-scan-simulator.test.ts` | Module 8 logic | 80 |
| `src/components/__tests__/StorageEngineScanSimulator.test.tsx` | Module 8 component | 42 |
| `src/components/__tests__/cssScoping.test.ts` | CSS scoping guard across stages | 18 |
| `src/components/__tests__/VertiPaqSimulator.test.tsx` | Container navigation and App regression | 6 |
| **Total** | **19 files** | **670** |

Totals check: logic tests 8 + 14 + 27 + 44 + 90 + 67 + 51 + 54 + 80 = 435; component tests 11 + 9 + 17 + 23 + 31 + 36 + 42 + 42 = 211; plus 18 CSS scoping and 6 container and App tests = 670.

---

## 3. What the tests cover

### 3.1 Logic and edge cases

| Area | Examples of what is asserted |
|---|---|
| Dataset | Same inputs give identical rows; schema matches Stage 5 |
| Encoding (M1, M2) | Hand-checked sizes for numbers, dates and text; first-seen ID order; one-value and empty columns; lossless round trip on every Customer column; value encoding not applicable to text; outlier effect |
| Segments (M3) | Real statistics from the values; last short segment; ordered and unordered columns; nulls; sorted order with nulls last; overlap detection; invalid segment sizes throw `RangeError`; one shared dictionary |
| Elimination (M4) | A boundary matrix for every operator; single-value segments; BETWEEN edges including inverted bounds; nulls never match; all-null segments; dates and decimals; validation; a brute-force check that no eliminated segment holds a matching value |
| Compression (M5) | Hand-checked arithmetic for both representations; cardinality bands; dictionary counted once; segment-size changes; zero, one, single-value, all-null, high-cardinality and 100,000-row cases; an exhaustive no-NaN, no-negative-size sweep; agreement with Modules 1 and 3 |
| Loading (M6) | One and several columns; repeated and in-progress requests; immutability; query plans; already-resident versus unloaded; memory never double counted; zero rows; all-null; invalid and unknown selections; invalid step counts |
| Memory (M7) | Initial residency; load, evict, repeated eviction; skips for non-resident and loading columns; re-requesting an evicted column; budget boundaries (equal, one byte below, zero, invalid); pressure orders, protection and shortfall; zero-row and all-null data; a no-NaN sweep |
| Scan (M8) | Candidate selection; Module 3 and 4 integration; candidate versus matching rows; each aggregation with exact values; exact decimal sums; boundary predicates; text filters; empty, single-row, all-null and partly-null data; 17 invalid-query cases; required-column loading; reuse of resident columns; no double-counted memory; eviction then reload; row order and comparison; the six scenarios with exact figures |

### 3.2 Component interactions and accessibility

Component tests render each module in jsdom, drive its controls with Testing Library, and assert what the user would see: headings, controls, metric cards, tables, messages and logs. They include:

- every module's controls and default figures; changing settings resets the session and says so (Modules 6 to 8);
- the four labels in the advanced explanations, all three explanation modes, and limitations text (for example, no real Fabric memory figure, no timings, "not xmSQL");
- accessible names on every input, table captions and row and column headers, named focusable scroll regions, `role="alert"` for validation, polite live regions for results and event logs, `role="meter"` and `<progress>` elements;
- state shown as text plus a symbol (for example "● Resident", "○ Not resident", "✓ Candidate (scanned)", "✗ Eliminated", "– Skipped");
- safe source links (`target="_blank"`, `rel="noopener noreferrer"`);
- each of Modules 6 to 8 uses only its own CSS class prefix plus the shared panel classes.

These are **structural** checks in jsdom. They do not prove the page looks right or works with a screen reader.

### 3.3 CSS scoping (18 tests)

`cssScoping.test.ts` reads the CSS source (jsdom does not apply stylesheets) and asserts:

- none of the nine Stage 6 CSS files defines an unscoped `.control-group`, `.simulator-header`, `.metrics-grid`, `.metric-label` or `.metric-value`;
- Modules 3 to 8 define only selectors that start with their prefix (`seg-`, `elim-`, `compression-`, `loading-`, `memory-`, `scan-`);
- Predicate Pushdown scopes its `.control-group` rules to its own root, the VertiPaq header rules are scoped under `.vertipaq-simulator`, and `App.css` keeps its original header `.control-group` definition.

The prefix test covers Modules 3 to 8 only. Modules 1 and 2 are covered by the unscoped-selector test.

### 3.4 Regression tests

| Regression | Test |
|---|---|
| The scan must use the segments elimination selected, not the first N | `stage6-scan-simulator.test.ts`, "candidate segment selection (regression: never the first N segments)": candidates 4 and 5 of 10 must be read and segments 0 and 1 must not |
| Draft scan removed | `stage6-scan-simulator.test.ts`: `simulateStorageEngineScan` is no longer exported |
| Elimination never loses a matching row | Module 4 brute-force test; Module 8 sweep of 4 settings x 12 filters x 6 measures x 2 storage orders |
| Global CSS class collisions | `cssScoping.test.ts` |
| All eight tabs show a real module; no "Coming Soon" and no `.placeholder-module` | `VertiPaqSimulator.test.tsx` |
| Earlier stages still work | `VertiPaqSimulator.test.tsx`: the Stage 4 Architecture Explorer is the default view; navigating to the VertiPaq Simulator works; Stage 5 modules remain reachable |
| Modules 1 to 7 keep passing as later modules are added | the full suite is run each time |

### 3.5 Deterministic behaviour

- `Math.random` is spied on and asserted **not called** in the Module 5, 6, 7 and 8 logic tests; `Date.now` is also spied on in the Module 8 test.
- Modules 1 to 4 and the dataset assert identical output for identical input.
- Module 5 to 8 component tests assert identical results across separate renders.
- Searching the Stage 6 source found no `Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval` or `new Date()` without arguments. The only remaining uses in `src/` are in the Stage 5 file `stage5-delta-lake-parquet.ts`, which is outside Stage 6.

---

## 4. Test design notes

- Tests import from `vitest` explicitly and avoid jest-dom matchers, so the files also pass `tsc --noEmit`.
- Exact figures quoted in the UI (for example "249,311.15" or "4,463 B") are asserted in tests, so documentation and behaviour cannot drift silently.
- Where a number would otherwise be copied from the implementation, an **independent reference** was written: brute-force scans in Modules 4 and 8, and an independent predicate evaluator and aggregate calculator in Module 8.
- Simulation sessions are treated as values: tests compare a session before and after an action to prove nothing was mutated.

---

## 5. Not covered

| Not covered | Consequence |
|---|---|
| **Browser rendering** | Layout, charts, scrolling, spacing, focus rings and responsive behaviour are unverified. **Browser validation is pending.** |
| **Assistive technology** | No screen-reader or keyboard-only testing |
| **Colour contrast** | Not measured |
| **Code coverage percentage** | No coverage tool was run, so no coverage figure is claimed |
| **Performance** | No timing or load testing |
| **Automated end-to-end tests** | None exist |
| **Live source URLs** | Microsoft Learn URLs were not re-checked for all sources in this phase |

---

## 6. Mutation checks performed

During development, key rules were **deliberately broken** to confirm the tests would fail, and then restored. These were manual, one-line, temporary changes; they are **not** an automated mutation-testing run, and they were not repeated in this documentation phase (no source was changed here). The record below is taken from the development log (`PROJECT_CHECKPOINT.md`) and the development sessions.

| Module | Deliberate break | Failed tests | Result |
|---|---|---|---|
| 1, 2, 3 | none recorded | n/a | n/a |
| 4 | Broke the `>` boundary rule | 5 | caught, restored |
| 5 | Counted the dictionary once per segment | 11 | caught, restored |
| 6 | Ignored the "already loaded" rule | 1 (the repeated-loading test) | caught, restored |
| 6 | Mislabelled a resident column in the query plan (component) | 1 | caught, restored |
| 7 | Changed the budget boundary `<=` to `<` | 1 | caught, restored |
| 7 | Ignored protected columns | 2 | caught, restored |
| 7 | Component ignored the protected-columns selection | 2 | caught, restored |
| 8 | Scanned the first N segments instead of the selected ones | 6 | caught, restored |
| 8 | Skipped the row-level filter (treated candidate rows as matches) | 16 | caught, restored |
| 8 | Component ignored the chosen storage order | 2 | caught, restored |

Modules 1 to 3 have no recorded mutation checks; their tests are conventional unit and component tests, plus the Module 5 tests that assert agreement with Modules 1 and 3.

---

## 7. Test failures encountered during development

For the record, failures found and fixed while building Modules 6 to 8, none of which remain:

- Module 6: a test asserted on events that already existed from a warm-up (a test bug, not a code bug).
- Module 8: four logic-test expectations were wrong (a guessed earliest date, the display order of allowed aggregations in two places, and a null-handling expectation that turned out to expose the shared null-pattern property now recorded as D9) and three component-test expectations were wrong (reason wording, a decimal format, and concatenated paragraph text). One unused constant also failed the TypeScript check. All were test or tidy-up fixes; no simulation logic was changed to make a test pass.
- Module 8: after rewording one Module 6 log line, the full suite caught a Module 6 test that asserted the old wording. The wording was adjusted so both modules read correctly; the Module 6 test was not changed.

---

## 8. How to reproduce

```bash
npm run lint        # TypeScript compile check (tsc --noEmit), not ESLint
npm run test:run    # all tests once; expect 19 files, 670 tests
npm run build       # tsc && vite build
```

Re-run all three immediately before approval, on the machine used for sign-off, and compare with this document. If counts differ, update this document rather than assuming the older figures still hold.
