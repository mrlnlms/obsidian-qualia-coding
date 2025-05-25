# CodeMarker (Obsidian Qualia Coding)

Qualitative text coding plugin for Obsidian, similar to MAXQDA, Atlas.ti, NVivo.

## Current State (v21)

- CM6-based architecture with separated StateField (decorations/state) and ViewPlugin (events/identification)
- Create code markers by selecting text and running the "Criar uma nova marcacao de codigo" command
- Markers persist across sessions via data.json
- Multi-file support: markers sync across multiple open editors
- Handle widgets for visual marker boundaries
- Settings tab for configuration
- Reset command to clear all markers

## Architecture

- `main.ts` -- Plugin lifecycle, commands, workspace events
- `src/cm6/markerStateField.ts` -- CM6 StateField for decorations and marker state
- `src/cm6/markerViewPlugin.ts` -- CM6 ViewPlugin for events and file identification
- `src/cm6/handleWidget.ts` -- Widget for marker handles
- `src/models/` -- Data model and settings
- `src/views/` -- Settings tab

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## Version History

This plugin evolved through multiple names and architectures:
- v1-v6: qualitative-coding-plugin / mosx-qda / menu-editors (Svelte-based)
- v8-v10: mqda (modular architecture)
- v11-v12: editor-playground (CM5 + Popper, CSV views)
- v13: management-codes (vault note, docs only)
- v14-v21: obsidian-codemarker (CM6 rewrite, current)
