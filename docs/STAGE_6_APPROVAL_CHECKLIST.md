# Stage 6 Approval Checklist: VertiPaq Simulator

**Project:** Microsoft Fabric Direct Lake Explorer (local, synthetic data only)
**Stage:** 6, VertiPaq Simulator
**Prepared:** November 1, 2026

**How to use this list.** `[x]` means the item was verified in this documentation phase, and the evidence is given. `[ ]` means it is **not yet done**: it needs a person, a browser, or a decision. Nothing marked `[ ]` has been verified.

**Overall:** automated verification is complete. **Browser validation is pending. Git review and approval are pending. Stage 6 is not approved, and the project must not be described as visually verified.**

Related: [Implementation Report](./STAGE_6_IMPLEMENTATION_REPORT.md), [Technical Validation](./STAGE_6_TECHNICAL_VALIDATION.md), [Test Results](./STAGE_6_TEST_RESULTS.md), [Completion Summary](./STAGE_6_COMPLETION_SUMMARY.md).

---

## 1. All eight modules implemented

- [x] Module 1: Dictionary Encoding Explorer (`DictionaryEncodingExplorer.tsx`)
- [x] Module 2: Value vs Hash Encoding Simulator (`ValueHashEncodingSimulator.tsx`)
- [x] Module 3: Segment Explorer (`SegmentExplorer.tsx`)
- [x] Module 4: Segment Elimination Simulator (`SegmentEliminationSimulator.tsx`)
- [x] Module 5: Column Compression Explorer (`ColumnCompressionExplorer.tsx`)
- [x] Module 6: Direct Lake Column Loading Simulator (`DirectLakeLoadingSimulator.tsx`)
- [x] Module 7: Memory Residency and Eviction Simulator (`MemoryResidencySimulator.tsx`)
- [x] Module 8: Storage Engine Scan Simulator (`StorageEngineScanSimulator.tsx`)
- [x] No unfinished draft simulator remains in `stage6-vertipaq-simulator.ts` (only the Module 1 function and a source list)
- [x] Draft defects removed rather than preserved (see Implementation Report section 4)

## 2. Navigation

- [x] The application's "VertiPaq Simulator" button opens the Stage 6 container (`App.tsx`; tested)
- [x] All eight tabs open a real module: `VertiPaqSimulator.test.tsx` clicks every tab and asserts none shows "Coming Soon" and the `.placeholder-module` element is absent
- [x] Each module has its own named heading, asserted in the navigation test (Modules 1 to 8)
- [x] Stage 4 default view and Stage 5 modules remain reachable (App regression tests)
- [x] One explanation mode (beginner, intermediate, advanced) is passed to every module, and each module renders all three (component tests)
- [ ] Switching the explanation mode at application level changes the content in every module, checked by hand in a browser

## 3. Shared synthetic dataset consistency

- [x] One dataset generator (`stage6-synthetic-dataset.ts`), seeded and deterministic, same Customer schema as Stage 5
- [x] Modules 1 to 8 read the same rows. Module 5 additionally offers labelled synthetic distributions, and says so
- [x] No second Customer dataset exists
- [x] One size model (Module 2) is imported, not copied, by Modules 1, 3 and 5; Module 5 sizes feed Module 6; Modules 7 and 8 use Module 6's session
- [x] Segment boundaries come from Module 3 in Modules 4, 5 and 8
- [x] Residency and memory have one definition (Module 6 session, reused by Modules 7 and 8)
- [x] Column sizes shown in Modules 6 to 8 equal Module 5's estimates (tests)
- [x] Known property recorded: the shared null pattern nulls the same rows in every column (D9)

## 4. Accurate documented, simulated and proprietary labelling

- [x] Every module page carries the four labels `[DOCUMENTED]`, `[SIMULATION]`, `[SIMPLIFIED MODEL]`, `[PROPRIETARY INTERNAL]` (searched: all four strings appear in each of the eight component files; component tests assert them for Modules 6 to 8)
- [x] `[DOCUMENTED]` is used only for statements in Microsoft pages that were read (claims register, Technical Validation section 7)
- [x] No page claims to reproduce VertiPaq or Direct Lake; no page presents a simulated size, step, eviction or scan as a Fabric measurement
- [x] Module 8 states the request line is not xmSQL; no timings are shown (component test)
- [x] Module 7 shows no Fabric memory figure and claims no real eviction algorithm (component test)
- [x] Direct Lake, VertiPaq, Storage Engine and Formula Engine are kept distinct; the Formula Engine is not simulated (Technical Validation sections 2 and 8)
- [x] The five architecture areas are described as a teaching organization, not five physical layers
- [ ] Decision on discrepancy **D4** (encoding wording across Microsoft pages) and **D5** (Module 6 `[PROPRIETARY INTERNAL]` wording stricter than the documentation). Not changed in this phase
- [ ] Decision on discrepancy **D6** (documented segment guidance not surfaced in Module 3)
- [ ] Decision on discrepancies **D1, D2, D2b, D3** (older documents and the Stage 2 research notes contain statements Stage 6 does not adopt)

## 5. Deterministic behaviour

- [x] No Stage 6 source file uses `Math.random`, `Date.now`, `performance.now`, timers or `new Date()` without arguments (searched)
- [x] Same inputs give the same output in every module (tests; Modules 5 to 8 spy on `Math.random`, Module 8 also on `Date.now`)
- [x] Sessions are immutable: actions return new sessions and never change their input (tests)
- [x] Scan results are calculated from actual rows, with no invented match percentages or aggregates
- [x] The only `Math.random` and `Date.now` uses left in `src/` are in the Stage 5 file `stage5-delta-lake-parquet.ts` (out of Stage 6 scope)

## 6. Module integration

- [x] Module 4 uses Module 3's segments and never builds its own
- [x] Module 5 matches Module 3's totals exactly and Module 1's sizes in the one-segment case
- [x] Module 6 sizes equal Module 5 estimates
- [x] Module 7 evicts within the Module 6 session; evicted columns load again through Module 6
- [x] Module 8 uses Module 3 segments, Module 4 decisions (equal to a direct Module 4 call), and Module 6 `executeQuery`
- [x] Memory is counted once per column across repeated loads, evictions and scans
- [x] The scan reads the segments elimination selected, not the first N (regression test; deliberate first-N mutation fails 6 tests)
- [x] Candidate rows and matching rows are separate numbers
- [x] The scan equals a whole-table brute-force scan across a sweep of filters, measures, settings and storage orders
- [x] Invalid input (queries, selections, budgets) changes no state

## 7. Test, lint and build results

Latest results are in [Test Results](./STAGE_6_TEST_RESULTS.md).

- [x] `npm run lint` passes. This is `tsc --noEmit`, a TypeScript compile check, **not ESLint**
- [x] `npm run test:run`: 19 test files, 670 tests, all passed
- [x] `npm run build` passes (`tsc && vite build`)
- [x] Modules 1 to 7 tests still pass after Module 8
- [x] Mutation checks were performed and recorded (manual and temporary; Test Results section 6)
- [ ] Code coverage percentage: **not measured** (no coverage tooling was run)
- [ ] Re-run all three commands immediately before approval, on the machine that will be used for sign-off

## 8. Accessibility and CSS scoping

- [x] Every module's CSS uses its own prefix (`vh-`, `seg-`, `elim-`, `compression-`, `loading-`, `memory-`, `scan-`) and a test fails if a prefixed file defines a differently named selector (Modules 3 to 8)
- [x] No Stage 6 CSS file defines unscoped `.control-group`, `.simulator-header`, `.metrics-grid`, `.metric-label` or `.metric-value` (test, all nine Stage 6 CSS files)
- [x] Earlier-stage collisions were scoped without changing the original rules (`App.css` header rule retained, Predicate Pushdown scoped; tests)
- [x] Component tests check that each of Modules 6 to 8 uses only its own prefix plus the shared panel classes
- [x] Status is shown as text plus a symbol, never colour alone (tests for Modules 6, 7, 8)
- [x] Inputs have labels; tables have captions and row and column headers; scrollable regions are named and focusable; validation uses `role="alert"`; results and logs use live regions (tests)
- [ ] Colour contrast checked in a browser
- [ ] Keyboard-only walk through every module
- [ ] Screen-reader check of tables, live regions and event logs
- [ ] Responsive layout at narrow widths

## 9. Browser validation: PENDING

**Not done.** The development sandbox blocked localhost, so no module has been viewed in a browser. All visual behaviour is unverified: layout, charts, scrolling, spacing, contrast and the interactive flow. The full list of what to check is in the [Completion Summary](./STAGE_6_COMPLETION_SUMMARY.md#6-outstanding-browser-validation-work).

- [ ] Start the app and open each of the eight tabs
- [ ] Module 3 and 4: segment table and range chart render correctly
- [ ] Module 5: stacked bars, outline and comparison table render correctly
- [ ] Module 6: the six-stage flow and progress bars render correctly
- [ ] Module 7: the budget meter, including the over-budget state, renders correctly
- [ ] Module 8: the execution sequence, the wide segment table and long metric values render correctly
- [ ] The application header controls still look right after the CSS scoping change
- [ ] Record who performed the check, when, in which browser and at which widths

Do not mark the project "visually verified" until every box above is checked by a person.

## 10. Git review and approval: PENDING

At the time of writing, the repository contains uncommitted work. `git log` shows the commits `stage 6` and `test` from earlier, but the Stage 6 modules created after them are not committed.

- [ ] Review `git status` and `git diff` for the modified files: `src/types/index.ts`, `src/types/stage6-vertipaq.ts`, `src/data/stage6-vertipaq-simulator.ts`, `src/components/VertiPaqSimulator.tsx`, `VertiPaqSimulator.css`, `DictionaryEncodingExplorer.tsx` and `.css`, `PredicatePushdownSimulator.css`
- [ ] Review the new, untracked files: the `stage6-*.ts` data modules, the Module 2 to 8 components and CSS files, both `__tests__` folders, `docs/PROJECT_CHECKPOINT.md` and the five Stage 6 documents
- [ ] Confirm no `.env`, credential or secret is included (none was created in this stage)
- [x] The build output (`dist/`) is ignored by `.gitignore` (line 24; `git check-ignore` confirms), so it will not be committed
- [ ] Decide the commit grouping and message
- [ ] Commit (not done in this phase)
- [ ] Push (not done in this phase; the project is local-only)

## 11. Documentation

- [x] Implementation Report, Technical Validation, Test Results, Completion Summary and this checklist created in `docs/`
- [x] `STAGE_6_DOCUMENTATION_INDEX.md` updated to list them and to mark the older Module 1 era documents as historical
- [x] The roadmap notes that all eight modules are implemented and links to the new documents
- [x] `PROJECT_CHECKPOINT.md` remains the running work log
- [ ] Decide whether to archive or banner the older Stage 6 documents (D1)

## 12. Sign-off

| Item | Status |
|---|---|
| Automated verification (lint, tests, build) | Done |
| Documentation | Done |
| Browser validation | **Pending** |
| Review of discrepancies D1 to D11 | **Pending** |
| Git review | **Pending** |
| Approval of Stage 6 | **Pending** |

Approved by: ______________________  Date: ______________

Notes: ______________________________________________________________
