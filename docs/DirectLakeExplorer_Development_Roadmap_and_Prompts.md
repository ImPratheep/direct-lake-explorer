# Microsoft Fabric Direct Lake Explorer

## Development Roadmap and GitHub Copilot Agent Prompts

**Project workspace:** `C:\Users\prath\Projects\DirectLakeExplorer`\
**Initial operating model:** Local-only, using synthetic data\
**Primary development assistant:** GitHub Copilot Agent\
**Visualization skill:**
[Anatomy](https://github.com/wheresryan22/anatomy)\
**Important:** A Microsoft Fabric account is not required for the
initial simulator.

------------------------------------------------------------------------

## 1. Development roadmap

  Stage   Deliverable                                  Recommended model
  ------- -------------------------------------------- -------------------
  1       Understand Anatomy internals                 Haiku
  2       Research Direct Lake architecture            Sonnet
  3       Create isometric architecture illustration   Sonnet
  4       Build interactive architecture explorer      Sonnet
  5       Delta Lake and Parquet explorer              Sonnet
  6       VertiPaq simulator                           Sonnet
  7       DAX query execution simulator                Sonnet

Run the stages in order. Review each stage's deliverables before moving
to the next. Use Opus only when a difficult architectural or debugging
problem warrants it and the model is available.

### Current progress

Stages 3, 4 and 5 were accepted (see `PROJECT_CHECKPOINT.md`).

**Stage 6 (VertiPaq simulator): all eight modules are implemented**,
reachable from the application navigation, and covered by automated
tests (670 passing). **Browser validation is pending, review is pending,
and Stage 6 is not yet approved.** The final documentation is:

-   [STAGE_6_IMPLEMENTATION_REPORT.md](./STAGE_6_IMPLEMENTATION_REPORT.md)
-   [STAGE_6_TECHNICAL_VALIDATION.md](./STAGE_6_TECHNICAL_VALIDATION.md)
-   [STAGE_6_TEST_RESULTS.md](./STAGE_6_TEST_RESULTS.md)
-   [STAGE_6_COMPLETION_SUMMARY.md](./STAGE_6_COMPLETION_SUMMARY.md)
-   [STAGE_6_APPROVAL_CHECKLIST.md](./STAGE_6_APPROVAL_CHECKLIST.md)

The index for these is
[STAGE_6_DOCUMENTATION_INDEX.md](./STAGE_6_DOCUMENTATION_INDEX.md).

**Stage 7 (DAX query execution simulator): not started.** Stage 6
simulates parts of the Storage Engine's work and Direct Lake column
loading, and deliberately does not simulate the Formula Engine or
evaluate DAX.

## 2. Project-wide instructions

Apply these requirements throughout development:

-   Work only inside the currently opened `DirectLakeExplorer`
    workspace.
-   Follow the project's `SECURITY.md` and
    `.github/copilot-instructions.md`.
-   Do not access unrelated personal files or folders.
-   Do not read browser profiles, password stores, credentials, or
    secrets.
-   Do not connect to Microsoft Fabric, Azure, or any external service
    for the initial version.
-   Use synthetic data only.
-   Do not install packages or execute downloaded scripts without
    explaining the need and obtaining approval.
-   Do not run destructive commands or overwrite existing files without
    approval.
-   Inspect existing files before changing them.
-   Distinguish documented Microsoft behaviour from conceptual
    simulation. Label simulated or inferred behaviour clearly in the UI
    and documentation.
-   Do not claim that the simulator reproduces Microsoft's proprietary
    Direct Lake or VertiPaq engine internals exactly.
-   Keep the application modular, testable, and maintainable.
-   At the end of each stage, report files created or changed, tests
    performed, assumptions, limitations, and next steps.

------------------------------------------------------------------------

# Stage 1 --- Understand Anatomy internals

**Recommended model:** Haiku\
**Goal:** Understand the installed Anatomy skill before using it.

### Prompt

You are helping develop Microsoft Fabric Direct Lake Explorer.

I have installed the open-source Anatomy agent skill:
https://github.com/wheresryan22/anatomy

First, locate and study the installed Anatomy skill. Read its
`SKILL.md`, supporting references, and relevant scripts that are
accessible to you.

Investigate:

1.  The skill's purpose and intended workflow.
2.  How it creates isometric technical illustrations.
3.  SVG generation and composition.
4.  Interactive elements and animation support.
5.  Optional WebGL or shader capabilities.
6.  Browser automation and rendering workflow.
7.  Required runtimes, dependencies, and tools.
8.  Input and output formats.
9.  Limitations and known security considerations.
10. Which features are suitable for a standalone interactive website.

Security requirements:

-   Begin in read-only inspection mode.
-   Do not execute Anatomy scripts.
-   Do not install packages or dependencies.
-   Do not access files outside the project workspace, except the
    specifically installed Anatomy skill files if the environment
    permits.
-   If sandbox restrictions prevent inspection, explain the limitation.
    Do not disable or bypass the sandbox.
-   Do not infer that a script is safe merely because it is part of an
    open-source project.

Deliverables:

-   Anatomy capability summary.
-   Generation workflow.
-   Relevant scripts and references, with their purposes.
-   Dependency list.
-   Security review: inspected items, uninspected items, and unresolved
    risks.
-   Recommended way to invoke Anatomy through the current Copilot agent.

Do not create the Direct Lake illustration or modify project files in
this stage.

------------------------------------------------------------------------

# Stage 2 --- Research Direct Lake architecture

**Recommended model:** Sonnet\
**Goal:** Establish a technically accurate reference model before
implementation.

### Prompt

Act as a Microsoft Fabric and Power BI semantic-model architecture
researcher.

Research Microsoft Fabric Direct Lake using Microsoft Learn and other
authoritative technical references. Use the official Microsoft
documentation as the primary source. Record source links and the date of
research.

Investigate these topics:

1.  OneLake and the Lakehouse architecture.
2.  Delta Lake transaction logs and table versions.
3.  Parquet files, row groups, column chunks, and statistics.
4.  Delta table snapshots and metadata.
5.  Direct Lake framing and metadata refresh.
6.  Column loading and transcoding.
7.  VertiPaq dictionaries and data structures.
8.  Value encoding versus hash encoding.
9.  VertiPaq segments and segment elimination.
10. Formula Engine and Storage Engine responsibilities.
11. xmSQL and what can be observed through diagnostic tools.
12. Column residency, caching, memory pressure, and eviction.
13. Direct Lake on OneLake versus Direct Lake on SQL endpoint, where
    relevant.
14. DirectQuery fallback and documented conditions.

For each topic, document:

-   What it is.
-   Why it exists.
-   The sequence of operations.
-   Inputs and outputs.
-   Related components.
-   A small worked example.
-   What Microsoft documents explicitly.
-   What is observable through supported tools.
-   What is proprietary, inferred, or not publicly documented.

Create or update these documentation files in the project:

-   `docs/research/direct-lake-architecture.md`
-   `docs/research/technical-glossary.md`
-   `docs/research/query-execution-flow.md`
-   `docs/research/sources.md`

Accuracy requirements:

-   Do not invent internal implementation details.
-   Do not present a conceptual diagram as Microsoft's actual physical
    implementation.
-   Clearly label uncertain, inferred, and simulated behaviour.
-   Explain differences between the real engine and the educational
    simulator.
-   Do not write application code yet.

At the end, provide a concise architecture summary and identify
questions that must be resolved before visual design.

------------------------------------------------------------------------

# Stage 3 --- Create the isometric architecture illustration

**Recommended model:** Sonnet\
**Goal:** Produce the main visual representation using Anatomy.

### Prompt

Use the installed Anatomy skill, after reviewing its instructions and
security implications, to create an isometric technical illustration for
Microsoft Fabric Direct Lake Explorer.

First inspect the Stage 1 and Stage 2 research deliverables. Use those
documents as the technical source of truth.

Create a detailed isometric cutaway illustration showing these
conceptual layers:

**Storage layer** - OneLake. - Delta table and transaction log. -
Parquet files. - Row groups and column chunks.

**Direct Lake semantic-model layer** - Framing and table snapshot
metadata. - Column selection and loading. - Transcoding into in-memory
structures.

**VertiPaq layer** - Dictionaries. - Encoded column data. - Segments. -
Compression concepts.

**Query-processing layer** - DAX query entry. - Formula Engine. -
Storage Engine. - xmSQL as a conceptual/diagnostic representation where
appropriate. - Query results.

**Memory and performance layer** - Loaded columns and column
residency. - Cache state. - Eviction under memory pressure. - Segment
elimination.

Visual requirements:

-   Isometric technical cutaway style.
-   Clear grouping of storage, semantic model, query processing, and
    memory.
-   Legible labels and a consistent visual hierarchy.
-   Distinct visual treatment for actual documented components and
    conceptual explanatory elements.
-   Data-flow paths and numbered stages.
-   Professional, restrained dark theme.
-   Avoid visual clutter and tiny unreadable text.

Use Anatomy capabilities where appropriate. Keep source assets and
generated output in the project workspace.

Deliverables:

-   The generated illustration and its source files.
-   A short explanation of the visual structure.
-   A mapping from every visual component to the supporting research
    document.
-   Any technical simplifications or conceptual elements clearly
    identified.

Do not build the entire application in this stage. Do not execute
unreviewed scripts or install dependencies without approval.

------------------------------------------------------------------------

# Stage 4 --- Build the interactive architecture explorer

**Recommended model:** Sonnet\
**Goal:** Turn the architecture illustration into a working local
website.

### Prompt

Build the first working version of Microsoft Fabric Direct Lake Explorer
using the Stage 3 illustration.

Before coding:

1.  Inspect the existing project files.
2.  Read the project security instructions.
3.  Review the Stage 1--3 deliverables.
4.  Propose the application structure and explain any new dependencies.
5.  Wait for approval before installing packages or executing commands
    that require approval.

Preferred stack, subject to a short feasibility review:

-   React.
-   TypeScript.
-   Vite.
-   Anatomy-generated SVG assets.
-   A suitable animation library only if needed.
-   Accessible HTML controls and keyboard navigation.

Implement the Architecture Explorer first.

Requirements:

-   Display the overall Direct Lake architecture.
-   Make major components selectable.
-   Provide hover and focus states.
-   Clicking a component opens a detail panel.
-   Show the component's purpose, inputs, outputs, and relationships.
-   Include beginner, intermediate, and advanced explanations.
-   Show a step-by-step data-flow sequence.
-   Include a legend distinguishing documented facts, conceptual
    explanations, and simulated behaviour.
-   Support desktop and smaller screens.
-   Keep content separate from presentation components.
-   Provide accessible labels and keyboard interactions.

Do not implement all later simulation modules yet.

Deliverables:

-   A runnable local application.
-   Modular React components.
-   A clear README with approved setup and run instructions.
-   Basic component tests where appropriate.
-   A report of files changed, dependencies added, tests run, and known
    limitations.

Do not connect to Fabric or external services.

------------------------------------------------------------------------

# Stage 5 --- Delta Lake and Parquet explorer

**Recommended model:** Sonnet\
**Goal:** Use real local files to teach the storage formats that
underpin the simulator's data source.

### Prompt

Implement the Delta Lake and Parquet Explorer as a new module in
Microsoft Fabric Direct Lake Explorer.

The module must operate locally with synthetic data only.

Research and explain the real structures using reliable documentation.
Use suitable open-source libraries only after proposing dependencies and
obtaining approval.

**Delta Lake explorer**

Demonstrate:

-   A local Delta table.
-   The `_delta_log` directory.
-   JSON commit files.
-   Checkpoint files if supported by the chosen library and example.
-   Table versions.
-   Add/remove file actions.
-   A simplified snapshot view.
-   How a new table version changes the visible set of data files.

**Parquet explorer**

Demonstrate:

-   Parquet file metadata.
-   Schema.
-   Row groups.
-   Column chunks.
-   Encodings and compression metadata where available.
-   Statistics where available.
-   Column projection: reading selected columns without loading every
    column.

Use a small synthetic sales dataset.

Interactions:

-   Select a Delta table version.
-   Inspect the corresponding files.
-   Select a Parquet file.
-   Expand row groups and column chunks.
-   Select columns to inspect.
-   Show the difference between a conceptual explanation and metadata
    read from an actual local file.

Technical requirements:

-   Generate reproducible synthetic data.
-   Use actual local Delta/Parquet files for the format explorer when
    feasible.
-   Do not claim this module is implementing Microsoft's Direct Lake
    engine.
-   Keep the module independent of the Fabric account or cloud services.

Deliverables:

-   Working Delta Lake explorer.
-   Working Parquet explorer.
-   Synthetic dataset generator.
-   Tests for file and metadata handling.
-   Documentation describing real file structures and limitations.

------------------------------------------------------------------------

# Stage 6 --- VertiPaq simulator

**Recommended model:** Sonnet\
**Goal:** Teach VertiPaq concepts through a transparent educational
model.

### Prompt

Implement a VertiPaq educational simulator in Microsoft Fabric Direct
Lake Explorer.

This is a conceptual simulator, not Microsoft's proprietary VertiPaq
engine. Clearly label all simulated data structures and performance
results.

Teach and demonstrate:

1.  Columnar storage.
2.  Dictionary encoding.
3.  Value encoding.
4.  Hash encoding.
5.  Segment creation.
6.  Segment row counts and boundaries.
7.  Segment elimination using illustrative statistics.
8.  Compression concepts.
9.  Column cardinality.
10. Column memory usage as an estimate.
11. Column residency and loading state.

Use a synthetic dataset with configurable:

-   Row count.
-   Column count.
-   Cardinality.
-   Data types.
-   Repeated values.
-   Distribution and sort order.

Interactions:

-   Select a column.
-   Inspect its dictionary.
-   View encoded values.
-   Change cardinality.
-   Compare encoding strategies.
-   Change segment size.
-   See segment boundaries and illustrative statistics.
-   Apply a filter and show which segments could be eliminated.
-   Compare estimated storage sizes.

Accuracy requirements:

-   Explain that the simulator's encoding choices and memory estimates
    are illustrative unless backed by a real, documented measurement.
-   Do not claim to reproduce the proprietary VertiPaq compression
    algorithm.
-   Explain the difference between a logical dictionary/segment
    illustration and actual engine internals.

Deliverables:

-   Interactive VertiPaq simulator.
-   Reproducible examples.
-   Tests for the simulator's own algorithms.
-   Documentation of assumptions and limitations.

**Implementation status (added after Stage 6 was built):** all eight
modules are implemented (Dictionary Encoding, Value vs Hash Encoding,
Segment Explorer, Segment Elimination, Column Compression, Direct Lake
Column Loading, Memory Residency and Eviction, Storage Engine Scan).
Differences from this prompt: the scope grew from the eleven topics
above to eight modules that also cover column loading, memory and a
Storage Engine scan; columnar storage is explained in text only; and the
synthetic dataset has five fixed columns, so the column count is not
configurable. See
[STAGE_6_COMPLETION_SUMMARY.md](./STAGE_6_COMPLETION_SUMMARY.md). Browser
validation and approval are pending.

------------------------------------------------------------------------

# Stage 7 --- DAX query execution simulator

**Recommended model:** Sonnet\
**Goal:** Explain the conceptual flow of a DAX query through the Formula
Engine and Storage Engine.

### Prompt

Implement a DAX query execution learning module in Microsoft Fabric
Direct Lake Explorer.

The module must teach query-processing concepts without claiming to
reproduce the proprietary Microsoft engine.

Cover:

1.  DAX query input.
2.  Formula Engine responsibilities.
3.  Storage Engine responsibilities.
4.  xmSQL as a representation used in relevant diagnostics.
5.  Column dependencies.
6.  Storage Engine requests.
7.  Aggregation.
8.  Filter propagation at a conceptual level.
9.  Intermediate results.
10. Formula Engine result assembly.
11. How column residency and simulated loading affect the demonstration.

Provide several predefined DAX examples, such as:

-   A simple SUM.
-   Grouping by a dimension.
-   A filtered aggregation.
-   A measure with an iterator, with a careful explanation of the
    conceptual work involved.

For each example, show:

-   The DAX query.
-   A plain-language explanation.
-   The columns and tables required.
-   A conceptual execution sequence.
-   Which operations are represented as Formula Engine work.
-   Which operations are represented as Storage Engine work.
-   An illustrative xmSQL-like request, clearly labelled as illustrative
    rather than actual engine output.
-   The final result.

Interactions:

-   Choose a sample query.
-   Run, pause, step through, and reset the simulation.
-   Highlight the relevant architecture components.
-   Show the simulated column-loading state.
-   Display intermediate results and the final result.

Accuracy requirements:

-   Do not pretend to execute DAX using Microsoft's engine.
-   Do not fabricate real xmSQL traces.
-   Label generated query-plan steps and timings as simulated.
-   Explain that actual engine behaviour can vary with the model, query,
    engine version, and execution context.

Deliverables:

-   Interactive query-processing simulator.
-   Predefined DAX examples.
-   Tests for the simulator's own query scenarios.
-   Documentation explaining the boundary between the educational model
    and actual Power BI/Fabric execution.

------------------------------------------------------------------------

## 3. Definition of done for every stage

Before considering a stage complete, ask the agent to report:

1.  What was implemented?
2.  Which files were created or changed?
3.  Which dependencies were added, and why?
4.  Which tests were run, and what were the results?
5.  Which claims are based on Microsoft documentation?
6.  Which parts are conceptual or simulated?
7.  What limitations remain?
8.  What should be done next?

Do not proceed automatically to the next stage. Review the deliverables
first.

## 4. Project principles

-   Local-first development.
-   Synthetic data only.
-   No Fabric account required for the initial project.
-   No production credentials or company data.
-   No unapproved external connections.
-   No unreviewed script execution.
-   Technical accuracy over visual spectacle.
-   Explicit labels for simulations and assumptions.
-   Incremental development rather than generating the whole application
    in one request.

## 5. Future optional extension

A real Fabric integration may be considered later, if the user obtains
access to a suitable development workspace. It must be a separate,
explicitly approved phase. The initial application must remain fully
usable without Fabric authentication.
