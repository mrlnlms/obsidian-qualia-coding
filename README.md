# Qualia Coding

Mixed-methods qualitative data analysis, inside Obsidian. Code text, PDFs, images, spreadsheets, audio, video, and Parquet — one codebook, 20 built-in analytics, REFI-QDA round-trip, your vault stays your data.

For researchers, UX professionals, students, and anyone who'd rather not pay $600/year for a desktop CAQDAS that locks data inside a proprietary container.

## Why Qualia Coding

- **6 formats, one codebook.** Highlight a markdown paragraph, draw a region on a PDF, mark a 12-second video clip, and tag a CSV row — all with the same code. Cross-format analytics work out of the box.
- **20 analytics views built-in.** Frequency, co-occurrence, MCA, MDS 2D/3D, dendrogram, lag sequential, polar coordinates, chi-square, decision trees, relations network, word clouds. No competitor offers this natively.
- **Mixed methods, first-class.** Case Variables (typed properties per file), magnitude coding (nominal / ordinal / continuous), and code groups (flat N:N tags) are designed in, not bolted on.
- **Vault = your data.** Markers live in the same Obsidian vault as your sources. No proprietary container. Sync with iCloud, Git, Syncthing, whatever. Switch tools without "exporting your project."
- **REFI-QDA round-trip.** Export QDPX to NVivo / ATLAS.ti / MAXQDA / Dedoose, *and import their projects back into Qualia.* Round-trip is verified, not just one-way export.
- **Parquet support.** The only CAQDAS that opens columnar data files. Useful for survey exports (Qualtrics) and research databases.
- **Free and open source.** MIT licensed. No subscription, no seat license, no AI paywall.

## Annotation engines

| Format | What you can do |
|---|---|
| **Markdown** | Highlight text spans in the editor, MAXQDA-style margin panel, drag-resize handles |
| **PDF** | Highlight text selections (cross-page), draw rectangles, polygons, freehand shapes |
| **Image** | Draw rectangular and polygonal regions on PNG, JPG, SVG, WebP, GIF |
| **CSV / Parquet** | Code individual cell text or entire rows in a spreadsheet grid (Parquet is read-only) |
| **Audio** | Time-bounded regions on a waveform — MP3, WAV, OGG, FLAC, M4A |
| **Video** | Same as audio, with synchronized video playback — MP4, WebM |

Toggle coding mode on/off per file (PDF / Image / Audio / Video) — read your sources without coding overhead, then enable when you want to annotate.

## Codebook

Hierarchical when you want structure, flat tags when you don't.

- **Parent/child codes** — unlimited nesting, drag-and-drop. Parent codes aggregate child counts (Braun & Clarke style)
- **Code Groups** — flat N:N layer for cross-cutting dimensions (e.g. "Affective", "RQ1", "Wave 2"). One code can belong to many groups. Filters Analytics
- **Virtual folders** — purely cosmetic organization, no analytical effect
- **Visibility toggles** — hide a code globally, or only inside a specific file (without deleting)
- **Merge codes** — combine N codes with audit trail
- **Smart Codes** — saved queries that match markers dynamically. Predicates combine codes, case variables, magnitude, folders, groups, engine type, relations, and nested Smart Codes via AND/OR/NOT. First-class in Code Explorer, Analytics, and QDPX export
- **Virtual scrolling** — scales to thousands of codes

## Mixed methods

- **Case Variables** — typed per-file properties (age, gender, experimental condition). Auto-detected types (number / date / checkbox / text). Side panel + popover. Filters Analytics. Full QDPX round-trip
- **Magnitude coding** — intensity / direction / evaluation per segment (nominal, ordinal, continuous). Closed picker prevents typos
- **Code relations** — theoretical assertions between codes ("Frustration causes Abandonment") plus segment-anchored interpretations. Free-form labels with autocomplete
- **Memos** — free-text notes on any marker

## Analytics — 20 views

| Category | Views |
|---|---|
| Descriptive | Dashboard · Frequency · Co-occurrence matrix |
| Visual | Force-directed graph · Word cloud · Relations network |
| Exploratory | Document-code matrix · Source comparison · Code overlap |
| Multivariate | MCA biplot · MDS scatter (2D / 3D) · Dendrogram |
| Sequential | Evolution over time · Lag sequential · Polar coordinates |
| Inferential | Chi-square · Decision tree |
| Retrieval | Full-text search · Text statistics |

All views accept the same filters: sources, codes, minimum frequency, **groups**, **case variables**. Export any view as CSV.

**Smart Codes** appear alongside regular codes in Frequency, Co-occurrence, Evolution, Lag Sequential, Polar, Code × Metadata, and the Memo View — saved queries become first-class analytic objects.

The **Relations network** view shows code-level relations (solid edges) and segment-level relations (dashed edges) with thickness proportional to frequency.

## Research Board

A freeform canvas for synthesis:

- Sticky notes · code cards (with live statistics) · excerpt nodes pulled from any marker · KPI cards · arrow connections · freehand drawing · cluster frames
- **Export to SVG** (vector — for papers and slides) or **PNG** (retina — for web and decks)

## Interoperability

- **Export QDPX** — full project: sources + segments + memos + case variables + groups. Compatible with ATLAS.ti, NVivo, MAXQDA, Dedoose, and any REFI-QDA tool
- **Export QDC** — codebook only (hierarchy, colors, descriptions)
- **Import QDPX / QDC** — bring projects from other QDA tools. Source files extracted to the vault, codes and segments mapped to Qualia engines
- **Tabular CSV zip** — relational flat files (segments, code_applications, codes, case_variables, relations, groups) with an embedded README and R/tidyverse + Python/pandas snippets. For when you want to run stats outside the plugin
- **Per-view CSV** — every Analytics view exports its own table

## Under the hood

A few technical choices worth knowing about:

- **100% local.** No telemetry, no cloud calls, no API keys required. Works fully offline. Your data never leaves the vault
- **REFI-QDA 1.0 spec compliant.** QDPX export uses an `xmlns:qualia` extension namespace to preserve Qualia-specific metadata (custom colors, group descriptions) without breaking other tools' parsers
- **CodeMirror 6 native.** Markdown highlights are real CodeMirror decorations, not DOM overlays. The margin panel is a custom `ViewPlugin` with column-resolved label layout — same UX as MAXQDA's
- **Per-engine viewers, no shared state.** PDF (pdf.js), Image (Fabric.js), Audio/Video (WaveSurfer.js), CSV/Parquet (AG Grid Community + hyparquet WASM). Each engine is self-contained — adding a format doesn't touch the others
- **Incremental analytics cache.** Dirty flags per engine; analytics modes recompute only the affected slice. Stays fast on large projects
- **2,700+ unit tests** (Vitest + jsdom) covering pure helpers, engine models, registry CRUD, REFI-QDA round-trip, tabular export, Smart Codes evaluator/cache, and analytics consolidators
- **TypeScript strict** end-to-end, with ambient types for Obsidian internals where needed
- **No build-time secrets, no runtime servers.** The entire plugin is the three files in your `.obsidian/plugins/qualia-coding/` folder

## Installation

> Qualia Coding is **pre-alpha (0.x)** — distributed via BRAT for testing with selected researchers. Submission to the Obsidian Community Plugins directory is planned.

### Via BRAT (recommended while pre-alpha)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. **BRAT settings → Add Beta Plugin** → enter `mrlnlms/obsidian-qualia-coding`
3. Enable **Qualia Coding** in Community Plugins

### Manual

1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/mrlnlms/obsidian-qualia-coding/releases)
2. Place inside `your-vault/.obsidian/plugins/qualia-coding/`
3. Enable in **Settings → Community plugins**

### From Community Plugins (after approval)

Once approved, **Settings → Community plugins → Browse → Qualia Coding → Install → Enable**.

> Desktop only. Requires Obsidian 1.5.0+.

## Usage

**Coding text** — Select text in any Markdown file. The coding menu appears — type a code name or pick an existing one. Toggle codes on/off, add a memo, set magnitude, declare relations.

**Coding other formats** — Open a PDF, image, CSV, audio, or video file. The plugin opens it in the coding view (toggleable per file). Select regions and assign codes the same way.

**Quick Code** — `Cmd+Shift+C` opens a fuzzy search modal to apply codes without a mouse.

**Codebook Panel** — Sidebar. Drag codes to create hierarchies, right-click for rename / merge / delete / move-to-folder. Toggle merge mode in the toolbar.

**Code Explorer** — Sidebar tree of every code across every file. Search, filter, click to open detail.

**Case Variables** — Open from sidebar or command palette. Add typed properties per file. Filter Analytics by these.

**Analytics** — Command palette → **Open Analytics**. Pick from 20+ modes. All filters apply globally.

**Research Board** — Command palette → **Open Research Board**. Drag excerpts from sidebar onto the canvas.

**Export / Import** — Command palette: `Export project (QDPX)`, `Export codebook (QDC)`, `Export codes as tabular data`, `Import project (QDPX)`, `Import codebook (QDC)`. Also accessible from the Analytics toolbar.

## Settings

| Setting | Description |
|---|---|
| Default color | Initial highlight color for new codes |
| Marker opacity | Transparency of highlights (0–1) |
| Show handles on hover | Display drag handles on marker edges |
| Show menu on selection | Auto-show coding menu on text selection |
| Show menu on right-click | Show coding menu on right-click |
| Show ribbon button | Display the Qualia Coding icon in the ribbon |
| Show magnitude in popover | Display magnitude picker in the coding popover |
| Show relations in popover | Display relations section in the coding popover |
| Open toggle in a new tab | Open coding view in a new tab when toggling on |
| Auto-open coding view | Per-engine toggle: enable PDF / Image / Audio / Video coding view by default |
| Parquet size warning (MB) | Show a banner before loading large Parquet files |
| CSV size warning (MB) | Show a banner before loading large CSV files |

## In development

- **Intercoder reliability** — Cohen's kappa and Krippendorff's alpha to measure agreement between multiple coders on the same dataset. Required by peer reviewers in academic publishing, and a prerequisite for collaborative coding workflows in Qualia.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full feature roadmap.

## Documentation

| Doc | Question it answers |
|-----|---------------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Why is it built this way? |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What's planned next? (includes market research gaps) |
| [`docs/TECHNICAL-PATTERNS.md`](docs/TECHNICAL-PATTERNS.md) | How do I fix this weird bug? |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | How do I contribute, port, or test? |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | What technical debt is open? |

## License

[MIT](LICENSE)
