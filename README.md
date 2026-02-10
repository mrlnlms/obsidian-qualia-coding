# CodeMarker v2

Qualitative text coding plugin for [Obsidian](https://obsidian.md), inspired by professional QDA tools like MAXQDA and ATLAS.ti.

---

## Current State (v23)

Fresh scaffold from obsidian-sample-plugin. This is the beginning of Era 3 -- a clean rewrite in the code-maker_v2 vault.

### What works

- Plugin loads and unloads cleanly
- Settings tab with default color picker and marker opacity slider
- Settings persistence via `data.json`

### What does not exist yet

- No text coding, no markers, no CM6 decorations
- No code registry, no margin panel, no code explorer
- No hover menu, no commands beyond the scaffold

---

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Default color | Fallback color for markers | `#6200EE` |
| Marker opacity | Background opacity of highlights | `0.4` |

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
