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

### CSV Viewer (v28.3)

- **AG Grid integration**: Opens `.csv` files as interactive tables with sorting, filtering, and resizing
- **Info bar**: Displays row and column counts at the bottom of the view
- **Column toggle**: Modal interface to show/hide individual columns
- **Header tag button**: Click column headers to tag them, with correct positioning and hover style
- **Cell tag buttons**: Click cells in coding columns (`cod-seg`, `cod-frow`) to add tags
- **Tag chips**: Tags display as colored chips inside coding cells
- **Source column tagging**: Tag button in source column when `cod-seg` is enabled
- **Async parsing**: CSV files are parsed asynchronously for better performance on large files
- **Native file registration**: The `csv` extension is registered so Obsidian opens CSV files directly in the viewer
- **Standalone plugin**: Runs as an independent plugin in the demo vault

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

See `ARCHITECTURE.md` for the full architectural study.

---

## License

MIT
