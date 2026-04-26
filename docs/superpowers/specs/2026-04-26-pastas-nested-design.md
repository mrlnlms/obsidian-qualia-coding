# Pastas Nested — Design Spec

**Data:** 2026-04-26
**Item ROADMAP:** §2b — Coding management
**Estimativa:** 2-3h
**Branch sugerida:** `feat/nested-folders`

---

## Contexto

Hoje pastas (`FolderDefinition`) no codebook do Qualia Coding são **flat** — um único nível abaixo da raiz. Códigos podem ser hierárquicos (`parentId`/`childrenOrder`) e ter ordenação manual (`rootOrder`), mas pastas não: são auto-ordenadas alfabeticamente e não podem conter outras pastas.

Esta spec adiciona suporte a pastas aninhadas, ordenação manual de pastas em qualquer nível, e drag-drop completo (move, nest, promote).

**Descoberto** durante §12 K2 do BACKLOG (drag-drop visual feedback, 2026-04-23). **Sem backward-compat**: zero usuários, vault de teste recebe schema novo no primeiro save após o load.

---

## Decisões fundamentais

| Decisão | Valor | Motivação |
|---------|-------|-----------|
| Profundidade máxima | **Sem cap** | Liberdade total; UX só degrada além de 5-6 níveis em sidebar normal |
| Ordem dentro de pasta | **Manual** (drag-drop) | Simétrico ao comportamento já existente pros códigos |
| Promover pasta nested → root | **Drag-drop** (zona before/after entre top-level) | "Promote to top-level" via menu seria gambiarra de drag-drop ruim |
| Delete de pasta com filhos | **Cascade** com confirm dialog detalhado | Pasta = container; mental model claro |
| Criar subpasta | **Context menu** "New subfolder" + drag-drop | Botão toolbar continua criando root folder |

---

## Schema

`src/core/types.ts`:

```ts
export interface FolderDefinition {
  id: string;
  name: string;
  parentId?: string;          // novo: undefined = root
  subfolderOrder?: string[];  // novo: ordem manual dos folders filhos (opcional)
  createdAt: number;
}

// QualiaData.registry ganha:
folderOrder: string[];        // ordem manual dos folders root (igual rootOrder pros códigos)
```

**Notas:**
- `subfolderOrder` é opcional — se ausente, fallback alfabético no `getChildFolders`
- `folderOrder` é mandatório no registry; populado on-create
- Sem migration code: vault de teste recebe `folderOrder = []` na primeira escrita após o load

---

## Registry API (`src/core/codeDefinitionRegistry.ts`)

### Mutations novas

```ts
setFolderParent(folderId: string, parentId: string | undefined, insertBefore?: string): boolean
```
- Cycle detection: walk up via `parentId` (mesma lógica de `setParent` pra códigos)
- Atualiza `folderOrder` (root) ou `subfolderOrder` do parent (nested)
- Remove de location antiga (folderOrder ou subfolderOrder do parent antigo)
- Retorna `false` em ciclo, self-parent, parent inexistente
- `insertBefore`: id do folder sibling antes do qual inserir; se omitido, append

### Queries novas

```ts
getRootFolders(): FolderDefinition[]              // respeita folderOrder
getChildFolders(parentId: string): FolderDefinition[]  // respeita subfolderOrder
getFolderAncestors(folderId: string): FolderDefinition[]
getFolderDescendants(folderId: string): FolderDefinition[]
```

### Mutations alteradas

```ts
createFolder(name: string, parentId?: string): FolderDefinition
```
- Append em `folderOrder` (se `parentId` undefined) ou `subfolderOrder` do parent
- Sem mudança de assinatura quebra: `parentId` é opcional

```ts
deleteFolder(id: string): boolean
```
- **CASCADE:**
  1. Pra cada folder em `getFolderDescendants(id)` + self: deletar todos os códigos (`registry.delete(code.id)`)
  2. Deletar todas as sub-folders (descendants)
  3. Deletar self + remover de `folderOrder` ou `subfolderOrder` do parent
- Confirm dialog é responsabilidade do caller (não do registry)

### Mutations removidas

```ts
getAllFolders()  // removido — consumidores migram pra getRootFolders + getChildFolders
```

### Cycle detection (igual `setParent` pra códigos)

```ts
let cursor = parentId;
while (cursor) {
  if (cursor === folderId) return false;  // ciclo
  cursor = registry.getFolderById(cursor)?.parentId;
}
```

---

## Tree builder (`src/core/hierarchyHelpers.ts`)

### Tipo

```ts
export interface FlatFolderNode {
  type: 'folder';
  folderId: string;
  name: string;
  depth: number;        // antes: 0 hardcoded → agora: 0..N
  hasChildren: boolean; // agora considera subfolders + códigos
  isExpanded: boolean;
  codeCount: number;    // count direto (não recursivo)
}
```

### Lógica nova em `buildFlatTree`

Substitui o loop atual `for (const folder of folders)` por recursão simétrica ao `visitCodes`:

```ts
const visitFolders = (folders: FolderDefinition[], depth: number) => {
  for (const folder of folders) {
    if (visibleFolderIds && !visibleFolderIds.has(folder.id)) continue;

    const childFolders = registry.getChildFolders(folder.id);
    const codesInFolder = registry.getCodesInFolder(folder.id);
    const folderCodeIds = new Set(codesInFolder.map(c => c.id));
    const rootCodesInFolder = codesInFolder.filter(
      c => !c.parentId || !folderCodeIds.has(c.parentId)
    );

    const hasChildren = childFolders.length > 0 || codesInFolder.length > 0;
    const isExpanded = forceExpanded?.folders.has(folder.id)
                    || expanded.folders.has(folder.id);

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
      visitFolders(childFolders, depth + 1);     // sub-folders primeiro
      visitCodes(rootCodesInFolder, depth + 1);  // depois códigos do mesmo nível
    }
  }
};

visitFolders(registry.getRootFolders(), 0);

// Unfiled codes (sem folder) continuam no fim em depth 0 (inalterado)
```

### Search behavior

Quando código casa busca, ancestors de **folder** também precisam auto-expandir (não só code ancestors):

```ts
if (def.folder) {
  for (const ancestor of registry.getFolderAncestors(def.folder)) {
    visibleFolderIds.add(ancestor.id);
    forceExpanded.folders.add(ancestor.id);
  }
}
```

### CSS

`padding-left: depth * INDENT_PX` (18px) já cobre — aplicado tanto a folder quanto a code row. Folder em depth 3 = 54px. Sem cap, mas legível até 5-6 níveis em sidebar normal.

---

## Drag-drop (`src/core/codebookDragDrop.ts`)

### Folder rows ganham draggable

```ts
folderRow.draggable = true;
folderRow.dataset.folderId = folder.id;
```

### onDragStart (folder)

```ts
draggedFolderId = folder.id;
document.body.classList.add('codebook-dragging');
folderRow.classList.add('is-dragging');
```

### onDragOver — detecta target

- Se target é **folder row**:
  - `getDropZone()` retorna `'before'` | `'inside'` | `'after'`
  - `'inside'` → nest (drop INSIDE folder)
  - `'before'`/`'after'` → reorder no mesmo nível do target
- Se target é **code row**: folder não pode ser dropado em code (rejeita silently, sem class)

### Cycle detection no dragover (preview rejection)

```ts
const descendants = registry.getFolderDescendants(draggedFolderId);
if (descendants.some(d => d.id === targetFolderId)) {
  rejectDrop(folderRow, 'Cannot move folder into its own descendant.');
  return;
}
```

### onDrop

```ts
if (zone === 'inside') {
  registry.setFolderParent(draggedFolderId, targetFolderId);
} else {
  // before/after: parent = target's parent (sibling reorder/promote)
  const targetParent = registry.getFolderById(targetFolderId)?.parentId;
  registry.setFolderParent(
    draggedFolderId,
    targetParent,
    /*insertBefore*/ targetFolderId  // ou sibling depois, dependendo da zona
  );
}
```

**Drop entre top-level itens promove pra root** vem de graça quando `targetParent === undefined`.

### Códigos hoje

Já dropam em folder via `onMoveToFolder`. Funciona naturalmente em folder nested — só precisa que o folder row continue sendo drop target. **Sem mudança no caminho de código.**

### Auto-expand on hover

Já existe pra folders. **Sem mudança.**

### Visual — reuso de classes existentes

| Class | Uso |
|-------|-----|
| `.is-dragging` | folder row em drag |
| `.is-folder-drop-target` | drop inside |
| `.codebook-drop-indicator` | drop before/after (floating line) |
| `.is-drop-rejected` | cycle attempt (shake animation) |
| `.codebook-dragging` | body class durante drag inteiro |

---

## Context menu + Delete cascade

### Context menu de folder (`src/core/codebookContextMenu.ts`)

```ts
showFolderContextMenu(folder, callbacks):
  - "New subfolder"     → callbacks.promptCreateSubfolder(folder.id)
  - "Rename"            → callbacks.promptRenameFolder(folder.id)
  - "Delete folder"     → callbacks.promptDeleteFolder(folder.id)  ⚠ mod-warning
```

### Callbacks ampliados

```ts
export interface FolderContextMenuCallbacks {
  promptCreateSubfolder(parentFolderId: string): void;  // NOVO
  promptRenameFolder(folderId: string): void;
  promptDeleteFolder(folderId: string): void;
}
```

### Delete cascade — implementado pelo caller (`baseCodeDetailView.ts`)

```ts
async promptDeleteFolder(folderId: string) {
  const folder = registry.getFolderById(folderId);
  const subfolders = registry.getFolderDescendants(folderId);
  const codes = collectAllCodesUnderFolder(registry, folderId);
  // helper: códigos diretos do folder + códigos diretos de cada sub-folder

  const message = `Delete folder "${folder.name}"?\n\n`
    + `This will permanently delete:\n`
    + `  • ${subfolders.length} subfolder${subfolders.length === 1 ? '' : 's'}\n`
    + `  • ${codes.length} code${codes.length === 1 ? '' : 's'}\n\n`
    + `Markers using these codes will become orphans.`;

  new ConfirmModal(app, 'Delete folder', message, () => {
    registry.deleteFolder(folderId);  // cascade no registry
    notify();
  }).open();
}
```

`collectAllCodesUnderFolder` é helper local (ou em `hierarchyHelpers.ts`) — itera self + descendants chamando `getCodesInFolder` em cada.

---

## Testes

### `tests/core/codeDefinitionRegistry.folderHierarchy.test.ts` (novo)

- `setFolderParent` happy path (root → nested)
- `setFolderParent` rejeita ciclo (A→B→C, tentar C→A)
- `setFolderParent` rejeita self-parent
- `setFolderParent` rejeita parent inexistente
- `setFolderParent` promove de nested pra root (`parentId = undefined`)
- `setFolderParent` com `insertBefore`
- `getRootFolders` respeita `folderOrder`
- `getChildFolders` respeita `subfolderOrder`
- `getChildFolders` fallback alfabético quando `subfolderOrder` ausente
- `getFolderAncestors` / `getFolderDescendants` retornam paths corretos
- `deleteFolder` cascade — sub-folders + códigos deletados, refs limpas, parent's `subfolderOrder` purgado
- Round-trip JSON com folders nested (toJSON / fromJSON)

### `tests/core/folderTree.test.ts` (ampliar existente)

- Folder em depth 1 dentro de folder root
- Folder em depth 3 (deep nesting)
- Search auto-expande folder ancestors quando código casa
- Subfolder collapsed esconde folders + códigos descendentes
- `hasChildren` true se folder tem subfolders OU códigos
- Sub-folders renderizam antes de códigos no mesmo depth (consistência visual)

### `tests/core/codebookDragDrop.test.ts` (novo ou ampliar existente)

- Drop folder INSIDE folder → `setFolderParent`
- Drop folder BEFORE/AFTER root folder → reorder em `folderOrder`
- Drop folder BEFORE/AFTER nested folder → reorder em `subfolderOrder` do mesmo parent
- Drop folder pra promover (drag de nested pra zona before/after de root) → `parentId = undefined`
- Cycle attempt → rejeição com `Notice`

---

## Arquivos tocados (estimativa)

| Arquivo | Mudança |
|---------|---------|
| `src/core/types.ts` | `FolderDefinition` + `folderOrder` em registry |
| `src/core/codeDefinitionRegistry.ts` | API completa de nesting, deleteFolder cascade |
| `src/core/hierarchyHelpers.ts` | `FlatFolderNode.depth` dinâmico, `visitFolders` recursivo, search ancestors de folder |
| `src/core/codebookTreeRenderer.ts` | Folder row `draggable=true`, `data-folder-id` |
| `src/core/codebookDragDrop.ts` | Folder drag-drop semantics completas |
| `src/core/codebookContextMenu.ts` | Item "New subfolder" + callback |
| `src/core/baseCodeDetailView.ts` | `promptCreateSubfolder`, `promptDeleteFolder` com cascade confirm |
| `tests/core/codeDefinitionRegistry.folderHierarchy.test.ts` | **NOVO** |
| `tests/core/folderTree.test.ts` | Casos nested |
| `tests/core/codebookDragDrop.test.ts` | Folder drag-drop |
| `styles.css` | **Nada** — CSS já cobre depth genérico |

---

## Não-objetivos

Itens explicitamente **fora do escopo** desta spec:

- **Cap de profundidade** — sem cap por decisão
- **Search por nome de pasta** — won't-fix de §8b CB3 mantido (pastas são organizacionais, sem significado analítico)
- **Migration code** — zero users
- **Cross-folder code hierarchy semantics** — comportamento atual mantido (folder e parentId são ortogonais)
- **Context menu "Promote to top-level"** — drag-drop cobre isso

---

## Riscos & mitigations

| Risco | Mitigation |
|-------|-----------|
| Visual confuso em depth alto (>6) | Aceito (decisão "sem cap"); sidebar resize mitiga |
| Ciclos via API direta (bypass UI) | Cycle detection no `setFolderParent` rejeita silently |
| Delete cascade acidental destrói trabalho | Confirm dialog detalhado mostra count de subfolders + codes |
| Códigos órfãos pós-delete | Comportamento esperado e documentado no confirm dialog ("Markers using these codes will become orphans") |
| Drag-drop visual quebra com folder grande sendo arrastado | Reuso das classes existentes (já testadas em K2); ghost effect via `is-dragging` |

---

## Documentação pós-implementação

Atualizar:

- **`docs/ROADMAP.md`** — marcar #2b como FEITO
- **`docs/ARCHITECTURE.md`** — atualizar §5.1 se nesting de folders mudar mental model
- **`CLAUDE.md`** — atualizar contagem de testes (provável +20-25 novos)

Itens BACKLOG/TECHNICAL-PATTERNS — só se descobrir gotcha durante implementação.
