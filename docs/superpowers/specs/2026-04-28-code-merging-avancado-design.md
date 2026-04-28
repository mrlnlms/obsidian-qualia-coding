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
| 6 | Pattern de concatenate | `existing\n\n--- From {sourceName} ---\n{text}` — espelha `mergeMemos`/`mergeDescriptions` do QDPX importer (`src/import/qdpxImporter.ts`). Ordem: target primeiro, sources na ordem de adição. |
| 7 | "Keep only X" | Dropdown nativo `<select>` listando só participantes com conteúdo não-vazio. Se ≤1 participante tem conteúdo, esconde a opção. |
| 8 | Seções inteiras escondidas | Se nenhum participante tem description, esconde toda a section "Description". Idem memo. Não há nada a decidir. |
| 9 | Audit log | Sem código novo. `registry.update` automaticamente emite `description_edited`/`memo_edited` quando o target muda. `merged_into`/`absorbed` continuam como hoje. |
| 10 | Lifecycle de pre-add | `addSource(codeId)` continua existindo (drag-drop pré-popula). |
| 11 | Preview rico | 4 linhas: markers reassigned, children reparented + nomes, groups unioned (só se houver mudança), sources deletados. |
| 12 | Validação | Botão `Merge` desabilitado se: 0 sources, ou nome custom escolhido mas vazio. |
| 13 | Modal width | Modal fica mais alto, mas não mais largo — colunas de input não fazem sentido pra textos longos de memo/description preview. Não precisa de classe nova de width. |
| 14 | Testing | `mergeModal.test.ts` ganha cobertura das policies + cor + nome custom (jsdom). UI do modal — smoke test em vault real, não jsdom (consistente com #27/#28). |

---

## Arquitetura

### Schema

**Sem mudança de `data.json`.** Todos os inputs novos são parâmetros do merge — não persistem em estrutura nova. O resultado já cai nos campos existentes (`name`, `color`, `description`, `memo`, `groups`).

### `MergeParams` estendido

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

  // novos
  nameChoice?: NameChoice;          // default: { kind: 'target' }
  colorChoice?: ColorChoice;        // default: { kind: 'target' }
  descriptionPolicy?: TextPolicy;   // default: { kind: 'keep-target' }
  memoPolicy?: TextPolicy;          // default: { kind: 'concatenate' }

  // legados — mantidos por compat com chamadas atuais (drag-drop simples)
  destinationName?: string;
  destinationParentId?: string;
}
```

> **Por que defaults?** Permite que `executeMerge` continue sendo chamado por quem ainda não passa os novos params (testes legados, eventual chamada externa) — comportamento herdado é "keep target" + concatenate de memo (que é o comportamento desejado novo, não o atual). Os callers reais (modal) sempre passam tudo explícito.

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

### `executeMerge` refactor (mudanças localizadas)

Sequência continua a mesma — só ganha 3 passos novos antes do delete dos sources:

1. ~~Reassign markers~~ — sem mudança
2. ~~Reparent children~~ — sem mudança
3. **Resolver nome final** via `resolveName(nameChoice, target, sources)`. Se difere do atual, `registry.update(id, { name })`.
4. **Resolver cor final** via `resolveColor(colorChoice, target, sources)`. Se difere, `registry.update(id, { color })`.
5. **Aplicar policy de description** via `applyTextPolicy(descriptionPolicy, target, sources, 'description')`. Se difere do atual, `registry.update(id, { description })` (audit log dispara `description_edited`).
6. **Aplicar policy de memo** análogo (audit log dispara `memo_edited`).
7. ~~Record `mergedFrom` + union de groups~~ — sem mudança
8. ~~Update destinationParentId (legado)~~ — sem mudança, mas só roda se `nameChoice`/`colorChoice` não foram passados (compat shim, ver §"Backwards-compat das chamadas")
9. ~~Audit `merged_into` + `absorbed` + `suppressNextDelete`~~ — sem mudança
10. ~~Delete sources~~ — sem mudança

> **Cuidado:** `destinationName` legado está coberto por `nameChoice = { kind: 'custom', value: ... }`. Os 2 callers reais migram pra `nameChoice`. `destinationName` continua aceito mas vira deprecated path: se passado e `nameChoice` ausente, é interpretado como `{ kind: 'custom', value: destinationName }`.

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

**Validação:**
- Botão `Merge` desabilita quando: `sourceIds.size === 0` OU (`nameChoice.kind === 'custom' && customName.trim() === ''`).
- Sem nome duplicado check no modal (mesma lógica permissiva do registry).

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
| `tests/core/mergeModal.test.ts` | Novos tests: cor escolhida do source, nome do source, nome custom, concatenate description, concatenate memo, keep-only memo, discard memo, todos os participantes vazios = noop. |
| `tests/core/mergePolicies.test.ts` | **Novo.** Cobre os 3 helpers puros isoladamente (decisão de escopo: testar lógica fora do modal). |
| `styles.css` | Pequenos ajustes pra novas classes `.codebook-merge-section`, `.codebook-merge-radio-row`, `.codebook-merge-preview-list`, swatches inline. |

---

## Fluxo de dados — exemplo concreto

**Cenário:** target = `frustração` (memo: "tensão emocional aguda"), source = `irritação` (memo: "raiva curta sem alvo claro"). Usuário escolhe:
- nome: target (`frustração`)
- cor: source (cor de `irritação`)
- description: keep-target
- memo: concatenate

**executeMerge produz no destination:**
- `name = 'frustração'` — sem registry.update (igual)
- `color = '<cor de irritação>'` — `registry.update(id, { color })` → audit `created`/`renamed`/etc não dispara (cor não está na lista — ver `auditLog.ts`); cor change não auditada (decisão #29: cosmético).
- `description` — sem mudança
- `memo = "tensão emocional aguda\n\n--- From irritação ---\nraiva curta sem alvo claro"` — `registry.update(id, { memo })` → audit dispara `memo_edited` automaticamente.
- markers reassignados, source deletada, audit `merged_into`/`absorbed` emitidos.

---

## Error handling

- **Source deletado durante o modal aberto** (race com outro fluxo): chip do source pode apontar pra `registry.getById(srcId) === undefined`. `executeMerge` já é tolerante (loop com `getById` checa null). UI: skip silencioso na hora de renderizar chip.
- **Target deletado durante o modal aberto**: `onOpen` checa `getById(destinationId)` e fecha se null (já existe — linha 146). Sem mudança.
- **Nome custom vazio**: `Merge` desabilitado.
- **Concatenate com todos vazios**: helper retorna `''` (string vazia). Se `target.memo` era undefined, `registry.update(id, { memo: '' })` seta vazio. Aceitável — semanticamente equivalente.

---

## Testing

| Camada | Como |
|--------|------|
| `mergePolicies.ts` | 100% via unit tests jsdom puros (sem registry, sem DOM). 12-15 tests. |
| `executeMerge` | Estende `mergeModal.test.ts` com cenários de cor/nome/description/memo. 8-10 tests novos. |
| `MergeModal` UI | Smoke test em vault real (consistente com #27/#28). Roteiro de teste no `MANUAL-TESTS.md`. |
| Round-trip | Não aplicável — schema não muda, QDPX export já cobre `<MemoText>`/`<Description>`. |

**Total estimado:** +20 a +25 testes (de 2389 → ~2410).

---

## Backwards-compat das chamadas

`destinationName` e `destinationParentId` continuam suportados em `MergeParams` mas viram caminhos legados. Lógica:

```ts
if (params.nameChoice === undefined && params.destinationName !== undefined) {
  // legado: trata como custom name
  params.nameChoice = { kind: 'custom', value: params.destinationName };
}
```

Os 2 callers em `baseCodeDetailView.ts` migram pra `nameChoice` direto (sem fallback). Outros callers — não há, já busquei.

> Nota: como o projeto está em dev (zero usuários), o backwards-compat aqui é só pra não quebrar testes existentes em `mergeModal.test.ts` que ainda usam `destinationName`. Quando os tests forem reescritos pra `nameChoice`, removo o shim.

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
