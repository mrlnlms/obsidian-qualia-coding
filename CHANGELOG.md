# Changelog

All notable changes to Qualia Coding will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Hardening pré-submissão Community Plugins. Sem features novas — sweep horizontal de UX strings, validation, type safety, CSS organization e cross-cutting code quality. 4 rodadas em 2 dias atacaram ~30 itens mecânicos do levantamento de hardening 2026-05-08; restantes ficaram no `BACKLOG.md > Polish curto` (image engine como sessão dedicada + 2 cross-cutting que exigem refactor invasivo).

**LazyTextFilter active indicator restaurado (2026-05-12)** — dot/badge roxo do tema Quartz no header da coluna filtrada não aparecia desde 0.4.2 (regressão do `LazyTextFilter` custom em `src/csv/duckdb/lazyTextFilter.ts`). Causa-raiz: built-in filter chama `params.filterChangedCallback()` que internamente roda `setColFilterActive(col, isActive, ...)` no `FilterManager` — esse método dispatcha 2 eventos na column (`filterActiveChanged` + `filterChanged`) que header cell e filter button escutam respectivamente. Custom filter pula esse path (justamente pra não disparar `purgeInfiniteCache` que causa o flash branco — razão de existir do filter), então `column.filterActive` ficava stale e as classes `.ag-header-cell-filtered` + `.ag-filter-active` (esta última traz o `::after` com o dot) nunca atualizavam. Fix: `syncColumnFilterActive()` privado seta `column.filterActive` direto + dispatcha **só os eventos da column** (`dispatchColEvent`, escopo local — não vaza pro `eventSvc` global, então InfiniteRowModel não reseta). Wired em `applyFilter()` (após `currentModel = newModel`) + `setModel()` (caminho programático). Smoke real verde em parquet 2.4M rows: dot aparece/some, multi-coluna independente, sem flash branco.

**ICR mecânico fechado — 9 fixes + governance perf (2026-05-12, tarde)** — branch `main` (8 commits sequenciais). Sessão lote consolida tudo que estava aberto em ICR sem precisar de brainstorm metodológico. **A1+A2** overlap markdown exato nos chips "Lado a lado" e "Por código" do ICR Import (prefetch `vault.cachedRead` em `state.sourceTextByFileId`; `collectByCodeContext` substitui aproximação `min(local, incoming)` por overlap espacial real per marker via `findOverlappingLocalMarkers`). **B1** drilldowns Cards/Workflow filtram por `currentSelection` da overview — `filterRegionsBySelection` puro em `regionDerivation` aplicado pos-coleta (não toca scope do extract, §46 verificado); banner inline + clear button nos 2 modes. **B2** drill-down Spatial responde a cliques diferentes na matriz — header descritivo da seleção atual; `collectRelevantFiles` agora intersection pra `pair` (era union, mascarava diferença entre pares) + restringe engine pra `codeEngine`. **B3** modal "ver lado a lado" desabilita chip "par único" quando sem cell selecionada — constructor força `state='all-pairs'` + tooltip orientativo. **A3** map manual de sources problemáticos via `FuzzySuggestModal` filtrado por extensão — pick grava `{ kind: 'map-manual', localFileId }` em sourceOverrides; motor já consumia. **A4** badge "duplicate coder" na rail da ICR Import + border-left warning quando 2+ contribuições do mesmo coderId; tooltip orienta. **Dedup motor (bug latente iluminado pelo A4):** `mergeCoderContribution` faz dedup por markerId via Set pre-built per engine — antes empilhava push sem checar, apply sequencial duplicava silenciosamente. Novo `marker_already_exists` em ConflictRecord conta em `pendingMarkers` pra footer refletir. **D** Tabular ZIP ganha coluna `coder` em segments.csv + `coders.csv` standalone + seção "Inter-coder reliability (Cohen κ)" no README com snippets R (`irr::kappa2`) + Python (`sklearn.cohen_kappa_score`) cruzando `segments × code_applications`. **Governance perf cravada** (CLAUDE.md §8): antes de tocar `extractInputsFromScope`/`cacheKeyForScope`/`reportKappa(Async)`/`collectContestedRegions`/`MarkerMutationEvent`/`SmartCodeCache`/`markerTextCache`/`bboxAdapter`, leitura obrigatória de `TECHNICAL-PATTERNS.md §35-§46` — §46 (visibleCoderIds NUNCA no scope do extract) é regressão recorrente de 4 sessões consecutivas; mapeamento por símbolo + checklist pré-commit. **Seed reproduzível** `scripts/seed-smoke-icr.mjs` deixa cenário smoke fechado (3 coders, 5 codes, 20 markers em `smoke-icr-fixes/` + 2 contribuições em `icr-exports/`). 3456 tests verde (3445 → 3456, +11). ICR aberto agora: só **B4** (weighting cross-engine — decisão metodológica) e **C** (set-valued labels motor κ — refactor grande, brainstorm precede).

**ICR Compare Coders — fixes pós-coder picker + regra perf cravada (2026-05-12)** — branch `main`. 3 commits que destravaram coders criados pós-Saved Comparisons em Compare Coders + corrigem regressão de perf da 4ª sessão. **Fix 1 (40f8b07):** restauração de `lastCompareCodersUsed` e `loadFromSaved` força `coderIds = coderRegistry.getAll()` em vez de aceitar snapshot salvo — coders criados após o último save passam a aparecer como chips no toolbar (antes ficavam invisíveis até reset manual do scope). **Fix 2 (ed030be):** helper `applyVisibleCoderFilter` centralizado em `coderInclusion.ts`; os 3 modes do overview (matrix/table/heatmap) passam a respeitar `visibleCoderIds` quando user toggla chip — antes só `drilldownSpatial` aplicava o filter, tabela κ ignorava. **Fix 3 (a9d49c3) — perf:** lerdeza em toggle de chip resolvida via separação `inclusionScope` (estável, vai pro extract — cache hit) vs `visibleCoderIds` (visual, filtra pos-extract via `filterInputsByCoders` novo). `cacheKey` do report ganha sufixo `'::v=<coders>'` pra distinguir versões. **Bug raiz:** `cacheKeyForScope` inclui `coderIds`; meter visibility no scope invalida cache em todo toggle e re-extrai markers de 7 engines × milhares de markers. Esse padrão regrediu 4× — documentado em `TECHNICAL-PATTERNS.md §46` (ICR Compare Coders — `visibleCoderIds` NUNCA entra no scope do extract) + comments inline nos helpers `applyVisibleCoderFilter` e `filterInputsByCoders` pra bater de cara em quem importar. Tests verde 3450/3450, smoke real verde (chip do bob aparece, toggle filtra tabela, sem lerdeza).

**Slice CSV row marker cross-coder (2026-05-12)** — branch `main` (8 commits, a3d5cf5..4aba6c3). Fecha gap do coder picker em CSV row: agora `1 RowMarker por (fileId, sourceRowId, column, codedBy)` em vez de "primeiro marker da cell vence". Cenários atendidos: ICR formal (2+ coders no mesmo CSV em sessões separadas), LLM-assisted (LLM gera markers preliminares, humano cria paralelos sem mutar), reconciliation (consensus coexiste), solo coding (idêntico ao atual). **Write-path:** `findOrCreateRowMarker` + `setCellComment` filtram por active coder; novo `findOrCreateRowMarkerForCoder` em `addCodeToManyRows`; `removeAllRowMarkersFromMany` + `getCodeIntersectionForRows` filtram; `insertMarkerRaw` (reconciliation canal) preserva `codedBy` do payload sem inferência. **Read-path fora compare mode:** `getCodesForCell` branch `'row'` + `getCellComment` filtram por active coder — cell renderer mostra só trabalho do active coder ("seu trabalho na sua tela"); cross-coder fica no Compare Coders view via stripes. **Popover menu (6 sites em `csvCodingMenu.ts`):** todos usam novo helper `getRowMarkerForActiveCoder(file, row, column)` no model. **Cell renderer:** click handlers consomem helpers per-coder. **View:** subscreve `onActiveCoderChange` pra re-render sem reload. **Invariante** crava o modelo; markers legados sem `codedBy` inferem `'human:default'` em runtime (sem dirty-write em `data.json`). **+15 testes** (3435 → 3450). Spec + plan arquivados em `obsidian-qualia-coding/plugin-docs/archive/claude_sources/{specs,plans}/20260512-csv-row-marker-cross-coder*.md`. **Smoke pendente:** passo 7 do spec §9.3 (popover create vs edit em A2 entre coders) — anotado em ROADMAP §"⚡ Status atual" pra próxima sessão. BACKLOG entry "CSV row marker: shared cross-coder por cell" (descoberto 2026-05-11) resolvido.

**ICR Slice E5b-followup — bbox weighting Mode A + image provenance wire (2026-05-11)** — branch `main`. Substitui avg 50/50 que combinava text-likes κ + bbox κ na matriz Mode A por weighted average natural via `reportPairwise`. Aproveita pipeline existente (reporter.aggregate pondera por `markers.length` per engine) — bbox vira só mais uma engine no pipeline, sem código especial de merge. API: `reportPairwise` + `reportPairwiseAsync` (+ worker + sync fallback) ganham param `perPairInputs?: Map<pairKey, EngineKappaInput[]>` pra inputs já-per-pair (bbox κ via Hungarian é per pair, não cohort-level). Cache: cacheKey-based mantém funcionando — caller (matrix) sufixa `::bbox` quando perPair set, diferenciando renders Cohen-com-bbox de Fleiss/α-sem-bbox. WeakMap identity cache bypassed quando perPair set. `bumpReportCache` (em mutações de marker) invalida normalmente. `bboxScopeExtraction` ganha `computeBboxKappaInputsForPair`. Matrix elimina loop de merge + helper `average` órfão. **Image engine attachSourceHashSnapshot wire** (freebie da slice): fecha provenance audit em 8/8 engines (markdown/pdf-text/pdfShape/csvRow/csvSegment/audio/video/image) — ImageCodingModel.createMarker stampa hash fire-and-forget. **+3 testes** (3432 → 3435). Smoke real verde no workbench. **Limitação metodológica conhecida** registrada em `BACKLOG.md > Weighting cross-engine no aggregate`: `markers.length` é semanticamente heterogêneo entre engines (1 marker pdf-text = região textual; 1 marker bbox = evento Hungarian) — 3 alternativas mapeadas (equal-per-engine / unidade natural / 1-engine-only) pra discussão separada, afeta toda infra weighting.

**ICR Slice E5b — bbox spatial reconciliação cross-engine (2026-05-11)** — branch `main` (CLAUDE.md proíbe worktree). Fecha cobertura cross-engine pra reconciliação P2 — agora **8/8 engines** (markdown, csvRow, csvSegment, pdf-text, audio, video, **pdfShape**, **image**). Slice E5 inteiro completo. `ReconciliationBounds` ganhou variant `{ kind: 'bbox', page?: number, x, y, w, h }` — AABB normalizado 0–1, page presente em pdfShape ausente em image. **Decisão D1: consensus shape em 2D = AABB-union rect** (sempre `type:'rect'` independente de shapes originais rect/ellipse/polygon — consistente com 1D `unionOfBounds` min-max; intersect rejeitado por degenerar pra ≈vazio quando IoU=θ). **D3: cluster θ no collector = motor θ (0.5 COCO)** — knob único evita semântica divergente entre matching (κ) e clustering. **D4: union-find no grafo IoU≥θ, não Hungarian** — Hungarian é pairing ótimo 1:1 entre 2 coders, não generaliza pra N>2; queremos componentes conexas. 6 switches sincronizados (`isValidBounds`/`unionOfBounds`/`sameBounds`/`regionKey`/`formatBoundsLabel`/`formatBoundsShort`/`sameBoundsLocal`). `collectBboxRegions` novo: rasterize lazy 1×/marker por scope, AABB early-out antes do bitmap AND, union-find no grafo IoU. Adaptive grid 200/400 inline (mesma heurística do bboxAdapter). `IcrMarkerOpsImpl` ganha 2 ramos: createPdfShapeMarker (insertShapeRaw novo no PdfCodingModel) + createImageMarker (insertMarkerRaw novo no ImageCodingModel). `getModelForUpdate('pdfShape')` adapta API distinta (addCodeToShape/findShapeById vs addCodeToMarker text). `findMarkersInRegion(bbox)` usa AABB overlap (não IoU) — bounds é AABB-union do cluster, markers originais batem por construção. **Image engine ao coder picker (gap pré-existente fechado nesse slice):** ImageCodingModel era a 8ª engine fora do coder picker — createMarker não stampava codedBy. Smoke E5b revelou: markers da UI ficavam órfãos. Constructor passou de `(dataManager, registry)` pra `(plugin, registry)`, createMarker stampa `codedBy: plugin.getActiveCoderId()`. 3 test instantiations atualizadas pro shape `{ dataManager, getActiveCoderId } as any`. **Smoke real verde 2026-05-11** em vault workbench: 2 coders desenharam bboxes em test-bbox.png com IoU ≈ 0.8, drill-down Cards lista contestada com display `bbox 35.3%,25.8% (32.7×47.2%)` (AABB-union dos 2 rects), Adopt criou consensus rect codificado por `consensus:default`, Workflow → Resolvidas → Reverter restaurou estado original. **+18 testes** (3414 → 3432): 11 IcrMarkerOpsImpl bbox + 7 collectBboxRegions. Lição: smoke real revelou gap de wiring (image coder picker) invisível pra typecheck + mocks. Reforça "Smoke real obrigatório a CADA chunk" — documentado em CLAUDE.md §"Furos sistemáticos".

**ICR Slice 1 — Motor κ texto (2026-05-09)** — branch `feat/icr-slice-1-motor-kappa-texto`. Schema `codedBy?: CoderId` em todos marker types (BaseMarker / Marker / SegmentMarker / PdfMarker), CoderRegistry com seed default `human:default` + createHuman/createLLM, integração no plugin onload (persiste via setSection). Função pura κ paramétrica por geometria de overlap — adapter per-character cobrindo markdown + PDF text + CSV cod segment via TextRange normalizado. 5 coeficientes em arquivos separados: Cohen κ pareado, Fleiss κ N-coders, Krippendorff α nominal, α-binary (boundary detection), cu-α (code agreement within shared boundaries). Reporter retorna per-engine + agregado por média ponderada por #markers (fórmula sujeita a revisão). Seed sintético em `scripts/seed-icr-corpus.mjs`: 3 coders (default + carla + joana), 5 codes (Frustração / Confiança / Crítica institucional / Estratégia / Limitação técnica), 20 markers em pasta `ICR-test/` (2 .md + 2 PDFs + 1 CSV) com 3 padrões de divergência: perfect agreement, boundary disagreement, code disagreement. **62 testes ICR novos** (2814 → 2876 verde). Slice 1 valida motor end-to-end sem UI; slices subsequentes destravam View Compare Coders, Reconciliação UI, e adapters pra cod row / áudio/vídeo / PDF shape / imagem.

**ICR Slice 2 — Hash por source (2026-05-09)** — branch `feat/icr-slice-2-hash-source`. Primitiva SHA-256 via `crypto.subtle.digest` (`computeSourceHash` função pura). `SourceHashRegistry` com `getOrCompute` lazy + `recompute` (reporta if changed) + `renameEntry` + `removeEntry` + `findByHash` + `addOnMutate` events (compute / recompute / rename / remove) + toJSON round-trip. Schema additive: `sourceHashes?: Record<fileId, { hash, computedAt, fileSize }>` em QualiaData. Plugin onload instancia registry + 3 vault listeners: `rename` sincroniza fileId, `delete` remove entry, `modify` recomputa hash e — se mudou — invalida `markerTextCache` para o file. **Consumer 1:** `csvModel.invalidateMarkerTextCacheForFile(fileId)` público chamado pelo listener modify. **Consumer 2:** rename detection via `renameEntry` — entry move do oldPath pro newPath sem perder hash. **Consumer 3:** QDPX import dedup em `extractSource` — antes de criar duplicata em `imports/<projectName>/`, busca match por hash em sources já registrados; se encontrar, reusa path existente. **24 testes ICR novos** (2876 → 2900 verde). Out of scope, registrado em `BACKLOG.md > 🧱 ICR — Hash consumers fora do Slice 2`: Smart Code cache hash invalidation, provenance audit field nos markers, backup integrity validation, cross-vault remap (último gateia Fase C — transport multi-coder remoto).

**ICR Slice 3 — Fase C P0 transport puro (2026-05-09)** — branch `feat/icr-slice-3-fase-c-p0-transport-puro`. Funções puras de transport multi-coder remoto: `extractCoderContribution(data, coderId, hashRegistry)` filtra markers por `codedBy` em md+pdf+csvSegment + coleta codes/groups referenciados + sources com hash + coder full + computa codebookVersion (SHA-256 sobre canonical serialization). `mergeCoderContribution(localData, payload, hashRegistry)` aplica payload via mutação direta — codebook divergence detection (warning, não bloqueia), coder registration se ausente, cross-vault remap embutido (lookup hash no registry local → remapeia fileId), code merge (incoming wins on diff + emit `code_overwritten` conflict), group merge (skip se existe), marker insertion per engine com fileId remapped. `crossVaultRemap` puro: match único → silencioso, múltiplos → primeiro alfabético + warning, zero → `source_not_found` conflict. `computeCodebookHash` ignora campos voláteis (createdAt/updatedAt) pra estabilidade entre vaults. Plugin expõe `icrTransport.extract(coderId) / merge(payload)` chamável via console DevTools (sem UI ainda). Smoke test cobre cenário cross-vault end-to-end (paths divergentes resolved via hash + partial merge com source missing). **26 testes ICR novos** (2900 → 2926 verde). Out of scope, registrado em `BACKLOG.md > 🧱 ICR — Fase C P1 (UX layer, fora do Slice 3)`: comando/menu pra exportar, modal preview de import, side-by-side compare + cherry-pick, conflict resolution UX, multi-import staging, codebook divergence resolution UX, source divergente alert UX, engines não-texto.

**ICR Slice 4 — Adapters cod row + áudio/vídeo (2026-05-09)** — branch `feat/icr-slice-4-adapters-codrow-media`. Refactor pequeno: `totalChars → totalUnits` em `SourceMeta` (semântica genérica pra todas engines, unit pode ser char ou segundo). Adapter `extractMediaRange` (audio/video) — `Math.floor(from)` / `Math.ceil(to)` arredonda pra inteiros de segundo, alinhado com ATLAS.ti 25; reusa coeficientes existentes (Cohen/Fleiss/α/α-binary/cu-α) — só muda espaço de coordenadas. Adapter `extractRowMarkerUnit` + `CategoricalKappaInput` (cod row sem geometria) — 3 coeficientes categóricos novos (`cohenKappaCategorical`, `fleissKappaCategorical`, `krippendorffAlphaCategoricalNominal`) operam sobre matriz de confusão de unit-level decisions, sem char explosion. `RowMarker.codedBy?: CoderId` adicionado no schema. Reporter `EngineId` expandido pra `csvRow | audio | video`; aceita union `KappaInput | CategoricalKappaInput`; emite `aggregateWarnings` quando engines de unidades incomparáveis (chars/segundos/categórico) entram juntos no aggregate. Smoke multi-engine cobre markdown + audio + csvRow simultaneamente + boundary disagreement em audio. **23 testes ICR novos** (2928 → 2951 verde). Cobre 5 das 6 engines do plugin. Out of scope, registrado em `BACKLOG.md > 🧱 ICR — Adapters fora do Slice 4`: PDF shape + imagem (bbox IoU — terreno aberto, brainstorm metodológico precede), resolução sub-segundo, pre-warm de durações de media files.

**ICR Slice 5 — Provenance audit (2026-05-09)** — branch `feat/icr-slice-5-provenance-audit`. Schema additive: `sourceHashAtCoding?: string` em todos marker types (BaseMarker + Marker + Segment/Row + Pdf/PdfShape + Media + Image). Helper público `attachSourceHashSnapshot(marker, hashRegistry)` muta marker in-place adicionando snapshot do hash atual; idempotente (não sobrescreve) + swallow errors (file not found não throw). Função pura `detectStaleMarkers(data, hashRegistry)` itera markers em todas 6 engines (md/pdf/csv segment/csv row/image/audio/video) e classifica cada um: `fresh` (snapshot bate com hash atual), `stale` (diverge — adicionado em report.stale[] com markerId/fileId/engine/snapshotHash/currentHash), `inconclusive` (sem snapshot OU source não acessível). Wire piloto em `markdown.codeMarkerModel.findOrCreateMarkerAtSelection`: fire-and-forget após criar marker, com `saveMarkers()` no callback pra persistir snapshot. Plugin API expõe `icrTransport.detectStaleMarkers()` chamável via console. **10 testes ICR novos** (2951 → 2961 verde). Out of scope, registrado em `BACKLOG.md`: wiring em outros engines (slice de extensão futuro — mesmo padrão), UI pra mostrar stale markers (Fase C P1, gated em UX brainstorm), auto-recompute snapshot, migração ativa de markers existentes.

**ICR Slice E2 — Compare Coders Modes B/C + Modal + bbox + polish E1 (2026-05-10)** — branch `main` (sem worktree). Segunda camada da Compare Coders View: completa overview (Mode B tabela por código + Mode C heatmap código×engine), integra bbox engines (pdfShape + image) via per-pair pathway, ativa coefficient picker funcional + filter "esconder agreement total" + polish E1 (κ=0 vacuous), entrega Modal "ver lado a lado" com diagnóstico narrativo. **9 módulos novos em `src/core/icr/ui/`:** `coefficientResolver` (`getCoefficientValue` extrai número do KappaReport — Cohen pareado direto, demais scalar; `isCoefficientApplicable` checa N coders + tipo engines), `coefficientPicker` (5 chips toolbar Cohen/Fleiss/α/α-binary/cu-α com disabled state), `bboxScopeExtraction` (`computeBboxKappaForPair` wrap `bboxAdapter.buildKappaInput` per-pair em modes unified/split), `overviewSharedRender` (`kappaClass` extraído pra reuso entre 3 modes), `overviewTable` (Mode B — 1 row por code × 5 coeficientes, sort default por pior κ ascendente, Cohen pra N=2 / Fleiss pra N≥3), `overviewHeatmap` (Mode C — codes × engines visíveis + spatial-bbox unified default ou pdfShape | image split, bbox via avg de C(N,2) Cohen pareados pra N>2), `coderInclusion` (`getCodersWithMarkersInScope` + `applyCoderInclusion` — polish E1 esconde coders com 0 markers default off), `narrativeDiagnostic` (3 padrões reconhecíveis: cohen baixo + α-binary alto = código diverge / cohen baixo + α-binary baixo = boundary disagreement / cu-α << κ gap ≥ 0.4 = code-within-boundary), `compareCoderCoefficientsModal` (extends Modal, 2 estados toggle single-pair/all-pairs, breakdown per-engine em single-pair, diagnóstico em caixa amarela, export markdown clipboard com Notice; field `compareScope` evita colisão com `Modal.scope` da API). **Mode A matriz** lê `state.primaryCoefficient` via `getCoefficientValue` (não mais Cohen hardcoded); bbox merge avg 50/50 com text-likes quando ambos contribuem (weighting proper via #events vai pra backlog). **Engine filter chips** no toolbar (markdown/pdf/csv-seg/csv-row/audio/video) toggle ad-hoc — preenche gap até Saved Comparisons no E4. **Filter "esconder agreement total"** funcional nos 3 modes — fade opacity 0.25 em cells/linhas com κ > 0.8. **Filter "incluir coders sem markers"** + chip is-empty (cinza claro + tooltip) quando coder filtrado. **Setting `general.showNarrativeDiagnosis`** (default true) — opt-out global pra power-users que acharem ruído. **Botão `↗ ver lado a lado`** no toolbar abre modal — sem cell selecionada em "todos pares"; com `kind:'pair'` em "par único" pré-filtrado. **Smoke real verde 2026-05-10** em vault com seed sintético (3 coders + 5 codes + markdown/pdf/csv markers + 2 PDF shapes + 2 image markers seedados pra validar bbox merge). ~75 testes novos (3075 → 3150 verde). Tag `post-icr-slice-e2-checkpoint`. Spec: `docs/superpowers/specs/2026-05-09-icr-compare-coders-design.md` §3.2/§3.3/§6. Plan: `docs/superpowers/plans/2026-05-10-icr-slice-e2-modes-bc-modal.md`. Out of scope, registrado em `BACKLOG.md > 🧱 ICR — Compare Coders polish`: bbox weighting via #events em matriz Mode A (avg 50/50 é aproximação) + drill-down P1 não-responsivo a clicks (revisita em E3) + modal toggle "par único" sem pair selecionado mostra all-pairs (decisão UX). Próximos: E3a/b (Reconciliação UI — schema audit + executeReconciliationDecision + P2 cards + P3 queue), E4 (Saved Comparisons + ribbon + atalho contextual).

**ICR Slice E1 — Compare Coders skeleton + Mode A + P1 spatial (2026-05-10)** — branch `feat/icr-compare-coders-e1` (rebase + ff merge). Primeira camada de UI sobre o motor ICR — abre a frente "View Compare Coders + Reconciliação UI" do ROADMAP. 7 módulos novos em `src/core/icr/ui/` (compareCodersTypes / unifiedCompareCodersView / overviewMatrix / scopeExtraction / drilldownSpatial / compareModeColoring / filterChips) + helper `reportPairwise` no reporter + hook `setCompareMode`/`clearCompareMode` em `csvCodingView`. `UnifiedCompareCodersView` extends `ItemView` per project pattern (constructor `(leaf, plugin)`); toolbar sticky com 2 mode pickers (matrix ativo, table/heatmap disabled — E2) + estado central + delega renders pra módulos. **Mode A matriz coder×coder:** Cohen κ pareado por célula via `reportPairwise(inputs, pairs)` (helper novo: Cohen direto de `aggregate.cohenKappa`; Fleiss/α/cu-α/α-binary via input filtrado ao par); color scale fixo (vermelho<0.4, laranja<0.6, verde claro<0.8, verde escuro >0.8); diagonal cinza; click→pair selection. **`extractInputsFromScope` cohort-level adapter:** itera 5 engines (md/pdf/csvSegment/csvRow/audio/video), filter por `scope.codeIds`/`fileIds`/`coderIds`, chama per-marker extractors dos slices 1+4 (`extractMarkdownRange` etc), produz `EngineKappaInput[]`. `vault.cachedRead` pra source text de markdown (offsets line/ch → char absoluto). Bbox engines (`pdfShape`, `image`) explicitamente pulados — per-pair pathway do Slice 6 fica pra E2 (Modes B/C + Modal). **Drill-down P1 spatial:** lista files do escopo + lanes per coder com `[ code-label ]` colorido pelo código pra markdown/pdf-text/csv-segment; lane vazia (`—`) quando coder não tem markers; csv-row delega pra `csvCodingView.setCompareMode({ markerIndex, coderColors })` que usa cellStyle real do AG Grid (gradient N stripes via `computeRowGradient` puro). **Filter chips:** toggle coders (modifica `filters.visibleCoderIds`) + "destacar conflitos" + "esconder agreement total". Comando palette `Compare Coders: Open` (view type `qc-compare-coders`). CSS isolado em `styles.css` (qc-cc-* prefix, ~250 LOC). **Smoke real verde 2026-05-10** em vault com seed sintético (3 coders + 5 codes + 20 markers em ICR-test/) — matriz 3×3 com Cohen κ correto, drill-down P1 mostra lanes coloridas, filter chip toggle reativo, csv-row hint funcional. **43 testes novos** (3032 → 3075 verde). Tag `post-icr-slice-e1-checkpoint`. Spec aprovada em 2 iterações de revisão + plano em 5 iterações em `docs/superpowers/{specs,plans}/2026-05-09-icr-compare-coders-*.md`. Out of scope, registrado em `BACKLOG.md > 🧱 ICR — Compare Coders polish`: Default coder κ=0 vacuous (UX confunde quando coder no registry sem markers no escopo) + bbox em matriz/heatmap (E2). Próximos slices: E2 (Modes B/C + Modal "ver lado a lado" + coefficient picker + bbox integration), E3a (Reconciliação P2 — schema audit + executeReconciliationDecision + cards de leitura cruzada), E3b (Workflow P3 — queue + revert + κ pré/pós), E4 (Saved Comparisons + ribbon + atalho contextual).

**ICR Slice 6 — Adapter bbox PDF shape + Image (2026-05-09)** — branch `main` (CLAUDE.md proíbe worktree neste projeto). 6 módulos novos em `src/core/icr/`: `bboxNormalize` (bridge PdfShapeMarker.coords ↔ ImageMarker.coords → PercentShapeCoords comum, isolando inconsistência preexistente do image engine que aceita `shape: 'ellipse'` mas não tem `EllipseCoords`), `bboxRaster` (rasterize rect/ellipse/polygon em grid 200×200 normalizado [0,1] com clip-to-viewport — Uint32Array packed), `bboxIoU` (intersection over union com AABB early-out + AND bit-a-bit + popcount32 SWAR), `bboxMatcher` (Hungarian/Munkres O(max(N,M)³) com padding BIG=1e9 finito — INF causa NaN em JS — + match() com θ post-cutoff → AlignmentEvent[]), `bboxKappaInput` (matched event → 2 markers no mesmo índice i, unmatched → 1 marker), `bboxAdapter` (entry point per-pair, scope grouping `fileId:page:N` ou `fileId:`, adaptive resolution 400×400 quando bbox <0.01% área OU min-dim < 2/gridSize, pre-handla casos 0×N e N×0 antes de chamar match). Reporter `EngineId += 'pdfShape' | 'image'` (família spatial-bbox + warning aggregate cross-unit estendido). `main.ts` expõe `__icrSmoke` handle pra console. `docs/ICR-METHODOLOGY.md` user-facing pra pesquisador citar em paper. Algoritmo: bbox-as-unit binário + Hungarian + κ pareado, default θ=0.5 (alinhado COCO). Multi-coder N>2 reportado como matriz triangular C(N,2). **49 testes ICR novos** (168 → 217 em tests/core/icr/). **6 das 6 engines cobertas — fecha o motor κ multimodal completo.** Spec autoritativo em `obsidian-qualia-coding/plugin-docs/superpowers/specs/2026-05-09-icr-bbox-adapter-design.md` com Appendix A (alternativas rejeitadas: cu-α com IoU contínuo β / per-código matching γ / greedy M2 / many-to-one M3 / hardcoded θ T1 / multi-θ COCO-style T3 / auto-θ T4 / IoU analítico B1 / AABB approx B2 / híbrido B4 / clustering N-way) + Appendix B (methodology user-facing extraído pra docs/ICR-METHODOLOGY.md). Limitação herdada do motor κ: multi-código reduzido a first-code alfabético — afeta TODAS as engines, refactor separado.

### Added

- **χ² tautológico — visual feedback no Code Metadata mode** — walk recursivo no `PredicateNode` (`src/analytics/data/codeMetadata.ts`) detecta Smart Codes cujo predicate referencia a `variableName` sendo plotada (caso em que χ² é estatisticamente sem sentido — todos matches caem na mesma coluna por construção). Cobre AND/OR/NOT + 10 leaf kinds + `smartCode` nesting com cycle protection via `visited` set. Novo campo `tautologicalForVariable?: boolean` em `CodeMetadataResult.codes`; renderer marca canvas label com prefix `⚠ ` + tooltip ganha linha amarela explicando por que χ² é tautológico ali.
- **Dendrogram cluster count preview no slider** — `Cut Distance: 0.50 → 5 clusters` no título da seção de options, atualizado post-render via novo `lastDendrogramClusterCount?` em `AnalyticsViewContext`. Count durante drag não atualiza real-time (rodar linkage por keystroke seria caro em codebooks grandes); aproximação post-render é suficiente. Classe própria `.codemarker-dendrogram-cut-title` evita colisão com outros modes.
- **Settings size warnings — bounds validation** — Parquet/CSV size warning aceita 1-10000 MB; valor inválido dispara Notice descritivo e revert pro último valor válido. Validação no `blur` (não `onChange`) evita Notice spam por keystroke.

### Changed

- **Strings em inglês throughout** — pt-br residual removido do code visibility popover (`'Códigos neste documento'` → `'Codes in this document'`; `'Nenhum código aplicado neste doc.'` → `'No codes applied in this document.'`) e do hydrator status no Code Explorer toolbar (`'Hidratando previews…'` → `'Hydrating previews…'`).
- **Empty states com CTA** — `'Marker not found.'` agora sugere arquivo deletado; `'No segments yet.'` sugere apply este código; `'No codes yet.'` aponta pro botão `+` de criação.
- **`'Done' → 'Materialized'`** no Materialize all memos modal (mais domain-specific que generic).
- **MCA insufficient data com contagens reais** — `'Insufficient data for MCA: have N markers and M active codes. Need ≥2 markers and ≥2 codes that co-occur.'` em vez de mensagem genérica sem números.
- **Image marker fallback label alinhado com PDF** — `'Polygon'`/`'Rectangle'`/`'Ellipse'` (capitalizado, sucinto) em vez de `'Polygon region'`/`'Image region'`. Match estrutural com PDF (`'Page N'`).
- **Truncation `'…'` Unicode → `'...'` ASCII** em 3 arquivos analytics + CSV (alinhado com `previewText` helper centralizado em `markerResolvers.ts`).
- **CI workflow roda e2e suite completa** (19 specs / 66 testes) em vez de só `smoke.e2e.ts`. Coverage gate Vitest já estava habilitado (30% statements/lines/functions, 25% branches).
- **`minAppVersion` 1.5.0 → 1.7.0** no manifest (Obsidian 1.7 release de mid-2024, conservador frente ao current 1.12.x).
- **`N_FILES_WARN_THRESHOLD` da Files Dendrogram 200 → 150** com comentário explicando custo O(n³) clustering vs O(n²) do File Similarity.
- **`SOURCE_COLORS` palette unificada** — `acmMode` (dict local duplicado) + `frequencyMode` (`#42A5F5` hardcoded) agora importam de `chartHelpers`.
- **`TRIVIAL_THRESHOLD` do MCA com docstring** explicando origem (row/column profile centering força dimensão degenerada que precisa ser pulada) e quando o threshold falha.

### Fixed

- **Image menu position com bounds clamp** (`src/image/views/imageView.ts:227-237`) — não abre offscreen quando shape está no canto inferior/direito do viewport; `Math.max/min` clampa pra dentro do viewport.
- **Image regionLabels fallback color theme-agnóstico** — `#888` em vez de `#6200EE` (purple invisível em light theme). Fabric.js não consome CSS vars, requer literal.
- **Image toolbar shortcut em mode fora da whitelist** — agora gera `console.warn` (era silent fail).
- **Clear cache error inclui contexto** — `'Failed to clear cache for ${path}: ${err}'` em vez de raw `err.message`.
- **Tooltip `(undefined)` fallback** no `drawToolbarFactory` quando shortcut ausente.
- **CSS class `.codemarker-margin-label` font-size** — 11px (CSS class agora é fonte da verdade; eliminou conflito com inline style 11px que sobrescrevia o CSS 10px).
- **MCA bench test pré-existente** — `calculateMCA` era chamado com 3 args (assinatura antiga); 0.4.2 mudou pra 4 args separando codeIds vs codeNames mas o bench ficou drift. Atualizado.

### Removed

- **2 `console.log` debug solto em `main.ts`** (DuckDB smoke + markers tmp inspect — Notice já mostra ao user; warns/errors mantidos pra silent fail visibility).
- **README menção a Intercoder reliability** — feature ainda não implementada (LLM-assisted coding mantido pois doc reflete pesquisa real em andamento).
- **5 `(e as any).entity` vestigiais em `auditLog.ts`** — `AuditEntry.entity` já existe no tipo `BaseAuditEntry`; casts eram obsoletos. Coalesce de text edit usa `Extract<AuditEntry, { to: string }>` pra narrow apropriado nas variants com `to`.
- **3 `as any` em `dataManager.deepMerge`** — viram `Record<string, unknown>` casts + generic constraint `T extends object`. Type safety melhor sem perder flexibilidade.
- **12 inline styles repetidos** viram 2 CSS classes shared:
  - `.qc-hidden-input` (position absolute + opacity 0 + pointer-events none) substitui pattern em 2 hidden color inputs (`baseCodeDetailView` recolor + promptColor).
  - `.qc-scroll-container` (overflow-y auto + position relative) substitui pattern em 3 scroll containers (`detailCodeRenderer` × 2 + `detailRelationRenderer`); `max-height` segue inline (dinâmico via vh constants).
- **8 inline styles do segment editor header** viram `.csv-segment-editor-header` CSS class.
- **Inline `font-size: 11px`** do margin panel label (movido pro CSS class).

## [0.4.2] — 2026-05-08 — Pre-alpha

Filter de parquet/CSV lazy mode reescrito pra eliminar o flash branco entre keystroke e resultado. Bug latente do MCA Biplot identificado e corrigido no caminho.

### Added

- **LazyTextFilter custom** (`src/csv/duckdb/lazyTextFilter.ts`) — substitui `agTextColumnFilter` padrão em todas colunas reais + virtuais (cod-frow/cod-seg/comment) em parquet/CSV lazy mode. Pre-fetch da query DuckDB (count) antes de notificar AG Grid + chama `gridApi.refreshInfiniteCache()` em vez de `params.filterChangedCallback()` (que dispara `purgeInfiniteCache` sync e causava o flash branco). UI replica `agTextColumnFilter`: 8 operadores (contains/notContains/equals/notEqual/startsWith/endsWith/blank/notBlank) + AND/OR + 2 conditions, caret SVG via pseudo-element no wrapper (Obsidian sobrescreve `background-image` em `<select>` com specificity maior), spinner discreto durante pre-fetch. Schema do model compatível com `buildWhereClause`/`buildVirtualFilterClause` existentes — split real vs virtual via `splitFilterModel`.

### Fixed

- **MCA Biplot mostrando "Insufficient data" mesmo com dados suficientes** — `calculateMCA` recebia `enabledCodeNames` (nomes humanos) mas comparava com `marker.codes` que contém IDs (`c_XX`) pós Phase C de migração. Match nunca acontecia → matriz Z toda zero → return null. Funcionava por coincidência apenas quando codes eram "órfãos" (sem definição no registry — `consolidateCodes` faz fallback `name = codeId`). Fix: assinatura `calculateMCA(markers, codeIds, codeNames, colors)` separa matching (IDs contra `marker.codes`) de display (`codePoints[].name` via codeNames paralelo). 2 callers atualizados (`renderACMBiplot`, `buildACMRows`). Testes existentes (8/8) atualizados pra nova assinatura.

### Changed

- `setRowCount(filteredCount, true)` + `ensureIndexVisible(0)` + `refreshInfiniteCache()` + listener one-shot `modelUpdated` → `refreshCells({ force: true })` no fluxo de filter pra forçar re-render das virtual cells (que têm `field` apontando pra coluna inexistente no parquet — AG Grid não detecta change automaticamente).
- `valueGetter` retornando `__source_row` adicionado nas virtual cols cod-seg/cod-frow pra ajudar AG Grid a detectar mudança natural quando bloco refresca.
- BACKLOG: §🪶 "Layout shift no filter de virtual cols" removido (resolvido). Registro adicionado ao 2026-05.

### Trade-off conhecido

Cells virtuais (cod-seg/cod-frow/comment) têm delay ms-pequeno no swap visual após filter — efeito do mecanismo `refreshInfiniteCache` que intencionalmente mantém DOM visível durante re-fetch (é exatamente o que elimina o flash branco). Cells reais atualizam imediato porque o value muda (parquet entrega dado novo). Trade aceito sobre voltar a `purgeInfiniteCache` (que tinha o flash).

## [0.4.1] — 2026-05-08 — Pre-alpha

Patch focado em performance e robustez do export enriquecido. Code Explorer build em vault com muitos markers caiu de ~30 s pra ~13 s (2.3× mais rápido) via yield UI + chunks 10× maiores + paralelização de queries por column + migração de inline styles dinâmicos pra CSS classes/vars. Export Parquet enriquecido ganha multi-file fallback automático quando single-file estoura OOM no DuckDB-Wasm worker — máquina-agnóstico, runtime-detect via regex. Modal info dinâmica de carga estimada (markers count + MB comments + vcols enabled) pra dar visibilidade do peso antes do export.

### Added

- **Export Parquet enriquecido — multi-file fallback automático** — quando o single-file COPY estoura OOM no DuckDB-Wasm worker (cap 4 GB wasm32), o wrapper detecta via regex (`/Out of Memory|Allocation failure|memory access out of bounds/i`) e ativa automaticamente caminho multi-file: `<base>.qualia-enriched/part-NNN.parquet`, chunks de 500k source rows escritos direto no vault e dropados do virtual fs entre cada chunk (worker peak ~1.5 GB stable em vez de estourar). Decisão dinâmica em runtime — máquina-agnóstico, sem hardcode de teto por classe de hardware. Notice de fallback inclui inline o comando pra ler o dataset (`read_parquet('dir/*.parquet')` ou `pd.read_parquet('dir/')`).
- **Export modal — info dinâmica de carga estimada** — quando format = "Parquet enriquecido", mostra `Estimated load: X markers, Y MB of comment text, Z virtual columns enabled` + behavior expectation `Output: <name>.qualia-enriched.parquet (single file). Auto-fallback to <name>.qualia-enriched/ folder with parts if memory limit hit on this machine.` Descritivo, não preditivo — sistema reage ao runtime, modal só dá visibilidade do peso.
- **Stress test seed gerador** — `scripts/seed-stress-export.mjs` parametrizado via `--scenario=baseline|long-comments|many-codes|pathological|between-1|between-2`. Mocka markers + codes synth direto no `data.json` (sem passar pelo UI), com backup automático antes de mutar. Reproduz cenários de stress do export enriquecido em parquet target. Tabela de teto empírico na M1 8GB documentada no BACKLOG.

### Performance

- **Code Explorer build latency em vault com muitos markers — `~30 s → ~13 s` (2.3× mais rápido)** — diagnóstico via DevTools profile (2026-05-08) identificou cadeia: `populateMissingMarkerTextsForFile` fazia 200 chunks × ~5 cols sequenciais = ~1000 round-trips DuckDB-Wasm × ~20-30 ms cada (postMessage saturava microtask queue). Aplicadas 3 mitigações:
  - Yield UI entre chunks (`await new Promise(r => setTimeout(r, 0))`) — paint cycle livre durante hidratação. Custo: ~800 ms adicional num pathological 200k markers.
  - `chunkSize=1000` → `chunkSize=10_000` (10× menos round-trips) + paralelização das queries por column dentro de `batchGetMarkerText` via `Promise.all`. Worker DuckDB-Wasm é single-threaded (sem pthread), mas postMessage paralelo elimina idle entre awaits.
  - Inline `style.paddingLeft`/`style.height`/`style.position` (per code, per file group, per virtual list row) → classes + CSS vars (`.qc-explorer-code-self`, `.qc-explorer-list`, `.qc-vlist-row` com `--qc-depth`/`--qc-list-height`/`--qc-row-top`). Reduz Recalculate Style cumulative.

### Documentation

- BACKLOG: tabela de teto empírico do export enriquecido na M1 8GB (single-file aguenta até ~150k markers + ~54 MB comments + 12 vcols; multi-file fallback aguenta tudo). Em máquinas maiores o teto será mais alto — fallback automático cobre seja qual for.
- Spec `tabular-virtual-cols-design` movida pro workspace externo (`obsidian-qualia-coding/plugin-docs/archive/claude_sources/specs/`) — convenção: spec preservada como snapshot do raciocínio pré-implementação; ARCHITECTURE/CHANGELOG/commits viram source of truth.

## [0.4.0] — 2026-05-07 — Pre-alpha

Tabular virtual cols viram cidadãs de primeira em parquet/CSV lazy: persistem visibility, ganham filter UI server-side via DuckDB e exportam como Parquet enriquecido (cols originais + `<col>__codes_frow`/`__codes_seg`/`__comment` joined single-pass). Sidebar passa a previewar markerText pra arquivos lazy não hidratados via background hydrator (cobre cold start de vault migrado). Misc fixes em race conditions OPFS/inflight, virtual list timing e label whitespace-only. PDF undo stack removido pra eliminar inconsistência cross-engine.

### Added

- **Tabular virtual cols — persist + filter + export** — feature integrada cobrindo 3 defeitos correlacionados em parquet/CSV lazy mode:
  - **Persist visibility** — `data.json csv.fileMeta[fileId].enabledVirtualColumns` armazena field names das virtuais (cod-frow/cod-seg/comment) toggled via `ColumnToggleModal`. `restoreEnabledVirtualColumns` re-aplica no file open (eager + lazy) com GC pra entries cuja source col não existe mais. Antes: toggle sumia ao fechar/reabrir.
  - **Comment storage layer** — campo opcional `comment?: string` em `RowMarker` (granularidade per-cell). `setCellComment(file, sourceRowId, column, value)` + `getCellComment` na model. Comment colDef ganha `valueGetter`/`valueSetter` que persistem via model. Antes: editor existia mas zero infra de save (dead UI).
  - **Filter unification** — AG Grid native filter (popover Contains/Equals/StartsWith/etc) ligado nas 3 virtuais em lazy. `splitFilterModel` separa cols reais de virtuais. `virtualFilterResolver` traduz pra SQL contra temp table DuckDB de markers (`__source_row IN (SELECT source_row FROM qualia_markers_<id> WHERE ...)`). Pré-resolve nome → code_id JS-side contra registry. Suporta text filter ops (contains/notContains/equals/notEqual/startsWith/endsWith/blank/notBlank). Antes: filter desabilitado em lazy (`filter: !lazy`).
  - **Markers temp table DuckDB** — `QualiaMarkersTable` per-file (`src/csv/duckdb/qualiaMarkersTable.ts`), long format, build via `insertArrowTable` (single call, scaling validado em spike: ~25ms warmup + 200μs/row sustained). DROP IF EXISTS pra hot-reload safety. Indexes em source_row, code_id, kind+column_name. Schema preparada pra LLM (status accepted/suggested, created_by human/llm, created_at) sem features LLM implementadas — DDL change posterior seria caro.
  - **Sync via onMarkerMutation** — `BatchedMutationApplier` (`src/csv/duckdb/batchedMutationApplier.ts`) coalesce events do canal SC3 em rAF batches. Modo único: human-pace (1-2ms) e LLM batch (5k events em poucos ms via INSERT VALUES bulk). Recovery em falha mid-batch: dispose + rebuild idempotente.
  - **Export "Parquet enriquecido"** — botão novo no `ExportModal` + command palette `Export active parquet with codes (enriched parquet)`. Reusa temp table; SQL COPY com CTE per virtual col + LEFT JOIN single-pass. SNAPPY + ROW_GROUP_SIZE 50000 + `preserve_insertion_order=false` pra reduzir memory pressure no DuckDB-Wasm worker (3.1 GiB cap em wasm32). Output: `<stem>.qualia-enriched.parquet` adjacente, com cols originais (sem `__source_row` interno) + `<col>__codes_frow`/`__codes_seg`/`__comment` (double underscore por compat downstream).
  - Spec: `docs/superpowers/specs/20260506-tabular-virtual-cols-design.md`.

- **Sidebar markerText preview pra arquivos lazy** — `MarkerPreviewHydrator` (`src/csv/markerPreviewHydrator.ts`), orchestrator stateful que popula `markerTextCache` em background quando consumers (Code Explorer, Code Detail, Smart Code list/detail, Memo View by-code) renderizam markers em parquet/CSV lazy não hidratados. Trigger per-file via `requestHydration(fileId)` idempotente (dedup `seen + inflight`). Re-render via `csvModel.notifyListenersOnly()` debounced via RAF. Status indicator `Hidratando previews… X/Y` no toolbar do Code Explorer. Cobre cold start de vault migrado (QDPX import). Provider reuse com file aberto (sem download/CREATE TABLE duplicados). Spec: `docs/superpowers/specs/20260506-sidebar-markertext-preview-lazy-design.md`.

### Fixed

- **VirtualList timing** (`virtualList.ts`) — `setItems` chamado síncrono pós-criação retornava `clientHeight=0` (browser ainda não recalculou layout), limitando rows mounted ao buffer default. Fix: `requestAnimationFrame` defer adicional pra renderVisibleRows após paint cycle. Bug latente exposto após `prepopulateMarkerCaches` deixar de ser caminho de re-render (race fix lazy/hydrator).
- **OPFS race prepopulate vs hydrator** — `prepopulateMarkerCaches` lazy path criava `DuckDBRowProvider` paralelo ao hydrator → erro `createSyncAccessHandle` ("Access Handles cannot be created if there is another open Access Handle"). Lazy path removido do prepopulate; hydrator é única autoridade pra OPFS lazy.
- **Hydrator inflight bookkeeping** — wrapper IIFE garante `inflight.set` antes de runBatch + `inflight.delete` no finally do wrapper. Eager path (síncrono, sem await) deletava do inflight antes do set acontecer → fileId ficava órfão (causa do "Hidratando 2/3" travado).


- **Label whitespace-only** (`previewText` helper) — 4 callsites de `getMarkerLabel` (PDF/CSV/markdown/markdown-via-editor) faziam `if (text)` truthy-check, deixando string `"   "` passar como label visível em vez de cair no fallback (`Page N` / `Row X · column` / `Line N`). Idem em `smartCodeAccess.getMarkerLabel` (`main.ts`). Centralizado em `previewText(s, maxLength): string | null` em `markerResolvers.ts` — trim + check empty + truncate. Repro registrado como "Carla label vazia" no `BACKLOG.md`.

- **DuckDBRowProvider drain on dispose** — `dispose()` agora aguarda queries em flight terminarem antes de `DROP TABLE` / `dropFile`. Counter `inflight` incrementado por `trackedQuery()` privada (todas as 9 queries do provider passam por ela); `disposed=true` bloqueia novas via `guard()` no momento que dispose começa. Resolve "Missing DB manager" residual no console quando teardown corria concorrente com query pending.

- **Polígono image reposicionado ao close+reopen** — `RegionManager.shapeToNormalizedCoords` aplicava `calcTransformMatrix()` em `points` sem subtrair `pathOffset`, resultando em coords salvas deslocadas pelo centro do bbox dos pontos. Reload re-criava polygon nas coords erradas → polygon aparecia no canto inferior-direito da imagem. Fórmula correta extraída pra helper puro `polygonPointsToWorld(points, pathOffset, matrix)` em `regionManager.ts`. Tests cobrindo identity / scale / rotation / regression. **Polygons já salvos no `data.json` antes do fix continuam com offset errado até serem editados/movidos** — sem migração (zero usuários).

### Removed

- **PDF undo stack** — feature `Undo last PDF coding action` (Cmd+Z, command `undo-pdf-coding`) removida. Era a única engine com undo (markdown/image/csv/media nunca tiveram), mantinha inconsistência cross-engine e o keybinding nunca foi wired no `PdfCodingView`. Saiu: `PdfCodingModel.undo()`, `pushUndo()`, `reconcileCodes()`, `undoStack`, `suppressUndo` (dead code), interface `UndoEntry`, const `MAX_UNDO`, command `undo-pdf-coding`, 13 testes, seção `TECHNICAL-PATTERNS.md §4.8`.

## [0.3.0] — 2026-05-05 — Pre-alpha

Smart Codes Tier 3: capability nova de "saved queries" sobre o codebook. Schema próprio (PredicateNode AST com 10 leaves + nesting AND/OR/NOT), evaluator puro com short-circuit + cycle detection, cache com invalidação granular, modal hub + builder com preview live, command palette, integração ponta-a-ponta com 6 modes do Analytics, Code Explorer, audit log com entity discriminator, QDPX/CSV round-trip e granular MarkerMutation cross-engine. Stress: 10k markers + 100 smart codes em <1s.

### Added

- **Smart Codes Tier 3 — saved queries (Phase 1)** — predicate AST com 10 leaves (`hasCode`, `caseVarEquals`, `caseVarRange`, `magnitudeGte/Lte`, `inFolder`, `inGroup`, `engineType`, `relationExists`, `smartCode` nesting) combinados via AND/OR/NOT. Evaluator puro em `src/core/smartCodes/evaluator.ts` (short-circuit + cycle detection). Builder modal row-based com preview live <300ms. Smart Code Detail + List hub. Command palette (`Smart Codes: Open hub` + `Smart Codes: New`). Stress validado: 10k markers + 100 SCs em <1s.

- **Smart Codes em Analytics (Phase 2 — SC1)** — frequency / cooccurrence / evolution+temporal / codeMetadata / lagSequential+polar / memoView ganham SC entries via helper `getSmartCodeViews`. Filter UI tem chips ⚡ no topo da codes section, integrados ao `enabledCodes`/`excludeCodes`. SC entries no Frequency mode aceitam drag + Add to Board (paridade com codes regulares).

- **Smart Codes no Code Explorer (Phase 2 — SC2)** — grupo "⚡ Smart Codes" top-level no tree do Code Explorer com estrutura SC → file → matches. Click em match navega cross-engine via `navigateToMarker`. Subscribe a cache + registry mutations. Search filter aplica a SC names também.

- **Granular MarkerMutation event (Phase 2 — SC3)** — canal `onMarkerMutation` paralelo a `onChange` em todos 5 engine models (markdown/pdf/image/csv/media). Cada mutation site (addCode, removeCode, removeMarker, updateMarker, createShape, deleteShape, addCodeToShape, removeCodeFromShape, addCodeToManyRows, removeCodeFromManyRows, removeAllRowMarkersFromMany, migrateFilePath, undo) emite `MarkerMutationEvent` com codeIds afetados. Cache `applyMarkerMutation(event)` atualiza `markerByRef` incremental + invalida só SCs dependentes via `dependencyExtractor`. Dead code removed (`indexByCode`/`indexByFile`, ~50 LOC).

- **Smart Code detail inline na sidebar (Phase 2 — SC4)** — `smartCodesSection` wirado no Code Detail (modo "All Codes") em vez do Code Explorer. Click numa SC abre detail INLINE no sidebar. Modal hub via Cmd+P continua como atalho. Visual consistente com code detail (`codemarker-detail-*` classes, back button compartilhado). Auto-refresh via `cache.subscribe` + `registry.addOnMutate` + `model.onChange`.

- **Convert to note pra SC memo** — `EntityRef` expansão completa cobrindo Smart Code memo materialization (mesmo pattern do Code/Group/Marker/Relation).

- **QDPX export/import** — bloco `<qualia:SmartCodes>` em namespace custom `xmlns:qualia="urn:qualia-coding:extensions:1.0"`. Import 2-pass (alocar IDs → resolver refs incluindo `smartCode` nesting). Round-trip preservado.

- **CSV tabular `smart_codes.csv`** — coluna `predicate_json` no zip do tabular export. README ganhou snippets R/Python pra reconstruir SCs em external analysis.

- **Audit log Smart Codes** — entity discriminator `entity?: 'code' | 'smartCode'` + 5 `sc_*` event types (`sc_created`, `sc_renamed`, `sc_predicate_edited`, `sc_text_edited`, `sc_deleted`). Coalescing 60s pra text edits + Set union pra predicate edits. ⚡ icon na Codebook Timeline pra eventos de Smart Code.

### Changed

- **Clear All Markers limpa SC definitions** — SCs órfãos sem regulars pra referenciar ficam quebrados; limpeza agora é completa.

- **Eye icon hide/show removido das SC rows** (Code Detail + Hub modal) — UX redundante com filter chip do Analytics; SC não tem visibility per-doc.

- **`SmartCodeApi` virou `SmartCodeRegistry` classe** com cache incremental + `addOnMutate(fn)` — mesmo pattern de `CodeDefinitionRegistry`.

- **`autoRewriteOnMerge` + `diffPredicateLeaves`** — predicates apontando pra códigos consolidados após merge são re-escritos automaticamente.

### Fixed

- **PDF undo + clearAll race + ref identity fallback (`df9ecaa`)** — undo no PDF model emite `MarkerMutation`; `getMarkerByRef` ganha fallback via composite key (caller que guardou ref antes de REMOVE+ADD em rename/undo ainda resolve marker atual).

- **CSV bulk + vault rename (`0c47529`)** — bulk row coding (`addCodeToManyRows` etc) e vault rename emitem `MarkerMutation` correto pra invalidação cirúrgica.

- **Cascade invalidation (`82c3cd8`)** — `invalidateForCode/CaseVar/Folder/Group` agora usam `invalidate()` (recursa via smartCode leaf) em vez de `markDirty()` (que não cascateava).

- **SC pass respeita filter (`bfa6164`)** — `codes`/`excludeCodes` filter aplica corretamente em SC views (interpretation B: filter exclui SC se algum code dependente foi excluído).

- **Memo View renderiza SC sections (`638ae6e`)** quando só SC tem memo — sections SC prepended em `byCode`.

- **`instanceof` check (`c035327`)** antes de `showList`/`showCodeDetail`/`setContext` em `leaf.view` — proteção em workspace restore quando view ainda não montou.

- **Search filter no Code Detail (list mode) (`b7a21f2`)** também filtra SCs (paridade com codebook search).

- **Hidratação de data.json antigo (`6df0c77`)** — `registry.smartCodes` / `smartCodeOrder` / `nextSmartCodePaletteIndex` populados em vault que não tem essas keys.

### Technical

- 7 módulos novos em `src/core/smartCodes/`: `index` (entry), `serializer`, `dependencyExtractor`, `normalizer`, `evaluator`, `validator`, `builderTreeOps`. Mais `cache.ts`, `matcher.ts`, `smartCodeRegistry.ts` no nível core.
- `SmartCodeCache` singleton com chunked compute pra cache miss grande (100+ markers por chunk).
- Stress fixture + perf gates em CI (2x headroom, referential identity, granular invalidation).
- 63 commits desde 0.2.0 (Phase 1 branch `feat/smart-codes` + Phase 2 inline em main).
- Tags `pre-smart-codes-baseline` (82cb949) ↔ `post-smart-codes-checkpoint` (4022808) pra rollback granular.
- Tests: 2603 → 2759 verde (+156 cobrindo predicate evaluator + cache + audit + UI helpers + QDPX round-trip).

### Known issues

- **Cmd+Z não desfaz coding em PDF** — keybinding não wired no `PdfCodingView` (bug pré-existente, não regressão SC3). Fix de undo SC3 (`df9ecaa`) está unit-testado mas integração UI bloqueada por isso. Issue documentado no `BACKLOG.md`.

## [0.2.0] — 2026-05-04 — Pre-alpha

Fechamento da Fase 6 do parquet/CSV lazy loading: capability shift de "abre arquivos pequenos" pra "abre parquet de 297MB sem travar". Bundle 49MB → 14.2MB destrava distribuição via Community Plugins. QDPX export+import round-trip pra CSV/parquet via custom namespace (Decisão 5 do design doc).

### Added

- **Open de parquet/CSV grande sem popup (Fase 6 Slice A)** — popup `Lazy / Eager / Cancel` removido; lazy mode automático acima do threshold (50 MB parquet / 100 MB CSV). Placeholder de workspace-restore tem botão único "Open this file" (anti-race com plugin init de 49 MB). Reveal de marker em parquet lazy redondo: `ensureColumnVisible(column)` (faltava — flash invisível em parquet largo) + polling 100 ms × 50 tentativas (em AG Grid v33+ algumas transições de scroll-settle/row-render não emitem `modelUpdated`) + RAF defer no flash + `flashDuration: 500` explícito (default vira 0 em alguns minor) + `infiniteInitialRowCount: totalRows` no createGrid (resolve error #88 quando reveal chega antes do primeiro getRows). Pre-populate de `markerTextCache` no startup (`src/csv/prepopulateMarkerCaches.ts`): eager parses + cellText slice; lazy só popula se OPFS já cacheado (não força download). Novos módulos: `parseTabular.ts` (compartilhado), `prepopulateMarkerCaches.ts`. DuckDB CSV reader tolerante (`all_varchar=true` + `null_padding=true` + `ignore_errors=true`) — sobrevive a CSVs malformados, type inference quebrada, rows com colunas extras.

- **Exports lazy-aware (Fase 6 Slice B)** — tabular CSV export e QDPX agora resolvem cell text de markers em parquet/CSV lazy sem re-parsear o arquivo inteiro em RAM. Novo `src/csv/resolveExportTexts.ts` cobre 6 cases (eager/lazy × aberto/fechado/pre-populated/OPFS-cached): `csvModel.getMarkerText` sync first; cache miss → `parseTabularFile` (suporta parquet via hyparquet); arquivo > threshold → DuckDB batch via OPFS, dispose provider no finally. **Antes do fix:** parquet ia com texto vazio silenciosamente (`Papa.parse` só sabe CSV); arquivo grande estourava RAM 5-18× via `vault.read()` + `Papa.parse()` inteiro. **QDPX `<Sources>` agora inclui CSV/parquet** via custom namespace `<qualia:TabularSource>` + `<qualia:CellSelection>` (Decisão 5 do parquet-lazy-design.md). `xmlns:qualia` declarado no Project root quando section usa o prefixo. ExportModal recebe `plugin` (não só `app`) pra ter `csvModel + getDuckDB`.

- **Progress bar com ETA + UI Manage cache (Fase 6 Slice C)** — banner do OPFS copy mostra `45% — 134.5 / 297.0 MB · ETA 8s` em vez de só percentual + MB. ETA computada da throughput observada (`written / elapsedMs`); suprimida nos primeiros 250 ms (estimativa ruidosa) e em 100% (nada restante). Helpers puros `formatLazyProgress` + `formatDuration` em `src/csv/lazyProgressFormat.ts` (12 test cases). Settings UI nova "Lazy cache (large CSV/parquet)" lista entries OPFS via `listOpfsEntries` (helper novo: itera namespace, lê `meta.json`, soma file size). Cada entry tem botão `Clear` per-entry (`removeOPFSFile`); botão `Clear all` warning chama `clearOPFSCache`.

- **Auto-cleanup OPFS no fechamento de arquivo** — quando user fecha leaf de um arquivo lazy, o OPFS daquele arquivo é wipado automaticamente. Disco fica previsível, sem cache invisível crescendo. Refcount via `workspace.getLeavesOfType` — se outro leaf ainda tem mesmo file, mantém; só wipa quando é a última leaf. `clearWasmBytesCache()` no `plugin.onunload` libera o ~34 MB do gunzip cache que ficava em module scope entre hot-reloads.

- **QDPX import round-trip pra CSV/parquet (Fase 6 Slice E)** — `qdpxImporter.parseSources` reconhece `<qualia:TabularSource>` (custom namespace introduzido no Slice B). `parseSelection` lê `qualia:sourceRowId/column/from/to`. Novo `createTabularMarker` reconstrói `SegmentMarker` (com from/to) ou `RowMarker` (sem) no csvModel. `reloadAfterImport` já chama `csvModel.reload()`. Round-trip QDPX validado em integration test (export → unzip → parseXml → parseSources → asserts).

- **Filter UI server-side em modo lazy (Parquet-lazy Fase 5)** — funnel icon do AG Grid agora aparece nas colunas reais em modo lazy. Filter UI nativo (Contains/Equals/StartsWith/EndsWith/inRange/Blank/etc) emite `filterModel`, traduzido pra SQL `WHERE` no DuckDB. Filter + sort + scroll mantêm display_row mapping coerente (rebuild em cada mudança). Batch coding em lazy (tag button no header) opera nas linhas filtradas via SQL `SELECT __source_row WHERE ...`. Novo módulo:
  - `src/csv/duckdb/filterModelToSql.ts` — `buildWhereClause(filterModel)` traduz AG Grid filter (text + number + combined AND/OR) pra SQL fragment escapado. Helper puro.
  - `DuckDBRowProvider`: extensions em `getRowCount(whereClause?)`, `getRowsByDisplayRange({whereClause})`, `buildDisplayMap(orderBy, whereClause?)`, novo `getFilteredSourceRowIds(whereClause?)`.
  - `LazyState.currentFilter` cacheia `whereClause` + `filteredCount`. `onFilterChanged` faz update SÍNCRONO de `whereClause` (AG Grid re-fetcha imediatamente, sem race) + async `filteredCount` + rebuild `displayMap`.
  - Tests: 19 cases em `tests/csv/duckdb/filterModelToSql.test.ts` (escape de aspas, LIKE meta-chars, ident escape, ranges, combined, multi-coluna).

- **Bulk row marker operations (perf)** — `CsvCodingModel.addCodeToManyRows` / `removeCodeFromManyRows` / `removeAllRowMarkersFromMany`. Single-pass index build (O(M)) + iterate sourceRowIds (O(R)) + ÚNICO `notify()` ao final. Reduz batch coding em 661k rows de minutos pra ~1-3s. `getCodeIntersectionForRows` calcula codes presentes em todas as rows visíveis em O(M+R) com early-exit (substitui o O(K×R×M) anterior; skipped acima de 5000 rows porque a interseção é praticamente sempre vazia em datasets enormes).

- **Deferred load placeholder (UX)** — durante restauração de workspace, arquivos > threshold mostram placeholder inerte "Click to open this file" em vez de auto-disparar o banner Lazy/Eager/Cancel. Heurística: `app.workspace.layoutReady === false` indica restore. Resolve "Obsidian travado eternamente" ao reabrir vault com parquet pesado na leaf.

- **DuckDB-Wasm bootstrap (Parquet-lazy Fase 2)** — runtime DuckDB-Wasm carregando dentro do plugin real (Electron Obsidian Worker). Infraestrutura compartilhada, ainda sem consumer (Fase 4 vai plugar `RowProvider` real). Inclui:
  - `src/csv/duckdb/duckdbBootstrap.ts` — `createDuckDBRuntime()` factory com 2 shims obrigatórios (validados no spike): `process` fake (derrota detecção falsa de Node pelo js-sha256 transitivo) + nuke de `WebAssembly.instantiateStreaming` (força fallback XHR; Worker do Electron não tem `Request`/`fetch`).
  - `src/csv/duckdb/rowProvider.ts` — interface `RowProvider` + `MockRowProvider` in-memory (impl real DuckDB-backed entra na Fase 4).
  - `QualiaCodingPlugin.getDuckDB()` — lazy init no plugin principal; `onunload` chama `dispose()` (worker.terminate + revoga Blob URLs).
  - Comando dev `DuckDB hello query (dev smoke)` — confirma bootstrap rodando no plugin real.
  - esbuild config: `loader: { '.wasm': 'binary' }` + plugin custom inline do worker source.
  - `@duckdb/duckdb-wasm@^1.29.0` adicionada como dependency.

### Changed

- **`onLoadFile` da `CsvCodingView` agora é não-bloqueante** — extraí o eager path em `loadEagerPath(file)`. Quando o banner Lazy/Eager/Cancel aparece, `onLoadFile` retorna IMEDIATAMENTE; os botões disparam o próximo passo via `.then()`. Antes, `await this.confirmLoadLargeFile(...)` prendia o `loadFile` interno do Obsidian — workspace inteiro paralisava (até markdown não abria) até o user clicar em algum botão. Cada callback faz `if (this.file !== file) return` pra desistir se o user trocou de arquivo.

- **CSV schema (Parquet-lazy Fase 0)**: `CsvMarker.row` (índice posicional do papaparse) → `CsvMarker.sourceRowId` (identidade estável). Refactor interno preparando o schema pras Fases 1-6 do parquet/CSV lazy loading e pra LLM coding em tabular (anchoring estável após sort/filter). Em modo eager (atual), `sourceRowId === papaparse row index` — comportamento e UX 100% inalterados. Nomes externos preservados (coluna `row` no CSV de export, `meta.row` do consolidator de analytics, payload do evento `qualia-csv:navigate`) pra evitar ripple effect downstream.

### Migration

- One-shot: `node scripts/migrate-fase-0-source-row-id.mjs` no vault workbench. Backup automático em `data.json.pre-fase-0.bak`. Idempotente. Reverso disponível em `scripts/revert-fase-0-source-row-id.mjs`. Vault workbench migrado em 2026-05-03 (2 segment markers existentes preservados; smoke test com novo marker confirmou persistência no schema novo).

### Fixed

- **Cleanup race entre `onUnloadFile` e queries DuckDB em flight** — `onUnloadFile` agora snapshot do `lazyState` e seta `null` ANTES da teardown async. Concurrent paths (`refreshLazyDisplayMap`, `refreshLazyFilter`, datasource em flight) re-checam após cada await e abortam se `lazyState` virou null. Resolveu o crash "DuckDBRowProvider has been disposed" no `dropDisplayMap` durante teardown.

### Performance

- **Bundle 49 MB → 14.2 MB (-71%) via WASM gzip (Fase 6 Slice D)** — esbuild plugin `duckdbWasmGzipPlugin` gzipa o `duckdb-eh.wasm` em build-time via fflate level 9 (32.7 MB raw → 7.6 MB gz). Runtime: `wasmAssets.ts` ganha `getWasmBytes()` que decomprime lazy + cached via `gunzipSync(fflate)`. Custo one-shot ~10-30 ms na primeira boot do DuckDB. `clearWasmBytesCache()` libera o ~34 MB Uint8Array em onunload pra survivor module scope não segurar memória entre reloads. Destrava distribuição via Community Plugins.

### Technical

- Spike findings (2026-05-03) validaram empiricamente as 3 premissas críticas do design (`ROW_NUMBER()` stability em parquet patológico MERGED de 297MB, sourceRowId latency p95 ≤ 125ms em 2.4M rows, OPFS streaming com heap Δ = 0 MB). 2 shims obrigatórios pro Worker em Electron Obsidian descobertos (process fake + nuke `WebAssembly.instantiateStreaming`) — entram na Fase 2 (DuckDB bootstrap) sem precedente público.
- Spec: `plugin-docs/archive/claude_sources/specs/20260503-parquet-lazy-fase-0-design.md` (workspace externo). Design doc completo em `docs/parquet-lazy-design.md` (versionado a partir desta release como referência arquitetural pra LLM/Whisper futuros).
- 6 commits de Slices da Fase 6 (`5617773` A, `4260591` B, `8017027` B-test, `1aa39fa` C, `9ddb71a` D, `c292700` E) + ajustes finais (`1327d70` clearWasmBytes, `e2fa9e3` auto-cleanup OPFS).
- Tags `pre-fase6-baseline` (4885d3e) / `post-fase6-checkpoint` pra rollback granular se necessário.
- Vitest plugin `stubDuckDBAssets` em `vitest.config.ts` intercepta `.wasm`/`.worker.js` imports — qualquer test que toque transitivamente o stack DuckDB funciona sem mock manual por arquivo.
- Tests: 2490 → 2603 verdes (+113 cobrindo Fase 6 — integration tests do export lazy-aware com fixture parquet real, formatLazyProgress, round-trip QDPX, etc).

## [0.1.2] — 2026-04-30 — Pre-alpha

### Added

- **Materialize all memos batch** (#37) — command palette `Materialize all memos` abre modal pra materializar todos memos do plugin de uma vez. Toggles por kind (5: Code, Group, Marker, Relation code-level, Relation segment-level), `Include empty memos`, `Overwrite existing notes`. Preview live com 4 buckets (a criar / a sobrescrever / já materializadas / vazias puladas). Botão dinâmico ("Materialize N", "Overwrite N", disabled em 0). Progress bar in-modal com status do item atual + counter X/Y. Resultados in-modal com ✓/↻/✗ e details expansíveis pra erros. Erros individuais não param o batch.

### Changed

- `convertMemoToNote(plugin, ref, opts?)` aceita `{ openInTab?: boolean }` (default true; batch passa false pra não abrir N abas).

### Fixed

- Field `selection` em `MaterializeAllMemosModal` colidia com prototype de `Modal`/`Component` do Obsidian — atribuição no constructor era sobrescrita antes do `onOpen` rodar. Renomeado pra `batchOptions`. Gotcha documentado em `TECHNICAL-PATTERNS.md §30`.

### Technical

- 2 arquivos novos em `src/core/`: `memoBatchMaterializer.ts` (`collectAllMemoRefs` + `categorize` 4 buckets + `materializeBatch` com `onProgress`), `materializeAllMemosModal.ts` (modal 3 estados: form / progress / results).
- `refreshMemoNote(plugin, ref)` novo em `memoMaterializer.ts` pra overwrite (vault.modify do .md existente).
- Tests: 2479 verde (mesmo total — sem testes novos pra batch helper, validação manual em vault real).

## [0.1.1] — 2026-04-30 — Pre-alpha

### Added

- **Convert memo to note (Phase 1 + Phase 2 completa)** — todos os 4 tipos de memo do plugin podem agora ser materializados como arquivos `.md` no vault, com sync bidirecional via vault listeners. Destrava ferramental Obsidian (backlinks, graph view, Templater) sobre memos analíticos.
  - **Code memo** (#33): textarea inline na seção Memo do Code Detail vira card `📄 Materialized at <path>` com Open / Unmaterialize. Filename = `<codeName>.md`.
  - **Group memo** (#34): block do memo no Group panel (codebook) ganha botão "Convert to note". Filename = `<groupName>.md`.
  - **Marker (segment) memo** (#35): no Marker focused detail. Filename híbrido por engine — texto: `<file>-<excerpt>`; pdf-shape/image: `<file>-<shape>-<id>`; audio/video: `<file>-<timecode>`.
  - **Relation memo** (#36): nova **Relation Detail view** drill-down. Code-level e app-level com banner contextual. Code-level mostra Evidence list (markers que aplicam). Click no chip do target navega pro code; click no resto da row → Detail. Filename code-level: `<source>-<label>-<target>`; app-level: `<file>-<source>-<label>-<target>-<id>`.
- **Settings**: bloco "Memo materialization" com 4 paths configuráveis (todos ativos).
- **Smart Open** (`openMaterializedFile` em `main.ts`): reusa leaf existente se arquivo já aberto em vez de sempre criar nova aba.

### Changed

- **Schema breaking** — `memo?: string` virou `memo?: MemoRecord = { content, materialized? }` em `CodeDefinition`, `GroupDefinition`, `BaseMarker`, `CodeRelation`. Migração automática `migrateLegacyMemos` no `DataManager.load` (idempotente). Helpers `getMemoContent` / `setMemoContent` centralizam acesso.
- **PromptModal de relation memo aposentado** em favor da Relation Detail view (com Convert/card).
- Botão ✎ inline na row de relation virou **badge** indicando estado do memo (✏ inline / 📄 materializado).
- API `MemoMaterializerAccess` genérica via `EntityRef` (5-way union: code, group, marker, relation-code, relation-app).

### Fixed

- Card materializado de marker não atualizava ao Convert em engines pdf/image/csv/media — `notifyMarkerOwner` chama `notify()` do model dono pra invalidar cache do `UnifiedModelAdapter`.
- Unmaterialize de marker preservava `materialized` indevidamente (regressão de `setMemoContent` que mantinha materialized do estado atual).

### Technical

- `EntityRef` discriminated union 5-way em `memoTypes.ts` — extensível.
- Self-write tracker `Set<path>` + `queueMicrotask` cleanup pra prevenir loop em vault listeners (pattern documentado em `TECHNICAL-PATTERNS.md §29`).
- Reverse-lookup `Map<path, EntityRef>` reconstruído no `onload` varrendo registry + 6 collections de markers + relations (code-level e app-level).
- 9 arquivos novos em `src/core/`: `memoTypes`, `memoHelpers`, `memoNoteFormat`, `memoPathResolver`, `memoMigration`, `memoMaterializer`, `memoMaterializerListeners`, `memoMarkerNaming`, `detailRelationRenderer`.
- Migração do schema afetou ~30 pontos de toque mecânico (read sites via `getMemoContent`, write sites via `setMemoContent`).
- Tests: 2438 → 2479 verde (21 novos: helpers puros + migration + naming).

## [0.1.0] — 2026-04-29 — Pre-alpha

First public release. Pre-alpha — distributed via [BRAT](https://github.com/TfTHacker/obsidian42-brat) for testing with selected researchers. Expect rough edges.

### Coding (multi-modal)

- Text (markdown) coding with margin bars, drag handles, hover popover
- PDF coding (fabric.js viewer) — text segments + shape regions, round-trip via QDPX
- CSV/Parquet coding (ag-grid) — segment markers (cell text spans) + row markers (whole rows)
- Image coding (fabric.js) — shape regions with normalized coords
- Audio coding (WaveSurfer) — time regions
- Video coding (HTML5 video) — time regions

### Codebook

- Hierarchical codes with `parentId` (theme hierarchy à la NVivo / Braun & Clarke)
- Virtual folders (organizational, no analytical impact)
- Code Groups — flat N:N membership orthogonal to hierarchy (Atlas.ti / MAXQDA pattern)
- Magnitude scaling on coding application (nominal / ordinal / continuous)
- Relations between codes — typed labels, directed/undirected, with memos (theory-building)
- Memos as first-class on codes, groups, relations, and markers
- Drag-drop reorganization, multi-select + bulk operations, advanced merging with reactive 4-section preview

### Analytics (20+ modes)

- Frequency, co-occurrence, evolution, sequential, inferential (χ²), text analysis, network
- Code × Metadata (heatmap codes × Case Variables with χ² per code)
- Codebook Timeline (audit log visualization, day/week/month buckets)
- Analytic Memo View (editorial hub aggregating memos from all 4 entities)
- Multi-tab xlsx export
- Tabular CSV zip export (R / Python / BI ready)

### Case Variables (mixed methods)

- Typed properties per file (number, date, datetime, checkbox, text)
- Inline editor in popover and side panel
- Filtering across analytics
- Round-trip in QDPX

### Research Board

- Free-form Excalidraw-style canvas with sticky notes, snapshots, code cards, excerpts, KPI cards, cluster frames
- Drag-drop codes from codebook tree to board
- Live sync with registry (color/name/count)
- SVG/PNG export

### Interoperability

- REFI-QDA round-trip (QDC + QDPX) with Atlas.ti, NVivo, MAXQDA
- Open standard, file-based — vault is your data, zero lock-in

### Audit log

- Central log of codebook decisions (created/renamed/edited/absorbed/merged/deleted)
- 60s coalescing for description/memo edits
- Soft-delete reversible per entry
- Markdown export

### Known limitations (pre-alpha)

- Desktop only (mobile not supported)
- HEIC / TIFF not supported (Electron limitation — convert externally first)
- CSV markers don't export via REFI-QDA (format limitation; use Tabular CSV zip instead)
- Markers can become orphan if source file is significantly mutated externally

### Install (BRAT)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. BRAT settings → Add Beta Plugin → `mrlnlms/obsidian-qualia-coding`
3. Enable Qualia Coding in Community Plugins
