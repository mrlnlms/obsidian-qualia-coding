# Plan: Hierarquia de Códigos

## Contexto
Códigos são flat — sem relação pai/filho. Em QDA (MAXQDA, NVivo), hierarquia é fundamental: "Emoções > Positivas > Alegria". Isso afeta organização, navegação e futuramente analytics (agregar por pai).

## Escopo
- `parentId` opcional em `CodeDefinition`
- Registry ganha métodos de hierarquia
- UI: explorer, popover, browser, detail, form modal — todos mostram a árvore
- Analytics: sem mudanças agora (enhancement futuro)
- Markers: `codes: string[]` continua igual — hierarquia é só no registry
- Migração: zero — campo opcional, dados antigos ficam como root

---

## Fase 1 — Data Model (~60 LOC)

### `src/core/types.ts`
Adicionar `parentId` à interface:
```typescript
export interface CodeDefinition {
    id: string;
    name: string;
    color: string;
    description?: string;
    parentId?: string;      // ← NOVO
    paletteIndex: number;
    createdAt: number;
    updatedAt: number;
}
```

### `src/core/codeDefinitionRegistry.ts`
Novos métodos (~60 LOC adicionadas):

```typescript
// Retorna códigos sem pai (ou com pai inválido)
getRootCodes(): CodeDefinition[]

// Filhos diretos de um código
getChildren(parentId: string): CodeDefinition[]

// Cadeia de ancestrais [pai, avô, ...]
getAncestors(id: string): CodeDefinition[]

// Todos os descendentes recursivos
getDescendants(id: string): CodeDefinition[]

// Profundidade (0 = root)
getDepth(id: string): number

// Lista ordenada pra UI: pai, filho1, filho2, pai2...
// Cada item inclui { def, depth }
getHierarchicalList(): Array<{ def: CodeDefinition; depth: number }>

// Seta o pai com validação anti-ciclo
setParent(id: string, parentId: string | undefined): boolean
```

Modificar `create()`: aceitar `parentId?` opcional.
Modificar `update()`: aceitar `parentId` em changes.
Modificar `delete()`: filhos órfãos viram root (`parentId = undefined`).

---

## Fase 2 — UI do Code Form Modal (~25 LOC)

### `src/core/codeFormModal.ts`
- Receber `registry` no construtor (necessário pra listar pais possíveis)
- Adicionar dropdown "Parent code" entre Color e Description:
  ```
  Name:        [___________]
  Color:       [🟣]
  Parent:      [-- None --  ▼]  ← NOVO (dropdown com todos os códigos exceto self e descendentes)
  Description: [___________]
  ```
- `onSave` passa `parentId` junto

### Callers que criam `CodeFormModal`:
- `src/core/codingPopover.ts:269` — "Add New Code" action → passar `registry`
- `src/markdown/cm6/cm6NativeTooltipMenu.ts` — se usa CodeFormModal → idem

---

## Fase 3 — UI do Popover e Toggle List (~15 LOC)

### `src/core/baseCodingMenu.ts` → `renderToggleList()`
- Aceitar `depth?: number` opcional por código (via `getHierarchicalList()`)
- Adicionar `padding-left: ${depth * 16}px` no item quando depth > 0
- Filho herda swatch do pai se não tiver cor própria (opcional, pode não fazer)

### `src/core/codingPopover.ts` → `rebuildSuggestions()`
- Onde chama `registry.getAll()`, trocar por `registry.getHierarchicalList()` pra manter ordem pai→filho
- Passar `depth` pra `renderToggleList()`
- Search: quando filho matcha, incluir pai na lista (pra contexto)

---

## Fase 4 — UI do Code Browser Modal (~10 LOC)

### `src/core/codeBrowserModal.ts` → `renderList()`
- Trocar `registry.getAll()` por `registry.getHierarchicalList()`
- Adicionar indentação visual por depth
- Search: quando filho matcha, mostrar pai como contexto

---

## Fase 5 — UI do Explorer View (~50 LOC)

### `src/core/baseCodeExplorerView.ts`

Árvore atual (3 níveis):
```
Code
  └─ File
       └─ Segment
```

Nova árvore (4 níveis quando há hierarquia):
```
Parent Code (aggregate count)
  └─ Child Code
       └─ File
            └─ Segment
```

Mudanças:
- `renderTree()`: usar `registry.getRootCodes()` como nível 0
- Pra cada root, chamar `registry.getChildren(id)` e renderizar sub-tree
- Códigos sem filhos: mantêm o layout atual (Code → File → Segment)
- Count do pai: soma dos filhos + próprios markers
- Collapse/expand funciona em todos os níveis

---

## Fase 6 — UI do Detail View (~20 LOC)

### `src/core/baseCodeDetailView.ts`

**List mode**: usar `getHierarchicalList()` com indentação por depth.

**Code-focused mode**: adicionar breadcrumb no header quando código tem pai:
```
← Psychology > Behavior > Aggression
   12 segments across 3 files
```
O breadcrumb mostra ancestrais clicáveis (cada um navega pro code-focused desse pai).

---

## Fase 7 — CSS (~15 LOC)

### `styles.css`
```css
/* Hierarchy indentation */
.codemarker-hierarchy-indent { padding-left: 16px; }
.codemarker-hierarchy-indent-2 { padding-left: 32px; }
.codemarker-hierarchy-indent-3 { padding-left: 48px; }

/* Breadcrumb */
.codemarker-breadcrumb { display: inline-flex; gap: 4px; color: var(--text-muted); font-size: var(--font-ui-small); }
.codemarker-breadcrumb-separator { opacity: 0.5; }
.codemarker-breadcrumb-item { cursor: pointer; }
.codemarker-breadcrumb-item:hover { color: var(--text-normal); }
```

---

## Arquivos modificados (resumo)

| Arquivo | Mudança | LOC est. |
|---|---|---|
| `src/core/types.ts` | +`parentId?` | 1 |
| `src/core/codeDefinitionRegistry.ts` | +7 métodos, mod create/update/delete | 60 |
| `src/core/codeFormModal.ts` | +parent dropdown, +registry param | 25 |
| `src/core/baseCodingMenu.ts` | +depth param em renderToggleList | 5 |
| `src/core/codingPopover.ts` | usar getHierarchicalList, passar depth | 10 |
| `src/core/codeBrowserModal.ts` | indentação por depth | 10 |
| `src/core/baseCodeExplorerView.ts` | tree recursiva com parent level | 50 |
| `src/core/baseCodeDetailView.ts` | breadcrumb + indentação list mode | 20 |
| `styles.css` | classes de indentação + breadcrumb | 15 |
| **Total** | | **~200 LOC** |

## O que NÃO muda
- `BaseMarker.codes: string[]` — markers guardam nomes, não IDs
- Engine models (markdown, PDF, CSV, image, audio, video) — zero mudanças
- Analytics — enhancement futuro (agregar por pai)
- `cm6TooltipMenu.ts` / `obsidianMenu.ts` — nunca tocamos
- Serialização — `toJSON()`/`fromJSON()` já serializa todos os campos de CodeDefinition automaticamente
- `SidebarModelInterface` — hierarquia vive no registry, não no model

## Verificação
1. `npm run build` — 0 erros
2. Criar código "Emoções", criar "Alegria" com parent "Emoções"
3. Explorer: "Emoções" aparece como pai com "Alegria" indentado abaixo
4. Popover: "Alegria" aparece indentado na lista de toggle
5. Detail view code-focused: breadcrumb "Emoções > Alegria"
6. Deletar "Emoções" → "Alegria" vira root
7. Dados antigos (sem parentId): todos aparecem como root, zero erros
