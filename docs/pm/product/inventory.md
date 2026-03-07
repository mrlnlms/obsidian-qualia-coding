# Product Inventory — Qualia Coding

**Date**: 2026-03-03
**Version**: Pre-release (not yet listed in Obsidian Community Plugins)
**Codebase**: 108 TS files, 28,234 LOC, ~2.1 MB bundle

---

## Core Value Proposition

**Bridging qualitative coding with knowledge management — coding as thinking, not just tagging.** Qualitative data analysis that lives where your research thinking already happens (Obsidian), across 7 data types, for free.

## Target Users

1. **Academic researchers (PhD/postdoc)** — Social science, education, health doing dissertation or funded research
2. **Obsidian power users** — People already in Obsidian who want QDA without switching tools

## User Perception

**What users love most**:
- Multi-format coverage (7 engines — no other tool codes text, PDF, CSV, image, audio, video + analytics)
- Obsidian integration (coding inside the vault, alongside notes, links, graph view)
- Advanced analytics (17 ViewModes including MCA, MDS, LSA, Polar Coordinates — things only SPSS/R offer)

**Biggest weaknesses**:
- No AI features (manual coding feels slow vs competitors with AI suggestions)
- Not listed in Obsidian community (invisible to potential users)
- Learning curve / UX polish (complex plugin with 7 engines, unclear onboarding)

---

## Feature Inventory

### Coding Engines (7)

| Engine | LOC | Key Capabilities | Technical Moat | Debt |
|--------|-----|-----------------|----------------|------|
| **Markdown** | 4,189 | CM6 text coding, 5 extensions (state, hover, selection, margin panel), drag-resize handles, 12-color palette | MAXQDA-style margin bars (539 LOC collision avoidance), per-code opacity blending | Low |
| **PDF** | 4,485 | Text selection + shape drawing (rect/ellipse/polygon), SVG overlay, per-code opacity blending, margin panel | Dual geometry path (chars-level + DOM Range), external overlay preventing clipping | Low |
| **CSV** | 1,666 | AG Grid + CM6 segment editor, row/segment markers, batch coding, Parquet read-only | CM6-inside-AG-Grid architecture, hyparquet zero-dep Parquet reader | Low |
| **Image** | 2,127 | Fabric.js canvas, rect/ellipse/freeform polygon, normalized 0-1 coords | Canvas-based visual coding (not transcript-based like competitors) | Med — no rename tracking |
| **Audio** | 1,037 | WaveSurfer regions, vertical lanes, minimap, memo per marker | Greedy lane algorithm, percentage-based minimap | Low |
| **Video** | 1,038 | Shared WaveSurfer with Audio, HTML5 video + waveform | Media element overload pattern | Low |
| **Analytics** | 11,177 | 17 ViewModes, 6 computation engines, Research Board (Fabric.js) | MCA/MDS/LSA/Polar/CHAID — no QDAS has these built-in | Med — 5,907 LOC monolith |

### Core Infrastructure

| Module | LOC | Capability | Debt |
|--------|-----|-----------|------|
| DataManager | 161 | In-memory state + debounced save (500ms), section-based access | Low |
| CodeDefinitionRegistry | 187 | Shared codebook, 12-color auto-palette | Low |
| CodingPopover | 298 | Unified coding menu for all 5 coding engines | Low |
| UnifiedModelAdapter | 127 | Merge N engine models → 1 sidebar interface | Low |
| Unified Sidebar (Explorer + Detail) | 361 | Single views for all engines, 3-level tree, 3 detail modes | Low |
| FileInterceptor | 104 | Centralized file open + rename tracking | Low |
| Shared Media | 492 | WaveSurfer lifecycle, region rendering, time formatting | Low |
| BaseCodingMenu | 393 | Base menu builder (chips, buttons, memo) | Low |
| SettingTab | 123 | Plugin settings (12 user-facing) | Low |

### Analytics: 17 ViewModes

| ViewMode | Unique to Qualia? |
|----------|-------------------|
| Dashboard, Frequency Bars, Co-occurrence Matrix, Network Graph, Doc-Code Matrix, Code Evolution, Text Retrieval, Word Cloud | No (competitors have variants) |
| **MCA Biplot** | **Yes** — no QDAS has built-in MCA |
| **MDS Map** | **Yes** — no QDAS has built-in MDS |
| Temporal Analysis, Text Statistics | Partial |
| Dendrogram + Silhouette | Partial (silhouette rare) |
| **Lag Sequential Analysis** | **Yes** — no QDAS has built-in LSA |
| **Polar Coordinates** | **Yes** — Sackett 1979, no QDAS equivalent |
| Chi-Square Tests | Partial |
| **Decision Tree (CHAID)** | **Yes** — no QDAS has built-in CHAID |

### Analytics: 6 Computation Engines

| Engine | LOC | Unique? |
|--------|-----|---------|
| statsEngine (LSA, Polar, Chi-Square, text stats) | 949 | Yes (LSA + Polar) |
| clusterEngine (hierarchical, Jaccard, dendrogram, silhouette) | 266 | No |
| mcaEngine (MCA via SVD) | 211 | Yes |
| mdsEngine (Torgerson MDS, Kruskal stress-1) | 265 | Yes |
| wordFrequency (EN + PT stop words) | 140 | No |
| decisionTreeEngine (CHAID, Bonferroni, Klecka's tau) | 314 | Yes |

### Research Board

Fabric.js canvas, 6 node types (sticky, snapshot, excerpt, codeCard, kpiCard, clusterFrame), arrows, pan/zoom, persistence to `board.json`. No QDAS competitor has equivalent.

---

## Commands (12)

| Command | Shortcut | Engine |
|---------|----------|--------|
| Create Code Marker | Cmd+Shift+C | Markdown |
| Open Code Explorer | — | Sidebar |
| Open Code Detail | — | Sidebar |
| Clear All Markers | — | Markdown |
| Undo PDF Coding | — | PDF |
| Open CSV Coding | — | CSV |
| Open Image Coding | — | Image |
| Open Audio Coding | — | Audio |
| Open Video Coding | — | Video |
| Open Analytics | — | Analytics |
| Refresh Analytics | — | Analytics |
| Open Research Board | — | Analytics |

## Settings (12 user-facing)

- **Markdown (6)**: Default color, marker opacity, show handles on hover, show menu on selection, show in right-click, show ribbon button
- **Image (1)**: Auto-open images in coding view
- **Audio (3)**: Default zoom, region opacity, show labels
- **Video (4)**: Default zoom, region opacity, show labels, video fit
- **Sidebar (1)**: Auto-reveal on segment click

## File Interception

| Extension | Engine | Method |
|-----------|--------|--------|
| `.md` | Markdown | `registerEditorExtension()` (global) |
| `.pdf` | PDF | `active-leaf-change` instrumentation |
| `.csv`, `.parquet` | CSV | `registerExtensions()` |
| Images | Image | `registerFileIntercept()` (setting-gated) |
| Audio | Audio | `registerFileIntercept()` |
| Video | Video | `registerFileIntercept()` |

## Navigation Events (9)

| Event | Engine | Action |
|-------|--------|--------|
| `codemarker:label-click` | Markdown | → marker-focused detail view |
| `codemarker:code-click` | Markdown | → code-focused detail view |
| `codemarker-tooltip-mouseenter/leave` | Markdown | Tooltip hover bridge |
| `qualia-csv:navigate` | CSV | Ensure row visible + flash |
| `qualia-csv:detail` | CSV | Trigger detail reveal |
| `qualia-image:navigate` | Image | Highlight region + scroll |
| `qualia-audio:navigate` | Audio | Seek + scroll |
| `qualia-video:navigate` | Video | Seek + scroll |

---

## External Dependencies (9 production)

| Dependency | Version | Used By | Size Impact |
|------------|---------|---------|-------------|
| ag-grid-community | ^33.0.0 | CSV | Large (~500KB) |
| fabric | ^6.9.1 | Image, Board | Large (~400KB) |
| chart.js | ^4.4.0 | Analytics | Medium (~200KB) |
| wavesurfer.js | ^7.0.0 | Audio, Video | Medium (~100KB) |
| date-fns | ^4.1.0 | Analytics | Medium (~50KB) |
| papaparse | ^5.4.1 | CSV | Small (~15KB) |
| chartjs-chart-wordcloud | ^4.4.5 | Analytics | Small (~10KB) |
| hyparquet (+compressors) | ^1.25.1 | CSV (Parquet) | Small (~9KB) |
| svd-js | ^1.1.1 | Analytics (MCA, MDS) | Tiny (~5KB) |

---

## Technical Moats (Hard to Replicate)

| Moat | Why Defensible |
|------|---------------|
| **7-engine unified architecture** | 28K LOC, 108 files — massive scope barrier |
| **CM6-inside-AG-Grid** | Novel integration: markdown's 5 CM6 extensions reused in CSV cells |
| **5 exclusive analytics views** | MCA, MDS, LSA, Polar, CHAID — require domain expertise (Sackett 1979, SVD math) |
| **MAXQDA-style margin panel** | 539 LOC collision avoidance with RLL dynamic labels |
| **Per-code opacity blending** | Unique PDF/Markdown decoration — no QDAS does this |
| **Research Board** | Fabric.js freeform canvas with 6 typed nodes |
| **Parquet coding** | Only QDA tool in the world coding Parquet files |
| **Local-first, file-based** | data.json — no proprietary database, no vendor lock-in |

## Technical Debt

| Area | Severity | Issue |
|------|----------|-------|
| `analyticsView.ts` | Medium | 5,907 LOC monolith — 17 ViewModes in one file |
| Image rename tracking | Medium | No file rename handler — markers break on rename |
| Bundle size | Low | 2.1 MB is large but code splitting impossible on Obsidian |
| Stop words | Low | Only EN + PT — no multilingual support |
| Settings surface | Low | 12 settings — many behaviors are hardcoded constants |
| PDF undo | Low | Stack-based undo exists but limited to last action |

## Architecture Constraints

| Constraint | Impact | Status |
|------------|--------|--------|
| Single `main.js` bundle | Can't lazy-load engines | Confirmed impossible (Obsidian platform) |
| No reactive framework | Verbose DOM code, hard to maintain views | Manual DOM management |
| Single `data.json` | All engine data in one file | DataManager mitigates concurrency |
| CM6 global extensions | Only markdown can call `registerEditorExtension()` | CSV uses standalone EditorView |
| No web workers | Analytics blocks main thread | Future consideration |
| `main.ts` ~95 LOC | Must stay minimal | Currently healthy |

---

## Data Model Summary

```
data.json
├── registry.definitions: Record<codeName, CodeDefinition>
├── markdown.markers: Record<fileId, Marker[]>
├── markdown.settings: CodeMarkerSettings
├── csv.segmentMarkers: SegmentMarker[]
├── csv.rowMarkers: RowMarker[]
├── image.markers: ImageMarker[]
├── image.settings: { autoOpenImages, fileStates }
├── pdf.markers: PdfMarker[]
├── pdf.shapes: PdfShapeMarker[]
├── audio.files[]: { path, markers: AudioMarker[] }
├── audio.settings: AudioSettings
├── video.files[]: { path, markers: VideoMarker[] }
└── video.settings: VideoSettings

board.json (separate)
└── Fabric.js canvas objects + positions
```

7 marker types: Markdown `Marker`, PDF `PdfMarker`, PDF `PdfShapeMarker`, CSV `RowMarker`, CSV `SegmentMarker`, `ImageMarker`, `AudioMarker`/`VideoMarker` (shared `MediaMarker`).

---

## CSS (4,139 LOC, 86 KB)

Namespaced by engine — zero collisions:
- `codemarker-` (Markdown), `codemarker-pdf-` (PDF), `csv-` (CSV), `codemarker-image-`/`image-coding-` (Image), `codemarker-media-` (shared Audio/Video), `codemarker-audio-` (Audio), `codemarker-video-` (Video), `codemarker-analytics-` (Analytics)

---

*Source: Codebase scan (108 files), CLAUDE.md, ROADMAP.md, user interview 2026-03-03*
