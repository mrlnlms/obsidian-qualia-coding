# Analytic Memo View — design

**Date:** 2026-04-27
**Topic:** Analytic Memo View (consumer da feature #25 Memos em todas entidades)
**Roadmap:** §3 Analytics — melhorias
**Status:** Spec aprovada via brainstorm — pronta pra plan

---

## Sumário

Novo modo `"memo-view"` no `MODE_REGISTRY` do Analytics que agrega e renderiza todos os memos do projeto (code, group, relation, marker) em uma view unificada de leitura analítica. Permite leitura em massa pra escrever análise narrativa, com edição inline (hub editorial) e export pra CSV ou Markdown formatado.

A feature consome `memo?: string` em `CodeDefinition`, `GroupDefinition`, `CodeRelation`, `BaseMarker` — todos já implementados via #25 (mergeada em `1f1d3bb`).

Blueprint: `codeMetadataMode.ts` (#24, mergeado no mesmo dia) — mesmo pattern de mode declarativo, função pura de agregação, registro em `MODE_REGISTRY`.

---

## 1. Objetivo

**Uso primário:** leitura analítica em massa pra escrever análise narrativa (paper, relatório, sessão de análise). O usuário senta, abre Memo View, lê todos os memos agrupados por código (espelho do codebook), copia trechos pra escrever fora ou exporta como markdown.

**Não-objetivos:**
- Não é triagem (B na pergunta 1) — não tem "marcar pra retomar".
- Não é auditoria de codificação (C na pergunta 1) — embora coverage stats no banner deem sinal de cobertura, não é o foco.
- Não tem busca textual full-text (lookup de palavra dentro de memos). Pode virar follow-up; não é o uso primário.
- Não cria notas Obsidian a partir de memos ("Convert to Note" descartado em #25).

---

## 2. Decisões travadas no brainstorm

| # | Decisão | Por quê |
|---|---------|---------|
| 1 | Uso primário = leitura analítica em massa | Pergunta 1 → A |
| 2 | Pivô principal = código; toggle "by file" | Pergunta 2 → D |
| 3 | Só entidades com memo + contador de cobertura | Pergunta 3 → C |
| 4 | Edição inline em todos os 4 tipos (hub editorial) | Pergunta 4 → C |
| 5 | Mode dentro do Analytics (não ItemView dedicada) | Pergunta 5 → A |
| 6 | Hierarquia indentada espelhando codebook | Pergunta 6 → B |
| 7 | Filtros = todos do Analytics + checkboxes "memo type" | Pergunta 7 → C |
| 8 | Export = CSV + Markdown | Pergunta 7 → Z |
| 9 | Render strategy inicial = collapse por código com threshold (5/10/25/all) | Pergunta 8 → B inicial; user prefere C (virtual scroll) como alvo final, mas não amarra agora — revisitar no plan se B virar dor |
| 10 | Label do mode dropdown = `"Memo View"` | Confirmado pós-section 1 |

---

## 3. Arquitetura

### 3.1 Módulos novos

```
src/analytics/
  data/
    memoView.ts                       — função pura aggregateMemos
  views/modes/
    memoView/
      memoViewMode.ts                 — orchestrator (~150 LOC): render + options + export
      renderCodeSection.ts            — renderiza CodeMemoSection (header + memos + markers + filhos)
      renderFileSection.ts            — renderiza FileMemoSection (toggle by-file)
      renderMemoEditor.ts             — textarea inline com debounced save + suspendRefresh
      renderMarkerCard.ts             — excerpt + memo editor + source chip clicável
      renderCoverageBanner.ts         — banner topo
      memoViewOptions.ts              — config panel (showTypes + groupBy + markerLimit)
      exportMemoCSV.ts                — CSV export (colunas tabulares)
      exportMemoMarkdown.ts           — Markdown export (formatado pra Obsidian)
```

Razão da subpasta `memoView/`: 8 arquivos pequenos é melhor que 1 arquivo grande monolítico. Outros modes em arquivo único quando small (`textRetrievalMode.ts`, `dashboardMode.ts`); modes complexos como `relationsNetworkMode.ts` já têm helper file (`relationsNetworkHelpers.ts`). Memo View tem renderização suficientemente complexa pra justificar split.

### 3.2 Registros adicionais

**`analyticsViewContext.ts`** — adiciona estado:

```typescript
mvGroupBy: "code" | "file";
mvShowTypes: { code: boolean; group: boolean; relation: boolean; marker: boolean };
mvMarkerLimit: 5 | 10 | 25 | "all";
```

Defaults: `groupBy="code"`, todos os 4 showTypes `true`, `markerLimit=10`.

Persiste em settings (`Plugin.saveData`) igual outros campos do view context (`cmVariable`, `cmDisplay`, etc).

**`dataTypes.ts`** — adiciona tipos `MemoViewFilters`, `MemoEntry`, `CodeMemoSection`, `FileMemoSection`, `MemoViewResult`, `CoverageStats` (definidos em §5).

**`MODE_REGISTRY`** — entry:

```typescript
"memo-view": {
  label: "Memo View",
  render: renderMemoView,
  renderOptions: renderMemoViewOptions,
  exportCSV: exportMemoCSV,
  // exportMarkdown handled by separate toolbar button — see §6.2
},
```

### 3.3 Dependências

- **Raw markers:** chamar `readAllData(plugin.dataManager)` direto no render (não usa `ctx.data`). `ctx.data` é `ConsolidatedData | null` — agregação consolidada do pipeline normal. Memo View precisa de `AllEngineData` raw (markers individuais com memo), igual `relationsEngine.ts` faz. Re-leitura por render é ok (volume baixo).
- `ctx.plugin.registry: CodeDefinitionRegistry` — code/group/relation memos. **Nome correto é `registry`** (verificado em `src/analytics/index.ts:21`), não `codeRegistry`.
- `ctx.plugin.caseVariablesRegistry: CaseVariablesRegistry` — usado só pra filtro case variable (não pra render direto).
- Filtros do Analytics existentes (`source filter`, `code filter`, `code group filter`, `case variable filter`) — reusados via `buildFilterConfig`.

### 3.4 Sem cache

Re-agrega a cada render. Performance dominada por DOM (especialmente render de marker memos), não pela agregação. Igual `calculateCodeMetadata`.

---

## 4. Render strategy (decisão #9)

**Default inicial (B):** collapse por código com `markerLimit` controlável.

- Code com ≤ `markerLimit` markers: todos visíveis.
- Code com > `markerLimit` markers: mostra `markerLimit` primeiros + botão `"Show N more (X remaining)"`. Click expande inline.
- Estado de expansão é por sessão (não persiste). Re-render volta pro default.
- `markerLimit="all"` desabilita o collapse.

**Roteiro pra C (virtual scroll) se B virar dor:**

Mesmo aggregate function (`aggregateMemos`). Nova render strategy substitui `renderCodeSection.ts` por virtual scroll igual `codebookTreeRenderer.ts` (já tem pattern interno). Edição inline preservada via re-attach handler no render visible. Trabalho concentrado em `memoViewMode.ts` + componente virtual; aggregate intocado.

Decisão de migrar pra C fica pro plan/execução conforme dor real (>500 marker memos no DOM, scroll travado).

---

## 5. Tipos e função de agregação

### 5.1 Tipos (em `dataTypes.ts`)

```typescript
export interface MemoViewFilters extends FilterConfig {
  showTypes: { code: boolean; group: boolean; relation: boolean; marker: boolean };
  groupBy: "code" | "file";
  markerLimit: 5 | 10 | 25 | "all"; // NOTA: aggregate ignora; render usa
}

export interface CoverageStats {
  codesWithMemo: number;
  codesTotal: number;
  groupsWithMemo: number;
  groupsTotal: number;
  relationsWithMemo: number;
  relationsTotal: number;
  markersWithMemo: number;
  markersTotal: number; // só markers que sobrevivem aos filtros não-showTypes
}

// Discriminated union — uma entry por memo
export type MemoEntry =
  | {
      kind: "code";
      codeId: string;
      codeName: string;
      color: string;
      memo: string;
      depth: number;
    }
  | {
      kind: "group";
      groupId: string;
      groupName: string;
      color: string;
      memo: string;
    }
  | {
      kind: "relation";
      codeId: string; // sempre o source da relação
      label: string;
      targetId: string;
      targetName: string;
      directed: boolean;
      memo: string;
      level: "code" | "application";
      markerId?: string; // só quando level === "application"
    }
  | {
      kind: "marker";
      markerId: string;
      codeId: string; // primeiro código aplicado (ou — se múltiplos — qualquer um; ver §5.3 nota 4)
      fileId: string;
      sourceType: EngineType;
      excerpt: string;
      memo: string;
      magnitude?: string | number;
    };

export interface CodeMemoSection {
  codeId: string;
  codeName: string;
  color: string;
  depth: number;
  groupIds: string[]; // chips no header
  codeMemo: string | null;
  groupMemos: MemoEntry[]; // kind="group", só dos groups que esse código pertence
  relationMemos: MemoEntry[]; // kind="relation", code-level + application-level desse código
  markerMemos: MemoEntry[]; // kind="marker", markers desse código com memo
  childIds: string[]; // refs aos filhos (usados na hierarquia visual flat)
  hasAnyMemoInSubtree: boolean; // pra esconder pais sem memo + sem subtree
}

export interface FileMemoSection {
  fileId: string;
  sourceType: EngineType;
  fileName: string;
  markerMemos: MemoEntry[]; // só markers do arquivo com memo
  codeIdsUsed: string[]; // chips dos códigos com memo aplicados ali
}

export interface MemoViewResult {
  groupBy: "code" | "file";
  byCode?: CodeMemoSection[]; // ordem do buildFlatTree (codes flat com depth)
  byFile?: FileMemoSection[]; // ordem alfabética por fileName
  coverage: CoverageStats;
}
```

### 5.2 Função pura

```typescript
// data/memoView.ts
export function aggregateMemos(
  allData: AllEngineData,
  registry: CodeDefinitionRegistry,
  filters: MemoViewFilters,
): MemoViewResult;
```

### 5.3 Algoritmo

1. **Carregar raw data:** `allData = readAllData(plugin.dataManager)` no início do render. Não usa `ctx.data` (consolidado).
2. **Aplicar filtros não-`showTypes`** em markers via `applyFilters(allData, filters)` — helper compartilhado de `statsHelpers.ts`. Resultado: `filteredMarkers`. (Implementação: gera lista flat de todos os markers de todos engines, anotando `engineType` por marker; `applyFilters` aplica source/code/group/case-variable filter.)
3. **Calcular `coverage`** — totais antes do filtro de `showTypes`:
   - `codesTotal` = `registry.getAllCodes().length`
   - `codesWithMemo` = códigos com `memo?.trim()` não vazio
   - `groupsTotal` = `registry.getAllGroups().length`
   - `groupsWithMemo` = groups com `memo?.trim()` não vazio
   - `relationsTotal` = soma de `code.relations.length` em todos códigos + soma de `marker.codes[i].relations.length` em todos `filteredMarkers` (code-level + app-level)
   - `relationsWithMemo` = subset com `memo?.trim()` não vazio
   - `markersTotal` = `filteredMarkers.length`
   - `markersWithMemo` = subset de `filteredMarkers` com `memo?.trim()` não vazio
4. **Se `groupBy === "code"`:**
   1. `flatTree = buildFlatTree(registry, expandedState)` — onde `expandedState` é `{ codes: new Set(allCodeIds), folders: new Set(allFolderIds) }` (todos expandidos, pra Memo View não respeitar collapse do codebook). Ordem hierárquica.
   2. Pra cada `node` em `flatTree` com `node.type === 'code'`:
      - Acessos corretos: `node.def.id`, `node.def.name`, `node.def.color`, `node.def.memo`, `node.def.relations`, `node.depth`. (NB: `FlatCodeNode` expõe `def: CodeDefinition`, não fields flat — verificado em `src/core/hierarchyHelpers.ts:11`.)
      - `codeMemo` = `node.def.memo?.trim()` se não vazio, senão `null`.
      - `groupMemos` = mapeia `registry.getGroupsForCode(node.def.id)` → cada `GroupDefinition` que tem `memo?.trim()` não vazio.
      - `relationMemos` =
        - code-level: `node.def.relations.filter(r => r.memo?.trim())` → `MemoEntry` com `level="code"`.
        - application-level: itera `filteredMarkers` que aplicam `node.def.id` (ver decisão (iv) abaixo), pra cada `marker.codes[i]` com `codeId === node.def.id` e `relations[j].memo?.trim()` → `MemoEntry` com `level="application"`, `markerId`.
      - `markerMemos` = `filteredMarkers` que aplicam `node.def.id` (decisão (iv)) e têm `memo?.trim()` não vazio.
      - `childIds` = ids dos códigos filhos imediatos (do flat tree, próximos nodes com `depth = node.depth + 1` e parent matching).
   3. Computar `hasAnyMemoInSubtree` via DFS bottom-up: true se o node tem qualquer memo OU algum descendente tem.
   4. Aplicar `showTypes`: pra cada section, zera arrays correspondentes (e `codeMemo = null`) se `showTypes[kind] === false`.
   5. **Filtrar sections vazias**: inclui `CodeMemoSection` se tem ≥1 memo ativo (após showTypes) OU `hasAnyMemoInSubtree === true` (pra preservar contexto de hierarquia, decisão (ii)).
5. **Se `groupBy === "file"`:**
   1. Agrupa `filteredMarkers` por `fileId`.
   2. Pra cada arquivo: `markerMemos` = markers com memo (após `showTypes.marker`).
   3. `codeIdsUsed` = `marker.codes[i].codeId` únicos dos markers do arquivo (sem dedup por memo — esse é só pros chips).
   4. **Filtrar sections vazias**: só inclui se `markerMemos.length > 0`.

**Notas:**

1. **Decisão (i) — relations application-level incluídas:** schema-ready desde #25 (`CodeApplication.relations.memo`). Memo View vira a primeira surface app-level via ✎ inline.
2. **Decisão (ii) — pai sem memo + filho com memo:** renderiza header colapsado (nome + groups + indentação) pra preservar contexto de hierarquia.
3. **Decisão (iii) — `markersTotal` filtrado:** coerente com o que aparece na tela.
4. **Decisão (iv) — marker em múltiplos códigos:** se `marker.codes` tem N entries e ≥1 sobrevive ao `code filter`, marker aparece UMA vez sob a **primeira entry de `marker.codes[]` que sobreviver** (`marker.codes.find(c => filterAccepts(c.codeId))?.codeId`). Sem duplicação. Em `groupBy="file"`, `codeIdsUsed` reúne todos os surviving (não só o primeiro) — pra dar visão completa do arquivo. Trade-off: simples e determinístico; perde-se a informação de que marker está em múltiplos códigos no view by-code, mas marker memo não é por-código (é por-marker).

---

## 6. UI

### 6.1 Layout (groupBy="code")

```
┌─ Coverage banner ────────────────────────────────────────────────┐
│ 23/47 codes · 4/8 groups · 12/30 relations · 156/420 markers     │
└──────────────────────────────────────────────────────────────────┘
┌─ Section: code "Stress at work" (depth=0) ───────────────────────┐
│ ●  Stress at work     [Group: Wellbeing]  [Group: Burnout]       │
│                                                                   │
│ Code memo:                                                        │
│ ┌─ textarea (autosize, debounced save) ──────────────────────┐   │
│ │ Reflexão sobre o conceito de stress no trabalho...         │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│ Group memos:                                                      │
│   ▸ Wellbeing — textarea inline                                   │
│   ▸ Burnout — textarea inline                                     │
│                                                                   │
│ Relations:                                                        │
│   → causes "Burnout" (code-level) — textarea inline               │
│   → cooccurs "Anxiety" (app-level, P01.pdf) — textarea inline     │
│                                                                   │
│ Marker memos (24, showing 10):                                    │
│   ┌ (P01.md · md) "...trecho codificado..." ─────────────────┐   │
│   │ marker memo textarea inline                              │   │
│   └──────────────────────────────────────────────────────────┘   │
│   ... (10 visíveis)                                               │
│   [Show 14 more]                                                  │
│                                                                   │
│   ╔═ child "Acute stress" (depth=1, indented) ═════════════════╗ │
│   ║ ... mesmo layout indentado ...                              ║ │
│   ╚════════════════════════════════════════════════════════════╝ │
└──────────────────────────────────────────────────────────────────┘
```

**Indentação CSS:** `padding-left: min(depth * 16px, 80px)` na seção. Cap em 5 níveis.

**Layout (groupBy="file"):**

```
┌─ Coverage banner ─────┐
└───────────────────────┘
┌─ File: P01.md (md) ──────────────────────────────────────────────┐
│ Codes used (with memo): [Stress] [Burnout] [Anxiety]              │
│ Marker memos (8):                                                 │
│   ... cards iguais ao layout by-code ...                          │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Toolbar / botões

- Mode dropdown ganha entry `"Memo View"`.
- Toolbar do Analytics já tem botão "Export CSV" — usa `exportCSV` registrado.
- **Novo botão "Export Markdown"** — adicionado no toolbar quando `viewMode === "memo-view"`. Não generaliza pros outros modes; é específico desta view. Implementação: switch no `analyticsView.ts` perto do botão "Export CSV" — só renderiza se `MODE_REGISTRY[mode]` for memo-view (ou via flag `exportMarkdown?: ModeEntry["exportCSV"]` no registry — preferível, mantém pattern declarativo).

**Decisão final:** estende `ModeEntry` com `exportMarkdown?: (ctx, date) => void` opcional. Toolbar renderiza o botão se função existir. Padrão declarativo preservado.

```typescript
export type ModeEntry = {
  label: string;
  render: ...;
  renderOptions?: ...;
  exportCSV?: ...;
  exportMarkdown?: (ctx: AnalyticsViewContext, date: string) => void;
  canExport?: boolean;
};
```

### 6.3 Edição inline — pattern compartilhado

```typescript
// renderMemoEditor.ts
export function renderMemoEditor(
  parent: HTMLElement,
  initial: string,
  onSave: (value: string) => void,
  ctx: AnalyticsViewContext,
): HTMLTextAreaElement {
  const textarea = parent.createEl("textarea", { cls: "memo-view-editor" });
  textarea.value = initial;
  let timeout: number | null = null;

  textarea.addEventListener("input", () => {
    if (timeout) window.clearTimeout(timeout);
    ctx.suspendRefresh();
    timeout = window.setTimeout(() => {
      onSave(textarea.value);
      ctx.resumeRefresh();
      timeout = null;
    }, 500);
  });
  textarea.addEventListener("blur", () => {
    if (timeout) {
      window.clearTimeout(timeout);
      onSave(textarea.value);
      ctx.resumeRefresh();
      timeout = null;
    }
  });

  return textarea;
}
```

**Pré-requisito (verificado em `analyticsViewContext.ts:115-120`):** `ctx.suspendRefresh`/`ctx.resumeRefresh` **não existem hoje**. Adicionar como parte do checkpoint 5a (não 5b). Implementação:

- Novo campo private em `AnalyticsView`: `refreshSuspendedCount: number = 0`.
- Novos métodos em `AnalyticsViewContext`: `suspendRefresh(): void` (incrementa) e `resumeRefresh(): void` (decrementa, com clamp a 0).
- `scheduleUpdate()` checa `if (this.refreshSuspendedCount > 0) return;` antes de agendar.
- Listener `onMutate` do registry e do dataManager continuam disparando `scheduleUpdate` — só fica no-op enquanto suspended. Próximo edit/blur completa save → `resumeRefresh()` → próximo `scheduleUpdate` roda.

Risco: outro mode chamando `scheduleUpdate` durante typing em Memo View seria silenciado. Aceitável (enquanto edita memo, view não re-renderiza — é o comportamento desejado). Test: durante typing em Memo View, mutação simulada não dispara render; ao blur, render dispara uma vez.

### 6.4 onSave por kind

**Decisão (travada na spec, não punted):** estende `DataManager` com lookup genérico de marker + helpers em `codeApplicationHelpers.ts`. Mutação acontece in-place no objeto retornado; `dataManager.markDirty()` agenda o flush. Este é o pattern já usado em CSS de menus que escrevem `marker.memo = value` direto (ex: `pdfCodingMenu.ts:98`, `imageCodingMenu.ts:65`) — formaliza o pattern numa API central.

**Novas APIs em `DataManager`:**

```typescript
// src/core/dataManager.ts (additions)
findMarker(engineType: EngineType, markerId: string): BaseMarker | null;
// ↑ percorre data[engineType].markers (e segmentMarkers/rowMarkers no caso CSV) e retorna referência;
//   null se não encontrar. Mutação acontece no caller.
```

CSV tem `segmentMarkers` + `rowMarkers` — `findMarker('csv', id)` busca em ambos arrays. Tipos retornam `BaseMarker` discriminado (caller pode narrowing depois se precisar mais).

**Novo helper em `codeApplicationHelpers.ts`:**

```typescript
// src/core/codeApplicationHelpers.ts (addition)
export function setApplicationRelationMemo(
  codes: CodeApplication[],
  codeId: string,
  label: string,
  target: string,
  memo: string,
): boolean;
// ↑ encontra primeira tupla matching (codeId, label, target) em codes[i].relations e atualiza memo.
//   Retorna true se achou, false se não — limite mesmo do setRelationMemo code-level (tupla duplicada
//   atualiza só primeira; documentado em #25 spec).
```

**onSave handlers:**

```typescript
function onSaveCodeMemo(ctx: AnalyticsViewContext, codeId: string, value: string) {
  ctx.plugin.registry.update(codeId, { memo: value });
}
function onSaveGroupMemo(ctx: AnalyticsViewContext, groupId: string, value: string) {
  ctx.plugin.registry.setGroupMemo(groupId, value);
}
function onSaveCodeRelationMemo(
  ctx: AnalyticsViewContext, codeId: string, label: string, target: string, value: string,
) {
  ctx.plugin.registry.setRelationMemo(codeId, label, target, value);
}
function onSaveMarkerMemo(
  ctx: AnalyticsViewContext, engineType: EngineType, markerId: string, value: string,
) {
  const marker = ctx.plugin.dataManager.findMarker(engineType, markerId);
  if (!marker) return;
  marker.memo = value;
  ctx.plugin.dataManager.markDirty();
}
function onSaveAppRelationMemo(
  ctx: AnalyticsViewContext, engineType: EngineType, markerId: string,
  codeId: string, label: string, target: string, value: string,
) {
  const marker = ctx.plugin.dataManager.findMarker(engineType, markerId);
  if (!marker) return;
  setApplicationRelationMemo(marker.codes, codeId, label, target, value);
  ctx.plugin.dataManager.markDirty();
}
```

**Por que essa abordagem, não outras consideradas:**

| Opção | Rejeitada porque |
|---|---|
| Adicionar `updateMarker(id, partial)` a cada engine model | 5 engines, assinaturas divergentes (CodeMarkerModel já tem `updateMarkerFields`, mas PDF/Image/Media/CSV não); duplicação |
| Reusar `BaseSidebarAdapter.updateMarkerFields` | Adapters são per-leaf (vinculados a view aberta); não acessíveis centralmente. Memo View precisa funcionar mesmo sem leaf do engine aberta |
| Expor `<engine>Model` em `AnalyticsPluginAPI` + chamar diretamente | Acopla Memo View a 5 modelos com APIs diferentes; cada um faria sua própria persistência |
| `dataManager.findMarker(...)` + mutação in-place + `markDirty` | **Escolhido.** Ponto único de acesso, baixa superfície API, mutação direta segue pattern já existente em menus, persistência centralizada via `markDirty` (debounced 500ms já existente) |

**Side-effect aceito:** mutação in-place do `BaseMarker` retornado por `findMarker` é uma operação direta na fonte de verdade do `data.json`. Adapters/views que tiverem listener do `dataManager` (ou re-render por `onMutate` do registry pra code-level) verão a mudança ao próximo refresh. Marker UI surfaces (sidebar, popover) não escutam mutação direta de `marker.memo` hoje — Memo View também não escuta volta. Aceitável: edição flui Memo View → data.json → próximas leituras pegam. Se virar dor (ex: edita em Memo View enquanto sidebar tá aberta com excerpt antigo), follow-up.

### 6.5 Config panel (`renderMemoViewOptions`)

Sections em ordem:

1. **Group by** (radio): `Code` / `File`.
2. **Show memo types** (4 checkboxes): Code / Group / Relation / Marker.
3. **Marker limit per code** (dropdown): 5 / 10 / 25 / All. (Hidden quando `groupBy === "file"` — não aplica.)
4. **Source filter** — reusa `renderSourcesSection` compartilhada.
5. **Code group filter** — reusa filtro existente.
6. **Code filter** — reusa filtro existente.
7. **Case variable filter** — reusa filtro existente.

Sections 4-7 já são comuns no Analytics; mode usa o helper compartilhado das seções existentes.

---

## 7. Export

### 7.1 CSV (`exportMemoCSV`)

Usa `buildCsv` (`shared/chartHelpers.ts`).

```
Header:
entity_type, entity_id, code_id, code_name, file_id, source_type, level, memo

Rows:
code,        c_123,     c_123,   "Stress",  ,        ,            ,          "Reflexão..."
group,       g_456,     ,        ,          ,        ,            ,          "Wellbeing memo..."
relation,    ,          c_123,   "Stress",  ,        ,            code,       "Causes Burnout..."
relation,    ,          c_123,   "Stress",  m_789,   pdf,         application,"App-level memo..."
marker,      m_789,     c_123,   "Stress",  P01.pdf, pdf,         ,           "Marker memo..."
```

Colunas vazias quando não aplicáveis. Respeita filtros ativos. Aspas duplas no memo escapadas via `buildCsv`. Newlines no memo preservados (pattern do CSV tabular existente).

### 7.2 Markdown (`exportMemoMarkdown`)

Cria arquivo `.md` no vault e abre em nova leaf. Path: `Analytic Memos/YYYY-MM-DD.md`. Se já existir, append timestamp `YYYY-MM-DD-HHmm.md`.

```markdown
# Analytic Memos · 2026-04-27

> **Filters:** Source = pdf, markdown · Code group = "Burnout cluster"
> **Coverage:** 12/47 codes · 156/420 markers · 4/8 groups · 12/30 relations

---

## Stress at work
**Groups:** Wellbeing, Burnout

**Code memo:**
> Reflexão sobre o conceito...

**Group memos:**
- *Wellbeing:* memo...
- *Burnout:* memo...

**Relations:**
- → causes "Burnout" *(code-level)*: memo...
- → cooccurs "Anxiety" *(application-level, [[P01.pdf]])*: memo...

**Marker memos (24):**

- **[[P01.md]]** · markdown
  > "...trecho codificado..."

  *Marker memo:* reflexão sobre esse trecho específico...

- **[[P03.pdf]]** · pdf
  > "...outro trecho..."

  *Marker memo:* ...

### Acute stress *(child of Stress at work)*
...
```

Wikilinks (`[[P01.md]]`) usam `app.metadataCache.fileToLinktext` quando disponível, senão fileId puro.

Excerpt em blockquote pra preservar legibilidade. Memos em texto livre.

Aberto via `app.workspace.getLeaf(true).openFile(file)` (nova tab, não substitui Analytics).

---

## 8. Edge cases

| Caso | Tratamento |
|---|---|
| Nenhum memo em lugar algum | Empty state: "No memos yet. Add memos in Code Detail, Group panel, or marker context to see them here." |
| Filtros eliminam tudo (mas existem memos) | Empty state: "No memos match current filters." |
| Marker excerpt muito longo (>5000 chars) | Trunca pra 500 chars + " …" no DOM. Memo full sempre. (Markdown export: usa excerpt full, sem truncar.) |
| Edit + filter changed mid-edit | `suspendRefresh` segura. Salvar no blur antes de re-render. Estado de scroll perde — aceitável. |
| Marker memo edit em arquivo não-aberto | `dataManager.getModelForEngine(engineType).updateMarker(...)` carrega lazy. Persiste em `data.json` direto. |
| Code deletado durante edição | Listener `onMutate` trigger refresh; se memo do code deletado tava aberto, perdeu — aceitável (não-frequente). |
| Excerpt vazio (selection zero-width — bug histórico de markdown) | Renderiza `(empty excerpt)` em itálico fade. Memo continua editável. |
| Hierarquia profunda (depth > 5) | Limita indentação visual em `depth >= 5` via `padding-left: min(depth * 16px, 80px)`. |
| Code com memo mas sem hierarquia (root) | Renderiza section sem indentação, sem children. Padrão. |
| Relation memo em tupla duplicada | `setRelationMemo` atualiza só a primeira (mesmo limite do `delete` em `baseCodingMenu.ts:585` — documentado em #25 spec). UI mostra todas; só primeira recebe edição. **Side-effect aceitável** dado que duplicatas exatas (label + target) já são caso degenerado. |
| Code com >100 marker memos e `markerLimit="all"` | DOM weight alto. `markerLimit` default = 10 evita por padrão. Se user pediu "all", responsabilidade dele. Trigger pra migrar pra C (virtual scroll). |
| Memos com markdown inline (`**bold**`, `[[link]]`) | Textarea trata como texto cru (sem render). Markdown export preserva. CSV export preserva. Render como markdown formatado fica fora do escopo (textarea editável → preview seria UX híbrida cara). |

---

## 9. Testing

### 9.1 Cobertura de testes

```
src/analytics/data/__tests__/memoView.test.ts                   (~25 tests)
  - aggregateMemos: byCode pivot, hierarquia recursiva, hasAnyMemoInSubtree
  - aggregateMemos: byFile pivot, ordering por fileName
  - showTypes filter zera cada tipo isoladamente
  - showTypes filter combinado (3 desligados, 1 ligado)
  - markerLimit não afeta aggregate (verifica todos markers retornados)
  - coverage stats ignoram showTypes (totais absolutos)
  - coverage.markersTotal respeita filtros não-showTypes
  - relations code-level vs application-level (ambos aparecem com level correto)
  - empty state: zero memos
  - empty state: filtros zeram
  - hierarquia: pai sem memo + filho com memo → pai aparece como contexto
  - hierarquia: pai sem memo + filho sem memo → pai não aparece
  - decisão (iv): marker em múltiplos códigos aparece uma vez sob primeiro código

src/analytics/views/modes/memoView/__tests__/memoViewMode.test.ts  (~15 tests)
  - render banner com coverage
  - render code section com chips de groups
  - render code memo + group memos + relation memos + marker memos
  - empty state quando filtros zeram (UI)
  - empty state inicial (UI)
  - "Show N more" expande markers
  - by-file toggle troca pivot
  - indentação CSS por depth
  - depth > 5 cap

src/analytics/views/modes/memoView/__tests__/memoViewEdit.test.ts  (~12 tests)
  - textarea debounced save chama onSave após 500ms
  - suspendRefresh durante typing, resumeRefresh após save
  - blur com timeout pendente força save
  - blur sem mudança não chama save
  - onSave para code: chama registry.update com { memo }
  - onSave para group: chama registry.setGroupMemo
  - onSave para relation code-level: chama registry.setRelationMemo (tupla)
  - onSave para relation app-level: atualiza CodeApplication.relations[i].memo via helper novo
  - onSave para marker: chama dataManager.getModelForEngine().updateMarker
  - relation tupla duplicada: edita só primeira (smoke do side-effect documentado)

src/analytics/views/modes/memoView/__tests__/exportMemoCSV.test.ts  (~6 tests)
  - colunas, encoding UTF-8 BOM
  - escape de aspas no memo
  - newlines preservados no memo
  - colunas vazias para entidades sem fileId
  - filtros aplicados (não exporta o que tá filtrado)
  - empty result: gera CSV só com header

src/analytics/views/modes/memoView/__tests__/exportMemoMarkdown.test.ts  (~6 tests)
  - estrutura: H1 (title) → H2 (code) → H3 (child)
  - hierarquia indentada via H3/H4 conforme depth
  - group chips no header
  - wikilink pro arquivo
  - excerpt em blockquote
  - filters block no topo

Total estimado: ~64 novos testes. Soma 2307 → ~2371.
```

### 9.2 Smoke obrigatório (CLAUDE.md regra)

Pré-condição: vault `obsidian-plugins-workbench` com:
- ≥ 5 codes (alguns com memo, outros sem)
- ≥ 2 groups (com memo)
- ≥ 3 relations code-level (com memo)
- ≥ 10 markers em ≥ 3 engines (PDF/markdown/csv) com memos variados

Cenários:
1. Abrir Analytics → Memo View → confirmar render correto + coverage banner.
2. Editar code memo inline → blur → re-abrir Code Detail e validar persistência.
3. Editar group memo inline → blur → validar no panel de groups.
4. Editar relation memo inline → blur → validar em Code Detail.
5. Editar marker memo inline → blur → reabrir o source no Obsidian e validar (markdown via comment, PDF via popover, CSV via cell, etc).
6. Toggle "Group by File" → confirmar reagrupamento.
7. Filtro source = só PDF → confirmar que markers não-PDF somem (mas codes/groups/relations seguem).
8. Filtro showTypes = só marker → confirmar que sections só mostram markers.
9. Export CSV → abrir no Excel/numbers → validar colunas + encoding.
10. Export Markdown → arquivo abre em nova leaf → validar formato.
11. Code com 30 markers + memo → "Show 20 more" expande inline.

---

## 10. Fora do escopo (won't-fix nesta entrega)

- Busca textual full-text dentro de memos (ctrl+F do Obsidian funciona no DOM se `markdown export` aberto; suficiente).
- Convert to Note (cria arquivo Obsidian a partir de memo) — descartado em #25.
- Render markdown formatado dentro do textarea (preview híbrida) — caro pra ganho marginal.
- Print/PDF export — markdown export cobre; print do Obsidian funciona em qualquer arquivo.
- Audit/changelog de quem editou memo quando — projeto sem multi-user, sem histórico de edição em outras surfaces.
- Sync entre múltiplas Memo Views abertas em panes separados — seguir pattern padrão de Analytics (cada view re-render via `onMutate`; race condition aceitável dado vault single-user).

---

## 11. Plan checkpoints sugeridos

Pra escrever o plan: chunks naturais (cada um termina em commit + smoke):

1. **Tipos + função pura** — `dataTypes.ts` adições + `data/memoView.ts` + 25 testes em `memoView.test.ts`. Sem UI ainda.
2. **MODE_REGISTRY hookup + render mínimo** — registra mode + renderMemoView render básico (só code memos, sem edição, sem hierarquia). Smoke: aparece no dropdown, abre vazio com coverage banner.
3. **Coverage banner + by-code render full** — code memos + group memos + relation memos + marker memos read-only. Sem edição. Smoke: abre vault com memos, vê tudo.
4. **Hierarquia indentada + collapse "Show N more"** — buildFlatTree integration + markerLimit + indentação. Smoke: hierarquia espelha codebook.
5a. **Infra de edição: suspendRefresh + DataManager.findMarker + setApplicationRelationMemo helper** — adiciona `suspendRefresh`/`resumeRefresh` em `AnalyticsViewContext` (com counter `refreshSuspendedCount`; `scheduleUpdate` no-op enquanto > 0); adiciona `findMarker(engineType, markerId)` em `DataManager`; adiciona `setApplicationRelationMemo(codes, codeId, label, target, memo)` em `codeApplicationHelpers.ts`. Testes unitários pra cada. Sem UI ainda. Risco isolado: outros modes do Analytics não devem quebrar — verificar `scheduleUpdate` continua funcionando quando counter = 0.
5b. **Edição inline UI (renderMemoEditor + onSave por kind)** — usa infra de 5a. `renderMemoEditor` debounced 500ms + suspend/resume. `onSave` handlers por kind (code/group/relation code-level/relation app-level/marker). Smoke: edita cada um dos 5 tipos (4 + app-level relation), persiste, re-abre, valida.
6. **Toggle by-file** — `groupBy="file"` + render alternativo. Smoke: troca pivô.
7. **Filtros (config panel completo)** — showTypes checkboxes + reuso source/group/code/case variable filters. Smoke: cada filtro cobre cenário.
8. **Export CSV** — `exportMemoCSV` registrado em ModeEntry. Smoke: CSV abre em Excel.
9. **Export Markdown** — extende `ModeEntry` com `exportMarkdown` opcional + toolbar conditional + arquivo aberto em nova leaf. Smoke: arquivo formatado.
10. **Edge cases pass + final smoke** — empty states, depth cap, excerpt truncate, relation tupla duplicada side-effect documentado em comment. Smoke completo cobrindo todos os 11 cenários do §9.2.

---

## 12. Atualização de docs (pós-merge)

Conforme `CLAUDE.md` §"Atualizacao de docs apos feature/fase":

- **`ROADMAP.md`** — riscar "Analytic Memo View" no §3 + data.
- **`ARCHITECTURE.md`** — novo módulo `analytics/data/memoView.ts` + `analytics/views/modes/memoView/`.
- **`TECHNICAL-PATTERNS.md`** — pattern `renderMemoEditor` (debounced + suspend) se virar reusable. ModeEntry com `exportMarkdown` adicional.
- **`DEVELOPMENT.md`** — só se adicionarmos novo command (provavelmente não, mode é selecionado via dropdown).
- **`BACKLOG.md`** — registrar render strategy C (virtual scroll) como follow-up se threshold de pain acontecer.
- **`CLAUDE.md`** (gitignored) — atualizar contagem de testes + adicionar paths novos na estrutura.
