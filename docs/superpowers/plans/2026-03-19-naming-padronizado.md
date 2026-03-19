# Naming Padronizado — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar naming de arquivos em csv/ e image/ para eliminar ambiguidade em busca global e imports.

**Architecture:** Renomeia arquivos sem prefixo em csv/ (4 arquivos) e aplana subpastas single-file em image/ (6 arquivos), adicionando prefixo de engine onde necessario. Nenhuma logica muda — apenas nomes de arquivo e caminhos de import.

**Tech Stack:** TypeScript, git mv, tsc, vitest

---

## Mudancas planejadas

### CSV — rename (4 arquivos)

| Antes | Depois |
|-------|--------|
| `csv/codingModel.ts` | `csv/csvCodingModel.ts` |
| `csv/codingTypes.ts` | `csv/csvCodingTypes.ts` |
| `csv/codingMenu.ts` | `csv/csvCodingMenu.ts` |
| `csv/codingCellRenderer.ts` | `csv/csvCodingCellRenderer.ts` |

### Image — move + rename (6 arquivos)

| Antes | Depois |
|-------|--------|
| `image/models/codingModel.ts` | `image/imageCodingModel.ts` |
| `image/models/codingTypes.ts` | `image/imageCodingTypes.ts` |
| `image/menu/codingMenu.ts` | `image/imageCodingMenu.ts` |
| `image/highlight/regionHighlight.ts` | `image/regionHighlight.ts` |
| `image/labels/regionLabels.ts` | `image/regionLabels.ts` |
| `image/toolbar/imageToolbar.ts` | `image/imageToolbar.ts` |

Subpastas que ficam vazias e serao removidas: `models/`, `menu/`, `highlight/`, `labels/`, `toolbar/`.
Subpastas que permanecem: `canvas/` (4 arquivos), `views/` (2 arquivos).

### Resultado: image/ apos reorganizacao

```
image/
├── index.ts
├── imageCodingModel.ts       ← era models/codingModel.ts
├── imageCodingTypes.ts       ← era models/codingTypes.ts
├── imageCodingMenu.ts        ← era menu/codingMenu.ts
├── regionHighlight.ts        ← era highlight/regionHighlight.ts
├── regionLabels.ts           ← era labels/regionLabels.ts
├── imageToolbar.ts           ← era toolbar/imageToolbar.ts
├── canvas/                   ← permanece (4 arquivos)
│   ├── fabricCanvas.ts
│   ├── regionDrawing.ts
│   ├── regionManager.ts
│   └── zoomPanControls.ts
└── views/                    ← permanece (2 arquivos)
    ├── imageView.ts
    └── imageSidebarAdapter.ts
```

---

## Chunk 1: CSV renames

### Task 1: Rename csv/ files com git mv

**Files:**
- Rename: `src/csv/codingModel.ts` → `src/csv/csvCodingModel.ts`
- Rename: `src/csv/codingTypes.ts` → `src/csv/csvCodingTypes.ts`
- Rename: `src/csv/codingMenu.ts` → `src/csv/csvCodingMenu.ts`
- Rename: `src/csv/codingCellRenderer.ts` → `src/csv/csvCodingCellRenderer.ts`

- [ ] **Step 1: Rename files with git mv**

```bash
cd /Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding
git mv src/csv/codingModel.ts src/csv/csvCodingModel.ts
git mv src/csv/codingTypes.ts src/csv/csvCodingTypes.ts
git mv src/csv/codingMenu.ts src/csv/csvCodingMenu.ts
git mv src/csv/codingCellRenderer.ts src/csv/csvCodingCellRenderer.ts
```

- [ ] **Step 2: Update internal imports in renamed files**

`src/csv/csvCodingModel.ts` line 3:
```
- import type { SegmentMarker, RowMarker, CsvMarker, CodingSnapshot } from './codingTypes';
+ import type { SegmentMarker, RowMarker, CsvMarker, CodingSnapshot } from './csvCodingTypes';
```

`src/csv/csvCodingMenu.ts` line 10:
```
- import type { CsvCodingModel } from './codingModel';
+ import type { CsvCodingModel } from './csvCodingModel';
```

`src/csv/csvCodingCellRenderer.ts` line 3 and 6:
```
- import type { CsvCodingModel } from './codingModel';
+ import type { CsvCodingModel } from './csvCodingModel';
- import { openCsvCodingPopover } from './codingMenu';
+ import { openCsvCodingPopover } from './csvCodingMenu';
```

- [ ] **Step 3: Update imports within csv/ folder**

`src/csv/index.ts` line 9:
```
- import { CsvCodingModel } from './codingModel';
+ import { CsvCodingModel } from './csvCodingModel';
```

`src/csv/csvCodingView.ts` line 10:
```
- import type { CsvCodingModel } from './codingModel';
+ import type { CsvCodingModel } from './csvCodingModel';
```

`src/csv/segmentEditor.ts` lines 12-13:
```
- import type { SegmentMarker } from './codingTypes';
- import type { CsvCodingModel } from './codingModel';
+ import type { SegmentMarker } from './csvCodingTypes';
+ import type { CsvCodingModel } from './csvCodingModel';
```

`src/csv/columnToggleModal.ts` lines 4-5:
```
- import { codingCellRenderer, sourceTagBtnRenderer } from './codingCellRenderer';
- import type { CsvCodingModel } from './codingModel';
+ import { codingCellRenderer, sourceTagBtnRenderer } from './csvCodingCellRenderer';
+ import type { CsvCodingModel } from './csvCodingModel';
```

`src/csv/csvHeaderInjection.ts` lines 4-5:
```
- import { openBatchCodingPopover } from './codingMenu';
- import type { CsvCodingModel } from './codingModel';
+ import { openBatchCodingPopover } from './csvCodingMenu';
+ import type { CsvCodingModel } from './csvCodingModel';
```

`src/csv/views/csvSidebarAdapter.ts` lines 6-7:
```
- import type { CsvCodingModel } from '../codingModel';
- import type { CsvMarker } from '../codingTypes';
+ import type { CsvCodingModel } from '../csvCodingModel';
+ import type { CsvMarker } from '../csvCodingTypes';
```

- [ ] **Step 4: Update imports from outside csv/**

`src/main.ts` line 26:
```
- import type { CsvCodingModel } from './csv/codingModel';
+ import type { CsvCodingModel } from './csv/csvCodingModel';
```

`src/core/types.ts` line 4:
```
- import type { SegmentMarker, RowMarker } from '../csv/codingTypes';
+ import type { SegmentMarker, RowMarker } from '../csv/csvCodingTypes';
```

`src/analytics/data/dataReader.ts` line 5:
```
- import type { SegmentMarker, RowMarker } from "../../csv/codingTypes";
+ import type { SegmentMarker, RowMarker } from "../../csv/csvCodingTypes";
```

`src/analytics/data/dataConsolidator.ts` line 9:
```
- import type { SegmentMarker, RowMarker } from "../../csv/codingTypes";
+ import type { SegmentMarker, RowMarker } from "../../csv/csvCodingTypes";
```

- [ ] **Step 5: Update test imports**

`tests/engine-models/csvCodingModel.test.ts` line 2:
```
- import { CsvCodingModel } from '../../src/csv/codingModel';
+ import { CsvCodingModel } from '../../src/csv/csvCodingModel';
```

- [ ] **Step 6: Verify tsc + tests**

```bash
npx tsc --noEmit && npm run test
```
Expected: 0 errors, 1269 tests passing.

- [ ] **Step 7: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: padroniza naming csv/ — adiciona prefixo csv nos arquivos sem prefixo"
```

---

## Chunk 2: Image moves + flatten

### Task 2: Move image/ model and menu files to root

**Files:**
- Move: `src/image/models/codingModel.ts` → `src/image/imageCodingModel.ts`
- Move: `src/image/models/codingTypes.ts` → `src/image/imageCodingTypes.ts`
- Move: `src/image/menu/codingMenu.ts` → `src/image/imageCodingMenu.ts`

- [ ] **Step 1: Move files with git mv**

```bash
git mv src/image/models/codingModel.ts src/image/imageCodingModel.ts
git mv src/image/models/codingTypes.ts src/image/imageCodingTypes.ts
git mv src/image/menu/codingMenu.ts src/image/imageCodingMenu.ts
rmdir src/image/models src/image/menu
```

- [ ] **Step 2: Update internal imports in moved files**

`src/image/imageCodingModel.ts` lines 5-7 (path depth changes — was in models/, now in image/):
```
- import type { DataManager } from '../../core/dataManager';
- import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
- import type { ImageMarker, RegionShape, NormalizedCoords } from './codingTypes';
+ import type { DataManager } from '../core/dataManager';
+ import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';
+ import type { ImageMarker, RegionShape, NormalizedCoords } from './imageCodingTypes';
```

`src/image/imageCodingMenu.ts` lines 7 e 8-13 (path depth changes — was in menu/, now in image/):
```
- import type { ImageCodingModel } from '../models/codingModel';
+ import type { ImageCodingModel } from './imageCodingModel';
- import { openCodingPopover, type CodingPopoverAdapter, type CodingPopoverOptions, type CodingPopoverHandle } from '../../core/codingPopover';
+ import { openCodingPopover, type CodingPopoverAdapter, type CodingPopoverOptions, type CodingPopoverHandle } from '../core/codingPopover';
```

`src/image/imageCodingTypes.ts` — nenhum import (arquivo de tipos puros, sem dependencias).

- [ ] **Step 3: Update imports within image/ folder**

`src/image/index.ts` line 9:
```
- import { ImageCodingModel } from './models/codingModel';
+ import { ImageCodingModel } from './imageCodingModel';
```

`src/image/views/imageView.ts` lines 3 and 13:
```
- import type { ImageCodingModel } from '../models/codingModel';
+ import type { ImageCodingModel } from '../imageCodingModel';
- import { CodingMenu } from '../menu/codingMenu';
+ import { CodingMenu } from '../imageCodingMenu';
```

`src/image/views/imageSidebarAdapter.ts` lines 6-7:
```
- import type { ImageCodingModel } from '../models/codingModel';
- import type { ImageMarker } from '../models/codingTypes';
+ import type { ImageCodingModel } from '../imageCodingModel';
+ import type { ImageMarker } from '../imageCodingTypes';
```

`src/image/canvas/regionManager.ts` lines 12-13:
```
- import type { ImageCodingModel } from '../models/codingModel';
- import type { ImageMarker, NormalizedRect, NormalizedPolygon, NormalizedCoords } from '../models/codingTypes';
+ import type { ImageCodingModel } from '../imageCodingModel';
+ import type { ImageMarker, NormalizedRect, NormalizedPolygon, NormalizedCoords } from '../imageCodingTypes';
```

`src/image/labels/regionLabels.ts` line 10:
```
- import type { ImageCodingModel } from "../models/codingModel";
+ import type { ImageCodingModel } from "../imageCodingModel";
```
(Note: this file will also move in Task 3 — this is an intermediate state.)

`src/image/highlight/regionHighlight.ts` line 15:
```
- import type { ImageCodingModel } from "../models/codingModel";
+ import type { ImageCodingModel } from "../imageCodingModel";
```
(Note: this file will also move in Task 3 — this is an intermediate state.)

- [ ] **Step 4: Update imports from outside image/**

`src/main.ts` line 25:
```
- import type { ImageCodingModel } from './image/models/codingModel';
+ import type { ImageCodingModel } from './image/imageCodingModel';
```

`src/core/types.ts` line 5:
```
- import type { ImageMarker } from '../image/models/codingTypes';
+ import type { ImageMarker } from '../image/imageCodingTypes';
```

`src/analytics/data/dataReader.ts` line 6:
```
- import type { ImageMarker } from "../../image/models/codingTypes";
+ import type { ImageMarker } from "../../image/imageCodingTypes";
```

`src/analytics/data/dataConsolidator.ts` line 10:
```
- import type { ImageMarker } from "../../image/models/codingTypes";
+ import type { ImageMarker } from "../../image/imageCodingTypes";
```

- [ ] **Step 5: Update test imports**

`tests/engine-models/imageCodingModel.test.ts` lines 2 and 4:
```
- import { ImageCodingModel } from '../../src/image/models/codingModel';
+ import { ImageCodingModel } from '../../src/image/imageCodingModel';
- import type { NormalizedCoords } from '../../src/image/models/codingTypes';
+ import type { NormalizedCoords } from '../../src/image/imageCodingTypes';
```

- [ ] **Step 6: Verify tsc + tests**

```bash
npx tsc --noEmit && npm run test
```
Expected: 0 errors, 1269 tests passing.

- [ ] **Step 7: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: move image models/menu pra raiz com prefixo image"
```

### Task 3: Flatten single-file subfolders in image/

**Files:**
- Move: `src/image/highlight/regionHighlight.ts` → `src/image/regionHighlight.ts`
- Move: `src/image/labels/regionLabels.ts` → `src/image/regionLabels.ts`
- Move: `src/image/toolbar/imageToolbar.ts` → `src/image/imageToolbar.ts`

- [ ] **Step 1: Move files with git mv**

```bash
git mv src/image/highlight/regionHighlight.ts src/image/regionHighlight.ts
git mv src/image/labels/regionLabels.ts src/image/regionLabels.ts
git mv src/image/toolbar/imageToolbar.ts src/image/imageToolbar.ts
rmdir src/image/highlight src/image/labels src/image/toolbar
```

- [ ] **Step 2: Update internal imports in moved files**

`src/image/regionHighlight.ts` (was in highlight/, now in image/ — `../` becomes `./`):
```
- import type { FabricCanvasState } from "../canvas/fabricCanvas";
- import type { RegionManager } from "../canvas/regionManager";
- import type { ImageCodingModel } from "../imageCodingModel";
+ import type { FabricCanvasState } from "./canvas/fabricCanvas";
+ import type { RegionManager } from "./canvas/regionManager";
+ import type { ImageCodingModel } from "./imageCodingModel";
```

`src/image/regionLabels.ts` (was in labels/, now in image/ — `../` becomes `./`):
```
- import type { RegionManager } from "../canvas/regionManager";
- import type { ImageCodingModel } from "../imageCodingModel";
+ import type { RegionManager } from "./canvas/regionManager";
+ import type { ImageCodingModel } from "./imageCodingModel";
```

`src/image/imageToolbar.ts` (was in toolbar/, now in image/ — `../` becomes `./`, `../../` becomes `../`):
```
- import { type FabricCanvasState, fitToContainer, zoomBy } from "../canvas/fabricCanvas";
- import { DRAW_TOOL_BUTTONS, type DrawMode } from "../../core/shapeTypes";
- import { createDrawToolbar, type DrawToolbarHandle } from "../../core/drawToolbarFactory";
+ import { type FabricCanvasState, fitToContainer, zoomBy } from "./canvas/fabricCanvas";
+ import { DRAW_TOOL_BUTTONS, type DrawMode } from "../core/shapeTypes";
+ import { createDrawToolbar, type DrawToolbarHandle } from "../core/drawToolbarFactory";
```

- [ ] **Step 3: Update imports from within image/**

`src/image/views/imageView.ts`:
```
- import { type ToolbarState, createToolbar } from '../toolbar/imageToolbar';
+ import { type ToolbarState, createToolbar } from '../imageToolbar';
- import { RegionLabels } from '../labels/regionLabels';
+ import { RegionLabels } from '../regionLabels';
- import { type RegionHighlightState, setupRegionHighlight } from '../highlight/regionHighlight';
+ import { type RegionHighlightState, setupRegionHighlight } from '../regionHighlight';
```

`src/image/canvas/regionDrawing.ts` line 2:
```
- import type { ToolMode } from "../toolbar/imageToolbar";
+ import type { ToolMode } from "../imageToolbar";
```

- [ ] **Step 4: Verify tsc + tests**

```bash
npx tsc --noEmit && npm run test
```
Expected: 0 errors, 1269 tests passing.

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: aplana subpastas single-file em image/"
```

---

## Chunk 3: Docs + verificacao final

### Task 4: Atualizar documentacao

**Files:**
- Modify: `docs/DEVELOPMENT.md` (estrutura do projeto)
- Modify: `docs/BACKLOG.md` (registro da mudanca)
- Modify: `CLAUDE.md` (estrutura do projeto)

- [ ] **Step 1: Atualizar a arvore de diretorio no DEVELOPMENT.md**

Seção "2. Estrutura do Projeto" — atualizar os paths de csv/ e image/ na arvore.

- [ ] **Step 2: Atualizar CLAUDE.md**

Seção "Estrutura" — atualizar paths de csv/ e image/.

- [ ] **Step 3: Registrar no BACKLOG.md**

Marcar item "Reorganizacao de pastas" como FEITO na tabela "Pendente".

- [ ] **Step 4: Build final**

```bash
npm run build
```
Expected: tsc + esbuild pass with zero errors.

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "docs: atualiza estrutura de pastas apos rename csv/ e image/"
```

---

## Resumo de impacto

| Metrica | Valor |
|---------|-------|
| Arquivos renomeados/movidos | 10 |
| Import statements atualizados | ~40 |
| Subpastas removidas | 5 (models, menu, highlight, labels, toolbar) |
| Logica alterada | Zero |
| Commits | 3-4 |
