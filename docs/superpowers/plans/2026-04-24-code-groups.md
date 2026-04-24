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

TODO: will write next after Chunk 1 approved.

## Chunk 3: Add-to-group flow (right-click + Code Detail + Merge)

TODO.

## Chunk 4: Analytics filter integration

TODO.

## Chunk 5: Export/Import (QDPX + Tabular CSV)

TODO.
