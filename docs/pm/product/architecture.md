# Product Architecture — Qualia Coding

**Date**: 2026-03-03

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    main.ts (~95 LOC)                 │
│  DataManager + register 7 engines + unified sidebar  │
└──────────┬──────────────────────────────┬────────────┘
           │                              │
    ┌──────┴──────┐              ┌────────┴────────┐
    │   core/     │              │   7 Engines     │
    │  (shared)   │              │                 │
    ├─────────────┤              ├─────────────────┤
    │ DataManager │              │ markdown/ (CM6) │
    │ Registry    │              │ pdf/ (DOM/SVG)  │
    │ Popover     │              │ csv/ (AG Grid)  │
    │ Sidebar     │              │ image/ (Fabric) │
    │ Settings    │              │ audio/ (WS.js)  │
    │ FileIntrcpt │              │ video/ (WS.js)  │
    └─────────────┘              │ analytics/      │
                                 │  (Chart.js +    │
           ┌──────┐              │   Fabric.js)    │
           │media/│              └─────────────────┘
           │(shared Audio/Video) │
           └──────┘
```

## Engine Registration Pattern

Each engine: `registerXxxEngine(plugin) → EngineCleanup`
- Creates model (`*CodingModel`)
- Registers views, commands, file intercepts
- Returns cleanup function for `onunload()`

## Data Flow

```
User action → Engine Model → DataManager.setSection() → debounce 500ms → data.json
                                    ↓
                            notifyChange()
                                    ↓
                         UnifiedModelAdapter
                                    ↓
                    Unified Sidebar (Explorer + Detail)
```

## Sidebar Architecture

```
UnifiedModelAdapter
├── markdown: SidebarModelInterface (CodeMarkerModel)
├── pdf: SidebarModelInterface (PdfSidebarAdapter)
├── csv: SidebarModelInterface (CsvSidebarAdapter)
├── image: SidebarModelInterface (ImageSidebarAdapter)
├── audio: SidebarModelInterface (AudioSidebarAdapter)
└── video: SidebarModelInterface (VideoSidebarAdapter)
        ↓
  Merged into single interface
        ↓
  UnifiedExplorerView (Code → File → Segment tree)
  UnifiedDetailView (list | code-focused | marker-focused)
```

## Coding Menu Flow (All Engines)

```
User selects data → Engine-specific trigger
  → openCodingPopover(adapter, options)
    → CodingPopoverAdapter interface
      → registry, getActiveCodes(), addCode(), removeCode()
      → getMemo(), setMemo(), save(), onNavClick()
    → Popover renders chips, toggles, memo field
    → User action → adapter.save() → DataManager
```

## Bundle Architecture

```
esbuild (single entry) → main.js (~2.1 MB)
  ├── core/ (3K LOC)
  ├── markdown/ (4.2K LOC)
  ├── pdf/ (4.5K LOC)
  ├── csv/ (1.7K LOC)
  ├── image/ (2.1K LOC)
  ├── audio/ (1K LOC)
  ├── video/ (1K LOC)
  ├── media/ (0.5K LOC)
  ├── analytics/ (11.2K LOC)
  └── node_modules/
      ├── ag-grid-community (~500KB)
      ├── fabric (~400KB)
      ├── chart.js (~200KB)
      ├── wavesurfer.js (~100KB)
      └── ... (smaller deps)
```

**Code splitting impossible** — Obsidian loads a single `main.js` file. Investigated and ruled out (see ARCHITECTURE.md §3.10).

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Single `data.json` | Simplicity, atomic saves, no migration complexity |
| DataManager as gatekeeper | Prevents engines from calling `loadData()`/`saveData()` directly |
| Shared codebook (Registry) | Codes are global, not per-engine — enables cross-engine analytics |
| Unified sidebar | Single Explorer + Detail for all 7 engines — consistent UX |
| CM6 extensions reused by CSV | Avoids duplicating 5 extensions — CSV creates standalone EditorView |
| Approach C only (CM6 Native Tooltip) | A and B preserved but not active — C is the shipping menu system |
| File-based persistence | No database, no IndexedDB — plain JSON files in plugin directory |
| External overlay for margin panels | PDF panels live outside scroll container to prevent label clipping |

---

*Source: CLAUDE.md, codebase scan, docs/ARCHITECTURE.md*
