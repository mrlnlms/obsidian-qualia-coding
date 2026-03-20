# Board Refresh on Open — Design Spec

> Reconciliar dados stale no Research Board ao abrir. Atualiza cores, nomes, contagens; marca orfaos; remove arrows invalidas. Notice informativo com resumo.

## Decisoes de design

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Interacao | Notice informativo (sem modal) | Nao interrompe fluxo, pesquisador espera dados atuais |
| Excerpt com arquivo deletado | Manter com navegacao desabilitada | Conteudo textual ainda e valido pra analise |
| CodeCard com codigo deletado | Manter com indicador "(deletado)" | Pode ter arrows/anotacoes conectadas |
| Contagens | Atualizar | Card mostrando 15 quando sao 23 e mais confuso que util |

## Arquivo novo

`src/analytics/board/boardReconciler.ts` — funcao pura `reconcileBoard()`.

## Assinatura

```typescript
interface ReconcileResult {
  colorsUpdated: number;
  namesUpdated: number;
  countsUpdated: number;
  codesMarkedDeleted: number;
  excerptsOrphaned: number;
  arrowsRemoved: number;
  clustersUpdated: number;
}

function reconcileBoard(
  canvas: fabric.Canvas,
  registry: CodeDefinitionRegistry,
  data: ConsolidatedData,
  app: App,
): ReconcileResult;
```

## Reconciliacao por tipo de no

### CodeCardNode

Para cada CodeCard no canvas:
1. Buscar `boardCodeName` no registry via `getByName()`
2. Se nao encontrado → marcar como deletado:
   - Prefixar nome com "(deletado) "
   - Cor de fundo → cinza (`#888`)
   - `boardDeleted = true` (nova prop)
3. Se encontrado:
   - Nome mudou (rename) → atualizar `boardCodeName` + textbox
   - Cor mudou → atualizar `boardColor` + rect background
   - Recontar markers: filtrar `data.markers` por `m.codes.includes(codeName)`, comparar com `boardMarkerCount`
   - Sources mudaram → atualizar `boardSources[]`

### ExcerptNode

Para cada Excerpt no canvas:
1. Verificar `boardFile` existe via `app.vault.getAbstractFileByPath()`
2. Se nao existe → setar `boardOrphaned = true`, desabilitar click handler
3. Para cada codigo em `boardCodes[]`:
   - Buscar no registry
   - Se deletado → remover do array `boardCodes` e `boardCodeColors`
   - Se renomeado → atualizar nome no array
   - Se cor mudou → atualizar cor no array
4. Re-renderizar chips se houve mudanca

### ArrowNode

Para cada Arrow no canvas:
1. Buscar `boardFromId` e `boardToId` nos objetos do canvas
2. Se qualquer referencia nao encontrada → remover arrow do canvas

### ClusterFrameNode

Para cada Cluster no canvas:
1. Para cada nome em `boardCodeNames[]`:
   - Se codigo deletado do registry → remover do array
2. Se array ficou vazio → remover frame do canvas

### Sticky, KPI, Snapshot, Path

Nenhuma reconciliacao. Dados self-contained.

## Integracao no BoardView

```
onOpen()
  → setupBoardCanvas()
  → loadBoard(canvas, adapter)
  → const result = reconcileBoard(canvas, registry, consolidatedData, app)
  → if (hasChanges(result)) {
      canvas.renderAll()
      scheduleSave()
      new Notice(buildSummary(result))
    }
  → readyResolve()
```

## Notice

Formato: "Board atualizado: X cores, Y contagens, Z cards deletados, W arrows removidas"

Exemplos:
- "Board atualizado: 2 cores atualizadas, 1 contagem atualizada"
- "Board atualizado: 1 card marcado como deletado, 2 arrows removidas"
- (zero mudancas → sem Notice)

## O que NAO faz

- Nao adiciona nos novos (codigos criados depois nao aparecem)
- Nao reposiciona nos (layout manual e sagrado)
- Nao toca em Stickies, KPIs, Snapshots
- Nao toca em conteudo textual de Excerpts (so metadata de codigos)

## Testes

- `reconcileBoard` com CodeCard cujo codigo foi renomeado → verifica nome atualizado
- `reconcileBoard` com CodeCard cujo codigo foi deletado → verifica marcacao "(deletado)"
- `reconcileBoard` com Excerpt cujo arquivo nao existe → verifica boardOrphaned
- `reconcileBoard` com Excerpt cujo codigo foi deletado → verifica remocao do chip
- `reconcileBoard` com Arrow orfao → verifica remocao
- `reconcileBoard` sem mudancas → verifica resultado zerado
- `reconcileBoard` com contagem mudada → verifica atualizacao

## Estimativa

~80-120 LOC para boardReconciler.ts + ~10 LOC integracao no boardView + ~100 LOC testes.
