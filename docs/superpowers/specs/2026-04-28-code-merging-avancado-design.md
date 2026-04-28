# Code Merging Avançado — Design

**Data:** 2026-04-28
**Status:** Design aprovado, pronto pra plano de implementação
**ROADMAP:** Coding Management Tier 2 — segundo (e último) item, fecha a tier

---

## Contexto

`MergeModal` + `executeMerge` já existem (`src/core/mergeModal.ts`). Hoje o merge é simples:

- Drag em modo Merge → modal pra escolher target
- Confirma → markers reassignados, filhos reparenteados, groups unioned, sources deletados
- Pode renomear destino (input free-text) e mover pra top-level
- **Memos dos sources são descartados sem aviso** (bug central)
- **Descriptions dos sources idem** (sempre vence o target)
- **Cor sempre vence o target** (sem opção)
- **Preview** = só "N segments will be reassigned" (sem filhos, sem groups, sem lista de sources)

Audit log #29 já captura `merged_into`/`absorbed`. Quando description/memo do target mudar via `registry.update`, os events `description_edited`/`memo_edited` disparam automaticamente — sem trabalho extra de auditoria.

**Use case motivador:** pesquisador percebe que dois códigos viraram a mesma coisa, mas cada um tem memos analíticos acumulados que não pode perder. Hoje o merge silenciosamente joga fora.

**Escopo:** estender `MergeModal` + `executeMerge` com 4 novos inputs (nome, cor, política description, política memo) e preview rico. Sem refactor — modal está 70% pronto.

---

## Decisões de design

| # | Decisão | Resposta |
|---|---------|----------|
| 1 | Nome e cor são radios independentes | Sim. Listados em linhas separadas — pode pegar nome de A e cor de B. |
| 2 | Cor "custom" no modal | **Não.** Só radio entre target + cada source. Quem quiser cor nova edita depois (YAGNI). |
| 3 | Nome "custom" no modal | **Sim** — input free-text como 4ª opção do radio (mantém o behavior atual). |
| 4 | Default de description | **keep target.** Description é definição operacional; sources raramente complementam. |
| 5 | Default de memo | **concatenate.** Memos são reflexão acumulada; perder por silêncio é o bug. |
| 6 | Pattern de concatenate | `existing\n\n--- From {sourceName} ---\n{text}` — inspirado nos helpers `mergeMemos`/`mergeDescriptions` do importer (`src/import/qdcImporter.ts:138-150`), que usam `--- Imported memo ---`. Aqui o cabeçalho diferente é intencional: contexto de merge interno expõe o nome da source, não a origem genérica "imported". Ordem: target primeiro, sources na ordem de adição. |
| 7 | "Keep only X" | Dropdown nativo `<select>` listando só participantes com conteúdo não-vazio. Se ≤1 participante tem conteúdo, esconde a opção. |
| 8 | Seções inteiras escondidas | Se nenhum participante tem description, esconde toda a section "Description". Idem memo. Não há nada a decidir. |
| 9 | Audit log | Sem código novo. `registry.update` (`src/core/codeDefinitionRegistry.ts:267,276,283`) emite `renamed`/`description_edited`/`memo_edited` automaticamente quando os respectivos campos mudam. **Cor não é auditada** (`update()` linha 269-271 não emite — decisão #29: cosmético). `merged_into`/`absorbed` continuam emitidos manualmente em `executeMerge` como hoje. |
| 10 | Lifecycle de pre-add | `addSource(codeId)` continua existindo (drag-drop pré-popula). |
| 11 | Preview rico | 4 linhas: markers reassigned, children reparented + nomes, groups unioned (só se houver mudança), sources deletados. |
| 12 | Validação | Botão `Merge` desabilitado se: (a) 0 sources, (b) nome custom escolhido mas vazio, ou (c) **final name colide** com código fora do escopo do merge (não-target, não-source) — inline error visível. Ver §"Name collision" abaixo. |
| 13 | Modal width | Modal fica mais alto, mas não mais largo — colunas de input não fazem sentido pra textos longos de memo/description preview. Não precisa de classe nova de width. |
| 14 | Testing | `mergeModal.test.ts` ganha cobertura das policies + cor + nome custom (jsdom). UI do modal — smoke test em vault real, não jsdom (consistente com #27/#28). |

---

## Arquitetura

### Schema

**Sem mudança de `data.json`.** Todos os inputs novos são parâmetros do merge — não persistem em estrutura nova. O resultado já cai nos campos existentes (`name`, `color`, `description`, `memo`, `groups`).

### `MergeParams` reescrito (sem shim legado)

```ts
export type NameChoice =
  | { kind: 'target' }
  | { kind: 'source'; codeId: string }
  | { kind: 'custom'; value: string };

export type ColorChoice =
  | { kind: 'target' }
  | { kind: 'source'; codeId: string };

export type TextPolicy =
  | { kind: 'keep-target' }
  | { kind: 'concatenate' }
  | { kind: 'keep-only'; codeId: string }  // codeId pode ser o do target
  | { kind: 'discard' };

export interface MergeParams {
  destinationId: string;
  sourceIds: string[];
  registry: CodeDefinitionRegistry;
  markers: BaseMarker[];

  nameChoice: NameChoice;
  colorChoice: ColorChoice;
  descriptionPolicy: TextPolicy;
  memoPolicy: TextPolicy;

  /** Move target sob outro parent. Independente das outras choices. `null` move pra root. */
  destinationParentId?: string | null;
}

export interface MergeResult {
  updatedMarkers: BaseMarker[];
  affectedCount: number;
  ok: boolean;                       // false se rename falhou por collision
  reason?: 'name-collision';
}
```

> **Sem defaults, sem shim legado.** Per CLAUDE.md (zero usuários, sem backwards-compat code), os 4 fields novos são obrigatórios; os 2 callers do modal e os 2 testes que ainda usam `destinationName`/`destinationParentId` (`tests/core/mergeModal.test.ts:72-85`) migram pra schema novo no mesmo plan. `destinationName` e `destinationParentId` velhos somem da assinatura.

### Helpers puros novos

**`src/core/mergePolicies.ts`** (módulo novo, ~80 LOC):

```ts
// Resolve nome final dado a escolha
export function resolveName(
  choice: NameChoice,
  target: CodeDefinition,
  sources: CodeDefinition[],
): string

// Resolve cor final
export function resolveColor(
  choice: ColorChoice,
  target: CodeDefinition,
  sources: CodeDefinition[],
): string

// Aplica policy a um campo de texto (description ou memo)
// Retorna `undefined` quando o resultado deve ser limpar o campo (todos vazios + discard)
export function applyTextPolicy(
  policy: TextPolicy,
  target: CodeDefinition,
  sources: CodeDefinition[],
  field: 'description' | 'memo',
): string | undefined
```

**Pattern de concatenate** (mesmo módulo):

```ts
function concatenate(
  target: CodeDefinition,
  sources: CodeDefinition[],
  field: 'description' | 'memo',
): string {
  const parts: string[] = [];
  const targetText = target[field]?.trim();
  if (targetText) parts.push(targetText);
  for (const src of sources) {
    const text = src[field]?.trim();
    if (text) parts.push(`--- From ${src.name} ---\n${text}`);
  }
  return parts.join('\n\n');
}
```

> **Edge case:** se target tem texto vazio e só 1 source tem conteúdo, `concatenate` produz `--- From X ---\nY`. Faz sentido — o usuário pediu concatenação. Se quiser sem o cabeçalho, escolhe `keep-only [source X]`.

### `executeMerge` refactor (ordem reescrita)

A ordem importa por causa de **name collision**: se a escolha for "keep source name" e o nome do source ainda estiver em `nameIndex`, o `update({ name })` é rejeitado silenciosamente (`registry.ts:259-262`). Solução: rename **depois** do `delete(sourceIds)` — `_deleteCodeNoEmit` limpa `nameIndex.delete(def.name)` (linha 339), liberando o nome.

Ordem nova (10 passos):

1. **Reassign markers** — sem mudança
2. **Reparent children** — sem mudança
3. **Apply COLOR** — `update(id, { color })` se mudou (não auditado por design)
4. **Apply DESCRIPTION** — `update(id, { description })` (audit `description_edited` se mudou)
5. **Apply MEMO** — `update(id, { memo })` (audit `memo_edited` se mudou)
6. **Record `mergedFrom` + union de groups** — sem mudança
7. **Audit `merged_into` + `absorbed` + `suppressNextDelete`** — sem mudança
8. **Delete sources** — libera `nameIndex` dos sources
9. **Apply NAME** — `update(id, { name })` se difere do atual (audit `renamed` se mudou). Pra `nameChoice = source` ou `target`, garantidamente não colide. Pra `custom`, é o caller que pré-validou (modal). Se ainda assim colidir (race extrema), retorna `{ ok: false, reason: 'name-collision' }`.
10. **Apply destinationParentId** (se passado, independente — `null` move pra root via `setParent(id, undefined)`)

### `MergeModal` UI

Layout:

```
┌─ Merge codes ─────────────────────────────────┐
│ Target: ●●● target name                        │
│                                                │
│ Sources to merge:                              │
│ [chip A ✕] [chip B ✕]                          │
│ Search: [________________]                     │
│   → suggestion list when typing                │
├────────────────────────────────────────────────┤
│ Keep name from:                                │
│   ◉ ●●● target name                            │
│   ◯ ●●● source A                               │
│   ◯ ●●● source B                               │
│   ◯ Custom: [________________]                 │
│                                                │
│ Keep color from:                               │
│   ◉ ●●● target  ◯ ●●● A  ◯ ●●● B               │
├────────────────────────────────────────────────┤
│ Description: ◉ keep target  ◯ concatenate     │
│              ◯ keep only [▼ pick…]  ◯ discard │
│                                                │
│ Memos:       ◉ concatenate  ◯ keep target     │
│              ◯ keep only [▼ pick…]  ◯ discard │
├────────────────────────────────────────────────┤
│ Preview                                        │
│ • 47 markers will be reassigned                │
│ • 3 child codes reparented                     │
│ • Groups unioned: Theme A, Wellbeing           │
│ • 2 codes will be deleted: source A, source B  │
├────────────────────────────────────────────────┤
│                          [Cancel] [Merge]      │
└────────────────────────────────────────────────┘
```

**Render reativo:** todas as seções abaixo de "Sources" são re-renderizadas quando `sourceIds` muda (add/remove). Implementação: helpers `renderNameSection()`, `renderColorSection()`, `renderDescriptionSection()`, `renderMemoSection()`, `renderPreview()` chamados de um único `rerenderAll()` que dispara em qualquer mutação.

**State interno:**

```ts
private nameChoice: NameChoice = { kind: 'target' };
private colorChoice: ColorChoice = { kind: 'target' };
private descriptionPolicy: TextPolicy = { kind: 'keep-target' };
private memoPolicy: TextPolicy = { kind: 'concatenate' };
private customName = '';
```

**Esconder seções degeneradas:**
- Se nenhum source ainda foi adicionado (`sourceIds.size === 0`), as 4 seções abaixo somem (preview mostra "Add sources to see impact"). Botão Merge desabilitado.
- Se nenhum participante (target + sources) tem `description` não-vazia, esconde toda a seção Description.
- Idem memo.
- Em "Keep only", o `<select>` lista só os participantes com conteúdo não-vazio. Se ≤1 tem, a opção `keep only` some do radio.

**Validação (pre-flight collision check):**
- Computa `finalName` pelo `resolveName(nameChoice, target, sources)`.
- Considera "código não-target, não-source" como `registry.getAll().filter(c => c.id !== target.id && !sourceIds.has(c.id))`.
- Se algum desses tem `name === finalName` (case-sensitive, mesmo critério do `nameIndex`), bloqueia merge.
- Botão `Merge` desabilita quando: (a) `sourceIds.size === 0`, (b) `nameChoice.kind === 'custom' && customName.trim() === ''`, OU (c) collision detectada.
- Inline error abaixo da seção Name: `Name "X" is already used by another code.`
- Nota: nomes que colidem com sources ou com o target em si são OK — o source vai sumir antes do rename, e renomear pra si mesmo é no-op.

### Drag-drop entry point

`onMergeDrop` em `baseCodeDetailView.ts:516-537` cria modal com `addSource(sourceId)` antes de `open()`. Nada muda nesse caller — só passa params novos no `executeMerge` que ele já chama dentro do `onConfirm`.

### Context-menu entry point

`openMergeModal` em `baseCodeDetailView.ts:951-970`. Mesmo pattern.

---

## Componentes a tocar

| Arquivo | Mudança |
|---------|---------|
| `src/core/mergePolicies.ts` | **Novo.** Helpers puros: `resolveName`, `resolveColor`, `applyTextPolicy`, types `NameChoice`/`ColorChoice`/`TextPolicy`. |
| `src/core/mergeModal.ts` | `MergeParams` ganha 4 campos opcionais. `executeMerge` aplica policies (3 chamadas a `registry.update`). `MergeModal.onOpen` reescreve UI com 4 seções novas + preview rico + render reativo. `onConfirm` callback ganha objeto único em vez de 4 args. |
| `src/core/baseCodeDetailView.ts` | Os 2 callers do modal (`onMergeDrop` linha 516, `openMergeModal` linha 951) passam `decision` único pro `onConfirm` e propagam pra `executeMerge`. |
| `tests/core/mergeModal.test.ts` | Reescrito: 2 testes legados (linhas 72-85) migram pra `nameChoice = { kind: 'custom', value }` e `destinationParentId` direto. Adiciona testes: cor escolhida do source, nome do source, nome custom, concatenate description, concatenate memo, keep-only memo, discard memo, todos os participantes vazios = noop, **rename pós-delete não colide com source**, **rename custom em collision retorna `ok:false`**. |
| `tests/core/mergePolicies.test.ts` | **Novo.** Cobre os 3 helpers puros isoladamente (decisão de escopo: testar lógica fora do modal). |
| `tests/core/mergeGroupsUnion.test.ts` | **Sem mudança.** Lógica de union dos groups está intacta (passo 6, sem refactor). |
| `styles.css` | Pequenos ajustes pra novas classes `.codebook-merge-section`, `.codebook-merge-radio-row`, `.codebook-merge-preview-list`, swatches inline. |

---

## Fluxo de dados — exemplo concreto

**Cenário:** target = `frustração` (memo: "tensão emocional aguda"), source = `irritação` (memo: "raiva curta sem alvo claro"). Usuário escolhe:
- nome: target (`frustração`)
- cor: source (cor de `irritação`)
- description: keep-target
- memo: concatenate

**executeMerge produz no destination (na ordem dos 10 passos):**
- (1-2) markers reassignados, filhos reparenteados — sem efeito visível aqui.
- (3) `color = '<cor de irritação>'` — `registry.update(id, { color })`. Audit **não** dispara (`registry.ts:269-271` só seta o campo, não emite).
- (4) `description` igual — sem update.
- (5) `memo = "tensão emocional aguda\n\n--- From irritação ---\nraiva curta sem alvo claro"` — `registry.update(id, { memo })` → audit `memo_edited` emitido.
- (6) `mergedFrom` ganha `irritação.id`; groups: union.
- (7) audit `merged_into` (em irritação) + `absorbed` (em frustração) emitidos.
- (8) `irritação` deletada (audit `deleted` suprimido por passo 7).
- (9) name = 'frustração' (sem mudança) — sem update.
- (10) destinationParentId não passado — sem update.

> **Coalescing audit log:** `description_edited` + `memo_edited` no mesmo merge são events distintos (campos diferentes), então cada um vira sua própria entry. Mas se o user re-merge no target em <60s, as entries do mesmo tipo coalesceriam (per `auditLog.ts` `COALESCE_WINDOW_MS`). Aceitável.

---

## Error handling

- **Source deletado durante o modal aberto** (race com outro fluxo): chip do source pode apontar pra `registry.getById(srcId) === undefined`. `executeMerge` já é tolerante (loop com `getById` checa null). UI: skip silencioso na hora de renderizar chip.
- **Target deletado durante o modal aberto**: `onOpen` checa `getById(destinationId)` e fecha se null (já existe — linha 146). Sem mudança.
- **Nome custom vazio**: `Merge` desabilitado.
- **Name collision detectado pre-flight**: `Merge` desabilitado, inline error abaixo da seção Name. Resolução: usuário muda `nameChoice`.
- **Name collision em runtime** (race entre pre-flight check e execução): `executeMerge` retorna `{ ok: false, reason: 'name-collision' }`. Caller (modal) mostra `Notice('Merge failed: name collision detected. Try again.')` e mantém modal aberto pra retry. Markers já foram reassignados nesse ponto — Notice deixa claro que o resto do merge correu, só o rename não. (Edge case extremo na prática single-user.)
- **Concatenate com todos vazios**: helper retorna `undefined` (não `''`) — sinaliza "não atualize o campo". Se nem o target tinha conteúdo, `update` não roda, audit fica em silêncio. Limpo.

---

## Testing

| Camada | Como |
|--------|------|
| `mergePolicies.ts` | 100% via unit tests jsdom puros (sem registry, sem DOM). 12-15 tests. |
| `executeMerge` | Estende `mergeModal.test.ts` com cenários de cor/nome/description/memo. 8-10 tests novos. |
| `MergeModal` UI | Smoke test em vault real (consistente com #27/#28). Roteiro de teste no `MANUAL-TESTS.md`. |
| Round-trip | Não aplicável — schema não muda, QDPX export já cobre `<MemoText>`/`<Description>`. |

**Total estimado:** +20 a +25 testes (baseline atual ~2363 → ~2385). Os 2 testes legados em `mergeModal.test.ts:72-85` são reescritos, não somados.

---

## Migração das chamadas (sem shim)

Per CLAUDE.md (zero usuários, sem backwards-compat code), `destinationName` é deletado da assinatura. `destinationParentId` muda de `string | undefined` (com `''` significando root) pra `string | null | undefined` (`null` = root explícito, `undefined` = não muda — semântica mais limpa).

**Callers (4 sites):**

| Site | Mudança |
|------|---------|
| `src/core/baseCodeDetailView.ts:516-537` (onMergeDrop drag) | `onConfirm` passa decisão completa (objeto) — modal já carrega state. |
| `src/core/baseCodeDetailView.ts:951-970` (context menu) | Idem. |
| `tests/core/mergeModal.test.ts:72-77` ("updates destination name") | `destinationName: 'NewName'` → `nameChoice: { kind: 'custom', value: 'NewName' }`. |
| `tests/core/mergeModal.test.ts:79-85` ("moves destination to new parent") | `destinationParentId: parent.id` → mesmo (semântica preservada). |

Sem outros callers — `grep "executeMerge\|MergeModal" src/ tests/` confirma.

---

## Won't do (escopo travado)

- Custom color picker no modal — se quiser cor nova, edita depois
- Editar memo/description individualmente antes do merge — usa `keep only` + edição posterior
- Confirm modal extra ("are you sure?") — preview já é o confirm
- Audit log custom além dos events que registry já emite
- Grouping policy específico (groups do target + sources sempre union — não dá pra discartar)
- Merge de N→M (1 target só)
- Undo do merge

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Render reativo do modal vira espaguete (5 seções rerenderando) | Centralizar em `rerenderAll()`. Cada seção é função pura `(state, container) → void` que limpa container e re-popula. |
| Concatenate gera memo gigante (10+ sources com memos longos) | Aceitável — usuário pediu concatenate. Se quiser enxutar, edita depois. |
| Audit log dispara `memo_edited`/`description_edited` durante merge — visualmente o code que acabou de absorber outros tem 3 events seguidos no histórico | Aceitável e desejável — é o registro fiel da mudança. Coalescing 60s do audit log junta os 3 numa entry só pra description e numa entry só pra memo, então timeline fica limpa. |
| Concatenate pattern conflita com QDPX importer (que usa `--- Imported memo ---`) | Levemente diferente (`From {name}` vs `Imported memo`) — intencional, importer é one-off, merge é interno. Documentado no spec. |

---

## Próximos passos após aprovação

1. Spec review loop (subagent)
2. User review do spec escrito
3. Invocar `superpowers:writing-plans` pra plano de implementação
4. Implementação inline (sem SDD — feedback `feedback_sdd_overkill_for_dev_project.md`)
5. Smoke test em vault real
6. Commit + auto-merge pra main (feedback `feedback_auto_post_task_cleanup.md`)
