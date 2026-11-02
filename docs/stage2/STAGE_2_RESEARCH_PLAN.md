# STAGE 2: RESEARCH DIRECT LAKE ARCHITECTURE - INVESTIGATION PLAN

**Project:** Microsoft Fabric Direct Lake Explorer  
**Stage:** 2 - Research Direct Lake architecture  
**Status:** 🔄 IN PROGRESS  
**Date Started:** November 1, 2026  
**Recommended Model:** Sonnet  

---

## Research Objective

Establish a technically accurate reference model of Microsoft Fabric's Direct Lake architecture using official Microsoft documentation. This research will inform the visual design (Stage 3) and implementation (Stages 4-7).

## Investigation Scope

### 14 Core Topics to Research

1. **OneLake and Lakehouse Architecture**
2. **Delta Lake Transaction Logs and Table Versions**
3. **Parquet Files: Row Groups, Column Chunks, Statistics**
4. **Delta Table Snapshots and Metadata**
5. **Direct Lake Framing and Metadata Refresh**
6. **Column Loading and Transcoding**
7. **VertiPaq Dictionaries and Data Structures**
8. **Value Encoding versus Hash Encoding**
9. **VertiPaq Segments and Segment Elimination**
10. **Formula Engine and Storage Engine Responsibilities**
11. **xmSQL: Diagnostic and Observable Behavior**
12. **Column Residency, Caching, Memory Pressure, and Eviction**
13. **Direct Lake on OneLake vs. Direct Lake on SQL Endpoint**
14. **DirectQuery Fallback and Documented Conditions**

---

## Documentation Requirements

For each topic, document:

- **What it is** - Definition and purpose
- **Why it exists** - Business or technical rationale
- **Sequence of operations** - Step-by-step process flow
- **Inputs and outputs** - Data structures and transformations
- **Related components** - How it connects to other parts
- **Worked example** - Concrete illustration with sample data
- **Explicitly documented** - What Microsoft officially states
- **Observable behavior** - What can be verified through supported tools
- **Proprietary/inferred/undocumented** - What is internal or unclear

---

## Deliverables to Create

### 1. docs/research/direct-lake-architecture.md
Comprehensive technical reference covering all 14 topics and their relationships.

### 2. docs/research/technical-glossary.md
Glossary of terms with definitions, synonyms, and related concepts.

### 3. docs/research/query-execution-flow.md
Detailed flow diagram and explanation of Direct Lake query execution pipeline.

### 4. docs/research/sources.md
Bibliography of all sources with URLs, dates accessed, and relevance notes.

---

## Accuracy Requirements

✅ **Must Do:**
- Use Microsoft Learn as primary source
- Clearly label uncertain information
- Mark inferred behavior as such
- Distinguish educational simulation from actual implementation
- Include source citations with dates
- Explain what is proprietary or undocumented

❌ **Must NOT Do:**
- Invent internal implementation details
- Present conceptual diagrams as physical architecture
- Claim to know proprietary algorithms
- Copy Microsoft's code or implementation
- Make claims without source attribution
- Present guesses as facts

---

## Research Boundaries

**In Scope:**
- Publicly available Microsoft documentation
- Official Microsoft Learn modules
- Supported diagnostic tools (SQL Profiler, Query Trace, etc.)
- Community-documented observable behavior
- Academic papers on columnar compression (VertiPaq principles)

**Out of Scope:**
- Internal Microsoft source code
- Proprietary implementation details
- Reverse-engineered algorithms
- Undocumented API behaviors
- Microsoft employee internal documentation

---

## Quality Checks

Each topic must satisfy:

1. ✅ **Sourced** - Has at least one source with URL and date
2. ✅ **Defined** - Clear, concise explanation of what it is
3. ✅ **Reasoned** - Explains why it exists and its purpose
4. ✅ **Exemplified** - Includes a concrete worked example
5. ✅ **Bounded** - Clearly states what is documented vs. inferred
6. ✅ **Related** - Connected to other architecture components
7. ✅ **Integrated** - Fits into overall Direct Lake model

---

## Research Output Structure

### For Each Topic:

```markdown
## [Topic Name]

### Definition
[Clear, concise explanation]

### Why It Exists
[Business or technical rationale]

### Sequence of Operations
1. [Step 1]
2. [Step 2]
...

### Inputs and Outputs
- **Inputs:** [What goes in]
- **Outputs:** [What comes out]
- **Data Structures:** [Relevant formats]

### Related Components
- [Component A] - [relationship]
- [Component B] - [relationship]

### Worked Example
[Concrete example with sample data]

### Documented Behavior
[What Microsoft explicitly states]

### Observable Behavior
[What can be verified through tools]

### Proprietary/Inferred/Undocumented
[Clear notation of what is uncertain]

### Sources
- [URL] ([Date Accessed]) - [Relevance]
```

---

## Success Criteria

Stage 2 is complete when:

1. ✅ All 14 topics researched and documented
2. ✅ Four research documents created and reviewed
3. ✅ All claims have source attribution
4. ✅ Boundaries between documented and inferred clearly marked
5. ✅ Technical glossary complete
6. ✅ Query execution flow documented
7. ✅ No project code written
8. ✅ Security guidelines maintained
9. ✅ Ready for Stage 3 visual design
10. ✅ No unresolved questions blocking Stage 3

---

## Special Notes

### Microsoft Fabric Context
- Direct Lake is part of Microsoft Fabric
- Builds on Power BI Premium semantic models
- Requires OneLake (Fabric's data lake)
- Optional feature (not mandatory for all workspaces)

### Educational Simulation Boundaries
- Stage 2 establishes what we'll simulate
- Stage 6 will implement VertiPaq simulator (simplified)
- Stage 7 will implement DAX query simulator (educational)
- Always label [SIMULATION] where we simplify or abstract

### No Production Fabric Needed
- This project works completely locally
- Research uses only public Microsoft documentation
- Simulation uses synthetic data (Parquet/Delta files)
- No Fabric account or Azure subscription required

---

## Next Steps

1. ✅ Read development roadmap Stage 2 section (DONE)
2. ⏳ Research Microsoft Fabric Direct Lake using official sources
3. ⏳ Create docs/research/ directory structure
4. ⏳ Document all 14 topics with full detail
5. ⏳ Create technical glossary
6. ⏳ Create query execution flow documentation
7. ⏳ Create sources bibliography
8. ⏳ Review for accuracy and completeness
9. ⏳ Submit for approval before Stage 3

---

## Timeline Estimate

- Research phase: 60-90 minutes (comprehensive but focused)
- Documentation phase: 45-60 minutes (creating four markdown files)
- Review and refinement: 30-45 minutes
- **Total Stage 2 estimate:** 2.5-3 hours

---

## Stage 2 Status Summary

**Status:** 🔄 RESEARCH PHASE - IN PROGRESS  
**Progress:** 5% (planning complete, research beginning)  
**Blocker:** None  
**Ready to Proceed:** ✅ Yes  

---

## Researcher Orientation

You are acting as a Microsoft Fabric architecture researcher with these principles:

1. **Accuracy First** - Prefer "I don't know" to guessing
2. **Source Everything** - Every claim needs a citation
3. **Distinguish Levels** - Mark documented, observable, and inferred
4. **Educate Clearly** - Explain for beginners, intermediate, and advanced
5. **Respect Boundaries** - Don't claim knowledge of proprietary internals
6. **Stay Focused** - Don't over-engineer or add unnecessary detail
7. **Build For Stage 3** - Research should enable clear visual design

---

**Research Prepared By:** GitHub Copilot  
**Approved For:** Stage 2 Execution  
**Target Completion:** Stage 2 Research Phase  
