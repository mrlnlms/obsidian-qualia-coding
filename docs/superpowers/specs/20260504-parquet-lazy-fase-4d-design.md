# Parquet Lazy — Fase 4d: Coding em modo lazy + display_row mapping (Spec)

> Fase final da Fase 4. Entrega o que faltava: coding completo em modo lazy + scroll-to-row responsivo após sort.
> Async cascade pra preview de `markerText` em sidebar/detail views fica fora — anotado em `BACKLOG.md` como item separado, porque atinge ~60 sites em `core/` e UI síncrona (drag-drop, hover, mutations).

---

## 1. Diagnóstico — por que a 4b ficou view-only

Em 4b, eu desabilitei coding em modo lazy assumindo que precisaria de cascade async. **Investigação revelou que essa premissa estava errada:**

- Cell renderer (`csvCodingCellRenderer.ts`) renderiza chips a partir de `model.getRowMarkersForCell()` — sync, lê markers do `data.json` em memória. Independe de cell text.
- Popover (`openCsvCodingPopover`) abre baseado em chip click — não consome cell text.
- Segment editor (`segmentEditor.open`) recebe `cellText` como parâmetro — em modo lazy, `cellText` vem de `rowNode.data[col]` que **AG Grid Infinite Row Model preenche** quando o datasource retorna a página visível.

A única coisa que precisa de cell text async é **preview do trecho codificado em sidebar/detail views** (`marker.markerText`). Isso é cosmético — coding completo funciona sem.

**Gap real da Fase 4 a fechar:**
1. Reativar coding em modo lazy — gear button + injectHeaderButtons + cell renderer ler `__source_row` da `params.data`
2. Pre-compute display_row mapping ao mudar sort (spike Premise B addendum §14.5.2)

---

## 2. Mudanças por arquivo

### 2.1 `src/csv/csvCodingView.ts` — `setupLazyMode`

Hoje o setupLazyMode não inclui:
- Gear button no info bar (abre `ColumnToggleModal` pra usuário ativar colunas cod-seg/cod-frow)
- `injectHeaderButtons` MutationObserver (adiciona botões nos headers das colunas codificáveis)

**Adicionar nos dois.** Mesmo código que onLoadFile usa em modo eager. Sem novidade — só copia os blocos.

Banner do banner de tamanho remove o "view only" do texto (passa a ser modo lazy completo).

### 2.2 `src/csv/csvCodingCellRenderer.ts` — `sourceRowId` lookup

Hoje:
```ts
const sourceRowId: number = params.node?.sourceRowIndex ?? params.rowIndex ?? 0;
```

`node.sourceRowIndex` em **Client-Side Row Model** (eager) é o índice original. Em **Infinite Row Model** (lazy) ele não existe ou é igual ao display index — não é estável após sort SQL.

**Solução:** o datasource do setupLazyMode já inclui `__source_row` em cada row retornada (porque `DuckDBRowProvider.getRowsByDisplayRange` seleciona `*` da table que tem o virtual column). Cell renderer lê de `params.data` primeiro:

```ts
const sourceRowId: number =
    params.data?.__source_row ??
    params.node?.sourceRowIndex ??
    params.rowIndex ??
    0;
```

Mesma fix na `sourceTagBtnRenderer` (linha 139).

Comportamento eager intocado — `params.data.__source_row` é `undefined` em eager, cai no fallback.

### 2.3 `src/csv/csvCodingView.ts` — pre-compute display_row mapping

Quando user aplica sort em modo lazy:
1. Antes do datasource refetch, dispara `lazyState.rowProvider.buildDisplayMap(orderBy)` — DuckDB cria table auxiliar com `(__source_row, display_row)`.
2. Guarda nome da map table em `lazyState.displayMap = { name, orderBy }`.
3. Se já existia displayMap antigo, drop antes.

Pra `navigateToRow` em modo lazy:
- Hoje: `gridApi.ensureIndexVisible(sourceRowId, 'middle')` — usa sourceRowId como display index. Errado após sort.
- Depois: se `lazyState.displayMap`, query `displayRowFor(mapName, sourceRowId)` → usa o display row resolvido.

Hook do AG Grid sort change: `onSortChanged` event do gridApi.

### 2.4 `src/csv/csvCodingMenu.ts` — sourceRowId do `forEachNodeAfterFilterAndSort` em lazy

`openBatchCodingPopover` itera nodes pra coletar `sourceRowIndex`. Em Infinite Row Model só itera nodes na cache atual — incompleto em arquivos grandes.

**Decisão:** batch coding em lazy via SQL (não via grid iteration). Adicionar caminho:
- Se `lazyState != null` no caller: usa `rowProvider.batchGetMarkerText` ou query similar pra obter TODOS os sourceRowIds da coluna.
- Caso eager: caminho atual (forEachNode).

**Out-of-scope desta fase 4d.** Batch coding via predicate é a Fase 5 do design original. Em 4d apenas: ao chamar batch popover em modo lazy, mostra Notice "Batch coding em modo lazy chega na Fase 5" e bloqueia. Coding individual (cell-level) funciona normal.

### 2.5 Smoke test commands

Adicionar comando `Qualia: DuckDB lazy display_map info` (dev-only, similar ao smoke do bootstrap):
- Reporta lazyState atual (totalRows, sort ativo, displayMap presente?)
- Útil pra debug do mapping na próxima sessão

(Opcional — pode ser cortado se ficar grande.)

---

## 3. O que NÃO entra nesta fase

| Item | Onde fica |
|---|---|
| Async cascade `SidebarModelInterface.getAllMarkers/getMarkerById` → `Promise<>` (~60 sites em core/) | `BACKLOG.md` "Coding em modo lazy" — já registrado |
| Preview de `markerText` em sidebar/detail pra arquivos lazy (depende de cascade async) | Mesmo backlog item |
| Batch coding via predicate em modo lazy | Fase 5 do design |
| QDPX export streaming pra arquivos lazy | Fase 6 do design |
| OPFS Manage Cache UI | Fase 6 do design |

A entrega da Fase 4d é **coding completo em arquivos lazy**, não a sidebar/detail completos. Isso é o uso central do plugin — o user abre o parquet 297MB, codifica células, persiste markers. Sidebar mostra os markers existentes (sem preview de trecho em arquivos lazy — limitação aceita até async cascade entrar).

---

## 4. Acceptance criteria

- [ ] `npm run build` passa
- [ ] `npm run test` passa (2538+ verde)
- [ ] Em vault workbench, abre `Distribution_history_MERGED_2024-12-09_2025-11-27.parquet` (297 MB) → escolhe "Lazy mode" → grid abre com gear button visível
- [ ] Click no gear → ColumnToggleModal abre → toggle cod-frow numa coluna → coluna aparece na grid com botão de tag
- [ ] Click no botão de tag de uma row → popover abre → aplica code → chip aparece na cell
- [ ] Fecha Obsidian, reabre, abre o mesmo parquet em lazy → marker persistiu (chip volta na mesma row)
- [ ] Aplica sort numa coluna → grid re-popula via SQL → click num marker no sidebar → grid scrolla pra posição correta (pré-computed display_row)
- [ ] Tabular CSV export com markers de arquivo lazy: row column tem sourceRowId correto

---

## 5. Backout

Tudo isolado em 2 arquivos: `csvCodingView.ts` (setupLazyMode + sort hook) + `csvCodingCellRenderer.ts` (sourceRowId fallback). `git revert` da Fase 4d volta ao state lazy view-only da 4b.

---

## 6. Estimativa

~1 sessão. Mais curta que as outras phases porque a base (DuckDBRowProvider + OPFS + lazy mode) já está em main; faltam ~150 LOC pra fechar.

---

## 7. Próximo após esta fase

- **Fase 5** do parquet-lazy: batch coding modal via SQL.
- **Backlog item "Coding em modo lazy"**: async cascade pra previews em sidebar (refactor maior, fase dedicada).
- **Backlog item "Bundle size"**: gzip do WASM via fflate.
