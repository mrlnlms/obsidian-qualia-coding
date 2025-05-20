# CodeMarker

Qualitative text coding plugin for Obsidian, similar to MAXQDA, Atlas.ti, and NVivo.

## Current State (v18 — TAG v0.2.0)

CM6 implementation working perfectly. This version marks a breakthrough with posAtCoords-based interaction — drag on marker handles now works correctly.

### Architecture
- **CM6 StateField** (`src/cm6/markerStateField.ts`) — manages marker decoration state
- **CM6 ViewPlugin** (`src/cm6/markerViewPlugin.ts`) — renders decorations and handles interaction
- **Handle Widget** (`src/cm6/handleWidget.ts`) — marker drag handles
- **Data Model** (`src/models/codeMarkerModel.ts`) — marker CRUD and persistence
- **Settings** (`src/models/settings.ts`, `src/views/settingsTab.ts`) — plugin configuration

### Commands
- **Criar uma nova marcacao de codigo** — select text, then run this command to create a marker
- **Resetar todas as marcacoes salvas** — clear all markers

### What works
- Text selection and marker creation
- CM6 decorations rendering correctly
- Drag interaction via posAtCoords
- Marker persistence across sessions
- Settings tab

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```
