# CodeMarker v2

Qualitative text coding plugin for [Obsidian](https://obsidian.md), inspired by professional QDA tools like MAXQDA and ATLAS.ti.

Select any text, assign codes, and build a structured analysis — all without leaving your notes. Your markdown files stay clean; all annotations live in the plugin's data layer.

---

## What is Qualitative Coding?

Qualitative coding is the process of labeling passages of text with descriptive tags ("codes") to identify themes, patterns, and categories in your data. It's widely used in academic research, UX research, journalism, and content analysis.

CodeMarker brings this workflow directly into Obsidian, so your research notes, interview transcripts, and field notes can be coded in the same place where you write and think.

---

## Current State (v27.4)

This is a prototype build. Core coding features work, and the margin panel is new in this version.

### Working Features

- **Select & code**: Select text and assign codes via floating menu or right-click context menu
- **Multi-code markers**: A single text passage can carry multiple codes simultaneously
- **Toggle codes**: Quick on/off toggles for each code in the floating menu
- **Smart overlap**: Intelligent hit-testing for overlapping markers (smallest marker wins for nested, rightmost start for partial overlap)
- **Drag-resize handles**: Adjust marker boundaries by dragging handles that appear on hover
- **Code definitions**: Persistent code identity with name, color, and optional description
- **Auto color palette**: 12 visually distinct colors assigned automatically
- **Create codes inline**: Add new codes from the coding menu without interrupting flow
- **Selection preview**: Visual highlight of the selection while the code form modal is open
- **Hover menu**: Inspect and edit codes on hover with smart timing (350ms open, 200ms close delay)

### New: Margin Panel (Prototype)

- **MAXQDA-style brackets**: Colored vertical brackets appear in the left margin alongside coded text
- **Horizontal stacking**: Overlapping codes from different codes are placed in separate columns
- **Labels**: Code names appear as labels on each bracket
- **Viewport culling**: Only brackets visible in the current viewport are rendered

### Theme Support

- Full dark/light mode support using native Obsidian components
- Native look matching Obsidian's design language

---

## Commands

| Command | Description |
|---------|-------------|
| **Create marker from selection** | Creates a new marker from the current text selection |
| **Open coding menu** | Opens the coding menu for the current selection or marker |
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

## License

MIT
