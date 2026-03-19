# Codex Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 2 itens acionaveis da avaliacao Codex: deduplicar pattern selection→menu no markdown/index.ts e atualizar ARCHITECTURE.md defasado.

**Architecture:** Extrai helper `openMenuFromEditorSelection()` que unifica o pattern duplicado 3x no markdown/index.ts (command, context menu, ribbon). Atualiza ARCHITECTURE.md para refletir a implementacao real (EngineCleanup como funcao, main.ts ~180 LOC).

**Tech Stack:** TypeScript, Vitest

---

## File Structure

| Arquivo | Acao | Responsabilidade |
|---------|------|------------------|
| `src/markdown/menu/menuActions.ts` | Modify | Adicionar `openMenuFromEditorSelection()` — helper compartilhado |
| `src/markdown/index.ts` | Modify | Substituir 3 blocos duplicados por chamadas ao helper |
| `docs/ARCHITECTURE.md` | Modify | Corrigir secao 5.3 (EngineRegistration + papel do main.ts) |

---

## Chunk 1: Deduplicar selection→menu pattern

### Task 1: Extrair helper openMenuFromEditorSelection

**Files:**
- Modify: `src/markdown/menu/menuActions.ts`
- Modify: `src/markdown/index.ts`

O pattern que se repete 3 vezes no index.ts (command L114-146, context menu L200-220, ribbon L236-255):

```typescript
const sel = editorView.state.selection.main;
const snapshot = { from: sel.from, to: sel.to, text: selection, fileId };
editorView.dispatch({ effects: setSelectionPreviewEffect.of({ from: sel.from, to: sel.to }) });
const coords = editorView.coordsAtPos(sel.from);
menuController.openMenu(editorView, snapshot, { x: coords?.left ?? 0, y: coords?.top ?? 0 });
```

O SELECTION_EVENT listener (L86-108) NAO entra na deduplicacao — recebe coords do mouse e EditorView direto do evento, pattern diferente.

- [ ] **Step 1: Adicionar helper em menuActions.ts**

Abrir `src/markdown/menu/menuActions.ts` e adicionar no final:

```typescript
import { setSelectionPreviewEffect } from '../cm6/markerStateField';
import type { MenuController } from './menuController';
import type { EditorView } from '@codemirror/view';

/**
 * Open the coding menu for the current editor selection.
 * Shared by: command, context menu, ribbon button.
 */
export function openMenuFromEditorSelection(
	editorView: EditorView,
	fileId: string,
	selection: string,
	menuController: MenuController,
): void {
	const sel = editorView.state.selection.main;
	const snapshot = {
		from: sel.from,
		to: sel.to,
		text: selection,
		fileId,
	};
	editorView.dispatch({
		effects: setSelectionPreviewEffect.of({ from: sel.from, to: sel.to }),
	});
	const coords = editorView.coordsAtPos(sel.from);
	menuController.openMenu(editorView, snapshot, {
		x: coords?.left ?? 0,
		y: coords?.top ?? 0,
	});
}
```

Nota: verificar o que `menuActions.ts` ja contem e adaptar os imports — nao duplicar imports que ja existem.

- [ ] **Step 2: Substituir command create-code-marker (index.ts L113-146)**

Antes:
```typescript
plugin.addCommand({
    id: 'create-code-marker',
    name: 'Code Selection',
    editorCallback: (editor, markdownView) => {
        if (!(markdownView instanceof MarkdownView)) return;
        if (!markdownView.file) return;
        const selection = editor.getSelection();
        if (!selection?.trim()) return;
        const editorView = editor.cm;
        if (!editorView) return;
        const sel = editorView.state.selection.main;
        const snapshot = { from: sel.from, to: sel.to, text: selection, fileId: markdownView.file.path };
        editorView.dispatch({ effects: setSelectionPreviewEffect.of({ from: sel.from, to: sel.to }) });
        const coords = editorView.coordsAtPos(sel.from);
        menuController.openMenu(editorView, snapshot, { x: coords?.left ?? 0, y: coords?.top ?? 0 });
    },
});
```

Depois:
```typescript
plugin.addCommand({
    id: 'create-code-marker',
    name: 'Code Selection',
    editorCallback: (editor, markdownView) => {
        if (!(markdownView instanceof MarkdownView)) return;
        if (!markdownView.file) return;
        const selection = editor.getSelection();
        if (!selection?.trim()) return;
        const editorView = editor.cm;
        if (!editorView) return;
        openMenuFromEditorSelection(editorView, markdownView.file.path, selection, menuController);
    },
});
```

- [ ] **Step 3: Substituir context menu onClick (index.ts L200-220)**

Antes (dentro do `menu.addItem` → `onClick`):
```typescript
.onClick(() => {
    const editorView = editor.cm;
    if (!editorView) return;
    const sel = editorView.state.selection.main;
    const snapshot = { from: sel.from, to: sel.to, text: selection, fileId: markdownView.file!.path };
    editorView.dispatch({ effects: setSelectionPreviewEffect.of({ from: sel.from, to: sel.to }) });
    const coords = editorView.coordsAtPos(sel.from);
    menuController.openMenu(editorView, snapshot, { x: coords?.left ?? 0, y: coords?.top ?? 0 });
});
```

Depois:
```typescript
.onClick(() => {
    const editorView = editor.cm;
    if (!editorView) return;
    openMenuFromEditorSelection(editorView, markdownView.file!.path, selection, menuController);
});
```

- [ ] **Step 4: Substituir ribbon button (index.ts L227-256)**

Antes:
```typescript
plugin.addRibbonIcon('highlighter', 'Code Selection', () => {
    if (!model.getSettings().showRibbonButton) return;
    const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView?.file) return;
    const editor = markdownView.editor;
    const selection = editor.getSelection();
    if (!selection?.trim()) return;
    const editorView = editor.cm;
    if (!editorView) return;
    const sel = editorView.state.selection.main;
    const snapshot = { from: sel.from, to: sel.to, text: selection, fileId: markdownView.file.path };
    editorView.dispatch({ effects: setSelectionPreviewEffect.of({ from: sel.from, to: sel.to }) });
    const coords = editorView.coordsAtPos(sel.from);
    menuController.openMenu(editorView, snapshot, { x: coords?.left ?? 0, y: coords?.top ?? 0 });
});
```

Depois:
```typescript
plugin.addRibbonIcon('highlighter', 'Code Selection', () => {
    if (!model.getSettings().showRibbonButton) return;
    const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!markdownView?.file) return;
    const editor = markdownView.editor;
    const selection = editor.getSelection();
    if (!selection?.trim()) return;
    const editorView = editor.cm;
    if (!editorView) return;
    openMenuFromEditorSelection(editorView, markdownView.file.path, selection, menuController);
});
```

- [ ] **Step 5: Atualizar imports no index.ts**

Adicionar import do helper:
```typescript
import { openMenuFromEditorSelection } from './menu/menuActions';
```

Remover import de `setSelectionPreviewEffect` do index.ts se nao for mais usado diretamente (ainda e usado pelo SELECTION_EVENT listener na L101, entao **manter**).

- [ ] **Step 6: Verificar tsc + testes**

```bash
npx tsc --noEmit && npm run test
```
Expected: 0 errors, 1269 tests passing.

- [ ] **Step 7: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: extrai openMenuFromEditorSelection — deduplica pattern 3x no markdown/index.ts"
```

---

## Chunk 2: Atualizar ARCHITECTURE.md

### Task 2: Corrigir secao 5.3 Engine Registration Pattern

**Files:**
- Modify: `docs/ARCHITECTURE.md:256-268`

- [ ] **Step 1: Corrigir EngineRegistration interface e descricao do main.ts**

Substituir linhas 256-268:

Antes:
```markdown
### 5.3 Engine Registration Pattern

Cada engine exporta `registerXxxEngine()` que retorna `EngineRegistration<Model>`:
\`\`\`typescript
interface EngineRegistration<M> {
  cleanup: { destroy(): void };
  model: M;
}
\`\`\`

`main.ts` orquestra: registra todos os engines, coleta cleanup + model references, chama `destroy()` no `onunload()`. Models são passados ao `UnifiedModelAdapter` para a sidebar unificada.

**Regra**: `main.ts` deve ficar ~15 LOC. Se crescer, mover lógica para os engines.
```

Depois:
```markdown
### 5.3 Engine Registration Pattern

Cada engine exporta `registerXxxEngine()` que retorna `EngineRegistration<Model>`:
\`\`\`typescript
type EngineCleanup = () => void | Promise<void>;

interface EngineRegistration<M> {
  cleanup: EngineCleanup;
  model: M;
}
\`\`\`

`main.ts` (~180 LOC) e o unico ponto que conhece todos os engines. Responsabilidades:
- Bootstrap: DataManager, CodeDefinitionRegistry, auto-persist via onMutate
- Registro dos 7 engines (cada um retorna cleanup + model)
- Montagem do UnifiedModelAdapter com adapters de todos os engines
- Cross-engine navigation (label-click, code-click → sidebar detail)
- Sidebar view registration (Code Explorer, Code Detail)
- Cleanup reverso no onunload

Nao deve implementar logica de engine — apenas coordenar.
```

- [ ] **Step 2: Verificar build**

```bash
npm run build
```
Expected: tsc + esbuild pass.

- [ ] **Step 3: Commit**

```bash
~/.claude/scripts/commit.sh "docs: corrige ARCHITECTURE.md — EngineRegistration e papel do main.ts"
```

---

## Resumo de impacto

| Metrica | Valor |
|---------|-------|
| LOC removidas do index.ts | ~35 |
| LOC adicionadas em menuActions.ts | ~18 |
| Reducao liquida | ~17 LOC |
| Duplicacao eliminada | 3x → 1 helper |
| Docs corrigidos | 1 secao (ARCHITECTURE.md §5.3) |
| Commits | 2 |
