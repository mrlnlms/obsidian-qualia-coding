# Changelog

All notable changes to Qualia Coding will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-29 — Pre-alpha

First public release. Pre-alpha — distributed via [BRAT](https://github.com/TfTHacker/obsidian42-brat) for testing with selected researchers. Expect rough edges.

### Coding (multi-modal)

- Text (markdown) coding with margin bars, drag handles, hover popover
- PDF coding (fabric.js viewer) — text segments + shape regions, round-trip via QDPX
- CSV/Parquet coding (ag-grid) — segment markers (cell text spans) + row markers (whole rows)
- Image coding (fabric.js) — shape regions with normalized coords
- Audio coding (WaveSurfer) — time regions
- Video coding (HTML5 video) — time regions

### Codebook

- Hierarchical codes with `parentId` (theme hierarchy à la NVivo / Braun & Clarke)
- Virtual folders (organizational, no analytical impact)
- Code Groups — flat N:N membership orthogonal to hierarchy (Atlas.ti / MAXQDA pattern)
- Magnitude scaling on coding application (nominal / ordinal / continuous)
- Relations between codes — typed labels, directed/undirected, with memos (theory-building)
- Memos as first-class on codes, groups, relations, and markers
- Drag-drop reorganization, multi-select + bulk operations, advanced merging with reactive 4-section preview

### Analytics (20+ modes)

- Frequency, co-occurrence, evolution, sequential, inferential (χ²), text analysis, network
- Code × Metadata (heatmap codes × Case Variables with χ² per code)
- Codebook Timeline (audit log visualization, day/week/month buckets)
- Analytic Memo View (editorial hub aggregating memos from all 4 entities)
- Multi-tab xlsx export
- Tabular CSV zip export (R / Python / BI ready)

### Case Variables (mixed methods)

- Typed properties per file (number, date, datetime, checkbox, text)
- Inline editor in popover and side panel
- Filtering across analytics
- Round-trip in QDPX

### Research Board

- Free-form Excalidraw-style canvas with sticky notes, snapshots, code cards, excerpts, KPI cards, cluster frames
- Drag-drop codes from codebook tree to board
- Live sync with registry (color/name/count)
- SVG/PNG export

### Interoperability

- REFI-QDA round-trip (QDC + QDPX) with Atlas.ti, NVivo, MAXQDA
- Open standard, file-based — vault is your data, zero lock-in

### Audit log

- Central log of codebook decisions (created/renamed/edited/absorbed/merged/deleted)
- 60s coalescing for description/memo edits
- Soft-delete reversible per entry
- Markdown export

### Known limitations (pre-alpha)

- Desktop only (mobile not supported)
- HEIC / TIFF not supported (Electron limitation — convert externally first)
- CSV markers don't export via REFI-QDA (format limitation; use Tabular CSV zip instead)
- Markers can become orphan if source file is significantly mutated externally

### Install (BRAT)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. BRAT settings → Add Beta Plugin → `mrlnlms/obsidian-qualia-coding`
3. Enable Qualia Coding in Community Plugins
