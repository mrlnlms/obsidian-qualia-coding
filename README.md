# CodeMarker v2

Qualitative text coding plugin for [Obsidian](https://obsidian.md), inspired by professional QDA tools like MAXQDA and ATLAS.ti.

Select any text, assign codes, and build a structured analysis — all without leaving your notes. Your markdown files stay clean; all annotations live in the plugin's data layer.

---

## What is Qualitative Coding?

Qualitative coding is the process of labeling passages of text with descriptive tags ("codes") to identify themes, patterns, and categories in your data. It's widely used in academic research, UX research, journalism, and content analysis.

CodeMarker brings this workflow directly into Obsidian, so your research notes, interview transcripts, and field notes can be coded in the same place where you write and think.

---

## Features

### Text Coding

- **Select & code**: Select any text and assign one or more codes to it
- **Multi-code markers**: A single text passage can carry multiple codes simultaneously
- **Toggle codes**: Quick on/off toggles for each code in the floating menu
- **Smart overlap**: When markers overlap, the plugin intelligently resolves which one to interact with (smallest marker wins for nested, rightmost start wins for partial overlap)
- **Drag-resize handles**: Adjust marker boundaries directly in the editor by dragging handles that appear on hover

### Code Management

- **Code definitions**: Each code has a persistent identity with a name, color, and optional description
- **Auto color palette**: 12 visually distinct colors are assigned automatically as you create codes
- **Create codes inline**: Add new codes directly from the coding menu without interrupting your flow
- **Custom colors**: Override the auto palette with any color via the color picker

### Margin Panel (MAXQDA-style)

- **Colored bars**: Each coded passage is represented by a colored vertical bar in the left margin, one per code
- **Labels**: Code names appear centered on their bars with smart collision avoidance
- **Bidirectional hover**: Hover a bar in the margin and the corresponding text highlights; hover coded text and the margin bars highlight back
- **Clickable labels**: Click a code label in the margin to open its detail panel — stacked labels are individually clickable even when overlapping

### Code Explorer

- **Tree view**: Browse all codes in a collapsible tree organized by Code > File > Segment
- **Segment counts**: See how many coded passages each code has, broken down by file
- **Click to navigate**: Click any segment to scroll the editor to that exact position
- **Toolbar controls**: Expand/collapse all codes or all files independently with dedicated buttons

### Code Detail Panel

- **Three navigation modes**:
  - **List mode** — overview of all codes with color swatch, description, and segment count
  - **Code-focused detail** — all segments for a specific code across all files, with text preview
  - **Marker-focused detail** — details of a specific marker: text segment, other codes on the same passage, other markers with the same code
- **Back navigation** — breadcrumb-style "All Codes" button to return to the list
- **Cross-reference**: Click chips showing other codes on a marker to switch context; click other markers to navigate to them

### Hover Menu

- **Hover to inspect**: Hover over any coded text to see which codes are applied
- **Edit in place**: Toggle codes on/off directly from the hover menu
- **Smart timing**: 350ms delay to open (avoids accidental activation), 200ms delay to close (avoids flickering when moving between text and menu)

### Theme Support

- **Full dark/light mode**: The floating menu renders correctly in both Obsidian themes, using native Obsidian components (toggles, inputs, buttons) that respect the active theme
- **Native look**: The UI matches Obsidian's design language — no foreign-looking panels

---

## Engine Plugins

CodeMarker is expanding into a multi-engine architecture. Each engine handles a different file type:

### CSV Viewer (v28.5)

- **AG Grid integration**: Opens `.csv` files as interactive tables with sorting, filtering, and resizing
- **Info bar**: Displays row and column counts at the bottom of the view
- **Column toggle**: Modal interface to show/hide individual columns
- **Header tag button**: Click column headers to tag them, with correct positioning and hover style
- **Cell tag buttons**: Click cells in coding columns (`cod-seg`, `cod-frow`) to add tags
- **Tag chips**: Tags display as colored chips inside coding cells, now clickable for interaction
- **Comment column**: Dedicated column for adding annotations/comments to rows
- **Source column tagging**: Tag button in source column when `cod-seg` is enabled
- **Column ordering**: cod-seg always inserts right after the source column
- **Header icons**: Info icon with tooltip on cod-seg header; tag icon on cod-frow header
- **COD_SEG_CELL_TAG_BTN toggle**: Setting to enable/disable tag button in cod-seg cells
- **CSS polish**: cod-seg italic styling, cod-frow lighter gray background, improved tooltip text
- **Async parsing**: CSV files are parsed asynchronously for better performance on large files
- **Native file registration**: The `csv` extension is registered so Obsidian opens CSV files directly in the viewer
- **Row index fix**: Correct row index tracking after sorting/filtering operations
- **Standalone plugin**: Runs as an independent plugin in the demo vault

### CodeMarker CSV (v33.3)

- **Full CodeMarker integration**: CSV engine now shares the full CM6 coding stack from codemarker-v2 (markers, codes, hover menu, margin panel)
- **Unified Code Detail sidebar**: Single detail view replaces scattered leaves for a consistent code inspection experience
- **Reveal on click**: Clicking a code marker in the CSV view always reveals the unified detail sidebar
- **Legacy leaf cleanup**: Old detail leaves are cleaned up automatically on plugin load
- **CM6 inline editor**: Edit code annotations directly within the CSV segment editor using a full CM6 editor instance
- **Extensions reuse**: The inline editor reuses the complete CM6 extensions stack from the markdown editor (syntax highlighting, keymaps, etc.)
- **Margin panel fix**: Corrected alignment of the margin panel in the CSV segment editor
- **Batch coding via header tag**: Click the cod-frow column header tag button to apply/remove codes to all visible (filtered) rows at once, with cross-row toggle state (all/none/partial)
- **Cod-seg chip opens editor**: Clicking a cod-seg tag chip now opens the segment editor alongside the sidebar

### CodeMarker Image (v34.4)

- **Fabric.js canvas**: Opens image files in a custom view with a Fabric.js-powered canvas for annotation
- **Toolbar UI**: Zoom, pan, and drawing tool controls
- **Region drawing tools**: Rectangle, ellipse, and freeform polygon tools for marking regions on images
- **Image coding model**: Persistence layer and region manager for storing coded regions
- **Context menu integration**: Right-click any image file to open in CodeMarker Image
- **Command palette**: "Open current image in CodeMarker Image" command
- **Coding menu**: Right-click on drawn regions to assign qualitative codes via context menu
- **Region labels**: Coded regions display their assigned code name as a label
- **Hover glow**: Hovering over a coded region highlights it with a glow effect for easy identification
- **Code Explorer sidebar**: Tree-style panel showing all coded image regions organized by code/tag
- **Code Detail sidebar**: Panel showing details of a selected code marker (label, comment, coordinates)
- **Auto-open images**: When enabled, clicking any image file opens it directly in CodeMarker Image view
- **Settings tab**: Dedicated settings panel for CodeMarker Image preferences and toggles

### CodeMarker PDF (v35.9)

- **PDF selection capture**: Select text in any PDF file to create qualitative codes on passages
- **Cross-page detection**: Detects selections that span multiple PDF pages
- **CodeFormModal**: Modal interface for creating and editing code annotations on PDF highlights
- **Double-click edit**: Double-click an existing marker to edit it via CodeFormModal
- **Bidirectional hover**: Hover a highlight in the PDF and the corresponding sidebar entry highlights; hover a sidebar entry and the PDF highlight glows back
- **File rename tracking**: When a PDF file is renamed, all associated markers update their file references automatically
- **Margin panel (MAXQDA-style)**: Colored vertical bars in the left margin of the PDF view, mirroring the markdown engine's margin panel — each code gets a distinct bar with clickable labels
- **Margin overlay**: Dedicated overlay layer for margin annotations — marks render in page margins with proper z-ordering
- **Undo/Redo**: Full undo and redo support for PDF coding operations — revert or re-apply marker additions, edits, and deletions
- **Drag handles**: Drag handles on PDF highlights allow resizing marker boundaries directly in the viewer
- **Text selection over highlights**: Select text that overlaps with existing highlights without interference — selection flows naturally across coded passages
- **Cross-page selection**: Text selection works seamlessly across page boundaries in the PDF viewer
- **Popover replaces sidebar**: Hovering over a PDF highlight now opens a popover with code details, replacing the previous click-to-sidebar interaction pattern
- **Hover trigger**: Popover appears on hover for a smoother, more immediate inspection experience without requiring clicks
- **Pointer-events fix**: Highlights no longer block mouse interaction with the underlying PDF text — pointer-events are set to none on highlight elements, allowing natural text selection and link clicking through coded passages
- **Smart layering**: When multiple markers overlap, the smallest marker is rendered on top so it remains clickable — prevents large markers from hiding small nested ones
- **Intersection handles**: When markers overlap in intersection zones, dedicated handles appear at the intersection boundaries — allowing precise resizing of each marker independently within shared regions
- **Handle transitions**: Smooth visual transitions when moving between intersection zones and single-marker zones — handles update position and style without flicker
- **Null guards**: Defensive checks throughout the PDF pipeline prevent crashes on edge cases (null pages, missing selections, unloaded views)
- **Thumbnail rendering**: PDF page thumbnails for preview cards and navigation
- **Drawing annotations**: Rect, ellipse, and polygon shape tools for drawing annotations directly on PDF pages — visual markup beyond text selection
- **Shape hover popover**: Hovering over a drawn shape shows a popover with annotation details
- **Drawing interaction fix**: Fixed interaction conflicts between drawing tools and existing PDF highlight/selection features
- **PDF Code Explorer sidebar**: Tree-style panel showing all coded PDF passages organized by code
- **PDF Code Detail sidebar**: Panel showing details of a selected PDF code marker
- **Ribbon icon**: Quick access to PDF Code Explorer via the left ribbon
- **Standalone plugin**: Runs as an independent engine plugin in the demo vault

### CodeMarker Audio (v36.4)

- **Waveform visualization**: Opens audio files (mp3, m4a, wav, ogg, flac, aac) in a custom view with a rendered waveform
- **Timeline ruler**: Visual time markers along the waveform for precise navigation and orientation
- **Region lanes**: Coded audio regions displayed as colored lanes below the waveform for clear visual separation
- **registerExtensions**: Audio file extensions properly registered with Obsidian for native file opening
- **Scroll persistence**: Timeline scroll position preserved across interactions and playback
- **Region labels**: Coded audio regions display clickable chip labels on the waveform
- **Sidebar navigation**: Code Explorer and Code Detail views for browsing and inspecting audio codes
- **Playback controls**: Play/pause, zoom, volume, and speed adjustment (0.5x to 2x)
- **Bidirectional hover**: Hover a region in the waveform and the sidebar highlights; hover a sidebar entry and the waveform region highlights back
- **Region resize**: Drag region edges to adjust marker start/end times directly in the waveform
- **Analytics seek**: Click a code in the analytics/explorer view to seek audio playback to that region
- **Settings tab**: Dedicated settings panel for CodeMarker Audio preferences (default zoom, region opacity, waveform colors)
- **Audio coding model**: Persistence layer for qualitative coding on time-based audio regions
- **Context menu**: Right-click audio files to open in CodeMarker Audio
- **State persistence**: Audio view remembers which file was open across sessions
- **Zoom guards**: ResizeObserver try-catch prevents "No audio loaded" race condition errors during rapid zoom or pane resize before audio is ready
- **Standalone plugin**: Runs as an independent engine plugin in the demo vault

### CodeMarker Analytics (v38.12)

- **Cross-engine analytics**: Consolidates coded data from all six source types into a unified view
- **Audio source support**: Analytics data reader ingests and consolidates annotations from audio-based codemarker data
- **Video source support**: Analytics data reader ingests and consolidates annotations from video-based codemarker data
- **Navigate to source**: Click an audio or video entry in the analytics view to navigate to the source file
- **Text Retrieval view**: New view mode that retrieves and displays original text segments associated with coded markers
- **PDF source support**: Analytics data reader can now ingest and consolidate annotations from PDF-based codemarker data
- **Dashboard landing page**: KPI cards showing total codes, annotations, and documents at a glance
- **Mini-thumbnails**: Preview cards for each visualization mode (Network Graph, Matrix, Code Evolution) on the dashboard
- **Network graph**: Visualizes relationships between codes as an interactive network graph
- **Document-Code Matrix**: Tabular view showing code frequency per document, with alphabetical and total-based sorting
- **Code Evolution**: Timeline visualization of coding activity over time, with per-file filtering
- **Word Cloud**: Visual representation of code frequency as differently-sized text labels
- **MCA (Multiple Correspondence Analysis)**: 2D scatter plot mapping codes and documents by co-occurrence patterns
- **MDS (Multidimensional Scaling)**: Proximity map positioning codes by similarity — frequently co-occurring codes cluster together
- **Jaccard Similarity**: Pairwise code co-occurrence matrix using the Jaccard index to measure overlap between codes
- **Text Statistics**: Word count, sentence count, and readability metrics per code and per document
- **Dendrogram + Silhouette**: Hierarchical clustering visualization with silhouette quality measure
- **Lag Sequential Analysis**: Temporal pattern detection in code application sequences — reveals which codes tend to follow others
- **Polar Chart**: Radial visualization of code frequencies — each code displayed as a spoke proportional to its count
- **Chi-squared Test**: Statistical independence test between codes and documents with significance indicators
- **Decision Tree**: Classification tree identifying which features predict code application, with minNodeSize of 2
- **Source Comparison**: Compares coding patterns across source types — grouped bar chart and table showing how codes distribute across markdown, CSV, image, PDF, audio, and video sources
- **Code Overlap**: Spatial overlap analysis between codes — identifies which codes co-occur on the same passages or regions
- **Research Board**: Infinite canvas powered by Fabric.js for spatial arrangement of coded data — supports all node types: chart snapshots, text excerpts, code definition cards, and KPI cards
- **Board fixes**: Node rendering and layout bug fixes for the Research Board
- **Right-click context menu**: Right-click on board nodes to access actions via context menu
- **Drag & drop codes**: Drag codes onto the board with automatic cluster grouping visual
- **Eighteen view modes + Board**: Frequency, Co-occurrence Matrix, Network Graph, Document-Code Matrix, Code Evolution, Text Retrieval, Word Cloud, MCA, MDS, Jaccard, Text Statistics, Dendrogram, Lag Sequential, Polar, Chi-squared, Decision Tree, Source Comparison, Code Overlap
- **Stats engine**: Dedicated statistics module with frequency, co-occurrence, matrix, evolution, MCA, MDS, Jaccard, text stats, clustering, lag sequential, polar, chi-squared, decision tree, source comparison, and overlap calculations
- **Data reader**: Reads and aggregates coding data from all six engine types (markdown, CSV, image, PDF, audio, video)
- **Command palette**: "Open CodeMarker Analytics", "Refresh Analytics Data", and "Open Research Board" commands
- **Standalone plugin**: Runs as an independent engine plugin in the demo vault

---

## Commands

| Command | Description |
|---------|-------------|
| **Create marker from selection** | Creates a new marker from the current text selection |
| **Open coding menu** | Opens the coding menu for the current selection or marker |
| **Open Code Explorer** | Opens the Code Explorer sidebar panel |
| **Reset all markers** | Removes all markers from the vault (use with caution) |

---

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Default color | Fallback color for markers | `#6200EE` |
| Marker opacity | Background opacity of highlights | `0.4` |
| Show handles on hover | Display drag-resize handles when hovering markers | On |
| Handle size | Size of the resize handles in pixels | `12` |
| Show menu on selection | Automatically open coding menu when text is selected | On |
| Show menu on right-click | Open coding menu via right-click context | On |
| Show ribbon button | Display a CodeMarker icon in the left ribbon | On |

---

## How It Works

### Your Files Stay Clean

CodeMarker does **not** modify your markdown files. All annotations (markers, codes, positions) are stored in the plugin's own data file (`.obsidian/plugins/obsidian-codemarker-v2/data.json`). Your notes remain pure markdown, fully portable and readable by any other tool.

### Built on CodeMirror 6

The plugin uses Obsidian's underlying editor engine (CodeMirror 6) for all visual elements: text highlights, resize handles, hover tooltips, and the margin panel. This means smooth integration with Obsidian's editor — no iframes, no foreign DOM, no performance hacks.

---

## Installation

### Manual

1. Download the latest release (`main.js`, `manifest.json`, `styles.css`)
2. Create `.obsidian/plugins/obsidian-codemarker-v2/` in your vault
3. Place the files inside
4. Enable the plugin in Obsidian Settings > Community Plugins

### From Source

```bash
cd your-vault/.obsidian/plugins/obsidian-codemarker-v2
npm install
npm run build
```

---

## Roadmap

CodeMarker is evolving toward a full qualitative data analysis platform inside Obsidian:

| Phase | What | Status |
|-------|------|--------|
| Hover tooltip | Inspect & edit codes on hover | Done |
| Code registry | Persistent code identity, colors, descriptions | Done |
| Margin panel | MAXQDA-style colored bars with bidirectional hover | Done |
| Code Explorer & Detail | Tree view, segment navigation, code detail panel | Done |
| Engine plugins | CSV, PDF, Image, Audio, Video, Analytics | In progress |
| Per-code decorations | Overlapping color layers per code | Planned |
| Projects & workspace | Named projects, global codebook, project-level data | Planned |
| Power features | Code hierarchy, memos, queries, matrix, export | Planned |

See `ARCHITECTURE.md` for the full architectural study (updated in v29 with multi-engine roadmap).

---

## License

MIT
