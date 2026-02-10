# CodeMarker v2

Qualitative text coding plugin for [Obsidian](https://obsidian.md). Select text, assign codes, and see highlights rendered via CodeMirror 6 decorations.

## Current State (v24)

This version ports the CM6 engine from obsidian-codemarker into the v2 scaffold:

- **StateField + ViewPlugin** architecture for marker decorations
- **CodeMarkerModel** for marker data management (create, load, clear)
- **Settings tab** with basic configuration
- **Commands**: "Create marker from selection" and "Reset all markers"
- Markers are stored in `data.json`, not in your markdown files

## Commands

| Command | Description |
|---------|-------------|
| **Create marker from selection** | Creates a new marker from the current text selection |
| **Reset all markers** | Removes all markers from the vault |

## Installation

### From Source

```bash
cd your-vault/.obsidian/plugins/obsidian-codemarker-v2
npm install
npm run build
```

## License

MIT
