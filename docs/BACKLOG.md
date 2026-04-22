# Backlog — Qualia Coding

> Divida tecnica e oportunidades de refactor **abertas**, organizada por tema. Items resolvidos foram movidos para `HISTORY.md § Consolidacao tecnica`.

---

## 1. PDF lifecycle e state

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~P1~~ | ~~FEITO~~ | `pageObserver.ts` | ~~Timeouts rastreados em Map e cancelados em stop()~~ |
| ~~P2~~ | ~~FEITO~~ | `highlightRenderer.ts:105`, `drawLayer.ts:24` | ~~Hover/popover state global ao modulo. Duas PDF views: hover numa pane cancela popover da outra~~ |
| ~~P3~~ | ~~FEITO~~ | `drawLayer.ts:25-26` | ~~shapeHoverTimer/currentHoverShapeId globais. stop() nao limpa. Timer dispara em elementos destruidos~~ |
| ~~P4~~ | ~~FEITO~~ | `pdf/index.ts` | ~~cleanupOrphanedObservers agora remove listeners e limpa childListeners Map~~ |
| ~~P5~~ | ~~FEITO~~ | `pdfCodingMenu.ts` | ~~setMemo agora chama notify() em vez de save() direto~~ |
| ~~P6~~ | ~~FEITO~~ | `pdfCodingModel.ts` | ~~removeMarker() agora chama notify() (com silent flag pra chamadas internas)~~ |
| ~~P7~~ | ~~FEITO~~ | `highlightGeometry.ts` | ~~Removido pageY no-op~~ |
| ~~P8~~ | ~~FEITO~~ | `drawInteraction.ts` | ~~Keyboard handler filtra contenteditable + guard unificado no topo~~ |
| ~~P9~~ | ~~FEITO~~ | `pdfCodingModel.ts` | ~~removeAllCodesFromMarker usa removeMarker direto — 1 notify~~ |

---

## 2. Image engine

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~I1~~ | ~~FEITO~~ | `regionHighlight.ts` | ~~origStrokeWidth/origShadow agora em WeakMap per-shape~~ |
| ~~I2~~ | ~~FEITO~~ | `regionDrawing.ts` | ~~setMode skip labels via _qlabel tag~~ |
| ~~I3~~ | ~~FEITO~~ | `imageView.ts` | ~~refreshAll() chamado via onViewChanged apos zoom/pan~~ |
| ~~I4~~ | ~~FEITO~~ | `imageToolbar.ts:128`, `zoomPanControls.ts:97-98` | ~~window.addEventListener("keydown") global. Duas views: teclas ativam em ambas~~ |
| ~~I5~~ | ~~FEITO~~ | `zoomPanControls.ts` | ~~mouseup condition simplificada — e.button === 0 || e.button === 1~~ |

---

## ~~3. Multi-pane / state isolation~~ — FEITO (2026-03-20)

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~M1~~ | ~~FEITO~~ | `fileInterceptor.ts:117` | ~~leaf.detach() ao abrir arquivo duplicado. Quebra multi-pane nativo~~ |
| ~~M2~~ | ~~FEITO~~ | `baseSidebarAdapter.ts:76-78` | ~~setHoverState ignora hoveredIds. Multi-marker hover quebra em todos engines exceto markdown~~ |
| ~~M3~~ | ~~FEITO~~ | P2/I4 acima | ~~PDF hover global + Image keyboard global — mesma raiz~~ |

Implementado via PdfViewState (WeakMap per-view), keyboard scoped ao contentEl, hoveredMarkerIds em todos os models.

---

## 4. Markdown CM6

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~C1~~ | ~~FEITO~~ | `handleOverlayRenderer.ts`, `styles.css` | ~~z-index normalizado: handles 1000, popover 2000~~ |
| ~~C2~~ | ~~FEITO~~ | `marginPanelExtension.ts` | ~~scrollDOM position salvo/restaurado em constructor/destroy~~ |
| ~~C3~~ | ~~FEITO~~ | `markerPositionUtils.ts` | ~~ch clampado ao tamanho da linha via Math.min~~ |
| ~~C4~~ | ~~FEITO~~ | `codeMarkerModel.ts` | ~~deleteCode: batch save — mutacao in-place + 1 save no final~~ |
| ~~C5~~ | ~~FEITO~~ | `codeMarkerModel.ts` | ~~isPositionBefore strict < (nao ambiguo pra posicoes iguais)~~ |
| C6 | Won't-fix | `marginPanelExtension.ts` 548 LOC | Layout algorithm ja extraido em marginPanelLayout.ts. Refactoring restante sem bug associado |

**Escala z-index implementada (C1):**

| Camada | z-index | Elemento |
|--------|---------|----------|
| Content | auto | .cm-content, .cm-layer |
| Margin panel | 1 | .codemarker-margin-panel |
| Resize handle (futuro) | 100 | Borda direita |
| Drag handles overlay | 1000 | .codemarker-handle-overlay |
| Popover | 2000 | .codemarker-popover |

---

## 5. CSV engine

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~V1~~ | ~~FEITO~~ | `csvCodingCellRenderer.ts`, `csvCodingMenu.ts` | ~~node.sourceRowIndex em vez de node.rowIndex — estavel apos sort~~ |
| ~~V2~~ | ~~FEITO~~ | `csvHeaderInjection.ts` | ~~btn.dataset.wrapped setado na criacao e no toggle~~ |

---

## 6. Analytics

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~A1~~ | ~~FEITO~~ | `dendrogramMode.ts` | ~~dead code Files mode removido + dendrogramMode removido do context~~ |
| ~~A2~~ | ~~FEITO~~ | Chart.js instances | ~~ctx.activeChartInstance destroy antes de recriar + onClose cleanup~~ |
| ~~A3~~ | ~~FEITO~~ | `textExtractor.ts` | ~~parseCsv substituido por PapaParse (multiline, quotes, CRLF)~~ |
| ~~A4~~ | ~~FEITO~~ | `textExtractor.ts` | ~~skip .parquet em extractBatch — sem leitura binaria~~ |
| ~~A5~~ | ~~FEITO~~ | `chiSquareMode.ts` | ~~sort por Cramers V antes de slice~~ |
| ~~A6~~ | ~~FEITO~~ | `baseCodeExplorerView.ts` | ~~footer conta segmentos do codeIndex filtrado~~ |

**A3+A4 solucao**: Usar PapaParse (ja e dep) no textExtractor e detectar extensao .parquet pra hyparquet.

---

## 7. Sidebar e navegacao

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| ~~S1~~ | ~~FEITO~~ | `textRetrievalMode.ts` | ~~navigateToSegment agora dispara eventos por engine: csv, image, pdf (#page), audio, video~~ |
| ~~S2~~ | ~~FEITO~~ | `decisionTreeMode.ts` | ~~"View in TR" agora filtra por markerIds do no com erro via trMarkerFilter~~ |
| ~~S3~~ | ~~FEITO~~ | `textRetrievalMode.ts` | ~~Navegacao markdown: getLeavesOfType + find por file path~~ |
| ~~S6~~ | ~~FEITO~~ | `textRetrievalMode.ts` | ~~getActiveViewOfType(MarkdownView) + file path guard em vez de find~~ |
| ~~S4~~ | ~~N/A~~ | `unifiedModelAdapter.ts` | ~~Nao e bug: DataManager.markDirty() debounce 500ms colapsa 6 saves em 1 escrita. Documentado~~ |
| ~~S5~~ | ~~FEITO~~ | `baseCodeExplorerView.ts`, `detailListRenderer.ts` | ~~searchTimeout cancelado no onClose + cleanup retornado por renderListShell~~ |

---

## 8. ~~Core / Registry~~ — FEITO (2026-03-20)

| # | Status | Problema |
|---|--------|----------|
| ~~R1~~ | FEITO | fromJSON: corrigido — `def.id = id` garante consistencia entre key JSON e campo interno |

---

## 8b. Codebook Panel (Phase A/B)

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| CB1 | Low | `baseCodeDetailView.ts` | `folderExpanded` e `treeExpanded` sao dois Sets paralelos com prefixo `folder:` pra distinguir — fragil pra futuro dev. Considerar unificar num unico Set tipado |
| CB2 | Low | `codebookContextMenu.ts` | "Move to folder" lista pastas inline no menu principal — com muitas pastas pode ficar longo. Considerar submenu quando > 5 pastas |
| CB3 | Low | `hierarchyHelpers.ts` | Search em `buildFlatTree` so busca nomes de codigos, nao nomes de pastas. Adicionar busca em folder.name se necessario |
| CB4 | Low | `baseCodeDetailView.ts` | `prompt()` / `confirm()` nativos para rename/delete — funcional mas feio no Electron. Migrar pra Obsidian Modal quando tocar nos arquivos |

---

## 8c. Relations (Fase E)

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| E1 | Low | `relationsNetworkMode.ts` | Force-directed layout é estático (calculado uma vez). Sem drag nos nós. Considerar d3-force se crescer |
| E2 | Low | `relationUI.ts` | `<datalist>` nativo não suporta fuzzy search — só prefix match. Considerar custom dropdown se UX insuficiente |
| E3 | Low | `baseCodingMenu.ts` | Inline add-row no popover usa `document.createElement` — inconsistente com o resto que usa componentes Obsidian |

---

## 9. Permanente (ineliminavel)

| Item | Razao |
|------|-------|
| 6 `as any` (3 PDF internal + 3 deepMerge) | APIs externas sem tipos |
| 3 `@ts-ignore` (wavesurfer) | Module resolution |
| !important 66 instancias | Maioria AG Grid defensivos |
| Inline styles ~15 estaticos | Migrar quando tocar nos arquivos |
| fflate bundled (~8KB gzip) | Dependencia do QDPX export — sem alternativa nativa no Obsidian |

---

## 10. Propostas tecnicas

### Toggle opt-in Audio/Video Coding (similar a autoOpenImages)

**Contexto:** hoje Audio e Video abrem sempre em Coding View (via `registerFileIntercept` incondicional). Image tem setting `autoOpenImages` que permite abrir no viewer nativo. Motivação do usuario: poder ouvir/ver um arquivo sem overhead de Coding View — interfaces nativas do Obsidian sao muito diferentes, util ter como opcao.

**Design sugerido:** padrao desligado, um botao na toolbar do viewer nativo (estilo do botao Case Variables) pra promover pra Coding View em nova aba.

**Escopo:** nao entra na migracao FileView atual. Pos-merge.

### ~~Incremental refresh/cache por engine~~ — FEITO (2026-03-20)
Implementado em duas camadas: `ConsolidationCache` (analytics pipeline, dirty flags por engine + registry) e cache com indices no `UnifiedModelAdapter` (sidebar views, dirty flag global + Map por fileId/id). Views Explorer/Detail com debounce rAF via `scheduleRefresh`.

### ~~Board: snapshot vs live-linked~~ — FEITO (2026-03-20)
Implementado como "Refresh on open" via `boardReconciler.ts`. Reconcilia ao abrir: atualiza cores/nomes/contagens, marca orfaos, remove arrows invalidas. Notice informativo.

---

---

## 11. Export/Import

| # | Severidade | Arquivo | Problema |
|---|-----------|---------|----------|
| E1 | Media | `qdpxExporter.ts` | Offsets de texto PDF no QDPX sao aproximados (por content-item, nao codepoints absolutos). Requer extracao completa do texto PDF para offsets precisos. Warning exibido ao usuario |
| E2 | Media | `qdpxExporter.ts` | Shape markers de PDF ignorados no export — dimensoes de pagina nao disponiveis em tempo de export. Solucao: cachear dimensoes no PDF viewer durante visualizacao |
| E3 | Baixa | Modal de export | Markers CSV nao exportaveis via REFI-QDA (limitacao do formato). Documentado no disclaimer do modal |
| E4 | Baixa | `imageToPixels` | `createImageBitmap` pode falhar para alguns formatos de imagem — fallback necessario |
| I1 | Media | `qdpxImporter.ts` | PDF text selections no import usam page size default 612x792 (US Letter) — dimensoes reais do PDF nao disponiveis em tempo de import. Marker shape coords aproximadas |
| I2 | Media | `qdpxImporter.ts` | PDF text selections (PlainTextSelection dentro de PDFSource) ignoradas com warning — mapeamento offset→spanIndex nao implementado |
| I3 | Baixa | `qdpxImporter.ts` | `createTextMarker` no first pass e dead code — text markers criados inteiramente no batch `createTextMarkers`. Limpar ou remover funcao |
| I4 | Baixa | `qdpxImporter.ts` | `guidMap` dual-purpose (code GUIDs + source file paths) — risco teorico de colisao se GUID de source = GUID de code. Separar em dois Maps |
| I6 | Baixa | `importModal.ts` | `relative://` paths no ZIP resolvidos mas nao testados — sources com path relativo podem nao ser encontrados no ZIP |

### ~~11.1 Round-trip integrity~~ — FEITO (2026-04-21)

Quatro bugs críticos descobertos durante teste manual de round-trip QDPX (vault real) e corrigidos na mesma sessão:

1. **GUID mismatch Codebook ↔ CodeRef** — `qdcExporter.buildCodebookXml` emitia `<Code guid="${code.id}">` enquanto `qdpxExporter` mintava UUIDs via `ensureGuid` pros CodeRefs. Codebook e selections referenciavam o mesmo código com GUIDs diferentes, importador não resolvia nada. Fix: `buildCodebookXml` aceita `options.ensureCodeGuid` e compartilha o `guidMap` com o resto do projeto. Teste de regressão em `tests/export/qdpxGuidConsistency.test.ts`.
2. **Frontmatter duplicado** — `extractSource` prepend um bloco YAML com metadados de import mesmo quando o arquivo original já tinha frontmatter próprio. Obsidian renderizava properties duplicadas e os markers ficavam deslocados pelo número de linhas do frontmatter. Fix: escrever o plainText como veio do QDPX, sem prepend. Os campos (`imported_from`, `original_guid`, `import_date`) não eram lidos em lugar nenhum.
3. **`vault.create` não persistindo** — arquivos criados via `app.vault.create()` ficavam em cache interno do Obsidian e nem sempre flushavam pro FS antes do usuário fechar. Resultado: `data.json` com markers referenciando arquivos que não existiam no disco. Fix: usar `vault.adapter.write/writeBinary/mkdir` direto no FS.
4. **Models com cache não sincronizavam após import** — `CodeMarkerModel`, `PdfCodingModel`, `CsvCodingModel`, `MediaCodingModel` mantêm cópia em memória dos markers. O importer grava via `dataManager.setSection` sem passar pela API do model. UI mostrava counts=0 até o usuário fechar/reabrir o vault. Fix: método `reloadAfterImport()` no plugin que sincroniza todos os models + dispatch `qualia:registry-changed`.

**Arquivos tocados:** `qdcExporter.ts`, `qdpxExporter.ts`, `qdpxImporter.ts`, `importModal.ts`, `importCommands.ts`, `main.ts`, `codeMarkerModel.ts`, `csvCodingModel.ts`, `mediaCodingModel.ts`. Teste novo: `qdpxGuidConsistency.test.ts` (3 casos). 1905 testes passam.

---

## 10b. Magnitude / Relations

| Item | Severidade | Detalhe |
|------|-----------|---------|
| CSS chip styles duplicados | Baixa | Chips de magnitude e relações têm class names distintos no popover vs. no detail view — CSS consolidado mas dois seletores separados ainda existem |
| Magnitude popover sem empty state | Won't-fix | Seção de magnitude some inteiramente quando nenhum código aplicado tem magnitude configurada — decisão UX intencional, não exibe mensagem |
| Continuous type — step decimal | Baixa | Range generator do tipo continuous não refina exibição de step decimal (ex: 0.5 exibido como "0.5" sem arredondamento configurável) |
| Relations Network — sem edge bundling | Baixa | Modo grafo básico: sem edge bundling, sem detecção de comunidades, sem layout por cluster — expansão futura quando a base de usuários justificar |

---

## 12. Codebook Panel polish (K1-K3)

- [ ] K1: autoRevealOnSegmentClick toggle no settingTab pode estar orfao apos remocao do Detail View — verificar se Explorer ainda usa
- [ ] K2: Drag-drop visual feedback poderia ser mais forte (cor mais visivel, animacao de transicao)
- [ ] K3: Virtual scroll reconstroi todos os rows visiveis no scroll — considerar row recycling para 5000+ codes

---

## 15. Case Variables — edge cases marginais pendentes

Smoke test de 2026-04-21 cobriu os cenários principais. Faltam validações de borda:

- Nome de variável com **emoji** ou **caracteres exóticos** (acentuação já funciona, confirmado durante smoke test)
- **Valor vazio** ao adicionar — deveria rejeitar ou aceitar como string vazia?
- **Hot-reload do plugin** com popover aberto — o listener do addOnMutate fica órfão?
- **Multi-pane:** edição de frontmatter direto no editor markdown (não via popover) — popover na outra pane atualiza?
- **Multi-pane racing:** dois popovers do mesmo arquivo abertos simultâneamente (hoje não é possível — clicar num fecha o outro — mas se multi-popover vier no futuro)

Risco/retorno baixo. Fazer numa sessão dedicada de 20-30 min quando houver outro trigger pra mexer em Case Variables.

---

## ~~14. Analytics engine — repassada geral~~ — FEITO (2026-04-21)

**Resolução:** UnifiedCode ganhou `id` obrigatório, `consolidateCodes` indexa por id, `consolidate()` normaliza markers legacy (codeId=name → real id via lookup em defsByName), 6 stats engines + 2 auxiliares atualizados (lookup por id, render por nome), `enabledCodes` Set<id>, dropdowns value=id label=name. 33 arquivos, +350/-299 LOC, 1902 testes passam. Commit: `1422bb7`.

**Verificado pós-fix (smoke test):** Frequency, Co-occurrence, Source Comparison, demais modos exibem nomes corretos; filtro de Case Variables muda gráfico como esperado; lista CODES no painel mostra contagens reais (sem mais entradas duplicadas).

**Possível ponto residual:** Painel "All Codes" do Codebook sidebar (renderizado por `buildCountIndex` em `hierarchyHelpers.ts`, não passa pelo consolidator). Pros markers pré-Phase-C com `codeId = name`, lookup por `def.id` (UUID) ainda falha. Smoke test pós-fix sugere que o caminho alternativo (UnifiedModelAdapter cache rebuilt) corrigiu, mas vale validar próxima vez. Se reproduzir, fix análogo: normalizar markers no rebuild do `UnifiedModelAdapter`.

**Considerar:** tipos discriminados (`CodeId = Branded<string, 'codeId'>`) pra prevenir regressões similares.

---

### Histórico do bug original (referência)

Após o commit `46b90e8` (Phase C — codes string[] → CodeApplication[]), `extractCodes` foi atualizado pra retornar `codeId`, mas `consolidateCodes` e os 6 stats engines (`frequency`, `cooccurrence`, `evolution`, `sequential`, `inferential`, `textAnalysis`) continuaram indexando por `name`. Consequências:

- `consolidateCodes` cria entradas DUPLICADAS no `codeMap`: uma por `def.name` (count=0 sempre, porque nenhum marker bate) e outra por `codeId` (com count real)
- Lista CODES no painel de Analytics mostra `adocao (0)` enquanto o gráfico mostra `c_42` com barras cheias — inconsistência visível
- Labels do gráfico saem como `c_XX` em vez do nome do código
- Cores caem no fallback `#6200EE` porque `codeColors.get(codeId)` falha (map indexado por nome)
- Filtros por código provavelmente quebrados também

**Por que dormiu sem ser notado:** seus markers antigos pré-Phase-C tinham `codeId = name` (vindo da migração inline em `loadMarkers`) — por acidente, lookup funcionava. Markers novos pós-Phase-C (codeId real `c_XX`) expõem o bug.

**Fix proposto (mínimo invasivo, ~30-45 min):**
- `dataTypes.ts`: adicionar `id?: string` em `UnifiedCode`
- `dataConsolidator.ts`: popular `id` no `consolidateCodes`, mergear por nome mas guardando id
- `statsHelpers.ts`: helper `buildIdToNameMap(codes)` reutilizável
- `frequency.ts`, `cooccurrence.ts`, `evolution.ts`, `sequential.ts`, `inferential.ts`, `textAnalysis.ts`, `mdsEngine.ts`, `decisionTreeEngine.ts`: usar resolver pra mapear codeId → nome antes de indexar
- 17 arquivos de teste podem precisar ajustes (a maioria usa nomes literais e não vai quebrar)

**Outros itens pra repassada geral do analytics** (a serem listados conforme aparecem):
- Verificar que filtro de Case Variables funciona corretamente nos 6 engines (smoke test do corpus pendente)
- Verificar invalidação de cache quando code é renomeado/deletado (especialmente após o id-vs-name fix)
- Auditoria do `consolidationCache` pra confirmar que dirty flags propagam por engine corretamente
- Considerar tipos discriminados pra evitar bugs como esse (tipo `CodeId = Branded<string, 'codeId'>`)

**Manifestações adicionais do mesmo bug** (descobertas 2026-04-21 durante teste de QDPX round-trip no vault B):
- **Painel "All Codes" no Codebook sidebar** mostra todas as contagens como `0` — independente do número real de markers. Mesma raiz: a contagem é feita por nome do código, mas os markers referenciam codeId. Fix será o mesmo do consolidator (popular id em UnifiedCode + helper buildIdToNameMap).

**Quando atacar:** próxima sessão dedicada a Analytics. Idealmente antes de novos bugs do filtro de Case Variables serem reportados (o smoke test do corpus pode encobrir mais bugs do engine).

---

## ~~13. Migrar ImageCodingView / AudioView / VideoView para `FileView`~~ — FEITO (2026-04-22)

Image/Audio/Video agora estendem `FileView` (commits `0a46869`/`f87285d`/`4898f6f` na branch `feat/fileview-migration`). Case Variables limpa: `getFileFromItemView` removido, flag `_caseVariablesActionAdded` substituída por dedupe via `caseVariablesViewListeners.has(view)` (commit `857906a`), listener leak corrigido via `view.register()` (commit `e14ead0`), sync md→md e splits tardios corrigidos (commit `c115821`).

**Decisão de design:** `plugin.registerExtensions()` **não é utilizável** para essas views — Obsidian joga `Error: Attempting to register an existing file extension` em extensões core-native (mp3, mp4, png, etc.). Por isso todas as 3 mantêm `registerFileIntercept`. O ganho real da migração foi o lifecycle limpo (`onLoadFile`/`onUnloadFile` + `this.file` padrão), não o mecanismo de associação de extensão. Documentado em `reference_obsidian_register_extensions.md` no memory.

**Dívidas técnicas abertas (pós-migração):**
- Sets de extensão duplicados entre `*View.ts` e `*/index.ts` (AUDIO_EXTENSIONS / VIDEO_EXTENSIONS / IMAGE_EXTENSIONS). Cada um está no lugar natural (view declara via `canAcceptExtension`; index filtra menu/rename). Consolidar se virar dor.
- `MediaViewCore.currentFile` segue como state paralelo a `FileView.file` no Audio/Video. `loadMedia()` re-assign ambos em sync, mas há 2 fontes de verdade ("qual arquivo está carregado"). Se alguém chamar `core.loadMedia(otherFile)` divergindo de `view.file`, diverge silencioso. Opção: remover o field do core e passar `file` como parâmetro em cada chamada que precisa. Não crítico — Audio/Video só chamam `loadMedia` via `onLoadFile`.
