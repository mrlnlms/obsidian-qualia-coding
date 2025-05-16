# CodeMarker

Qualitative text coding tool for Obsidian (similar to MAXQDA, Atlas.ti, NVivo).

## Current state (v15)

- CM6 StateField-based highlight decorations with inline background colors
- Selection-based marker creation via command palette
- Resize handles appear on hover at marker boundaries (start/end)
- Multiline marker support with vertical handles at extremes
- Handles visible but drag functionality not yet working
- Settings: default color picker, opacity slider, preset color dropdown
- Markers persist in plugin data storage per file
- Events: file-open updates markers, active-leaf-change/layout-change hide handles

## Architecture

```
main.ts                          — Plugin entry, commands, event registration
src/models/codeMarkerModel.ts    — Marker CRUD, CM6 StateField, decorations
src/models/settings.ts           — Settings interface and defaults
src/views/resizeHandles.ts       — DOM-based resize handles with hover/drag logic
src/views/settingsTab.ts         — Obsidian SettingTab with color/opacity controls
```

## Known issues

- Handles display correctly but drag interaction does not work yet
- `resizeHandles.ts` has unreachable code after the if/else block (dead vertical handle code)
