# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema.
> Items resolvidos viraram one-liners no fim do arquivo (com data e raiz).
> Won't-fix mantém razão pra não reabrir.
> Última atualização: 2026-05-08.

---

## 🟢 Estado atual

**Nenhum bloqueador aberto.** Único item aberto: layout shift no filter de virtual cols (lazy mode) — polish visual, não-blocker. Single item legado: §11 E3 (limitação de formato, won't-fix documentado).

### 🔍 Sintomas observados sem repro confiável

Quando aparecer, capturar `data.json` + screenshot + steps na hora — diagnóstico fica trivial com forensic data. Sem nenhum sintoma aberto no momento.

---

## 🪶 Polish curto (UX/qualidade de vida)

Items pequenos (<2h cada) sem guarda-chuva próprio. Quando atacar, vira commit direto.

### Layout shift no filter de virtual cols (lazy mode)

**Sintoma:** quando user aplica filter (cod-frow/cod-seg/comment) num parquet lazy, durante a janela entre `onFilterChanged` (cache purge) e a resposta do `getRows` (DuckDB query), AG Grid renderiza placeholder rows pelo viewport. Visualmente: as rows que estavam visíveis somem, viewport mostra ~10-20 placeholder rows com cells vazios, e quando DuckDB responde, encolhe pra apenas as rows que matcham. User descreveu como "todas as linhas reaparecem e depois encolhem".

**Mitigações já aplicadas (2026-05-07, parciais):**
- `defaultColDef.filterParams.debounceMs: 250` em lazy createGrid → coalesce keystrokes (1 refresh por pausa, não 1 por char)
- CSS class `csv-coding-filtering` toggled pelo `csvCodingView.refreshLazyFilter` (sync início + RAF-deferred remove no finally) → `.ag-row-loading` + `.ag-stub-cell` viram `visibility: hidden` durante a janela
- `getRows` short-page detection: `rows.length < requestedCount` → `lastRow = startRow + rows.length` (definitivo, independente de `filteredCount` async settle) → AG Grid não fica esperando lastRow desconhecido

**O que ainda falha:** entre purge e DuckDB respond (~50-150ms), viewport mostra blank space (placeholders escondidos via CSS, mas o espaço vazio segue lá). Sintoma cosmético — não bug funcional. User confirmou: "ta funcionando, tem só esse comportamento estranho".

**Caminhos pra investigar (em ordem de plausibilidade):**

1. **Loading overlay scoped:** `gridApi.showLoadingOverlay()` no início do refreshLazyFilter (sync) + `hideOverlay()` no finally (RAF-deferred). Cobre o viewport inteiro com mensagem clara "Filtering…" em vez de blank. Trade: overlay flash em filter rápido (<100ms) pode ser pior que blank. Mitigation: throttle — só mostra overlay se async passar de threshold (ex: setTimeout 100ms; se completar antes, cancela).

2. **Pre-compute filteredCount sync:** quando filter é puramente virtual (sem real cols), o count é exatamente `SELECT COUNT(DISTINCT source_row) FROM qualia_markers_<id> WHERE ...`. Em vault típico (markers small), isso é sub-ms. Pode ser awaitado SYNC antes de retornar do `refreshLazyFilter` (bloquear o caller até filteredCount conhecido). Mas o caller é AG Grid event handler, awaitar pode quebrar o flow.

3. **Setar rowCount sync via API:** AG Grid v33 tem `gridApi.setRowCount(N, false)`. Se chamar com 0 antes de DuckDB responder, AG Grid não renderizaria placeholders. Mas isso flicka entre 0 → real count.

4. **Custom loadingCellRenderer:** colDef pode definir `loadingCellRenderer: () => null`. Cell-level. Pode esconder mais granularmente.

**Caminho mais provável de funcionar:** combinação de (1) com threshold + (3) opcional. Spec curta antes de implementar.

**Não-blocker.** Funcionalidade tá certa, é só polish visual. User explicitamente disse pra resolver depois.

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

### §17 — Memo View virtual scroll
Suspeita inicial: >500 marker memos visíveis trava scroll por peso de DOM. **Morto em 2026-04-27** pelo click-to-edit refactor (commit `18676b4`): cada memo agora é `<p>` simples e só vira `<textarea>` quando clicado. Validação empírica em corpus de 50 codes + 527 markers + ~500 memos: fluido em by-file e by-code com `markerLimit="all"`. Corpus preservado via `scripts/seed-memo-corpus.mjs` se precisar re-medir.

---

## ⚓ Permanente (ineliminável)

| Item | Razão |
|------|-------|
| 6 `as any` (3 PDF internal + 3 deepMerge) | APIs externas sem tipos |
| 3 `@ts-ignore` (wavesurfer) | Module resolution |
| !important 66 instâncias | Maioria AG Grid defensivos |
| Inline styles ~15 estáticos | Migrar quando tocar nos arquivos |
| fflate bundled (~8KB gzip) | Dependência do QDPX export — sem alternativa nativa no Obsidian |

---

## 📚 Registro de débitos resolvidos

Resumo cronológico das dívidas técnicas eliminadas. Detalhes longos foram condensados — git log + commits têm a história completa.

### 2026-05 (parquet-lazy + smart codes + tabular virtual cols)

- **Code Explorer build latency em vault com muitos markers** (2026-05-08, commits `611a99b` + `c3e6a10` + `f7f98d0`) — `~30s → ~13s` (2.3× mais rápido) no pathological 200k markers × 5 cols / M1 8GB. Mitigações: yield UI entre chunks (`setTimeout(0)`) + `chunkSize=1000→10_000` + `Promise.all` paralelizando queries por column dentro do `batchGetMarkerText` + inline `style.paddingLeft/height/position` → CSS classes/vars (`.qc-explorer-code-self`, `.qc-explorer-list`, `.qc-vlist-row`). Diagnóstico via DevTools profile (gargalo era 1000 round-trips DuckDB-Wasm sequenciais saturando microtask queue, não CPU work do main thread). Mitigações C (rebuild parcial) e D (lazy viewport hydration) explicitamente descartadas — conflitam com decisões arquiteturais já tomadas
- **Export Parquet enriquecido — multi-file fallback automático** (2026-05-07/08, commits `fdbaa55` + `bc71ceb` + `fd945e5` + `3f38eda`) — single-file (UX padrão) → catch OOM via regex → multi-file dataset (`<base>.qualia-enriched/part-NNN.parquet`). Decisão dinâmica em runtime, máquina-agnóstico. Stress test 6 cenários sintéticos (50k a 200k markers + 0-228 MB comments + 9-15 vcols) em parquet 2.376M rows × 21 cols. Teto empírico M1 8GB: single-file aguenta até ~150k markers + ~54 MB comments + 12 vcols; fallback multi-file aguenta tudo. Modal info dinâmica de carga estimada (markers count + MB comments + vcols enabled) sem prever — só descreve. Tags `pre-stress-export-baseline` ↔ `post-stress-export-checkpoint`
- **Tabular virtual cols (persist + filter + comment + export)** (2026-05-07, release 0.4.0) — `data.json csv.fileMeta[fileId].enabledVirtualColumns` armazena toggles (cod-frow/cod-seg/comment); `RowMarker.comment?: string` per-cell com setter/getter no model; AG Grid filter unificado server-side via `QualiaMarkersTable` (DuckDB temp table long format) + `virtualFilterResolver`; `BatchedMutationApplier` coalesce events do canal SC3 em rAF batches; export "Parquet enriquecido" via SQL COPY com CTE per virtual col + LEFT JOIN single-pass. Spec: `docs/superpowers/specs/20260506-tabular-virtual-cols-design.md` (arquivada workspace externo após release)
- **Sidebar markerText preview pra arquivos lazy** (2026-05-06) — `MarkerPreviewHydrator` orchestrator stateful popula `markerTextCache` em background quando consumers (Code Explorer, Code Detail, Smart Code list/detail, Memo View by-code) renderizam markers em parquet/CSV lazy não hidratados. Trigger per-file `requestHydration(fileId)` idempotente (dedup `seen + inflight`). Status indicator `Hidratando previews… X/Y` no toolbar. Cobre cold start de vault migrado (QDPX import)
- **Smart Codes Tier 3 + Phase 2** (2026-05-04/05, branch `feat/smart-codes`, 19 commits, 175 testes novos, mergida em `main`) — schema completo (PredicateNode AST com 10 leaves + nesting AND/OR/NOT), evaluator puro com short-circuit + cycle detection, SmartCodeCache com invalidação granular + chunked compute, SmartCodeApi CRUD + autoRewriteOnMerge, builder modal row-based + Smart Code Detail + List hub, command palette, audit log entity discriminator + 5 sc_* events, ⚡ icon na Codebook Timeline, QDPX export/import (`qualia:SmartCodes` namespace + 2-pass parse), CSV tabular `smart_codes.csv` + R/Python snippets. Phase 2: SC1 (Analytics modes via `getSmartCodeViews`), SC2 (Code Explorer grupo SC top-level), SC3 (canal `onMarkerMutation` paralelo a `onChange` em todos 5 engine models — invalidação cirúrgica + dead code removal `indexByCode`/`indexByFile` + cascade fix), SC4 (`smartCodesSection` no Code Detail All Codes mode + Convert to note pra SC memo). Stress: 10k markers + 100 SCs em <1s. Tags `pre-smart-codes-baseline` ↔ `post-smart-codes-checkpoint`
- **Filter de virtual columns em lazy mode** (2026-05-07) — AG Grid native filter (popover Contains/Equals/StartsWith/etc) ligado nas 3 virtuais via `splitFilterModel` + `virtualFilterResolver` traduz pra SQL contra temp table DuckDB. Antes: filter desabilitado (`filter: !lazy`)
- **Validação de 2 parquets pesados em paralelo** (2026-05-06, smoke manual)
- **Reveal de marker em parquet lazy** (2026-05-04, Fase 6 Slice A) — destaca a row corretamente após scroll
- **Pre-populate cache no startup** (2026-05-04, Fase 6 Slice A) — labels antes de file open
- **Label de marker em CSV/parquet** (2026-05-04, pre-populate fica pra Fase 6) — mostra coordenada quando cache vazio em vez de string vazia
- **Carla label vazia (whitespace-only cell)** (2026-05-06) — `previewText(s, maxLength): string | null` em `markerResolvers.ts` centraliza trim+truncate em 4 callsites (PDF/CSV/markdown/markdown-via-editor) + `smartCodeAccess.getMarkerLabel`
- **"Missing DB manager" residual do DuckDB worker** (2026-05-06) — `DuckDBRowProvider.dispose()` aguarda queries em flight terminarem antes de DROP TABLE / dropFile. Counter `inflight` em `trackedQuery()` privada
- **Bundle size pós-DuckDB** (2026-05-04, Fase 6 Slice D) — `main.js` 49 MB → 14.2 MB (71% redução). esbuild plugin `duckdbWasmGzipPlugin` gzipa WASM em build-time (32.7 MB → 7.6 MB level 9). Runtime decompress lazy via `getWasmBytes()` em `wasmAssets.ts` (cached após primeira boot). Destrava Community Plugins
- **PDF undo stack removido** (2026-05-07) — feature `Undo last PDF coding action` (Cmd+Z) era a única engine com undo, mantinha inconsistência cross-engine e o keybinding nunca foi wired no `PdfCodingView`. Saiu undoStack/pushUndo/reconcileCodes/UndoEntry/MAX_UNDO + 13 testes + `TECHNICAL-PATTERNS.md §4.8`

### 2026-04 (sprint de hardening)

- **§14 Analytics engine codeId vs name** (2026-04-21, commits `1422bb7` + `cf09894`) — `extractCodes` retornava codeId mas consumidores indexavam por nome após Phase C. Fix: `UnifiedCode.id` obrigatório, `consolidateCodes` indexa por id, normalização canônica `normalizeCodeApplications` no load de cada model. Workbench vault: 241/241 canônico
- **§11.1 QDPX round-trip integrity** (2026-04-21) — 4 bugs críticos: GUID mismatch Codebook↔CodeRef, frontmatter duplicado, `vault.create` não persistindo, models sem sync pós-import. `qdcExporter.buildCodebookXml` aceita `ensureCodeGuid`, importer usa `vault.adapter.write` direto, `reloadAfterImport()` no plugin sincroniza models
- **§16 Audio/Video scroll persistence** (2026-04-22) — save retornava 0 (WaveSurfer reseta antes do unload) + restore sobrescrito por autoCenter. Fix: mirror `lastKnownScroll` via listener + `setAutoCenter(false)` durante restore
- **§13 ImageView/AudioView/VideoView → FileView** (2026-04-22) — lifecycle limpo via `onLoadFile`/`onUnloadFile`. `registerFileIntercept` mantido (core-native ext rejeitam `registerExtensions`). MediaViewCore.currentFile parallel field eliminado
- **§15 Case Variables edge cases** (2026-04-22) — emoji/unicode (já funcionava, teste empírico add), valor vazio (Notice + reject), hot-reload com popover (`activePopoverClose` no onunload), multi-pane sync via metadataCache
- **§12 Codebook Panel polish K1-K3** (2026-04-22/23) — K1 autoReveal removido (órfão), K2 drag-drop visual completo (ghost + drop indicator flutuante + `is-just-dropped` pulse + `is-drop-rejected` shake), K3 virtual scroll com row recycling (`Map<nodeIndex, HTMLElement>`)
- **§8b CB1-CB4** (2026-04-22) — `ExpandedState { codes; folders }` unificado, threshold 5 pra "Move to folder..." submenu, `core/dialogs.ts` substitui `prompt`/`confirm` nativos
- **§8c E1-E3** (2026-04-22) — drag de nós no Relations Network (`mousedown`/`mouseup` + `redraw()` extraído), `AbstractInputSuggest` substitui `<datalist>`, inline add-row de Relations migrado pra `TextComponent`/`ExtraButtonComponent`
- **§11 PDF round-trip** (2026-04-23/24) — `pdfPlainText.buildPlainText` consolida via pdfjs, `resolveMarkerOffsets` com fallback whitespace-normalize, `loadPdfExportData` extrai dims reais, `ensurePdfJsLoaded` força carga em vault novo, rename `NormalizedShapeCoords` → `PercentShapeCoords`
- **§10 Toggle Media Coding** (2026-04-23) — 4 mídias com `autoOpen`/`showButton` simétricos, `pinnedFileByLeaf` no fileInterceptor pra respeitar swap manual, PDF usa instrument/deinstrument in-place, higiene cosmética (file-menu rename, showButton live, detach actions no onunload)

### 2026-03 (consolidação técnica)

- **§3 Multi-pane / state isolation** (2026-03-20) — PdfViewState (WeakMap per-view), keyboard scoped ao contentEl, hoveredMarkerIds em todos os models. M1/M2/M3 fechados em conjunto
- **§8 Core/Registry R1** (2026-03-20) — `fromJSON` corrigido (def.id = id garante consistência)
- **Incremental refresh/cache por engine** (2026-03-20) — `ConsolidationCache` (analytics dirty flags) + UnifiedModelAdapter cache + debounce rAF via `scheduleRefresh`
- **Board snapshot vs live-linked** (2026-03-20) — "Refresh on open" via `boardReconciler.ts`. Reconcilia cores/nomes/contagens, marca órfãos, remove arrows inválidas
- **§1 PDF lifecycle P1-P9** (2026-03) — timeouts em Map cancelados em stop, hover/popover state per-view, removeMarker chama notify, keyboard handler filtra contenteditable
- **§2 Image engine I1-I5** (2026-03) — origStrokeWidth em WeakMap per-shape, refreshAll após zoom/pan, keyboard scoped ao contentEl, mouseup condition simplificada
- **§4 Markdown CM6 C1-C5** (2026-03) — z-index normalizado (handles 1000, popover 2000), scrollDOM position salvo/restaurado, ch clampado, batch save, isPositionBefore strict
- **§5 CSV V1-V2** (2026-03) — `node.sourceRowIndex` em vez de `node.rowIndex` (estável após sort), `btn.dataset.wrapped` setado na criação e no toggle
- **§6 Analytics A1-A6** (2026-03) — dead code dendrogramMode removido, Chart.js destroy antes de recriar, PapaParse no textExtractor (multiline/quotes/CRLF), skip .parquet em extractBatch, sort por Cramér's V antes de slice
- **§7 Sidebar S1-S6** (2026-03) — navigateToSegment dispara eventos por engine (csv/image/pdf#page/audio/video), decisionTree filtra por markerIds com erro, searchTimeout cancelado no onClose

### Permanência arquitetônica

- **Escala z-index Markdown** (§4 C1): content `auto`, margin panel 1, resize handle 100, drag handles 1000, popover 2000
- **`registerFileIntercept` mandatory** pros 4 engines de mídia: Obsidian rejeita `registerExtensions` em core-native (mp3/mp4/png) com `Error: Attempting to register an existing file extension`

---

## Como usar este arquivo

- **Abrir item novo:** criar entrada acima do registro (won't-fix com razão, ou aberto com severidade + arquivo + problema)
- **Resolver item:** mover pro registro como one-liner com data + raiz
- **Item de polish curto sem guarda-chuva:** adicionar na seção "🪶 Polish curto" deste arquivo. Se passar de "curto" pra "refactor grande" (>4h), abrir plan dedicado
