# Smart Codes — design (Tier 3 do Coding Management)

**Data:** 2026-05-04
**Status:** Design aprovado, pronto pra writing-plans
**Escopo:** ~4-5 sessões (alinhado ao ROADMAP)
**Pré-reqs:** nenhum (autônomo, não depende de LLM)

---

## 1. O que é

**Smart Code** é um código *virtual* definido por um predicate sobre `data.json`. Não persiste markers próprios; os matches são re-derivados (com cache) a cada query.

Resolve o caso "quero analisar interseção sem criar 50 códigos manualmente". Padrão ATLAS.ti desde 2018.

**Exemplos:**

- `frustração` AND `case_var.seniority = "junior"` AND `magnitude(frustração) ≥ 3`
- `(tradição` OR `ancestralidade)` AND NOT `engine = pdf`
- `inGroup("RQ2")` AND `relationExists(label="contradicts")`

## 2. Decisões de produto cravadas

| Eixo | Decisão | Razão |
|---|---|---|
| **Predicate language** | C — completo (AND/OR/NOT + 9 leaves + nesting de smart codes) | Cobre casos de Maria (boolean queries com case vars + magnitude) e Tendai (relation-aware queries); AST aceita extensão futura sem refactor |
| **Presença na UI** | B + memo — read-only first class no Code Explorer + Code Detail + Analytics + sidebar; tem `memo?` opcional | Smart code é predicado salvo, não unidade analítica. Folder/group/relations/description não fazem sentido. Memo justifica metodologicamente a query (audit pack). |
| **Builder UX** | B — row-based linear com indent (Notion/Airtable filter style) | Maria/Tendai não escrevem DSL; form hierárquico ATLAS.ti exigiria mais código sem ROI |
| **Posição no Code Explorer** | B — seção dedicada "Smart Codes" colapsável no topo | Padrão ATLAS.ti, separação visual clara, sem mentir sobre comportamento (folder virtual mente) |
| **Export QDPX** | B — custom namespace `qualia:SmartCodes` + toggle opcional pra materializar como Set REFI-QDA | Preserva semântica viva no round-trip Qualia↔Qualia; toggle dá interop com Atlas.ti/MAXQDA |
| **Export CSV** | `smart_codes.csv` standalone | Não polui codes.csv com null fields (smart codes não têm parentId/folder/groups) |
| **Nome** | "Smart Codes" | ROADMAP atual, jargão internacional ATLAS.ti, sem rejeição em research |
| **Performance** | First-class concern: index pré-computado, cache + invalidação granular, short-circuit, chunked compute, stress test no CI | "Nunca se sabe como vão usar — não quero que trave fácil" (user, 2026-05-04) |

## 3. Schema (aditivo)

```ts
// src/core/types.ts

interface SmartCodeDefinition {
  id: string;             // sc_*
  name: string;           // unique-by-name no namespace dos smart codes
  color: string;
  paletteIndex: number;   // round-robin do DEFAULT_PALETTE
  predicate: PredicateNode;
  memo?: string;
  hidden?: boolean;
  createdAt: number;
}

type PredicateNode =
  | { op: 'AND'; children: PredicateNode[] }
  | { op: 'OR';  children: PredicateNode[] }
  | { op: 'NOT'; child: PredicateNode }
  | LeafNode;

type LeafNode =
  | { kind: 'hasCode';        codeId: string }
  | { kind: 'caseVarEquals';  variable: string; value: string | number | boolean }
  | { kind: 'caseVarRange';   variable: string; min?: number; max?: number; minDate?: string; maxDate?: string }
  | { kind: 'magnitudeGte';   codeId: string; n: number }
  | { kind: 'magnitudeLte';   codeId: string; n: number }
  | { kind: 'inFolder';       folderId: string }
  | { kind: 'inGroup';        groupId: string }
  | { kind: 'engineType';     engine: 'markdown' | 'pdf' | 'image' | 'audio' | 'video' | 'csv' }
  | { kind: 'relationExists'; codeId: string; label?: string; targetCodeId?: string }
  | { kind: 'smartCode';      smartCodeId: string };  // nesting (cycle detection mandatory)

interface QualiaData {
  registry: {
    // ... existente
    smartCodes: Record<string, SmartCodeDefinition>;
    smartCodeOrder: string[];
    nextSmartCodePaletteIndex: number;
  };
}
```

**`MarkerRef`** — tipo leve compartilhado pra resultados de match, exportado nomeado em `src/core/types.ts` (sibling de `AuditEntry`):

```ts
export type EngineType = 'markdown' | 'pdf' | 'image' | 'audio' | 'video' | 'csv';

export interface MarkerRef {
  engine: EngineType;
  fileId: string;
  markerId: string;
}
```

Reusado por: `SmartCodeCache` (indexes + matches), `evaluator` (parâmetro), `applyFilters` (Analytics filter chain), `detailSmartCodeRenderer` (match list rows).

## 4. Arquitetura de módulos

```
src/core/smartCodes/
  types.ts              — re-export PredicateNode, LeafNode, MarkerRef + helpers de discriminação
  evaluator.ts          — evaluate(predicate, marker, ctx) — pura, recursiva, com short-circuit
  matcher.ts            — collectMatches(smartCodeId, data, caseVars) — usa indexes + evaluator
  cache.ts              — SmartCodeCache class (singleton): indexes, matches map, deps map
  dependencyExtractor.ts — extractDependencies(predicate) → Sets de codeIds/caseVarKeys/etc
  predicateNormalizer.ts — reorder children por custo (otimização AND/OR), sem alterar semântica
  predicateValidator.ts — validateForSave(definition, predicate, registry) → ValidationResult (broken refs, cycles, vazio, name collision com outro smart code)
  predicateSerializer.ts — toJson/fromJson (estável pra QDPX e diff)
  builderModal.ts       — UI modal de create/edit (row-based linear)
  detailSmartCodeRenderer.ts — Code Detail equivalente pra smart code (header + predicate display + matches list)
  smartCodeRegistryApi.ts — extends CodeDefinitionRegistry com createSmartCode/updateSmartCode/deleteSmartCode/setSmartCodeMemo/setSmartCodeColor + autoRewriteOnMerge

src/analytics/
  data/dataReader.ts    — extender pra incluir smart codes em getCodeDimensions()
  views/modes/*.ts      — modes que aceitam código como dimensão wireados pra ler matches via cache
  views/configSections.ts — filter chips ganham seção "Smart Codes" com badge ⚡

src/export/
  qdpxExporter.ts       — bloco <qualia:SmartCodes> + opcional <Set> materializado
  qdcExporter.ts        — não toca (smart codes ficam em <qualia:SmartCodes>, não no <CodeBook>)
  tabular/buildSmartCodesTable.ts (novo) — gera smart_codes.csv
  tabular/tabularExporter.ts — adiciona smart_codes.csv ao zip
  tabular/readmeBuilder.ts — snippet R/Python pra parse de predicate_json

src/import/
  qdpxImporter.ts       — parse <qualia:SmartCodes>, valida refs com idMap, converte broken refs em warnings

src/core/auditLog.ts    — adiciona event types pro smart code stream (smart_code_created, predicate_edited, etc.)
```

## 5. Predicate evaluator

Evaluator **não** acessa marker shape pra resolver engine. `engineType` vem do `MarkerRef.engine` passado separado — markers persistidos não ganham `__engine` field (mantém schema enxuto).

Discriminant da AST split em 2 switches pra TS narrowing limpo: outer detecta operator (`'op' in node`) ou leaf (`'kind' in node`).

```ts
function evaluate(
  node: PredicateNode,
  ref: MarkerRef,
  marker: AnyMarker,
  ctx: EvaluatorContext
): boolean {
  if ('op' in node) return evaluateOp(node, ref, marker, ctx);
  return evaluateLeaf(node, ref, marker, ctx);
}

function evaluateOp(node: OpNode, ref, marker, ctx): boolean {
  switch (node.op) {
    case 'AND': return node.children.every(c => evaluate(c, ref, marker, ctx));
    case 'OR':  return node.children.some(c => evaluate(c, ref, marker, ctx));
    case 'NOT': return !evaluate(node.child, ref, marker, ctx);
  }
}

function evaluateLeaf(node: LeafNode, ref, marker, ctx): boolean {
  switch (node.kind) {
    case 'hasCode':       return hasCode(marker, node.codeId);
    case 'caseVarEquals': return ctx.caseVars.get(ref.fileId, node.variable) === node.value;
    case 'caseVarRange':  return inRange(ctx.caseVars.get(ref.fileId, node.variable), node);
    case 'magnitudeGte':  return (getMagnitude(marker, node.codeId) ?? 0) >= node.n;
    case 'magnitudeLte':  return (getMagnitude(marker, node.codeId) ?? Infinity) <= node.n;
    case 'inFolder':      return ctx.codesInFolder(node.folderId).some(cId => hasCode(marker, cId));
    case 'inGroup':       return ctx.codesInGroup(node.groupId).some(cId => hasCode(marker, cId));
    case 'engineType':    return ref.engine === node.engine;
    case 'relationExists':return checkRelation(marker, node, ctx);
    case 'smartCode':     return evaluateNested(node.smartCodeId, ref, marker, ctx);
  }
}
```

`evaluateNested` checa `ctx.evaluating.has(targetSmartId)` (cycle), retorna false se hit. Senão entra em recursão com `evaluating` clonado + `targetSmartId` adicionado.

`AND`/`OR` consomem children em ordem `predicateNormalizer` (cheap-first heuristic): `engineType` < `inFolder` < `inGroup` < `hasCode` < `caseVarEquals` < `caseVarRange` < `magnitudeGte/Lte` < `relationExists` < `smartCode`.

**`magnitudeLte` em magnitude categórica não-numérica:** picker do builder oculta operador `≤` quando `code.magnitude.type !== 'continuous'`. Categorical strings só aceitam `magnitudeGte` no sentido de "tem essa magnitude exata" via `caseVarEquals` análogo — out of scope (categorical magnitude check fica como `hasCode` puro). Decisão: leaves `magnitudeGte/Lte` exigem `code.magnitude.type === 'continuous'`. Validator rejeita.

## 6. Cache & invalidação

```ts
// src/core/smartCodes/cache.ts

class SmartCodeCache {
  private matches = new Map<string, MarkerRef[]>();
  private deps = new Map<string, Dependencies>();
  private indexByCode = new Map<string, Set<MarkerRef>>();
  private indexByFile = new Map<string, Set<MarkerRef>>();
  private dirty = new Set<string>();
  private listeners = new Set<(changed: string[]) => void>();

  rebuildIndexes(data: QualiaData): void;
  invalidateForCode(codeId: string): void;
  invalidateForCaseVar(varKey: string): void;
  invalidateForMarker(args: { engine: EngineType; fileId: string; codeIds: string[] }): void;
  invalidateForFolder(folderId: string): void;
  invalidateForGroup(groupId: string): void;
  invalidateAll(): void;
  invalidate(smartCodeId: string): void;  // single (cascata via deps grafo)
  getMatches(smartCodeId: string): MarkerRef[];
  getCount(smartCodeId: string): number;
  subscribe(fn: (changedSmartCodeIds: string[]) => void): () => void;  // returns unsubscriber
}
```

**Singleton** injetado no plugin (`plugin.smartCodeCache`). Persiste só em memória.

**Index updates incrementais:** modelos emitem eventos quando markers mudam. Listener compartilhado em `main.ts`:

- `addCodeApplication(marker, codeId)` → `indexByCode.get(codeId).add(ref)` + `cache.invalidateForCode(codeId)`
- `removeCodeApplication(marker, codeId)` → remove do index + invalida
- `addMarker(engine, fileId, marker)` → adiciona ao `indexByFile` + `cache.invalidateForMarker({ engine, fileId, codeIds: getCodeIds(marker) })`
- `removeMarker` → remove tudo + `cache.invalidateForMarker({ engine, fileId, codeIds })` com codes que estavam aplicados

**Cascata de invalidação por smart code nesting:** quando smart code A muda, BFS pelo grafo reverso de deps (smart codes que referenciam A) e marca todos como dirty.

**Notify UI coalescing:** `cache.subscribe` recebe lista de smart codes alterados. Múltiplas invalidações num mesmo tick são coalescidas via rAF (mesmo padrão do `visibilityEventBus`).

**Cache miss compute:** se `getMatches` é chamado e está dirty, computa síncrono se predicate dependency suggest <5000 markers candidates; senão chunked async (`setTimeout(0)` cada 1000 markers) + retorna estado "computing" inicial. UI mostra badge "calculating…" não-bloqueante.

## 7. UI — Builder modal

Layout em 3 zonas verticais (Bloco 2 do brainstorm). Implementação em `builderModal.ts` extends Obsidian `Modal`.

**Header:** Name input + Color swatch (HTML5 picker) + Memo button (abre PromptModal pra textarea grande).

**Body:** árvore renderizada como lista plana com indent. Cada nó:

- **Group header row:** `[AND ▾]` dropdown (AND/OR/NOT) + drag handle + delete button. Indent baseado em depth.
- **Leaf row:** dropdown 1 de `kind` (Code is / Case var / Magnitude / In folder / In group / Engine / Relation / Smart code), seguido de inputs adaptativos:
  - `Code is`: code picker (FuzzySuggestModal)
  - `Case var`: variable name picker + operator dropdown (= / range) + value input
  - `Magnitude`: code picker + operator dropdown (≥ / ≤) + number input
  - `In folder` / `In group`: folder/group picker
  - `Engine`: dropdown 6 opções
  - `Relation`: code picker + optional label input + optional target code picker
  - `Smart code`: smart code picker (com runtime cycle detection no save)

**Footer:** preview live "⚡ N matches across M files" + `[Open ▸]` (opens preview drawer com lista virtual scroll dos matches) + `[Cancel] [Save]`.

**Drag-reorder:** `[⋮]` handle permite reordenar dentro do mesmo parent. Drop em group header move pra dentro do group como último filho. Drop em zona vazia entre rows promove pro parent acima.

**Validation** (chama `predicateValidator.validateForSave(definition, predicate, registry)`):

| Caso | Severidade | Save bloqueado? |
|---|---|---|
| Predicate vazio (sem leaves) | error | sim |
| Cycle detected (smart code A → B → A) | error | sim |
| Name colide com outro smart code (case-insensitive) | error | sim |
| Broken refs (code/folder/group/case var/smart code deletado) | warning | não — banner amarelo "X conditions reference deleted entities — they will evaluate as no-match" |
| `magnitudeGte/Lte` apontando pra code com magnitude não-continuous | error | sim |

**Preview live:** debounced 300ms a cada edit. Reusa cache se predicate idêntico ao último compute (hash do JSON serializado).

## 8. UI — Code Explorer

Em `codebookTreeRenderer.ts`, antes da árvore de regulares, renderiza seção "Smart Codes":

```
▾ ⚡ Smart Codes (3)
   ⚡ Frustração de juniores              47  [eye]
   ⚡ Tradição × biomedicina (RQ2)        12  [eye]
   ⚡ Códigos não-codificados em PDFs      0  [eye]
   [+ New smart code]
─────────────────────────────────────
▾ Codes
   ...árvore de regulares (folders + codes)
```

Header colapsável (`collapsed: boolean` em estado per-view). Count na seção: "X" se nenhum hidden, "X / Y" (visíveis / total) se algum hidden.

Cada row:
- `⚡` ícone fixo + nome + count de matches + eye toggle (hidden)
- Count enquanto cache está dirty+computing: render `…` placeholder no lugar do número (não bloqueia render do row).
- Click no nome → navega pro Smart Code Detail
- Right-click → context menu: Edit predicate / Rename / Recolor / Edit memo / Hide / Delete
- Sem drag (nada aceita smart code como drop target)

`[+ New smart code]` abre builder modal em modo create.

Smart codes não entram em `buildFlatTree` (que retorna FlatCodeNode | FlatFolderNode). Render é separado, sem virtualização (assume <100 smart codes — se ficar problema, vira virtualização aditiva depois).

## 9. UI — Smart Code Detail

`detailSmartCodeRenderer.ts` espelha `detailCodeRenderer.ts`:

```
⚡ Frustração de juniores
Color: ●   Memo: [textarea inline auto-save 500ms]

PREDICATE
  AND
    • Code is "frustração"
    • Case var "seniority" = "junior"
    • Magnitude of "frustração" ≥ 3
  [Edit predicate]              ← único, abaixo da árvore

MATCHES (47)
  📄 P01 — interview transcript                       (8)
     › "estou frustrada com o processo..."  → click navega
     › ...
  📄 P02 — interview transcript                       (5)
  ...

[Delete smart code]
```

Match list reusa `virtualList.ts` (já usado em `detailCodeRenderer` pra markers list). Agrupamento por file segue mesmo padrão. Excerpt resolution: `getMarkerText(ref)` por engine (já existe).

Memo editor: textarea inline com debounced 500ms + suspendRefresh/resumeRefresh (mesmo pattern do code memo, #25).

Sem botão "Add marker" (smart code não é aplicável). Sem seção Hierarchy (parents/children — não se aplica). Sem seção Groups (não se aplica). Sem seção Relations (não se aplica).

**Loading state:** quando cache está dirty+computing pra esse smart code, header mostra "MATCHES (calculating…)" e match list mostra placeholder "Computing matches… X/Y markers scanned" com progress baseado em chunked compute. Match list previa (cached anterior) fica visível atrás de um overlay translúcido se houver — evita flash de tela vazia.

## 10. Analytics integration

**Data layer (`src/analytics/data/dataReader.ts`):**

```ts
function getCodeDimensions(data, registry, smartCodeCache): CodeDimension[]
```

Retorna union de regulares + smart codes. `CodeDimension = { id, name, color, isSmart: boolean, getMatches(): MarkerRef[] }`. Smart codes resolvem `getMatches()` via `cache.getMatches(id)`. Regulares mantêm pipeline atual.

**Modes que aceitam smart codes:**

Frequency, evolution, co-occurrence, group-by-code, sequential, codeMetadata, memoView (memos de smart codes via novo `kind`).

Modes que **não** aceitam (smart codes ficam fora):

- `relationsNetwork` — relações são entre regulares
- `codebookTimeline` — audit log de regulares (smart codes têm seu próprio stream, fora deste mode)

**Filter chips no config panel:** `renderCodesFilter` ganha sub-seção "Smart Codes" com chips ⚡ separados dos regulares. Mesmo toggle on/off.

**FilterConfig:** smart code ids compartilham o mesmo array `codeIds: string[]` da `FilterConfig` existente — diferenciados pelo prefixo `sc_*` (regulares são `c_*`). `applyFilters` faz dispatch interno: id começando com `sc_` resolve via `cache.getMatches(id)` e usa o set de markerRefs dos matches; id começando com `c_` mantém o pipeline atual (markers que aplicam o code). `buildFilterConfig` não precisa mudança de shape; só ganha um helper `partitionByPrefix(codeIds)` no caller que monta o config.

**Loading state em modes:** quando filter ou dimension inclui smart code com cache dirty, render do mode mostra "Computing smart codes…" overlay até cache resolver. Charts não re-renderizam até resolved (evita flicker de empty → full).

## 11. Sidebar adapters

Cada engine sidebar adapter (audio, video, csv, image, pdf, markdown) já lista códigos aplicados ao file corrente. Extensão:

- Após a lista de códigos regulares, renderiza "Smart Codes (N)" se algum smart code tem ≥1 match no file.
- Cada row: `⚡ name (count)` + click vai pro próximo match no file (igual click num código regular).
- Loading state: row mostra "⚡ name (…)" enquanto cache está dirty+computing pra esse smart code.
- Sem "remove from marker" (não está aplicado).

**Visibility per-doc:** smart code segue mesmo padrão (`visibilityOverrides[fileId][smartCodeId]`). Eye toggle no popover compartilhado de visibilidade. **Migrators (`migrateFilePathForOverrides`, `clearFilePathForOverrides`, `cleanOverridesAfterGlobalChange`) não precisam mudança** — operam por string key sem assumir lookup em `registry.definitions`. Auditável trivialmente: nenhum desses helpers chama `registry.get(codeId)`. Spec confirma: zero mudança nos migrators.

## 12. Edge cases (matriz)

| Caso | Comportamento |
|---|---|
| Code referenciado é deletado | Leaf vira "broken" no editor. Smart code continua avaliando (outras leaves OK). Editor mostra warning row "Code 'X' was deleted — this condition will never match". Usuário pode remover/substituir. |
| Code referenciado é mergeado | Auto-rewrite via `executeMerge`: leaf `hasCode(sourceId)` → `hasCode(targetId)`. Audit log do smart code: entry `auto_rewritten_on_merge`. |
| Code renamed | Zero impacto (id estável). Builder mostra novo nome em re-render. |
| Case var deletada | Leaf vira broken, mesmo padrão. |
| Folder/group deletado | Leaf `inFolder/inGroup` vira broken. |
| Smart code referenciado é deletado | Leaf `smartCode` vira broken. Cascata: smart codes que dependiam recomputam. |
| Predicate vazio (após user remover todas leaves) | Builder bloqueia save. |
| Smart code com 0 matches | Renderiza normal "0 matches". Sem warning (estado válido). |
| Cycle introduzido em edit | Save bloqueado, banner "Circular reference: A → B → A". |
| File deletado | Index updates incrementais; cache invalida só smart codes cujos matches incluíam o file. |
| File renamed | `fileId` é estável (path) — atualizado via mesmo migrator de `visibilityOverrides`. |
| Marker mudou de fileId (rename de file) | Index `byFile` atualizado pelo migrator. |

## 13. Audit log integration (#29)

**Schema extension obrigatória.** Hoje `BaseAuditEntry` (em `src/core/types.ts:214-223`) é `{ id, codeId, at, hidden? }` e `AuditEntry` é discriminated union por `type` apenas, sem `entity`. Spec estende:

```ts
// types.ts — extensão aditiva
interface BaseAuditEntry {
  id: string;
  /** Polimórfico: codeId pra entity='code' (default), smartCodeId pra entity='smartCode'. */
  codeId: string;
  at: number;
  hidden?: true;
  /** Discriminator de entidade. Ausente = 'code' implícito (entries existentes seguem válidas). */
  entity?: 'code' | 'smartCode';
}

export type AuditEntry =
  // Code entries (existentes — entity='code' ou ausente)
  | (BaseAuditEntry & { type: 'created' })
  | (BaseAuditEntry & { type: 'renamed'; from: string; to: string })
  | (BaseAuditEntry & { type: 'description_edited'; from: string; to: string })
  | (BaseAuditEntry & { type: 'memo_edited'; from: string; to: string })
  | (BaseAuditEntry & { type: 'absorbed'; absorbedNames: string[]; absorbedIds: string[] })
  | (BaseAuditEntry & { type: 'merged_into'; intoId: string; intoName: string })
  | (BaseAuditEntry & { type: 'deleted' })
  // Smart code entries (novos — entity='smartCode' obrigatório, codeId carrega smartCodeId)
  | (BaseAuditEntry & { entity: 'smartCode'; type: 'sc_created' })
  | (BaseAuditEntry & { entity: 'smartCode'; type: 'sc_predicate_edited'; addedLeafKinds: string[]; removedLeafKinds: string[]; changedLeafCount: number })
  | (BaseAuditEntry & { entity: 'smartCode'; type: 'sc_memo_edited'; from: string; to: string })
  | (BaseAuditEntry & { entity: 'smartCode'; type: 'sc_auto_rewritten_on_merge'; sourceCodeId: string; targetCodeId: string })
  | (BaseAuditEntry & { entity: 'smartCode'; type: 'sc_deleted' });
```

Naming convention `sc_*` no `type` evita colisão com types de code (já que filtramos por `entity` mas type também precisa ser único pra renderEntryMarkdown distinguir). `codeId` polimórfico mantém shape leve (sem `smartCodeId` adicional).

**`appendEntry` helper:** recebe entry + coalescing window. Spec: novo overload aceita entries com `entity: 'smartCode'` — coalescing 60s aplica em `sc_predicate_edited` e `sc_memo_edited` (mesma janela do code `description_edited`/`memo_edited`).

**Eventos emitidos:**

| Type | Quando | Coalescing |
|---|---|---|
| `sc_created` | createSmartCode | — |
| `sc_predicate_edited` | updateSmartCode com predicate change | 60s |
| `sc_memo_edited` | setSmartCodeMemo | 60s |
| `sc_auto_rewritten_on_merge` | executeMerge afeta refs | — |
| `sc_deleted` | deleteSmartCode | — |

`color_changed`/`renamed` propositalmente fora (cosmético; `description_edited` não existe — smart codes não têm description).

**Smart Code Detail history section** filtra `auditLog.filter(e => e.entity === 'smartCode' && e.codeId === smartCodeId)`. Renderização reusa `renderEntryMarkdown` que ganha switch case pros novos types.

**Code Detail history section** filtra `auditLog.filter(e => (e.entity ?? 'code') === 'code' && e.codeId === codeId)`. Default-when-missing preserva entries antigas como 'code'.

**Codebook Timeline mode (#31) — single source of truth.** Smart code events **entram** na timeline existente (decisão final, supera qualquer ambiguidade em §19). Implementação:

- `EventTypeFilter` (em `codebookTimelineEngine.ts:15`) **não** ganha 7º bucket — tipos de smart code **mapeiam pros buckets existentes** via `EVENT_TYPE_TO_FILTER` extension: `sc_created → 'created'`, `sc_predicate_edited → 'edited'`, `sc_memo_edited → 'edited'`, `sc_auto_rewritten_on_merge → 'edited'`, `sc_deleted → 'deleted'`.
- Render: bullet do entry usa ícone `⚡` em vez de `•` quando `entity === 'smartCode'`. Cor segue o bucket (mesma paleta `EVENT_COLORS`). Sem 7ª cor.
- Config panel da timeline ganha checkbox extra "Include smart code events" (default on). Quando off, filtra `entity !== 'smartCode'`.
- `bucketByGranularity` e `buildTimelineEvents` aceitam entries de qualquer entity sem mudança estrutural — só o renderer distingue visualmente.
- **`EVENT_TYPE_TO_FILTER` extension obrigatória** (em `src/analytics/data/codebookTimelineEngine.ts:17`): hoje tipado `Record<AuditEntry['type'], EventTypeFilter>`. Adicionar os 5 sc_* keys no literal: `sc_created → 'created'`, `sc_predicate_edited → 'edited'`, `sc_memo_edited → 'edited'`, `sc_auto_rewritten_on_merge → 'edited'`, `sc_deleted → 'deleted'`. TS força exhaustiveness; faltar uma key quebra build.

## 14. Export QDPX

```xml
<Project xmlns="urn:QDA-XML:project:1.0" xmlns:qualia="urn:qualia-coding:extensions:1.0">
  <CodeBook>
    <Codes> ... </Codes>
    <Sets> ... </Sets>  <!-- Code Groups -->
  </CodeBook>

  <qualia:SmartCodes>
    <qualia:SmartCode guid="sc_..." name="Frustração de juniores" color="#abcdef">
      <qualia:Predicate><![CDATA[
        {"op":"AND","children":[
          {"kind":"hasCode","codeId":"c_..."},
          {"kind":"caseVarEquals","variable":"seniority","value":"junior"},
          {"kind":"magnitudeGte","codeId":"c_...","n":3}
        ]}
      ]]></qualia:Predicate>
      <qualia:Memo>Justificativa metodológica...</qualia:Memo>
    </qualia:SmartCode>
  </qualia:SmartCodes>

  <Sources> ... </Sources>
</Project>
```

Elementos exportados dentro de cada `<qualia:SmartCode>`: `<qualia:Predicate>` (sempre, JSON serializado em CDATA) + `<qualia:Memo>` (opcional, omitido se memo vazio). Atributos: `guid`, `name`, `color` sempre presentes. Namespace `qualia:` consistente — não mistura com elementos REFI-QDA padrão (`<MemoText>`, `<Description>`).

**Toggle "Materialize smart codes as Sets" no export modal:** quando ligado, gera adicionalmente um `<Set>` REFI-QDA padrão por smart code, com `<MemberCode targetGUID="...">` listando os códigos referenciados (não os matches — os códigos do predicate). Outros tools veem como group.

## 15. Export CSV tabular

`smart_codes.csv`:

```
id,name,color,predicate_json,memo,matches_at_export
sc_abc,Frustração de juniores,#abcdef,"{""op"":""AND"",...}",Justificativa...,47
```

`predicate_json` escapado RFC 4180. `matches_at_export` é snapshot no momento do export.

README ganha seção "smart_codes.csv" com snippets:

```r
library(jsonlite)
smart_codes <- read.csv("smart_codes.csv", stringsAsFactors=FALSE)
smart_codes$predicate <- lapply(smart_codes$predicate_json, fromJSON)
```

```python
import json, pandas as pd
sc = pd.read_csv("smart_codes.csv")
sc["predicate"] = sc["predicate_json"].apply(json.loads)
```

## 16. Import QDPX

`qdpxImporter.parseSmartCodes(xml, idMap)`:

1. Parse `<qualia:SmartCodes>` (regex-based pure function como `parseSetsFromXml`). Extrai elements: predicate JSON (CDATA), memo opcional (`<qualia:Memo>`), atributos `guid/name/color`.
2. **Pass 1 (allocate):** itera todos `<qualia:SmartCode>` e cria `SmartCodeDefinition` placeholder com `predicate: { op: 'AND', children: [] }` (vazio temporário) + memo + name + color. Registra `idMap.smartCodes.set(oldGuid, newId)`. Isso garante que pass 2 pode resolver `smartCode` leaf refs entre smart codes do mesmo import. **Shape do `idMap.smartCodes`:** `Map<string, string>`, sibling de `idMap.codes`/`idMap.sources`/`idMap.selections` na `GuidResolver` existente em `src/import/qdpxImporter.ts:105` — mesma convenção, zero shape novo.
3. **Pass 2 (resolve):** itera novamente, faz `JSON.parse(predicate)`, walk no AST e re-mapeia refs via `idMap` (que já mantém oldGuid → newId pra codes/sets/folders/cases/smartCodes):
   - `hasCode.codeId` → idMap.codes
   - `inFolder.folderId` → idMap.folders
   - `inGroup.groupId` → idMap.groups
   - `magnitudeGte/Lte.codeId` → idMap.codes
   - `relationExists.codeId/targetCodeId` → idMap.codes
   - `smartCode.smartCodeId` → idMap.smartCodes (populated em pass 1)
   - `caseVarEquals/Range.variable` → mantém literal (case vars têm names estáveis)
4. Atualiza `SmartCodeDefinition.predicate` com AST resolvido.
5. Refs sem match no idMap viram leaves "broken" + entrada no import report ("X smart codes have broken references — Y leaves preserved as broken stubs"). Broken stubs preservam shape original (codeId antigo) pra debug; evaluator trata como always-false.

**Por que 2-pass:** smart code A pode referenciar smart code B no mesmo arquivo QDPX. Pass 1 garante que ambos existem em `idMap.smartCodes` antes de qualquer resolve de leaf `smartCode`. Topological sort seria alternativa, mas 2-pass é mais simples e zero overhead em arquivo típico (<100 smart codes).

`qdpxImporter` chama `parseSmartCodes` **após** parseSets/parseCases (smart codes podem referenciar grupos e case vars), em pass dedicado.

Round-trip Qualia→Qualia: bit-idêntico (modulo idMap remap, que é determinístico — IDs novos mas estrutura preservada). Test fixture cobre AST de 9 leaves variadas + nesting de 2 smart codes referenciando-se mutuamente.

## 17. Testing strategy

**Unit (puros, jsdom dispensável):**

- `evaluator.test.ts` — todas as 10 leaves × shapes de marker de cada engine (markdown, pdf, image, audio, video, csv segment, csv row). Cobre AND/OR/NOT combinatorial, short-circuit, NOT aninhado, deeply nested.
- `dependencyExtractor.test.ts` — predicates variados produzem dep sets corretos.
- `predicateNormalizer.test.ts` — reorder mantém semântica (eval pré e pós são iguais em N fixtures).
- `predicateValidator.test.ts` — vazio, broken refs, cycles.
- `predicateSerializer.test.ts` — round-trip JSON estável.
- `cache.test.ts` — invalidate scenarios: mutate code → smart code afetado recomputa, smart code não-afetado mantém cache. Cascata via smart code nesting.
- `matcher.test.ts` — collectMatches em fixture multi-engine.
- Auto-rewrite on merge.
- Cycle detection runtime + build-time.

**Integration (jsdom):**

- Round-trip QDPX: smart code com predicate de 9 leaves variadas + nesting → export → import → bit-idêntico.
- Round-trip CSV: parse → assert valores.
- Builder modal: add/remove/reorder leaves, change operator, save válido, save bloqueado em vazio/cycle.

**Stress (CI obrigatório):**

`stress.test.ts` gera fixture programática:

- 1000 codes
- 10 case variables × 5 valores cada
- 10000 markers (distribuição variada por engine, 1-5 codes por marker, 30% com magnitude)
- 100 smart codes (predicates variados, 30% com nesting até 4 níveis)

Asserts (mecanismo: `performance.now()` deltas dentro de `it()` blocks regulares no vitest, com **2x headroom** sobre os targets locais pra absorver variance do CI Linux runner — ex: target local <500ms vira assert `<1000ms` no CI). Sem bench framework separado; tudo roda em `npm run test` padrão. Targets locais (sem headroom) são tracking goals em `docs/perf-baseline.md`.

- Cold rebuildIndexes — local <500ms / CI <1000ms
- Cold compute de smart code novo (cache miss) — local <500ms / CI <1000ms
- Cached read — local <5ms / CI <10ms
- Single-marker mutation invalidate + recompute afetados — local <50ms / CI <100ms

**Memory footprint** não é assertable confiável em jsdom. Substituído por garantia estrutural testável: `cache.indexByCode.values()` retorna `Set<MarkerRef>` com refs apontando pros mesmos objetos de `data.{engine}.markers` (não clones). Test verifica via `===` (referential identity) em fixture pequeno.

Falha de qualquer assert temporal = blocker pra merge.

**Smoke manual (obrigatório por CLAUDE.md):**

Vault real workbench: criar 5 smart codes via builder (predicates de complexidade crescente, incluindo 1 com nesting de smart code), validar:

- Count em Code Explorer bate com count em Smart Code Detail
- Count em sidebar de cada engine bate com matches do file
- Filter no Analytics retorna mesmos markers
- Edit predicate atualiza tudo em <1s
- Delete code referenciado mostra warning correto no editor
- Merge code referenciado auto-rewriteia
- Export QDPX + import QDPX em vault novo preserva tudo

## 18. Performance targets (CI gates)

Todos asserts via `performance.now()` em vitest com **2x headroom** sobre target local pra CI variance. Mecanismo descrito em §17.

| Operação | Local | CI assert | Falha = |
|---|---|---|---|
| `rebuildIndexes` (10k markers) | <500ms | <1000ms | blocker merge |
| Cold compute smart code novo (predicate típico) | <500ms | <1000ms | blocker merge |
| Cached read `getMatches` | <5ms | <10ms | blocker merge |
| `getCount` (cached) | <1ms | <2ms | blocker merge |
| Single-marker mutation invalidate + recompute | <50ms | <100ms | blocker merge |
| Builder preview live (debounce + compute) | <300ms p95 | <600ms p95 | blocker merge |
| QDPX round-trip de smart code complexo | <100ms | <200ms | blocker merge |
| Cache structural: indexByCode refs ===  data.markers refs | exact | exact | blocker merge |

## 19. Non-goals (escopo fechado)

- Smart code aplicável a marker (viola conceito).
- Smart code em folder ou group.
- Smart code com relations/description.
- Smart code participa de relations de outros codes.
- Multi-select bulk operations em smart codes (sem demanda).
- LLM NL→predicate (ATLAS.ti "AI Smart Coding"). Extensão futura aditiva.
- Drag de smart code (sem target válido).
- Per-code opacity blending de smart code no CM6 markdown editor (render só sidebar/Analytics).
- Smart code em Codebook Timeline com seu próprio mode separado. **Decisão final em §13:** smart code events entram na timeline existente, mapeados pros buckets created/edited/deleted, distinguidos visualmente por ícone `⚡` (sem 7ª cor). Toggle "Include smart code events" no config panel.
- Smart code visível no coding popover de marker (filtrado out).
- Web Worker pro evaluator (premature; aditivo se stress test apontar).

## 20. Quebra em sessões (estimativa)

| Sessão | Escopo | Estimativa | Notas |
|---|---|---|---|
| 1 | Schema (§3) + evaluator (§5) + dependencyExtractor + serializer + validator + audit log type extension (§13) | 1 sessão | Tudo testável puro. Foundation; unit tests cobrem todas leaves × marker shapes. |
| 2 | Cache (§6) + indexes + invalidation listeners + stress test fixture | 1 sessão | Wire em main.ts mas sem UI ainda. Stress test obrigatório (§17/§18). |
| 3 | Builder modal (§7) + Smart Code Detail (§9) + Code Explorer section (§8) | 1-2 sessões | UI maior do ciclo. Smoke test manual obrigatório no fim. |
| 4 | Analytics integration (§10) + sidebar adapters (§11) + visibility per-doc + Codebook Timeline integration (§13) | 1 sessão | Wiring em N modes + 6 sidebars. |
| 5 | Export QDPX (§14) + import QDPX (§16) + CSV tabular (§15) + audit log emit em smart code mutations | 1 sessão | Round-trip tests. |

Total: 5 sessões (alinhado ao "4-5 sessões" do ROADMAP — extremo superior).

## 21. Open questions (pra resolver no Plan)

- **`getAllMarkers(data)`** — verificar se já existe helper que itera markers de todos engines. Se não, criar em `src/core/getAllMarkers.ts` (deve ser trivial — já tem barrel re-exports nos models).
- **`AnyMarker` type** — verificar se discriminated union já existe ou se precisa criar. Se sim, reusar; se não, montar como `MarkdownMarker | PdfMarker | ImageMarker | AudioMarker | VideoMarker | CsvSegmentMarker | CsvRowMarker`.
