# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema.
> Items resolvidos viraram one-liners no fim do arquivo (com data e raiz).
> Won't-fix mantém razão pra não reabrir.
> Última atualização: 2026-05-13 (release 0.6.1 — gaps intra-modality + bugfix metodológico α δ²; smoke 2026-05-13 pegou bug crítico cache distance + 3 UX gaps; bloco Image engine fechado mesma data, 8 itens originais + 8 extras descobertos no smoke).

---

## 🟢 Estado atual

**Bloco ICR fechado por inteiro** (releases 0.6.0–0.6.1, 2026-05-13). Inclui:
- Camada 1 per-modality enforcement (banner multimodal + per-engine table)
- 3/4 gaps intra-modality: Gap #2 (resolução temporal parametrizável) + Gap #3 (validação canônica α nominal + migração δ² Jaccard/MASI) + Gap #4 (fromMs/from rename)
- Gap #1 ✅ FEITO 2026-05-13: infra `SourceSizeProvider` + Media (audio/video) + PDF (1c) + CSV segment (1d). Providers podem virar redundantes se Camada 2 BHM for implementada — relação documentada nos headers.
- **Smoke real completo 2026-05-13** com seed sintético cravado em 4 engines (`scripts/seed-icr-test.mjs`, 37 markers em 17 cenários) — pegou bug crítico (cache distance stale, fixado) + 3 UX gaps.

Camadas 2 e 3 do framework multifaceta viraram peças do bloco LLM/Framework Unificado (ver `ROADMAP.md §"Framework Unificado ICR + LLM"`) — não atacam-se isoladamente, entram com LLM coding.

**Único bloqueador legado:** §11 E3 (limitação de formato, won't-fix documentado).

**Polish ICR aberto (não bloqueante):**
- ~~Gap #1c/1d (PDF + CSV segment SourceSizeProvider)~~ ✅ ambos fechados 2026-05-13. Janela de absorção por Camada 2 BHM documentada nos headers.
- ~~3 UX gaps do smoke 2026-05-13~~ ✅ todos fechados 2026-05-13 (chip Default coder sem markers, picker δ Nominal, δ fantasma com `is-memorized`)
- Cross-cutting: 1 CSS (`!important` cluster) + canvas refresh cor de code nos outros engines (pdf-shape/markdown/csv/audio/video — pattern image já estabelecido). ~~§37 doc desatualizada~~ ✅ corrigida 2026-05-13.

**Próxima frente prática (não-ICR):** LLM-assisted coding com Camada 2 Bayesian annotation como par natural. Precede brainstorm dedicado — ver `ROADMAP.md §"Frente 2"` e `docs/ICR-MULTIMODAL-METHODOLOGY.md` pra fundamentação metodológica.

### 🔍 Sintomas observados sem repro confiável

Quando aparecer, capturar `data.json` + screenshot + steps na hora — diagnóstico fica trivial com forensic data. Sem nenhum sintoma aberto no momento.

---

## 🪶 Polish curto

### Image engine — resolvido 2026-05-13 (sessão dedicada)

8 itens originais do raio-x 2026-05-08 + 8 extras descobertos durante smoke (popover position/focus/Enter, Add New Code vanish, Delete key, canvas refresh, etc). Fechado em sessão dedicada com vault aberto. Bugs cross-cutting descobertos no caminho foram registrados em §Cross-cutting pendente pra atacar fora do scope Image.

**Itens originais (raio-x 2026-05-08):**

| # | Path:linha | Resolução |
|---|-----------|-----------|
| 1 | `src/image/regionLabels.ts:120-126` | ❌ **Descartado** — UI de labels vai ser refeita (decisão user 2026-05-13). Fix de transform inversion seria gasto duplicado. |
| 2 | `src/image/imageCodingMenu.ts:127` | ✅ rAF coalesce em `onRebuild` + cancel em close (`scheduleRebuild`). |
| 3 | `src/image/canvas/regionManager.ts:114-128` | ✅ Wirado (decisão B: override > code color). `getStyleForMarker` checa `marker.colorOverride` primeiro. Label também (paridade visual). |
| 4 | `src/image/regionHighlight.ts:37-40` | ✅ `cleanupForShape(shape)` exposto no `RegionHighlightState`, chamado nos 3 sites de delete (popover Remove Region, toolbar Delete, drawing onShapeDeleted). WeakMap fica naturalmente clean. |
| 5 | `src/image/views/imageView.ts:144-146` | ✅ rAF coalesce em `selection:cleared`. `selection:created/updated` cancela pending close (transição sem flash). |
| 6 | `src/image/views/imageView.ts:156,169` | ✅ rAF coalesce em `RegionLabels.refreshAll`. Não validado em smoke por estar no escopo do refactor descartado de #1. |
| 7 | `src/image/views/imageView.ts:252-266` | ✅ Cor reflete só codes visíveis (`getStyleForMarker` filtra `isCodeVisibleInFile`). `refreshVisibility` chama `refreshStyle` quando anyVisible muda. |
| 8 | `src/image/canvas/regionDrawing.ts:139,155` | ✅ Threshold padronizado: `w<3 OR h<3` (rect), `rx<2 OR ry<2` (ellipse). Qualquer dimensão pequena dropa. |

**Extras descobertos no smoke 2026-05-13 (todos resolvidos):**

| Sintoma | Fix |
|---|-----|
| Popover abria no canto inferior esquerdo da tela em vez de junto da shape | `openMenuForMarker` agora usa coord do mouse (mouseup/click) com fallback bbox+canvasRect.offset. Anchored igual CM6 markdown. |
| Input do popover sem auto-focus | `autoFocus: true` explícito (image sempre é click intentional, nunca hover passivo). |
| Enter precisava 2x na primeira interação | Raiz: `data.json` tinha `auditLog: { entries: [] }` (formato antigo) em vez de `auditLog: []`. Cast `as AuditEntry[]` mentia, `log.push` crashava no primeiro Enter. Data.json do vault normalizado. |
| Shape sem code persistia após Esc | `onClose` checa se marker tem 0 codes (e não está em rebuild) → `onRegionDeleted`. |
| "Add New Code" deletava shape recém-desenhada | Ordem invertida em `codingPopover.ts:380`: `onBeforeModal` agora dispara ANTES de `close()`, permitindo flag `openingModal` bloquear o vanish. Markdown não regrede (effect dispatcado é idempotente). |
| Delete/Backspace não deletava shape selecionada | `registerDomEvent(document, 'keydown', ...)` com gate `activeLeaf === this.leaf`. Filtros: pula se popover aberto, foco em input, ou sem shape ativa. |
| Canvas não refleta `colorOverride` setado via Marker Detail | `imageView` subscribe `model.onChange` → `scheduleCanvasRefresh` (rAF) → `regionManager.refreshAllStyles` + `regionLabels.updateLabel` em todos shapes do file atual. |
| Canvas não reflete mudança de cor do code via Code Detail | `imageView` subscribe `qualia:registry-changed` → mesma pipeline `scheduleCanvasRefresh`. Cobre cor + nome (label text) + delete + merge. |

### Cross-cutting pendente (pós-rodada 2026-05-09)

Da fila cross-cutting do hardening, 4 frentes atacadas em 2026-05-09 (parseInt validation, CI e2e suite completa, χ² walk recursivo, dendrogram cluster preview). 2 ficaram pendentes; 1 resolvida em 2026-05-13. Resta:

| Item | Por que não couber em rodada mecânica |
|------|----------------------------------------|
| **`styles.css` 68 `!important`** — clusters em 833-863 (handles SVG drag), 870-987 (mais handles), 1239-1287 (csv-comment-cell + csv-cod-seg-cell `display: flex` overrides) | Cada `!important` é override defensivo de defaults AG Grid (especificidade alta dos selectors `.ag-cell *`). Auditar exige testar runtime cada um — remover sem teste quebra render. Trabalho pra hardening real com vault aberto, não diff de código. |
| ~~**Code Explorer não refresha em tempo real após criar code via popover**~~ ✅ **RESOLVIDO 2026-05-13** — raiz era virtual scrolling no `codebookTreeRenderer.ts` (Code Detail list mode, não Explorer) renderizar com `clientHeight=0` no mesmo tick → `endIdx` limitado a `BUFFER_ROWS` (10). Mesma raiz do bug "render inicial incompleto". Fix 1-liner: `requestAnimationFrame(renderVisibleRows)` após render síncrono — pattern já estabelecido em `virtualList.ts:111-116` (commit f96ab4c, 2026-05-06) mas não copiado pra impl paralela do `codebookTreeRenderer`. Note: Code Explorer (`baseCodeExplorerView`) usa loop direto sem virtual scrolling, nunca teve esse bug. |
| **Canvas (~~image~~ outros engines) não refresha cor quando cor do code muda** — ✅ **Image resolvido 2026-05-13** (`imageView` subscribe `qualia:registry-changed` → `scheduleCanvasRefresh` reusa pipeline já criada pro colorOverride). PDF-shape (mesmo canvas pattern) provavelmente tem mesmo bug — não testado. Markdown/csv/audio/video usam DOM rendering com paths próprios, verificar individualmente. | **mecânico + cross-engine**. Pattern image documentado: subscribe `qualia:registry-changed` document event + `model.onChange`, ambos disparando `scheduleCanvasRefresh` (rAF coalesce). Replicar em pdf-shape primeiro (próximo candidato). |
| ~~**Code Detail list mode: render inicial incompleto após reload**~~ ✅ **RESOLVIDO 2026-05-13** — mesma raiz do item acima (virtual scrolling sem rAF fallback). Bug afetava só o Code Detail em list mode (que usa `codebookTreeRenderer`), não o Code Explorer (`baseCodeExplorerView` usa loop direto). Counter "(15)" no header sempre esteve correto — registry sabia, só o renderer cortava por `endIdx` calculado com `clientHeight=0`. **Follow-up mesma data (ca68dbf):** `codebookTreeRenderer` migrou pra consumir `createVirtualList` helper — pattern duplicado eliminado (próximo bug de virtual scroll fica em 1 lugar só). Tag `pre-codebooktree-virtuallist-baseline` marca estado anterior. Smoke real validou drag-drop, multi-select, eye toggle, group filter e search com codebook stress de 1000 codes. |
| ~~**§37 doc desatualizada**~~ ✅ **RESOLVIDO 2026-05-13** — corrigida em `TECHNICAL-PATTERNS.md §37`: lista de sites cobertos por `MarkerMutationEvent` reorganizada por categoria (universais / spatial / tabular). Removido `updateMarkerFields` da lista geral. Adicionada seção "Sites NÃO cobertos" documentando assimetria entre engines: markdown emite via `CodeMarkerModel.updateMarkerFields`, mas pdf/image/csv/media usam `BaseSidebarAdapter.updateMarkerFields` (só `notifyAfterFieldUpdate` → `model.notify()`, sem mutation event). |

**Resolvido 2026-05-13** — `cooccurrenceMode` async via Worker. A análise original do BACKLOG estava errada: descrevia como "refactor invasivo do contrato dos 25 modes". Solução real seguiu pattern fire-and-forget já estabelecido em `wordCloudMode`/`mdsMode`/`acmMode` (`renderGeneration` + `isRenderCurrent`). Worker inline pro `hierarchicalCluster` (`src/analytics/data/cluster.worker.ts` + Client + sync fallback, pattern §45) resolve 4 consumidores de uma vez: Cooccurrence, Overlap, Dendrogram, Files-Dendrogram. `boardClusters` segue síncrono (fora do escopo declarado).

### Bugs descobertos 2026-05-13 (sessão canvas refresh cor cross-engine)

- [ ] **Color override per-marker NÃO refresha cross-engine** — quando user muda `colorOverride` no Marker Detail (não cor do code no Code Detail), o `model.updateMarkerFields({ colorOverride })` dispara `model.onChange` mas NÃO `qualia:registry-changed`. Image já cobre via `model.onChange` listener. PDF/markdown/csv/audio/video não — fix da sessão atual cobre só cor de code (registry), não color override (per-marker). Pattern idêntico: adicionar `model.onChange` subscribe em cada engine além do `qualia:registry-changed`. 5 sites mecânicos.

- [ ] **`Uncaught TypeError: t.filter is not a function` em `doRenderCodeDetail`** — stack: `qb` (1076:1422) → `TP` (1212:28713) → `M$` (1212:14941) → `bE.doRenderCodeDetail` (1232:7008). 3 reproduções confirmadas na sessão 2026-05-13 (canvas refresh cross-engine):
  - **Via showCodeDetail** (clicar back de Marker Detail → Code Detail)
  - **Via refreshCurrentMode** chamado pelo color picker `onHueSliderMouseDown_` → update → scheduleRefresh
  - **Via refreshCurrentMode** chamado pelo `markerPreviewHydrator` → `notifyListenersOnly` → scheduleRefresh → `onFileRendered`
  - Bug pré-existente (independente do fix canvas refresh — `doRenderCodeDetail` não foi tocado). Stack minificada; reconstrução: build sem minify ou source map pra identificar a função `qb` e onde `t` chega undefined/objeto em vez de array. Suspeitos: `getMarkersForCode` / `buildFlatTree` / `filterByCode` retornam null em algum estado transitório. Não bloqueia uso (erro apenas no console; render continua), mas polui dev console e pode mascarar bugs reais.

---

## ✅ ICR — Hash consumers fora do Slice 2 (TODOS RESOLVIDOS 2026-05-11)

Slice 2 entregou primitiva de hash por source + 3 consumers iniciais. Os consumers adicionais que dependiam dela foram entregues em slices subsequentes:

- ✅ **Provenance audit (sourceHashSnapshot)** — entregue em Slice 5. `src/core/icr/provenance/attachSourceHashSnapshot.ts` stampado em todos os 8 engines de coding (markdown/pdf-text/pdfShape/csvRow/csvSegment/audio/video/image). Marker carrega snapshot do hash do source no momento do coding.
- ✅ **Cross-vault remap** — entregue em Slice 3 (Fase C P0) como peça de `mergeCoderContribution`. Função pura em `src/core/icr/transport/crossVaultRemap.ts`; integrada ao algoritmo de merge multi-coder, não vive isolada.

Conteúdo histórico abaixo preservado pra audit trail de decisão original.

---

### Histórico (resolvido — preservado pra audit)

Slice 2 (planejado 2026-05-09) entrega a **primitiva** de hash por source + 3 consumers iniciais (`markerTextCache` invalidation, `vault.on('rename')`/`('modify')` rename detection, QDPX import dedup). Os consumers abaixo dependem da MESMA primitiva — escopo recortado pra Slice 2 não inflar. Cada um vira slice próprio sobre primitiva já existente.

### Provenance audit field nos markers (snapshot do hash) — ✅ FAZER AGORA (Slice 5)

**Estado atual:** markers referenciam fileId (path) sem snapshot do estado do source no momento do coding.

**Impacto sem fazer:** edição posterior do source pode quebrar offsets dos markers (line/ch ou char-index ficam apontando pra texto que mudou) sem aviso ao user. User não sabe quando confiar nos bounds vs revisar — inferência manual via mtime/diff.

**Quando atacar:** quando provenance virar requirement explícito (paper publishing rigoroso, compliance regulatório, ICR multi-coder remoto onde lead precisa saber se source mudou desde coder enviar contribuição).

**Decisão 2026-05-09:** atacado em Slice 5 (próximo). Use case real: ICR multi-coder remoto (Fase C) já entregue precisa disso pra lead detectar source desalinhado. Mesmo sem UI completa de Fase C P1, snapshot field nos markers vira útil agora.

### Cross-vault remap (CRÍTICO pra Fase C — P2 transport multi-coder remoto)

**Estado atual:** import QDPX cria sources locais por path. Conflito de path com sources existentes do vault não é detectado por conteúdo.

**Impacto sem fazer:** **bloqueia Fase C** (transport multi-coder remoto, ver `docs/ROADMAP.md §"Infra compartilhada"`). Lead recebe contribuição de coder remoto e não consegue casar markers com sources locais quando paths divergem entre vaults (caso comum quando equipes não compartilham raiz idêntica). Sem hash, lead vê "source diferente" mesmo quando conteúdo é idêntico.

**Quando atacar:** **antes ou junto da Fase C**. Não pode ser depois — é pré-requisito estrutural pra P2 funcionar.

### Resumo do impacto cumulativo

Sem esses consumers, a primitiva entregue no Slice 2 cobre os 3 casos mais frequentes (cache invalidation, rename detection, import dedup) mas deixa em aberto: integridade temporal dos markers, integridade de backup, e — crucialmente — o pré-requisito de Fase C. Os 2 primeiros são otimizações de robustez progressiva; o último (cross-vault remap) é gating pra próximo grande marco do roadmap ICR. **Smart Code cache invalidation pra texto** foi resolvida fora desse bloco em 2026-05-12 junto da entrega do leaf `textContains` — invalidação file-level via `vault.on('modify')` sem precisar de hash (ver BACKLOG-HISTORY).

**Atualização 2026-05-09:** cross-vault remap **entra como pedaço de `mergeCoderContribution`** no Slice 3 (Fase C P0). Não vai ficar isolado — é integrado direto no algoritmo de merge multi-coder. Resolve o gating descrito acima.

---

## ✅ ICR — Fase C P1 (UX layer) — RESOLVIDO 2026-05-10

Spec + plan arquivados em `obsidian-qualia-coding/plugin-docs/archive/claude_sources/{specs,plans}/20260510-*`. Entregue em branch `icr-fase-c-p1` (mergeado em `main`). 6 frentes resolvidas:

- ✅ **Comando export** — botão `↗ exportar contribuição` no toolbar do Compare Coders View + comando palette `ICR: Export my contribution`. Modal seleção quando >1 humano. Salva em `vault/icr-exports/<slug>-<iso>.json`.
- ✅ **Modal preview + side-by-side + cherry-pick** — substituído por ItemView único `qc-icr-import` com 3 chips (Visão geral / Lado a lado / Por código). Cherry-pick em 2 níveis: per-marker (chip Lado a lado) + per-code (chip Por código).
- ✅ **Conflict resolution UX** — inline na Visão geral. `code_overwritten` (name/color) → Manter local / Aceitar incoming. Sources problemáticos → Trust local / Skip source. Default: incoming wins (motor) com override por item.
- ✅ **Multi-import staging** — rail lateral 200px aceita N contribuições simultâneas via drop ou comando. Sequential apply (cada uma vê efeito da anterior).
- ✅ **Codebook divergence resolution UX** — seção "Codebook divergiu" inline na Visão geral com diff rows por code + 2 botões. Skip-all em code novo também skipa do codebook (não polui).
- ✅ **Source divergente alert UX** — seção "Sources com problemas" inline com row por fileId. Bug latente do motor fixado: agora emite `source_not_found` pra fileIds que escaparam de `payload.sources` (extract sem hash registry).

**Decisões cravadas durante implementação:**
- Surface única (sem modal paralelo, sem setting global, sem dialog de entrada) — cenário é do user, sistema é agnóstico ao N
- Pattern reusado: `qc-cc-mode-chip` do Compare Coders/Analytics (chip toolbar + sub-pergunta)
- Markdown overlap em modo degraded (sem fetch async de sourceText) — PDF + CSV funcionam normalmente. Refinement no backlog.
- Persistência da rail é session-only (arquivo .json é source of truth)

**+72 testes** (3150 → 3222). Smoke roundtrip OK no vault real.

## ✅ ICR — Fase C P1 — refinements (TODOS RESOLVIDOS 2026-05-12)

- [x] **Markdown overlap exato no Lado a lado** ✅ (commit 9afebc3): `prefetchSourceTexts` via `vault.cachedRead` em `addContribution`/`activeId` change; cache em `state.sourceTextByFileId`.
- [x] **Range overlap exato no Por código** ✅ (commit 9afebc3): `collectByCodeContext` itera `findOverlappingLocalMarkers` per marker — substitui aproximação `min(local, incoming)` por overlap espacial real.
- [x] **Map manual em sources problemáticos** ✅ (commit d408c78): botão "Mapear → arquivo local" abre `FuzzySuggestModal` filtrado por extensão; pick grava `{ kind: 'map-manual', localFileId }` em sourceOverrides.
- [x] **Badge "duplicate coder" na rail** ✅ (commit 0dc768e): `renderRailContent` conta coderIds em pending[]; quando >1, item ganha border-left warning + badge inline com tooltip. Conserto colateral em `mergeCoderContribution` (commit 254f76d): dedup por markerId — apply sequencial não duplica mais (bug latente fechado).

## ✅ ICR — Slice E3a (Reconciliação P2) — RESOLVIDO 2026-05-11

Spec original em `docs/superpowers/specs/2026-05-09-icr-compare-coders-design.md §9 Slice E3a`. Branch `icr-fase-c-e3a` (mergeado em main). +81 testes (3222 → 3303). Tag `post-icr-slice-e3a-checkpoint`.

**Entregue:**
- Schema audit (3 types `reconciliation_*` + ReconciliationBounds/Decision/MarkerSnapshot + entity discriminator)
- CoderKind 'consensus' + createConsensus + getCodableCoders
- IcrMarkerOps façade + IcrMarkerOpsImpl (markdown + csvRow)
- executeReconciliationDecision + executeReconciliationRevert (pipeline adopt/split/accept-divergence/reject + branch revert por kind+mode)
- Drill-down P2 cards: picker com tipo de divergência (code/boundary/existence) + cards lado a lado + 4 ações + memo soft-required
- SplitNewCodeModal
- Polish além do spec: badge `✓ resolvida` no picker (antecipa parte do E3b workflow queue), reordenação code-primeiro
- Perf: serialize renderOverview (renderQueue Promise chain) + cache module-level em extractInputsFromScope + setSelection skipa toolbar/overview + consensus fora do scope default

**Decisões cravadas durante implementação:**
- Bounds `text` heurístico (`line × 1M + ch`) suficiente pra clustering interno; displayLabel honesto (`linha N:CH–...`) exposto na UI. Char offset real entra em slice futuro quando bounds engine-specific
- `findLatestActiveDecision` em audit log substitui state runtime — fonte de verdade pra "região foi decidida" é o audit, não snapshot do estado da UI
- `setSelection` skip overview = descoberta crítica de perf: matriz não destaca célula selecionada via state, logo selection-only não precisa re-renderizar overview

## ✅ ICR — Slice E3b (P3 workflow queue) — RESOLVIDO 2026-05-12

Spec original em `obsidian-qualia-coding/plugin-docs/archive/claude_sources/specs/20260509-icr-compare-coders-design.md §9 Slice E3b`. +62 testes (3303 → 3365, inclui +4 regression do rangeKey fix). Tag `post-icr-slice-e3b-checkpoint` pushada. Smoke real verde 2026-05-11.

**Entregue:**
- `regionDerivation.ts` extraído (helpers puros reusados por P2 e P3)
- `RegionStatus` + `categorizeRegionsByStatus` + `findLatestActiveOpenedEntry`
- `openReconciliation` em reconciliation.ts (emite reconciliation_opened)
- Botão "Marcar pra revisão" no P2 → Em discussão no P3
- `renderDrilldownWorkflow` (P3 queue 4 colunas) com header + totals + export button
- Click no card P3 abre P2; botão Reverter em Resolvidos/Divergência aceita
- Reporter flag `excludeConsensusCoders` via scope filter (`applyConsensusExclusion`) — wired nos 3 modes
- Chip toolbar "excluir consensus (κ pré)" — só aparece com consensus no scope
- Default scope mudou: TODOS coders (humanos + consensus); applyCoderInclusion remove consensus sem markers
- Modal pré/pós toggle (visível só com consensus) + banner indicativo + empty state pra par envolvendo consensus em "pré"
- `generateReconciliationReport` puro + clipboard export do P3 (timeline + memos + κ pré/pós)

**Decisões cravadas durante implementação:**
- Coluna P3 sempre mostra 4 colunas mesmo vazias (UX consistente); empty caption global aparece junto quando 0 regiões
- Default scope inclui consensus (era exclui); chip "excluir consensus" é o que filtra UI — alinha com semântica do filter `excludeConsensusCoders`
- "Em discussão" via botão explícito "Marcar pra revisão" (V1 cravado no spec); timeout auto-detect fica em backlog

## 🧱 ICR — Slice E3b — itens restantes (extensões)

- [x] **Coder picker em coding ativo** (FEITO 2026-05-11): status bar item "Coding as: {nome}" + menu pra trocar/criar coder humano. `plugin.getActiveCoderId()` / `setActiveCoderId()` + `data.activeCoderId` cross-session. Wire em 5 engine models (markdown / pdf / csv segment+row / audio / video) — todo marker novo recebe `codedBy = activeCoderId`. PdfCodingModel + CsvCodingModel + MediaCodingModel agora recebem `plugin` no constructor (em vez de `dm`) pra acessar `getActiveCoderId`. ~+15 test mocks ajustados pra plugin shape.
- [x] **Lentidão Compare Coders pós-E5a — FIXADA 2026-05-11 em camadas + Web Worker**: 7 fixes empilhados levaram troca de coefficient/coder de 1200ms → 1-3ms (cache hit) e combo-nova de 400-1900ms (bloqueando main thread) → off-main-thread (UI sempre fluida): (1) `getCodersWithMarkersInScope` cacheado; (2) `collectContestedRegions` cacheado; (3) `reportKappa`/`reportPairwise` 2 camadas (WeakMap identity + Map scope-key); (4) `extractInputsFromScope` per-engine cache; (5) Heatmap + Table `Promise.all` paralelos; (6) `explodeMarkersToCharLabels` memoizado; (7) **Web Worker** (`kappa.worker.ts` bundled inline via plugin esbuild `inline-worker` + Blob URL + Worker pattern do DuckDB) — `reportKappaAsync`/`reportPairwiseAsync` no reporter checam caches main-thread primeiro, defer pra worker em miss, populam cache. Fallback síncrono (`kappaSyncFallback.ts`) pra jsdom em tests. `disposeKappaWorker` no `onunload`.
- [x] **CSV row marker: shared cross-coder por cell** ✅ FEITO 2026-05-12 — modelo cravado: `1 RowMarker por (fileId, sourceRowId, column, codedBy)`. Write-path (`findOrCreateRowMarker`, `setCellComment`, `findOrCreateRowMarkerForCoder`, `addCodeToManyRows`, `removeAllRowMarkersFromMany`, `getCodeIntersectionForRows`) e read-path (`getCodesForCell` branch row, `getCellComment`) filtram por active coder. Cell renderer + popover menu (6 sites) consomem helpers per-coder. View subscreve `onActiveCoderChange` pra re-render. Compare Coders mantém visão cross-coder via stripes. **Fix paralelo (Compare Coders, 3 commits):** chip do coder novo aparece (allCoderIds no scope de `lastCompareCodersUsed`/saved), toggle filtra tabela κ nos 3 modes (matrix/table/heatmap), perf preservada via `filterInputsByCoders` pos-extract (TECHNICAL-PATTERNS §46 documenta a regra: `visibleCoderIds` NUNCA entra no scope do extract — já regrediu 4×). +15 testes (3435 → 3450). Spec/plan arquivados em `obsidian-qualia-coding/plugin-docs/archive/claude_sources/{specs,plans}/20260512-csv-row-marker-cross-coder*.md`. **Smoke pendente:** passo 7 do spec §9.3 (popover create vs edit em A2 entre coders) — anotado na próxima sessão.
- [x] **IcrMarkerOps: PDF text + CSV segment + audio + video + image + pdfShape** ✅ FEITO em 2 slices: **E5a** (2026-05-11, pdfText/csvSegment/temporal) + **E5b** (2026-05-11, bbox pra image + pdfShape). 8 engines cobertas. Bounds variants: `pdfText` + `csvSegment` + `temporal` + `bbox`. Consensus shape pra bbox = AABB-union rect (decisão D1, ver ROADMAP §Slice E5b).
- [x] **Slice E4 — Saved Comparisons hub** (FEITO 2026-05-11): schema `comparisons` + `lastCompareCodersUsed` em QualiaData + ComparisonRegistry + CompareComparisonsListModal + CreateComparisonModal + estado dirty no toolbar (`●` + Salvar mudanças / Salvar como nova / ✕ desvincular) + ribbon `users-2` + atalho contextual no codebook (`Ver κ deste código entre coders`). +27 testes (3365 → 3392). Spec original §7+§8.

---

## 🧱 ICR — Gaps descobertos em revisão de docs methodology (2026-05-12)

Detectados pelo subagente que produziu `ICR-LINEAR-METHODOLOGY.md` + `ICR-TEMPORAL-METHODOLOGY.md` + `ICR-CATEGORICAL-METHODOLOGY.md` em 2026-05-12. **Não bloqueiam o refactor C (set-valued labels);** atacar separadamente quando virar dor real ou em refactor de motor κ futuro.

- **`totalUnits` inflated em PDF/CSV/temporal — Po artificial.** Sub-items (dividido 2026-05-13):
  - [x] **1a. Infra `SourceSizeProvider`** ✅ FEITO 2026-05-13. Interface em `src/core/icr/ui/scopeExtraction.ts` (campo opcional em `ExtractionContext`). `buildPerCharInput` consulta provider após loop; provider null/throw → fallback `max(range.to)`. 3 integration tests validando propagation.
  - [x] **1b. Media provider (audio/video) via HTMLMediaElement.duration** ✅ FEITO 2026-05-13. `MediaSourceSize` em `src/core/icr/sourceSize/mediaSourceSize.ts` — carrega element `<audio>`/`<video>` detached com `preload=metadata`, espera `loadedmetadata`, lê `duration`. Cache per-fileId. Wired no `UnifiedCompareCodersView` constructor; deps propagadas via Matrix/Table/Heatmap. Timeout 5s fallback pra null.
  - [x] **1c. PDF provider (page char count via pdf.js)** ✅ FEITO 2026-05-13. `src/core/icr/sourceSize/pdfSourceSize.ts` via `window.pdfjsLib` (exposto pelo core Obsidian após primeiro PDF aberto na sessão). Sem PDF aberto → retorna null (caller cai no fallback). Cache por `(fileId, page)` + cache de `doc` parseado. 7 unit tests. **Nota Camada 2 BHM:** se BHM for implementado, este provider vira redundante — re-avaliar relação então (header do arquivo + commit message documentam).
  - [x] **1d. CSV segment provider (cell text via DuckDB)** ✅ FEITO 2026-05-13. `src/core/icr/sourceSize/csvSegmentSourceSize.ts` via `csvModel.getLazyProvider(fileId).getMarkerText({ sourceRowId, column })`. CSV fechado → retorna null. Cache por `(fileId, row, col)`. 7 unit tests. **Mesma janela de absorção por Camada 2 BHM.**
  - **Wiring:** `CompositeSourceSize` em `src/core/icr/sourceSize/compositeSourceSize.ts` delega por engine; instanciado em `UnifiedCompareCodersView` constructor com `[MediaSourceSize, PdfSourceSize, CsvSegmentSourceSize]`. 4 tests do composite.

- [x] **Resolução temporal parametrizável (1s/100ms/10ms)** ✅ FEITO 2026-05-13 (commit `29dfad9`). `extractMediaRange(m, resolution)` aceita resolution em segundos por tick. `ComparisonScope.temporalResolution?` persiste em SavedComparison. UI: chip group `[1s][100ms][10ms]` no toolbar do Compare Coders, visível só com audio/video no escopo. Snap-to-int (epsilon=1e-9) absorve ruído FP. Cache keys do extract incluem resolution.

- [x] **Validação canônica do α nominal contra Krippendorff (2018) cap. 11** ✅ FEITO 2026-05-13. Adicionada bateria de 5 testes canônicos em `tests/core/icr/coefficients/krippendorffAlpha.test.ts` com α calculado à mão pela fórmula canônica Krippendorff 2011 "Computing α": (1) 2 coders binário oposto α=-0.75; (2) 3 coders/2-cat mid-strength α=7/18; (3) 4 coders/3-cat α=1-45/79; (4) 2 coders/5-cat permutação cíclica α=-1/8; (5) empty-set como categoria unitization-α. Conclusão pra **δ_nominal**: impl ≡ canônica — fórmula difere por constante multiplicativa n em Do e em De que cancela no ratio; pra δ_nominal δ=δ² (0²=0, 1²=1).
  - **Caveat metodológico descoberto na expansão (2026-05-13):** pra **δ_jaccard / δ_MASI** com marginais não-uniformes, impl (δ linear) DIVERGE da canônica Krippendorff 2018 cap. 11 (que prescreve δ²). Caso assimétrico calculado à mão: Jaccard α_impl = -8/17 ≈ -0.4706 vs α_canon_δ² = -6/11 ≈ -0.5455; MASI α_impl = -28/67 vs α_canon = -192/413. Tests characterization em `krippendorffAlpha.test.ts` documentam valores impl atuais. Header de `krippendorffAlpha.ts` documenta a divergência.

- [x] **Migração α Jaccard/MASI pra δ² canônica (Krippendorff 2018 cap. 11)** ✅ FEITO 2026-05-13. Decisão metodológica: migrar pra δ² (Opção 2). Aplicado em `krippendorffAlpha.ts` (Do e De) + `krippendorffAlphaCategorical.ts` (idem); cu-α/fleissKappa parametrizados herdam via delegate. Tests characterization recalibrados pros novos valores: Jaccard α = -6/11 (caso assimétrico), MASI α = -192/413. Header de `krippendorffAlpha.ts` documenta histórico (δ linear → δ²) + referência Krippendorff 2018 cap. 11. ICR-MULTIMODAL-METHODOLOGY.md §"Convenção da fórmula" adicionado. **Valores publicados em 0.5.0/0.6.0 com δ_jaccard ou δ_MASI divergem ≈0.05-0.08 deste**; sem usuários reais afetados (zero usuários no plugin), mas registro mantido por precedente metodológico. 3580 tests pass.

- [x] **Discrepância `fromMs`/`from` em spec Compare Coders** ✅ FEITO 2026-05-13 (commit `211d078`). Renomeado `fromMs`/`toMs` → `from`/`to` em `ReconciliationBounds.temporal` (valor sempre foi segundos, nunca millisegundos). Display label `'1.5s–3.2s'` em vez de `'1500ms–3200ms'`. `formatMs` consertado (não divide segundos por 1000).

---

## 🧱 ICR — Smoke completo 2026-05-13 (bug fix + UX gaps detectados)

Smoke real do Compare Coders em corpus sintético (37 markers em 4 engines via `scripts/seed-icr-test.mjs`). Validou todos os 5 coeficientes + 3 distâncias. Achados:

### Bug crítico resolvido

- [x] **Cache identity stale entre distance toggles** ✅ FEITO 2026-05-13 (commit `827f860`). `reportKappaCache` e `reportPairwiseCache` (WeakMap por `inputs` ref) NÃO incluíam distance na chave. `scopeExtraction` cacheia `inputs` por scope → trocar chip Jaccard ↔ MASI no mesmo scope retornava resultado da chamada anterior (mesmo `inputs` ref, distance diferente, cache HIT). **Impacto:** valores α/Fleiss/cu-α em Compare Coders ficavam stale ao trocar δ desde release 0.5.0 (quando δ pluggable foi introduzido). Fix: distance vira segunda chave Map dentro do WeakMap (`Map<distKey, result>`). Tests recalibrados pra display 4 casas.

- [x] **Display κ/α de 2 → 4 casas decimais** ✅ FEITO 2026-05-13 (commit `7704a59`). `toFixed(2)` → `toFixed(4)` em 7 arquivos UI (`overviewMatrix`, `overviewTable`, `overviewHeatmap`, `overviewPerEngineTable`, `drilldownCards`, `reconciliationReport`, `compareCoderCoefficientsModal`). Diferenças sub-percentuais entre δ_jaccard/δ_MASI agora visíveis sem inflacionar corpus.

### UX gaps abertos

- [x] **Chip "Default" (coder sem markers) se confunde com coders ativos no toolbar** ✅ FEITO 2026-05-13. Diagnóstico correto: chip "Default" é coder `human:default` criado por `seedDefault()` em `coderRegistry.ts:22-26` (idempotente em construct/fromJSON — sobrevive hard-reset). Fix aplicado em `filterChips.ts` + `styles.css` separando 2 conceitos: `is-no-markers` (italic sempre que `!hasMarkers`, info persistente) vs `is-empty` (adiciona opacity 0.5 + sufixo "· 0" quando bloqueado pelo filter OFF). Tooltip dinâmico explica estado. 3 tests cobrindo os estados (filter off, filter on com sem markers, com markers).

- [x] **Picker δ tem opção `Nominal` explícita** ✅ FEITO 2026-05-13 (commit pendente). Adicionado chip `Nominal` ao `coefficientPicker.ts` (já existia em `DistanceName` e `resolveDistance` — só não estava exposto na UI). Ordem: `Nominal` → `Jaccard` → `MASI`. Disabled logic é idêntica aos outros (disabled quando coef é Cohen/α-binary OU multi-label=0). Tooltip atualizado pra explicar diferença entre Nominal/Jaccard/MASI. Test recalibrado pra esperar 3 chips em vez de 2.

- [x] **`state.distance` persiste após selecionar primary insensível a δ — δ fantasma** ✅ FEITO 2026-05-13 (commit `addfc20`). Decisão de produto: opção (a) — preservar preferência com visual distinto. Fix em `coefficientPicker.ts`: quando `distanceDisabled` por coef insensível (Cohen/α-binary), o chip que casa com `state.distance` ganha class `is-memorized` (border tracejado + opacity 0.7, distinto dos outros disabled em 0.3) + hint inline `δ: {label} (inativa)` + tooltip explicativo. Per-engine table consome `state.distance` mesmo com primary insensível (feature emergente — α/cu-α/Fleiss em modalidade multi-label usam δ memorizada). Quando disabled é por `multi-label=0` (não por coef), memorized NÃO aplica (toda δ degenera ao nominal, sem memória útil). Tests cobrem ambos cenários.

- [x] **Cohen κ é insensível a resolução temporal — documentado** ✅ FEITO 2026-05-13 (commit pendente). Tooltip do label `resolução temporal:` em `temporalResolutionPicker.ts` atualizado: "Afeta α / α-binary / cu-α / Fleiss em multi-label. NÃO afeta Cohen κ (caminho A é binary-per-label, sempre invariante a resolução)." Header comment do arquivo também atualizado com a nota.

### Não bugs (apenas confirmação)

- **Diferença δ_jaccard vs δ_MASI é matemática e proporcional ao multi-label content do corpus.** Smoke validou ambos. Em corpus com 19% multi-label e cenários lateral overlap, diferença α visível em 4 casas decimais.

---

## 🧱 OBSOLETO (mantido pra histórico de decisão)

### ICR — Fase C P1 (UX layer, fora do Slice 3) — original

Slice 3 (planejado 2026-05-09) entrega **Fase C P0** — funções puras de transport multi-coder remoto sem UI: `extractCoderContribution`, `mergeCoderContribution` (com cross-vault remap embutido), payload JSON format, codebook divergence detection. Testável via script. **Sem UI.** UX layer fica em P1, dependente de brainstorm com user (7 perguntas em aberto + 2 eixos ortogonais — ver `ROADMAP.md §"Infra compartilhada — Fase C"` e `obsidian-qualia-coding/plugin-docs/research/ICR-MATERIA-2026-05-08.md §7.1`).

### Comando/menu pra exportar contribuição

**Estado após Slice 3:** função `extractCoderContribution(data, coderId)` existe e é chamável via console/script. Sem comando palette, sem item de menu, sem botão.

**Impacto sem fazer:** export só via dev tools. Não-dev users não conseguem usar. **Bloqueia adoção real do workflow multi-coder.**

**Decisão pendente (brainstorm):** comando palette? item de menu na sidebar? botão em settings? trigger automático on certain events? — pergunta 1 do brainstorm Fase C.

### Modal preview de import + side-by-side compare + cherry-pick

**Estado após Slice 3:** `mergeCoderContribution(localData, payload, hashRegistry)` aplica TODO o payload. Caller decide se aplica ou não. Sem preview, sem comparação visual, sem seleção marker-por-marker.

**Impacto sem fazer:** lead aceita o batch inteiro sem revisar. Errors silenciosos (marker fora de range, código não-bate) só aparecem depois.

**Decisão pendente (brainstorm):** modal preview com diff? side-by-side com markers do lead vs incoming? cherry-pick por marker (overhead alto)? batch confirm com warnings highlighted? — perguntas 2-4 do brainstorm.

### Conflict resolution UX

**Estado após Slice 3:** função pura emite `conflicts: ConflictRecord[]` mas não resolve — caller decide. mergePolicies.ts existing já tem políticas pra code-level merge, mas multi-coder marker collision (mesmo segment, codes diferentes entre coders) não tem policy default.

**Impacto sem fazer:** conflitos viram warnings que o caller tem que tratar manualmente. Sem fluxo guiado.

**Decisão pendente (brainstorm):** policy default (last-write-wins / local-wins / incoming-wins / manual)? UI de resolução marker-por-marker? — pergunta 4 do brainstorm.

### Multi-import staging

**Estado após Slice 3:** import é destrutivo — aplica payload no `data.json` master direto. Sem area de staging.

**Impacto sem fazer:** lead que recebe contribuições de 3 coders e quer comparar antes de mergear precisa de 3 vaults separados ou backup manual.

**Decisão pendente (brainstorm):** staging area dedicada? branch model (git-like)? snapshot rollback? — pergunta 5-6 do brainstorm (adicionadas 2026-05-09).

### Codebook divergence resolution UX

**Estado após Slice 3:** função pura detecta `codebookHashMismatch: true` em payload se codebook local diverge do que estava quando coder exportou. Emite warning estruturado. **Não bloqueia merge.**

**Impacto sem fazer:** lead vê warning mas não tem fluxo guiado pra resolver. Pode aceitar merge silencioso com codes inconsistentes.

**Decisão pendente (brainstorm):** auto-rebase (incoming codes ganham IDs locais)? staging com diff? rejection com mensagem? — pergunta 7 do brainstorm.

### Source divergente alert (hash não bate entre vaults)

**Estado após Slice 3:** cross-vault remap procura match por hash. **Se source com mesmo path existe local mas hash diverge** (= source foi editado em algum dos lados), função emite warning `sourceHashMismatch` mas não bloqueia. Caller decide: merge incoming ignorando local? trust local? marcar markers como "potencialmente desalinhados"?

**Impacto sem fazer:** decisão silenciosa do caller (que vai ser o programador, não o pesquisador). Sem fluxo claro.

**Decisão pendente (brainstorm):** UI de alerta com diff visual? batch summary numérico? por arquivo ou agregado? — pergunta adicional do brainstorm 2026-05-09.

### Resumo do impacto cumulativo

Sem essas 6 frentes de UX, Slice 3 entrega motor de transport completo mas usável **só via console/script** — útil pra dev/testing, não pra workflow real de pesquisador. UX brainstorm dedicado precede primeira spec de UI; sem isso, qualquer interface seria especulação.

---

## 🧱 ICR — Adapters fora do Slice 4

Slice 4 (planejado 2026-05-09) adiciona adapters **cod row** (CSV categórico) e **áudio/vídeo** (overlap temporal em segundos) sobre o motor κ paramétrico existente. Restam adapters fora do Slice 4:

### Adapter PDF shape + imagem (bbox IoU) ✅ ENTREGUE 2026-05-09 (Slice 6)

**Spec:** `obsidian-qualia-coding/plugin-docs/superpowers/specs/2026-05-09-icr-bbox-adapter-design.md`
**Plan:** `docs/superpowers/plans/2026-05-09-icr-slice-6-bbox-adapter.md`
**Methodology (user-facing):** `docs/ICR-METHODOLOGY.md`

**Implementação:** bbox-as-unit binário com matching IoU + Hungarian + κ pareado, sobre o motor κ existente. 6 módulos novos em `src/core/icr/`: `bboxNormalize`, `bboxRaster`, `bboxIoU`, `bboxMatcher`, `bboxKappaInput`, `bboxAdapter`. Reporter `EngineId += 'pdfShape' | 'image'` (família spatial-bbox).

**Decisões cravadas (ver Appendix A do spec pra alternativas rejeitadas e condições de retomada):**
- Threshold θ: configurável por análise, default 0.5 (alinhado COCO).
- Matching: Hungarian 1:1 ótimo + cutoff θ pós-assignment (rejeitadas: greedy, many-to-one).
- Multi-código por bbox: herda redução first-code alfabético do motor κ (limitação geral, refactor separado). Repertório metodológico pro refactor: `obsidian-qualia-coding/plugin-docs/research/multi-label-kappa-2026-05-09.md` (Jaccard / MASI / variantes Cohen multi-label / Krippendorff α paramétrico).
- Multi-coder N>2: matriz triangular C(N,2) de κ pair-wise (rejeitada: clustering N-way bbox).
- IoU não-rect: rasterização uniforme grid 200×200 (adaptive 400×400 quando bbox <0.01% área OU min-dim < 2/gridSize).

**Trabalho futuro registrado em Appendix A do spec:**
- cu-α com IoU contínuo (linha de pesquisa publicável).
- Per-código matching primeiro (γ).
- Multi-coder via clustering N-way (Fleiss-equivalent).

### Resumo do impacto cumulativo

Slice 6 fecha as 6 engines do plugin no motor κ (markdown + PDF text + CSV cod segment ✅ Slice 1; áudio + vídeo ✅ Slice 4; CSV cod row ✅ Slice 4; **PDF shape + imagem ✅ Slice 6**).

---

## 🧱 ICR — Compare Coders polish (resolvido)

### B4 — Camada 1: per-modality enforcement ✅ FEITO 2026-05-13

Entregue na branch `b4-camada-1-per-modality`. UI ajustada sem mexer no motor κ:

- **Banner discreto** no topo do Overview (Modes A e B) quando escopo cruza 2+ famílias modais (text-like / temporal / categorical / spatial-bbox). Tooltip cita Krippendorff 2018, Artstein & Poesio 2008, Mathet et al. 2015 + path da pesquisa.
- **Mode A (Matrix):** per-engine table (linha = modalidade, coluna = 5 coeficientes) renderiza antes da matriz coder × coder em escopo multimodal. Matriz continua, mas com label descritivo + tooltip.
- **Mode B (Table)** e **Mode C (Heatmap):** heatmap já era per-engine; table ganha o banner mas mantém estrutura por código.
- **Single-engine inalterado.**

Detecção via `activeFamiliesFromModels(scope, models)` em `src/core/icr/ui/multimodalBanner.ts` (varre engines respeitando filters; csvSegment vs csvRow via presença de `from`). Per-engine table em `src/core/icr/ui/overviewPerEngineTable.ts` consome `report.byEngine` que `reportPairwise` já calcula — zero custo extra.

**+25 testes** unit (multimodalBanner + overviewPerEngineTable). Zero regressão na suite. **Layers 2 e 3** (Bayesian annotation model + G-theory/MFRM) fora do escopo — viram peças do bloco LLM/Framework Unificado (ver ROADMAP §"Framework Unificado ICR + LLM").

---

## 🔒 Won't-fix (não reabrir)

Lista canônica de decisões registradas. Cada uma tem razão explícita pra não voltar a virar tarefa.

### §4 C6 — `marginPanelExtension.ts` 548 LOC sem refactor
Layout algorithm já foi extraído em `marginPanelLayout.ts` (puro, testável). O restante do arquivo grande não tem bug associado — refactor seria estética sem ganho de manutenibilidade. Reabrir só se aparecer bug específico.

### §8b CB3 — Search só por nome de código (não busca pasta)
`hierarchyHelpers.buildFlatTree` busca só nomes de códigos. **Decisão correta**: pastas são organizacionais (sem significado analítico, confirmado em CLAUDE.md). Usuário conhece suas pastas e navega direto; quando um código casa, a pasta que o contém já é auto-revelada e expandida. Buscar por nome de pasta resolveria problema inexistente.

### §10b — Magnitude popover sem empty state
Seção de magnitude some inteiramente quando nenhum código aplicado tem magnitude configurada. **Decisão UX intencional** — não exibir mensagem é mais limpo que poluir o popover com placeholder.

### §11 E3 — Markers CSV não exportáveis via REFI-QDA
Limitação do **formato REFI-QDA**, não do plugin: o spec não comporta segmentos de célula tabular. Documentado no disclaimer do modal de export. Workaround pro usuário: usar Tabular CSV zip (#19) que cobre o caso analítico.

### §11 E5 — HEIC / TIFF / HEIF não suportados
Electron não decodifica esses formatos nativamente. **Tentativas rejeitadas:**
- `heic2any`/libheif em runtime — intercept falho + artefatos de decode + memory leak do WASM + 1.3MB de bundle
- Command one-shot de conversão — quebra o fluxo natural "abre e codifica"

**Workaround pro usuário:** converter externamente (Preview do macOS → Export As PNG) antes de trazer pro vault.

**Reabrir se:** aparecer demanda consistente em produção. Avaliar decoder via worker thread separado.

### §15 — Case Variables multi-popover racing
Arquitetura atual só permite um popover por vez (single `activePopoverClose` field). Race condition entre dois popovers simultâneos não é problema porque é arquiteturalmente impossível hoje. Revisar **só se** um dia decidir suportar multi-popover.

### Delay ms em virtual cells durante filter (parquet/CSV lazy)

Cells virtuais (cod-frow/cod-seg/comment) têm delay ms-pequeno no swap visual após filter no lazy mode — efeito direto do mecanismo `refreshInfiniteCache` que mantém DOM visível durante re-fetch (vs `purgeInfiniteCache` que limpa sync e causava o flash branco). Cells reais atualizam imediato porque o value muda (parquet entrega dado novo); cells virtuais usam cellRenderer custom + `field` apontando pra coluna inexistente no parquet, então só atualizam após `refreshCells({ force: true })` no listener `modelUpdated`. **Trade aceito** em 0.4.2 sobre voltar a `purgeInfiniteCache`. Reabrir só se AG Grid Community ganhar mecanismo render-while-fetch nativo. Documentado no CHANGELOG 0.4.2.

### §17 — Memo View virtual scroll
Suspeita inicial: >500 marker memos visíveis trava scroll por peso de DOM. **Morto em 2026-04-27** pelo click-to-edit refactor (commit `18676b4`): cada memo agora é `<p>` simples e só vira `<textarea>` quando clicado. Validação empírica em corpus de 50 codes + 527 markers + ~500 memos: fluido em by-file e by-code com `markerLimit="all"`. Corpus preservado via `scripts/seed-memo-corpus.mjs` se precisar re-medir.

---

## ⚓ Permanente (ineliminável)

| Item | Razão |
|------|-------|
| 13 `as any` em `pdf/index.ts` + `pdf/pdfExportData.ts` | Obsidian/pdfjs internals (`leaf.tabHeaderEl`, `view.viewer.child`, `window.pdfjsLib`) sem tipos públicos |
| 5 `as any` em `core/memoMigration.ts` | Migração one-shot lê shape legado pré-`MemoRecord`. Zero usuários atuais — código será deletado quando workbench rodar uma vez |
| 3 `@ts-ignore` (wavesurfer) | Module resolution `.esm.js` subpath não resolve com `moduleResolution: 'node'`; esbuild lida em runtime |
| 2 `@ts-expect-error` (`csv/duckdb/wasmAssets.ts`) | Custom esbuild loaders retornam `Uint8Array`/`string`; TS não tem visibilidade |
| !important 68 instâncias | Maioria override defensivo de AG Grid (`.ag-cell *` selectors com especificidade alta) |
| Inline styles dinâmicos remanescentes | `style.display = 'none'/''` toggles, position/zIndex em popovers — refactor pra classe é boilerplate por boilerplate |
| fflate bundled (~8KB gzip) | Dependência do QDPX export — sem alternativa nativa no Obsidian |

---

## 📚 Histórico

Registro completo de débitos resolvidos em arquivo separado: **[BACKLOG-HISTORY.md](BACKLOG-HISTORY.md)**.

Separado pra reduzir overhead em sessões LLM — agentes não precisam ler histórico salvo quando a pergunta for "já resolvemos X?" ou similar.

---

## Como usar este arquivo

- **Abrir item novo:** criar entrada (won't-fix com razão, ou aberto com severidade + arquivo + problema)
- **Resolver item:** mover one-liner com data + raiz pro `BACKLOG-HISTORY.md` (seção do mês). Não deixar aqui.
- **Item de polish curto sem guarda-chuva:** adicionar na seção "🪶 Polish curto" deste arquivo. Se passar de "curto" pra "refactor grande" (>4h), abrir plan dedicado
