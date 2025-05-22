# CodeMarker

Qualitative text coding tool for Obsidian, similar to MAXQDA, Atlas.ti, and NVivo.

## Current state (v19 — TAG v1.0.0)

Visual rendering of code markers is complete using CodeMirror 6:
- Inline highlights with configurable colors
- Handles visible on marked text segments
- Settings tab for managing codes and colors
- Data model for markers with per-file storage

Visual interactions (drag, resize, click behaviors) are not yet implemented.

## Architecture

- `main.ts` — Plugin entry point, registers CM6 extensions and commands
- `src/cm6/` — CodeMirror 6 integration (StateField, ViewPlugin, HandleWidget)
- `src/models/` — Data model and settings
- `src/views/` — Settings tab

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

Build automatically copies plugin files to `demo/.obsidian/plugins/obsidian-codemarker/`.
