# csvCodingView.ts Refactor — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir csvCodingView.ts de 802 LOC para ~300 LOC extraindo 3 modulos independentes: segment editor (CM6 split panel), column toggle modal, e header injection.

**Architecture:** Extrair por responsabilidade: (1) `segmentEditor.ts` com o lifecycle completo do CM6 editor panel (open, close, sync markers, align labels), (2) `columnToggleModal.ts` com o modal de settings de colunas (ja e autocontido — classe ColumnToggleModal), (3) `csvHeaderInjection.ts` com a logica de MutationObserver + DOM injection nos headers do AG Grid. O `csvCodingView.ts` fica como orquestrador slim que delega para esses modulos.

**Tech Stack:** AG Grid v33, CodeMirror 6, PapaParse, Hyparquet, Vitest + jsdom

---

## Arquivos

| Arquivo | Acao | LOC estimado |
|---|---|---|
| `src/csv/csvCodingView.ts` | Modificar (802 → ~300) | 300 |
| `src/csv/segmentEditor.ts` | Criar | ~200 |
| `src/csv/columnToggleModal.ts` | Criar | ~190 |
| `src/csv/csvHeaderInjection.ts` | Criar | ~110 |

**Nao muda**: codingModel.ts, codingTypes.ts, codingMenu.ts, codingCellRenderer.ts, csvSidebarAdapter.ts, index.ts

**Consumer unico**: `index.ts` importa `CsvCodingView` e `CSV_CODING_VIEW_TYPE` — nao muda.
`codingCellRenderer.ts` importa `CsvCodingView` como tipo — continua funcionando.

---

## Chunk 1: Extrair ColumnToggleModal

A extracao mais simples — a classe ja e autocontida (linhas 624-802).

### Task 1: Extrair columnToggleModal.ts

**Files:**
- Create: `src/csv/columnToggleModal.ts`
- Modify: `src/csv/csvCodingView.ts` — remover ColumnToggleModal, importar do novo arquivo

- [ ] **Step 1: Criar columnToggleModal.ts**

Mover a classe `ColumnToggleModal` (linhas 624-802) para arquivo proprio. Precisa importar:
- `Modal`, `Setting` de `obsidian`
- `GridApi`, `ColDef` de `ag-grid-community`
- `codingCellRenderer`, `sourceTagBtnRenderer` de `./codingCellRenderer`
- `CommentCellEditor` de `./csvCodingView` → mover junto (linhas 78-101)
- `COD_SEG_STYLE`, `COD_FROW_STYLE` de `./csvCodingView` → mover junto (linhas 68-75)
- `CsvCodingModel` tipo de `./codingModel`
- NAO importar `CsvCodingView` — usar interface minima `CsvViewRef` para evitar circular import:
  ```typescript
  interface CsvViewRef {
    openSegmentEditor(file: string, row: number, column: string, cellText: string): void;
  }
  ```

**Decisao**: `CommentCellEditor`, `COD_SEG_STYLE`, `COD_FROW_STYLE` sao usados TANTO pelo modal quanto pelo view. Mover para `columnToggleModal.ts` e re-exportar, ja que o modal e o consumer principal.

- [ ] **Step 2: Atualizar csvCodingView.ts**

Remover linhas 68-101 (styles + CommentCellEditor) e 624-802 (ColumnToggleModal).
Adicionar import:
```typescript
import { ColumnToggleModal, CommentCellEditor, COD_SEG_STYLE, COD_FROW_STYLE } from './columnToggleModal';
```

- [ ] **Step 3: Rodar build + testes**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/csv/columnToggleModal.ts src/csv/csvCodingView.ts
~/.claude/scripts/commit.sh "refactor: extrai ColumnToggleModal do csvCodingView (178 LOC)"
```

---

## Chunk 2: Extrair header injection

### Task 2: Extrair csvHeaderInjection.ts

**Files:**
- Create: `src/csv/csvHeaderInjection.ts`
- Modify: `src/csv/csvCodingView.ts` — remover injectHeaderButtons + createHeaderIcon

- [ ] **Step 1: Criar csvHeaderInjection.ts**

Mover `injectHeaderButtons()` (linhas 226-300) e `createHeaderIcon()` (linhas 302-323).

A funcao precisa de contexto do view: `gridApi`, `file`, `csvModel`, `openBatchCodingPopover`. Passar via interface de contexto:

```typescript
// src/csv/csvHeaderInjection.ts

import { setIcon } from 'obsidian';
import type { GridApi, ColDef } from 'ag-grid-community';
import { openBatchCodingPopover } from './codingMenu';
import type { CsvCodingModel } from './codingModel';

export interface HeaderInjectionContext {
  gridApi: GridApi | null;
  csvModel: CsvCodingModel;
  filePath: string | undefined;
  app: import('obsidian').App;
}

export function injectHeaderButtons(wrapper: HTMLElement, ctx: HeaderInjectionContext): void {
  // ... logica movida de csvCodingView.injectHeaderButtons
}

function createHeaderIcon(icon: string, strokeWidth: string): HTMLElement {
  // ... logica movida de csvCodingView.createHeaderIcon
}
```

- [ ] **Step 2: Atualizar csvCodingView.ts**

Remover os metodos `injectHeaderButtons` e `createHeaderIcon`.
No `onLoadFile`, substituir:
```typescript
// Antes:
const inject = () => this.injectHeaderButtons(wrapper);

// Depois:
import { injectHeaderButtons } from './csvHeaderInjection';
const ctx = { gridApi: this.gridApi, csvModel: this.csvModel, filePath: this.file?.path, app: this.app };
const inject = () => injectHeaderButtons(wrapper, ctx);
```

- [ ] **Step 3: Rodar build + testes**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/csv/csvHeaderInjection.ts src/csv/csvCodingView.ts
~/.claude/scripts/commit.sh "refactor: extrai header injection do csvCodingView (100 LOC)"
```

---

## Chunk 3: Extrair segment editor

A parte mais complexa — CM6 lifecycle, marker sync, label alignment.

### Task 3: Extrair segmentEditor.ts

**Files:**
- Create: `src/csv/segmentEditor.ts`
- Modify: `src/csv/csvCodingView.ts` — remover metodos do editor, delegar

- [ ] **Step 1: Criar segmentEditor.ts**

Mover 5 metodos: `openSegmentEditor` (327-449), `alignMarginLabels` (451-490), `populateMarkersFromSegments` (492-528), `closeSegmentEditor` (530-567), `syncMarkersBackToCsvModel` (569-594), `refreshSegmentEditor` (596-604).

Estado do editor vira classe ou objeto gerenciado:

```typescript
// src/csv/segmentEditor.ts

import { setIcon } from 'obsidian';
import { EditorView, drawSelection, tooltips } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { createMarkerStateField, updateFileMarkersEffect, setFileIdEffect } from '../markdown/cm6/markerStateField';
import { createMarkerViewPlugin } from '../markdown/cm6/markerViewPlugin';
import { createSelectionMenuField } from '../markdown/cm6/selectionMenuField';
import { createHoverMenuExtension } from '../markdown/cm6/hoverMenuExtension';
import { createMarginPanelExtension } from '../markdown/cm6/marginPanelExtension';
import { registerStandaloneEditor, unregisterStandaloneEditor } from '../markdown/cm6/utils/viewLookupUtils';
import type { Marker } from '../markdown/models/codeMarkerModel';
import type { SegmentMarker } from './codingTypes';
import type { CsvCodingModel } from './codingModel';
import type { GridApi } from 'ag-grid-community';

export interface SegmentEditorContext {
  file: string;
  row: number;
  column: string;
}

// Getter-based interface — reads current values from the view, avoids stale references
export interface SegmentEditorHost {
  get contentEl(): HTMLElement;
  get gridWrapper(): HTMLElement | null;
  get gridApi(): GridApi | null;
  readonly csvModel: CsvCodingModel;
  readonly markdownModel: CodeMarkerModel;
}

export class SegmentEditor {
  private editorPanel: HTMLElement | null = null;
  private editorView: EditorView | null = null;
  private editorContext: SegmentEditorContext | null = null;
  private labelObserver: MutationObserver | null = null;

  // host e getter-based — CsvCodingView implementa a interface diretamente (passa `this`)
  constructor(private host: SegmentEditorHost) {}

  get context(): SegmentEditorContext | null { return this.editorContext; }
  get isOpen(): boolean { return this.editorView !== null; }

  open(file: string, row: number, column: string, cellText: string): void {
    // host.gridWrapper e host.gridApi leem valores atuais via getters
    // ... logica de openSegmentEditor
  }

  close(): void {
    // ... logica de closeSegmentEditor
  }

  refresh(): void {
    // ... logica de refreshSegmentEditor
  }

  private alignMarginLabels(): void { /* ... */ }
  private populateMarkersFromSegments(virtualFileId: string, segments: SegmentMarker[], cellText: string): void { /* ... */ }
  private syncMarkersBackToCsvModel(virtualFileId: string, file: string, row: number, column: string): void { /* ... */ }
}
```

- [ ] **Step 2: Atualizar csvCodingView.ts**

Substituir os 6 metodos + 4 propriedades de estado do editor por uma instancia de `SegmentEditor`:

```typescript
import { SegmentEditor } from './segmentEditor';

export class CsvCodingView extends FileView {
  private segmentEditor!: SegmentEditor;

  constructor(leaf, plugin, csvModel) {
    super(leaf);
    this.plugin = plugin;
    this.csvModel = csvModel;
    // CsvCodingView implementa SegmentEditorHost via getters — passa `this`
    this.segmentEditor = new SegmentEditor(this as unknown as SegmentEditorHost);
  }

  // Getters que satisfazem SegmentEditorHost:
  // contentEl — herdado de FileView
  // get gridWrapper() — ja e propriedade da classe
  // get gridApi() — ja e propriedade da classe
  // csvModel — ja e propriedade da classe
  // markdownModel — expor como getter: get markdownModel() { return this.plugin.markdownModel!; }

  // Delegate:
  openSegmentEditor(file, row, column, cellText) { this.segmentEditor.open(file, row, column, cellText); }
  closeSegmentEditor() { this.segmentEditor.close(); }
  refreshSegmentEditor() { this.segmentEditor.refresh(); }
}
```

- [ ] **Step 3: Rodar build + testes**

Run: `npm run build && npm run test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/csv/segmentEditor.ts src/csv/csvCodingView.ts
~/.claude/scripts/commit.sh "refactor: extrai SegmentEditor do csvCodingView (200 LOC)"
```

---

## Chunk 4: Docs e cleanup

### Task 4: Atualizar docs

**Files:**
- Modify: `CLAUDE.md` — atualizar secao csv/
- Modify: `docs/DEVELOPMENT.md` — atualizar tree

- [ ] **Step 1: Atualizar CLAUDE.md**

Na secao csv/:
```
  csv/                       — CSV/Parquet engine (ag-grid, papaparse, hyparquet)
    csvCodingView.ts         — FileView orquestrador (~300 LOC): grid setup, lifecycle
    segmentEditor.ts         — CM6 split panel: open/close, marker sync, label alignment
    columnToggleModal.ts     — Modal de settings de colunas + CommentCellEditor + styles
    csvHeaderInjection.ts    — MutationObserver para injetar botoes nos headers AG Grid
```

- [ ] **Step 2: Atualizar DEVELOPMENT.md tree**
- [ ] **Step 3: Commit**

---

## Verificacao final

- `npm run build` — zero erros TS
- `npm run test` — todos os 1239+ testes passam
- `csvCodingView.ts` caiu de 802 para ~300 LOC
- Nenhum consumer externo quebrou (`index.ts` e `codingCellRenderer.ts` importam de csvCodingView — continua funcionando)
- 3 novos arquivos focados: segmentEditor (~200), columnToggleModal (~190), csvHeaderInjection (~110)

## Notas importantes

- `openSegmentEditor` e `closeSegmentEditor` sao metodos publicos chamados por `codingCellRenderer.ts` — a assinatura deve ser preservada na classe `CsvCodingView` como delegates
- `refreshSegmentEditor` e chamado internamente — tambem deve ter delegate
- `CommentCellEditor` e referenciado pelo `ColumnToggleModal` na criacao de ColDef — mover junto
- `COD_SEG_STYLE` e `COD_FROW_STYLE` sao usados tanto no modal quanto no view (info bar nao usa, mas cell renderers referenciam) — exportar do columnToggleModal
- `parseTabularFile` e `TabularData` (linhas 23-48) sao funcoes puras que poderiam ir para um helper, mas como sao usadas so no onLoadFile, deixar no csvCodingView por YAGNI
