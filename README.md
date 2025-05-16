# CodeMarker

Qualitative text coding tool for Obsidian (similar to MAXQDA, Atlas.ti, NVivo).

## Current state (v16)

- Styled markers with inline background colors and border-radius
- Hover effect on markers (brightness filter via JS-toggled class)
- Command to reset/clear all saved markers
- Resize handles with styled balls (border, shadow, scale on hover)
- Vertical bars (::after pseudo-elements) connecting handles to markers
- Distinct cursors on handles: w-resize (start) / e-resize (end)
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

- Handle drag/move interaction not yet implemented (next step)
