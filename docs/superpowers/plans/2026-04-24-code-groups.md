# Code Groups Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a camada flat N:N "Code Groups" (ortogonal à hierarquia e às folders) conforme o spec `docs/superpowers/specs/2026-04-24-code-groups-design.md`, no escopo Tier 1.5 estendido.

**Architecture:** Schema aditivo em `CodeDefinition` + novo `GroupDefinition` no registry + UI (painel collapsible no topo do codebook, chip contador `🏷N` nas rows, destaque contextual, filter chips em Analytics, seção Groups em Code Detail, right-click "Add to group") + Export/Import (QDPX `<Set>` com custom namespace `qualia:color`, CSV tabular `codes.csv` + novo `groups.csv`).

**Tech Stack:** TypeScript strict, Obsidian API, Vitest + jsdom, esbuild 0.25. Reusa: `PromptModal`, `ConfirmModal`, `FuzzySuggestModal`, `onMutate`/`qualia:registry-changed`, `DataManager` debounce, pattern de Case Variables.

**Constraints do projeto:**
- Zero users, zero backcompat — mudanças de schema são livres
- **NUNCA criar git worktree** neste projeto (plugin Obsidian, hot-reload quebra). Branch direto.
- Commits via `~/.claude/scripts/commit.sh` (autor forçado, conventional em pt-br)
- Após build: copiar artefatos pra `demo/.obsidian/plugins/qualia-coding/` manualmente se for testar no demo vault (neste caso testaremos no vault raiz `obsidian-plugins-workbench/`)
- Baseline de testes: 2108 em 115 suites; meta pós-feature: ~2140-2150

---

## Pré-implementação: setup

- [ ] **Criar branch de feature:**

```bash
git checkout -b feat/code-groups
git status --short
```

Expected: `## feat/code-groups` e nenhum arquivo modificado.

- [ ] **Confirmar baseline de testes passa:**

```bash
npm run test -- --run
```

Expected: `Test Files  115 passed (115)`, `Tests  2108 passed (2108)`. Se falhar, investigar e fixar antes de começar a feature.

---

## File Structure

### Arquivos a criar

| Path | Responsabilidade |
|------|------------------|
| `src/core/codeGroupsPanel.ts` | Renderiza painel "Groups" collapsible no topo do codebook (chips, `[+]` botão, filter state) |
| `tests/core/codeGroupsRegistry.test.ts` | Registry CRUD: createGroup, rename, delete (ripple), addCodeToGroup, setGroupColor, palette auto-assign |
| `tests/core/codeGroupsPanel.test.ts` | Panel render, chip click (filter state), `[+]` abre PromptModal, right-click chip menu |
| `tests/core/codeGroupsChipCounter.test.ts` | Chip contador `🏷N` em code rows + tooltip + oculto quando sem groups |
| `tests/core/codeGroupsDetailSection.test.ts` | Seção Groups em Code Detail view (chips + `[+]` adiciona via FuzzySuggestModal + `×` remove) |
| `tests/core/codeGroupsContextMenu.test.ts` | Right-click código → submenu "Add to group" + "+ New group..." inline |
| `tests/core/codeGroupsFilter.test.ts` | Filter sidebar (click chip → destaque tree) + Analytics `applyFilters` com groupFilter |
| `tests/core/codeGroupsSerialization.test.ts` | Save/load preserva groups; load de data.json legado (sem `groups`) inicializa vazio |
| `tests/export/qdpxGroupsRoundtrip.test.ts` | QDPX export `<Set>` + `<MemberCode>` + round-trip (name, color via `qualia:color`, description, membership) |
| `tests/export/tabularGroupsExport.test.ts` | `codes.csv` coluna `groups` + novo `groups.csv` + README.md atualizado |

### Arquivos a modificar

| Path | Mudança |
|------|---------|
| `src/core/types.ts` | Adicionar `GroupDefinition`, `GROUP_PALETTE`; extender `CodeDefinition` com `groups?`, `QualiaData.registry` com `groups`/`groupOrder`/`nextGroupPaletteIndex`; estender `createDefaultData()` |
| `src/core/codeDefinitionRegistry.ts` | API de Groups (CRUD + membership + queries + palette auto-assign + `deleteGroup` ripple) + extender `toJSON` type annotation + `fromJSON` (static) + `clear()` |
| `src/core/dataManager.ts` | `clearAllSections()` (linha 96) inicializa registry inline — precisa incluir os 3 campos novos (`groups: {}`, `groupOrder: []`, `nextGroupPaletteIndex: 0`) senão TS compile quebra |
| `src/core/baseCodeDetailView.ts` | Wire panel Groups acima da tree (montar/desmontar com `codeGroupsPanel`) + state `selectedGroupId` |
| `src/core/codebookTreeRenderer.ts` | Chip contador `🏷N` em code rows + destaque contextual (borda + fade) quando `selectedGroupId` setado |
| `src/core/codebookContextMenu.ts` | Submenu "Add to group" no right-click de código |
| `src/core/detailCodeRenderer.ts` | Nova seção Groups entre Description e Hierarchy |
| `src/core/dialogs.ts` | (Sem mudança — usa `PromptModal` existente; confirmar que aceita placeholder pra nome de group) |
| `src/core/mergeModal.ts` | Target herda union dos groups (source + target) |
| `src/analytics/data/dataTypes.ts` | `FilterConfig.groupFilter?: string` (groupId) |
| `src/analytics/data/statsHelpers.ts` | `applyFilters` ganha 4º param `codeRegistry?: CodeDefinitionRegistry` + lógica groupFilter |
| `src/analytics/views/analyticsViewContext.ts` | `groupFilter: string | null` em context |
| `src/analytics/views/configSections.ts` | Nova função `renderGroupsFilter` (chips + fallback dropdown) |
| `src/analytics/views/analyticsView.ts` | Wire `renderGroupsFilter` no config panel + propaga no state |
| `src/export/qdcExporter.ts` | Emit `<Sets>` dentro de `<CodeBook>` + custom namespace `qualia:color` + `<Description>` |
| `src/export/qdpxExporter.ts` | Coordenar guidMap dos groups (reusa `ensureGuid`) |
| `src/import/qdpxImporter.ts` | Parse `<Set>` elements, cria `GroupDefinition`, liga via `MemberCode`; ignora `MemberSource` com warning |
| `src/export/tabular/buildCodesTable.ts` | Nova coluna `groups` (string `;`-separated de nomes) |
| `src/export/tabular/tabularExporter.ts` | Novo arquivo `groups.csv` no zip |
| `src/export/tabular/readmeBuilder.ts` | README.md documenta `groups` column + `groups.csv` + snippets R/Python |

---

## Chunk 1: Schema + Registry foundation

Esta chunk fundamenta tudo. Schema aditivo + API do registry + serialização + tests de registry.

### Task 1.1: Schema — tipos e palette

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Ler seção atual do types.ts antes de editar**

Leia `src/core/types.ts:1-180` para entender o contexto exato de onde inserir os novos tipos.

- [ ] **Step 2: Adicionar `GROUP_PALETTE` no topo de `types.ts`**

Adicionar após os imports (por volta da linha 9-10), antes de `MarkerType`:

```ts
// 8-color pastel palette for Code Groups. Distinct from DEFAULT_PALETTE (codes) to avoid visual confusion in chip counters.
export const GROUP_PALETTE: readonly string[] = [
  '#AEC6FF',  // pastel blue
  '#B7E4C7',  // pastel green
  '#FFD6A5',  // pastel peach
  '#FFADAD',  // pastel coral
  '#CAFFBF',  // pastel mint
  '#BDB2FF',  // pastel violet
  '#FDFFB6',  // pastel yellow
  '#FFC6FF',  // pastel pink
];
```

- [ ] **Step 3: Adicionar `GroupDefinition` interface**

Após `FolderDefinition` interface (linha 94-98), adicionar:

```ts
export interface GroupDefinition {
  id: string;              // g_XX (estável)
  name: string;            // livre, renameable
  color: string;           // REQUIRED — auto-atribuído do GROUP_PALETTE
  description?: string;    // opcional, multiline
  paletteIndex: number;    // índice no GROUP_PALETTE; -1 se cor customizada
  parentId?: string;       // SCHEMA-READY pra tier 3; UI 1.5 NUNCA escreve
  createdAt: number;
}
```

- [ ] **Step 4: Extender `CodeDefinition`**

Na interface `CodeDefinition` (linha 71-92), adicionar campo `groups?` ao final antes de `relations`:

```ts
// Existing fields ...
// Groups (Tier 1.5 — flat N:N, orthogonal to parentId)
groups?: string[];  // array de groupIds. undefined/empty = sem groups.
// Relations code-level (Phase E)
relations?: CodeRelation[];
```

- [ ] **Step 5: Extender `QualiaData.registry`**

No tipo `QualiaData` (linha 113-152), dentro de `registry`, adicionar os 3 novos campos:

```ts
registry: {
  definitions: Record<string, CodeDefinition>;
  nextPaletteIndex: number;
  folders: Record<string, FolderDefinition>;
  rootOrder: string[];
  // Groups (Tier 1.5)
  groups: Record<string, GroupDefinition>;
  groupOrder: string[];
  nextGroupPaletteIndex: number;
};
```

- [ ] **Step 6: Atualizar `createDefaultData()`**

Na função `createDefaultData` (linha 154), dentro de `registry`, adicionar os campos padrão:

```ts
registry: {
  definitions: {},
  nextPaletteIndex: 0,
  folders: {},
  rootOrder: [],
  groups: {},
  groupOrder: [],
  nextGroupPaletteIndex: 0,
},
```

- [ ] **Step 7: Atualizar `dataManager.ts:96` (`clearAllSections`)**

O método `clearAllSections` em `src/core/dataManager.ts:96` reinicializa `this.data.registry` inline com um object literal. Adicionar os 3 campos novos:

```ts
this.data.registry = {
  definitions: {},
  nextPaletteIndex: 0,
  folders: {},
  rootOrder: [],
  groups: {},
  groupOrder: [],
  nextGroupPaletteIndex: 0,
};
```

- [ ] **Step 8: Verificar compila**

```bash
npx tsc --noEmit
```

Expected: exit code 0, no errors. Se houver outros erros de tipo, procurar por inicializações hardcoded de `registry` em outros pontos (`grep -rn "definitions: {}," src/`).

- [ ] **Step 9: Commit**

```bash
git add src/core/types.ts src/core/dataManager.ts
~/.claude/scripts/commit.sh "feat(core): adiciona schema de Code Groups (types + GROUP_PALETTE)"
```

### Task 1.2: Registry API — CRUD básico

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Test: `tests/core/codeGroupsRegistry.test.ts`

- [ ] **Step 1: Criar test file com primeiro teste (createGroup)**

Criar `tests/core/codeGroupsRegistry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { GROUP_PALETTE } from '../../src/core/types';

describe('CodeDefinitionRegistry — Groups CRUD', () => {
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    registry = new CodeDefinitionRegistry();
  });

  describe('createGroup', () => {
    it('cria group com id estável (g_XX), cor auto-atribuída do palette e adiciona ao groupOrder', () => {
      const g = registry.createGroup('RQ1');
      expect(g.id).toMatch(/^g_[a-z0-9]+$/);
      expect(g.name).toBe('RQ1');
      expect(g.color).toBe(GROUP_PALETTE[0]);
      expect(g.paletteIndex).toBe(0);
      expect(g.description).toBeUndefined();
      expect(registry.getGroupOrder()).toEqual([g.id]);
    });

    it('auto-atribui cores em round-robin do GROUP_PALETTE', () => {
      const colors: string[] = [];
      for (let i = 0; i < 10; i++) {
        colors.push(registry.createGroup(`G${i}`).color);
      }
      expect(colors[0]).toBe(GROUP_PALETTE[0]);
      expect(colors[7]).toBe(GROUP_PALETTE[7]);
      expect(colors[8]).toBe(GROUP_PALETTE[0]);  // wrap
      expect(colors[9]).toBe(GROUP_PALETTE[1]);
    });
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

```bash
npm run test -- tests/core/codeGroupsRegistry.test.ts --run
```

Expected: FAIL, `createGroup is not a function` ou similar.

- [ ] **Step 3: Implementar `createGroup` no registry**

Em `src/core/codeDefinitionRegistry.ts`, adicionar:

1. No topo do arquivo, import `GROUP_PALETTE` + `GroupDefinition`:

```ts
import type { CodeDefinition, FolderDefinition, GroupDefinition } from './types';
import { GROUP_PALETTE } from './types';
```

2. Campos da classe (após `rootOrder: string[] = [];`, ~linha 44):

```ts
/** Groups (Tier 1.5 — flat N:N). Public pra permitir acesso do static fromJSON. */
groups: Map<string, GroupDefinition> = new Map();
/** Ordered list of group IDs. Controls display order in panel. */
groupOrder: string[] = [];
/** Monotonic index into GROUP_PALETTE. Nunca decrementa no deleteGroup (pattern do nextPaletteIndex). */
nextGroupPaletteIndex: number = 0;
```

3. Método (após `clear()`, por volta da linha 284):

```ts
// --- Groups CRUD ---

createGroup(name: string): GroupDefinition {
  const paletteIndex = this.nextGroupPaletteIndex % GROUP_PALETTE.length;
  const color = GROUP_PALETTE[paletteIndex]!;
  const group: GroupDefinition = {
    id: this.generateGroupId(),
    name,
    color,
    paletteIndex,
    createdAt: Date.now(),
  };
  this.groups.set(group.id, group);
  this.groupOrder.push(group.id);
  this.nextGroupPaletteIndex++;
  for (const fn of this.onMutateListeners) fn();
  return group;
}

getGroup(id: string): GroupDefinition | null {
  return this.groups.get(id) ?? null;
}

getAllGroups(): GroupDefinition[] {
  return this.groupOrder
    .map(id => this.groups.get(id))
    .filter((g): g is GroupDefinition => g !== undefined);
}

getGroupOrder(): string[] {
  return [...this.groupOrder];
}

private generateGroupId(): string {
  // Reusa o pattern de `generateId()` dos códigos (~line 588):
  // Date+Math.random evita colisão após add-delete-add (ids nunca reciclam).
  return 'g_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
}
```

- [ ] **Step 4: Rodar teste — deve passar**

```bash
npm run test -- tests/core/codeGroupsRegistry.test.ts --run
```

Expected: PASS `createGroup` (2 tests).

- [ ] **Step 5: Adicionar teste de `renameGroup` + `deleteGroup`**

Append em `tests/core/codeGroupsRegistry.test.ts`:

```ts
  describe('renameGroup', () => {
    it('altera name atomicamente mantendo id estável', () => {
      const g = registry.createGroup('RQ1');
      const ok = registry.renameGroup(g.id, 'Research Question 1');
      expect(ok).toBe(true);
      expect(registry.getGroup(g.id)?.name).toBe('Research Question 1');
    });

    it('retorna false pra id inexistente', () => {
      expect(registry.renameGroup('g_999', 'foo')).toBe(false);
    });
  });

  describe('deleteGroup', () => {
    it('remove group de definitions, groupOrder, e do code.groups[] de todos os códigos membros', () => {
      const c1 = registry.create('code1');
      const c2 = registry.create('code2');
      const g = registry.createGroup('RQ1');
      registry.addCodeToGroup(c1.id, g.id);
      registry.addCodeToGroup(c2.id, g.id);

      const ok = registry.deleteGroup(g.id);
      expect(ok).toBe(true);
      expect(registry.getGroup(g.id)).toBeNull();
      expect(registry.getGroupOrder()).toEqual([]);
      expect(registry.getById(c1.id)?.groups ?? []).toEqual([]);
      expect(registry.getById(c2.id)?.groups ?? []).toEqual([]);
    });

    it('nunca deleta códigos (apenas membership)', () => {
      const c1 = registry.create('code1');
      const g = registry.createGroup('RQ1');
      registry.addCodeToGroup(c1.id, g.id);
      registry.deleteGroup(g.id);
      expect(registry.getById(c1.id)).toBeDefined();
    });
  });

  describe('addCodeToGroup idempotency', () => {
    it('chamar 2x com mesmo (code, group) não duplica membership', () => {
      const c = registry.create('c');
      const g = registry.createGroup('RQ1');
      registry.addCodeToGroup(c.id, g.id);
      registry.addCodeToGroup(c.id, g.id);
      expect(registry.getById(c.id)?.groups).toEqual([g.id]);
    });
  });

  describe('removeCodeFromGroup', () => {
    it('remove membership existente', () => {
      const c = registry.create('c');
      const g = registry.createGroup('RQ1');
      registry.addCodeToGroup(c.id, g.id);
      registry.removeCodeFromGroup(c.id, g.id);
      expect(registry.getById(c.id)?.groups).toBeUndefined();
    });

    it('no-op quando código não é membro (sem throw, sem fire listener)', () => {
      const c = registry.create('c');
      const g = registry.createGroup('RQ1');
      let fires = 0;
      registry.addOnMutate(() => fires++);
      fires = 0;  // reset após create listeners
      registry.removeCodeFromGroup(c.id, g.id);
      expect(fires).toBe(0);
    });
  });
```

- [ ] **Step 6: Rodar tests — falham**

```bash
npm run test -- tests/core/codeGroupsRegistry.test.ts --run
```

Expected: 2 PASS (createGroup) + 7 FAIL (rename + delete + addCodeToGroup idempotency + removeCodeFromGroup).

- [ ] **Step 7: Implementar `renameGroup`, `deleteGroup`, `addCodeToGroup`, `removeCodeFromGroup`**

Após `createGroup`:

```ts
renameGroup(id: string, newName: string): boolean {
  const g = this.groups.get(id);
  if (!g) return false;
  g.name = newName;
  for (const fn of this.onMutateListeners) fn();
  return true;
}

deleteGroup(id: string): boolean {
  const g = this.groups.get(id);
  if (!g) return false;

  // Ripple: remover groupId de code.groups[] em todos os códigos.
  // Single listener fire at end (batch semantics) — NÃO mover emit pra dentro do loop.
  for (const code of this.definitions.values()) {
    if (code.groups && code.groups.includes(id)) {
      code.groups = code.groups.filter(gid => gid !== id);
      if (code.groups.length === 0) delete code.groups;
    }
  }

  this.groups.delete(id);
  this.groupOrder = this.groupOrder.filter(gid => gid !== id);
  for (const fn of this.onMutateListeners) fn();
  return true;
}

// --- Membership ---

addCodeToGroup(codeId: string, groupId: string): void {
  const code = this.definitions.get(codeId);
  const group = this.groups.get(groupId);
  if (!code || !group) return;
  if (!code.groups) code.groups = [];
  if (!code.groups.includes(groupId)) {
    code.groups.push(groupId);
    for (const fn of this.onMutateListeners) fn();
  }
  // idempotent: no fire se já era membro
}

removeCodeFromGroup(codeId: string, groupId: string): void {
  const code = this.definitions.get(codeId);
  if (!code || !code.groups) return;
  const changed = code.groups.includes(groupId);
  if (!changed) return;  // no-op: código não é membro
  code.groups = code.groups.filter(gid => gid !== groupId);
  if (code.groups.length === 0) delete code.groups;
  for (const fn of this.onMutateListeners) fn();
}
```

- [ ] **Step 8: Rodar tests — todos passam**

```bash
npm run test -- tests/core/codeGroupsRegistry.test.ts --run
```

Expected: 9 PASS (2 createGroup + 2 rename + 2 delete + 1 addCodeToGroup idempotency + 2 removeCodeFromGroup).

- [ ] **Step 9: Commit**

```bash
git add src/core/codeDefinitionRegistry.ts tests/core/codeGroupsRegistry.test.ts
~/.claude/scripts/commit.sh "feat(core): registry API pra Code Groups (CRUD + membership)"
```

### Task 1.3: Registry API — queries + color management

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Test: `tests/core/codeGroupsRegistry.test.ts` (append)

- [ ] **Step 1: Adicionar tests de queries**

Append:

```ts
  describe('queries', () => {
    it('getCodesInGroup retorna só códigos membros', () => {
      const c1 = registry.create('c1');
      const c2 = registry.create('c2');
      const c3 = registry.create('c3');
      const g = registry.createGroup('RQ1');
      registry.addCodeToGroup(c1.id, g.id);
      registry.addCodeToGroup(c3.id, g.id);
      const members = registry.getCodesInGroup(g.id);
      expect(members.map(c => c.id).sort()).toEqual([c1.id, c3.id].sort());
    });

    it('getGroupsForCode retorna só groups do código', () => {
      const c = registry.create('c');
      const g1 = registry.createGroup('RQ1');
      const g2 = registry.createGroup('RQ2');
      const g3 = registry.createGroup('Wave1');
      registry.addCodeToGroup(c.id, g1.id);
      registry.addCodeToGroup(c.id, g3.id);
      const groups = registry.getGroupsForCode(c.id);
      expect(groups.map(g => g.id).sort()).toEqual([g1.id, g3.id].sort());
    });

    it('getGroupMemberCount retorna número de códigos membros', () => {
      const g = registry.createGroup('RQ1');
      expect(registry.getGroupMemberCount(g.id)).toBe(0);
      const c1 = registry.create('c1');
      const c2 = registry.create('c2');
      registry.addCodeToGroup(c1.id, g.id);
      registry.addCodeToGroup(c2.id, g.id);
      expect(registry.getGroupMemberCount(g.id)).toBe(2);
    });
  });

  describe('setGroupColor', () => {
    it('atualiza paletteIndex quando cor matchea palette', () => {
      const g = registry.createGroup('RQ1');
      registry.setGroupColor(g.id, GROUP_PALETTE[3]!);
      expect(registry.getGroup(g.id)?.color).toBe(GROUP_PALETTE[3]);
      expect(registry.getGroup(g.id)?.paletteIndex).toBe(3);
    });

    it('seta paletteIndex = -1 quando cor é custom (fora do palette)', () => {
      const g = registry.createGroup('RQ1');
      registry.setGroupColor(g.id, '#123456');
      expect(registry.getGroup(g.id)?.color).toBe('#123456');
      expect(registry.getGroup(g.id)?.paletteIndex).toBe(-1);
    });

    it('match case-insensitive contra GROUP_PALETTE (color picker pode emitir lowercase)', () => {
      const g = registry.createGroup('RQ1');
      registry.setGroupColor(g.id, GROUP_PALETTE[3]!.toLowerCase());
      expect(registry.getGroup(g.id)?.paletteIndex).toBe(3);
    });
  });

  describe('setGroupOrder', () => {
    it('reordena groups mantendo apenas ids existentes', () => {
      const g1 = registry.createGroup('A');
      const g2 = registry.createGroup('B');
      const g3 = registry.createGroup('C');
      registry.setGroupOrder([g3.id, g1.id, g2.id]);
      expect(registry.getGroupOrder()).toEqual([g3.id, g1.id, g2.id]);
    });

    it('ignora ids inexistentes sem crashar; preserva os válidos', () => {
      const g1 = registry.createGroup('A');
      const g2 = registry.createGroup('B');
      registry.setGroupOrder([g2.id, 'g_nonexistent', g1.id]);
      expect(registry.getGroupOrder()).toEqual([g2.id, g1.id]);
    });
  });

  describe('setGroupDescription', () => {
    it('seta e remove description', () => {
      const g = registry.createGroup('RQ1');
      registry.setGroupDescription(g.id, 'Research question 1');
      expect(registry.getGroup(g.id)?.description).toBe('Research question 1');
      registry.setGroupDescription(g.id, undefined);
      expect(registry.getGroup(g.id)?.description).toBeUndefined();
    });
  });

  describe('nextGroupPaletteIndex preservation', () => {
    it('NUNCA decrementa no deleteGroup (pattern do nextPaletteIndex dos códigos)', () => {
      const g1 = registry.createGroup('A');  // index 0
      const g2 = registry.createGroup('B');  // index 1
      const g3 = registry.createGroup('C');  // index 2
      registry.deleteGroup(g1.id);
      registry.deleteGroup(g2.id);
      const g4 = registry.createGroup('D');
      expect(g4.color).toBe(GROUP_PALETTE[3 % GROUP_PALETTE.length]);
    });
  });
```

- [ ] **Step 2: Rodar tests — falham**

Expected: FAIL em `getCodesInGroup`, `getGroupsForCode`, `getGroupMemberCount`, `setGroupColor`, `setGroupDescription`.

- [ ] **Step 3: Implementar queries e setters**

Append ao registry (após `removeCodeFromGroup`):

```ts
// --- Queries ---

getCodesInGroup(groupId: string): CodeDefinition[] {
  const result: CodeDefinition[] = [];
  for (const code of this.definitions.values()) {
    if (code.groups?.includes(groupId)) result.push(code);
  }
  return result;
}

getGroupsForCode(codeId: string): GroupDefinition[] {
  const code = this.definitions.get(codeId);
  if (!code?.groups) return [];
  return code.groups
    .map(gid => this.groups.get(gid))
    .filter((g): g is GroupDefinition => g !== undefined);
}

getGroupMemberCount(groupId: string): number {
  let count = 0;
  for (const code of this.definitions.values()) {
    if (code.groups?.includes(groupId)) count++;
  }
  return count;
}

// --- Color / description mutations ---

setGroupColor(id: string, color: string): void {
  const g = this.groups.get(id);
  if (!g) return;
  g.color = color;
  // Case-insensitive match contra GROUP_PALETTE (user colors podem vir lowercase de picker)
  const paletteIdx = GROUP_PALETTE.findIndex(c => c.toLowerCase() === color.toLowerCase());
  g.paletteIndex = paletteIdx >= 0 ? paletteIdx : -1;
  for (const fn of this.onMutateListeners) fn();
}

setGroupDescription(id: string, description: string | undefined): void {
  const g = this.groups.get(id);
  if (!g) return;
  g.description = description && description.length > 0 ? description : undefined;
  for (const fn of this.onMutateListeners) fn();
}

setGroupOrder(ids: string[]): void {
  // Validate: only include existing groups, preserve missing in trailing position
  const valid = ids.filter(id => this.groups.has(id));
  const missing = Array.from(this.groups.keys()).filter(id => !valid.includes(id));
  this.groupOrder = [...valid, ...missing];
  for (const fn of this.onMutateListeners) fn();
}
```

- [ ] **Step 4: Rodar tests — todos passam**

Expected: 18 PASS total (9 de Task 1.2 + 3 queries + 3 setGroupColor + 1 setGroupDescription + 1 nextGroupPaletteIndex + 0 da task 1.4 ainda; mais 2 de setGroupOrder adicionados).
Cumulative: 9 (task 1.2) + 9 (task 1.3) = 18. Zero de task 1.4 ainda (vem no próximo).

- [ ] **Step 5: Commit**

```bash
git add src/core/codeDefinitionRegistry.ts tests/core/codeGroupsRegistry.test.ts
~/.claude/scripts/commit.sh "feat(core): queries e color management de Code Groups"
```

### Task 1.4: Registry serialização (toJSON/fromJSON)

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Test: `tests/core/codeGroupsSerialization.test.ts`

- [ ] **Step 1: Entender estrutura atual de serialização**

Importante saber antes de escrever o teste:
- `toJSON()` é **instance method** (linha 513) com type annotation explícito: `toJSON(): { definitions, nextPaletteIndex, rootOrder, folders }`.
- `fromJSON(data: any)` é **static** (linha 525), retorna um novo `CodeDefinitionRegistry`. Callers usam `CodeDefinitionRegistry.fromJSON(json)`.

Isso determina o shape do teste (instance na save, static na load).

```bash
grep -n "toJSON\|fromJSON" src/core/codeDefinitionRegistry.ts
```

Expected: `toJSON(): {...}` na 513, `static fromJSON(data: any)` na 525.

- [ ] **Step 2: Criar test file**

```ts
import { describe, it, expect } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import type { QualiaData } from '../../src/core/types';
import { createDefaultData, GROUP_PALETTE } from '../../src/core/types';

describe('Code Groups serialization', () => {
  it('save → load preserva groups, groupOrder, nextGroupPaletteIndex', () => {
    const r1 = new CodeDefinitionRegistry();
    const c = r1.create('code1');
    const g1 = r1.createGroup('RQ1');
    const g2 = r1.createGroup('RQ2');
    r1.addCodeToGroup(c.id, g1.id);
    r1.setGroupDescription(g2.id, 'Question 2');
    r1.setGroupColor(g2.id, '#123456');  // custom

    const json = r1.toJSON();

    // fromJSON é static, retorna novo registry
    const r2 = CodeDefinitionRegistry.fromJSON(json);

    expect(r2.getAllGroups().length).toBe(2);
    expect(r2.getGroup(g1.id)?.name).toBe('RQ1');
    expect(r2.getGroup(g1.id)?.color).toBe(GROUP_PALETTE[0]);
    expect(r2.getGroup(g1.id)?.paletteIndex).toBe(0);
    expect(r2.getGroup(g2.id)?.description).toBe('Question 2');
    expect(r2.getGroup(g2.id)?.color).toBe('#123456');
    expect(r2.getGroup(g2.id)?.paletteIndex).toBe(-1);
    expect(r2.getGroupOrder()).toEqual([g1.id, g2.id]);
    expect(r2.getById(c.id)?.groups).toEqual([g1.id]);
  });

  it('load de data.json legado (sem groups/groupOrder/nextGroupPaletteIndex) não crasha, inicializa vazio', () => {
    const legacy: QualiaData = createDefaultData();
    // Simula legacy: delete os campos novos
    delete (legacy.registry as any).groups;
    delete (legacy.registry as any).groupOrder;
    delete (legacy.registry as any).nextGroupPaletteIndex;

    let r: CodeDefinitionRegistry;
    expect(() => { r = CodeDefinitionRegistry.fromJSON(legacy.registry); }).not.toThrow();
    expect(r!.getAllGroups()).toEqual([]);
    expect(r!.getGroupOrder()).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar tests — falham**

Expected: FAIL.

- [ ] **Step 4: Extender `toJSON()` (instance) — atualizar type annotation + return**

Em `src/core/codeDefinitionRegistry.ts` (linha ~513):

**(a) Atualizar a type annotation** do método pra incluir os 3 novos campos:

```ts
toJSON(): {
  definitions: Record<string, CodeDefinition>;
  nextPaletteIndex: number;
  rootOrder: string[];
  folders: Record<string, FolderDefinition>;
  // Groups
  groups: Record<string, GroupDefinition>;
  groupOrder: string[];
  nextGroupPaletteIndex: number;
} {
```

**(b) Atualizar o return** pra incluir os 3 campos novos (manter style do existing que usa loop):

```ts
const groups: Record<string, GroupDefinition> = {};
for (const [id, g] of this.groups.entries()) {
  groups[id] = g;
}
return {
  definitions,
  nextPaletteIndex: this.nextPaletteIndex,
  rootOrder: this.rootOrder,
  folders,
  groups,
  groupOrder: this.groupOrder,
  nextGroupPaletteIndex: this.nextGroupPaletteIndex,
};
```

- [ ] **Step 5: Extender `static fromJSON(data)` — load com defaults**

No `static fromJSON(data: any)` (linha ~525), antes do `return registry`, adicionar:

```ts
// Groups (Tier 1.5) — tolerante a data.json legado
if (data?.groups) {
  for (const id in data.groups) {
    const g = data.groups[id] as GroupDefinition;
    g.id = id;  // consistency (igual ao pattern de codes/folders)
    registry.groups.set(id, g);
  }
}
if (Array.isArray(data?.groupOrder)) {
  registry.groupOrder = data.groupOrder.filter((id: string) => registry.groups.has(id));
}
// Se groupOrder tá ausente mas tem groups carregados, popula na ordem de inserção
for (const id of registry.groups.keys()) {
  if (!registry.groupOrder.includes(id)) registry.groupOrder.push(id);
}
if (typeof data?.nextGroupPaletteIndex === 'number') {
  registry.nextGroupPaletteIndex = data.nextGroupPaletteIndex;
}
```

**Nota:** `fromJSON` é static. Dentro do método, acesso os campos via `registry.groups` / `registry.groupOrder` / `registry.nextGroupPaletteIndex` — NÃO via `this.*`. Os campos já foram declarados `public` em Task 1.2 Step 3 (não-private é intencional; `rootOrder` existente também é public pelo mesmo motivo).

- [ ] **Step 6: Rodar tests — passam**

Expected: PASS (2 testes de serialization).

- [ ] **Step 7: Extender `clear()` para resetar groups também**

No método `clear()`:

```ts
clear(): void {
  this.definitions.clear();
  this.nameIndex.clear();
  this.folders.clear();
  this.rootOrder = [];
  this.nextPaletteIndex = 0;
  // Groups
  this.groups.clear();
  this.groupOrder = [];
  this.nextGroupPaletteIndex = 0;
  for (const fn of this.onMutateListeners) fn();
}
```

- [ ] **Step 8: Rodar test suite completa pra garantir nada quebrou**

```bash
npm run test -- --run
```

Expected: todos os tests passam. Deve haver +20 novos tests de groups (2 createGroup + 2 rename + 2 delete + 1 addCodeToGroup idempotency + 2 removeCodeFromGroup + 3 queries + 3 setGroupColor + 1 setGroupDescription + 1 nextGroupPaletteIndex + 2 setGroupOrder + 2 serialization = 20). Baseline 2108 → ~2128 total.

- [ ] **Step 9: Commit**

```bash
git add src/core/codeDefinitionRegistry.ts tests/core/codeGroupsSerialization.test.ts
~/.claude/scripts/commit.sh "feat(core): serialização de Code Groups (toJSON/fromJSON + legacy compat)"
```

---

## Chunk 1 summary

Ao final deste chunk:
- Schema completo (types + palette + defaults + dataManager init)
- Registry API completa (CRUD + membership + queries + color/desc mgmt + serialização)
- +20 testes (baseline 2108 → ~2128)
- Zero UI ainda. Nada visível pro user.

**Próximo chunk:** UI do codebook sidebar (painel Groups + chip contador + filter state).

---

## Chunk 2: Codebook sidebar UI (painel + chip contador)

Esta chunk torna Groups visíveis no UI. Painel collapsible acima da toolbar com chips + `[+]`, chip contador `🏷N` em cada code row, destaque contextual (borda/fade) quando um group é selecionado, right-click no chip pra Rename/Edit color/Edit description/Delete.

### Task 2.0: Pre-flight — confirmar APIs reais

Importante ler ANTES de começar. Patterns do codebase que este chunk consome:

- `PromptModal` e `ConfirmModal` em `src/core/dialogs.ts`: constructor recebe **um único objeto opts** com `app` como property (NÃO `new PromptModal(app, opts)` — está errado em versões antigas deste plan).
  - `PromptOptions`: `{ app, title, initialValue?, placeholder?, confirmLabel?, onSubmit }`. **Não suporta multiline** — Edit description usa single-line no MVP.
  - `ConfirmOptions`: `{ app, title, message, confirmLabel?, destructive?, onConfirm }`. Destructive usa classe `mod-warning`.
- `BaseCodeDetailView` (ver `src/core/baseCodeDetailView.ts:137`): método `protected refreshCurrentMode()` é o canal padrão pra re-render. Em list mode, re-renderiza `renderListContent(this.listContentZone, ...)`.
- `getTreeState(): CodebookTreeState` (`baseCodeDetailView.ts:154`) retorna state pra tree. Precisa estender pra incluir `selectedGroupId`.
- `setIcon` é exportado pelo obsidian mock em `tests/mocks/obsidian.ts:142` como noop — testes que chamam funções que usam `setIcon` funcionam em jsdom.
- `HTMLElement.createDiv/createEl/createSpan` polyfilled em `tests/setup.ts` — disponível nos testes.
- `Menu` (Obsidian UI) **não tem mock default** — usar apenas em runtime, não exercitar Menu em unit test (se precisar, testar apenas o `onChipContextMenu` callback shape, não a construção do Menu em si).

- [ ] **Step 1: Ler `src/core/dialogs.ts` inteiro** pra confirmar signatures exatas.

```bash
cat src/core/dialogs.ts | head -125
```

- [ ] **Step 2: Ler seção "Refresh routing" de `src/core/baseCodeDetailView.ts:130-170`** pra entender pattern.

```bash
sed -n '130,170p' src/core/baseCodeDetailView.ts
```

Nenhuma mudança nestes arquivos nesta sub-task — é só reading. Fica completa ao confirmar visualmente que os patterns fazem sentido.

### Task 2.1: Módulo `codeGroupsPanel` — render + interações básicas

**Files:**
- Create: `src/core/codeGroupsPanel.ts`
- Test: `tests/core/codeGroupsPanel.test.ts`

- [ ] **Step 1: Criar test file com primeiro teste (render básico)**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { renderCodeGroupsPanel } from '../../src/core/codeGroupsPanel';

describe('codeGroupsPanel — render', () => {
  let container: HTMLElement;
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    registry = new CodeDefinitionRegistry();
  });

  afterEach(() => {
    container.remove();  // Evita acumular divs no document.body ao longo do test file
  });

  it('não renderiza nada quando não há groups (painel collapsed-invisible)', () => {
    renderCodeGroupsPanel(container, registry, {
      selectedGroupId: null,
      onSelectGroup: () => {},
      onCreateGroup: () => {},
      onChipContextMenu: () => {},
    });
    // Painel fica renderizado mas vazio ou collapsed
    const panel = container.querySelector('.codebook-groups-panel');
    expect(panel).toBeTruthy();
    // Nenhum chip visível
    expect(container.querySelectorAll('.codebook-group-chip').length).toBe(0);
  });

  it('renderiza 1 chip por group existente no groupOrder', () => {
    registry.createGroup('RQ1');
    registry.createGroup('RQ2');
    renderCodeGroupsPanel(container, registry, {
      selectedGroupId: null,
      onSelectGroup: () => {},
      onCreateGroup: () => {},
      onChipContextMenu: () => {},
    });
    const chips = container.querySelectorAll('.codebook-group-chip');
    expect(chips.length).toBe(2);
    expect(chips[0]!.textContent).toContain('RQ1');
    expect(chips[1]!.textContent).toContain('RQ2');
  });

  it('chip mostra count de códigos membros', () => {
    const c1 = registry.create('c1');
    const c2 = registry.create('c2');
    const g = registry.createGroup('RQ1');
    registry.addCodeToGroup(c1.id, g.id);
    registry.addCodeToGroup(c2.id, g.id);

    renderCodeGroupsPanel(container, registry, {
      selectedGroupId: null,
      onSelectGroup: () => {},
      onCreateGroup: () => {},
      onChipContextMenu: () => {},
    });
    const chip = container.querySelector('.codebook-group-chip')!;
    expect(chip.textContent).toContain('RQ1');
    expect(chip.textContent).toContain('2');  // count
  });

  it('aplica classe is-selected no chip ativo', () => {
    const g = registry.createGroup('RQ1');
    renderCodeGroupsPanel(container, registry, {
      selectedGroupId: g.id,
      onSelectGroup: () => {},
      onCreateGroup: () => {},
      onChipContextMenu: () => {},
    });
    const chip = container.querySelector('.codebook-group-chip')!;
    expect(chip.classList.contains('is-selected')).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar — falha**

```bash
npm run test -- tests/core/codeGroupsPanel.test.ts --run
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implementar `codeGroupsPanel.ts`**

```ts
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import { setIcon } from 'obsidian';

export interface CodeGroupsPanelCallbacks {
  selectedGroupId: string | null;
  onSelectGroup(groupId: string | null): void;
  onCreateGroup(): void;  // abre PromptModal pra nome
  onChipContextMenu(groupId: string, event: MouseEvent): void;
}

export function renderCodeGroupsPanel(
  container: HTMLElement,
  registry: CodeDefinitionRegistry,
  callbacks: CodeGroupsPanelCallbacks,
): { cleanup: () => void } {
  // Preserva painel existente pra permitir re-render incremental sem recriar container
  let panel = container.querySelector('.codebook-groups-panel') as HTMLElement | null;
  if (!panel) {
    panel = container.createDiv({ cls: 'codebook-groups-panel' });
  } else {
    panel.empty();
  }

  const groups = registry.getAllGroups();
  const hasGroups = groups.length > 0;

  // Header: título + [+] botão
  const header = panel.createDiv({ cls: 'codebook-groups-header' });
  const title = header.createSpan({ cls: 'codebook-groups-title', text: 'Groups' });
  const addBtn = header.createEl('button', { cls: 'codebook-groups-add-btn', attr: { 'aria-label': 'Create group', title: 'Create group' } });
  setIcon(addBtn, 'plus');
  addBtn.addEventListener('click', () => callbacks.onCreateGroup());

  // Collapsed quando vazio (só mostra header + [+], sem chips container)
  if (!hasGroups) {
    panel.addClass('is-empty');
    return { cleanup: () => {} };
  }
  panel.removeClass('is-empty');

  // Chips container
  const chipsWrap = panel.createDiv({ cls: 'codebook-groups-chips' });
  for (const g of groups) {
    const chip = chipsWrap.createEl('button', { cls: 'codebook-group-chip' });
    if (callbacks.selectedGroupId === g.id) chip.addClass('is-selected');

    // Dot de cor
    const dot = chip.createSpan({ cls: 'codebook-group-chip-dot' });
    dot.style.backgroundColor = g.color;

    // Nome
    chip.createSpan({ cls: 'codebook-group-chip-name', text: g.name });

    // Count
    const count = registry.getGroupMemberCount(g.id);
    chip.createSpan({ cls: 'codebook-group-chip-count', text: String(count) });

    // Click toggle: se já selected, des-seleciona; senão seleciona
    chip.addEventListener('click', () => {
      if (callbacks.selectedGroupId === g.id) callbacks.onSelectGroup(null);
      else callbacks.onSelectGroup(g.id);
    });

    // Right-click: context menu
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      callbacks.onChipContextMenu(g.id, e);
    });
  }

  return { cleanup: () => {} };
}
```

- [ ] **Step 4: Rodar — passam 4 testes**

```bash
npm run test -- tests/core/codeGroupsPanel.test.ts --run
```

Expected: 4 PASS.

- [ ] **Step 5: Adicionar teste de click e `[+]` callback**

Append:

```ts
  it('click no chip chama onSelectGroup com o id', () => {
    const g = registry.createGroup('RQ1');
    let selectedId: string | null | undefined;
    renderCodeGroupsPanel(container, registry, {
      selectedGroupId: null,
      onSelectGroup: (id) => { selectedId = id; },
      onCreateGroup: () => {},
      onChipContextMenu: () => {},
    });
    (container.querySelector('.codebook-group-chip') as HTMLElement).click();
    expect(selectedId).toBe(g.id);
  });

  it('click no chip já selecionado des-seleciona (onSelectGroup(null))', () => {
    const g = registry.createGroup('RQ1');
    let selectedId: string | null | undefined = 'initial';
    renderCodeGroupsPanel(container, registry, {
      selectedGroupId: g.id,
      onSelectGroup: (id) => { selectedId = id; },
      onCreateGroup: () => {},
      onChipContextMenu: () => {},
    });
    (container.querySelector('.codebook-group-chip') as HTMLElement).click();
    expect(selectedId).toBeNull();
  });

  it('click no botão [+] dispara onCreateGroup', () => {
    let called = false;
    renderCodeGroupsPanel(container, registry, {
      selectedGroupId: null,
      onSelectGroup: () => {},
      onCreateGroup: () => { called = true; },
      onChipContextMenu: () => {},
    });
    (container.querySelector('.codebook-groups-add-btn') as HTMLElement).click();
    expect(called).toBe(true);
  });

  it('right-click no chip dispara onChipContextMenu com id e event', () => {
    const g = registry.createGroup('RQ1');
    let capturedId: string | null = null;
    renderCodeGroupsPanel(container, registry, {
      selectedGroupId: null,
      onSelectGroup: () => {},
      onCreateGroup: () => {},
      onChipContextMenu: (id) => { capturedId = id; },
    });
    const chip = container.querySelector('.codebook-group-chip') as HTMLElement;
    chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(capturedId).toBe(g.id);
  });
```

- [ ] **Step 6: Rodar — 8 tests passam**

Expected: 8 PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/codeGroupsPanel.ts tests/core/codeGroupsPanel.test.ts
~/.claude/scripts/commit.sh "feat(core): módulo codeGroupsPanel (render chips + [+])"
```

### Task 2.2: Chip contador `🏷N` no codebookTreeRenderer

**Files:**
- Modify: `src/core/codebookTreeRenderer.ts:176-258` (renderCodeRow)
- Test: `tests/core/codeGroupsChipCounter.test.ts`

- [ ] **Step 1: Criar test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

// Não renderizamos a tree completa no unit test — validamos via helper puro
// que decide se o chip aparece, o count, e o title/tooltip

import { computeGroupChipLabel } from '../../src/core/codebookTreeRenderer';

describe('codebookTreeRenderer — chip contador de groups', () => {
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    registry = new CodeDefinitionRegistry();
  });

  it('retorna null quando código não tem groups (chip oculto)', () => {
    const c = registry.create('c1');
    expect(computeGroupChipLabel(c.id, registry)).toBeNull();
  });

  it('retorna null quando code.groups é array vazio', () => {
    const c = registry.create('c1');
    (registry.getById(c.id) as any).groups = [];
    expect(computeGroupChipLabel(c.id, registry)).toBeNull();
  });

  it('retorna count + tooltip com nomes quando há groups', () => {
    const c = registry.create('c1');
    const g1 = registry.createGroup('RQ1');
    const g2 = registry.createGroup('Wave1');
    registry.addCodeToGroup(c.id, g1.id);
    registry.addCodeToGroup(c.id, g2.id);

    const label = computeGroupChipLabel(c.id, registry);
    expect(label).not.toBeNull();
    expect(label!.count).toBe(2);
    expect(label!.tooltip).toContain('RQ1');
    expect(label!.tooltip).toContain('Wave1');
  });
});
```

- [ ] **Step 2: Rodar — falha (função não existe)**

- [ ] **Step 3: Exportar helper `computeGroupChipLabel` em `codebookTreeRenderer.ts`**

No final do arquivo (após `renderCodeRow`), exportar:

```ts
/**
 * Decide se o chip contador de groups (`🏷N`) aparece na row de um código
 * e retorna count + tooltip com nomes dos groups. null = sem chip.
 */
export function computeGroupChipLabel(
  codeId: string,
  registry: CodeDefinitionRegistry,
): { count: number; tooltip: string } | null {
  const groups = registry.getGroupsForCode(codeId);
  if (groups.length === 0) return null;
  return {
    count: groups.length,
    tooltip: groups.map(g => g.name).join(', '),
  };
}
```

Importar `CodeDefinitionRegistry` no topo:

```ts
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
```

- [ ] **Step 4: Rodar — 3 tests passam**

Expected: 3 PASS.

- [ ] **Step 5: Integrar chip na renderCodeRow**

**Signature cascade:** `renderVisibleRows → renderRow → renderCodeRow`. Nesta task, `renderRow` e `renderCodeRow` ganham 1 parâmetro novo (`registry`). **API pública `renderCodebookTree(container, model, state, callbacks)` NÃO muda** — `model.registry` é extraído dentro do closure e passado adiante.

Em `renderCodeRow` (~linha 237, após o `count badge` e antes do `Click listener`):

```ts
// Group chip contador (oculto quando code.groups vazio/undefined)
const groupChip = computeGroupChipLabel(node.def.id, registry);
if (groupChip) {
  const chip = document.createElement('span');
  chip.className = 'codebook-tree-group-chip';
  chip.title = groupChip.tooltip;
  setIcon(chip, 'tag');
  const num = document.createElement('span');
  num.className = 'codebook-tree-group-chip-count';
  num.textContent = String(groupChip.count);
  chip.appendChild(num);
  row.appendChild(chip);
}
```

Estender signature de `renderCodeRow`:

```ts
function renderCodeRow(
  node: FlatCodeNode,
  counts: CountIndex,
  index: number,
  callbacks: CodebookTreeCallbacks,
  registry: CodeDefinitionRegistry,  // NEW — será estendido com +1 param (selectedGroupId) em Task 2.3
): HTMLElement {
```

Estender `renderRow`:

```ts
function renderRow(
  node: FlatTreeNode,
  counts: CountIndex,
  index: number,
  callbacks: CodebookTreeCallbacks,
  registry: CodeDefinitionRegistry,  // NEW
): HTMLElement {
  if (node.type === 'folder') return renderFolderRow(node, index, callbacks);
  return renderCodeRow(node, counts, index, callbacks, registry);
}
```

E no `renderVisibleRows` closure dentro de `renderCodebookTree`, ler `model.registry`:

```ts
const rowEl = renderRow(node, counts, i, callbacks, model.registry);
```

- [ ] **Step 6: Rodar test suite completa — deve continuar passando + 3 novos**

```bash
npm run test -- --run
```

Expected: tests de tree renderer existentes continuam passando (pattern é aditivo), 3 novos de chip counter passam.

- [ ] **Step 7: Commit**

```bash
git add src/core/codebookTreeRenderer.ts tests/core/codeGroupsChipCounter.test.ts
~/.claude/scripts/commit.sh "feat(core): chip contador de groups nas rows do codebook"
```

### Task 2.3: Filter state + destaque contextual na tree

**Files:**
- Modify: `src/core/codebookTreeRenderer.ts` (CodebookTreeState + renderCodeRow)
- Modify: `src/core/hierarchyHelpers.ts` (opcional — se precisar passar groupFilter em buildFlatTree; provavelmente não)
- Test: `tests/core/codeGroupsFilter.test.ts` (parte sidebar apenas; Analytics vem em Chunk 4)

- [ ] **Step 1: Criar test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { applyGroupFilterToRowClasses } from '../../src/core/codebookTreeRenderer';

describe('codeGroupsFilter — sidebar destaque contextual', () => {
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    registry = new CodeDefinitionRegistry();
  });

  it('applyGroupFilterToRowClasses retorna "member" quando código é membro', () => {
    const c = registry.create('c1');
    const g = registry.createGroup('RQ1');
    registry.addCodeToGroup(c.id, g.id);
    expect(applyGroupFilterToRowClasses(c.id, g.id, registry)).toBe('member');
  });

  it('retorna "non-member" quando código NÃO é membro do group selecionado', () => {
    const c = registry.create('c1');
    const g = registry.createGroup('RQ1');
    // código NÃO adicionado ao group
    expect(applyGroupFilterToRowClasses(c.id, g.id, registry)).toBe('non-member');
  });

  it('retorna "none" quando selectedGroupId é null', () => {
    const c = registry.create('c1');
    expect(applyGroupFilterToRowClasses(c.id, null, registry)).toBe('none');
  });
});
```

- [ ] **Step 2: Rodar — falha (função não existe)**

- [ ] **Step 3: Implementar helper + wire na renderCodeRow**

Em `codebookTreeRenderer.ts`, exportar:

```ts
export function applyGroupFilterToRowClasses(
  codeId: string,
  selectedGroupId: string | null,
  registry: CodeDefinitionRegistry,
): 'member' | 'non-member' | 'none' {
  if (!selectedGroupId) return 'none';
  const code = registry.getById(codeId);
  if (code?.groups?.includes(selectedGroupId)) return 'member';
  return 'non-member';
}
```

Estender `CodebookTreeState`:

```ts
export interface CodebookTreeState {
  expanded: ExpandedState;
  searchQuery: string;
  dragMode: 'reorganize' | 'merge';
  selectedGroupId: string | null;  // NEW
}
```

**Signature cascade (continuação da Task 2.2):** `renderRow` e `renderCodeRow` já têm `registry` como 5º parâmetro. Agora ganham `selectedGroupId` como 6º:

```ts
// renderCodeRow
function renderCodeRow(
  node: FlatCodeNode,
  counts: CountIndex,
  index: number,
  callbacks: CodebookTreeCallbacks,
  registry: CodeDefinitionRegistry,
  selectedGroupId: string | null,  // NEW
): HTMLElement { ... }

// renderRow
function renderRow(
  node: FlatTreeNode,
  counts: CountIndex,
  index: number,
  callbacks: CodebookTreeCallbacks,
  registry: CodeDefinitionRegistry,
  selectedGroupId: string | null,  // NEW
): HTMLElement { ... }

// renderVisibleRows closure:
const rowEl = renderRow(node, counts, i, callbacks, model.registry, state.selectedGroupId);
```

Em `renderCodeRow`, ao final antes do return, aplicar classes:

```ts
const membership = applyGroupFilterToRowClasses(node.def.id, selectedGroupId, registry);
if (membership === 'member') row.addClass('is-group-member');
else if (membership === 'non-member') row.addClass('is-group-non-member');
```

- [ ] **Step 4: Rodar — 3 novos passam**

Expected: 3 PASS.

- [ ] **Step 5: Adicionar CSS**

Em `styles.css`, adicionar ao final (não modifica existente):

```css
/* ─── Code Groups — panel ─────────────────────────── */
.codebook-groups-panel {
  padding: 6px 8px;
  border-bottom: 1px solid var(--background-modifier-border);
}
.codebook-groups-panel.is-empty .codebook-groups-chips { display: none; }
.codebook-groups-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.codebook-groups-title {
  font-size: var(--font-smallest);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.codebook-groups-add-btn {
  padding: 2px 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
}
.codebook-groups-add-btn:hover { color: var(--text-normal); }
.codebook-groups-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.codebook-group-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  font-size: var(--font-smallest);
  cursor: pointer;
}
.codebook-group-chip:hover {
  background: var(--background-modifier-hover);
}
.codebook-group-chip.is-selected {
  border-color: var(--interactive-accent);
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.codebook-group-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.codebook-group-chip-count {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
.codebook-group-chip.is-selected .codebook-group-chip-count {
  color: var(--text-on-accent);
}

/* ─── Tree chip contador (🏷N) ─────────────────────── */
.codebook-tree-group-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  color: var(--text-muted);
  font-size: var(--font-smallest);
}
.codebook-tree-group-chip-count {
  font-variant-numeric: tabular-nums;
}

/* ─── Filter contextual (selectedGroupId setado) ───── */
/* Usa box-shadow inset em vez de border-left pra não deslocar o padding da row. */
.codebook-tree-row.is-group-member {
  box-shadow: inset 2px 0 0 var(--interactive-accent);
}
/* Usa filter em vez de opacity pra compor limpo com .qc-code-row-hidden (0.5 opacity) */
.codebook-tree-row.is-group-non-member:not(.qc-code-row-hidden) {
  opacity: 0.4;
}
/* Quando ambos aplicam: hidden wins (0.5 fixo), sem multiplicar */
```

- [ ] **Step 6: Commit**

```bash
git add src/core/codebookTreeRenderer.ts tests/core/codeGroupsFilter.test.ts styles.css
~/.claude/scripts/commit.sh "feat(core): selectedGroupId + destaque contextual na tree + CSS de groups"
```

### Task 2.4a: Wire panel em detailListRenderer + state no baseCodeDetailView

**Files:**
- Modify: `src/core/detailListRenderer.ts` (renderListContent)
- Modify: `src/core/baseCodeDetailView.ts` (selectedGroupId field + getTreeState + ListRendererCallbacks)

- [ ] **Step 1: Adicionar campo `selectedGroupId` em `BaseCodeDetailView`**

Em `src/core/baseCodeDetailView.ts`, próximo aos campos `expanded`, `searchQuery`, `treeDragMode`:

```ts
protected selectedGroupId: string | null = null;
```

- [ ] **Step 2: Estender `getTreeState()` pra incluir `selectedGroupId`**

Em `baseCodeDetailView.ts:154`:

```ts
protected getTreeState(): CodebookTreeState {
  return {
    expanded: this.expanded,
    searchQuery: this.searchQuery,
    dragMode: this.treeDragMode,
    selectedGroupId: this.selectedGroupId,  // NEW
  };
}
```

- [ ] **Step 3: Estender `ListRendererCallbacks` em `detailListRenderer.ts`**

```ts
export interface ListRendererCallbacks extends CodebookTreeCallbacks {
  onDragModeChange(mode: 'reorganize' | 'merge'): void;
  // NEW — Groups
  onSelectGroup(groupId: string | null): void;
  onCreateGroup(): void;
  onGroupChipContextMenu(groupId: string, event: MouseEvent): void;
}
```

- [ ] **Step 4: Wire o painel em `renderListContent`**

Modificar `renderListContent` em `detailListRenderer.ts:68`:

```ts
import { renderCodeGroupsPanel } from './codeGroupsPanel';

export function renderListContent(
  contentZone: HTMLElement,
  model: SidebarModelInterface,
  treeState: CodebookTreeState,
  callbacks: ListRendererCallbacks,
): void {
  contentZone.empty();

  // Painel Groups acima da tree
  renderCodeGroupsPanel(contentZone, model.registry, {
    selectedGroupId: treeState.selectedGroupId,
    onSelectGroup: callbacks.onSelectGroup,
    onCreateGroup: callbacks.onCreateGroup,
    onChipContextMenu: callbacks.onGroupChipContextMenu,
  });

  renderCodebookTree(contentZone, model, treeState, callbacks);
}
```

- [ ] **Step 5: Implementar os 3 callbacks novos no `listCallbacks()` do `baseCodeDetailView`**

Dentro do método `listCallbacks()` (que retorna o objeto `ListRendererCallbacks`), adicionar:

```ts
onSelectGroup: (groupId) => {
  this.selectedGroupId = groupId;
  this.refreshCurrentMode();  // pattern existente; re-renderiza a list content
},

onCreateGroup: () => {
  new PromptModal({
    app: this.app,
    title: 'New group',
    placeholder: 'Group name',
    onSubmit: (name) => {
      const trimmed = name.trim();
      if (!trimmed) {
        new Notice('Group name cannot be empty.');
        return;
      }
      this.model.registry.createGroup(trimmed);
      this.refreshCurrentMode();
    },
  }).open();
},

onGroupChipContextMenu: (groupId, evt) => {
  this.openGroupChipMenu(groupId, evt);  // método privado — ver Task 2.4b
},
```

Notas:
- `new PromptModal({ app, title, ... })` — **um único opts object** com `app` como property. NÃO use `new PromptModal(this.app, {...})`.
- Usa `refreshCurrentMode()` existente em `baseCodeDetailView.ts:137`.

- [ ] **Step 6: Verificar tsc compila**

```bash
npx tsc --noEmit
```

Expected: compile limpo. Falhas provavelmente são de `openGroupChipMenu` ainda não implementado (Task 2.4b); ignorar se for só isso.

- [ ] **Step 7: Commit**

```bash
git add src/core/detailListRenderer.ts src/core/baseCodeDetailView.ts
~/.claude/scripts/commit.sh "feat(core): wire painel Groups no codebook (state + callbacks create/select)"
```

### Task 2.4b: Right-click chip menu — Rename / Edit color / Edit description / Delete

**Files:**
- Modify: `src/core/baseCodeDetailView.ts` (adicionar private `openGroupChipMenu`)

- [ ] **Step 1: Imports necessários**

No topo de `baseCodeDetailView.ts`, garantir imports:

```ts
import { Menu, Notice } from 'obsidian';
// PromptModal e ConfirmModal já importados de './dialogs'
```

- [ ] **Step 2: Implementar `openGroupChipMenu` como private method**

```ts
private openGroupChipMenu(groupId: string, evt: MouseEvent): void {
  const g = this.model.registry.getGroup(groupId);
  if (!g) return;

  const menu = new Menu();

  // Rename
  menu.addItem((item) => item
    .setTitle('Rename')
    .setIcon('pencil')
    .onClick(() => {
      new PromptModal({
        app: this.app,
        title: 'Rename group',
        initialValue: g.name,
        onSubmit: (newName) => {
          const trimmed = newName.trim();
          if (!trimmed) {
            new Notice('Group name cannot be empty.');
            return;
          }
          this.model.registry.renameGroup(groupId, trimmed);
          this.refreshCurrentMode();
        },
      }).open();
    })
  );

  // Edit color — usa input[type=color] inline (sem modal custom)
  menu.addItem((item) => item
    .setTitle('Edit color')
    .setIcon('palette')
    .onClick(() => {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = g.color;
      input.style.position = 'fixed';
      input.style.left = '-9999px';  // hidden
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        this.model.registry.setGroupColor(groupId, input.value);
        input.remove();
        this.refreshCurrentMode();
      }, { once: true });
      input.addEventListener('blur', () => {
        // fallback cleanup se user cancelar
        setTimeout(() => input.remove(), 100);
      }, { once: true });
      input.click();
    })
  );

  // Edit description — PromptModal single-line (multiline fica pra future)
  menu.addItem((item) => item
    .setTitle('Edit description')
    .setIcon('file-text')
    .onClick(() => {
      new PromptModal({
        app: this.app,
        title: 'Edit description',
        initialValue: g.description ?? '',
        placeholder: 'Short description (optional)',
        onSubmit: (desc) => {
          const trimmed = desc.trim();
          this.model.registry.setGroupDescription(groupId, trimmed || undefined);
          this.refreshCurrentMode();
        },
      }).open();
    })
  );

  menu.addSeparator();

  // Delete
  menu.addItem((item) => item
    .setTitle('Delete')
    .setIcon('trash')
    .setWarning(true)
    .onClick(() => {
      const memberCount = this.model.registry.getGroupMemberCount(groupId);
      new ConfirmModal({
        app: this.app,
        title: 'Delete group',
        message: `Delete group "${g.name}"? ${memberCount} code(s) will lose this membership.`,
        confirmLabel: 'Delete',
        destructive: true,
        onConfirm: () => {
          this.model.registry.deleteGroup(groupId);
          if (this.selectedGroupId === groupId) this.selectedGroupId = null;
          this.refreshCurrentMode();
        },
      }).open();
    })
  );

  menu.showAtMouseEvent(evt);
}
```

Notas importantes sobre APIs:
- `ConfirmModal` usa `confirmLabel` (não `confirmText`), `destructive` (não `warning`).
- Ambos Modals recebem `app` como property do opts (não como 1º argumento separado).
- `input[type=color]` inline evita criar um `ColorPickerModal` novo; funciona porque o browser nativo abre um color picker quando o input é `.click()`-ado.

- [ ] **Step 3: Verificar tsc compila**

```bash
npx tsc --noEmit
```

Expected: compile limpo.

- [ ] **Step 4: Rodar test suite completa pra garantir nada quebrou**

```bash
npm run test -- --run
```

Expected: todos os tests passam. Não há unit tests pro menu handler em si (Menu da Obsidian não tem mock — estratégia ✓).

- [ ] **Step 5: Commit**

```bash
git add src/core/baseCodeDetailView.ts
~/.claude/scripts/commit.sh "feat(core): context menu do chip de Group (Rename/Color/Desc/Delete)"
```

### Task 2.4c: Smoke test manual (integration validation)

**Files:** nenhum (só manual testing no Obsidian real)

Esta task valida o comportamento end-to-end no Obsidian real. É separada do ciclo TDD porque é integration, não unit.

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: build sem erros; `main.js` regenerado.

- [ ] **Step 2: Reload do plugin no vault `obsidian-plugins-workbench/`**

Cmd+R (Obsidian) ou Settings → Community plugins → Qualia Coding → disable/enable.

- [ ] **Step 3: Executar checklist de smoke:**

1. Abrir codebook sidebar (Tag view) — painel Groups aparece vazio no topo (só header + `[+]`).
2. Clicar `[+]` — PromptModal abre pedindo nome.
3. Criar "RQ1" — chip aparece no painel com a cor `#AEC6FF`.
4. Criar 2 códigos quaisquer.
5. Manualmente adicionar `groups: ['g_XXX']` no data.json (workaround até Task 3.1) ou usar console do DevTools pra `plugin.codeRegistry.addCodeToGroup('c_X', 'g_X')`. Reload.
6. Ver chip `🏷1` nas rows dos códigos membros; tooltip mostra "RQ1".
7. Clicar chip "RQ1" no painel — tree mostra borda nos membros (accent color) e fade nos não-membros.
8. Clicar novamente — filter limpa.
9. Right-click no chip "RQ1" — menu aparece (Rename/Edit color/Edit description/Delete).
10. Rename pra "Research Question 1" — chip atualiza.
11. Edit color — picker abre, mudar cor — chip atualiza.
12. Edit description — prompt abre, salvar — persiste no data.json (verificar `registry.groups.g_X.description`).
13. Delete — ConfirmModal com count correto. Confirmar — chip some, membership do código limpa (code.groups fica `undefined`).

- [ ] **Step 4: Se algo falha, criar fix commits adicionais antes de avançar pra Chunk 3**

Cada regressão descoberta deve virar um commit próprio:

```bash
~/.claude/scripts/commit.sh "fix(core): <descrição curta do bug encontrado no smoke>"
```

- [ ] **Step 5: Registrar smoke checklist em `docs/smoke-tests/code-groups.md` (opcional, reproduzibilidade)**

Se quiser formalizar o checklist acima como artefato do repo:

```bash
mkdir -p docs/smoke-tests
```

Criar `docs/smoke-tests/code-groups.md` copiando os 13 steps acima. Commit separado:

```bash
git add docs/smoke-tests/code-groups.md
~/.claude/scripts/commit.sh "docs: smoke checklist de Code Groups"
```

---

## Chunk 2 summary

Ao final deste chunk:
- Painel "Groups" funcional no codebook sidebar (render + click + create + right-click menu com Rename/Color/Desc/Delete)
- Chip contador `🏷N` em cada code row (tooltip com nomes dos groups; oculto quando sem groups)
- Destaque contextual na tree quando um group é selecionado (box-shadow inset nos membros, opacity fade nos não-membros — compõe limpo com `.qc-code-row-hidden` via `:not()` guard)
- CSS completo pros 3 componentes (panel, chip contador, filter classes)
- +14 testes (4 panel render + 4 panel interações + 3 chip counter + 3 filter = 14 total, zero overlap)
- Baseline pós-Chunk 1: ~2128 → pós-Chunk 2: ~2142
- Edit description usa PromptModal single-line (multiline fica pra tier 3 / future)
- Edit color usa `input[type=color]` inline (sem ColorPickerModal custom)

**Próximo chunk:** Code Detail section + right-click "Add to group" + merge herda groups.

## Chunk 3: Add-to-group flow (right-click + Code Detail + Merge)

Esta chunk completa a UX de membership: adicionar/remover código de group via right-click (fluxo rápido na tree) e via Code Detail section (fluxo reflexivo quando olhando o código), além do comportamento de merge (target herda union dos groups).

### Task 3.1: Code Detail — seção Groups

**Files:**
- Modify: `src/core/detailCodeRenderer.ts` (adicionar `renderGroupsSection` entre Description e Hierarchy)
- Test: `tests/core/codeGroupsDetailSection.test.ts`

- [ ] **Step 1: Criar test file**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { renderGroupsSection } from '../../src/core/detailCodeRenderer';

describe('Code Detail — Groups section', () => {
  let container: HTMLElement;
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    registry = new CodeDefinitionRegistry();
  });

  afterEach(() => { container.remove(); });

  it('não renderiza nada quando código não tem groups E não há groups disponíveis', () => {
    const c = registry.create('c1');
    renderGroupsSection(container, c.id, registry, {
      onAddGroup: () => {},
      onRemoveGroup: () => {},
    });
    // Seção renderiza o header mas sem chips (pra permitir [+] e criar o primeiro group)
    expect(container.querySelector('.codemarker-detail-groups')).toBeTruthy();
    expect(container.querySelectorAll('.codemarker-detail-group-chip').length).toBe(0);
  });

  it('renderiza chips dos groups do código com botão × pra remover', () => {
    const c = registry.create('c1');
    const g1 = registry.createGroup('RQ1');
    const g2 = registry.createGroup('Wave1');
    registry.addCodeToGroup(c.id, g1.id);
    registry.addCodeToGroup(c.id, g2.id);

    renderGroupsSection(container, c.id, registry, {
      onAddGroup: () => {},
      onRemoveGroup: () => {},
    });

    const chips = container.querySelectorAll('.codemarker-detail-group-chip');
    expect(chips.length).toBe(2);
    expect(chips[0]!.textContent).toContain('RQ1');
    expect(chips[1]!.textContent).toContain('Wave1');
    // Cada chip tem button de remove
    expect(container.querySelectorAll('.codemarker-detail-group-chip-remove').length).toBe(2);
  });

  it('click no × dispara onRemoveGroup com codeId e groupId', () => {
    const c = registry.create('c1');
    const g = registry.createGroup('RQ1');
    registry.addCodeToGroup(c.id, g.id);

    let capturedGroupId: string | null = null;
    renderGroupsSection(container, c.id, registry, {
      onAddGroup: () => {},
      onRemoveGroup: (_codeId, gid) => { capturedGroupId = gid; },
    });

    (container.querySelector('.codemarker-detail-group-chip-remove') as HTMLElement).click();
    expect(capturedGroupId).toBe(g.id);
  });

  it('click no [+] dispara onAddGroup com codeId', () => {
    const c = registry.create('c1');
    let capturedCodeId: string | null = null;
    renderGroupsSection(container, c.id, registry, {
      onAddGroup: (codeId) => { capturedCodeId = codeId; },
      onRemoveGroup: () => {},
    });
    (container.querySelector('.codemarker-detail-groups-add-btn') as HTMLElement).click();
    expect(capturedCodeId).toBe(c.id);
  });

  it('estado misto: código em alguns groups, outros groups disponíveis — renderiza chips dos membros + [+] ainda visível', () => {
    const c = registry.create('c1');
    const g1 = registry.createGroup('RQ1');
    registry.createGroup('RQ2');  // existe mas código NÃO é membro
    registry.addCodeToGroup(c.id, g1.id);

    renderGroupsSection(container, c.id, registry, {
      onAddGroup: () => {},
      onRemoveGroup: () => {},
    });

    expect(container.querySelectorAll('.codemarker-detail-group-chip').length).toBe(1);
    expect(container.querySelector('.codemarker-detail-group-chip')!.textContent).toContain('RQ1');
    expect(container.querySelector('.codemarker-detail-groups-add-btn')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar — falha (função não existe)**

- [ ] **Step 3: Implementar `renderGroupsSection` em `detailCodeRenderer.ts`**

No topo do arquivo, garantir import:

```ts
import { setIcon } from 'obsidian';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
```

Adicionar função exportada (sugestão: ao final do arquivo, antes de `renderAuditSection`):

```ts
export interface GroupsSectionCallbacks {
  onAddGroup(codeId: string): void;  // abrirá FuzzySuggestModal no caller
  onRemoveGroup(codeId: string, groupId: string): void;
}

export function renderGroupsSection(
  container: HTMLElement,
  codeId: string,
  registry: CodeDefinitionRegistry,
  callbacks: GroupsSectionCallbacks,
): void {
  const section = container.createDiv({ cls: 'codemarker-detail-section codemarker-detail-groups' });

  const header = section.createDiv({ cls: 'codemarker-detail-groups-header' });
  header.createEl('h6', { text: 'Groups' });
  const addBtn = header.createEl('button', {
    cls: 'codemarker-detail-groups-add-btn',
    attr: { 'aria-label': 'Add to group', title: 'Add to group' },
  });
  setIcon(addBtn, 'plus');
  addBtn.addEventListener('click', () => callbacks.onAddGroup(codeId));

  const groups = registry.getGroupsForCode(codeId);
  if (groups.length === 0) return;

  const chipsWrap = section.createDiv({ cls: 'codemarker-detail-groups-chips' });
  for (const g of groups) {
    const chip = chipsWrap.createDiv({ cls: 'codemarker-detail-group-chip' });
    const dot = chip.createSpan({ cls: 'codemarker-detail-group-chip-dot' });
    dot.style.backgroundColor = g.color;
    chip.createSpan({ cls: 'codemarker-detail-group-chip-name', text: g.name });
    const remove = chip.createEl('button', {
      cls: 'codemarker-detail-group-chip-remove',
      attr: { 'aria-label': `Remove from ${g.name}`, title: `Remove from ${g.name}` },
    });
    setIcon(remove, 'x');
    remove.addEventListener('click', () => callbacks.onRemoveGroup(codeId, g.id));
  }
}
```

- [ ] **Step 4: Inserir chamada em `renderCodeDetail`**

Em `detailCodeRenderer.ts:89`, após `renderCodeDescription` e antes de `renderHierarchySection`:

```ts
// Description — editable textarea
renderCodeDescription(container, def, model, callbacks);

// Groups (Tier 1.5) — entre Description e Hierarchy
if (def) {
  renderGroupsSection(container, def.id, model.registry, {
    onAddGroup: callbacks.onAddToGroup,
    onRemoveGroup: callbacks.onRemoveFromGroup,
  });
}

// Hierarchy section (parent + children)
if (def) renderHierarchySection(container, def, model.registry, callbacks);
```

- [ ] **Step 5: Estender `CodeRendererCallbacks`**

Interface em `src/core/detailCodeRenderer.ts:17`. Adicionar os 2 callbacks:

```ts
export interface CodeRendererCallbacks {
  // ... existing ...
  onAddToGroup(codeId: string): void;
  onRemoveFromGroup(codeId: string, groupId: string): void;
}
```

- [ ] **Step 6: Wire callbacks no `baseCodeDetailView`**

Onde o `callbacks` do `renderCodeDetail` é construído (buscar por `renderCodeDetail(` em `baseCodeDetailView.ts`), adicionar:

```ts
onAddToGroup: (codeId) => {
  this.openAddToGroupPicker(codeId);  // método privado — ver Task 3.2
},
onRemoveFromGroup: (codeId, groupId) => {
  this.model.registry.removeCodeFromGroup(codeId, groupId);
  this.refreshCurrentMode();
},
```

`openAddToGroupPicker` será compartilhado com o context menu (Task 3.2).

- [ ] **Step 7: CSS**

Append em `styles.css`:

```css
.codemarker-detail-groups-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.codemarker-detail-groups-add-btn {
  padding: 2px 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
}
.codemarker-detail-groups-add-btn:hover { color: var(--text-normal); }
.codemarker-detail-groups-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}
.codemarker-detail-group-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 8px;
  border-radius: 12px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  font-size: var(--font-smallest);
}
.codemarker-detail-group-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.codemarker-detail-group-chip-remove {
  padding: 0 2px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
}
.codemarker-detail-group-chip-remove:hover { color: var(--text-normal); }
```

- [ ] **Step 8: Rodar tests — 4 passam**

Expected: 4 PASS (groupDetailSection.test).

- [ ] **Step 9: Commit**

```bash
git add src/core/detailCodeRenderer.ts src/core/baseCodeDetailView.ts tests/core/codeGroupsDetailSection.test.ts styles.css
~/.claude/scripts/commit.sh "feat(core): seção Groups no Code Detail view (chips removíveis + [+] add)"
```

### Task 3.2: `openAddToGroupPicker` helper + FuzzySuggestModal

**Files:**
- Create: `src/core/codeGroupsAddPicker.ts` (módulo isolado pra facilitar teste da lógica de seleção)
- Modify: `src/core/baseCodeDetailView.ts` (método `openAddToGroupPicker`)
- Test: `tests/core/codeGroupsAddPicker.test.ts`

- [ ] **Step 1: Criar test da lógica pura**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { getAddToGroupCandidates } from '../../src/core/codeGroupsAddPicker';

describe('getAddToGroupCandidates', () => {
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    registry = new CodeDefinitionRegistry();
  });

  it('retorna todos groups quando código não é membro de nenhum', () => {
    const c = registry.create('c1');
    const g1 = registry.createGroup('RQ1');
    const g2 = registry.createGroup('RQ2');
    const result = getAddToGroupCandidates(c.id, registry);
    expect(result.map(g => g.id).sort()).toEqual([g1.id, g2.id].sort());
  });

  it('exclui groups dos quais o código já é membro', () => {
    const c = registry.create('c1');
    const g1 = registry.createGroup('RQ1');
    const g2 = registry.createGroup('RQ2');
    registry.addCodeToGroup(c.id, g1.id);
    const result = getAddToGroupCandidates(c.id, registry);
    expect(result.map(g => g.id)).toEqual([g2.id]);
  });

  it('retorna lista vazia quando não há groups', () => {
    const c = registry.create('c1');
    expect(getAddToGroupCandidates(c.id, registry)).toEqual([]);
  });
});
```

- [ ] **Step 2: Implementar helper puro em `codeGroupsAddPicker.ts`**

```ts
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';
import type { GroupDefinition } from './types';

/**
 * Retorna lista de groups aos quais o código ainda NÃO é membro.
 * Usado pra popular o FuzzySuggestModal de "Add to group".
 */
export function getAddToGroupCandidates(
  codeId: string,
  registry: CodeDefinitionRegistry,
): GroupDefinition[] {
  const memberOf = new Set(registry.getGroupsForCode(codeId).map(g => g.id));
  return registry.getAllGroups().filter(g => !memberOf.has(g.id));
}
```

- [ ] **Step 3: Rodar — 3 tests passam**

- [ ] **Step 4: Implementar `openAddToGroupPicker` em `baseCodeDetailView.ts`**

```ts
import { FuzzySuggestModal, Notice } from 'obsidian';
import type { GroupDefinition } from './types';
import { getAddToGroupCandidates } from './codeGroupsAddPicker';

// Dentro da classe BaseCodeDetailView:

private openAddToGroupPicker(codeId: string): void {
  const candidates = getAddToGroupCandidates(codeId, this.model.registry);
  const plugin = this;

  class AddGroupModal extends FuzzySuggestModal<GroupDefinition | { id: '__new__'; name: string }> {
    getItems() {
      const items: Array<GroupDefinition | { id: '__new__'; name: string }> = [...candidates];
      items.push({ id: '__new__', name: '+ New group...' } as any);
      return items;
    }
    getItemText(item: GroupDefinition | { id: '__new__'; name: string }) {
      return item.name;
    }
    onChooseItem(item: GroupDefinition | { id: '__new__'; name: string }) {
      if (item.id === '__new__') {
        new PromptModal({
          app: plugin.app,
          title: 'New group',
          placeholder: 'Group name',
          onSubmit: (name) => {
            const trimmed = name.trim();
            if (!trimmed) {
              new Notice('Group name cannot be empty.');
              return;
            }
            const g = plugin.model.registry.createGroup(trimmed);
            plugin.model.registry.addCodeToGroup(codeId, g.id);
            plugin.refreshCurrentMode();
          },
        }).open();
      } else {
        plugin.model.registry.addCodeToGroup(codeId, item.id);
        plugin.refreshCurrentMode();
      }
    }
  }

  new AddGroupModal(this.app).open();
}
```

Notas:
- `FuzzySuggestModal` é importado de 'obsidian'. Mock existe em `tests/mocks/obsidian.ts` — mas classe pode não estar exposed. **Verificar** no Step 5 abaixo; se faltar, stub mínimo.
- Pattern inspira-se em `src/core/codeBrowserModal.ts:42` — que já usa `onChooseItem(item: CodeDefinition)` single-param (TS aceita override narrower, comprovado no codebase). Plan segue o mesmo shape.
- `const plugin = this` é pattern válido de closure pra inner class. Alternativa seria passar dependências como props (estilo `CodeBrowserModal`); ambos compilam.

- [ ] **Step 5: Verificar/adicionar mock de FuzzySuggestModal se faltar**

```bash
grep -n "FuzzySuggestModal" tests/mocks/obsidian.ts
```

Se ausente, adicionar no mock:

```ts
export class FuzzySuggestModal<T> extends Modal {
  getItems(): T[] { return []; }
  getItemText(_item: T): string { return ''; }
  onChooseItem(_item: T, _evt: MouseEvent | KeyboardEvent): void {}
}
```

- [ ] **Step 6: Commit**

```bash
git add src/core/codeGroupsAddPicker.ts src/core/baseCodeDetailView.ts tests/core/codeGroupsAddPicker.test.ts tests/mocks/obsidian.ts
~/.claude/scripts/commit.sh "feat(core): openAddToGroupPicker + FuzzySuggestModal de candidates"
```

### Task 3.3: Right-click código → submenu "Add to group"

**Files:**
- Modify: `src/core/codebookContextMenu.ts` (adicionar item entre Merge e Change color)
- Modify: `src/core/baseCodeDetailView.ts` (adicionar callback)

- [ ] **Step 1: Estender `ContextMenuCallbacks`**

Em `codebookContextMenu.ts:11-21`:

```ts
export interface ContextMenuCallbacks {
  // ... existing ...
  promptAddToGroup(codeId: string): void;  // NEW
}
```

- [ ] **Step 2: Adicionar item no menu**

Em `codebookContextMenu.ts`, após o `menu.addItem(... 'Merge with...' ...)` e antes do separator seguinte:

```ts
menu.addItem(item =>
  item.setTitle('Add to group...').setIcon('tag').onClick(() => callbacks.promptAddToGroup(codeId)),
);
```

- [ ] **Step 3: Wire callback em `baseCodeDetailView`**

Onde `ContextMenuCallbacks` é construído (grep por `promptRename` ou `promptMoveTo`):

```ts
promptAddToGroup: (codeId) => this.openAddToGroupPicker(codeId),
```

- [ ] **Step 4: Verificar tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/core/codebookContextMenu.ts src/core/baseCodeDetailView.ts
~/.claude/scripts/commit.sh "feat(core): right-click codigo → Add to group (reusa openAddToGroupPicker)"
```

### Task 3.4: Merge — target herda union dos groups

**Files:**
- Modify: `src/core/mergeModal.ts` (função `executeMerge`)
- Test: `tests/core/mergeModal.test.ts` (estender se existir; senão criar `tests/core/mergeGroupsUnion.test.ts`)

- [ ] **Step 1: Criar/estender test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { executeMerge } from '../../src/core/mergeModal';

describe('executeMerge — Groups union', () => {
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    registry = new CodeDefinitionRegistry();
  });

  it('target herda groups do source (union) quando target não tinha groups', () => {
    const target = registry.create('target');
    const source = registry.create('source');
    const g1 = registry.createGroup('RQ1');
    registry.addCodeToGroup(source.id, g1.id);

    executeMerge({
      destinationId: target.id,
      sourceIds: [source.id],
      registry,
      markers: [],
    });

    expect(registry.getById(target.id)?.groups).toEqual([g1.id]);
    // Source deletado
    expect(registry.getById(source.id)).toBeUndefined();
  });

  it('target herda union (groups de target + source, sem duplicatas)', () => {
    const target = registry.create('target');
    const source = registry.create('source');
    const g1 = registry.createGroup('RQ1');
    const g2 = registry.createGroup('RQ2');
    const g3 = registry.createGroup('Wave1');
    registry.addCodeToGroup(target.id, g1.id);
    registry.addCodeToGroup(target.id, g2.id);
    registry.addCodeToGroup(source.id, g2.id);  // overlap
    registry.addCodeToGroup(source.id, g3.id);

    executeMerge({
      destinationId: target.id,
      sourceIds: [source.id],
      registry,
      markers: [],
    });

    const finalGroups = registry.getById(target.id)?.groups ?? [];
    expect(finalGroups.sort()).toEqual([g1.id, g2.id, g3.id].sort());
  });

  it('multi-source merge: target herda union de todos os sources', () => {
    const target = registry.create('target');
    const s1 = registry.create('s1');
    const s2 = registry.create('s2');
    const g1 = registry.createGroup('RQ1');
    const g2 = registry.createGroup('RQ2');
    registry.addCodeToGroup(s1.id, g1.id);
    registry.addCodeToGroup(s2.id, g2.id);

    executeMerge({
      destinationId: target.id,
      sourceIds: [s1.id, s2.id],
      registry,
      markers: [],
    });

    expect(registry.getById(target.id)?.groups?.sort()).toEqual([g1.id, g2.id].sort());
  });
});
```

- [ ] **Step 2: Rodar — falha (union ainda não implementado)**

- [ ] **Step 3: Implementar union dentro do bloco "Record mergedFrom" em `executeMerge`**

Em `src/core/mergeModal.ts:60-66` (o bloco existente "3. Record mergedFrom"), expandir pra também computar union dos groups. `destDef` já está declarado; reusa:

```ts
// 3. Record mergedFrom + union dos groups (target + todos sources)
const destDef = registry.getById(destinationId);
if (destDef) {
  if (!destDef.mergedFrom) destDef.mergedFrom = [];
  destDef.mergedFrom.push(...sourceIds);
  destDef.updatedAt = Date.now();

  // Union dos groups: evita perder contexto analítico quando target absorve source.
  // Roda ANTES do step 5 (delete sources) — snapshot pego enquanto srcDef ainda existe.
  const unionGroups = new Set<string>(destDef.groups ?? []);
  for (const srcId of sourceIds) {
    const srcDef = registry.getById(srcId);
    if (srcDef?.groups) {
      for (const gid of srcDef.groups) unionGroups.add(gid);
    }
  }
  if (unionGroups.size > 0) {
    destDef.groups = Array.from(unionGroups);
  }
}
```

Nota: `registry.delete(srcId)` no step 5 não invoca `deleteGroup`; apenas remove o código do registry. `code.groups[]` do source some junto mas o snapshot já foi feito em `unionGroups`.

- [ ] **Step 4: Rodar — 3 tests passam**

- [ ] **Step 5: Verificar que tests existentes de mergeModal não quebraram**

```bash
npm run test -- tests/core/mergeModal --run 2>/dev/null || true
npm run test -- --run
```

Expected: suite completa passa. +3 novos tests de groups union.

- [ ] **Step 6: Commit**

```bash
git add src/core/mergeModal.ts tests/core/mergeGroupsUnion.test.ts
~/.claude/scripts/commit.sh "feat(core): merge preserva union dos groups no target (audit trail analítico)"
```

### Task 3.5: Smoke test manual

- [ ] **Step 1: Build + reload plugin**

```bash
npm run build
```

- [ ] **Step 2: Checklist manual:**

1. Criar group "RQ1" via painel sidebar.
2. Abrir Code Detail de um código qualquer.
3. Verificar seção "Groups" visível entre Description e Hierarchy.
4. Clicar `[+]` — FuzzySuggestModal abre com "RQ1" + "+ New group...".
5. Selecionar "RQ1" — chip aparece no Code Detail + chip contador `🏷1` aparece na tree.
6. Clicar `×` no chip — remove membership; chips somem.
7. Right-click num código na tree — menu tem item "Add to group..." entre "Merge with..." e "Change color".
8. Clicar "Add to group..." → modal abre → selecionar "RQ1" → membership criada.
9. Adicionar 2 códigos ao RQ1 (via qualquer fluxo). Adicionar outro código a "RQ2" novo.
10. Abrir MergeModal (right-click → "Merge with..." no código target) — na UI, selecionar os códigos-source via busca/checkbox, manter o atual como destination. Confirmar.
11. Verificar que target agora está em ambos RQ1 e RQ2 (union).

Se algo falha, fix commits antes de avançar pra Chunk 4.

- [ ] **Step 3: Opcional — atualizar `docs/smoke-tests/code-groups.md`** com steps de Chunk 3.

---

## Chunk 3 summary

Ao final:
- Seção Groups no Code Detail (chips removíveis + [+] FuzzySuggestModal)
- Right-click no código na tree → "Add to group..." submenu (reusa picker)
- Merge preserva union dos groups (audit trail analítico intacto)
- +11 testes (5 detail section + 3 add picker + 3 merge union)
- Baseline pós-Chunk 2: ~2142 → pós-Chunk 3: ~2153

**Próximo chunk:** Analytics filter integration.

## Chunk 4: Analytics filter integration

Esta chunk integra groups no filter de Analytics. Decisão arquitetural: **pre-computar `memberCodeIds` em `buildFilterConfig`** pra evitar passar `CodeDefinitionRegistry` em cada um dos 9 callers de `applyFilters`. O filter carrega `{ groupId, memberCodeIds }` e `applyFilters` constrói um Set pra lookup O(1).

### Task 4.1: FilterConfig.groupFilter + applyFilters implementation

**Files:**
- Modify: `src/analytics/data/dataTypes.ts:57-64` (FilterConfig)
- Modify: `src/analytics/data/statsHelpers.ts` (applyFilters)
- Test: `tests/core/codeGroupsFilter.test.ts` (estender a parte Analytics)

- [ ] **Step 1: Criar test da applyFilters com groupFilter**

Em `tests/core/codeGroupsFilter.test.ts`, adicionar bloco `describe`:

```ts
import { applyFilters } from '../../src/analytics/data/statsHelpers';
import type { ConsolidatedData, FilterConfig, UnifiedMarker } from '../../src/analytics/data/dataTypes';

describe('applyFilters — groupFilter', () => {
  function makeData(markers: UnifiedMarker[]): ConsolidatedData {
    return {
      markers,
      codes: [],
      sources: { markdown: true, csv: true, image: true, pdf: true, audio: true, video: true },
      lastUpdated: 0,
    };
  }

  function makeFilter(overrides: Partial<FilterConfig> = {}): FilterConfig {
    return {
      sources: ['markdown', 'csv-segment', 'csv-row', 'image', 'pdf', 'audio', 'video'],
      codes: [],
      excludeCodes: [],
      minFrequency: 0,
      ...overrides,
    };
  }

  function marker(id: string, codes: string[]): UnifiedMarker {
    return { id, source: 'markdown', fileId: 'f.md', codes };
  }

  it('quando groupFilter está ausente, não filtra markers', () => {
    const data = makeData([marker('m1', ['c1']), marker('m2', ['c2'])]);
    const result = applyFilters(data, makeFilter());
    expect(result.length).toBe(2);
  });

  it('quando groupFilter está presente, só passam markers com pelo menos 1 código membro', () => {
    const data = makeData([
      marker('m1', ['c1', 'c2']),  // c1 é membro
      marker('m2', ['c3']),          // não-membro
      marker('m3', ['c2']),          // c2 não é membro (setup abaixo)
    ]);
    const filter = makeFilter({
      groupFilter: { groupId: 'g1', memberCodeIds: ['c1'] },
    });
    const result = applyFilters(data, filter);
    expect(result.map(m => m.id)).toEqual(['m1']);
  });

  it('múltiplos membros no group — marker passa se pelo menos 1 matchea', () => {
    const data = makeData([marker('m1', ['c3']), marker('m2', ['c7'])]);
    const filter = makeFilter({
      groupFilter: { groupId: 'g1', memberCodeIds: ['c1', 'c3', 'c5'] },
    });
    const result = applyFilters(data, filter);
    expect(result.map(m => m.id)).toEqual(['m1']);
  });

  it('groupFilter com memberCodeIds vazio exclui tudo (group sem membros)', () => {
    const data = makeData([marker('m1', ['c1'])]);
    const filter = makeFilter({
      groupFilter: { groupId: 'g1', memberCodeIds: [] },
    });
    const result = applyFilters(data, filter);
    expect(result.length).toBe(0);
  });

  it('combina com outros filters (caseVariableFilter + groupFilter)', () => {
    // groupFilter restringe ao membro; outros filters continuam aplicando
    const data = makeData([marker('m1', ['c1']), marker('m2', ['c1'])]);
    const filter = makeFilter({
      excludeCodes: ['c1'],  // excluir tudo
      groupFilter: { groupId: 'g1', memberCodeIds: ['c1'] },
    });
    const result = applyFilters(data, filter);
    expect(result.length).toBe(0);  // excludeCodes pega antes
  });
});
```

- [ ] **Step 2: Rodar — falhas esperadas (FilterConfig sem groupFilter)**

- [ ] **Step 3: Estender `FilterConfig`**

Em `src/analytics/data/dataTypes.ts:57`:

```ts
export interface FilterConfig {
  sources: SourceType[];
  codes: string[];
  excludeCodes: string[];
  minFrequency: number;
  /** Filter markers to files whose case variable has this value. Requires registry passed to applyFilters. */
  caseVariableFilter?: { name: string; value: string };
  /** Filter markers to codes that are members of this group. memberCodeIds pre-computed in buildFilterConfig. */
  groupFilter?: { groupId: string; memberCodeIds: string[] };  // NEW
}
```

- [ ] **Step 4: Implementar groupFilter no `applyFilters`**

Em `src/analytics/data/statsHelpers.ts`:

```ts
import type { ConsolidatedData, FilterConfig, UnifiedMarker } from "./dataTypes";
import type { CaseVariablesRegistry } from "../../core/caseVariables/caseVariablesRegistry";

export function applyFilters(
  data: ConsolidatedData,
  filters: FilterConfig,
  registry?: CaseVariablesRegistry,
): UnifiedMarker[] {
  // Pre-compute Set pra lookup O(1) se groupFilter está ativo
  const groupMemberSet = filters.groupFilter
    ? new Set(filters.groupFilter.memberCodeIds)
    : null;

  return data.markers.filter((m) => {
    if (!filters.sources.includes(m.source)) return false;
    if (filters.codes.length > 0 && !m.codes.some((c) => filters.codes.includes(c))) return false;
    if (filters.excludeCodes.length > 0 && m.codes.every((c) => filters.excludeCodes.includes(c))) return false;
    if (filters.caseVariableFilter && registry) {
      const { name, value } = filters.caseVariableFilter;
      const vars = registry.getVariables(m.fileId);
      if (vars[name] !== value) return false;
    }
    if (groupMemberSet && !m.codes.some((c) => groupMemberSet.has(c))) return false;
    return true;
  });
}
```

- [ ] **Step 5: Rodar — 5 tests passam**

Expected: PASS. **Observação importante:** os 9 callers de `applyFilters` em `frequency.ts`, `cooccurrence.ts`, `sequential.ts`, `evolution.ts`, `inferential.ts`, `textAnalysis.ts` **NÃO precisam de ajuste** — signature preservada (3 args), `groupFilter` é opcional no `FilterConfig`.

- [ ] **Step 6: Commit**

```bash
git add src/analytics/data/dataTypes.ts src/analytics/data/statsHelpers.ts tests/core/codeGroupsFilter.test.ts
~/.claude/scripts/commit.sh "feat(analytics): FilterConfig.groupFilter + applyFilters com memberCodeIds pre-computed"
```

### Task 4.2: AnalyticsViewContext.groupFilter + buildFilterConfig

**Files:**
- Modify: `src/analytics/views/analyticsViewContext.ts` (interface)
- Modify: `src/analytics/views/analyticsView.ts` (field + buildFilterConfig)

- [ ] **Step 1: Estender `AnalyticsViewContext`**

Em `analyticsViewContext.ts:88` (próximo ao `caseVariableFilter`):

```ts
// Case variable filter state
caseVariableFilter: { name: string; value: string } | null;

// Group filter state (tier 1.5 — single-select)
groupFilter: string | null;  // NEW — groupId selecionado ou null
```

- [ ] **Step 2: Adicionar field + init em `AnalyticsView`**

Em `src/analytics/views/analyticsView.ts`, próximo ao `caseVariableFilter: { name: string; value: string } | null = null;`:

```ts
groupFilter: string | null = null;
```

- [ ] **Step 3: Atualizar `buildFilterConfig` pra incluir groupFilter com memberCodeIds**

Em `analyticsView.ts:313-` (buildFilterConfig):

```ts
buildFilterConfig(): FilterConfig {
  const allCodeIds = this.data?.codes.map((c) => c.id) ?? [];
  const excludeCodes = allCodeIds.filter((c) => !this.enabledCodes.has(c));

  // Pre-compute member code ids se há group filter
  const groupFilter = this.groupFilter
    ? {
        groupId: this.groupFilter,
        memberCodeIds: this.plugin.registry.getCodesInGroup(this.groupFilter).map(c => c.id),
      }
    : undefined;

  return {
    sources: Array.from(this.enabledSources),
    codes: [],
    excludeCodes,
    minFrequency: this.minFrequency,
    caseVariableFilter: this.caseVariableFilter ?? undefined,
    groupFilter,  // NEW
  };
}
```

**Nota:** `this.plugin.registry` é o `CodeDefinitionRegistry` exposto pelo `AnalyticsPluginAPI` (ver `src/analytics/index.ts:19-32` — prop se chama `registry`, NÃO `codeRegistry`).

- [ ] **Step 4: Verificar tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/analytics/views/analyticsViewContext.ts src/analytics/views/analyticsView.ts
~/.claude/scripts/commit.sh "feat(analytics): AnalyticsViewContext.groupFilter + buildFilterConfig"
```

### Task 4.3: renderGroupsFilter em configSections + wire em renderConfigPanel

**Nota de CSS:** classe do chip nesta task (`codemarker-analytics-group-chip`) é **intencionalmente separada** da do painel do codebook (`codebook-group-chip`) — containers têm contextos de padding/tamanho diferentes (sidebar densa vs config panel do analytics). Se houver regressão visual futuramente, consolidar numa classe base com modifier.

**Files:**
- Modify: `src/analytics/views/configSections.ts` (nova export `renderGroupsFilter`)
- Modify: `src/analytics/views/analyticsView.ts` (chamar a função no renderConfigPanel)
- Test: `tests/core/codeGroupsFilter.test.ts` (estender)

- [ ] **Step 1: Adicionar test de render**

Em `tests/core/codeGroupsFilter.test.ts`, novo `describe`:

```ts
import { renderGroupsFilter } from '../../src/analytics/views/configSections';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';

describe('renderGroupsFilter — UI', () => {
  let container: HTMLElement;
  let registry: CodeDefinitionRegistry;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    registry = new CodeDefinitionRegistry();
  });

  afterEach(() => { container.remove(); });

  it('não renderiza nada quando não há groups', () => {
    renderGroupsFilter(container, registry, { filter: null }, () => {});
    expect(container.querySelector('.codemarker-config-section')).toBeFalsy();
  });

  it('renderiza chips quando ≤10 groups', () => {
    for (let i = 0; i < 5; i++) registry.createGroup(`G${i}`);
    renderGroupsFilter(container, registry, { filter: null }, () => {});
    expect(container.querySelectorAll('.codemarker-analytics-group-chip').length).toBe(5);
  });

  it('renderiza dropdown quando >10 groups (fallback)', () => {
    for (let i = 0; i < 15; i++) registry.createGroup(`G${i}`);
    renderGroupsFilter(container, registry, { filter: null }, () => {});
    expect(container.querySelectorAll('.codemarker-analytics-group-chip').length).toBe(0);
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    expect(select!.options.length).toBe(16);  // "— none —" + 15 groups
  });

  it('click no chip emite onChange com groupId', () => {
    const g = registry.createGroup('RQ1');
    let received: string | null | undefined;
    renderGroupsFilter(container, registry, { filter: null }, (f) => { received = f; });
    (container.querySelector('.codemarker-analytics-group-chip') as HTMLElement).click();
    expect(received).toBe(g.id);
  });

  it('click no chip já selecionado emite null (toggle off)', () => {
    const g = registry.createGroup('RQ1');
    let received: string | null | undefined = 'initial';
    renderGroupsFilter(container, registry, { filter: g.id }, (f) => { received = f; });
    (container.querySelector('.codemarker-analytics-group-chip.is-selected') as HTMLElement).click();
    expect(received).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar — falha (renderGroupsFilter não existe)**

- [ ] **Step 3: Implementar `renderGroupsFilter` em `configSections.ts`**

Append em `src/analytics/views/configSections.ts`:

```ts
import type { CodeDefinitionRegistry } from "../../core/codeDefinitionRegistry";

const GROUPS_DROPDOWN_THRESHOLD = 10;

export function renderGroupsFilter(
  container: HTMLElement,
  registry: CodeDefinitionRegistry,
  state: { filter: string | null },
  onChange: (groupId: string | null) => void,
): void {
  const groups = registry.getAllGroups();
  if (groups.length === 0) return;

  const section = container.createDiv({ cls: "codemarker-config-section" });
  section.createDiv({ cls: "codemarker-config-section-title", text: "Filter by group" });

  if (groups.length > GROUPS_DROPDOWN_THRESHOLD) {
    // Fallback: dropdown
    const select = section.createEl("select", { cls: "codemarker-config-select" });
    select.appendChild(new Option("— none —", ""));
    for (const g of groups) {
      select.appendChild(new Option(g.name, g.id));
    }
    if (state.filter) select.value = state.filter;
    select.addEventListener("change", () => {
      onChange(select.value || null);
    });
  } else {
    // Chips
    const chipsWrap = section.createDiv({ cls: "codemarker-analytics-group-chips" });
    for (const g of groups) {
      const chip = chipsWrap.createEl("button", { cls: "codemarker-analytics-group-chip" });
      const dot = chip.createSpan({ cls: "codemarker-analytics-group-chip-dot" });
      dot.style.backgroundColor = g.color;
      chip.createSpan({ text: g.name });
      if (state.filter === g.id) chip.addClass("is-selected");
      chip.addEventListener("click", () => {
        onChange(state.filter === g.id ? null : g.id);
      });
    }
  }
}
```

- [ ] **Step 4: CSS**

Append em `styles.css`:

```css
.codemarker-analytics-group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.codemarker-analytics-group-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  font-size: var(--font-smallest);
  cursor: pointer;
}
.codemarker-analytics-group-chip:hover {
  background: var(--background-modifier-hover);
}
.codemarker-analytics-group-chip.is-selected {
  border-color: var(--interactive-accent);
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}
.codemarker-analytics-group-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
```

- [ ] **Step 5: Wire no `renderConfigPanel` de `analyticsView.ts:303`**

Antes ou depois de `renderCaseVariablesFilter`:

```ts
renderCaseVariablesFilter(
  this.configPanelEl,
  this.plugin.caseVariablesRegistry,
  { filter: this.caseVariableFilter },
  (f) => { this.caseVariableFilter = f; this.scheduleUpdate(); },
);
// NEW — Groups filter
renderGroupsFilter(
  this.configPanelEl,
  this.plugin.registry,
  { filter: this.groupFilter },
  (f) => { this.groupFilter = f; this.scheduleUpdate(); },
);
```

Atualizar import no topo:

```ts
import { renderSourcesSection, renderViewModeSection, renderCodesSection, renderMinFreqSection, renderCaseVariablesFilter, renderGroupsFilter } from "./configSections";
```

- [ ] **Step 6: Rodar tests — 5 novos passam**

```bash
npm run test -- tests/core/codeGroupsFilter.test.ts --run
```

Expected: todos passam (5 applyFilters + 5 renderGroupsFilter = 10 nesse file).

- [ ] **Step 7: Commit**

```bash
git add src/analytics/views/configSections.ts src/analytics/views/analyticsView.ts styles.css tests/core/codeGroupsFilter.test.ts
~/.claude/scripts/commit.sh "feat(analytics): renderGroupsFilter (chips + fallback dropdown >10) + wire no config panel"
```

### Task 4.4: Smoke test manual

- [ ] **Step 1: Build + reload**

```bash
npm run build
```

- [ ] **Step 2: Checklist:**

1. Abrir Analytics view; executar Frequency mode com dados existentes.
2. No config panel, verificar seção "Filter by group" (abaixo de "Filter by case variable"). Se não tem groups, section fica ausente — OK.
3. Criar 2 groups; adicionar alguns códigos.
4. Fechar e reabrir a Analytics view (ou trigger explícito de re-render do config panel) — chips aparecem. (`renderConfigPanel` é chamado ao trocar de mode ou abrir view — ele não observa mutations do registry.)
5. Clicar chip "RQ1" — gráfico recalcula com subset.
6. Verificar visualmente que outros modes (cooccurrence, doc-matrix) também respondem ao filter.
7. Criar 11+ groups — chips viram dropdown.
8. Selecionar "— none —" no dropdown — filter limpa.

---

## Chunk 4 summary

Ao final:
- `FilterConfig.groupFilter` pre-computa `memberCodeIds` pra evitar passar registry em 9 callers
- `renderGroupsFilter` com chips single-select + fallback dropdown em >10 groups
- Integração com `applyFilters` sem breaking changes em callers existentes
- +10 testes (5 applyFilters + 5 renderGroupsFilter)
- Baseline pós-Chunk 3: ~2153 → pós-Chunk 4: ~2163

**Próximo chunk:** Export/Import (QDPX Sets + Tabular CSV `groups`).

## Chunk 5: Export/Import (QDPX + Tabular CSV)

TODO: will write after Chunk 4 approved.

## Chunk 4: Analytics filter integration

TODO.

## Chunk 5: Export/Import (QDPX + Tabular CSV)

TODO.

## Chunk 3: Add-to-group flow (right-click + Code Detail + Merge)

TODO.

## Chunk 4: Analytics filter integration

TODO.

## Chunk 5: Export/Import (QDPX + Tabular CSV)

TODO.
