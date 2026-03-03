# Qualia Coding

Qualitative data analysis inside Obsidian. Code text, PDFs, images, spreadsheets, audio, and video — all from one plugin, with unified sidebar and cross-format analytics.

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

### Unified code system

- One set of codes shared across all formats
- Create, rename, and color-code your codes from any engine
- Codes assigned to a PDF marker show up alongside markdown highlights in the same sidebar

### Sidebar views

- **Code Explorer** — tree view of all codes across all files and formats, with search and filter
- **Code Detail** — three display modes: list, code-focused, and marker-focused, with memo editing and color overrides

### 19 analytics views

| Category | Views |
|---|---|
| **Descriptive** | Dashboard, Frequency, Co-occurrence matrix |
| **Visual** | Force-directed graph, Word cloud |
| **Exploratory** | Document-code matrix, Source comparison, Code overlap |
| **Multivariate** | MCA biplot, MDS scatter (2D/3D), Dendrogram |
| **Sequential** | Evolution over time, Lag sequential analysis, Polar coordinates |
| **Inferential** | Chi-square independence test, Decision tree |
| **Retrieval** | Full-text search with code filtering, Text statistics |

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
3. Toggle codes on/off, add a memo

### Coding other formats

- Open a PDF, image, CSV, audio, or video file
- The plugin automatically opens it in the coding view
- Select regions (text, shapes, time ranges, rows) and assign codes the same way

### Exploring codes

- Open the **Code Explorer** from the sidebar to see all codes across all files
- Click a code to see its detail view with all associated segments
- Use the search bar to filter

### Analytics

- Open the command palette and run **Qualia Coding: Open Analytics**
- Choose from 19 visualization modes
- All engines feed into the same analytics — cross-format analysis works out of the box

### Research Board

- Open the command palette and run **Qualia Coding: Open Research Board**
- Use the toolbar to add sticky notes, code cards, and arrows
- Drag excerpts from the sidebar onto the board

## Settings

| Setting | Description |
|---|---|
| Default color | Initial highlight color for new codes |
| Marker opacity | Transparency of highlights (0–1) |
| Show handles on hover | Display drag handles on marker edges |
| Show menu on selection | Automatically show coding menu when text is selected |
| Show menu on right-click | Show coding menu on right-click |
| Show ribbon button | Display the Qualia Coding icon in the ribbon |
| Auto-reveal on segment click | Scroll to marker when clicked in sidebar |

## Documentation

| Doc | Question it answers |
|-----|---------------------|
| [`CLAUDE.md`](CLAUDE.md) | How does the code work right now? (AI context) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Why is it built this way? |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What's planned but not yet built? (includes market research gaps) |
| [`docs/research/`](docs/research/) | Competitive benchmark, technical evaluation, product brainstorm |
| [`docs/TECHNICAL-PATTERNS.md`](docs/TECHNICAL-PATTERNS.md) | How do I fix this weird bug? |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | How do I contribute, port, or test? |
| [`docs/HISTORY.md`](docs/HISTORY.md) | How did we get here? |
| [`docs/PREHISTORY.md`](docs/PREHISTORY.md) | Where did the idea come from? |

## License

[MIT](LICENSE)
