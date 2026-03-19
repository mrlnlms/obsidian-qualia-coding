# Qualia Coding — README Copy (Draft)

**Date:** 2026-03-03
**Purpose:** Ready-to-use copy for the GitHub README.md. Adapt formatting, add screenshots where indicated.
**Note:** This is a marketing draft in `.pm/`. The actual README lives at the project root.

---

# Qualia Coding

**Qualitative data analysis inside Obsidian — 7 data types, built-in analytics, free and local-first.**

Code markdown, PDFs, images, audio, video, CSV, and Parquet files with a unified coding workflow. Run MCA biplots, lag sequential analysis, and decision trees without leaving your vault. Your data stays as JSON in your vault. No subscription, no cloud, no lock-in.

`[SCREENSHOT: composite showing 4 engines — markdown with margin bars, PDF with shapes, audio waveform with regions, analytics MCA biplot]`

---

## Why Qualia Coding?

Qualitative research tools treat coding as a management task: import, tag, export. The thinking happens somewhere else.

Qualia Coding is built on a different premise: **coding is thinking**, and thinking should happen where your research already lives. Your coded data connects to your literature notes, your memos, your emerging theory — through the same graph, the same backlinks, the same vault.

### Grounded in Mixed Analysis Theory

The analytics engine is not a dashboard bolted onto a tagging tool. It is informed by **mixed analysis** — the analytical techniques that operate across the qualitative-quantitative boundary (Onwuegbuzie & Combs, 2010). Each of the 19 ViewModes maps to a level of the DIME model (Descriptive, Inferential, Measurement, Exploratory), operationalizing crossover analysis where quantitative techniques apply to qualitative coded data.

MCA biplots, chi-square tests, lag sequential analysis, CHAID decision trees, polar coordinates — these are not common in QDA tools. No free or commercial tool offers them built-in. The theoretical grounding comes from a 60-source literature review consolidated in a [design story](docs/pm/product/DESIGN-STORY.md) that traces how mixed analysis theory shaped every design decision.

---

## 7 Coding Engines

| Engine | What you code | How it works |
|--------|--------------|-------------|
| **Markdown** | Interview transcripts, field notes | Inline highlights with margin bars, per-code opacity blending, drag-resize handles |
| **PDF** | Scanned documents, articles, reports | Text selection + shape drawing (rect, ellipse, polygon), SVG overlay |
| **CSV** | Survey responses, structured data | AG Grid with cell-level segment coding, batch coding, CM6 editor inside cells |
| **Parquet** | Large datasets | Read-only via hyparquet — the only QDA tool in the world that codes Parquet |
| **Image** | Photographs, diagrams, screenshots | Fabric.js canvas with rect/ellipse/freeform polygon regions |
| **Audio** | Interview recordings, podcasts | WaveSurfer waveform with draggable regions, vertical lanes, minimap |
| **Video** | Screen recordings, observations | Video player + waveform, shared infrastructure with Audio |

All seven engines share the same codes, the same sidebar, and the same coding popover. Code a PDF, jump to a CSV, check an image — same workflow.

`[SCREENSHOT: coding popover showing code chips and memo field]`

---

## Built-in Analytics (19 Views)

No need to export to R or SPSS. Qualia includes a full analytics engine with 19 interactive views, organized by analytical depth:

### Descriptive
| View | What it shows |
|------|--------------|
| Dashboard | Overview of all codes across all engines |
| Frequency Bars | Code distribution across documents |
| Word Cloud | Term frequency with stop words (EN + PT) |
| Text Statistics | Readability, lexical richness (TTR) |
| Text Retrieval | Search and retrieve all segments for a code |

### Inferential
| View | What it shows |
|------|--------------|
| Chi-Square Tests | Statistical independence testing |
| **Lag Sequential Analysis** | Temporal code sequences with z-scores (Sackett, 1979) |

### Measurement (Crossover Analysis)
| View | What it shows |
|------|--------------|
| **MCA Biplot** | Multiple Correspondence Analysis via SVD — codes and documents projected onto 2D space |
| **MDS Map** | Multidimensional Scaling (Jaccard distance → Torgerson/Kruskal projection) |
| Co-occurrence Matrix | Which codes appear together (5 modes: absolute, %, Jaccard, Dice, presence) |
| Document-Code Matrix | The inter-respondent matrix — codes per document heatmap |

### Exploratory
| View | What it shows |
|------|--------------|
| **CHAID Decision Tree** | Chi-square splits with Bonferroni correction |
| **Polar Coordinates** | Prospective/retrospective activation/inhibition (Zinn angles) |
| Dendrogram + Silhouette | Hierarchical clustering with quality assessment |

### Visualization & Navigation
| View | What it shows |
|------|--------------|
| Network Graph | Force-directed code relationship visualization |
| Code Evolution | How codes change over sequence position |
| Temporal Analysis | Time-based patterns (timestamps) |
| Source Comparison | Cross-media triangulation — compare coding across text, PDF, audio, video, image |
| Code Overlap | Spatial co-localization of codes within documents |

**5 views are exclusive to Qualia** — no QDA tool (free or paid) offers MCA, MDS, Lag Sequential, Polar Coordinates, or CHAID built-in. Quality metrics (Kruskal stress, explained inertia, p-values, silhouette scores) are always visible — the researcher evaluates methodological adequacy, not just the chart.

`[SCREENSHOT: MCA biplot with code labels positioned on the plot]`

---

## Research Board

A freeform Fabric.js canvas for visual synthesis. Drag code cards, excerpts, sticky notes, snapshots, KPI cards, and cluster frames onto an infinite canvas. Connect ideas with arrows. Build your argument visually.

`[SCREENSHOT: research board with several node types arranged and connected]`

---

## Key Features

### Margin Bars (MAXQDA-style)
Color-coded bars in the margin show coding density at a glance. Each code gets its own bar. Dynamic labels with collision avoidance. Bidirectional hover between text and margin.

`[SCREENSHOT: markdown editor with margin bars showing 3-4 overlapping codes]`

### Per-Code Opacity Blending
When multiple codes overlap on the same text, their colors blend — making co-occurrence visible, not hidden. No more "last code wins" coloring.

### Unified Sidebar
A single Code Explorer (Code > File > Segment tree) and Code Detail view serve all 7 engines. Three detail modes: list, code-focused, and marker-focused.

### Shared Coding Popover
Every engine uses the same coding popover: toggle codes, write memos, navigate to sidebar. Consistent workflow whether you're coding a PDF or an audio file.

### 12-Color Auto-Palette
New codes automatically receive distinct colors from a perceptually balanced palette.

---

## Comparison

| Feature | Qualia Coding | NVivo | ATLAS.ti | MAXQDA | Quadro |
|---------|:---:|:---:|:---:|:---:|:---:|
| Price | Free | $118-1,800/yr | $51-670/yr | EUR 253-1,440/yr | Free |
| Inside Obsidian | Yes | No | No | No | Yes |
| Data types | 7 | 5 | 6 | 6 | 1 (MD only) |
| Built-in analytics | 19 views | Limited | Basic | Some | None |
| MCA / MDS / LSA / CHAID | Yes | No | No | No | No |
| Research Board | Yes | No | No | Partial | No |
| CSV / Parquet coding | Yes | No | No | No | No |
| Margin bars | Yes | No | No | Yes | No |
| Per-code blending | Yes | No | No | No | No |
| Local-first | Yes | Yes | Partial | Yes | Yes |
| Open source | Yes | No | No | No | Yes |

---

## Quick Start

1. **Install** — Community Plugins > Search "Qualia Coding" > Install > Enable
2. **Create a code** — Select text in any markdown file > Click "Code Selection" (or `Cmd+Shift+C`)
3. **Open sidebar** — Command palette > "Open Code Explorer"
4. **Try other engines** — Right-click any PDF, CSV, image, audio, or video file > "Open in ... Coding"
5. **Explore analytics** — Command palette > "Open Analytics"

---

## Data & Privacy

- All data stored as `data.json` in your vault's plugin directory
- **Nothing leaves your machine** — no cloud, no telemetry, no analytics
- Portable: copy your vault, your coding comes with it
- Auditable: `data.json` is plain JSON, readable by any tool
- Works with any sync method: iCloud, Syncthing, Git, Obsidian Sync

---

## Architecture

```
7 coding engines → shared CodeDefinitionRegistry → unified sidebar
                 → shared CodingPopover
                 → DataManager (in-memory + debounced save)
                 → Analytics (reads all 7 engines)
                 → Research Board (Fabric.js canvas)
```

28,234 lines of TypeScript. 108 source files. Single `main.js` bundle.

Built with: CodeMirror 6, AG Grid, Fabric.js, WaveSurfer.js, Chart.js, hyparquet, PapaParse, svd-js.

---

## Roadmap

- [ ] Code hierarchy (parent/child codes) — planned, ~200 LOC
- [ ] AI-assisted coding (local-first, privacy-preserving)
- [ ] Intercoder reliability (Cohen's kappa)
- [ ] REFI-QDA export (interoperability with NVivo/ATLAS.ti/MAXQDA)
- [ ] Case variables per document (mixed methods joint displays)

See [full roadmap](docs/ROADMAP.md) for all 20 planned features.

---

## Known Limitations

- Not yet listed in Obsidian Community Plugin Directory (submission in progress)
- No AI features yet (on roadmap as #1 priority)
- No intercoder reliability yet (on roadmap as #3 priority)
- No REFI-QDA export yet (on roadmap)
- Bundle size is ~2.1 MB (7 engines + dependencies; code splitting not possible on Obsidian)
- Single-user only (no real-time collaboration)

---

## License

MIT

---

## Acknowledgments

### Theoretical Foundations

Qualia Coding's analytics engine is grounded in **mixed analysis theory** — specifically the crossover mixed analysis framework (Onwuegbuzie & Combs, 2010), the quantitization-qualitization continuum (Sandelowski, Voils & Knafl, 2009), and the DIME analytical model. The theoretical research draws from ~60 sources consolidated into a personal literature review, with the *Routledge Reviewer's Guide to Mixed Methods Analysis* (Onwuegbuzie & Johnson, 2021) as a pivotal reference. For the full design journey, see the [Design Story](docs/pm/product/DESIGN-STORY.md).

### Design References

- **MAXQDA** — Margin panel with column allocation and label collision avoidance. The visual benchmark for professional QDA interaction.
- **Dovetail** — Popover-based coding menu with two-mode logic and progressive disclosure.
- **CodeMirror 6** — The decoration API that made "notes stay clean" technically feasible.

Built by a researcher, for researchers.
