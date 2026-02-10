# CodeMarker v2

Qualitative text coding plugin for [Obsidian](https://obsidian.md). Select text, assign codes, and see them as colored highlights — all without modifying your markdown files.

---

## Current State (v25)

Menu system, triggers, settings UI, and full CSS styling.

### What works

- **CM6 decorations**: Coded text appears as colored highlights in the editor via CodeMirror 6
- **Resize handles**: Drag handles appear on markers for boundary adjustment
- **Menu system**: Two approaches available (configurable in settings):
  - **Approach A** — Obsidian native Menu API with selection preview
  - **Approach B** — CM6 Tooltip-based menu using Obsidian CSS variables
- **5 trigger entry points**: Text selection (mouseup), right-click context menu, file menu, ribbon button, and commands
- **Settings tab**: Configure menu approach and behavior
- **Code management**: Create, assign, and remove codes via the coding menu
- **Data model**: All markers stored in `data.json`, markdown files stay clean
- **CSS**: Full styles for highlights, handles, drag states, selection preview, and tooltip menu

### Commands

| Command | Description |
|---------|-------------|
| **Create code marker** | Creates a marker from the current selection |
| **Open coding menu** | Opens the coding menu for the selection |
| **Reset code markers** | Removes all markers |

### Settings

Accessible via Settings > CodeMarker v2.

---

## Installation

### From Source

```bash
cd your-vault/.obsidian/plugins/obsidian-codemarker-v2
npm install
npm run build
```

---

## License

MIT
