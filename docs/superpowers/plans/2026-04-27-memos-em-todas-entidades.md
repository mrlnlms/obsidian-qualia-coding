# Memos em todas as entidades — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar campo `memo?: string` em `CodeDefinition`, `GroupDefinition` e `CodeRelation`, com UI mínima de edição (Code Detail / Group selected card / Relation popover edit), e suporte de export/import (QDPX `<MemoText>` + CSV tabular `memo` column).

**Architecture:** Schema aditivo (campos opcionais), helpers no registry seguindo patterns existentes (`update()` extension pra Code, `setGroupMemo` dedicado pra Group, `setRelationMemo(codeId, label, target, memo)` por tupla pra Relation), UI replicando pattern de `marker.memo` (plain textarea), parser QDPX additive (`<MemoText>` é nova branch — pipeline de marker memo via `<NoteRef>` segue intocado).

**Tech Stack:** TypeScript strict, Vitest + jsdom (unit), Obsidian Plugin API.

**Spec de referência:** `docs/superpowers/specs/2026-04-27-memos-em-todas-entidades-design.md` — leitura obrigatória antes de começar.

---

## Pré-requisitos de ambiente

> **Esta sessão é executada do zero.** Leia primeiro:
> 1. `CLAUDE.md` (raiz do repo) — convenções do projeto, NUNCA git worktree, vault de teste, sem hedge defensivo
> 2. `~/.claude/CLAUDE.md` — global rules (commits via script, NUNCA deletar arquivos)
> 3. Spec linkada acima — escopo + decisões já travadas

Working dir: `/Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding`

| Comando | Uso |
|---------|-----|
| `npx vitest run tests/<arquivo>.test.ts` | Roda 1 arquivo |
| `npx vitest run tests/<arquivo>.test.ts -t "<nome>"` | 1 teste específico |
| `npm run build` | Build production (tsc + esbuild) |
| `npm run dev` | Watch mode |
| `~/.claude/scripts/commit.sh "msg"` | Commit (forces author Marlon Lemes, blocks Co-Authored-By). Sempre `git add` antes |
| `cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/` | Sync demo (não obrigatório no smoke desta feature) |

**Smoke test vault:** `/Users/mosx/Desktop/obsidian-plugins-workbench/` (raiz do repo é o próprio vault). Plugin em `.obsidian/plugins/qualia-coding/`. Recarrega via Settings → Community plugins → Qualia Coding → toggle off/on.

**NÃO criar git worktree** — CLAUDE.md override.

**Não rodar suite inteira `npm run test`** — 2264 testes em 131 suites é caro. Use filtros.

**Branch novo:**
```bash
git checkout main && git pull --ff-only
git checkout -b feat/memos-todas-entidades
```

---

## File Structure

### Arquivos editados

| Arquivo | Mudança |
|---------|---------|
| `src/core/types.ts` | Adiciona `memo?: string` em `CodeDefinition`, `GroupDefinition`, `CodeRelation` |
| `src/core/codeDefinitionRegistry.ts` | (a) Estende `update()` Pick com `'memo'` + branch interno (~linhas 211, 230); (b) Adiciona `setGroupMemo(id, memo)` (~linhas 430-435 região); (c) Adiciona `setRelationMemo(codeId, label, target, memo)` |
| `src/core/detailCodeRenderer.ts` | (a) Nova `renderMemoSection` análoga ao description; (b) ✎ button na renderRelationsSection local (~linha 715) abrindo popover de edit |
| `src/core/baseCodeDetailView.ts` | Novo método `editGroupMemo(groupId)` (análogo a `editGroupDescription` em `:477-492`); item "Edit memo" / "Clear memo" no group context menu |
| `src/core/codeGroupsPanel.ts` | Adiciona surface "memo" na panel area (similar ao description em `:78-92`) + callback `onEditMemo` |
| `src/core/detailListRenderer.ts` | Cabeamento `onEditMemo: callbacks.onEditGroupMemo` (análogo ao `:91`) |
| `src/export/qdcExporter.ts` | (a) Emit `<MemoText>` em `<Code>` quando memo (~linhas 71-97); (b) Emit `<MemoText>` em `<Set>` quando memo (~linhas 35-68); (c) Atualiza branch self-closing `if (!descEl && !memoEl && children.length === 0)` |
| `src/export/qdpxExporter.ts` | Re-arquitetar `<Link>` emission em `:383, 398` — single template literal → conditional inner block com `<MemoText>` |
| `src/import/qdcImporter.ts` | (a) `mergeMemos(existing, imported)` análoga a `mergeDescriptions` (`:128-133`); (b) Parse `<MemoText>` em `<Code>` e `<Set>` |
| `src/import/qdpxImporter.ts` | Parse `<MemoText>` em `<Link>` (code-level relations); merge se conflito |
| `src/export/tabular/buildCodesTable.ts` | Header ganha `'memo'` no fim (`:5`); rows append `def.memo ?? ''` |
| `src/export/tabular/buildGroupsTable.ts` | Header ganha `'memo'` (`:4`); rows append `g.memo ?? ''` |
| `src/export/tabular/buildRelationsTable.ts` | Header ganha `'memo'` no fim (`:6-8`); rows code-level append `rel.memo ?? ''`; rows app-level append `rel.memo ?? ''` (vazio até UI) |

### Tests editados / criados

| Arquivo | Ação |
|---------|------|
| `tests/core/codeDefinitionRegistry.test.ts` | Ampliar — Code memo via update, Group memo via setGroupMemo, Relation memo por tupla |
| `tests/export/qdcExporter.test.ts` | Ampliar — MemoText emit em Code, Set, Link; element form switch |
| `tests/import/qdcImporter.test.ts` | Ampliar — parse MemoText em Code, Set; merge com existing |
| `tests/import/qdpxImporter.test.ts` | Bloco novo — round-trip CodeApplication.relations memo schema-ready |
| `tests/export/tabular/buildCodesTable.test.ts` | Coluna memo populada |
| `tests/export/tabular/buildGroupsTable.test.ts` | Idem |
| `tests/export/tabular/buildRelationsTable.test.ts` | Coluna memo populada (code-level + app-level vazio) |

---

## Chunk 1: Schema + registry helpers

> **Objetivo:** Schema aditivo + 3 caminhos de mutação (`update()` extended pra Code, `setGroupMemo`, `setRelationMemo`). Testado em isolamento. Sem UI ainda.
>
> **Critério de sucesso:** todos os testes do chunk passam, suite de `tests/core/codeDefinitionRegistry.test.ts` continua verde.

### Task 1.1: Adicionar campos `memo` no schema

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1.1.1: Adicionar `memo?: string` em CodeRelation**

Localizar `interface CodeRelation` (~linha 27) e adicionar:

```ts
export interface CodeRelation {
  label: string;
  target: string;
  directed: boolean;
  memo?: string;  // NEW — reflexão analítica sobre essa relação
}
```

- [ ] **Step 1.1.2: Adicionar `memo?: string` em CodeDefinition**

Localizar `interface CodeDefinition` (~linha 83). Adicionar logo abaixo de `description?: string`:

```ts
export interface CodeDefinition {
  // ...campos existentes incluindo description?
  memo?: string;  // NEW — reflexão analítica processual
  // ...resto
}
```

- [ ] **Step 1.1.3: Adicionar `memo?: string` em GroupDefinition**

Localizar `interface GroupDefinition` (~linha 116). Adicionar logo abaixo de `description?: string`:

```ts
export interface GroupDefinition {
  // ...campos existentes incluindo description?
  memo?: string;  // NEW — reflexão analítica processual
  // ...resto (paletteIndex, parentId, createdAt)
}
```

- [ ] **Step 1.1.4: Type check**

Run:
```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 1.1.5: Commit**

```bash
git add src/core/types.ts
~/.claude/scripts/commit.sh "feat(types): adiciona campo memo em CodeDefinition, GroupDefinition, CodeRelation"
```

---

### Task 1.2: Estender `update()` pra incluir `memo` (Code memo)

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Test: `tests/core/codeDefinitionRegistry.test.ts`

- [ ] **Step 1.2.1: Estender `update()` Pick + adicionar branch interno**

Localizar o método `update()` em `~linha 211`. Atualizar a assinatura adicionando `'memo'`:

```typescript
// Antes:
update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description' | 'magnitude' | 'relations'>>): boolean {

// Depois:
update(id: string, changes: Partial<Pick<CodeDefinition, 'name' | 'color' | 'description' | 'memo' | 'magnitude' | 'relations'>>): boolean {
```

E adicionar o branch interno logo após o branch `description` (~linhas 227-229):

```typescript
if (changes.description !== undefined) {
  def.description = changes.description || undefined;
}
// NEW — segue o mesmo pattern do description:
if (changes.memo !== undefined) {
  def.memo = changes.memo || undefined;
}
```

- [ ] **Step 1.2.2: Type check**

Run:
```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 1.2.3: Adicionar testes**

Localizar `tests/core/codeDefinitionRegistry.test.ts` e adicionar bloco `describe('Code memo', ...)`:

```typescript
describe('Code memo via update()', () => {
  it('sets memo via update()', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create({ name: 'frustacao', color: '#FF0000' });
    reg.update(def.id, { memo: 'reflexão sobre código' });
    expect(reg.getById(def.id)!.memo).toBe('reflexão sobre código');
  });

  it('clears memo when given empty string', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create({ name: 'frustacao', color: '#FF0000' });
    reg.update(def.id, { memo: 'algo' });
    reg.update(def.id, { memo: '' });
    expect(reg.getById(def.id)!.memo).toBeUndefined();
  });

  it('preserves memo when update has no memo key', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create({ name: 'frustacao', color: '#FF0000' });
    reg.update(def.id, { memo: 'algo' });
    reg.update(def.id, { color: '#00FF00' });
    expect(reg.getById(def.id)!.memo).toBe('algo');
  });

  it('emits onMutate when memo updated', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create({ name: 'frustacao', color: '#FF0000' });
    let count = 0;
    reg.addOnMutate(() => count++);
    reg.update(def.id, { memo: 'new memo' });
    expect(count).toBe(1);
  });
});
```

> **Verifique imports/setup do arquivo de teste.** Os testes já existentes neste arquivo dão template — copiar shape do `describe('update', ...)` se houver. Se nome de classe for diferente (`CodeDefinitionRegistry` vs alias), seguir o usado.

- [ ] **Step 1.2.4: Run testes**

Run:
```bash
npx vitest run tests/core/codeDefinitionRegistry.test.ts -t "Code memo"
```

Expected: 4 testes passam.

- [ ] **Step 1.2.5: Commit**

```bash
git add src/core/codeDefinitionRegistry.ts tests/core/codeDefinitionRegistry.test.ts
~/.claude/scripts/commit.sh "feat(registry): estende update() com memo em CodeDefinition"
```

---

### Task 1.3: Adicionar `setGroupMemo`

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Test: `tests/core/codeDefinitionRegistry.test.ts`

- [ ] **Step 1.3.1: Adicionar método logo após `setGroupDescription` (~linha 435)**

```typescript
setGroupMemo(id: string, memo: string | undefined): void {
  const g = this.groups.get(id);
  if (!g) return;
  g.memo = memo && memo.length > 0 ? memo : undefined;
  for (const fn of this.onMutateListeners) fn();
}
```

- [ ] **Step 1.3.2: Adicionar testes**

```typescript
describe('Group memo via setGroupMemo', () => {
  it('sets memo on existing group', () => {
    const reg = new CodeDefinitionRegistry();
    const g = reg.createGroup('Theme');
    reg.setGroupMemo(g.id, 'reflexão analítica do grupo');
    expect(reg.getGroup(g.id)!.memo).toBe('reflexão analítica do grupo');
  });

  it('clears memo when given empty string', () => {
    const reg = new CodeDefinitionRegistry();
    const g = reg.createGroup('Theme');
    reg.setGroupMemo(g.id, 'algo');
    reg.setGroupMemo(g.id, '');
    expect(reg.getGroup(g.id)!.memo).toBeUndefined();
  });

  it('clears memo when given undefined', () => {
    const reg = new CodeDefinitionRegistry();
    const g = reg.createGroup('Theme');
    reg.setGroupMemo(g.id, 'algo');
    reg.setGroupMemo(g.id, undefined);
    expect(reg.getGroup(g.id)!.memo).toBeUndefined();
  });

  it('no-op for non-existent group', () => {
    const reg = new CodeDefinitionRegistry();
    expect(() => reg.setGroupMemo('inexistent', 'x')).not.toThrow();
  });

  it('emits onMutate', () => {
    const reg = new CodeDefinitionRegistry();
    const g = reg.createGroup('Theme');
    let count = 0;
    reg.addOnMutate(() => count++);
    reg.setGroupMemo(g.id, 'new');
    expect(count).toBe(1);
  });
});
```

> Verifique a API pra criar group — `createGroup(name)` ou `createGroup({ name, color })`. Olhar testes existentes do mesmo arquivo pra confirmar.

- [ ] **Step 1.3.3: Run testes**

```bash
npx vitest run tests/core/codeDefinitionRegistry.test.ts -t "Group memo"
```

Expected: 5 passam.

- [ ] **Step 1.3.4: Commit**

```bash
git add src/core/codeDefinitionRegistry.ts tests/core/codeDefinitionRegistry.test.ts
~/.claude/scripts/commit.sh "feat(registry): setGroupMemo seguindo pattern setGroupDescription"
```

---

### Task 1.4: Adicionar `setRelationMemo`

**Files:**
- Modify: `src/core/codeDefinitionRegistry.ts`
- Test: `tests/core/codeDefinitionRegistry.test.ts`

- [ ] **Step 1.4.1: Adicionar método (lugar próximo aos outros relation/group setters)**

```typescript
/**
 * Atualiza memo de uma relation code-level identificada por (label, target).
 * Mesmo pattern do delete em baseCodingMenu.ts:585.
 *
 * Limite: se houver relations duplicadas com mesmo (label, target), atualiza
 * só a primeira. Mesmo limite do delete existente.
 *
 * @returns true se atualizou, false se nenhum match (codeId inexistente,
 *          ou nenhum relation com (label, target) match).
 */
setRelationMemo(codeId: string, label: string, target: string, memo: string | undefined): boolean {
  const def = this.definitions.get(codeId);
  if (!def?.relations) return false;
  const rel = def.relations.find(r => r.label === label && r.target === target);
  if (!rel) return false;
  rel.memo = memo && memo.length > 0 ? memo : undefined;
  def.updatedAt = Date.now();
  for (const fn of this.onMutateListeners) fn();
  return true;
}
```

- [ ] **Step 1.4.2: Adicionar testes**

```typescript
describe('Relation memo via setRelationMemo', () => {
  it('sets memo on existing relation by tuple', () => {
    const reg = new CodeDefinitionRegistry();
    const a = reg.create({ name: 'a', color: '#FF0000' });
    const b = reg.create({ name: 'b', color: '#00FF00' });
    reg.update(a.id, { relations: [{ label: 'causa', target: b.id, directed: true }] });

    const ok = reg.setRelationMemo(a.id, 'causa', b.id, 'A causa B porque...');
    expect(ok).toBe(true);
    expect(reg.getById(a.id)!.relations![0].memo).toBe('A causa B porque...');
  });

  it('returns false when codeId does not exist', () => {
    const reg = new CodeDefinitionRegistry();
    expect(reg.setRelationMemo('missing', 'l', 't', 'x')).toBe(false);
  });

  it('returns false when (label, target) does not match', () => {
    const reg = new CodeDefinitionRegistry();
    const a = reg.create({ name: 'a', color: '#FF0000' });
    const b = reg.create({ name: 'b', color: '#00FF00' });
    reg.update(a.id, { relations: [{ label: 'causa', target: b.id, directed: true }] });
    expect(reg.setRelationMemo(a.id, 'efeito', b.id, 'x')).toBe(false);
  });

  it('clears memo when given empty string', () => {
    const reg = new CodeDefinitionRegistry();
    const a = reg.create({ name: 'a', color: '#FF0000' });
    const b = reg.create({ name: 'b', color: '#00FF00' });
    reg.update(a.id, { relations: [{ label: 'causa', target: b.id, directed: true, memo: 'old' }] });
    reg.setRelationMemo(a.id, 'causa', b.id, '');
    expect(reg.getById(a.id)!.relations![0].memo).toBeUndefined();
  });

  it('updates only first match when duplicates exist', () => {
    const reg = new CodeDefinitionRegistry();
    const a = reg.create({ name: 'a', color: '#FF0000' });
    const b = reg.create({ name: 'b', color: '#00FF00' });
    reg.update(a.id, { relations: [
      { label: 'causa', target: b.id, directed: true },
      { label: 'causa', target: b.id, directed: false },
    ] });
    reg.setRelationMemo(a.id, 'causa', b.id, 'first match');
    const rels = reg.getById(a.id)!.relations!;
    expect(rels[0].memo).toBe('first match');
    expect(rels[1].memo).toBeUndefined();
  });

  it('emits onMutate on success', () => {
    const reg = new CodeDefinitionRegistry();
    const a = reg.create({ name: 'a', color: '#FF0000' });
    const b = reg.create({ name: 'b', color: '#00FF00' });
    reg.update(a.id, { relations: [{ label: 'causa', target: b.id, directed: true }] });
    let count = 0;
    reg.addOnMutate(() => count++);
    reg.setRelationMemo(a.id, 'causa', b.id, 'x');
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 1.4.3: Run testes**

```bash
npx vitest run tests/core/codeDefinitionRegistry.test.ts -t "Relation memo"
```

Expected: 6 passam.

- [ ] **Step 1.4.4: Run suite inteira do registry pra confirmar regression**

```bash
npx vitest run tests/core/codeDefinitionRegistry.test.ts
```

Expected: tudo verde (incluindo 4+5+6 testes novos = 15 novos + os existentes).

- [ ] **Step 1.4.5: Commit**

```bash
git add src/core/codeDefinitionRegistry.ts tests/core/codeDefinitionRegistry.test.ts
~/.claude/scripts/commit.sh "feat(registry): setRelationMemo identifica relation por tupla (label, target)"
```

---

## Chunk 2: Code memo UI

> **Objetivo:** Editar memo de Code via Code Detail. Plain textarea idêntica ao marker memo.
>
> **Critério:** seção memo aparece, salva no blur via `update(id, { memo })`, persiste no `data.json`. Smoke vault valida.

### Task 2.1: Adicionar `renderMemoSection` em `detailCodeRenderer.ts`

**Files:**
- Modify: `src/core/detailCodeRenderer.ts`

- [ ] **Step 2.1.1: Localizar onde renderizar — depois de description**

Procurar no arquivo onde `description` do code é renderizado (provavelmente um helper como `renderDescriptionSection` ou inline). Identificar o ponto após esse trecho onde adicionar a seção memo.

- [ ] **Step 2.1.2: Implementar `renderMemoSection`**

Adicionar função análoga ao `renderMemoSection` de `detailMarkerRenderer.ts:91-113` (replicar exatamente o pattern; o renderer de marker é a referência). Pseudocódigo:

```typescript
function renderCodeMemoSection(
  container: HTMLElement,
  def: CodeDefinition,
  model: SidebarModelInterface,
) {
  const memoSection = container.createDiv({ cls: 'codemarker-detail-section' });
  memoSection.createEl('h6', { text: 'Memo' });
  const memoTextarea = memoSection.createEl('textarea', {
    cls: 'codemarker-detail-memo',
    attr: { placeholder: 'Reflexão analítica…', rows: '3' },
  });
  memoTextarea.value = def.memo ?? '';
  memoTextarea.addEventListener('input', () => {
    model.registry.update(def.id, { memo: memoTextarea.value });
    model.saveMarkers();
  });
}
```

> **Atenção:** marker memo usa `model.updateMarkerFields(...)` + suspendRefresh/resumeRefresh callbacks. Code memo não tem callbacks de refresh — chama `update()` direto. Se houver issue de re-render durante typing (component perde foco), envolver em flag local de "editing" como o marker faz, mas só se aparecer durante smoke.

- [ ] **Step 2.1.3: Wire up — chamar `renderCodeMemoSection` no fluxo principal**

Procurar onde o detail do code é construído (função tipo `renderCodeDetail` ou similar) e chamar `renderCodeMemoSection(container, def, model)` depois de description.

- [ ] **Step 2.1.4: Build**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 2.1.5: Smoke manual no vault**

Recarregar plugin. Abrir Code Explorer → click num código → Code Detail abre. Verificar:
- Seção "Memo" aparece após description
- Textarea vazia inicialmente (placeholder visível)
- Digitar → re-abrir code → memo persistiu ✓
- Limpar memo → re-abrir → field vazio (memo virou undefined no data.json)

Se algo falhar, revisitar pattern do `renderMemoSection` de marker antes de prosseguir.

- [ ] **Step 2.1.6: Commit**

```bash
git add src/core/detailCodeRenderer.ts
~/.claude/scripts/commit.sh "feat(ui): code memo section em Code Detail"
```

---

## Chunk 3: Group memo UI

> **Objetivo:** Editar memo de Group via menu de context da group ou via campo na panel selected. Pattern do `editGroupDescription` em `baseCodeDetailView.ts:477-492`.
>
> **Critério:** memo de group editável; smoke vault valida.

### Task 3.1: Wire up `onEditMemo` callback

**Files:**
- Modify: `src/core/codeGroupsPanel.ts`
- Modify: `src/core/detailListRenderer.ts`
- Modify: `src/core/baseCodeDetailView.ts`

- [ ] **Step 3.1.1: Adicionar `onEditMemo(groupId)` na interface de callbacks em `codeGroupsPanel.ts:16`**

```typescript
export interface CodeGroupsPanelCallbacks {
  // ...callbacks existentes
  onEditDescription(groupId: string): void;
  onEditMemo(groupId: string): void;  // NEW
  // ...
}
```

- [ ] **Step 3.1.2: Adicionar surface "memo" no panel quando group selected**

Localizar (em `codeGroupsPanel.ts:78-92`) onde description é renderizada como clicável quando há group selected. Replicar o mesmo pattern abaixo:

```typescript
// Existente (description, ~linhas 84-92):
const desc = panel.createDiv({ cls: 'codebook-groups-description' });
if (selected.description) {
  desc.createSpan({ text: selected.description });
} else {
  desc.addClass('is-empty');
  desc.createSpan({ text: 'Add description...' });
}
desc.addEventListener('click', () => callbacks.onEditDescription(selected.id));

// NEW — adicionar logo abaixo (memo):
const memo = panel.createDiv({ cls: 'codebook-groups-memo' });
if (selected.memo) {
  memo.createSpan({ text: selected.memo });
} else {
  memo.addClass('is-empty');
  memo.createSpan({ text: 'Add memo...' });
}
memo.addEventListener('click', () => callbacks.onEditMemo(selected.id));
```

> Estilo CSS de `.codebook-groups-memo` pode reusar o de `.codebook-groups-description` se idêntico — ou adicionar regra equivalente em `styles.css` se necessário.

- [ ] **Step 3.1.3: Cabear callback em `detailListRenderer.ts:91`**

```typescript
// Antes:
onEditDescription: callbacks.onEditGroupDescription,

// Depois (adicionar):
onEditDescription: callbacks.onEditGroupDescription,
onEditMemo: callbacks.onEditGroupMemo,  // NEW
```

E adicionar `onEditGroupMemo` na interface dos callbacks de `detailListRenderer.ts` (procurar onde `onEditGroupDescription` é declarado).

- [ ] **Step 3.1.4: Implementar `editGroupMemo` em `baseCodeDetailView.ts`**

Logo abaixo de `editGroupDescription` (~linhas 477-492) adicionar:

```typescript
private editGroupMemo(groupId: string): void {
  const g = this.model.registry.getGroup(groupId);
  if (!g) return;
  new PromptModal({
    app: this.app,
    title: 'Edit memo',
    initialValue: g.memo ?? '',
    placeholder: 'Reflexão analítica (opcional)',
    onSubmit: (memo) => {
      const trimmed = memo.trim();
      this.model.registry.setGroupMemo(groupId, trimmed || undefined);
      this.model.saveMarkers();
      this.refreshCurrentMode();
    },
  }).open();
}
```

E expor pro callback (procurar onde `onEditGroupDescription` é wired no `getCallbacks()` ou similar e adicionar `onEditGroupMemo: (id) => this.editGroupMemo(id)`).

- [ ] **Step 3.1.5: (Opcional) Adicionar item de menu context "Edit memo" / "Clear memo"**

Em `baseCodeDetailView.ts:432-447` (group context menu) adicionar logo após Edit/Clear description:

```typescript
menu.addItem((item) => item
  .setTitle('Edit memo')
  .setIcon('book-open')
  .onClick(() => this.editGroupMemo(groupId)),
);

if (g.memo) {
  menu.addItem((item) => item
    .setTitle('Clear memo')
    .setIcon('x')
    .onClick(() => {
      this.model.registry.setGroupMemo(groupId, undefined);
      this.model.saveMarkers();
      this.refreshCurrentMode();
    }),
  );
}
```

- [ ] **Step 3.1.6: Type check**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 3.1.7: Build + smoke**

```bash
npm run build
```

No vault: Code Explorer → group selected → conferir surface memo aparece ("Add memo..." ou texto). Click → PromptModal abre → editar → save → re-abrir → memo persistiu. Right-click no group chip → "Edit memo" menu item visível.

- [ ] **Step 3.1.8: Commit**

```bash
git add src/core/codeGroupsPanel.ts src/core/detailListRenderer.ts src/core/baseCodeDetailView.ts styles.css
~/.claude/scripts/commit.sh "feat(ui): group memo via panel surface + context menu"
```

---

## Chunk 4: Relation memo UI

> **Objetivo:** ✎ button em cada existing relation row do Code Detail (somente). Click abre popover. Salva via setRelationMemo. **NÃO tocar em** `baseCodingMenu.ts:498+`, `detailMarkerRenderer.ts:180-215`, `relationUI.ts:renderAddRelationRow`.
>
> **Critério:** ✎ aparece só no Code Detail; popover edita; persiste; smoke valida ausência em coding popover.

### Task 4.1: Adicionar ✎ button em `detailCodeRenderer.ts:715`

**Files:**
- Modify: `src/core/detailCodeRenderer.ts`

- [ ] **Step 4.1.1: Localizar a renderização da relation row (~linha 695-723)**

Cada existing relation row hoje termina com:

```typescript
const removeBtn = row.createSpan({ cls: 'codemarker-detail-magnitude-remove' });
setIcon(removeBtn, 'x');
removeBtn.addEventListener('click', (e) => { ... });
```

- [ ] **Step 4.1.2: Adicionar ✎ button antes do removeBtn**

```typescript
// NEW — Edit memo button:
const editMemoBtn = row.createSpan({ cls: 'codemarker-detail-relation-edit-memo' });
setIcon(editMemoBtn, 'pencil');
editMemoBtn.title = rel.memo ? 'Edit memo' : 'Add memo';
if (rel.memo) editMemoBtn.addClass('has-memo');
editMemoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  // Snapshot label + target ANTES de qualquer mutation (immune a delete async)
  const label = rel.label;
  const target = rel.target;
  new PromptModal({
    app,
    title: 'Edit relation memo',
    initialValue: rel.memo ?? '',
    placeholder: 'Reflexão sobre essa relação',
    onSubmit: (newMemo) => {
      const trimmed = newMemo.trim();
      model.registry.setRelationMemo(def.id, label, target, trimmed || undefined);
      model.saveMarkers();
      renderRows();
    },
  }).open();
});
```

> **Imports necessários:** `PromptModal` de `'./dialogs'` (verificar path real).

> **`app` no closure:** verificar se `app` já está disponível no scope da função onde a relation row é renderizada. Se não, passar como parâmetro adicional ou pegar via `model` se ele expuser `app`.

- [ ] **Step 4.1.3: CSS opcional pra `has-memo` (visual de feedback)**

Em `styles.css`:

```css
.codemarker-detail-relation-edit-memo {
  cursor: pointer;
  opacity: 0.6;
  margin-left: 4px;
}
.codemarker-detail-relation-edit-memo:hover { opacity: 1; }
.codemarker-detail-relation-edit-memo.has-memo {
  opacity: 1;
  color: var(--text-accent);
}
```

- [ ] **Step 4.1.4: Build**

```bash
npm run build
```

- [ ] **Step 4.1.5: Smoke manual**

No vault:
1. Code Explorer → click num código → Code Detail
2. Adicionar relation (label="causa", target=outro código)
3. Confirmar que ✎ aparece ao lado do × na row
4. Click ✎ → PromptModal abre com placeholder
5. Digitar memo → submit → row continua aparecendo
6. Click ✎ de novo → memo aparece no `initialValue`
7. ✎ ganha cor accent (visual feedback) quando há memo
8. Confirmar **ausência** de ✎ em:
   - Popover de coding aplicação (clicar num marker → coding popover → relations section: só `[label] [target] [×]`, sem ✎)
   - Marker Detail (sidebar marker view → relations: idem)

Se ✎ aparecer em algum dos surfaces application-level, **revisar — não pode**.

- [ ] **Step 4.1.6: Commit**

```bash
git add src/core/detailCodeRenderer.ts styles.css
~/.claude/scripts/commit.sh "feat(ui): edit memo de relation code-level via popover no Code Detail"
```

---

## Chunk 5: Export/Import QDPX + CSV tabular

> **Objetivo:** Round-trip QDPX preserva memo de Code, Set, Link. CSV tabular ganha coluna `memo` em codes, groups, relations.
>
> **Critério:** testes round-trip passam, fixture com memo é preservado, element-form switch correto, app-level memo schema-ready (round-trip preserva sem UI escrever).

### Task 5.1: Helper `mergeMemos` em `qdcImporter.ts`

**Files:**
- Modify: `src/import/qdcImporter.ts`

- [ ] **Step 5.1.1: Adicionar função análoga a `mergeDescriptions` (~linhas 128-133)**

```typescript
function mergeMemos(existing: string | undefined, imported: string | undefined): string | undefined {
  if (!existing && !imported) return undefined;
  if (!existing) return imported;
  if (!imported) return existing;
  return `${existing}\n\n--- Imported memo ---\n${imported}`;
}
```

- [ ] **Step 5.1.2: Commit (helper isolado)**

```bash
git add src/import/qdcImporter.ts
~/.claude/scripts/commit.sh "feat(import): mergeMemos helper analogo a mergeDescriptions"
```

---

### Task 5.2: Emit `<MemoText>` em `<Code>` e `<Set>`

**Files:**
- Modify: `src/export/qdcExporter.ts`
- Test: `tests/export/qdcExporter.test.ts`

- [ ] **Step 5.2.1: Atualizar `buildCodeElement` (~linhas 71-97)**

Localizar a função. Após criar `descEl` (se já existir), adicionar `memoEl`:

```typescript
const memoEl = code.memo ? `<MemoText>${escapeXml(code.memo)}</MemoText>` : '';
```

E na branch self-closing:

```typescript
// Antes:
if (!descEl && children.length === 0) {
  return `<Code ${attrs}/>`;
}

// Depois:
if (!descEl && !memoEl && children.length === 0) {
  return `<Code ${attrs}/>`;
}
```

E na construção do `inner`:

```typescript
// Antes:
const inner = [descEl, ...children].filter(Boolean).join('\n');

// Depois:
const inner = [descEl, memoEl, ...children].filter(Boolean).join('\n');
```

- [ ] **Step 5.2.2: Atualizar `buildSetElement` (~linhas 35-68)**

Mesmo pattern — adicionar `memoEl`, atualizar self-closing branch (`if (!descEl && !memoEl && members.length === 0)`), incluir no `inner`.

- [ ] **Step 5.2.3: Adicionar testes**

Em `tests/export/qdcExporter.test.ts`:

```typescript
describe('MemoText emit', () => {
  it('emits MemoText in Code when memo present', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create({ name: 'frustacao', color: '#FF0000' });
    reg.update(def.id, { memo: 'reflexão' });
    const xml = buildCodebookXml(reg);
    expect(xml).toContain('<MemoText>reflexão</MemoText>');
  });

  it('omits MemoText in Code when memo empty', () => {
    const reg = new CodeDefinitionRegistry();
    reg.create({ name: 'frustacao', color: '#FF0000' });
    const xml = buildCodebookXml(reg);
    expect(xml).not.toContain('<MemoText>');
  });

  it('emits MemoText in Set when memo present', () => {
    const reg = new CodeDefinitionRegistry();
    const g = reg.createGroup('Theme');
    reg.setGroupMemo(g.id, 'group memo');
    const xml = buildCodebookXml(reg);
    expect(xml).toContain('<MemoText>group memo</MemoText>');
  });

  it('Code self-closing branch turns to open/close when memo added', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create({ name: 'no-memo', color: '#FF0000' });
    expect(buildCodebookXml(reg)).toMatch(/<Code [^>]*\/>/);

    reg.update(def.id, { memo: 'has memo now' });
    const xml = buildCodebookXml(reg);
    expect(xml).toMatch(/<Code [^>]*>[\s\S]*<\/Code>/);
    expect(xml).toContain('<MemoText>has memo now</MemoText>');
  });

  it('escapes XML special chars in memo', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create({ name: 'x', color: '#000000' });
    reg.update(def.id, { memo: '<bad> & "stuff"' });
    const xml = buildCodebookXml(reg);
    expect(xml).toContain('<MemoText>&lt;bad&gt; &amp; &quot;stuff&quot;</MemoText>');
  });
});
```

> Verificar nome real da função `buildCodebookXml` — pode ser outro nome em `qdcExporter.ts`. Olhar export do arquivo.

- [ ] **Step 5.2.4: Run testes**

```bash
npx vitest run tests/export/qdcExporter.test.ts -t "MemoText emit"
```

Expected: 5 passam.

- [ ] **Step 5.2.5: Commit**

```bash
git add src/export/qdcExporter.ts tests/export/qdcExporter.test.ts
~/.claude/scripts/commit.sh "feat(export): MemoText em Code e Set quando memo presente"
```

---

### Task 5.3: Emit `<MemoText>` em `<Link>` (qdpxExporter — re-arquitetar emission)

**Files:**
- Modify: `src/export/qdpxExporter.ts`
- Test: `tests/export/qdcExporter.test.ts` (ou tests/export/qdpxExporter.test.ts se existir)

- [ ] **Step 5.3.1: Localizar `<Link>` emission lines (`:383, 398`)**

Hoje provavelmente é algo como:

```typescript
links.push(`<Link guid="${guid}" originGUID="${originGuid}" targetGUID="${targetGuid}" name="${escapeXml(label)}" direction="${directed ? 'directed' : 'undirected'}"/>`);
```

- [ ] **Step 5.3.2: Re-arquitetar pra emissão condicional inner block**

```typescript
const linkAttrs = `guid="${guid}" originGUID="${originGuid}" targetGUID="${targetGuid}" name="${escapeXml(label)}" direction="${directed ? 'directed' : 'undirected'}"`;
const memoEl = relation.memo ? `<MemoText>${escapeXml(relation.memo)}</MemoText>` : '';
links.push(memoEl
  ? `<Link ${linkAttrs}>${memoEl}</Link>`
  : `<Link ${linkAttrs}/>`,
);
```

Aplicar em ambos os call sites (`:383` e `:398`).

- [ ] **Step 5.3.3: Adicionar teste**

```typescript
it('Link self-closing turns to open/close when memo present', () => {
  // Setup: code com relation que tem memo
  // ...build dataManager fixture
  const xml = buildQdpxXml(dataManager, registry);
  expect(xml).toMatch(/<Link [^>]*>[\s\S]*<\/Link>/);
  expect(xml).toContain('<MemoText>relation memo</MemoText>');
});
```

> Confirmar nome real da função e shape do fixture do test file existente.

- [ ] **Step 5.3.4: Run + commit**

```bash
npx vitest run tests/export/qdpxExporter.test.ts -t "Link"
git add src/export/qdpxExporter.ts tests/export/qdpxExporter.test.ts
~/.claude/scripts/commit.sh "feat(export): MemoText em Link com re-arquitetamento de emission"
```

---

### Task 5.4: Parse `<MemoText>` no import

**Files:**
- Modify: `src/import/qdcImporter.ts`
- Modify: `src/import/qdpxImporter.ts`
- Test: `tests/import/qdcImporter.test.ts`

- [ ] **Step 5.4.1: `<MemoText>` em `<Code>` parser**

Em `qdcImporter.ts`, no parser de `<Code>` element (procurar `<Description>` parsing como template), adicionar branch pra `<MemoText>`:

```typescript
const memoEl = codeEl.querySelector('MemoText');
const memo = memoEl?.textContent?.trim();
// Quando merge with existing: usar mergeMemos
// Quando new: setar def.memo = memo
```

Aplicar nos 2 paths (new code creation vs merge with existing).

- [ ] **Step 5.4.2: `<MemoText>` em `<Set>` parser**

Mesmo pattern, no parser de `<Set>` em `qdpxImporter.ts:~398-400` (próximo ao description).

- [ ] **Step 5.4.3: `<MemoText>` em `<Link>` parser**

No parser de `<Link>` (relations code-level) — extrair memo, setar em `CodeRelation.memo`.

- [ ] **Step 5.4.4: Testes**

```typescript
describe('MemoText parse', () => {
  it('parses MemoText in Code', () => {
    const xml = `<Code guid="${guid}" name="x"><MemoText>memo here</MemoText></Code>`;
    const reg = new CodeDefinitionRegistry();
    importCodebookXml(xml, reg); // ou nome equivalente
    const def = reg.getByName('x');
    expect(def?.memo).toBe('memo here');
  });

  it('parses MemoText in Set', () => {
    // ...
  });

  it('parses MemoText in Link', () => {
    // ...
  });

  it('mergeMemos when importing into existing entity', () => {
    const reg = new CodeDefinitionRegistry();
    const def = reg.create({ name: 'x', color: '#000' });
    reg.update(def.id, { memo: 'existing' });
    const xml = `<Code name="x"><MemoText>imported</MemoText></Code>`;
    importCodebookXml(xml, reg, { mergeMode: 'merge' });
    expect(reg.getById(def.id)!.memo).toContain('existing');
    expect(reg.getById(def.id)!.memo).toContain('--- Imported memo ---');
    expect(reg.getById(def.id)!.memo).toContain('imported');
  });
});
```

- [ ] **Step 5.4.5: Run + commit**

```bash
npx vitest run tests/import/qdcImporter.test.ts -t "MemoText"
git add src/import/qdcImporter.ts src/import/qdpxImporter.ts tests/import/qdcImporter.test.ts
~/.claude/scripts/commit.sh "feat(import): parse MemoText em Code, Set, Link com merge"
```

---

### Task 5.5: Round-trip CodeApplication.relations memo (schema-ready)

**Files:**
- Test: `tests/import/qdpxImporter.test.ts`

- [ ] **Step 5.5.1: Adicionar fixture com marker contendo CodeApplication com relation memo**

```typescript
describe('Round-trip CodeApplication.relations memo (schema-ready)', () => {
  it('preserves memo in CodeApplication.relations through export → import', () => {
    // Seed: marker em CSV com CodeApplication contendo relation com memo
    const dataManager = mkDataManager();
    const registry = mkRegistry();
    // ... seed um marker com:
    // codes: [{ codeId: 'a', relations: [{ label: 'reforça', target: 'b', directed: false, memo: 'app-level memo' }] }]
    
    // Export
    const qdpxBlob = await buildQdpxBlob(dataManager, registry);
    
    // Re-import
    const newDM = mkDataManager();
    const newReg = mkRegistry();
    await importQdpxBlob(qdpxBlob, newDM, newReg);
    
    // Asserções: marker re-criado tem CodeApplication.relations[0].memo === 'app-level memo'
    const reimportedMarker = newDM.section('csv').rowMarkers[0];
    expect(reimportedMarker.codes[0].relations?.[0].memo).toBe('app-level memo');
  });
});
```

> Esse teste valida promessa "schema-ready" da decisão #14 — round-trip preserva memo de application-level mesmo sem UI escrever. **Pode falhar inicialmente** se o exporter de marker-level relations não emitir memo. Se falhar, o exporter precisa ser estendido pra emitir memo nas application-level relations também.

- [ ] **Step 5.5.2: Run**

```bash
npx vitest run tests/import/qdpxImporter.test.ts -t "CodeApplication.relations memo"
```

Se falhar: estender exporter de application-level relations pra emit memo. Se passar: feature schema-ready confirmada.

- [ ] **Step 5.5.3: Commit**

```bash
git add tests/import/qdpxImporter.test.ts src/export/qdpxExporter.ts
~/.claude/scripts/commit.sh "test(import): round-trip schema-ready de CodeApplication.relations memo"
```

---

### Task 5.6: CSV tabular ganha coluna `memo`

**Files:**
- Modify: `src/export/tabular/buildCodesTable.ts`
- Modify: `src/export/tabular/buildGroupsTable.ts`
- Modify: `src/export/tabular/buildRelationsTable.ts`
- Test: 3 tests files correspondentes

- [ ] **Step 5.6.1: `buildCodesTable.ts` — header + row**

```typescript
// Antes:
export const CODES_HEADER: string[] = [
  'id', 'name', 'color', 'parent_id', 'description', 'magnitude_config', 'groups',
];

// Depois:
export const CODES_HEADER: string[] = [
  'id', 'name', 'color', 'parent_id', 'description', 'memo', 'magnitude_config', 'groups',
];
```

E na construção da row (após description):

```typescript
def.description ?? '',
def.memo ?? '',  // NEW
// ...
```

- [ ] **Step 5.6.2: `buildGroupsTable.ts` — header + row**

```typescript
// Antes:
export const GROUPS_HEADER: string[] = ['id', 'name', 'color', 'description'];

// Depois:
export const GROUPS_HEADER: string[] = ['id', 'name', 'color', 'description', 'memo'];
```

E na construção:

```typescript
rows.push([g.id, g.name, g.color, g.description ?? '', g.memo ?? '']);
```

- [ ] **Step 5.6.3: `buildRelationsTable.ts` — header + row**

```typescript
// Antes:
export const RELATIONS_HEADER: string[] = [
  'scope', 'origin_code_id', 'origin_segment_id', 'target_code_id', 'label', 'directed',
];

// Depois (memo no fim):
export const RELATIONS_HEADER: string[] = [
  'scope', 'origin_code_id', 'origin_segment_id', 'target_code_id', 'label', 'directed', 'memo',
];
```

E nos 2 lugares de push (code-level + application-level), append `rel.memo ?? ''` no fim.

- [ ] **Step 5.6.4: Atualizar tests existentes**

Em cada `tests/export/tabular/build*Table.test.ts`, atualizar fixtures pra usar nova `*_HEADER` e adicionar 1-2 testes específicos:

```typescript
it('memo column populated', () => {
  // Seed fixture com memo, assert row contém memo
});
it('memo column empty when no memo', () => {
  // Default fixture sem memo, assert row tem '' na coluna
});
it('relations: app-level memo column empty (schema-ready, no UI)', () => {
  // Seed fixture com CodeApplication.relations sem memo, assert row scope='application' tem '' na coluna memo
});
```

- [ ] **Step 5.6.5: Run + commit**

```bash
npx vitest run tests/export/tabular/buildCodesTable.test.ts tests/export/tabular/buildGroupsTable.test.ts tests/export/tabular/buildRelationsTable.test.ts
git add src/export/tabular/build*.ts tests/export/tabular/build*Table.test.ts
~/.claude/scripts/commit.sh "feat(export): coluna memo em codes.csv, groups.csv, relations.csv"
```

---

### Task 5.7: Type check final + sanity

**Files:** —

- [ ] **Step 5.7.1: Type check**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Step 5.7.2: Sanity dos files novos/editados**

```bash
npx vitest run tests/core/codeDefinitionRegistry.test.ts tests/export/qdcExporter.test.ts tests/export/qdpxExporter.test.ts tests/import/qdcImporter.test.ts tests/import/qdpxImporter.test.ts tests/export/tabular/
```

Expected: tudo verde.

---

## Chunk 6: Smoke + ROADMAP + cleanup

> **Objetivo:** Smoke completo no vault, atualizar ROADMAP/CLAUDE/ARCHITECTURE, merge e push.

### Task 6.1: Smoke checklist completo

**Files:** —

- [ ] **Step 6.1.1: Build production**

```bash
npm run build
```

- [ ] **Step 6.1.2: Reload plugin no vault e rodar checklist**

| # | Cenário | Esperado |
|---|---------|----------|
| 1 | Code Detail → editar memo → fechar e reabrir | memo persistiu |
| 2 | Code Detail → memo vazio (apagar tudo) → reabrir | memo undefined no `data.json` |
| 3 | Group selected → click "Add memo..." → PromptModal → save | persistiu |
| 4 | Right-click no group chip → "Edit memo" / "Clear memo" | itens funcionam |
| 5 | Code Detail → adicionar relation → ✎ aparece | row mostra ✎ |
| 6 | Click ✎ → PromptModal → save → ✎ vira accent (has-memo) | persistiu |
| 7 | Coding popover (aplicar code a marker) → relation row | **SEM ✎** (application-level fora) |
| 8 | Marker Detail → relation row | **SEM ✎** |
| 9 | Export QDPX → abrir XML | `<MemoText>` em Code, Set, Link ✓ |
| 10 | Import QDPX (próprio export) → conferir memos preservados | ✓ |
| 11 | Export CSV tabular → abrir codes.csv / groups.csv / relations.csv | coluna `memo` populada |

- [ ] **Step 6.1.3: Cleanup demo se aplicável**

```bash
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
```

(Não é obrigatório — só sincroniza demo vault. Pode pular se não usar demo.)

---

### Task 6.2: Atualizar ROADMAP + docs

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `CLAUDE.md` (se contagem testes mudou)

- [ ] **Step 6.2.1: Marcar item como FEITO no ROADMAP**

Em `docs/ROADMAP.md`, na seção §3 Analytics — melhorias OU em "Histórico" (decida onde encaixa melhor — esta feature não está em §3 explícita, mas é pré-requisito do "Analytic Memo View" listado lá), adicionar item de histórico análogo aos #21-#24:

```markdown
- **#25 Memos em todas entidades** — 2026-04-27. Branch `feat/memos-todas-entidades`. Schema aditivo: `CodeDefinition.memo`, `GroupDefinition.memo`, `CodeRelation.memo`. Registry: estende `update()` com `'memo'` (Code), `setGroupMemo` dedicado, `setRelationMemo(codeId, label, target, memo)` por tupla. UI: plain textarea em Code Detail (pattern marker memo), PromptModal pra Group memo (pattern editGroupDescription), ✎ button em existing relation rows do Code Detail abrindo PromptModal — surfaces application-level (`baseCodingMenu.ts`, `detailMarkerRenderer.ts`) intocadas conforme decisão. Export QDPX: `<MemoText>` em Code, Set, Link com element-form switch (self-closing → open/close); pipeline marker memo via `<NoteRef>` mantido intocado. CSV tabular: coluna `memo` em codes.csv, groups.csv, relations.csv (app-level rows vazios até UI lander). Import: `mergeMemos` análoga a `mergeDescriptions` pra conflito. Round-trip schema-ready de `CodeApplication.relations.memo`. ~XX novos testes.
```

> Substituir `XX` pela contagem real de testes adicionados.

- [ ] **Step 6.2.2: Atualizar contagem em CLAUDE.md**

Rodar suite inteira pra pegar contagem real:

```bash
npx vitest run 2>&1 | grep -E "Test Files|Tests" | tail -2
```

Em `CLAUDE.md`, atualizar linha:

```markdown
- `npm run test` — 2264 testes em 131 suites (Vitest + jsdom)
```

Pra a contagem nova.

- [ ] **Step 6.2.3: Commit docs**

```bash
git add docs/ROADMAP.md CLAUDE.md
~/.claude/scripts/commit.sh "docs(roadmap): marca memos em todas entidades como concluido (#25)"
```

---

### Task 6.3: Merge para main + push

**Files:** —

- [ ] **Step 6.3.1: Confirmar branch limpo**

```bash
git status
```

Expected: nothing to commit, working tree clean.

- [ ] **Step 6.3.2: Checkout main + pull**

```bash
git checkout main
git pull --ff-only
```

- [ ] **Step 6.3.3: Merge fast-forward**

```bash
git merge feat/memos-todas-entidades --ff-only
```

- [ ] **Step 6.3.4: Build final + sync demo (opcional)**

```bash
npm run build
cp -p main.js manifest.json styles.css demo/.obsidian/plugins/qualia-coding/
git add demo/.obsidian/plugins/qualia-coding/main.js demo/.obsidian/plugins/qualia-coding/styles.css
~/.claude/scripts/commit.sh "chore(demo): build pos memos em todas entidades"
```

- [ ] **Step 6.3.5: Push**

```bash
git push origin main
```

- [ ] **Step 6.3.6: Cleanup branch**

```bash
git branch -d feat/memos-todas-entidades
```

---

### Task 6.4: Arquivar spec/plan

**Files:** —

- [ ] **Step 6.4.1: Copiar pra workspace externo**

```bash
cp /Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding/docs/superpowers/specs/2026-04-27-memos-em-todas-entidades-design.md /Users/mosx/Desktop/obsidian-plugins-workbench/obsidian-qualia-coding/plugin-docs/archive/claude_sources/specs/20260427-memos-em-todas-entidades-design.md

cp /Users/mosx/Desktop/obsidian-plugins-workbench/.obsidian/plugins/obsidian-qualia-coding/docs/superpowers/plans/2026-04-27-memos-em-todas-entidades.md /Users/mosx/Desktop/obsidian-plugins-workbench/obsidian-qualia-coding/plugin-docs/archive/claude_sources/plans/20260427-memos-em-todas-entidades.md
```

- [ ] **Step 6.4.2: git rm + commit + push**

```bash
git rm docs/superpowers/specs/2026-04-27-memos-em-todas-entidades-design.md docs/superpowers/plans/2026-04-27-memos-em-todas-entidades.md
~/.claude/scripts/commit.sh "chore: arquiva spec/plan memos-em-todas-entidades pra workspace externo"
git push origin main
```

---

## Resumo dos chunks

| Chunk | Resultado | Smoke checkpoint |
|-------|-----------|-------------------|
| 1 | Schema + 3 setters/extension no registry | ✅ tests verdes |
| 2 | Code Detail tem seção memo plain textarea | ✅ persiste no vault |
| 3 | Group editável via panel surface + context menu | ✅ persiste no vault |
| 4 | ✎ button em existing relations do Code Detail (somente) | ✅ persiste; ausente em app-level surfaces |
| 5 | QDPX MemoText emit/parse + CSV memo column | ✅ tests verdes; round-trip preserva |
| 6 | Smoke completo + ROADMAP + merge + arquivar | ✅ checklist completo |

Total estimado: ~2-3h ativa, ~20 commits pequenos.

---

## Notas finais pro implementador

- **Cada chunk só começa após smoke do anterior passar**
- **Cada commit auto-contido** — testes passam, build OK
- **Smoke manual no vault não-negociável** (lição cara: testes verdes ≠ feature funciona)
- **Sem hedge defensivo** — plugin é dev, zero usuários, sem backcompat
- **NUNCA criar git worktree** — overridden pelo CLAUDE.md
- **Use `~/.claude/scripts/commit.sh`** sempre
- **Spec é a fonte de verdade** — em qualquer dúvida de escopo, voltar pra `docs/superpowers/specs/2026-04-27-memos-em-todas-entidades-design.md`
- **Scope creep proibido** — Analytic Memo View, Convert to Note, Document memo, marker memo refactor — TODO **fora** desta feature

Pronto pra executar.
