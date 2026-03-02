# Qualia Coding — Backlog

Features planejadas consolidadas dos 7 plugins.

---

## Imediato (v0 fixes)

- [x] ~~Markdown: filtrar hover toggles para só códigos do marker atual~~ — já funciona: suggestion zone mostra inativos, active zone mostra só os do marker
- [x] ~~Markdown: fix handle drag + hover menu interaction~~ — resolvido: `codemarker-dragging` body class previne abertura + fecha menu se drag inicia
- [x] ~~Markdown: v2 detail view não tem `changeListener`~~ — resolvido: `onChange` auto-refresh na base class
- [x] ~~Markdown: v2 falta color swatches no toggle list~~ — resolvido: swatches presentes no Approach C
- [x] ~~Markdown: settings tab~~ — resolvido: 8 settings persistidos, todos wired e reativos
- [x] ~~Video: regex `VIDEO_EXTS`~~ — não é bug: `shortenPath()` já inclui todas as extensões (display only), e `VIDEO_EXTENSIONS`/`AUDIO_EXTENSIONS` nos `index.ts` estão corretos
- [x] ~~Audio/Video: menus `applyThemeColors()`~~ — não é bug: `createPopover()` em `baseCodingMenu.ts` já chama `applyThemeColors()` automaticamente
- [x] ~~Image: CSS classes custom `codemarker-tree-*`~~ — não era bug: classes existiam no CSS mas nunca eram usadas por nenhum TypeScript. Removidas como dead code
- [x] ~~Audio/Video: `updatedAt` ausente~~ — adicionado ao `MediaMarker` e `AudioMarker`, setado em criação + todas mutações (addCode, removeCode, updateBounds, setMemo), migration no constructor dos models

---

## Curto prazo

- [ ] CSV: suporte Parquet (hyparquet ~9KB, zero deps, pure JS)
- [x] ~~Markdown: search/filter no Code Explorer~~ — já implementado: `SearchComponent` em `baseCodeExplorerView.ts`, funciona pra todos os engines
- [x] ~~Markdown: extrair `getMarkerAtPos`~~ — não faz sentido: só o markdown usa (CM6). Cada engine tem lookup próprio (PDF.js, Fabric.js, AG Grid, WaveSurfer)
- [x] ~~Sidebar unificada cross-engine~~ — já implementado: `UnifiedModelAdapter` mergea 6 engines, um código mostra markers de todas as fontes
- [x] ~~Analytics: cross-source comparison view~~ — já implementado: view `source-comparison` com chart/table + CSV export

---

## Médio prazo

- [x] ~~Markdown: per-code decorations~~ — implementado: N decorations sobrepostas com opacity/N, colorOverride bypass
- [ ] CSV: memo + magnitude no extended model (Saldana Ch.14) — memo falta no SegmentMarker/RowMarker
- [ ] CSV: code → theme hierarchy no shared registry — CodeDefinition é flat, sem parent/group
- [x] ~~Analytics: code overlap analysis~~ — já implementado: `calculateOverlap()` em statsEngine + view `code-overlap`
- [ ] Analytics: code groups/hierarchies nas visualizações — dendrogram existe mas é só visualização, não persiste no model
- [ ] Analytics: metadata × code crosstabs (CSV demographics)
- [ ] Image: per-file state persistence (zoom, pan) como Audio/Video — sem `fileStates` no image settings
- [x] ~~Image: memo field nos markers~~ — já implementado: `memo?: string` no `ImageMarker`
- [x] ~~Image: file rename tracking~~ — já implementado: `migrateFilePath()` no ImageCodingModel + handler no index.ts
- [x] ~~File rename tracking~~ — centralizado em `fileInterceptor.ts` com `registerFileRename()`. Todos os 6 engines registrados. CSV e Markdown agora têm `migrateFilePath()`
- [ ] Margin panel: setting left/right (lado da margem) — posição hardcoded
- [ ] Margin panel: visual customization (espessura barra, estilo ticks, opacidade) — constantes hardcoded no extension

---

## Longo prazo (plataforma)

- [ ] Projects + global workspace
- [ ] Code hierarchies (grupos/temas) — CodeDefinition é flat, sem parent/group/theme
- [ ] QDPX export (interop ATLAS.ti, NVivo, MAXQDA)
- [ ] Analytic memos — per-marker memo existe ✓, mas falta per-code memo e per-document memo
- [ ] Document variables (metadata per file) — segment metadata existe, document-level não
- [ ] Quick switcher — Cmd+Shift+C é "Code Selection" (anotação), não navegação rápida entre códigos
- [ ] Export JSON + REFI-QDA + multi-tab spreadsheet — CSV per-view ✓ e PNG per-chart ✓ já existem no Analytics
- [ ] Export dashboard como PDF/PNG composito — PNG individual existe, composição full dashboard não
- [ ] Code visibility toggle no editor — Analytics já filtra por código ✓, mas markdown editor não tem toggle pra mostrar/esconder highlights de códigos específicos
