# Changelog

All notable changes to Qualia Coding will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **CSV schema (Parquet-lazy Fase 0)**: `CsvMarker.row` (índice posicional do papaparse) → `CsvMarker.sourceRowId` (identidade estável). Refactor interno preparando o schema pras Fases 1-6 do parquet/CSV lazy loading e pra LLM coding em tabular (anchoring estável após sort/filter). Em modo eager (atual), `sourceRowId === papaparse row index` — comportamento e UX 100% inalterados. Nomes externos preservados (coluna `row` no CSV de export, `meta.row` do consolidator de analytics, payload do evento `qualia-csv:navigate`) pra evitar ripple effect downstream.

### Migration

- One-shot: `node scripts/migrate-fase-0-source-row-id.mjs` no vault workbench. Backup automático em `data.json.pre-fase-0.bak`. Idempotente. Reverso disponível em `scripts/revert-fase-0-source-row-id.mjs`. Vault workbench migrado em 2026-05-03 (2 segment markers existentes preservados; smoke test com novo marker confirmou persistência no schema novo).

### Technical

- Spike findings (2026-05-03) validaram empiricamente as 3 premissas críticas do design (`ROW_NUMBER()` stability em parquet patológico MERGED de 297MB, sourceRowId latency p95 ≤ 125ms em 2.4M rows, OPFS streaming com heap Δ = 0 MB). 2 shims obrigatórios pro Worker em Electron Obsidian descobertos (process fake + nuke `WebAssembly.instantiateStreaming`) — entram na Fase 2 (DuckDB bootstrap) sem precedente público.
- Spec: `docs/superpowers/specs/20260503-parquet-lazy-fase-0-design.md`. Design doc atualizado em `docs/parquet-lazy-design.md` §14.
- 8 arquivos do plugin (`csvCodingTypes.ts`, `csvCodingModel.ts`, `csvCodingMenu.ts`, `csvCodingView.ts`, `csvCodingCellRenderer.ts`, `columnToggleModal.ts`, `segmentEditor.ts`, `csvSidebarAdapter.ts`) + 3 externos (`dataConsolidator.ts`, `buildSegmentsTable.ts`, `tabularExporter.ts`).
- Tests: 2479 → 2490 verdes (+11 da migration `migrationFase0.mjs`). Acceptance grep `marker\.row|m\.row` em `src/` retorna 0 hits.

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
