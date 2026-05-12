# CSV row marker — cross-coder por cell

**Data:** 2026-05-12
**Engine afetado:** CSV (`src/csv/`)
**Áreas tocadas:** model, popover menu, cell renderer, view (active coder subscription)
**Schema:** sem mudança

---

## 1. Problema

Hoje o `RowMarker` tem o campo `codedBy: CoderId` e o registry ICR já é capaz de tratar múltiplos markers por cell (`categoricalKappaInput.extractRowMarkerUnit` produz 1 unit por marker com `coderId`). Compare Coders view também já desenha stripes per-coder via `compareModeColoring.computeRowGradient`.

Apesar disso, a UI de criação/edição/leitura opera em modo "primeiro marker da cell vence":

- `csvCodingModel.findOrCreateRowMarker(file, row, column)` (linha 250) localiza o marker existente **sem filtrar por coder**.
- `csvCodingMenu.ts` (6 sites em linhas 36, 42, 65, 70, 78, 82) usa `getRowMarkersForCell(...)[0]` — primeiro elemento da lista, agnóstico de coder.
- `csvCodingModel.getCodesForCell` (linha 486) — read-path real do chip renderer — chama `getRowMarkersForCell` (linha 489) e retorna união de codes de todos os markers da cell.
- `csvCodingCellRenderer.ts` (linhas 43-44, 68, 97) consome `getCodesForCell` para chips e `getRowMarkersForCell` para click handlers.
- `csvCodingModel.getCellComment` (linha 97) — leitura do comment — também agnóstica de coder.

**Sintoma observável:** Coder2 ao codificar uma cell já marcada por Coder1 acaba mutando o marker de Coder1 ao invés de criar o seu próprio. Cell renderer mistura visualmente codes e comment de coders diferentes como se pertencessem ao active coder.

## 2. Cenários de uso a atender

1. **ICR formal**: 2+ coders codificam o mesmo CSV em sessões separadas. Cada coder edita sempre o seu próprio marker. Comparação posterior via Compare Coders.
2. **LLM-assisted**: LLM (`codedBy='llm:<model>'`) gera markers preliminares. Humano revisa criando markers paralelos (não mutando os do LLM). LLM é equivalente arquitetural a "outro coder".
3. **Reconciliation**: após compare, gera marker com `codedBy='consensus:<id>'` que coexiste com os individuais. Fluxo já implementado em `icrMarkerOpsImpl.createCsvRowMarker`.
4. **Solo coding (99% do uso)**: 1 coder humano. Comportamento idêntico ao atual após a correção.

## 3. Decisão de modelo

**Modelo escolhido**: `1 RowMarker por (fileId, sourceRowId, column, codedBy)`.

Não é mudança de schema — é a interpretação correta do schema já existente. Alternativa rejeitada: `codedByList[]` num único marker compartilhado. Motivos da rejeição:

- Perde granularidade por coder (qual code cada coder aplicou?). ICR precisa desagregar artificialmente.
- Reconciliation precisa criar marker novo de qualquer forma.
- Merge de codes via union destrói histórico individual.
- Incompatível com paridade arquitetural com `SegmentMarker`, `MarkdownMarker`, `ImageMarker`, `PdfMarker` — todos com 1 marker por (geometria, coder).

**Read-path fora compare mode**: filtra por active coder (decisão "A" do brainstorm).

Motivo: cell row, diferente de span markdown, não tem como sobrepor visualmente sem stripe. Compare mode já estria. Fora compare, a cell mostra só o trabalho do active coder — paridade conceitual com text/image ("seu trabalho na sua tela"). Para inspecionar trabalho alheio, o canal é Compare Coders view.

**`comment` field**: per-marker (decisão "CO-1" do brainstorm).

Cada coder tem o próprio comment associado ao próprio marker. Comment shared cross-coder é refactor futuro se aparecer demanda real — não entra neste slice.

## 4. Invariante

> Em qualquer instante, existe no máximo 1 `RowMarker` por tupla `(fileId, sourceRowId, column, codedBy)`.

Markers com mesma tupla `(fileId, sourceRowId, column)` mas `codedBy` distintos podem coexistir e representam contribuições independentes de coders distintos.

Markers legados sem `codedBy` (existentes em vaults criados antes do Slice 5 ICR) são tratados como `'human:default'` via defensive `?? 'human:default'` em todos os filtros. **Não há migration in-place** — o valor é apenas inferido em runtime, evitando dirty-write em `data.json`. `DEFAULT_CODER_ID` está definido em `src/core/icr/coderTypes.ts`.

## 5. Write-path — mudanças

### 5.1 `csvCodingModel.ts`

**`findOrCreateRowMarker(file, sourceRowId, column)`** (linha 250) — assinatura mantida, lookup passa a filtrar por active coder:

```ts
const activeCoder = this.plugin.getActiveCoderId();
const existing = this.rowMarkers.find(m =>
  m.fileId === file && m.sourceRowId === sourceRowId && m.column === column
  && (m.codedBy ?? 'human:default') === activeCoder
);
```

**`setCellComment(file, sourceRowId, column, value)`** (linha 102) — mesmo filtro no lookup interno (linha 104). Coder2 escrevendo comment em cell marcada por Coder1 cria novo RowMarker com `codes:[], comment, codedBy:Coder2`. Garbage collection per-marker (linha 139, marker sem codes E sem comment é removido) continua funcionando sem ajuste.

**`getRowMarkersForCell(file, row, column)`** (linha 246) — **mantém** semântica atual (retorna todos os markers da cell, agnóstico de coder). É a API que ICR e compare mode consomem.

**Novo helper `getRowMarkerForActiveCoder(file, row, column)`** — retorna `RowMarker | undefined`, encapsula o filtro por active coder. Consumido pelo menu, pelo chip renderer (via `getCodesForCell`) e pelo comment column.

### 5.2 Batch operations e queries (mudanças por site)

`csvCodingModel.ts`, batch e queries que iteram em `this.rowMarkers`:

- **`buildRowMarkerIndex(file, column)`** (linha 276): passa a filtrar por active coder. Índice agora é "markers do active coder por row".
- **`removeAllRowMarkersFromMany(file, sourceRowIds, column)`** (linha 358): filtra `this.rowMarkers` diretamente (não usa `buildRowMarkerIndex`). Adicionar `&& (m.codedBy ?? 'human:default') === activeCoder` nos dois filters (linhas 363 e 374-376). Batch só atua nos markers do active.
- **`getCodeIntersectionForRows(file, sourceRowIds, column)`** (linha 388): filtra por active coder no loop (linha 391). Coerente com batch ops — "active" só faz sentido contra os próprios markers.

### 5.3 `csvCodingMenu.ts`

Os 6 sites de `getRowMarkersForCell(...)[0]` (linhas 36, 42, 65, 70, 78, 82) são substituídos por `getRowMarkerForActiveCoder(...)`. Sem mudança de fluxo lógico — apenas correção do lookup.

`getMarker = () => findOrCreateRowMarker(...)` (linha 35) fica automaticamente correto pela mudança em 5.1.

**`existingMarker` e `isHoverMode`** (linhas 36-37) — variáveis capturadas no início do popover, reusadas em `deleteAction.onDelete` (linha 115) e no flag `isHoverMode` (linha 37, controla affordance do popover). Pela mudança em 5.3, ambas passam a refletir só o marker do active coder. **Mudança de UX intencional**: abrir popover em cell onde só coder alheio tem marker passa a mostrar modo "create" (sem chips populados, sem botão "Remove All Codes"), porque pro active coder a cell está vazia.

### 5.4 `insertMarkerRaw` (canal de reconciliation/import)

Sem mudança. Recebe marker com `codedBy` já preenchido (consensus, llm, outro humano). Canal correto para criar markers em nome de outro coder. Aceita o invariante porque caller é responsável por garantir unicidade da tupla.

## 6. Read-path — mudanças

### 6.1 `csvCodingModel.getCodesForCell` (linha 486)

Read-path real do chip renderer. Hoje delega a `getRowMarkersForCell` (linha 489) e retorna união de codes. Passa a delegar a `getRowMarkerForActiveCoder`:

```ts
// antes
const markers = type === 'segment'
  ? this.getSegmentMarkersForCell(file, sourceRowId, column)
  : this.getRowMarkersForCell(file, sourceRowId, column);

// depois (apenas no branch 'row')
const markers = type === 'segment'
  ? this.getSegmentMarkersForCell(file, sourceRowId, column)
  : (() => {
      const m = this.getRowMarkerForActiveCoder(file, sourceRowId, column);
      return m ? [m] : [];
    })();
```

**SegmentMarker não muda**: cada segment tem geometria distinta + coder, a "união" por (cell, segment) já corresponde ao trabalho de um único coder por segment. (Validar em smoke: cell com 2 coders criando segments sobrepostos exibe chips de ambos — isso é desejável ou não? Pergunta aberta em §7.)

### 6.2 `csvCodingModel.getCellComment` (linha 97)

Passa a filtrar por active coder:

```ts
// antes
const m = this.rowMarkers.find(m =>
  m.fileId === file && m.sourceRowId === sourceRowId && m.column === column);

// depois
const activeCoder = this.plugin.getActiveCoderId();
const m = this.rowMarkers.find(m =>
  m.fileId === file && m.sourceRowId === sourceRowId && m.column === column
  && (m.codedBy ?? 'human:default') === activeCoder
);
```

Coder2 vê o próprio comment, não o de Coder1. Coerente com decisão CO-1.

### 6.3 `csvCodingCellRenderer.ts`

Sites de click handler em linhas 68 e 97 (chips click → detail navigation; X-button → delete) usam `getRowMarkersForCell`. Substituir por `getRowMarkerForActiveCoder` — click no chip opera no marker do active.

### 6.4 `csvCodingView.ts` (compare mode)

Sem mudança. `compareModeContext` (linhas 621-642) já consome `markerIndex.get(key)` retornando todos os markers da cell. Compare mode permanece exatamente como hoje.

### 6.5 Active coder subscription (NOVO)

`csvCodingView.ts` passa a se inscrever em `plugin.onActiveCoderChange(...)` (definido em `main.ts:1076`). Handler dispara `gridApi.refreshCells({ force: true })`. Sem isso, troca de active coder via TopBarCoderPicker / statusBar **não** atualiza a grade — usuário muda o active mas continua vendo codes do anterior até próximo refresh espontâneo.

Unsubscribe no `onClose` do view (paridade com listeners existentes do model).

## 7. Casos de borda e decisões deferred

### 7.1 Casos cobertos

| Caso | Comportamento esperado | Mudança necessária |
|---|---|---|
| Delete code (ripple) | Remove `codeId` de todos os markers, independente de coder. Marker vazio entra em GC per-marker. | Nenhuma — atua code-level. |
| Merge codes | `codes[]` de cada marker é rewriteado independentemente. Smart code auto-rewrite atua na predicate, não no marker. | Nenhuma. |
| Reconciliation | Cria marker `codedBy='consensus:<id>'` que coexiste. | Nenhuma — `icrMarkerOpsImpl.createCsvRowMarker` já recebe `codedBy` no spec. |
| Active coder switch | Cell renderer rebuilda via `onActiveCoderChange` listener (§6.5). | Sim — listener novo em `csvCodingView`. |
| QDPX export/import | Cada marker exporta o próprio `codedBy`. Import 2-pass aloca markers per-coder. | Nenhuma. |
| Parquet enriched export | Coluna `codedBy` já presente. | Nenhuma. |
| Markers legados sem `codedBy` | Tratados como `'human:default'` em runtime. | Defensive `??` no filtro. |

### 7.2 Decisões intencionais: APIs mantidas agnósticas de coder

- **`getRowMarkersForCell`** (linha 246): mantém retorno de todos os markers da cell. ICR (`categoricalKappaInput`), compare mode (`compareModeContext`) e reconciliation (`icrMarkerOpsImpl.findMarkersInRegion`) dependem dessa semântica.
- **`getAllMarkers`** e iteração para audit/codebook export: mantêm semântica atual.

### 7.3 Decisão deferred: SegmentMarker per-coder no renderer

`getCodesForCell` no branch `'segment'` continua agregando segments de todos os coders (paridade com modelo markdown — spans sobrepostos coexistem visualmente sem stripe). Smoke test deve confirmar UX aceitável. Se aparecer regressão, ajustar em slice posterior — fora deste escopo.

## 8. Out of scope

- **Comment shared cross-coder** (alternativa rejeitada CO-2 do brainstorm): refactor futuro se demandar. Comment continua per-marker.
- **Affordance visual de "trabalho alheio existe" fora compare mode**: Compare Coders é o canal único de visualização cross-coder. Sem badge na cell.
- **Migration in-place de `codedBy` em markers legados**: defensive `??` cobre, sem dirty-write em `data.json`.
- **Mudanças em `SegmentMarker`**: key inclui geometria (from/to) + coder, colisão por tupla idêntica é impossível para spans. Read-path de segments mantém agregação cross-coder (§7.3).
- **`TopBarCoderPicker` / `activeCoderStatusBar` UI**: já existem e funcionam. Mudança neste slice é o lado consumidor (view subscribe).

## 9. Testing strategy

### 9.1 Contract tests (Vitest + jsdom)

`tests/engine-models/csvCodingModel.crossCoder.test.ts` (novo):

1. `findOrCreateRowMarker` retorna marker do active coder quando cell tem markers de múltiplos coders.
2. `findOrCreateRowMarker` cria marker novo (não muta alheio) quando active coder não tem marker mas outro coder tem.
3. `setCellComment` cria marker novo do active coder quando alheio já tem comment na cell.
4. `getCellComment` retorna comment do active coder, ignora alheio.
5. `getCodesForCell` (branch `'row'`) retorna codes do marker do active coder, ignora codes de alheios.
6. `addCodeToManyRowMarkers` opera apenas em markers do active coder.
7. `removeAllRowMarkersFromMany` deleta apenas markers do active coder.
8. `getCodeIntersectionForRows` calcula intersect apenas sobre markers do active coder.
9. Marker legado sem `codedBy` é tratado como `'human:default'` (defensive `??`) — válido em find/get/intersect.

`tests/engine-models/csvCodingModel.invariant.test.ts` (novo):

10. Após qualquer sequência de operações create/edit, `rowMarkers` não contém 2 markers com mesma tupla `(file, row, column, codedBy)`. Verificação reforçada: contagem de markers por triple `(file, row, column)` é igual à contagem de `codedBy` distintos para esse triple.

### 9.2 Tests pré-existentes

`tests/engine-models/csvCodingModel.test.ts` usa fixture single-coder (`getActiveCoderId: () => "human:default"`). Não exercita semântica multi-coder, logo **não precisa recalibração**. Os novos tests cobrem a lacuna. Se algum test pré-existente falhar pós-mudança, parar e investigar — pode ser regressão imprevista.

### 9.3 Smoke test no Obsidian real (TOP PRIORITY §1)

Vault: `/Users/mosx/Desktop/obsidian-plugins-workbench/`.

Cenário mínimo:

1. Active `'human:default'`. Abrir CSV de teste. Marcar cell A1 com código X. Adicionar comment "default comment" via cell comment input.
2. Settings → criar coder `'human:bob'`. Ativar bob (via TopBarCoderPicker ou statusBar).
3. Verificar imediatamente (sem reload): grade re-renderiza, cell A1 aparece **vazia** (sem código X, sem comment).
4. Marcar cell A1 com código Y. Adicionar comment "bob comment". Cell A1 exibe Y + comment "bob".
5. Trocar active de volta para default. Cell A1 exibe X + comment "default".
6. Abrir Compare Coders view com ambos coders no scope. Cell A1 deve mostrar stripes (X em uma stripe, Y em outra).
7. Como bob, abrir popover na cell A1 — deve aparecer em modo "create" (sem botão "Remove All Codes" via affordance, porque pro bob a cell tem o marker dele com Y, mas a affordance é só pra modo "tem marker"... ajustar critério com captura do estado).
8. Inspeção em `data.json`: 2 RowMarkers distintos para cell A1, um por coder, sem mutation cruzada.

Critério de "passou": comportamentos 3-6 e 8 batem. Item 7 documenta estado observado (não bloqueia).

## 10. Arquivos afetados (consolidado)

**Mudança de código:**
- `src/csv/csvCodingModel.ts` — ~10 sites:
  - `findOrCreateRowMarker` (linha 250) — filtro
  - `setCellComment` lookup (linha 104) — filtro
  - `getCellComment` (linha 97) — filtro
  - `getCodesForCell` branch `'row'` (linhas 486-489) — filtro
  - `buildRowMarkerIndex` (linha 276) — filtro
  - `removeAllRowMarkersFromMany` (linha 358) — 2 filters internos
  - `getCodeIntersectionForRows` (linha 388) — filtro no loop
  - Novo helper `getRowMarkerForActiveCoder`
- `src/csv/csvCodingMenu.ts` — 6 substituições `getRowMarkersForCell(...)[0]` → `getRowMarkerForActiveCoder(...)` (linhas 36, 42, 65, 70, 78, 82).
- `src/csv/csvCodingCellRenderer.ts` — 2 sites click handler (linhas 68, 97).
- `src/csv/csvCodingView.ts` — subscribe a `plugin.onActiveCoderChange` no setup do view, unsubscribe no close.

**Tests novos:**
- `tests/engine-models/csvCodingModel.crossCoder.test.ts` — 9 cases.
- `tests/engine-models/csvCodingModel.invariant.test.ts` — 1 case com verificação reforçada.

**Não afetados:** schema (`csvCodingTypes.ts`), QDPX export/import, Parquet enriched export, ICR (`categoricalKappaInput`, `kappaWorkerClient`), compare mode (`compareModeColoring`, `csvCodingView.compareModeContext`), reconciliation (`icrMarkerOpsImpl`), settings UI, command palette, `SegmentMarker` (lookup e read).
