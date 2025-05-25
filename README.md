# CodeMarker (Qualia Coding) — v22

Qualitative text coding plugin for Obsidian, similar to MAXQDA, Atlas.ti, NVivo.

## Current state (v22)

Last commit from the obsidian-codeMarker GitHub repository (Era 2).
Nearly complete version — marker intersections still need fixing.

### Features

- CM6 architecture: StateField for decorations + ViewPlugin for events
- Create text markers via command palette ("Criar uma nova marcacao de codigo")
- Multi-file marker support
- Color-coded highlights with handles
- Settings tab for configuration
- Debug command for listing active instances
- Markers persist across sessions via data.json

### Known issues

- Marker intersections (overlapping markers) not yet handled correctly

## Architecture

```
main.ts                          — Plugin entry, commands, workspace events
src/models/settings.ts           — Settings interface and defaults
src/models/codeMarkerModel.ts    — Data model, marker CRUD, persistence
src/cm6/markerStateField.ts      — CM6 StateField for decorations
src/cm6/markerViewPlugin.ts      — CM6 ViewPlugin for editor events
src/cm6/handleWidget.ts          — Handle widget for marker endpoints
src/views/settingsTab.ts         — Settings tab UI
```

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## History

This plugin is being ported version-by-version from its original development history.
See `demo/` folder for dated snapshots of each version.
