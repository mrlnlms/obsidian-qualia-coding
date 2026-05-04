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

`MarkerRef = { engine: EngineType; fileId: string; markerId: string }` — tipo leve compartilhado pra resultados de match.

## 4. Arquitetura de módulos

```
src/core/smartCodes/
  types.ts              — re-export PredicateNode, LeafNode, MarkerRef + helpers de discriminação
  evaluator.ts          — evaluate(predicate, marker, ctx) — pura, recursiva, com short-circuit
  matcher.ts            — collectMatches(smartCodeId, data, caseVars) — usa indexes + evaluator
  cache.ts              — SmartCodeCache class (singleton): indexes, matches map, deps map
  dependencyExtractor.ts — extractDependencies(predicate) → Sets de codeIds/caseVarKeys/etc
  predicateNormalizer.ts — reorder children por custo (otimização AND/OR), sem alterar semântica
  predicateValidator.ts — validateForSave(predicate, registry) → ValidationResult (broken refs, cycles, vazio)
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

```ts
function evaluate(
  predicate: PredicateNode,
  marker: AnyMarker,
  ctx: EvaluatorContext
): boolean {
  switch (predicate.op ?? predicate.kind) {
    case 'AND': return predicate.children.every(c => evaluate(c, marker, ctx));
    case 'OR':  return predicate.children.some(c => evaluate(c, marker, ctx));
    case 'NOT': return !evaluate(predicate.child, marker, ctx);
    case 'hasCode': return hasCode(marker, predicate.codeId);
    case 'caseVarEquals': return ctx.caseVars.get(marker.fileId, predicate.variable) === predicate.value;
    case 'caseVarRange': return inRange(ctx.caseVars.get(marker.fileId, predicate.variable), predicate);
    case 'magnitudeGte': return (getMagnitude(marker, predicate.codeId) ?? 0) >= predicate.n;
    case 'magnitudeLte': return (getMagnitude(marker, predicate.codeId) ?? Infinity) <= predicate.n;
    case 'inFolder': return ctx.codesInFolder(predicate.folderId).some(cId => hasCode(marker, cId));
    case 'inGroup':  return ctx.codesInGroup(predicate.groupId).some(cId => hasCode(marker, cId));
    case 'engineType': return marker.__engine === predicate.engine;
    case 'relationExists': return checkRelation(marker, predicate, ctx);
    case 'smartCode': return evaluateNested(predicate.smartCodeId, marker, ctx);
  }
}
```

`evaluateNested` checa `ctx.evaluating.has(targetSmartId)` (cycle), retorna false se hit. Senão entra em recursão com `evaluating` clonado + `targetSmartId` adicionado.

`AND`/`OR` consomem children em ordem `predicateNormalizer` (cheap-first heuristic): `engineType` < `inFolder` < `inGroup` < `hasCode` < `caseVarEquals` < `caseVarRange` < `magnitudeGte/Lte` < `relationExists` < `smartCode`.

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
  invalidateForMarker(engine, fileId, codeIds: string[]): void;
  invalidateForFolder(folderId: string): void;
  invalidateForGroup(groupId: string): void;
  invalidateAll(): void;
  invalidate(smartCodeId: string): void;  // single (cascata via deps grafo)
  getMatches(smartCodeId): MarkerRef[];
  getCount(smartCodeId): number;
  subscribe(fn): () => void;  // returns unsubscriber
}
```

**Singleton** injetado no plugin (`plugin.smartCodeCache`). Persiste só em memória.

**Index updates incrementais:** modelos emitem eventos quando markers mudam. Listener compartilhado em `main.ts`:

- `addCodeApplication(marker, codeId)` → `indexByCode.get(codeId).add(ref)` + `cache.invalidateForCode(codeId)`
- `removeCodeApplication(marker, codeId)` → remove do index + invalida
- `addMarker(engine, fileId, marker)` → adiciona ao `indexByFile` + invalida codes do marker
- `removeMarker` → remove tudo + invalida codes que estavam aplicados

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

**Validation:** save bloqueado se predicate vazio. Save habilitado com warning se há broken refs (banner amarelo "X conditions reference deleted entities — they will evaluate as no-match"). Save bloqueado vermelho se cycle detected.

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

Header colapsável (`collapsed: boolean` em estado per-view). Count "(3)" mostra quantos smart codes existem (visíveis após hidden filter).

Cada row:
- `⚡` ícone fixo + nome + count de matches + eye toggle (hidden)
- Click no nome → navega pro Smart Code Detail
- Right-click → context menu: Edit predicate / Rename / Recolor / Edit memo / Hide / Delete
- Sem drag (nada aceita smart code como drop target)

`[+ New smart code]` abre builder modal em modo create.

Smart codes não entram em `buildFlatTree` (que retorna FlatCodeNode | FlatFolderNode). Render é separado, sem virtualização (assume <100 smart codes — se ficar problema, vira virtualização aditiva depois).

## 9. UI — Smart Code Detail

`detailSmartCodeRenderer.ts` espelha `detailCodeRenderer.ts`:

```
⚡ Frustração de juniores                          [Edit predicate]
Color: ●   Memo: [textarea inline auto-save 500ms]

PREDICATE
  AND
    • Code is "frustração"
    • Case var "seniority" = "junior"
    • Magnitude of "frustração" ≥ 3
  [Edit predicate]

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

**FilterConfig:** `applyFilters` aceita smart code id como filter. Quando código de filter é smart, resolve via `cache.getMatches(id)` e usa o set de fileIds desses matches no filter em vez do "files que têm esse código".

## 11. Sidebar adapters

Cada engine sidebar adapter (audio, video, csv, image, pdf, markdown) já lista códigos aplicados ao file corrente. Extensão:

- Após a lista de códigos regulares, renderiza "Smart Codes (N)" se algum smart code tem ≥1 match no file.
- Cada row: `⚡ name (count)` + click vai pro próximo match no file (igual click num código regular).
- Sem "remove from marker" (não está aplicado).

Visibility per-doc: smart code segue mesmo padrão (`visibilityOverrides[fileId][smartCodeId]`). Eye toggle no popover compartilhado de visibilidade.

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

Smart codes têm seu próprio audit stream em `data.auditLog` mas com `entity: 'smartCode'` (vs `entity: 'code'` existente). Eventos:

- `smart_code_created`
- `predicate_edited` (com diff resumido — leaves added/removed/changed)
- `memo_edited` (coalescing 60s)
- `auto_rewritten_on_merge` (quando code referenciado é mergeado)
- `deleted`

Mesma infra de `auditLog.ts` (helpers `appendEntry`, `renderEntryMarkdown`). Coalescing 60s em `predicate_edited` e `memo_edited`.

Code Detail audit history mostra só eventos de regulares. Smart Code Detail terá sua própria seção History (mesma renderização, filtrada por `entity: 'smartCode' AND smartCodeId: id`).

Codebook Timeline mode (#31) inclui eventos de smart codes? **Decisão:** sim, mas com cor distinta (paleta `EVENT_COLORS` ganha uma 7ª cor pra `smart_code_*`). Filter chip "Smart codes" no config panel da timeline.

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
      <MemoText>Justificativa metodológica...</MemoText>
    </qualia:SmartCode>
  </qualia:SmartCodes>

  <Sources> ... </Sources>
</Project>
```

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

1. Parse `<qualia:SmartCodes>` (regex-based pure function como `parseSetsFromXml`).
2. Para cada `<qualia:SmartCode>`, deserializa `<qualia:Predicate>` (JSON.parse).
3. Walk no AST e re-mapeia refs via `idMap` (que já mantém oldGuid → newId pra codes/sets/etc):
   - `hasCode.codeId` → idMap.codes
   - `inFolder.folderId` → idMap.folders
   - `inGroup.groupId` → idMap.groups
   - `magnitudeGte/Lte.codeId` → idMap.codes
   - `relationExists.codeId/targetCodeId` → idMap.codes
   - `smartCode.smartCodeId` → idMap.smartCodes
   - `caseVarEquals/Range.variable` → mantém literal (case vars têm names estáveis)
4. Refs sem match no idMap viram leaves "broken" + entrada no import report ("X smart codes have broken references").

`qdpxImporter` ganha pass adicional **após** Sets/Cases (smart codes podem referenciar tudo isso).

Round-trip Qualia→Qualia: bit-idêntico (modulo idMap remap, que é determinístico).

## 17. Testing strategy

**Unit (puros, jsdom dispensável):**

- `evaluator.test.ts` — matriz de leaves × marker shapes (PDF marker, image marker, csv row marker, etc.). Cobre AND/OR/NOT combinatorial, short-circuit, NOT vazio, deeply nested.
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

Asserts:

- Cold rebuildIndexes <500ms
- Cold compute de smart code novo (cache miss) <500ms
- Cached read <5ms
- Single-marker mutation invalidate + recompute afetados <50ms
- Memory footprint do cache <50MB

Falha do stress test = blocker pra merge.

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

| Operação | Target | Falha = |
|---|---|---|
| `rebuildIndexes` (10k markers) | <500ms | blocker merge |
| Cold compute smart code novo (predicate típico) | <500ms | blocker merge |
| Cached read `getMatches` | <5ms | blocker merge |
| `getCount` (cached) | <1ms | blocker merge |
| Single-marker mutation invalidate + recompute | <50ms | blocker merge |
| Builder preview live (debounce + compute) | <300ms p95 | blocker merge |
| Cache memory (10k markers + 100 smart codes) | <50MB | warning, investigar |
| QDPX round-trip de smart code complexo | <100ms | blocker merge |

## 19. Non-goals (escopo fechado)

- Smart code aplicável a marker (viola conceito).
- Smart code em folder ou group.
- Smart code com relations/description.
- Smart code participa de relations de outros codes.
- Multi-select bulk operations em smart codes (sem demanda).
- LLM NL→predicate (ATLAS.ti "AI Smart Coding"). Extensão futura aditiva.
- Drag de smart code (sem target válido).
- Per-code opacity blending de smart code no CM6 markdown editor (render só sidebar/Analytics).
- Smart code em Codebook Timeline com seu próprio mode separado (entra junto com a stream existente, com cor distinta).
- Smart code visível no coding popover de marker (filtrado out).
- Web Worker pro evaluator (premature; aditivo se stress test apontar).

## 20. Quebra em sessões (estimativa)

| # | Escopo | Sessão | Notas |
|---|---|---|---|
| 1 | Schema + evaluator + dependencyExtractor + serializer + validator (puros) + 100% unit tests | 1 | Tudo testável em jsdom. Foundation. |
| 2 | Cache + indexes + invalidation listeners + stress test fixtures | 1 | Wire em main.ts mas sem UI ainda. Stress test é parte deste. |
| 3 | Builder modal + Smart Code Detail + Code Explorer section | 1-2 | UI maior. Smoke test manual obrigatório no fim. |
| 4 | Analytics integration + sidebar adapters + visibility per-doc | 1 | Wiring em N modes. |
| 5 | Export QDPX + import QDPX + CSV tabular + audit log integration | 1 | Round-trip tests. |

Total: 4-5 sessões alinhado ao ROADMAP.

## 21. Open questions (pra resolver no Plan)

- **`getAllMarkers(data)`** — verificar se já existe helper que itera markers de todos engines. Se não, criar em `src/core/getAllMarkers.ts` (nem deve ser difícil — já tem barrel re-exports nos models).
- **`AnyMarker` type** — verificar se discriminated union já existe ou se precisa criar.
- **`__engine` field em markers** — não existe hoje. `engineType` leaf precisa do engine resolvable a partir do marker. Opções: (a) adicionar `__engine` ao marker no momento de carregar (hidratação), (b) o `MarkerRef` já carrega `engine`, então o evaluator recebe ref com engine separado em vez de marker puro. **Recomendação:** (b) — evaluator opera em `MarkerRef + AnyMarker resolvido`, sem mudar shape persistido.
- **Magnitude config inverso (`magnitudeLte`)** — magnitude é continuous range pickers. Verificar se faz sentido `≤` em todos casos (ex: continuous decimal já cobre, mas categorical com strings ordenadas?).
- **Smart code count na seção do Code Explorer** — a count "(3)" é total ou só visíveis (após hidden filter)? **Decisão:** mostra "X / Y" (visíveis / total) se há hidden, senão só "X".
