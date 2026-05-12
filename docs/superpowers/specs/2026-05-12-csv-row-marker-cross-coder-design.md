# CSV row marker — cross-coder por cell

**Data:** 2026-05-12
**Engine afetado:** CSV (`src/csv/`)
**Áreas tocadas:** model, popover menu, cell renderer
**Schema:** sem mudança

---

## 1. Problema

Hoje o `RowMarker` tem o campo `codedBy: CoderId` e o registry ICR já é capaz de tratar múltiplos markers por cell (`categoricalKappaInput.extractRowMarkerUnit` produz 1 unit por marker com `coderId`). Compare Coders view também já desenha stripes per-coder via `compareModeColoring.computeRowGradient`.

Apesar disso, a UI de criação/edição opera em modo "primeiro marker da cell vence":

- `csvCodingModel.findOrCreateRowMarker(file, row, column)` (linha 250) localiza o marker existente **sem filtrar por coder**.
- `csvCodingMenu.ts` (8 sites em linhas 36, 42, 65, 70, 78, 82, 86) usa `getRowMarkersForCell(...)[0]` — primeiro elemento da lista, agnóstico de coder.
- `csvCodingCellRenderer.ts` (linhas 68, 97) renderiza união dos `codes` de todos os markers da cell, sem distinguir autor.

**Sintoma observável:** Coder2 ao codificar uma cell já marcada por Coder1 acaba mutando o marker de Coder1 ao invés de criar o seu próprio. Cell renderer mistura visualmente codes de coders diferentes como se pertencessem ao active coder.

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

Cada coder tem o próprio comment associado ao próprio marker. Comment shared cross-coder (CO-2) é refactor futuro se aparecer demanda real — não entra neste slice.

## 4. Invariante

> Em qualquer instante, existe no máximo 1 `RowMarker` por tupla `(fileId, sourceRowId, column, codedBy)`.

Markers com mesma tupla `(fileId, sourceRowId, column)` mas `codedBy` distintos podem coexistir e representam contribuições independentes de coders distintos.

Markers legados sem `codedBy` (existentes em vaults criados antes do Slice 5 ICR) são tratados como `'human:default'` via defensive `?? 'human:default'` em todos os filtros. **Não há migration in-place** — o valor é apenas inferido em runtime, evitando dirty-write em `data.json`.

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

**`setCellComment(file, sourceRowId, column, value)`** (linha 102) — mesmo filtro no lookup interno. Coder2 escrevendo comment em cell marcada por Coder1 cria novo RowMarker com `codes:[], comment, codedBy:Coder2`. Garbage collection per-marker (linha 139, marker sem codes E sem comment é removido) continua funcionando sem ajuste.

**`getRowMarkersForCell(file, row, column)`** (linha 246) — **mantém** semântica atual (retorna todos os markers da cell, agnóstico de coder). É a API que ICR e compare mode consomem.

**Novo helper `getRowMarkerForActiveCoder(file, row, column)`** — retorna `RowMarker | undefined`, encapsula o filtro por active coder. Consumido pelo menu e pelo renderer.

### 5.2 Batch operations (`csvCodingModel.ts`, linhas 276-377)

`addCodeToManyRowMarkers`, `removeAllRowMarkersFromMany`, helpers que usam `buildRowMarkerIndex(file, column)`:

- `buildRowMarkerIndex` passa a filtrar por active coder (índice de markers do active sobre as rows). Batch só atua no trabalho do active.
- Markers de outros coders são intocados.

### 5.3 `csvCodingMenu.ts`

Os 8 sites de `getRowMarkersForCell(...)[0]` (linhas 36, 42, 65, 70, 78, 82, 86) são substituídos por `getRowMarkerForActiveCoder(...)`. Sem mudança de fluxo lógico — apenas correção do lookup.

`getMarker = () => findOrCreateRowMarker(...)` (linha 35) fica automaticamente correto pela mudança em 5.1.

### 5.4 `insertMarkerRaw` (canal de reconciliation/import)

Sem mudança. Recebe marker com `codedBy` já preenchido (consensus, llm, outro humano). Canal correto para criar markers em nome de outro coder.

## 6. Read-path — mudanças

### 6.1 `csvCodingCellRenderer.ts`

Sites em linhas 68 e 97 substituem `getRowMarkersForCell` por `getRowMarkerForActiveCoder`:

```ts
// antes
const markers = model.getRowMarkersForCell(file, sourceRowId, sourceColumn);
// renderiza union de markers.flatMap(m => m.codes)

// depois
const m = model.getRowMarkerForActiveCoder(file, sourceRowId, sourceColumn);
// renderiza m?.codes ?? []
```

### 6.2 `csvCodingView.ts` (compare mode)

Sem mudança. `compareModeContext` (linhas 621-642) já consome `markerIndex.get(key)` retornando todos os markers da cell. Compare mode permanece exatamente como hoje.

## 7. Casos de borda

| Caso | Comportamento esperado | Mudança necessária |
|---|---|---|
| Delete code (ripple) | Remove `codeId` de todos os markers, independente de coder. Marker vazio entra em GC per-marker. | Nenhuma — atua code-level. |
| Merge codes | `codes[]` de cada marker é rewriteado independentemente. Smart code auto-rewrite atua na predicate, não no marker. | Nenhuma. |
| Reconciliation | Cria marker `codedBy='consensus:<id>'` que coexiste. | Nenhuma — `icrMarkerOpsImpl.createCsvRowMarker` já recebe `codedBy` no spec. |
| Active coder switch | Próximo `findOrCreateRowMarker` filtra pelo novo active. Cell renderer rebuilda via `notify()`. | Nenhuma. |
| QDPX export/import | Cada marker exporta o próprio `codedBy`. Import 2-pass aloca markers per-coder. | Nenhuma. |
| Parquet enriched export | Coluna `codedBy` já presente. | Nenhuma. |
| Markers legados sem `codedBy` | Tratados como `'human:default'` em runtime. | Defensive `??` no filtro. |

## 8. Out of scope

- **Comment shared cross-coder (CO-2)**: refactor futuro se demandar. Comment continua per-marker.
- **Affordance visual de "trabalho alheio existe" fora compare mode**: decisão A pura, sem badge. Compare Coders é o canal único de visualização cross-coder.
- **Migration in-place de `codedBy` em markers legados**: defensive `??` cobre, sem dirty-write em `data.json`.
- **Mudanças em `SegmentMarker`**: já correto — key inclui geometria (from/to) + coder, colisão por tupla idêntica é impossível para spans.
- **`TopBarCoderPicker` UI**: já existe e funciona. Se smoke test revelar que troca de active não dispara `model.notify()`, vira bug pré-existente fora deste slice.

## 9. Testing strategy

### 9.1 Contract tests (Vitest + jsdom)

`tests/csv/csvCodingModel.crossCoder.test.ts` (novo):

1. `findOrCreateRowMarker` retorna marker do active coder quando cell tem markers de múltiplos coders.
2. `findOrCreateRowMarker` cria marker novo (não muta alheio) quando active coder não tem marker mas outro coder tem.
3. `setCellComment` cria marker novo do active coder quando alheio já tem comment na cell.
4. `addCodeToManyRowMarkers` opera apenas em markers do active coder.
5. `removeAllRowMarkersFromMany` deleta apenas markers do active coder.
6. Marker legado sem `codedBy` é tratado como `'human:default'` (defensive `??`).

`tests/csv/csvCodingCellRenderer.crossCoder.test.ts` (novo):

7. Renderer retorna codes apenas do active coder quando há markers de múltiplos coders na cell.

`tests/csv/csvCodingModel.invariant.test.ts` (novo):

8. Após qualquer sequência de operações de criação/edição, `rowMarkers` não contém 2 markers com mesma tupla `(file, row, column, codedBy)`.

### 9.2 Tests pré-existentes a recalibrar

Tests em `tests/csv/` que codifiquem "primeiro marker da cell vence" precisam recalibrar para "marker do active coder vence". Não usar `it.skip` — recalibração é parte do slice. Se algum test sugerir intenção explícita de "primeiro vence" (não acidental), parar e perguntar ao usuário antes de mudar.

### 9.3 Smoke test no Obsidian real (TOP PRIORITY §1)

Vault: `/Users/mosx/Desktop/obsidian-plugins-workbench/`.

Cenário mínimo:

1. Active `'human:default'`. Abrir CSV de teste. Marcar cell A1 com código X.
2. Settings → criar coder `'human:bob'`. Ativar bob.
3. Abrir mesmo CSV. Cell A1 deve aparecer **vazia** (não exibe X).
4. Marcar cell A1 com código Y. Cell A1 deve exibir Y.
5. Trocar active de volta para default. Cell A1 deve exibir X.
6. Abrir Compare Coders view com ambos no scope. Cell A1 deve mostrar stripes (X + Y).
7. Como bob, editar comment da cell. Trocar para default — comment não deve ser visível.

Critério de "passou": comportamentos 3, 4, 5, 6, 7 batem. Inspeção em `data.json` deve mostrar 2 RowMarkers distintos para cell A1 (um por coder), sem mutation cruzada.

## 10. Arquivos afetados (consolidado)

**Mudança de código:**
- `src/csv/csvCodingModel.ts` — filtro por active coder em ~6 sites + 1 helper novo (`getRowMarkerForActiveCoder`).
- `src/csv/csvCodingMenu.ts` — 8 substituições `getRowMarkersForCell(...)[0]` → `getRowMarkerForActiveCoder(...)`.
- `src/csv/csvCodingCellRenderer.ts` — 2 sites read-path.

**Tests:**
- `tests/csv/csvCodingModel.crossCoder.test.ts` — novo, 6 cases.
- `tests/csv/csvCodingCellRenderer.crossCoder.test.ts` — novo, 1 case.
- `tests/csv/csvCodingModel.invariant.test.ts` — novo, 1 case.
- Tests pré-existentes em `tests/csv/` — recalibrar onde codificarem "primeiro vence".

**Não afetados:** schema (`csvCodingTypes.ts`), QDPX export/import, Parquet enriched export, ICR (`categoricalKappaInput`, `kappaWorkerClient`), compare mode (`compareModeColoring`, `csvCodingView.compareModeContext`), reconciliation (`icrMarkerOpsImpl`), settings UI, command palette.
