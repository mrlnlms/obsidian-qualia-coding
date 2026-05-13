# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema.
> Items resolvidos viraram one-liners no fim do arquivo (com data e raiz).
> Won't-fix mantém razão pra não reabrir.
> Última atualização: 2026-05-12 (A3/A4 + dedup motor + D resolvidos em ICR; LazyTextFilter active indicator restaurado; Smart Code cache hash-based item resolvido sem hash via leaf `textContains` + `vault.on('modify')`).

---

## 🟢 Estado atual

Único bloqueador legado: §11 E3 (limitação de formato, won't-fix documentado). Polish ativo abaixo.

**Lista canônica de itens ICR em aberto:** `ROADMAP.md §"🧱 ICR — Itens em aberto"`. A seção abaixo (Compare Coders polish aberto) preserva o detalhe técnico do único item aberto (B4 weighting cross-engine); ROADMAP traz a visão consolidada com agrupamento por slice atacável.

### 🔍 Sintomas observados sem repro confiável

Quando aparecer, capturar `data.json` + screenshot + steps na hora — diagnóstico fica trivial com forensic data. Sem nenhum sintoma aberto no momento.

---

## 🪶 Polish curto

### Image engine (sessão dedicada)

8 itens do raio-x de hardening 2026-05-08. **Atacar como sessão dedicada com vault aberto** — image é o engine menos polido do plugin (construído por dor, não design coeso). Mistura mecânico, refactor, UX call e debug runtime; ataque pontual fora da sessão fica caro/arriscado. Decisão B (`colorOverride`) é a única explicitamente deferida pelo user em 2026-05-08.

| # | Path:linha | Sintoma | Tipo |
|---|-----------|---------|------|
| 1 | `src/image/regionLabels.ts:120-126` | Labels desacoplam de regions em pan/zoom (transform inversion na fórmula de viewport) | **debug runtime** — exige reproduzir em vault real |
| 2 | `src/image/imageCodingMenu.ts:127` | Menu pisca/reposiciona em rajada quando codes editados rápido — `onRebuild` re-chama `open()` sem debounce | **mecânico c/ risco** — debounce ~150ms muda timing de interaction patterns; valida com smoke |
| 3 | `src/image/canvas/regionManager.ts:114-128` | `marker.colorOverride` no schema sem callsite — `getStyleForMarker()` ignora silenciosamente | **decisão B deferida** (2026-05-08) — wirar (~10 linhas) ou remover do `BaseMarker` type |
| 4 | `src/image/regionHighlight.ts:37-40` | `suppressModelHover` frágil (bidirectional sync com canvas hover) + WeakMap `origValues` sem cleanup pós-delete | **refactor** — rever sync canvas↔model hover state |
| 5 | `src/image/views/imageView.ts:144-146` | Menu auto-close em `selection:cleared` sem validação de multi-select rápido — popover fecha antes de permitir code assignment em 2 shapes | **decisão UX** — fechar em 2 selects ou esperar click fora? |
| 6 | `src/image/views/imageView.ts:156,169` | `refreshAll()` em todo `viewChanged` (zoom, pan) — em imagens com 100+ regions, cada pan dispara 100+ label repaint cycles | **mecânico c/ risco** — debounce/rAF; valida que não atrasa pan/zoom visivelmente |
| 7 | `src/image/views/imageView.ts:252-266` | Visibility toggle aplica `obj.visible = anyVisible` mas não hidra fill/stroke opacity — região fica visível mas "ghost-like" se código invisível | **decisão visual** — como deve parecer região com código invisível? |
| 8 | `src/image/canvas/regionDrawing.ts:139,155` | Threshold mínimo assimétrico (rect: w<3 AND h<3; ellipse: rx<2 AND ry<2). User pode criar shapes 1px intencionais → fantasmas no canvas | **mecânico** — padronizar threshold + validação pré-criação |

### Cross-cutting pendente (pós-rodada 2026-05-09)

Da fila cross-cutting do hardening, 4 frentes atacadas em 2026-05-09 (parseInt validation, CI e2e suite completa, χ² walk recursivo, dendrogram cluster preview). 2 ficaram pendentes:

| Item | Por que não couber em rodada mecânica |
|------|----------------------------------------|
| **`styles.css` 68 `!important`** — clusters em 833-863 (handles SVG drag), 870-987 (mais handles), 1239-1287 (csv-comment-cell + csv-cod-seg-cell `display: flex` overrides) | Cada `!important` é override defensivo de defaults AG Grid (especificidade alta dos selectors `.ag-cell *`). Auditar exige testar runtime cada um — remover sem teste quebra render. Trabalho pra hardening real com vault aberto, não diff de código. |
| **`cooccurrenceMode.ts:82-100` reorder async** | Ataca trava de UI em codebooks grandes durante hierarchical cluster. Refactor exige tornar `ModeEntry.render` `void \| Promise<void>` (contrato compartilhado por 25 modes) + `analyticsView.ts:506` await + race com `savedData` restoration. Refactor invasivo, não cabe em mecânico leve. |

---

## 🧱 ICR — Hash consumers fora do Slice 2

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

- [ ] **`totalUnits` inflated em PDF/CSV/temporal — Po artificial.** `updateSourceTotal` em `src/core/icr/ui/scopeExtraction.ts:282-293` usa `max(range.to)` como ceiling do unit space (chars/segundos), em vez do tamanho real do source. Só markdown lê arquivo via `vault.cachedRead`. Em audio/video com coding esparso, segundos após o último marker simplesmente não entram no universo de comparação — P_o (proportion observed agreement) fica artificialmente alto porque o "background" de não-agreement não é contado. Em PDF, idem por página. **Impacto:** κ infla pra cima em corpora não-markdown com baixa densidade de coding. Resolução: descobrir tamanho real do source (PDF: total chars da página; audio/video: duração via metadata; CSV: row count) e usar como ceiling. **Effort:** médio — exige path por engine pra ler tamanho.

- [ ] **Resolução temporal travada em 1 segundo (sub-second disagreement invisível).** `extractMediaRange` usa `Math.floor`/`Math.ceil` em segundos float pra audio/video — units menores que 1s não geram disagreement. Justificativa no código: "alinhado com ATLAS.ti 25" (decisão de design, não bug). **Decisão a revisitar:** se pesquisador quiser análise mais fina (ex: turn-taking em conversation analysis, prosody, micro-eventos), oferecer resolução configurável (100ms? 10ms?). **Effort:** baixo — tornar resolution parametrizável em `extractMediaRange` + UI pra setar.

- [ ] **`TODO revisitar com fórmula da literatura` no header de `krippendorffAlpha.ts`.** Sinal de incerteza interna sobre canonicalidade dos edge cases. Plano: validar contra implementação de referência (R `irr::kripp.alpha` ou Python `krippendorff` package) numa bateria de casos canônicos da paper. Atacar **junto com C1.5** (refactor de α paramétrico em δ) — boa hora pra revisitar.

- [ ] **Discrepância nominal `fromMs`/`from` em spec Compare Coders vs implementação.** Spec ICR Fase 2 cita campos `fromMs: number, toMs: number`; implementação usa `from`/`to` em segundos float. Não é bug funcional, só inconsistência de nomenclatura entre doc e código. Resolução: alinhar a doc com código (segundos), OU renomear código pra match doc (Ms). Como segundos float é mais legível e funciona corretamente, recomendo: atualizar spec/doc pra `from`/`to` em segundos.

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
