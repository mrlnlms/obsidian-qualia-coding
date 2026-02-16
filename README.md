# CodeMarker v2

Qualitative text coding plugin for [Obsidian](https://obsidian.md). Select text, assign codes, and see highlights — all without modifying your markdown files.

---

## Current State (v26)

This version establishes the Approach C menu baseline: a refined menu system combining Obsidian's native `Menu` API for right-click integration with a custom selection-triggered menu.

### What works

- **CM6 decorations**: Text markers render as colored highlights using CodeMirror 6 state field and view plugin
- **Selection menu**: Select text to open a coding menu (Approach C — selection-triggered via custom DOM event)
- **Right-click integration**: Right-click selected text to see "Code Options" in Obsidian's native context menu
- **Resize handles**: Drag handles appear on hover to adjust marker boundaries
- **Settings tab**: Configure default color, marker opacity, handle size, and toggle triggers
- **Data model**: Markers and codes stored in `data.json`, keeping markdown files clean
- **Ribbon button**: Toggle ribbon icon visibility in settings

### Architecture

- `src/cm6/` — CM6 state field, view plugin, selection menu field, handle widget
- `src/menu/` — Menu controller (Approach C), Obsidian menu adapter, CM6 tooltip menus, actions
- `src/models/` — Code marker data model, settings definitions
- `src/views/` — Settings tab

---

## Installation

### Manual

1. Download `main.js`, `manifest.json`, `styles.css`
2. Create `.obsidian/plugins/obsidian-codemarker-v2/` in your vault
3. Place the files inside
4. Enable the plugin in Settings > Community Plugins

### From Source

```bash
cd your-vault/.obsidian/plugins/obsidian-codemarker-v2
npm install
npm run build
```

---

## License

MIT
