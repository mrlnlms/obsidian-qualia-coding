# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema.
> Items resolvidos viraram one-liners no fim do arquivo (com data e raiz).
> Won't-fix mantém razão pra não reabrir.
> Última atualização: 2026-05-04.

---

## 🟢 Estado atual

**Nenhum bloqueador aberto.** Single item ativo: §11 E3 (limitação de formato, won't-fix documentado). Tudo o que era débito técnico foi resolvido entre 2026-03 e 2026-04.

### 🔍 Sintomas observados sem repro confiável

Coisas que apareceram em smoke test mas não conseguiram ser reproduzidas. Não viram tarefa porque sem repro o debug é especulação. Investigar quando aparecer caso reproduzível.

- **(2026-04-28→04-29) Suspeita de código duplicado no codebook** — investigação completa em `plugin-docs/archive/claude_sources/sessions/20260429-duplicate-code-bug-investigation.md`. Resumo: stress test com 1000 codes + 30 dup pairs deliberados (`scripts/seed-stress-codebook.mjs`) **não reproduziu**. H2 (registry tolera dups) descartada. H1 (virtual scroll) e H3 (race em mutações) sem repro mas não eliminadas. **Quando voltar a aparecer**, capturar `data.json` + screenshot + steps na hora — diagnóstico fica trivial com forensic data.

Áreas com polish opcional foram migradas pro `ROADMAP.md`:
- Relations Network (hover-focus ✅, filtro N+ ✅, edge bundling condicional)
- Multi-tab spreadsheet export
- Code × Metadata ✅
- Pastas nested ✅
- Margin Panel customization (bloqueado por plugin externo)

---

## 🪶 Polish curto (UX/qualidade de vida)

Items pequenos (<2h cada) sem guarda-chuva próprio. Quando atacar, vira commit direto.

### Coding em modo lazy: cell coding ✅ FEITO (Fase 4d). Sidebar markerText preview pendente

Coding individual + batch funcionam idêntico ao eager em modo lazy desde Fase 4d (2026-05-04). Sort/filter via SQL operacionais (Fase 5, 2026-05-04).

**Pendente — preview de `markerText` em sidebar** pra arquivos lazy. Sidebar mostra markers existentes mas sem preview do trecho codificado (`markerText: null`). Pra resolver:
1. **Cascade async** em `SidebarModelInterface.getAllMarkers / getMarkerById / getMarkersForFile` → `Promise<...>`. Atinge ~12 sites em `core/` (baseCodeDetailView, detailCodeRenderer, detailRelationRenderer, detailMarkerRenderer, baseCodeExplorerView, codebookTreeRenderer, unifiedModelAdapter). UI síncrona afetada: callbacks de drag-drop, hover events, mutations — exigem `await` ou hasMarkerSync helper.
2. `getMarkerTextAsync` já existe em `CsvCodingModel` — basta o consumer chamar.

Estimativa: 1.5-2 sessões dedicadas. Atacar quando prioridades permitirem (não bloqueia uso).

### Filter de virtual columns (cod-frow / cod-seg / comment) em lazy mode

Hoje desligado: `columnToggleModal.ts:186/200` força `filter: !lazy` nas virtual columns porque elas não estão no DuckDB schema (usuário codifica em data.json). Pra habilitar filter em lazy seria preciso traduzir filterModel dessas colunas pra LEFT JOIN com dados de markers (não trivial). Custo > benefício até feedback de usuário pedir.

### "Missing DB manager" residual do DuckDB worker em alta concorrência

Mitigado em 2026-05-04 (snapshot de `lazyState` no `onUnloadFile`, re-check após cada await em `refreshLazyFilter`/`refreshLazyDisplayMap`). Mas DuckDB-Wasm pode ainda emitir esse erro do worker se uma query estiver em flight no exato instante de `dispose()`. Não é fatal (try/catch around) mas polui o console. Solução completa: serializar `dispose()` com pending queries via lock interno no provider. Não-urgente.

### Validação de 2 parquets pesados em paralelo (não testado)

Cada view tem seu próprio `lazyState`/`displayMap`/`gridApi`. DuckDB runtime é singleton (queries serializam internamente). Memory headroom pode ser apertado se ambos > 500MB. Não testado — registrar caso de teste ad-hoc se aparecer.

### ~~Pre-compute display_row mapping ao aplicar sort em lazy mode~~ ✅ (já estava ligado em Fase 4a/5)

Spike Premise B (§14.5.2 do design doc) mostrou p99 de 214ms em sorted scroll-to-row de 297MB. Resolvido — `csvCodingView.ts` liga `onSortChanged → refreshLazyDisplayMap` (drop+rebuild com `orderBy + whereClause`), `navigateToRow` consulta `displayRowFor()`, e `refreshLazyFilter` encadeia o rebuild. Verificado 2026-05-04.

### Reveal de marker em parquet lazy não destaca a row

Sintoma: clicar `file-search` num marker lazy abre o file (popup Lazy/Eager se necessário) e até scrolla pro lugar certo, mas `flashCells` não dispara — `getDisplayedRowAtIndex` retorna null porque a row do Infinite Row Model ainda é skeleton (page block não foi requisitado/recebido). User perde a referência visual.

Fix: após `ensureIndexVisible`, escutar `modelUpdated` ou `rowDataUpdated` do AG Grid, detectar quando o `rowNode` da row alvo aparece, e só então `flashCells`. Timeout de 3-5s pra desistir caso a row nunca chegue (filter ativo escondendo).

Atacar junto com Fase 6 do parquet-lazy (UX redonda do open + reveal).

### Label de marker em CSV/parquet mostra coordenada, não conteúdo

`CsvCodingModel.getMarkerLabel` retorna `Row X · Column` em vez do excerpt da célula. Em todos os outros engines (markdown, pdf, audio, video) o label é o conteúdo do trecho codificado — CSV é exceção que confunde quem usa sidebar pra reconhecer markers.

Fix: trocar pra preferir `getMarkerText(marker)` (truncado a ~60 chars), com fallback pra `Row X · Column` quando text não disponível. Aplica nos 2 tipos:
- Segment marker: substring `from..to` da célula
- Row marker: célula inteira

Em **eager** funciona instantâneo. Em **lazy** depende da branch `feat/csv-lazy-marker-text-cache` (markerTextCache) — sem ela, fallback pra coordenada. Atacar logo após merge daquela branch.

### Bundle size pós-DuckDB (atacar na Fase 6 do parquet-lazy)

`main.js` cresce de 2.5 MB → ~49 MB em prod com `@duckdb/duckdb-wasm@^1.29.0` embedded. Design doc previa ~9 MB referenciando WASM antigo de 6.4 MB; versão atual tem WASM EH de 34 MB. Não bloqueia funcionalmente (Excalidraw é 8.4 MB, não há limite duro), mas vale comprimir antes de cogitar Community Plugins.

**Mitigação:** comprimir o WASM bytes via `fflate` (já dependency do projeto pra zip export) embedded como gzip, decompress em runtime no `createDuckDBRuntime()`. Custo: ~10-30ms no boot, redução estimada 40-60% (WASM comprime bem). Aplicar antes do `URL.createObjectURL`.

**Quando:** Fase 6 do parquet-lazy (cleanup pré-merge da feature flag). Outras alternativas (pinar versão antiga 1.18, lazy fetch externo) ficam fora — pinar quebra features que vão entrar nas Fases 4-5; lazy fetch externo viola distribução Community Plugins.

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
