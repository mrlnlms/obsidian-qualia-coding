# Pastas Nested — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suportar pastas aninhadas (folder dentro de folder) no codebook do Qualia Coding, com ordenação manual em todos os níveis, drag-drop completo (nest, reorder, promote) e cascade delete.

**Architecture:** Replicar simetricamente o pattern já estabelecido pra hierarquia de códigos (`parentId`/`childrenOrder`/`rootOrder` + cycle detection em `setParent`). Adiciona-se `parentId?` e `subfolderOrder?` em `FolderDefinition` e `folderOrder` em `QualiaData.registry`. `buildFlatTree` ganha recursão simétrica ao `visitCodes`. Drag-drop reusa zonas e classes CSS já existentes (§12 K2 do BACKLOG).

**Tech Stack:** TypeScript strict, Obsidian API, Vitest+jsdom.

**Spec:** `docs/superpowers/specs/2026-04-26-pastas-nested-design.md`

**Branch:** `feat/nested-folders` (NÃO criar git worktree — CLAUDE.md proíbe)

**Pré-condições resolvidas:**

- Drop em área vazia / unfiled section → no-op silently (alinha com comportamento atual de drop fora de row)
- `getDropZone` thresholds → mantém 30/70 atual (consistência com códigos)
- Drop folder no próprio parent atual com zone='inside' → no-op silently no `setFolderParent`
- `folderOrder` default `[]` em `createDefaultData` (não migration code)
- `getAllFolders` callers (3 src + 1 test file): migrar todos pra `getRootFolders + getChildFolders`

**Patterns confirmados no código existente (use estes nomes exatos):**

- `for (const fn of this.onMutateListeners) fn();` — pattern de notificação no registry (NÃO existe `this.notify()`)
- `this.generateId()` — geração de id (compartilhado entre códigos e folders)
- `this._insertInList(list, id, insertBefore)` — helper já existente em `setParent`; reusar em `setFolderParent`
- `static fromJSON(data: any): CodeDefinitionRegistry` — método static, NÃO instance
- `this.model.saveMarkers()` — pattern de persistência usado por callbacks de view (NÃO `dataManager.markDirty()` nem `this.refresh()`); refresh é mutation-driven via listeners
- `new PromptModal({ app, title, initialValue, confirmLabel, onSubmit })` — options object, NÃO positional
- `new ConfirmModal({ app, title, message, confirmLabel, destructive, onConfirm })` — options object
- `callbacks.refresh()` em `DragDropCallbacks` (NÃO `onTreeRefresh`)

---

## Chunk 1: Setup, Schema e Default Data

**Goal:** Branch criada, schema atualizado, default data com `folderOrder = []`. Build limpo.

### Task 1: Criar branch

**Files:**
- N/A (operação git)

- [ ] **Step 1: Confirmar limpeza do working tree**

Run: `git status`
Expected: working tree limpo (apenas untracked sem relação ao plano: `README.v2.md`, `scripts/safe-mode-baseline/`)

- [ ] **Step 2: Criar branch**

Run: `git checkout -b feat/nested-folders`
Expected: `Switched to a new branch 'feat/nested-folders'`

### Task 2: Atualizar schema

**Files:**
- Modify: `src/core/types.ts:108-112` (`FolderDefinition`)
- Modify: `src/core/types.ts:138-147` (`QualiaData.registry`)
- Modify: `src/core/types.ts:182-184` (`createDefaultData`)

- [ ] **Step 1: Adicionar `parentId?` e `subfolderOrder?` em `FolderDefinition`**

```ts
export interface FolderDefinition {
  id: string;
  name: string;
  parentId?: string;          // undefined = root folder
  subfolderOrder?: string[];  // ordem manual dos folders filhos; ausente = fallback alfabético
  createdAt: number;
}
```

- [ ] **Step 2: Adicionar `folderOrder` em `QualiaData.registry`**

```ts
registry: {
  definitions: Record<string, CodeDefinition>;
  nextPaletteIndex: number;
  folders: Record<string, FolderDefinition>;
  folderOrder: string[];   // novo: ordem manual dos folders root
  rootOrder: string[];
  groups: Record<string, GroupDefinition>;
  groupOrder: string[];
  nextGroupPaletteIndex: number;
};
```

- [ ] **Step 3: Atualizar `createDefaultData`**

```ts
registry: { definitions: {}, nextPaletteIndex: 0, folders: {}, folderOrder: [], rootOrder: [], groups: {}, groupOrder: [], nextGroupPaletteIndex: 0 },
```

- [ ] **Step 4: Verificar tsc**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: erros novos apenas em `codeDefinitionRegistry.ts` (não conhece `folderOrder` ainda) — esperado, será resolvido na Task 4.

### Task 3: Atualizar serialização do registry

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts` — `toJSON` e `fromJSON`

- [ ] **Step 1: Localizar `toJSON`**

Run: `grep -n "toJSON\|fromJSON" src/core/codeDefinitionRegistry.ts`
Expected: linhas próximas a 666-696.

- [ ] **Step 2: Adicionar campo `folderOrder` na classe**

No corpo da classe (próximo ao `rootOrder: string[] = []` existente):

```ts
folderOrder: string[] = [];
```

- [ ] **Step 3: Adicionar `folderOrder` em `toJSON`**

`toJSON` em `codeDefinitionRegistry.ts:666-696` tem return type literal explícito que **PRECISA ser atualizado**:

```ts
toJSON(): {
  definitions: Record<string, CodeDefinition>;
  nextPaletteIndex: number;
  rootOrder: string[];
  folders: Record<string, FolderDefinition>;
  folderOrder: string[];     // NOVO
  groups: Record<string, GroupDefinition>;
  groupOrder: string[];
  nextGroupPaletteIndex: number;
} {
  // ...
  return {
    definitions,
    nextPaletteIndex: this.nextPaletteIndex,
    rootOrder: this.rootOrder,
    folders,
    folderOrder: this.folderOrder,  // NOVO
    groups,
    groupOrder: this.groupOrder,
    nextGroupPaletteIndex: this.nextGroupPaletteIndex,
  };
}
```

- [ ] **Step 4: Adicionar `folderOrder` em `fromJSON` com fallback**

`fromJSON` é **static** (linha 698), e recebe `data` como o payload do registry direto (não `data.registry`). Após o bloco `if (data?.folders) {...}` que existe em ~713, adicionar:

```ts
registry.folderOrder = Array.isArray(data?.folderOrder) ? data.folderOrder : [];
```

(Fallback `[]` cobre vault de teste sem o campo. Não é migration code; é defensivo de runtime.)

- [ ] **Step 5: tsc deve passar**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

### Task 4: Commit

- [ ] **Step 1: Add e commit**

```bash
git add src/core/types.ts src/core/codeDefinitionRegistry.ts
~/.claude/scripts/commit.sh "feat(folders): schema com parentId/subfolderOrder/folderOrder"
```

---

## Chunk 2: Registry Queries

**Goal:** APIs de leitura novas (`getRootFolders`, `getChildFolders`, `getFolderAncestors`, `getFolderDescendants`) + remoção de `getAllFolders` (com migração dos 3 callers em src). TDD.

### Task 5: Criar arquivo de teste novo

**Files:**
- Create: `tests/core/codeDefinitionRegistry.folderHierarchy.test.ts`

- [ ] **Step 1: Criar arquivo com setup**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('CodeDefinitionRegistry — folder hierarchy', () => {
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    registry = new CodeDefinitionRegistry();
  });

  // testes serão adicionados nas próximas tasks
});
```

### Task 6: Implementar `getRootFolders` (TDD)

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Modify: `tests/core/codeDefinitionRegistry.folderHierarchy.test.ts`

- [ ] **Step 1: Test failing**

Adicionar dentro do `describe`:

```ts
describe('getRootFolders', () => {
  it('returns only root folders (no parentId), respecting folderOrder', () => {
    const a = registry.createFolder('A');
    const b = registry.createFolder('B');
    const c = registry.createFolder('C');
    // Set b as child of a (parentId), keep a and c as root
    (registry as any).folders.get(b.id).parentId = a.id;
    // Default folderOrder após createFolder: [a.id, b.id, c.id]; remover b da raiz
    (registry as any).folderOrder = [a.id, c.id];

    const roots = registry.getRootFolders();
    expect(roots.map(f => f.id)).toEqual([a.id, c.id]);
  });

  it('returns empty array when no folders exist', () => {
    expect(registry.getRootFolders()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `npx vitest run tests/core/codeDefinitionRegistry.folderHierarchy.test.ts -t 'getRootFolders' 2>&1 | tail -20`
Expected: FAIL — `getRootFolders is not a function`

- [ ] **Step 3: Implementar**

Em `codeDefinitionRegistry.ts` (logo após o método `getFolderById`):

```ts
getRootFolders(): FolderDefinition[] {
  const result: FolderDefinition[] = [];
  for (const id of this.folderOrder) {
    const f = this.folders.get(id);
    if (f && !f.parentId) result.push(f);
  }
  // Também inclui folders root sem entrada em folderOrder (defensivo)
  for (const f of this.folders.values()) {
    if (!f.parentId && !this.folderOrder.includes(f.id)) {
      result.push(f);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test → PASS**

Expected: PASS.

### Task 7: Implementar `getChildFolders` (TDD)

**Files:**
- Same.

- [ ] **Step 1: Test failing (versão SEM `createFolder(name, parentId)` — `createFolder` só ganha 2º arg na Task 14)**

Como `createFolder` ainda não aceita `parentId` neste ponto, simular nesting via mutação direta (`as any`). Os mesmos cenários serão re-testados via API natural depois da Task 14.

```ts
it('returns children of given parent, respecting subfolderOrder', () => {
  const parent = registry.createFolder('parent');
  const c1 = registry.createFolder('c1');
  const c2 = registry.createFolder('c2');
  (registry as any).folders.get(c1.id).parentId = parent.id;
  (registry as any).folders.get(c2.id).parentId = parent.id;
  (registry as any).folders.get(parent.id).subfolderOrder = [c1.id, c2.id];

  expect(registry.getChildFolders(parent.id).map(f => f.id)).toEqual([c1.id, c2.id]);
});

it('falls back to alphabetical order when subfolderOrder is missing', () => {
  const parent = registry.createFolder('parent');
  const z = registry.createFolder('zebra');
  const a = registry.createFolder('apple');
  (registry as any).folders.get(z.id).parentId = parent.id;
  (registry as any).folders.get(a.id).parentId = parent.id;
  // sem subfolderOrder

  const children = registry.getChildFolders(parent.id);
  expect(children.map(f => f.name)).toEqual(['apple', 'zebra']);
});

it('returns empty array when folder has no children', () => {
  const f = registry.createFolder('f');
  expect(registry.getChildFolders(f.id)).toEqual([]);
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest run tests/core/codeDefinitionRegistry.folderHierarchy.test.ts -t 'getChildFolders' 2>&1 | tail -20`
Expected: FAIL — `getChildFolders is not a function`.

- [ ] **Step 3: Implementar**

```ts
getChildFolders(parentId: string): FolderDefinition[] {
  const parent = this.folders.get(parentId);
  if (!parent) return [];
  const order = parent.subfolderOrder;
  if (order && order.length > 0) {
    const result: FolderDefinition[] = [];
    for (const id of order) {
      const f = this.folders.get(id);
      if (f && f.parentId === parentId) result.push(f);
    }
    // Children fora do order vão no fim, alfabéticos
    const fallbacks: FolderDefinition[] = [];
    for (const f of this.folders.values()) {
      if (f.parentId === parentId && !order.includes(f.id)) {
        fallbacks.push(f);
      }
    }
    fallbacks.sort((a, b) => a.name.localeCompare(b.name));
    return [...result, ...fallbacks];
  }
  // Fallback alfabético
  const all = Array.from(this.folders.values()).filter(f => f.parentId === parentId);
  all.sort((a, b) => a.name.localeCompare(b.name));
  return all;
}
```

- [ ] **Step 4: Run → PASS**

### Task 8: Implementar `getFolderAncestors` e `getFolderDescendants` (TDD)

- [ ] **Step 1: Test failing**

```ts
describe('getFolderAncestors / getFolderDescendants', () => {
  it('getFolderAncestors returns chain from immediate parent to root', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b');
    const c = registry.createFolder('c');
    (registry as any).folders.get(b.id).parentId = a.id;
    (registry as any).folders.get(c.id).parentId = b.id;

    expect(registry.getFolderAncestors(c.id).map(f => f.id)).toEqual([b.id, a.id]);
  });

  it('getFolderDescendants returns recursive descendants (DFS)', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b');
    const c = registry.createFolder('c');
    const d = registry.createFolder('d');
    (registry as any).folders.get(b.id).parentId = a.id;
    (registry as any).folders.get(c.id).parentId = a.id;
    (registry as any).folders.get(d.id).parentId = b.id;

    const desc = registry.getFolderDescendants(a.id);
    const ids = new Set(desc.map(f => f.id));
    expect(ids).toEqual(new Set([b.id, c.id, d.id]));
  });

  it('getFolderAncestors returns [] for root folder', () => {
    const a = registry.createFolder('a');
    expect(registry.getFolderAncestors(a.id)).toEqual([]);
  });

  it('getFolderDescendants returns [] for leaf folder', () => {
    const a = registry.createFolder('a');
    expect(registry.getFolderDescendants(a.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar**

```ts
getFolderAncestors(folderId: string): FolderDefinition[] {
  const result: FolderDefinition[] = [];
  let cursor = this.folders.get(folderId)?.parentId;
  while (cursor) {
    const f = this.folders.get(cursor);
    if (!f) break;
    result.push(f);
    cursor = f.parentId;
  }
  return result;
}

getFolderDescendants(folderId: string): FolderDefinition[] {
  const result: FolderDefinition[] = [];
  const stack: string[] = [folderId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const f of this.folders.values()) {
      if (f.parentId === current) {
        result.push(f);
        stack.push(f.id);
      }
    }
  }
  return result;
}
```

- [ ] **Step 4: Run → PASS**

### Task 9: Remover `getAllFolders` da classe

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts:503-510`

- [ ] **Step 1: Localizar e deletar método**

Run: `grep -n "getAllFolders" src/core/codeDefinitionRegistry.ts`
Expected: linha 503 (definição).

Remover o método completo (5-8 linhas).

- [ ] **Step 2: tsc deve quebrar nos callers**

Run: `npx tsc --noEmit 2>&1 | grep "getAllFolders"`
Expected: 2 erros (`hierarchyHelpers.ts:66`, `codebookContextMenu.ts:44`).

### Task 10: Migrar `getAllFolders` callers em src

**Files:**
- Modify: `src/core/hierarchyHelpers.ts:66`
- Modify: `src/core/codebookContextMenu.ts:44`

- [ ] **Step 1: `hierarchyHelpers.ts:66` — substituir**

Esta linha está dentro de `buildFlatTree`. Como vamos reescrever `buildFlatTree` no Chunk 5 inteiro, substituir agora por:

```ts
const folders = registry.getRootFolders();
```

A semântica original (`getAllFolders` retornava sorted alphabetically) será preservada quando `folderOrder = []` (o `getRootFolders` cai pra defensive include de tudo sem parentId — adicionar `.sort` se necessário). Por simplicidade e porque buildFlatTree muda totalmente no Chunk 5, **deixar como `getRootFolders()` por ora — o teste atual de folderTree.test.ts pode quebrar temporariamente; corrigir no Chunk 5**.

- [ ] **Step 2: `codebookContextMenu.ts:44` — substituir**

```ts
// Antes:  const folders = registry.getAllFolders();
// Depois: const folders = registry.getRootFolders();
```

(Aqui a semântica é "todas as pastas pra opção Move to folder". Como Move-to-folder não diferencia nested ainda, root suffix; **TODO**: decidir no Chunk 7 se "Move to folder" deve listar nested folders com path. Por ora `getRootFolders` é compatível com comportamento pré-nested.)

- [ ] **Step 3: tsc passa**

Run: `npx tsc --noEmit 2>&1 | grep "getAllFolders"`
Expected: vazio.

- [ ] **Step 4: Run só `folderRegistry` tests pra confirmar quebra esperada**

Run: `npx vitest run tests/core/folderRegistry.test.ts 2>&1 | tail -10`
Expected: `tests/core/folderRegistry.test.ts` quebra (8 chamadas a `getAllFolders`). Outros suites ainda passam. Migração na próxima task.

(Não rode suite completa entre commits — `folderTree.test.ts` também pode quebrar entre Chunk 2 e Chunk 4 porque `buildFlatTree` foi migrado pra `getRootFolders` mas ainda não foi reescrito recursivo. Re-run completo só após Task 21.)

### Task 11: Migrar `getAllFolders` callers em testes existentes

**Files:**
- Modify: `tests/core/folderRegistry.test.ts:24,27,142,147,148,150,155,180`

- [ ] **Step 1: Substituir todas as 8 ocorrências de `getAllFolders` → `getRootFolders`**

Run: `grep -n "getAllFolders" tests/core/folderRegistry.test.ts`

Para cada linha, substituir por `getRootFolders`. **Atenção semantic**: o test antigo na linha 24 (`getAllFolders returns all folders sorted by name`) testa **ordenação alfabética**. `getRootFolders` agora respeita `folderOrder` (ordem manual de criação), NÃO alfabética. Esse test específico precisa ser **substituído**, não só renomeado.

- [ ] **Step 2: Substituir o test da linha 24 por novo contrato**

```ts
it('getRootFolders returns root folders in folderOrder (creation order)', () => {
  const f1 = registry.createFolder('zebra');
  const f2 = registry.createFolder('apple');
  const f3 = registry.createFolder('mango');

  // Ordem é a de criação (folderOrder), não alfabética
  expect(registry.getRootFolders().map(f => f.name)).toEqual(['zebra', 'apple', 'mango']);
});
```

- [ ] **Step 3: Run folderRegistry tests**

Run: `npx vitest run tests/core/folderRegistry.test.ts`
Expected: PASS.

### Task 12: Run targeted tests

- [ ] **Step 1: Tests do Chunk 2 + folderRegistry (sem quebra)**

Run: `npx vitest run tests/core/codeDefinitionRegistry.folderHierarchy.test.ts tests/core/folderRegistry.test.ts 2>&1 | tail -10`
Expected: PASS.

**Nota:** `folderTree.test.ts` pode estar quebrado neste ponto porque `buildFlatTree` foi temporariamente trocado pra `getRootFolders` (que ignora folders sem `parentId === undefined` que não estão em `folderOrder` — defensivo cobre, mas casos sem `folderOrder` populado podem mudar ordem). Will be fixed no Chunk 4 (Task 20-21). Não rodar suite completa neste ponto.

### Task 13: Commit

- [ ] **Step 1: Commit**

```bash
git add src/core/codeDefinitionRegistry.ts \
        src/core/hierarchyHelpers.ts \
        src/core/codebookContextMenu.ts \
        tests/core/codeDefinitionRegistry.folderHierarchy.test.ts \
        tests/core/folderRegistry.test.ts
~/.claude/scripts/commit.sh "feat(folders): registry queries (getRootFolders/Children/Ancestors/Descendants), remove getAllFolders"
```

---

## Chunk 3: Registry Mutations

**Goal:** `createFolder(name, parentId?)`, `setFolderParent` com cycle detection, `deleteFolder` cascade. TDD.

### Task 14: `createFolder` aceita `parentId?` (TDD)

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts` (método `createFolder`)
- Modify: `tests/core/codeDefinitionRegistry.folderHierarchy.test.ts`

- [ ] **Step 1: Test failing**

```ts
describe('createFolder with parentId', () => {
  it('creates root folder when parentId omitted, appends to folderOrder', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b');
    expect((registry as any).folderOrder).toEqual([a.id, b.id]);
    expect(a.parentId).toBeUndefined();
  });

  it('creates child folder when parentId given, appends to subfolderOrder of parent', () => {
    const parent = registry.createFolder('parent');
    const child = registry.createFolder('child', parent.id);

    expect(child.parentId).toBe(parent.id);
    const parentDef = (registry as any).folders.get(parent.id);
    expect(parentDef.subfolderOrder).toEqual([child.id]);
  });

  it('does not add child to root folderOrder', () => {
    const parent = registry.createFolder('parent');
    const child = registry.createFolder('child', parent.id);
    expect((registry as any).folderOrder).toEqual([parent.id]);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`createFolder` ignora 2º arg ou gera erro)

- [ ] **Step 3: Implementar**

Atualizar `createFolder` (`codeDefinitionRegistry.ts:484-497`).

**Behavior change:** dedup hoje é global por `name`. Após esta mudança, dedup vira parent-scoped (`(name, parentId)`). Mesmo nome em parents diferentes vira folders distintos. Spec aceita; tests existentes em `tests/core/folderRegistry.test.ts` que usam dedup por nome continuam passando porque todos criam folders root.

```ts
createFolder(name: string, parentId?: string): FolderDefinition {
  // Dedup parent-scoped: mesmo nome em parents diferentes vira folders distintos
  for (const f of this.folders.values()) {
    if (f.name === name && f.parentId === parentId) return f;
  }
  const folder: FolderDefinition = {
    id: this.generateId(),
    name,
    createdAt: Date.now(),
    ...(parentId ? { parentId } : {}),
  };
  this.folders.set(folder.id, folder);

  if (parentId) {
    const parent = this.folders.get(parentId);
    if (parent) {
      parent.subfolderOrder = [...(parent.subfolderOrder ?? []), folder.id];
    }
  } else {
    this.folderOrder.push(folder.id);
  }

  for (const fn of this.onMutateListeners) fn();
  return folder;
}
```

- [ ] **Step 4: Run → PASS**

### Task 15: `setFolderParent` com cycle detection (TDD)

**Files:**
- Same.

- [ ] **Step 1: Tests failing**

```ts
describe('setFolderParent', () => {
  it('moves root folder to nested', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b');
    expect(registry.setFolderParent(b.id, a.id)).toBe(true);
    expect((registry as any).folders.get(b.id).parentId).toBe(a.id);
    // Removido de folderOrder, adicionado a subfolderOrder
    expect((registry as any).folderOrder).toEqual([a.id]);
    expect((registry as any).folders.get(a.id).subfolderOrder).toEqual([b.id]);
  });

  it('promotes nested to root (parentId = undefined)', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b', a.id);
    expect(registry.setFolderParent(b.id, undefined)).toBe(true);
    expect((registry as any).folders.get(b.id).parentId).toBeUndefined();
    expect((registry as any).folderOrder).toContain(b.id);
    expect((registry as any).folders.get(a.id).subfolderOrder).toEqual([]);
  });

  it('rejects cycle (A → B → C, attempt C → A)', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b', a.id);
    const c = registry.createFolder('c', b.id);
    expect(registry.setFolderParent(a.id, c.id)).toBe(false);
    expect((registry as any).folders.get(a.id).parentId).toBeUndefined();
  });

  it('rejects self-parent', () => {
    const a = registry.createFolder('a');
    expect(registry.setFolderParent(a.id, a.id)).toBe(false);
  });

  it('rejects non-existent parent', () => {
    const a = registry.createFolder('a');
    expect(registry.setFolderParent(a.id, 'nonexistent')).toBe(false);
  });

  it('inserts before sibling when insertBefore given', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b');
    const c = registry.createFolder('c');
    expect(registry.setFolderParent(c.id, undefined, b.id)).toBe(true);
    expect((registry as any).folderOrder).toEqual([a.id, c.id, b.id]);
  });

  it('no-op silently when target parent is current parent and zone=inside', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b', a.id);
    // Tenta setar pra mesmo parent — deve retornar true sem mexer (idempotente)
    expect(registry.setFolderParent(b.id, a.id)).toBe(true);
    expect((registry as any).folders.get(a.id).subfolderOrder).toEqual([b.id]);
  });
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementar**

```ts
setFolderParent(folderId: string, parentId: string | undefined, insertBefore?: string): boolean {
  const folder = this.folders.get(folderId);
  if (!folder) return false;

  if (parentId !== undefined) {
    if (parentId === folderId) return false;
    if (!this.folders.has(parentId)) return false;
    // Cycle detection: walk up from parentId
    let cursor: string | undefined = parentId;
    while (cursor) {
      if (cursor === folderId) return false;
      cursor = this.folders.get(cursor)?.parentId;
    }
  }

  // Idempotente: se já está no parent target sem insertBefore, no-op
  if (folder.parentId === parentId && insertBefore === undefined) return true;

  // Remove de location atual
  if (folder.parentId) {
    const oldParent = this.folders.get(folder.parentId);
    if (oldParent?.subfolderOrder) {
      oldParent.subfolderOrder = oldParent.subfolderOrder.filter(id => id !== folderId);
    }
  } else {
    this.folderOrder = this.folderOrder.filter(id => id !== folderId);
  }

  // Adiciona em location nova (reusa _insertInList helper existente)
  if (parentId) {
    folder.parentId = parentId;
    const newParent = this.folders.get(parentId)!;
    if (!newParent.subfolderOrder) newParent.subfolderOrder = [];
    this._insertInList(newParent.subfolderOrder, folderId, insertBefore);
  } else {
    delete folder.parentId;
    this._insertInList(this.folderOrder, folderId, insertBefore);
  }

  for (const fn of this.onMutateListeners) fn();
  return true;
}
```

**Nota:** `setParent` (códigos) não tem o early-return idempotente — `setFolderParent` adiciona pra eliminar drop "no própio parent" sem reorder espúrio. Asymmetry intencional, alinhada com decisão da spec.

- [ ] **Step 4: Run → PASS**

### Task 16: `deleteFolder` cascade (TDD)

**Files:**
- Same.

- [ ] **Step 1: Tests failing**

```ts
describe('deleteFolder cascade', () => {
  it('deletes folder, all descendant folders, and all codes within (recursive)', () => {
    const root = registry.createFolder('root');
    const sub = registry.createFolder('sub', root.id);
    const subsub = registry.createFolder('subsub', sub.id);

    const codeRoot = registry.create('codeRoot', '#000');
    registry.setCodeFolder(codeRoot.id, root.id);
    const codeSub = registry.create('codeSub', '#000');
    registry.setCodeFolder(codeSub.id, sub.id);
    const codeSubsub = registry.create('codeSubsub', '#000');
    registry.setCodeFolder(codeSubsub.id, subsub.id);

    const deleted = registry.deleteFolder(root.id);
    expect(deleted).toBe(true);

    expect(registry.getFolderById(root.id)).toBeUndefined();
    expect(registry.getFolderById(sub.id)).toBeUndefined();
    expect(registry.getFolderById(subsub.id)).toBeUndefined();
    expect(registry.getById(codeRoot.id)).toBeUndefined();
    expect(registry.getById(codeSub.id)).toBeUndefined();
    expect(registry.getById(codeSubsub.id)).toBeUndefined();

    expect((registry as any).folderOrder).not.toContain(root.id);
  });

  it('removes deleted folder from parent\'s subfolderOrder', () => {
    const parent = registry.createFolder('parent');
    const child = registry.createFolder('child', parent.id);

    registry.deleteFolder(child.id);
    expect((registry as any).folders.get(parent.id).subfolderOrder).toEqual([]);
  });

  it('returns false for non-existent folder', () => {
    expect(registry.deleteFolder('nonexistent')).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`deleteFolder` atual não cascade)

- [ ] **Step 3: Implementar**

Substituir `deleteFolder` existente:

```ts
deleteFolder(id: string): boolean {
  const folder = this.folders.get(id);
  if (!folder) return false;

  // 1. Coletar todos os folders afetados (self + descendants)
  const allAffected = [folder, ...this.getFolderDescendants(id)];

  // 2. Deletar todos os códigos dentro desses folders
  for (const f of allAffected) {
    const codesInFolder = this.getCodesInFolder(f.id);
    for (const code of codesInFolder) {
      this.delete(code.id);  // cuida de markers/relations via mecanismo existente
    }
  }

  // 3. Deletar todos os sub-folders (descendants)
  for (const f of allAffected) {
    if (f.id !== id) this.folders.delete(f.id);
  }

  // 4. Deletar self e remover de folderOrder/subfolderOrder do parent
  this.folders.delete(id);
  if (folder.parentId) {
    const parent = this.folders.get(folder.parentId);
    if (parent?.subfolderOrder) {
      parent.subfolderOrder = parent.subfolderOrder.filter(x => x !== id);
    }
  } else {
    this.folderOrder = this.folderOrder.filter(x => x !== id);
  }

  for (const fn of this.onMutateListeners) fn();
  return true;
}
```

- [ ] **Step 4: Run → PASS**

### Task 17: Round-trip JSON com nested folders (TDD)

- [ ] **Step 1: Test**

```ts
describe('JSON round-trip with nested folders', () => {
  it('preserves parentId and subfolderOrder', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b', a.id);
    const c = registry.createFolder('c', a.id);

    const json = registry.toJSON();
    const restored = CodeDefinitionRegistry.fromJSON(json);  // static!

    const restoredA = restored.getFolderById(a.id)!;
    expect(restoredA.subfolderOrder).toEqual([b.id, c.id]);
    expect(restored.getFolderById(b.id)?.parentId).toBe(a.id);
    expect((restored as any).folderOrder).toEqual([a.id]);
  });
});
```

- [ ] **Step 2: Run → PASS** (deve passar de cara, dado que toJSON/fromJSON já cobrem `folders` map e `folderOrder`)

Se falhar, ajustar `fromJSON` pra preservar `parentId` e `subfolderOrder` no restore.

### Task 18: Run targeted tests + commit

- [ ] **Step 1: Tests do Chunk 3 (sem suite completa)**

Run: `npx vitest run tests/core/codeDefinitionRegistry.folderHierarchy.test.ts tests/core/folderRegistry.test.ts 2>&1 | tail -10`
Expected: PASS.

**Mesma razão da Task 12:** `folderTree.test.ts` ainda em estado intermediário até `buildFlatTree` ser reescrito no Chunk 4 (Task 20). Suite completa só roda em Task 21.

- [ ] **Step 2: Commit**

```bash
git add src/core/codeDefinitionRegistry.ts \
        tests/core/codeDefinitionRegistry.folderHierarchy.test.ts
~/.claude/scripts/commit.sh "feat(folders): mutations (createFolder com parentId, setFolderParent, deleteFolder cascade)"
```

---

## Chunk 4: Tree Builder (`buildFlatTree`)

**Goal:** `FlatFolderNode.depth` dinâmico, `buildFlatTree` recursivo, search auto-expande folder ancestors. TDD via `folderTree.test.ts` (ampliar existente).

### Task 19: Atualizar tipo `FlatFolderNode`

**Files:**
- Modify: `src/core/hierarchyHelpers.ts:19-27`

- [ ] **Step 1: Mudar `depth: 0` → `depth: number`**

```ts
export interface FlatFolderNode {
  type: 'folder';
  folderId: string;
  name: string;
  depth: number;        // antes: 0 hardcoded
  hasChildren: boolean;
  isExpanded: boolean;
  codeCount: number;
}
```

- [ ] **Step 2: tsc deve passar**

Run: `npx tsc --noEmit`
Expected: sem novos erros (consumidores aceitam `number` ⊇ `0`).

### Task 20: Reescrever `buildFlatTree` com recursão (TDD via folderTree.test.ts)

**Files:**
- Modify: `src/core/hierarchyHelpers.ts:61-147`
- Modify: `tests/core/folderTree.test.ts`

- [ ] **Step 1: Adicionar tests novos em folderTree.test.ts**

```ts
describe('nested folders', () => {
  it('renders nested folder at depth 1', () => {
    const root = registry.createFolder('root');
    const sub = registry.createFolder('sub', root.id);

    const expanded = createExpandedState();
    expanded.folders.add(root.id);
    const tree = buildFlatTree(registry, expanded);

    expect(tree.length).toBe(2);
    expect(tree[0]).toMatchObject({ type: 'folder', folderId: root.id, depth: 0 });
    expect(tree[1]).toMatchObject({ type: 'folder', folderId: sub.id, depth: 1 });
  });

  it('renders deep nesting (depth 3)', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b', a.id);
    const c = registry.createFolder('c', b.id);
    const d = registry.createFolder('d', c.id);

    const expanded = createExpandedState();
    expanded.folders.add(a.id);
    expanded.folders.add(b.id);
    expanded.folders.add(c.id);
    const tree = buildFlatTree(registry, expanded);

    const depths = tree.filter(n => n.type === 'folder').map(n => (n as any).depth);
    expect(depths).toEqual([0, 1, 2, 3]);
  });

  it('subfolder collapsed hides nested folders and codes', () => {
    const root = registry.createFolder('root');
    const sub = registry.createFolder('sub', root.id);
    const code = registry.create('code', '#000');
    registry.setCodeFolder(code.id, sub.id);

    const expanded = createExpandedState();
    expanded.folders.add(root.id); // root expanded, sub collapsed

    const tree = buildFlatTree(registry, expanded);
    const ids = tree.map(n => n.type === 'folder' ? n.folderId : n.def.id);
    expect(ids).toEqual([root.id, sub.id]);  // sub aparece, conteúdo dela não
  });

  it('hasChildren true if folder has subfolders OR codes', () => {
    const root1 = registry.createFolder('root1');
    registry.createFolder('sub', root1.id);
    const root2 = registry.createFolder('root2');
    const code = registry.create('code', '#000');
    registry.setCodeFolder(code.id, root2.id);

    const expanded = createExpandedState();
    const tree = buildFlatTree(registry, expanded);

    const folder1 = tree.find(n => n.type === 'folder' && n.folderId === root1.id) as FlatFolderNode;
    const folder2 = tree.find(n => n.type === 'folder' && n.folderId === root2.id) as FlatFolderNode;
    expect(folder1.hasChildren).toBe(true);
    expect(folder2.hasChildren).toBe(true);
  });

  it('search auto-expands folder ancestors when matching code is in deep folder', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b', a.id);
    const code = registry.create('special', '#000');
    registry.setCodeFolder(code.id, b.id);

    const tree = buildFlatTree(registry, createExpandedState(), 'special');
    const ids = tree.map(n => n.type === 'folder' ? n.folderId : n.def.id);
    expect(ids).toContain(a.id);  // ancestor revealed
    expect(ids).toContain(b.id);  // immediate parent revealed
    expect(ids).toContain(code.id);
  });
});
```

- [ ] **Step 2: Run tests → FAIL** (buildFlatTree antigo não trata nested)

Run: `npx vitest run tests/core/folderTree.test.ts -t 'nested folders' 2>&1 | tail -20`

- [ ] **Step 3: Reescrever `buildFlatTree`**

Substituir o corpo do método em `hierarchyHelpers.ts`:

```ts
export function buildFlatTree(
  registry: CodeDefinitionRegistry,
  expanded: ExpandedState,
  searchQuery?: string,
): FlatTreeNode[] {
  let visibleCodeIds: Set<string> | null = null;
  let visibleFolderIds: Set<string> | null = null;
  let forceExpanded: ExpandedState | null = null;

  if (searchQuery && searchQuery.trim().length > 0) {
    const query = searchQuery.trim().toLowerCase();
    visibleCodeIds = new Set<string>();
    visibleFolderIds = new Set<string>();
    forceExpanded = createExpandedState();

    for (const def of registry.getAll()) {
      if (def.name.toLowerCase().includes(query)) {
        visibleCodeIds.add(def.id);
        for (const ancestor of registry.getAncestors(def.id)) {
          visibleCodeIds.add(ancestor.id);
          forceExpanded.codes.add(ancestor.id);
        }
        if (def.folder) {
          visibleFolderIds.add(def.folder);
          forceExpanded.folders.add(def.folder);
          // NEW: also reveal folder ancestors
          for (const folderAnc of registry.getFolderAncestors(def.folder)) {
            visibleFolderIds.add(folderAnc.id);
            forceExpanded.folders.add(folderAnc.id);
          }
        }
      }
    }
  }

  const result: FlatTreeNode[] = [];

  const visitCodes = (codes: CodeDefinition[], depth: number): void => {
    for (const def of codes) {
      if (visibleCodeIds && !visibleCodeIds.has(def.id)) continue;

      const children = registry.getChildren(def.id);
      const hasChildren = children.length > 0;
      const isExpanded = forceExpanded?.codes.has(def.id) || expanded.codes.has(def.id);

      result.push({ type: 'code', def, depth, hasChildren, isExpanded: hasChildren && isExpanded });

      if (hasChildren && isExpanded) {
        visitCodes(children, depth + 1);
      }
    }
  };

  const visitFolders = (folders: FolderDefinition[], depth: number): void => {
    for (const folder of folders) {
      if (visibleFolderIds && !visibleFolderIds.has(folder.id)) continue;

      const childFolders = registry.getChildFolders(folder.id);
      const codesInFolder = registry.getCodesInFolder(folder.id);
      const folderCodeIds = new Set(codesInFolder.map(c => c.id));
      const rootCodesInFolder = codesInFolder.filter(
        c => !c.parentId || !folderCodeIds.has(c.parentId)
      );

      const hasChildren = childFolders.length > 0 || codesInFolder.length > 0;
      const isExpanded = forceExpanded?.folders.has(folder.id) || expanded.folders.has(folder.id);

      result.push({
        type: 'folder',
        folderId: folder.id,
        name: folder.name,
        depth,
        hasChildren,
        isExpanded: hasChildren && isExpanded,
        codeCount: codesInFolder.length,
      });

      if (hasChildren && isExpanded) {
        visitFolders(childFolders, depth + 1);
        visitCodes(rootCodesInFolder, depth + 1);
      }
    }
  };

  visitFolders(registry.getRootFolders(), 0);

  // Unfiled root codes (no folder, no parentId) — depth 0
  const unfiledRoots = registry.getRootCodes().filter(d => !d.folder);
  if (visibleCodeIds) {
    visitCodes(unfiledRoots.filter(d => visibleCodeIds!.has(d.id)), 0);
  } else {
    visitCodes(unfiledRoots, 0);
  }

  return result;
}
```

Adicionar import necessário no topo:

```ts
import type { FolderDefinition } from './types';
```

- [ ] **Step 4: Run new tests → PASS**

Run: `npx vitest run tests/core/folderTree.test.ts -t 'nested folders'`
Expected: PASS.

- [ ] **Step 5: Run all folderTree tests → PASS**

Run: `npx vitest run tests/core/folderTree.test.ts`
Expected: PASS (legacy tests devem continuar passando, dado que a lógica é simétrica).

### Task 21: Run full suite + commit

- [ ] **Step 1: Run**

Run: `npm run test 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add src/core/hierarchyHelpers.ts tests/core/folderTree.test.ts
~/.claude/scripts/commit.sh "feat(folders): buildFlatTree recursivo + search auto-expande folder ancestors"
```

---

## Chunk 5: Drag-Drop Folder

**Goal:** Folder rows draggable, drop semantics (nest/reorder/promote), cycle preview rejection. Tests novos.

### Task 22: Folder row draggable

**Files:**
- Modify: `src/core/codebookTreeRenderer.ts:121-178` (folder rendering)

- [ ] **Step 1: Adicionar `draggable=true` em folder rows**

Localizar onde folder row é criado. Adicionar:

```ts
folderRow.draggable = true;
folderRow.dataset.folderId = folder.folderId;
```

(O `data-folder-id` já existe pra hover/drop target — confirmar; só adicionar `draggable`.)

- [ ] **Step 2: Build verifica**

Run: `npx tsc --noEmit`
Expected: sem erros.

### Task 23: Drag-drop folder handlers (TDD)

**Files:**
- Modify: `src/core/codebookDragDrop.ts`
- Create: `tests/core/codebookDragDrop.test.ts`

- [ ] **Step 1: Criar test file novo**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('Folder drag-drop semantics (logic-level)', () => {
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    registry = new CodeDefinitionRegistry();
  });

  it('drop folder INSIDE another folder → setFolderParent', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b');
    expect(registry.setFolderParent(b.id, a.id)).toBe(true);
    expect((registry as any).folders.get(b.id).parentId).toBe(a.id);
  });

  it('drop folder BEFORE root sibling → reorder folderOrder', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b');
    const c = registry.createFolder('c');
    expect(registry.setFolderParent(c.id, undefined, a.id)).toBe(true);
    expect((registry as any).folderOrder).toEqual([c.id, a.id, b.id]);
  });

  it('drop nested folder BEFORE/AFTER root sibling promotes to root', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b', a.id);
    expect(registry.setFolderParent(b.id, undefined, a.id)).toBe(true);
    expect((registry as any).folders.get(b.id).parentId).toBeUndefined();
    expect((registry as any).folderOrder).toEqual([b.id, a.id]);
  });

  it('drop folder onto self rejected', () => {
    const a = registry.createFolder('a');
    expect(registry.setFolderParent(a.id, a.id)).toBe(false);
  });

  it('drop folder onto descendant rejected (cycle)', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b', a.id);
    expect(registry.setFolderParent(a.id, b.id)).toBe(false);
  });
});
```

(Esses tests são mais focados em verificar a lógica de `setFolderParent` aplicada via cenários drag-drop. UI-level tests seriam complexos demais via jsdom — ficam pra smoke test manual.)

- [ ] **Step 2: Run → PASS** (já implementado no Chunk 3)

Run: `npx vitest run tests/core/codebookDragDrop.test.ts`
Expected: PASS.

### Task 24: Implementar handlers drag-drop folder em `codebookDragDrop.ts`

**Files:**
- Modify: `src/core/codebookDragDrop.ts`

Adicionar suporte a folder drag (paralelo ao code drag existente):

- [ ] **Step 1: Adicionar variável de state**

Próximo a `let draggedCodeId: string | null = null;`:

```ts
let draggedFolderId: string | null = null;
```

- [ ] **Step 2: Atualizar `onDragStart` pra suportar folder**

```ts
const onDragStart = (e: DragEvent) => {
  const codeRow = findRow(e.target);
  if (codeRow) {
    draggedCodeId = codeRow.dataset.codeId ?? null;
    if (!draggedCodeId) return;
    codeRow.classList.add('is-dragging');
    document.body.classList.add(BODY_DRAGGING_CLASS);
    e.dataTransfer?.setData('text/plain', draggedCodeId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    return;
  }
  // NEW: folder drag
  const folderRow = findFolderRow(e.target);
  if (folderRow) {
    draggedFolderId = folderRow.dataset.folderId ?? null;
    if (!draggedFolderId) return;
    folderRow.classList.add('is-dragging');
    document.body.classList.add(BODY_DRAGGING_CLASS);
    e.dataTransfer?.setData('text/plain', draggedFolderId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
};
```

- [ ] **Step 3: Atualizar `onDragOver` pra detectar folder dragging**

Adicionar bloco no início de `onDragOver`, antes do `if (!draggedCodeId) return`:

```ts
const onDragOver = (e: DragEvent) => {
  // NEW: folder being dragged
  if (draggedFolderId) {
    e.preventDefault();
    clearIndicators();
    resetHoverMemo();

    const folderRow = findFolderRow(e.target);
    if (!folderRow || folderRow.dataset.folderId === draggedFolderId) return;
    const targetFolderId = folderRow.dataset.folderId;
    if (!targetFolderId) return;

    // Cycle detection: target não pode ser descendente do dragged
    const descendants = registry.getFolderDescendants(draggedFolderId);
    if (descendants.some(d => d.id === targetFolderId)) {
      // não permitir drop visual; opcional: aplicar is-drop-rejected
      return;
    }

    const zone = getDropZone(folderRow, e.clientY);
    lastHoverZone = zone;
    lastHoverFolderRow = folderRow;

    if (zone === 'inside') {
      folderRow.classList.add('is-folder-drop-target');
    } else {
      showIndicatorAt(folderRow, zone === 'before' ? 'top' : 'bottom');
    }
    return;
  }

  if (!draggedCodeId) return;
  // ... resto do handler atual
```

- [ ] **Step 4: Atualizar `onDrop`**

No início, antes do bloco de código drop:

```ts
const onDrop = (e: DragEvent) => {
  // NEW: folder drop
  if (draggedFolderId) {
    e.preventDefault();
    const folderRow = lastHoverFolderRow ?? findFolderRow(e.target);
    if (!folderRow || folderRow.dataset.folderId === draggedFolderId) {
      cleanupFolderDrag();
      return;
    }
    const targetFolderId = folderRow.dataset.folderId;
    if (!targetFolderId) {
      cleanupFolderDrag();
      return;
    }

    const zone = lastHoverZone ?? getDropZone(folderRow, e.clientY);
    let success = false;

    if (zone === 'inside') {
      success = registry.setFolderParent(draggedFolderId, targetFolderId);
    } else {
      const targetParent = registry.getFolderById(targetFolderId)?.parentId;
      const insertBefore = zone === 'before' ? targetFolderId : undefined;
      // 'after' → insertBefore = id do próximo sibling (ou undefined pra append)
      let insertBeforeFinal = insertBefore;
      if (zone === 'after') {
        const siblings = targetParent
          ? registry.getChildFolders(targetParent)
          : registry.getRootFolders();
        const idx = siblings.findIndex(f => f.id === targetFolderId);
        insertBeforeFinal = siblings[idx + 1]?.id;
      }
      success = registry.setFolderParent(draggedFolderId, targetParent, insertBeforeFinal);
    }

    if (!success) {
      rejectDrop(folderRow, 'Cannot move folder there.');
    } else {
      preserveScroll(() => callbacks.refresh());  // refresh() existente em DragDropCallbacks
      // highlight after refresh
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const row = container.querySelector<HTMLElement>(`[data-folder-id="${CSS.escape(draggedFolderId!)}"]`);
        if (!row) return;
        row.classList.add('is-just-dropped');
        setTimeout(() => row.classList.remove('is-just-dropped'), 650);
      }));
    }

    cleanupFolderDrag();
    return;
  }

  // ... resto do handler atual (code drop)
};

const cleanupFolderDrag = () => {
  if (draggedFolderId) {
    const row = container.querySelector<HTMLElement>(`[data-folder-id="${CSS.escape(draggedFolderId)}"]`);
    row?.classList.remove('is-dragging');
  }
  draggedFolderId = null;
  document.body.classList.remove(BODY_DRAGGING_CLASS);
  clearIndicators();
  resetHoverMemo();
  cancelFolderHoverTimer();
};
```

- [ ] **Step 5: Atualizar `onDragEnd` (limpar `draggedFolderId`)**

Localizar `onDragEnd` (provavelmente próximo a 280-300):

```ts
const onDragEnd = () => {
  if (draggedCodeId) {
    /* existing cleanup */
  }
  if (draggedFolderId) cleanupFolderDrag();
};
```

- [ ] **Step 6: Confirmar `callbacks.refresh` existe**

`DragDropCallbacks` em `codebookDragDrop.ts:26-35` já tem `refresh(): void` (linha 32) — esta é a callback usada pelos handlers de código existentes. Folder drop reusa o mesmo. Sem mudança necessária no interface.

- [ ] **Step 7: Build e tests**

Run: `npx tsc --noEmit && npm run test 2>&1 | tail -10`
Expected: PASS.

### Task 25: Commit

- [ ] **Step 1: Commit**

```bash
git add src/core/codebookDragDrop.ts \
        src/core/codebookTreeRenderer.ts \
        tests/core/codebookDragDrop.test.ts
~/.claude/scripts/commit.sh "feat(folders): drag-drop folder (nest, reorder, promote, cycle rejection)"
```

---

## Chunk 6: Context Menu + Delete Cascade UI

**Goal:** "New subfolder" no context menu, `promptDeleteFolder` com cascade confirm, helper `collectAllCodesUnderFolder`.

### Task 26: "New subfolder" no context menu

**Files:**
- Modify: `src/core/codebookContextMenu.ts:131-153`
- Modify: `src/core/baseCodeDetailView.ts` (callbacks)

- [ ] **Step 1: Estender `FolderContextMenuCallbacks`**

```ts
export interface FolderContextMenuCallbacks {
  promptCreateSubfolder(parentFolderId: string): void;  // NOVO
  promptRenameFolder(folderId: string): void;
  promptDeleteFolder(folderId: string): void;
}
```

- [ ] **Step 2: Adicionar item no `showFolderContextMenu`**

Localizar a função (linha 131). Adicionar item ANTES de "Rename":

```ts
menu.addItem(item =>
  item.setTitle('New subfolder')
    .setIcon('folder-plus')
    .onClick(() => callbacks.promptCreateSubfolder(folder.id))
);
```

- [ ] **Step 3: Implementar callback em `baseCodeDetailView.ts`**

Localizar o objeto `showFolderContextMenu(...)` em `baseCodeDetailView.ts:271-306` (já existe `promptRenameFolder` e `promptDeleteFolder`). Adicionar `promptCreateSubfolder` no MESMO objeto, seguindo EXATAMENTE o pattern dos vizinhos (PromptModal options-object + `this.model.saveMarkers()` pra persistir; refresh é mutation-driven via `onMutateListeners`):

```ts
promptCreateSubfolder: (parentFolderId: string) => {
  new PromptModal({
    app: this.app,
    title: 'New subfolder',
    initialValue: '',
    confirmLabel: 'Create',
    onSubmit: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      this.model.registry.createFolder(trimmed, parentFolderId);
      this.model.saveMarkers();
    },
  }).open();
},
```

Acesso via `this.model.registry` (NÃO `this.registry` direto). `PromptModal` já está importado.

- [ ] **Step 4: Build**

Run: `npx tsc --noEmit`
Expected: sem erros.

### Task 27: Delete cascade com confirm dialog

**Files:**
- Modify: `src/core/baseCodeDetailView.ts` (`promptDeleteFolder`)
- Modify: `src/core/hierarchyHelpers.ts` (helper `collectAllCodesUnderFolder`)

- [ ] **Step 1: Adicionar helper em `hierarchyHelpers.ts`**

No final do arquivo:

```ts
/**
 * Coleta todos os códigos contidos em um folder e em qualquer sub-folder (recursivo).
 * Usado pra preview do delete cascade.
 */
export function collectAllCodesUnderFolder(
  registry: CodeDefinitionRegistry,
  folderId: string,
): CodeDefinition[] {
  const folders = [folderId, ...registry.getFolderDescendants(folderId).map(f => f.id)];
  const result: CodeDefinition[] = [];
  for (const fid of folders) {
    result.push(...registry.getCodesInFolder(fid));
  }
  return result;
}
```

- [ ] **Step 2: Atualizar `promptDeleteFolder` em `baseCodeDetailView.ts:291-305`**

Substituir o callback existente (que hoje só fala "Codes will be moved to root") por versão com cascade preview. Pattern: `ConfirmModal` options-object, `this.model.saveMarkers()` pra persistir.

```ts
promptDeleteFolder: (id) => {
  const folder = this.model.registry.getFolderById(id);
  if (!folder) return;
  const subfolders = this.model.registry.getFolderDescendants(id);
  const codes = collectAllCodesUnderFolder(this.model.registry, id);

  let message = `Delete folder "${folder.name}"?`;
  if (subfolders.length > 0 || codes.length > 0) {
    message += `\n\nThis will permanently delete:`;
    if (subfolders.length > 0) {
      message += `\n  • ${subfolders.length} subfolder${subfolders.length === 1 ? '' : 's'}`;
    }
    if (codes.length > 0) {
      message += `\n  • ${codes.length} code${codes.length === 1 ? '' : 's'}`;
    }
    message += `\n\nMarkers using these codes will become orphans.`;
  }

  new ConfirmModal({
    app: this.app,
    title: 'Delete folder',
    message,
    confirmLabel: 'Delete',
    destructive: true,
    onConfirm: () => {
      this.model.registry.deleteFolder(id);
      this.model.saveMarkers();
    },
  }).open();
},
```

Importar `collectAllCodesUnderFolder` no topo do arquivo (de `./hierarchyHelpers`).

- [ ] **Step 3: Build**

Run: `npx tsc --noEmit && npm run test 2>&1 | tail -10`
Expected: PASS.

### Task 28: Test do helper (TDD pós-fato)

**Files:**
- Modify: `tests/core/folderTree.test.ts` (ou criar `tests/core/collectAllCodesUnderFolder.test.ts`)

- [ ] **Step 1: Adicionar test**

```ts
describe('collectAllCodesUnderFolder', () => {
  it('returns codes from folder + all descendants', () => {
    const a = registry.createFolder('a');
    const b = registry.createFolder('b', a.id);
    const c = registry.createFolder('c', b.id);

    const codeA = registry.create('codeA', '#000'); registry.setCodeFolder(codeA.id, a.id);
    const codeB = registry.create('codeB', '#000'); registry.setCodeFolder(codeB.id, b.id);
    const codeC = registry.create('codeC', '#000'); registry.setCodeFolder(codeC.id, c.id);
    const codeOutside = registry.create('codeOutside', '#000');

    const result = collectAllCodesUnderFolder(registry, a.id);
    const ids = result.map(c => c.id).sort();
    expect(ids).toEqual([codeA.id, codeB.id, codeC.id].sort());
    expect(ids).not.toContain(codeOutside.id);
  });
});
```

- [ ] **Step 2: Run → PASS**

### Task 29: Commit

- [ ] **Step 1: Commit**

```bash
git add src/core/codebookContextMenu.ts \
        src/core/baseCodeDetailView.ts \
        src/core/hierarchyHelpers.ts \
        tests/core/folderTree.test.ts
~/.claude/scripts/commit.sh "feat(folders): context menu New subfolder + delete cascade com confirm"
```

---

## Chunk 7: Manual Smoke Test + Docs

**Goal:** Build production, copiar pro demo vault, testar cenários reais. Atualizar docs.

### Task 30: Build production

- [ ] **Step 1: Build**

Run: `npm run build 2>&1 | tail -15`
Expected: sem erros, `main.js` gerado.

- [ ] **Step 2: Copiar pro demo vault**

Run: `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/`

### Task 31: Smoke test manual no vault de teste

Vault: `/Users/mosx/Desktop/obsidian-plugins-workbench/`

Reload o plugin (Settings → Community plugins → Disable + Enable Qualia Coding) e validar cenários:

- [ ] **Cenário 1**: Criar 3 folders root (A, B, C). Verificar ordem manual via drag (arrastar C antes de A).
- [ ] **Cenário 2**: Criar subfolder via right-click → "New subfolder" em A. Verificar nome e indentação.
- [ ] **Cenário 3**: Criar subfolder dentro do subfolder (3 níveis). Verificar visual.
- [ ] **Cenário 4**: Drag-drop folder ROOT pra dentro de outro folder. Verificar nest.
- [ ] **Cenário 5**: Drag-drop folder NESTED pra zona before/after de folder ROOT. Verificar promove a root.
- [ ] **Cenário 6**: Criar códigos dentro de folders nested em diferentes níveis.
- [ ] **Cenário 7**: Buscar por código dentro de folder profundo. Verificar auto-expand de folder ancestors.
- [ ] **Cenário 8**: Tentar drag de folder pra dentro de seu próprio descendente. Verificar Notice + shake.
- [ ] **Cenário 9**: Delete de folder com 2 subfolders + 5 códigos. Verificar confirm dialog mostra count correto. Cancel → nada acontece. Confirm → tudo deletado.
- [ ] **Cenário 10**: Reload plugin (disable/enable) e verificar que estrutura nested persistiu via `data.json`.

Anotar bugs encontrados em uma lista temporária. Se trivial, fixar no chunk; se complexo, criar follow-up plan.

### Task 32: Atualizar docs

**Files:**
- Modify: `docs/ROADMAP.md` (marcar #2b como FEITO + entry em "Implementados")
- Modify: `CLAUDE.md` (atualizar contagem de testes — provável ~2200)

- [ ] **Step 1: ROADMAP — marcar #2b**

Riscar item #2b "Pastas nested" e adicionar `— ✅ FEITO 2026-04-26` na linha. Adicionar entry em `## ✅ Implementados (registro)` com referência aos commits e arquivos tocados.

- [ ] **Step 2: CLAUDE.md — atualizar contagem de testes**

Run: `npm run test 2>&1 | grep -E "Test Files|Tests" | tail -5`
Expected: número novo de tests/suites.

Atualizar a linha em CLAUDE.md (`npm run test — N testes em M suites`).

- [ ] **Step 3: ARCHITECTURE — pequena nota se relevante**

Se §5.1 (hierarchy) fala de folders flat, atualizar pra mencionar nested. Provavelmente uma frase apenas.

### Task 33: Commit final + merge prep

- [ ] **Step 1: Commit docs**

```bash
git add docs/ROADMAP.md docs/ARCHITECTURE.md CLAUDE.md
~/.claude/scripts/commit.sh "docs(folders): atualiza ROADMAP, ARCHITECTURE, CLAUDE.md pós nested"
```

- [ ] **Step 2: Run full suite uma última vez**

Run: `npm run test 2>&1 | tail -5`
Expected: PASS.

- [ ] **Step 3: Confirmar branch limpa**

Run: `git status`
Expected: working tree clean (branch `feat/nested-folders`).

- [ ] **Step 4: Reportar conclusão ao user**

Mensagem sugerida:

> Pastas nested implementadas em `feat/nested-folders`. Smoke test manual passado nos 10 cenários. Tests novos: ~25 (registry hierarchy + folder tree + drag-drop logic). Pronto pra merge.

---

## Notas finais

**Sem CSS novo** — `padding-left: depth * INDENT_PX` já cobre profundidade arbitrária. Se durante smoke test o visual quebrar em depth 6+, considerar cap suave (CSS `max-width` no padding) — mas isso é polish, não bloqueador.

**Multi-pane code explorer**: o expanded state já é per-view (Set passado como parâmetro). Sem mudança necessária.

**Hot-reload durante drag**: classe DOM `is-dragging` é resetada no `onload` (setup novo). Sem fix preventivo necessário.

**Migration**: zero. `folderOrder ??= []` no `fromJSON` cobre o vault de teste no primeiro load. Vault em produção não existe.
