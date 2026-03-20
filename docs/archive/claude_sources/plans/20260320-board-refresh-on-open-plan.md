# Board Refresh on Open — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconciliar dados stale no Research Board ao abrir — atualiza cores, nomes, contagens; marca orfaos; remove arrows invalidas. Notice informativo.

**Architecture:** Funcao pura `reconcileBoard()` em arquivo dedicado. Recebe canvas + registry + data + app, itera objetos, retorna contadores de mudanca. BoardView chama apos loadBoard().

**Tech Stack:** TypeScript, Fabric.js (canvas iteration), Obsidian API (vault, Notice)

**Spec:** `docs/archive/claude_sources/plans/20260320-board-refresh-on-open-spec.md`

---

## File Structure

| Acao | Arquivo | Responsabilidade |
|------|---------|-----------------|
| Create | `src/analytics/board/boardReconciler.ts` | Funcao pura reconcileBoard() + buildSummary() |
| Modify | `src/analytics/index.ts` | Adicionar `registry` na interface AnalyticsPluginAPI |
| Modify | `src/main.ts` | Passar sharedRegistry na construcao do analytics plugin API |
| Modify | `src/analytics/views/boardView.ts` | Chamar reconcileBoard() no onOpen apos loadBoard |
| Create | `tests/analytics/boardReconciler.test.ts` | Testes unitarios do reconciler |

---

## Task 1: Expor registry na AnalyticsPluginAPI

**Files:**
- Modify: `src/analytics/index.ts:13-21`
- Modify: `src/main.ts` (onde monta o API object)

- [ ] **Step 1: Adicionar registry na interface**

Em `src/analytics/index.ts`, adicionar ao `AnalyticsPluginAPI`:

```typescript
import type { CodeDefinitionRegistry } from '../core/codeDefinitionRegistry';

export interface AnalyticsPluginAPI {
  app: App;
  registry: CodeDefinitionRegistry;  // NOVO
  data: ConsolidatedData | null;
  // ... resto igual
}
```

- [ ] **Step 2: Passar registry no main.ts**

Encontrar onde o analytics API object e montado em `src/main.ts` e adicionar `registry: this.sharedRegistry`.

- [ ] **Step 3: Build pra verificar tipos**

Run: `npm run build`
Expected: zero erros

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "refactor: expoe registry na AnalyticsPluginAPI"
```

---

## Task 2: Criar boardReconciler.ts com testes

**Files:**
- Create: `src/analytics/board/boardReconciler.ts`
- Create: `tests/analytics/boardReconciler.test.ts`

- [ ] **Step 1: Escrever testes primeiro**

```typescript
// tests/analytics/boardReconciler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { reconcileBoard, buildSummary, type ReconcileResult } from '../../src/analytics/board/boardReconciler';

// Mock Fabric canvas com getObjects/remove/renderAll
function mockCanvas(objects: any[]) {
  return {
    getObjects: () => [...objects],
    remove: vi.fn((...objs: any[]) => {
      for (const obj of objs) {
        const idx = objects.indexOf(obj);
        if (idx >= 0) objects.splice(idx, 1);
      }
    }),
  } as any;
}

// Mock registry
function mockRegistry(codes: Array<{ name: string; color: string }>) {
  const map = new Map(codes.map(c => [c.name, c]));
  return {
    getByName: (name: string) => map.get(name),
  } as any;
}

// Mock app.vault
function mockApp(existingFiles: string[]) {
  const set = new Set(existingFiles);
  return {
    vault: {
      getAbstractFileByPath: (path: string) => set.has(path) ? { path } : null,
    },
  } as any;
}

// Mock ConsolidatedData
function mockData(markers: Array<{ codes: string[]; source: string }>) {
  return { markers } as any;
}

function mkCodeCard(name: string, color: string, count: number, sources: string[] = []) {
  return {
    boardType: 'codeCard',
    boardId: `cc-${name}`,
    boardCodeName: name,
    boardColor: color,
    boardMarkerCount: count,
    boardSources: sources,
  };
}

function mkExcerpt(file: string, codes: string[], colors: string[]) {
  return {
    boardType: 'excerpt',
    boardId: `ex-${file}`,
    boardFile: file,
    boardCodes: [...codes],
    boardCodeColors: [...colors],
  };
}

function mkArrow(fromId: string, toId: string) {
  return {
    boardType: 'arrow-line',
    boardId: `arrow-${fromId}-${toId}`,
    boardFromId: fromId,
    boardToId: toId,
  };
}

function mkArrowHead(arrowId: string) {
  return {
    boardType: 'arrow-head',
    boardId: arrowId,
  };
}

function mkCluster(codeNames: string[]) {
  return {
    boardType: 'cluster-frame',
    boardId: `cluster-1`,
    boardCodeNames: [...codeNames],
  };
}

describe('reconcileBoard', () => {
  it('returns zeros when nothing changed', () => {
    const card = mkCodeCard('A', '#f00', 2, ['markdown']);
    const canvas = mockCanvas([card]);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const data = mockData([
      { codes: ['A'], source: 'markdown' },
      { codes: ['A'], source: 'markdown' },
    ]);
    const app = mockApp([]);
    const result = reconcileBoard(canvas, registry, data, app);
    expect(result.colorsUpdated).toBe(0);
    expect(result.namesUpdated).toBe(0);
    expect(result.countsUpdated).toBe(0);
    expect(result.codesMarkedDeleted).toBe(0);
  });

  it('updates CodeCard color when registry color changed', () => {
    const card = mkCodeCard('A', '#f00', 1);
    const canvas = mockCanvas([card]);
    const registry = mockRegistry([{ name: 'A', color: '#0f0' }]);
    const data = mockData([{ codes: ['A'], source: 'markdown' }]);
    const result = reconcileBoard(canvas, registry, data, mockApp([]));
    expect(result.colorsUpdated).toBe(1);
    expect(card.boardColor).toBe('#0f0');
  });

  it('updates CodeCard marker count', () => {
    const card = mkCodeCard('A', '#f00', 1);
    const canvas = mockCanvas([card]);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const data = mockData([
      { codes: ['A'], source: 'markdown' },
      { codes: ['A'], source: 'csv-segment' },
      { codes: ['A'], source: 'markdown' },
    ]);
    const result = reconcileBoard(canvas, registry, data, mockApp([]));
    expect(result.countsUpdated).toBe(1);
    expect(card.boardMarkerCount).toBe(3);
  });

  it('marks CodeCard as deleted when code not in registry', () => {
    const card = mkCodeCard('Deleted', '#f00', 5);
    const canvas = mockCanvas([card]);
    const registry = mockRegistry([]);
    const data = mockData([]);
    const result = reconcileBoard(canvas, registry, data, mockApp([]));
    expect(result.codesMarkedDeleted).toBe(1);
    expect(card.boardCodeName).toContain('(deletado)');
    expect(card.boardColor).toBe('#888');
  });

  it('does not re-mark already deleted CodeCard', () => {
    const card = mkCodeCard('(deletado) X', '#888', 0);
    (card as any).boardDeleted = true;
    const canvas = mockCanvas([card]);
    const registry = mockRegistry([]);
    const data = mockData([]);
    const result = reconcileBoard(canvas, registry, data, mockApp([]));
    expect(result.codesMarkedDeleted).toBe(0);
  });

  it('marks Excerpt as orphaned when file missing', () => {
    const excerpt = mkExcerpt('deleted.md', ['A'], ['#f00']);
    const canvas = mockCanvas([excerpt]);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const result = reconcileBoard(canvas, registry, mockData([]), mockApp([]));
    expect(result.excerptsOrphaned).toBe(1);
    expect((excerpt as any).boardOrphaned).toBe(true);
  });

  it('does not mark Excerpt orphaned when file exists', () => {
    const excerpt = mkExcerpt('exists.md', ['A'], ['#f00']);
    const canvas = mockCanvas([excerpt]);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const result = reconcileBoard(canvas, registry, mockData([]), mockApp(['exists.md']));
    expect(result.excerptsOrphaned).toBe(0);
  });

  it('removes deleted code from Excerpt chips', () => {
    const excerpt = mkExcerpt('f.md', ['A', 'B'], ['#f00', '#0f0']);
    const canvas = mockCanvas([excerpt]);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const result = reconcileBoard(canvas, registry, mockData([]), mockApp(['f.md']));
    expect(excerpt.boardCodes).toEqual(['A']);
    expect(excerpt.boardCodeColors).toEqual(['#f00']);
  });

  it('removes orphaned Arrow', () => {
    const card = mkCodeCard('A', '#f00', 1);
    const arrow = mkArrow('cc-A', 'cc-GONE');
    const head = mkArrowHead(arrow.boardId);
    const objects = [card, arrow, head];
    const canvas = mockCanvas(objects);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const result = reconcileBoard(canvas, registry, mockData([{ codes: ['A'], source: 'markdown' }]), mockApp([]));
    expect(result.arrowsRemoved).toBe(1);
    expect(canvas.remove).toHaveBeenCalled();
  });

  it('removes codes from Cluster and removes empty cluster', () => {
    const cluster = mkCluster(['A', 'B']);
    const objects = [cluster];
    const canvas = mockCanvas(objects);
    const registry = mockRegistry([{ name: 'A', color: '#f00' }]);
    const result = reconcileBoard(canvas, registry, mockData([]), mockApp([]));
    expect(result.clustersUpdated).toBe(1);
    expect(cluster.boardCodeNames).toEqual(['A']);
  });

  it('removes cluster when all codes deleted', () => {
    const cluster = mkCluster(['X', 'Y']);
    const objects = [cluster];
    const canvas = mockCanvas(objects);
    const registry = mockRegistry([]);
    const result = reconcileBoard(canvas, registry, mockData([]), mockApp([]));
    expect(result.clustersUpdated).toBe(1);
    expect(canvas.remove).toHaveBeenCalled();
  });
});

describe('buildSummary', () => {
  it('returns empty string for no changes', () => {
    const r: ReconcileResult = { colorsUpdated: 0, namesUpdated: 0, countsUpdated: 0, codesMarkedDeleted: 0, excerptsOrphaned: 0, arrowsRemoved: 0, clustersUpdated: 0 };
    expect(buildSummary(r)).toBe('');
  });

  it('builds summary with multiple changes', () => {
    const r: ReconcileResult = { colorsUpdated: 2, namesUpdated: 1, countsUpdated: 3, codesMarkedDeleted: 0, excerptsOrphaned: 0, arrowsRemoved: 1, clustersUpdated: 0 };
    const s = buildSummary(r);
    expect(s).toContain('2 cores');
    expect(s).toContain('1 nome');
    expect(s).toContain('3 contagens');
    expect(s).toContain('1 arrow');
  });
});
```

- [ ] **Step 2: Rodar testes pra ver falhar**

Run: `npx vitest run tests/analytics/boardReconciler.test.ts`
Expected: FAIL (modulo nao existe)

- [ ] **Step 3: Implementar boardReconciler.ts**

```typescript
// src/analytics/board/boardReconciler.ts
import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { ConsolidatedData } from '../data/dataTypes';
import type { App } from 'obsidian';

export interface ReconcileResult {
  colorsUpdated: number;
  namesUpdated: number;
  countsUpdated: number;
  codesMarkedDeleted: number;
  excerptsOrphaned: number;
  arrowsRemoved: number;
  clustersUpdated: number;
}

export function reconcileBoard(
  canvas: { getObjects(): any[]; remove(...objs: any[]): void },
  registry: CodeDefinitionRegistry,
  data: ConsolidatedData,
  app: App,
): ReconcileResult {
  const result: ReconcileResult = {
    colorsUpdated: 0, namesUpdated: 0, countsUpdated: 0,
    codesMarkedDeleted: 0, excerptsOrphaned: 0, arrowsRemoved: 0, clustersUpdated: 0,
  };

  // Pre-compute marker counts per code
  const markerCounts = new Map<string, number>();
  const markerSources = new Map<string, Set<string>>();
  for (const m of data.markers) {
    for (const c of m.codes) {
      markerCounts.set(c, (markerCounts.get(c) ?? 0) + 1);
      if (!markerSources.has(c)) markerSources.set(c, new Set());
      markerSources.get(c)!.add(m.source);
    }
  }

  const objects = canvas.getObjects();

  // Collect all boardIds for arrow validation
  const boardIds = new Set<string>();
  for (const obj of objects) {
    if (obj.boardId) boardIds.add(obj.boardId);
  }

  const toRemove: any[] = [];

  for (const obj of objects) {
    switch (obj.boardType) {
      case 'codeCard':
        reconcileCodeCard(obj, registry, markerCounts, markerSources, result);
        break;
      case 'excerpt':
        reconcileExcerpt(obj, registry, app, result);
        break;
      case 'arrow-line':
        if (!boardIds.has(obj.boardFromId) || !boardIds.has(obj.boardToId)) {
          toRemove.push(obj);
          // Also remove matching arrow-head
          for (const other of objects) {
            if (other.boardType === 'arrow-head' && other.boardId === obj.boardId) {
              toRemove.push(other);
            }
          }
          result.arrowsRemoved++;
        }
        break;
      case 'cluster-frame':
        reconcileCluster(obj, registry, canvas, toRemove, result);
        break;
    }
  }

  if (toRemove.length > 0) {
    canvas.remove(...toRemove);
  }

  return result;
}

function reconcileCodeCard(
  card: any,
  registry: CodeDefinitionRegistry,
  counts: Map<string, number>,
  sources: Map<string, Set<string>>,
  result: ReconcileResult,
): void {
  // Already marked deleted — skip
  if (card.boardDeleted) return;

  const def = registry.getByName(card.boardCodeName);

  if (!def) {
    // Code was deleted
    card.boardCodeName = `(deletado) ${card.boardCodeName}`;
    card.boardColor = '#888';
    card.boardDeleted = true;
    card.boardMarkerCount = 0;
    card.boardSources = [];
    result.codesMarkedDeleted++;
    return;
  }

  // Color changed
  if (def.color !== card.boardColor) {
    card.boardColor = def.color;
    result.colorsUpdated++;
  }

  // Name changed (rename — def found by old name means name didn't change,
  // but if we had a rename mapping we'd use it. For now, names match by lookup.)

  // Count changed
  const currentCount = counts.get(card.boardCodeName) ?? 0;
  if (currentCount !== card.boardMarkerCount) {
    card.boardMarkerCount = currentCount;
    result.countsUpdated++;
  }

  // Sources changed
  const currentSources = Array.from(sources.get(card.boardCodeName) ?? []).sort();
  const oldSources = [...(card.boardSources ?? [])].sort();
  if (JSON.stringify(currentSources) !== JSON.stringify(oldSources)) {
    card.boardSources = currentSources;
  }
}

function reconcileExcerpt(
  excerpt: any,
  registry: CodeDefinitionRegistry,
  app: App,
  result: ReconcileResult,
): void {
  // Check file exists
  if (!excerpt.boardOrphaned) {
    const file = app.vault.getAbstractFileByPath(excerpt.boardFile);
    if (!file) {
      excerpt.boardOrphaned = true;
      result.excerptsOrphaned++;
    }
  }

  // Reconcile code chips
  const codes: string[] = excerpt.boardCodes ?? [];
  const colors: string[] = excerpt.boardCodeColors ?? [];
  const newCodes: string[] = [];
  const newColors: string[] = [];
  let changed = false;

  for (let i = 0; i < codes.length; i++) {
    const def = registry.getByName(codes[i]!);
    if (!def) {
      // Code deleted — remove from chips
      changed = true;
      continue;
    }
    newCodes.push(def.name);
    // Update color if changed
    if (colors[i] !== def.color) {
      changed = true;
    }
    newColors.push(def.color);
  }

  if (changed) {
    excerpt.boardCodes = newCodes;
    excerpt.boardCodeColors = newColors;
  }
}

function reconcileCluster(
  cluster: any,
  registry: CodeDefinitionRegistry,
  canvas: { remove(...objs: any[]): void },
  toRemove: any[],
  result: ReconcileResult,
): void {
  const names: string[] = cluster.boardCodeNames ?? [];
  const filtered = names.filter((n: string) => registry.getByName(n));

  if (filtered.length !== names.length) {
    result.clustersUpdated++;
    if (filtered.length === 0) {
      toRemove.push(cluster);
    } else {
      cluster.boardCodeNames = filtered;
    }
  }
}

export function buildSummary(r: ReconcileResult): string {
  const parts: string[] = [];
  if (r.colorsUpdated > 0) parts.push(`${r.colorsUpdated} cores`);
  if (r.namesUpdated > 0) parts.push(`${r.namesUpdated} nomes`);
  if (r.countsUpdated > 0) parts.push(`${r.countsUpdated} contagens`);
  if (r.codesMarkedDeleted > 0) parts.push(`${r.codesMarkedDeleted} cards deletados`);
  if (r.excerptsOrphaned > 0) parts.push(`${r.excerptsOrphaned} excertos orfaos`);
  if (r.arrowsRemoved > 0) parts.push(`${r.arrowsRemoved} arrows removidas`);
  if (r.clustersUpdated > 0) parts.push(`${r.clustersUpdated} clusters atualizados`);
  if (parts.length === 0) return '';
  return `Board atualizado: ${parts.join(', ')}`;
}

export function hasChanges(r: ReconcileResult): boolean {
  return Object.values(r).some(v => v > 0);
}
```

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run tests/analytics/boardReconciler.test.ts`
Expected: todos passam

- [ ] **Step 5: Commit**

```bash
~/.claude/scripts/commit.sh "feat: boardReconciler — reconcilia dados stale do Board (funcao pura + testes)"
```

---

## Task 3: Integrar no BoardView

**Files:**
- Modify: `src/analytics/views/boardView.ts:92-107`

- [ ] **Step 1: Adicionar import e chamada**

No topo do arquivo, adicionar:
```typescript
import { reconcileBoard, buildSummary, hasChanges } from '../board/boardReconciler';
```

No `onOpen()`, entre `loadBoard()` (linha 94) e o `clearAllHandler` (linha 97), adicionar:

```typescript
      // Reconcile stale data
      if (this.canvasState) {
        const data = await this.plugin.loadConsolidatedData();
        const result = reconcileBoard(
          this.canvasState.canvas,
          this.plugin.registry,
          data,
          this.app,
        );
        if (hasChanges(result)) {
          this.canvasState.canvas.renderAll();
          this.scheduleSave();
          new Notice(buildSummary(result));
        }
      }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: zero erros

- [ ] **Step 3: Rodar todos os testes**

Run: `npm run test`
Expected: todos passam (1504+)

- [ ] **Step 4: Commit**

```bash
~/.claude/scripts/commit.sh "feat: Board refresh on open — reconcilia stale data com Notice informativo"
```

---

## Task 4: Build demo e push

- [ ] **Step 1: Copiar build pro demo vault**

```bash
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

- [ ] **Step 2: Rodar e2e**

Run: `npm run test:e2e`
Expected: 18/18 passam

- [ ] **Step 3: Commit e push**

```bash
git add demo/.obsidian/plugins/qualia-coding/main.js
~/.claude/scripts/commit.sh "chore: rebuild demo vault com Board refresh on open"
git push origin main
```
