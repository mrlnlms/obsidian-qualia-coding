# Qualia Coding

Qualitative data analysis inside Obsidian. Code text, PDFs, images, spreadsheets, audio, and video — all from one plugin, with hierarchical codebook, cross-format analytics, and REFI-QDA interoperability.

Built for researchers, UX professionals, and anyone doing qualitative analysis who wants to keep everything in one place.

## Features

### 6 annotation engines

| Format | What you can do |
|---|---|
| **Markdown** | Highlight text spans in the editor, MAXQDA-style margin panel, drag handles for resizing |
| **PDF** | Highlight text selections (including cross-page), draw rectangles, polygons, and freehand shapes |
| **Image** | Draw rectangular and polygonal regions on any image format (PNG, JPG, SVG, WebP, etc.) |
| **CSV / Parquet** | Code individual cell text or entire rows in a spreadsheet grid (Parquet read-only) |
| **Audio** | Create time-bounded regions on a waveform (MP3, WAV, OGG, FLAC, etc.) |
| **Video** | Same as audio, with synchronized video playback (MP4, WebM) |

### Hierarchical codebook

- **Parent/child codes** — unlimited nesting depth, drag-and-drop to reorganize
- **Virtual folders** — organize codes without affecting analysis (folders have no analytical meaning)
- **Merge codes** — combine N codes into one with audit trail, via context menu or drag-and-drop merge mode
- **Virtual scrolling** — scales to thousands of codes without performance degradation
- **Codebook Panel** — unified 3-level navigation: Codebook → Code → Segment, with breadcrumbs

### Magnitude coding

- Assign intensity/direction/evaluation values to coded segments (nominal, ordinal, continuous)
- Define allowed values per code — strict picker ensures data integrity
- Ready for mixed methods export (R, Python, SPSS)

### Code relations

- **Code-level relations** — theoretical assertions between codes ("Frustration causes Abandonment")
- **Segment-level relations** — data-anchored interpretations on specific segments
- Free-form labels with autocomplete from project history
- Declare relations from Detail View, coding popover, or marker side panel

### REFI-QDA interoperability

- **Export QDC** — share your codebook (codes, hierarchy, colors, descriptions) with any QDA tool
- **Export QDPX** — full project export with sources, coded segments, and memos. Compatible with ATLAS.ti, NVivo, MAXQDA, Dedoose, and all REFI-QDA compliant tools
- **Import QDC/QDPX** — bring projects from other QDA tools into Obsidian. Source files extracted to vault, codes and segments mapped to Qualia engines
- Optional embedding of source files in the archive for fully portable exports

### Unified code system

- One set of codes shared across all formats
- Create, rename, and color-code your codes from any engine
- Codes assigned to a PDF marker show up alongside markdown highlights in the same sidebar
- Fuzzy search modal for quick code application (Cmd+Shift+C)

### Sidebar views

- **Code Explorer** — tree view of all codes across all files and formats, with search and filter
- **Code Detail** — three display modes: list, code-focused, and marker-focused, with memo editing, magnitude, relations, and color overrides

### 20 analytics views

| Category | Views |
|---|---|
| **Descriptive** | Dashboard, Frequency, Co-occurrence matrix |
| **Visual** | Force-directed graph, Word cloud, Relations network |
| **Exploratory** | Document-code matrix, Source comparison, Code overlap |
| **Multivariate** | MCA biplot, MDS scatter (2D/3D), Dendrogram |
| **Sequential** | Evolution over time, Lag sequential analysis, Polar coordinates |
| **Inferential** | Chi-square independence test, Decision tree |
| **Retrieval** | Full-text search with code filtering, Text statistics |

The **Relations network** view shows code-level relations (solid edges) and segment-level relations (dashed edges) with thickness proportional to frequency. Toggle between "Code-level" and "Code + Segments" modes.

### Research Board

A freeform canvas for synthesizing findings:

- Sticky notes with color selection
- Code cards with statistics
- Excerpt nodes pulled from any marker
- KPI cards for custom metrics
- Arrow connections between nodes
- Freehand drawing
- Cluster frames for grouping

## Installation

### From Community Plugins

1. Open **Settings → Community plugins → Browse**
2. Search for **Qualia Coding**
3. Click **Install**, then **Enable**

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder `your-vault/.obsidian/plugins/qualia-coding/`
3. Place the three files inside
4. Enable the plugin in **Settings → Community plugins**

## Usage

### Coding text

1. Select text in any Markdown file
2. A menu appears — type a code name or pick an existing one
3. Toggle codes on/off, add a memo, set magnitude, declare relations

### Coding other formats

- Open a PDF, image, CSV, audio, or video file
- The plugin automatically opens it in the coding view
- Select regions (text, shapes, time ranges, rows) and assign codes the same way

### Organizing your codebook

- Open the **Codebook Panel** from the sidebar
- Drag codes to create parent/child hierarchies
- Right-click for context menu: rename, add child, merge, move to folder, set magnitude, delete
- Toggle merge mode in the toolbar to combine codes by dragging one onto another

### Exploring codes

- Open the **Code Explorer** from the sidebar to see all codes across all files
- Click a code to see its detail view with all associated segments
- Use the search bar to filter

### Analytics

- Open the command palette and run **Qualia Coding: Open Analytics**
- Choose from 20 visualization modes
- All engines feed into the same analytics — cross-format analysis works out of the box

### Export / Import

- **Export:** command palette → "Export project (QDPX)" or "Export codebook (QDC)"
- **Import:** command palette → "Import project (QDPX)" or "Import codebook (QDC)"
- Also accessible from the analytics toolbar

### Research Board

- Open the command palette and run **Qualia Coding: Open Research Board**
- Use the toolbar to add sticky notes, code cards, and arrows
- Drag excerpts from the sidebar onto the board

## Settings

| Setting | Description |
|---|---|
| Default color | Initial highlight color for new codes |
| Marker opacity | Transparency of highlights (0-1) |
| Show handles on hover | Display drag handles on marker edges |
| Show menu on selection | Automatically show coding menu when text is selected |
| Show menu on right-click | Show coding menu on right-click |
| Show ribbon button | Display the Qualia Coding icon in the ribbon |
| Auto-reveal on segment click | Scroll to marker when clicked in sidebar |
| Show magnitude in popover | Display magnitude picker in the coding popover |
| Show relations in popover | Display relations section in the coding popover |

## Documentation

| Doc | Question it answers |
|-----|---------------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Why is it built this way? |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What's planned but not yet built? (includes market research gaps) |
| [`docs/research/`](docs/research/) | Competitive benchmark, technical evaluation, product brainstorm |
| [`docs/TECHNICAL-PATTERNS.md`](docs/TECHNICAL-PATTERNS.md) | How do I fix this weird bug? |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | How do I contribute, port, or test? |
| [`docs/HISTORY.md`](docs/HISTORY.md) | How did we get here? |
| [`docs/PREHISTORY.md`](docs/PREHISTORY.md) | Where did the idea come from? |

## License

[MIT](LICENSE)
