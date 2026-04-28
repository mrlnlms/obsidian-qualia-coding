# Qualia Coding — Roadmap

> Features planejadas por prioridade. Items concluídos ficam no registro ao final.
> Última atualização: 2026-04-27.

---

## 🗺️ Áreas de trabalho

Sem ordem imposta — agrupamento temático pra varredura. Decisões de execução ficam com o user.

| Área | O que tem aberto |
|------|------------------|
| **[Coding Management](#2-coding-management)** | Tier 1 ✅ FEITO 2026-04-28. Tier 2 ✅ FEITO 2026-04-28 · Tier 3 (bloqueado por LLM): Smart Codes |
| **[Analytics](#3-analytics--melhorias)** | Multi-tab xlsx export |
| **[Margin Panel](#4-margin-panel--melhorias)** | Customization · Resize Handle. **Bloqueado** por decisão em plugin externo |

---

## ❓ Decisões de produto abertas

Sem ordem — precisam validar **se** e **como** existem antes de virar sessão.

- **[LLM-assisted coding](#llm-assisted-coding)** — batch coding via LLM. Destrava "parquet gigante" como caso de uso. Amarra Parquet lazy loading e Smart Codes
- **[Parquet lazy loading](#parquet-lazy-loading)** — contingente ao LLM coding. Sem LLM, "parquet 500MB sequencial" não existe no workflow real
- **Full export do projeto (Parquet/JSON)** — user esperava formato Parquet quando ouviu "JSON full export" (memory `project_export_grupo_b_notes.md`). Tabular CSV zip cobriu parte; full project export binário/columnar fica em aberto
- **[Intercoder Reliability (kappa/alpha)](#intercoder-reliability)** — gap estratégico, complexidade alta no contexto single-user
- **[Projects + Workspace](#projects--workspace)** — reinventa gerência de projetos dentro de app de organização
- **[Research Board Enhancements](#research-board-enhancements)** — escopo amplo, decidir subset
- **Tabular round-trip (import)** — reimportar zip de CSVs. Viabilidade incerta (text anchors podem não casar se arquivo fonte mudou)
- **[Convert memo to note](#analytical-memos)** — materializar memo como arquivo markdown. Sub-item residual de "Analytical Memos" (grosso da feature já feito em #25 + Analytic Memo View)

---

## Detalhes — roadmap

### 2. Coding Management

**Contexto:** 4 ondas já entregues (Code Groups, Code × Metadata, Memos em todas entidades, Analytic Memo View). Gestão de códigos é foco grande do projeto.

**Tier 1 — UX moderna pra escalar codebook:**

| Feature | O que faz | Pré-req |
|---|---|---|
| ~~**Multi-select no codebook**~~ | ~~Cmd/Shift+click + bulk delete via Delete key ou right-click~~ | ✅ FEITO 2026-04-28 — ver registro #27 |
| ~~**Bulk operations**~~ | ~~Move folder, add group, recolor, **rename** (Add before / Add after)~~ | ✅ FEITO 2026-04-28 — ver registro #28 |
| ~~**Drag-drop inter-groups**~~ | ~~Arrastar código → chip do group adiciona membership; drag pra zona vazia da árvore com filter ativo remove do group ativo~~ | ✅ FEITO 2026-04-28 — ver registro #26 |

> **Nota — Bulk rename (UX discutida 2026-04-27):** seleciona N códigos no codebook → modal com 2 campos ("Add before" + "Add after") + preview da lista antes/depois + apply. Sem regex, sem find/replace. Caso de uso típico: codebook iterativo onde 30 códigos `theme:X` viram `Wellbeing > X` por adicionar prefixo em lote. Versão regex/find-replace foi descartada como overkill — UX simples cobre o caso real.

**Tier 2 — polish do codebook como artefato vivo:**

| Feature | O que faz | Notas |
|---|---|---|
| ~~**Code stability tracking** (audit log)~~ | ~~Log central de operações por código com timeline + export markdown + soft delete por entry~~ | ✅ FEITO 2026-04-28 — ver registro #29. Storage central (Opção B), coalescing 60s pra description/memo, soft-delete reversível, export inclui hidden (curadoria visual ≠ documento exportado) |
| ~~**Code merging avançado**~~ | ~~Merge interativo: preview rico, escolher nome+cor mantido, política explícita pra memos/descriptions~~ | ✅ FEITO 2026-04-28 — ver registro #30. MergeModal expandido com 4 seções reativas (Name, Color, Description, Memo) + preview rico + pre-flight collision check; helpers puros em `mergePolicies.ts`. Tier 2 fechado. |

**Tier 3 — bloqueado por LLM:**

| Feature | O que faz | Por que bloqueado |
|---|---|---|
| **Smart Codes (saved queries)** | Código "virtual" definido por query (ex: `frustacao` E `senioridade=junior` E magnitude≥3). Re-avaliado a cada chamada. Padrão Atlas.ti. | Diferencial competitivo grande, mas escopo de projeto à parte. Faz mais sentido depois de LLM-assisted coding entrar (ver §LLM-assisted coding nas decisões abertas) — DSL de query + sugestão LLM combinam bem |

### 3. Analytics — melhorias

| Item | Esforço | Detalhe |
|------|---------|---------|
| **Multi-tab spreadsheet export** | Médio | Export das análises do Analytics como .xlsx com uma aba por modo (frequency, cooccurrence, doc-matrix). Herdado do ex-§17 do BACKLOG |
| ~~**Codebook timeline central**~~ | 4-5h MVP / 7-9h full | ✅ FEITO 2026-04-28 — ver registro #31. Full version (stacked bar + lista + filters + export) implementada. |

> **Nota — Relations Network edge bundling (FDEB/HEB):** cogitado e descartado. Curvas de Bézier atuais cobrem grafos típicos; só faria sentido se grafo realista virasse muito denso (50+ edges). Reabrir só se a dor visual aparecer.

### 4. Margin Panel — melhorias

**⚠️ Dependência externa**: aguarda decisão em outro plugin (não-mexido). Só atacar depois de definir tratamento lá.

Dois sub-itens com dívida técnica compartilhada (`scrollDOM stacking context` — `handleOverlayRenderer.ts` já ocupa scrollDOM com z-index 10000+ pra drag handles de markers; os dois itens precisam coexistir no mesmo container):

#### 4a. Margin Panel Customization (ex-#11)

- Setting `margin.side: 'left' | 'right'` (posição hoje hardcoded à esquerda)
- Visual: espessura da barra, estilo de ticks, opacidade — constantes hardcoded hoje em `marginPanelExtension.ts`
- Estimativa: 1-2h

#### 4b. Margin Panel Resize Handle (ex-#17)

**POC feita e stashed** (não integrada).

- Conceito: Drag na borda direita do margin panel para ajustar largura. Double-click reseta para auto
- **Lessons do POC**:
  - Handle precisa viver no `scrollDOM` (não no panel) — `innerHTML = ''` no `renderBrackets()` destrói children
  - Z-index mínimo 10 para ficar acima de bars/labels
  - UX precisa de grip dots ou indicador visual mais forte
- **Alternativas a considerar**:
  - CSS native `resize: horizontal` no panel
  - Setting numérico no settings tab em vez de drag interativo

---

## Detalhes — decisão de produto aberta

### LLM-assisted coding

Batch coding via LLM (local ou API) sobre células tabulares (ou markdown, PDF, etc.). Fluxo proposto:

```
1. Usuário configura prompt + colunas alvo
2. Background job itera o source em chunks (100-1000 rows)
3. Cada chunk → LLM → retorna codes por row
4. Markers gravados em data.json incrementalmente
5. Humano revisa via grid/sidebar, ajusta o que LLM errou
```

**Por que importa pro roadmap agora**: destrava "parquet gigante" como caso de uso legítimo. Sem LLM, codificar 500k rows sequencialmente é fora do escopo humano — com LLM, vira o caso central de mixed methods (Qualtrics + open-ended text).

**Amarra a decisão sobre Parquet lazy loading**:
- Se LLM coding entra → Parquet lazy completo vira pré-requisito pra revisão em grid navegável
- Se não entra → opção D (preview + aviso) resolve o caso de crash sem compromisso grande

**Concorrência**: ATLAS.ti tem AI Coding, NVivo tem summarize/AI, MAXQDA tem AI Assist, Dedoose tem AI features. Todos pagos. Oportunidade clara em open source.

**Escopo mínimo (MVP)**:
- Provider config (OpenAI/Anthropic API + local via Ollama)
- Prompt builder com codebook existente injetado
- Batch scheduler (rate-limit, retry)
- Confidence score + revisão humana first-class
- Funcionar pra markdown + CSV/parquet inicialmente

**Escopo completo**: todos os engines (PDF, image, audio, video via transcription).

**Estimativa (MVP)**: 10-15 sessões. Feature própria, não sub-item.

**Decisão pendente**: priorizar isso acima de "Coding management" e "Analytics polish"?

### Parquet lazy loading

**Status**: contingente ao LLM coding. Suporte básico já implementado (`hyparquet` + `parseTabularFile()` + `registerExtensions(['csv', 'parquet'])`). Lazy loading completo só faz sentido se LLM coding entrar — sem ele, "parquet 500MB com humano codificando sequencialmente" não existe no workflow QDA real.

**Problema**: lê arquivo inteiro pra memória. Datasets grandes (ex: export Qualtrics 2M rows) crasham o Obsidian (~500MB-2GB de memória, main thread bloqueada).

**Constraint**: AG Grid Community não tem Server-Side Row Model (Enterprise-only, ~$999/dev/ano). Alternativa viável é Infinite Row Model (Community).

**Acoplamentos a quebrar**:
1. `rowDataCache: Map<string, Record[]>` em `CsvCodingModel` assume cache completo (consumidores: `navigateToRow`, `getMarkerText`, `QdpxExporter`)
2. Markers referenciam `row: N` posicional → rows não carregadas → sidebar quebra
3. Sort/filter client-side inviável sem query engine

**Arquitetura proposta**: `RowProvider { getRow(n): Promise<Record> }` com 2 implementações (eager pra arquivos pequenos, lazy pra grandes), Web Worker pra decodificação, LRU cache 2-3 row groups, threshold automático via `navigator.deviceMemory` + `file.stat.size`.

**Decisão pendente — sort/filter em lazy mode**: 3 opções (só buffer carregado / desabilitar / DuckDB-Wasm como query engine).

**Estimativa**: 5-7 sessões sem DuckDB-Wasm; +1 com.

**Riscos**: markers órfãos em re-sort externo (já existe hoje), export QDPX em parquet grande precisa batch, validar WASM load em worker context.

### Intercoder Reliability

Cohen's kappa / Krippendorff's alpha. Esperado por peer reviewers para claims de rigor acadêmico. NVivo, ATLAS.ti, MAXQDA, Dedoose e QualCoder oferecem.

**Status**: existem ideias via git-like workflow, mas a complexidade de implementação no contexto atual do plugin (single-user Obsidian) é alta. Requer modelagem de "coders" como primeira classe, reconciliação de discordâncias, agregação estatística. **Decidir antes se faz sentido atacar.**

### Projects + Workspace

**Reflexão (2026-03-19)**: o data model proposto reinventa gerenciamento de projetos dentro de um plugin que vive dentro de um app de organização. Obsidian já tem o core plugin **Workspaces** (salva/restaura layout de panes). Alternativas nativas:
- 1 vault = 1 projeto
- Scoping por pasta (plugin lê só arquivos dentro de uma pasta selecionada)
- Integrar com core plugin Workspaces

**Reavaliar antes de implementar.** Se virar concreto, o data model original (workspace global + projects scoped, códigos compartilhados por ID, frontmatter pra `documentVariables`, file structure com `projects/<name>/` separadas) está preservado em commits antigos do roadmap pra referência.

### Research Board Enhancements

Escopo amplo — decidir subset antes de atacar:

| Feature | Detalhe |
|---------|---------|
| Drag do Code Explorer | Arrastar códigos direto da tree (não só da lista de frequência) |
| Sync com registry | Atualizar cor/nome de code cards em real time |
| Context menu "Refresh" | Atualizar contagem de code cards sob demanda |
| Board templates | Layouts pré-definidos (e.g., 2x2 matrix, timeline) |
| Export board | Imagem/PDF do canvas completo |

### Analytical Memos

**Mostly done.** O conceito original (memos em códigos, grupos, relações; view dedicada) foi entregue em #25 (Memos em todas entidades) + Analytic Memo View (2026-04-27).

**O que sobrou em aberto:** ideia de "Convert to Note" — botão que materializa um memo como arquivo markdown no vault com template de memo analítico (código referenciado, data, tipo de reflexão). Pesquisador escreve no Obsidian normalmente em vez de em textarea inline. Reavaliar se há demanda real antes de implementar.

---

## Gaps identificados na pesquisa de mercado

### Gaps estratégicos (fundamentados em benchmark)

| Gap | Por que importa | Status |
|-----|----------------|--------|
| ~~**Case/Document Variables**~~ | ~~FEITO — Registry central, popover em todos file types, painel lateral, filter analytics, QDPX round-trip, rename/delete hooks~~ | ✅ 2026-04-21 |
| ~~**REFI-QDA (QDPX) Export/Import**~~ | ~~FEITO — Export QDPX/QDC + Import com resolução de conflitos~~ | ✅ 2026-03-22 |
| ~~**Export CSV/Excel**~~ | ~~FEITO — Analytics exporta CSV de frequencies, co-occurrence, Doc-Code Matrix~~ | ✅ 2026-03-22 |
| **Intercoder Reliability** | Cohen's kappa / Krippendorff's alpha. Esperado por peer reviewers. | [❓ Decisão de produto aberta](#intercoder-reliability) |

### Diferenciais confirmados pela pesquisa

| Diferencial | Status | Concorrência |
|------------|--------|-------------|
| **20 analytics modes** (incl. MCA, MDS, LSA, Polar, CHAID, Relations Network) | Implementado | Zero concorrentes oferecem built-in |
| **REFI-QDA interoperability** (export + import QDC/QDPX) | Implementado | NVivo, ATLAS.ti, MAXQDA cobram licença; QualCoder tem suporte parcial |
| **Parquet support** | Implementado | Único no mercado CAQDAS |
| **Dentro do Obsidian** (vault = dados, zero lock-in) | Implementado | Só o Quadro (muito mais limitado) |
| **7 formatos + unified analytics** grátis | Implementado | Concorrentes cobram $130-1,005/ano |
| **Research Board** (canvas freeform) | Implementado | Zero concorrentes têm equivalent |
| **Margin bars MAXQDA-style** em open source | Implementado | MAXQDA cobra EUR 600+/3 anos |

---

## Riscos

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| 500+ markers/arquivo | Lookup O(n) inviável | Interval tree para busca por range |
| 1000+ decorations/viewport | Scroll degradation | Viewport culling, lazy decoration rebuild |
| `data.json` migration | Perda de dados do usuário | Never lose user data — backward-compatible schemas, migration scripts com rollback |
| Mobile | Sidebar differs on Obsidian mobile | Feature-detect mobile, graceful degradation |
| Onboarding | Empty Code Explorer confunde novos usuários | Empty state com guided action ("Create your first code") |
| Plugin conflicts | Highlighter, Comments, PDF++ | Namespace isolation, document conflitos conhecidos |
| `vault.adapter` vs `loadData` | Concurrency/caching race conditions | Single source of truth via DataManager |
| Leaf view DOM without framework | UI verbose, hard to maintain | Obsidian não oferece reactive components nativamente — avaliar lit-html ou similar |
| "Escopo cresce pra ATLAS.ti" | Months of work, feature creep | Incremental phases — cada item standalone, shippable |

---

## Items permanentes (ineliminaveis)

| Item | Razão |
|------|-------|
| 3 `as any` PDF viewer | API interna Obsidian não exporta tipos |
| 3 `as any` dataManager deepMerge | Type gymnastics genérica |
| fflate bundled (~8KB gzip) | Dependência do QDPX export — sem alternativa nativa |

---

## ✅ Implementados (registro)

Histórico de features entregues. Mantido como registro, não reabrir.

- **#1 Code Hierarchy** (Fases A/B/C) — 2026-03-22. `codes: CodeApplication[]`, `parentId`/`childrenOrder`/`mergedFrom`, Codebook Panel 3-níveis, MergeModal com busca fuzzy, pastas virtuais (`FolderDefinition`, sem significado analítico), drag-drop, context menu, "New Folder"
- **#5 FuzzySuggestModal para "Add Existing Code"** — 2026-03-21. `CodeBrowserModal` migrado pra `FuzzySuggestModal<CodeDefinition>` nativo. 22 LOC
- **#6 Quick Switcher de Códigos** — 2026-03-21. Command `quick-code`: seleciona texto → fuzzy modal → aplica. Reutiliza `CodeBrowserModal` + `addCodeAction`
- **#8 Analytics Cross-source Comparison** — 2026-03-02. `sourceComparisonMode.ts`. Métricas por source type (markdown, PDF, CSV, image, audio, video)
- **#10 Code Overlap Analysis** — implementado como `overlapMode.ts`. Heatmap de pares com span textual compartilhado
- **#14 Magnitude Coding** (Fase D) — 2026-03-22. `CodeDefinition.magnitude` (nominal/ordinal/continuous), picker fechado, Settings toggle
- **#14b Relations** (Fase E) — 2026-03-22. Label livre com autocomplete, seções colapsáveis, 20ª visualização Analytics (Relations Network), QDPX export como `<Link>`
- **#14c Virtual Folders** (Fase B) — 2026-03-22. `folder?` em CodeDefinition, `FolderDefinition` no registry, drag-drop, context menu, "New Folder"
- **#15 REFI-QDA Export + Import + CSV por modo Analytics** — 2026-03-22. `qdcExporter.ts`, `qdpxExporter.ts`, `qdpxImporter.ts`, modal pre-export/import, conversão de coordenadas por engine, CSV de frequencies/co-occurrence/Doc-Code Matrix
- **#16 Per-Code Decorations** — 2026-03-02. Markdown (CM6) + PDF. N decorations sobrepostas com `opacity / N`, `mix-blend-mode: multiply`
- **#18 Case Variables** — 2026-04-21. Registry central, storage 3-caminhos (frontmatter md + data.json binários), type inference, popover/painel lateral, Analytics filter, QDPX round-trip
- **#19 Tabular export pra análise externa** — 2026-04-24. Branch `feat/tabular-export`. 8 módulos em `src/export/tabular/` (csvWriter, readmeBuilder, buildSegmentsTable, buildCodeApplicationsTable, buildCodesTable, buildCaseVariablesTable, buildRelationsTable, tabularExporter). ExportModal 3ª opção "Tabular (CSV zip)" com toggles `Include relations` / `Include shape coords`. Zip contém 4-5 CSVs (segments, code_applications, codes, case_variables, relations opcional) + README.md com schema e snippets R/tidyverse (dplyr joins) e Python (pandas merge). Consumidor: pesquisador que prefere stats em R/Python em vez de Analytics nativo. RFC 4180 CSV com UTF-8 BOM (Excel auto-detect)
- **#20 Board Export SVG/PNG** — 2026-04-24. Branch `feat/board-export`. `src/analytics/board/boardExport.ts` com `canvas.toSVG({ viewBox })` nativo do Fabric (vetorial) + `canvas.toDataURL` com multiplier 2 (retina). Botões "Export SVG" / "Export PNG" no `boardToolbar`. Bbox scene-coord dos objetos (grid dots ficam de fora — não são Fabric objects). PDF dispensado (SVG cobre caso vetorial melhor sem dep). Chart snapshots saem raster embutidos no SVG (Chart.js não exporta nativo — fora do escopo). Fix pós-smoke test: reset de `viewportTransform` pra identidade dentro do PNG export pra respeitar zoom do viewport — documentado em TECHNICAL-PATTERNS §23
- **#21 Toggle Visibility por Código** — 2026-04-24. Branch `feat/toggle-visibility`. Duas camadas: global (`CodeDefinition.hidden`, toggle pelo eye icon no Code Explorer) + per-doc override (`visibilityOverrides[fileId][codeId]` em `QualiaData`, toggle pelo popover `view.addAction('eye')` no header de cada engine). Semântica B (self-cleaning): overrides só existem enquanto divergem do global — `cleanOverridesAfterGlobalChange` + `shouldStoreOverride` garantem JSON enxuto. Helpers puros em `src/core/codeVisibility.ts` compõem `isCodeVisibleInFile(codeId, fileId)`. Event bus com rAF coalescing (`src/core/visibilityEventBus.ts`) notifica os 6 engines que refrescam pontual (DOM-based: CSV/PDF/Image/Audio/Video) ou rebuild filtrado (CM6 markdown — decorations atômicas). Popover compartilhado em `src/core/codeVisibilityPopover.ts` (blueprint Case Variables). Vault events: `migrateFilePathForOverrides` em rename, `clearFilePathForOverrides` em delete; cleanup de overrides em `registry.delete` cobre merge transitivamente. Analytics e export não são afetados por design (filter só no render layer). 21 novos testes unitários (+8 da baseline → 2108 total).
- **#22 Code Groups (Tier 1.5 estendido)** — 2026-04-24. Branch `feat/code-groups`. Camada flat N:N ortogonal a `parentId` e `folder`. Schema aditivo: `CodeDefinition.groups?: string[]` + `GroupDefinition` (`id, name, color, description?, paletteIndex, parentId?` schema-ready), `QualiaData.registry.groups/groupOrder/nextGroupPaletteIndex`, `GROUP_PALETTE` (8 cores pastéis distintas do `DEFAULT_PALETTE`). Registry API completa em `codeDefinitionRegistry.ts` — CRUD (`createGroup/renameGroup/deleteGroup` com ripple), membership (`addCodeToGroup/removeCodeFromGroup` idempotentes), queries (`getCodesInGroup/getGroupsForCode/getGroupMemberCount`), cor/desc/order (`setGroupColor/setGroupDescription/setGroupOrder`), serialização tolerante a legacy. UI: painel "Groups" collapsible no topo do codebook (`codeGroupsPanel.ts` — chips com dot/name/count, `[+]` PromptModal, right-click menu Rename/Color/Desc/Delete, description editável inline com placeholder "Add description..."), chip contador `🏷N` em code rows (`computeGroupChipLabel`), filter contextual quando group selected (`applyGroupFilterToRowClasses` — borda accent nos membros, fade nos não-membros via `:not(.qc-code-row-hidden)`), seção Groups no Code Detail (chips removíveis + `[+]` FuzzySuggestModal de candidates + descriptions inline), right-click código → "Add to group..." reusa picker, merge preserva union dos groups (audit trail analítico). Analytics: `FilterConfig.groupFilter` com `memberCodeIds` pre-computed em `buildFilterConfig` (evita passar registry em 9 callers de `applyFilters`), `renderGroupsFilter` com chips single-select + fallback dropdown >10 groups, toggle DOM inline (sem re-render do config panel pra preservar event handlers). Export/Import: QDPX `<Sets>` dentro de `<CodeBook>` com custom namespace `xmlns:qualia="urn:qualia-coding:extensions:1.0"` pra `qualia:color`, `<Description>`, `<MemberCode targetGUID>`; `parseSetsFromXml` regex-based pure function (testável isolada) com flag `hadExplicitColor` pra round-robin do GROUP_PALETTE quando QDPX externo (Atlas.ti/MAXQDA) não tem `qualia:color`; `<MemberSource>` ignorado com warning. Tabular CSV: `codes.csv` ganha coluna `groups` (`;`-separated names), novo `groups.csv` standalone, README atualizado com snippets R (separate_rows + left_join) e Python (str.split + explode + merge). 72 novos testes (+~3% baseline). 2108 → 2180 tests.
- **#23 Pastas nested** — 2026-04-26. Branch `feat/nested-folders`. `FolderDefinition` ganhou `parentId?` + `subfolderOrder?`; registry ganhou `folderOrder` mandatório, `setFolderParent` (cycle detection via walk-up + idempotent early-return + reuso de `_insertInList`), `getRootFolders/getChildFolders/getFolderAncestors/getFolderDescendants` (com cycle protection via Set), `createFolder` aceita `parentId?` (dedup parent-scoped, fallback root se inválido), `deleteFolder` cascade (deleta self + descendants + códigos via `_deleteCodeNoEmit`, fires onMutate 1x). `buildFlatTree` recursivo via `visitFolders` simétrico a `visitCodes`, `FlatFolderNode.depth` dinâmico, search auto-expande folder ancestors. Drag-drop folder full (nest/reorder/promote, cycle silent return em `onDragOver`), gated em mode='reorganize'. Context menu "New subfolder" + ConfirmModal cascade preview com count subfolders + códigos + warning "markers will become orphans". Helper `collectAllCodesUnderFolder` em `hierarchyHelpers.ts`. CSS: `white-space: pre-line` em `.codemarker-dialog-message` pra preservar multi-line messages, `padding-left` baseado em depth no folder row. 24 novos tests (folder hierarchy + folder tree depth-3 + drag-drop logic + cascade collect). 2220 tests total.
- **#25 Memos em todas entidades** — 2026-04-27. Branch `feat/memos-todas-entidades`. Schema aditivo: `CodeDefinition.memo`, `GroupDefinition.memo`, `CodeRelation.memo` (compartilhado entre code-level e application-level). Registry: estende `update()` com `'memo'` (Code), `setGroupMemo` dedicado, `setRelationMemo(codeId, label, target, memo)` por tupla (mesmo limite do delete em `baseCodingMenu.ts:585` — duplicates updatam só primeira). UI: plain textarea em Code Detail (`renderCodeMemo` análoga a `renderCodeDescription`, save debounced 500ms + suspendRefresh/resumeRefresh), surface "memo" no painel de group selected + PromptModal via `editGroupMemo` análoga a `editGroupDescription` + item "Edit memo"/"Clear memo" no context menu, ✎ button em existing relation rows do Code Detail (~`detailCodeRenderer.ts:670-733`) abrindo PromptModal — surfaces application-level (`baseCodingMenu.ts`, `detailMarkerRenderer.ts`, `relationUI.renderAddRelationRow`) intocadas conforme decisão #14 (popover de coding aplicação já é denso). Export QDPX: `<MemoText>` em Code, Set, Link com element-form switch (self-closing → open/close); pipeline marker memo via `<NoteRef>` mantido intocado. CSV tabular: coluna `memo` em codes.csv, groups.csv (após description), relations.csv (no fim — code-level populada, app-level vazia até UI lander). Import: `mergeMemos` análoga a `mergeDescriptions` (`existing\n\n--- Imported memo ---\nimported`) pra conflito; parser de `<MemoText>` em Code/Set/Link adicionado sem mexer no pipeline `<NoteRef>` existente. Round-trip schema-ready de `CodeApplication.relations.memo` (test: parseLinks + applyLinks preservam memo de application-level mesmo sem UI escrever). 43 novos testes (15 registry + 6 qdcExporter + 4 qdpxExporter + 6 qdcImporter + 2 qdpxImporter + 1 buildRelationsTable + 4 buildGroupsTable + 5 buildCodesTable). 2264 → 2307 tests.
- **#31 Codebook Timeline (Analytics)** — 2026-04-28. Branch `feat/codebook-timeline`. Mode novo no Analytics que consome `data.auditLog` (#29) com cronologia cross-código de TODAS as decisões do codebook. Distinto do Temporal mode (que mostra `marker.createdAt`). **Implementação:** (a) `src/analytics/data/codebookTimelineEngine.ts` (novo) — helpers puros: `buildCodeNameLookup` (resolve nomes de códigos deletados via varredura do log: `renamed.to` last-write-wins + `absorbed.absorbedNames` pareado com `absorbedIds`), `buildTimelineEvents`, `filterEvents`, `bucketByGranularity` (day/week/month com ISO-week year correto — usa Thursday da semana pra determinar ano), `renderTimelineEntryMarkdown`, types/constantes (`EventTypeFilter`, `EVENT_COLORS`, `EVENT_TYPE_TO_FILTER`). (b) `src/analytics/views/modes/codebookTimelineMode.ts` (novo) — Chart.js stacked bar (220px altura, lazy import) + lista descending agrupada por dia + click no code name navega via `revealCodeDetailForCode`. (c) State per-mode no `AnalyticsViewContext`: `ctGranularity`/`ctEventBuckets`/`ctCodeSearch`/`ctShowHidden`. (d) Config sidebar: dropdown granularity, 6 chips de event types (toggle), input de search, toggle "Show hidden (N)" condicional. (e) `revealCodeDetailForCode` exposto na `AnalyticsPluginAPI`. (f) Export markdown: cria `Codebook timeline — YYYY-MM-DD.md` na raiz do vault (pattern do `exportCodeHistory`). (g) `analyticsView.renderConfigPanel` agora pula shared filters (Sources/Codes/MinFreq/CaseVar/Groups) quando mode é `codebook-timeline` — esses filters consomem markers, irrelevantes pra timeline que consome auditLog. **Decisões de escopo:** chart agrega `description_edited`+`memo_edited` em "edited" (1 cor); lista e markdown mantêm labels específicos. 6 cores fixas neutras (não match com paletteIndex de codes). Date range filter, tooltip rico, drill-down no chart e heatmap calendar ficam fora (YAGNI). **Bug fix de bonus:** vírgula órfã em `styles.css:2847` fazia `.codemarker-config-row input[type="checkbox"]` herdar `width:100%; height:100%; display:flex` da regra `.codemarker-analytics-view` — checkboxes do Analytics inteiro renderizavam como linhas horizontais. Removida; afeta TODOS os modes do Analytics. +26 testes (engine puro, incl. ISO-week edge cases). 2412 → 2438 tests verde.
- **#30 Code merging avançado** — 2026-04-28. Branch `feat/code-merging-avancado`. Fecha o Tier 2 do Coding Management. **Implementação:** (a) `src/core/mergePolicies.ts` (novo) — types `NameChoice`/`ColorChoice`/`TextPolicy` e helpers puros `resolveName`/`resolveColor`/`applyTextPolicy`. (b) `executeMerge` reordenado em 10 passos — rename agora roda **após** `delete(sourceIds)` pra liberar `nameIndex` (resolve collision real quando user escolhe `nameChoice = source`). (c) `MergeResult` ganha `ok`+`reason` — caller exibe Notice se `name-collision` detectado em runtime. (d) `MergeModal` reescrito com 4 seções reativas (Name radio com swatches, Color radio, Description policy, Memo policy) + preview rico (markers reassigned, child codes reparented, groups unioned, sources deleted) + pre-flight collision check (botão Merge desabilita + inline error). Defaults: keep-target name+color+description, concatenate memo (filosofia "nada se perde silenciosamente"). (e) Pattern de concatenate inspirado no QDPX importer (`qdcImporter.ts:138-150`) com cabeçalho `--- From {sourceName} ---`. (f) Os 2 callers em `baseCodeDetailView.ts` (drag-merge e context menu) migrados pra schema novo (`onConfirm` recebe `MergeDecision` único). Sem shim legado. (g) Audit log: mudanças em description/memo durante merge disparam `description_edited`/`memo_edited` automaticamente via `registry.update`; cor não é auditada (decisão #29). +24 testes (15 mergePolicies + 9 mergeModal novos). 2389 → 2412 tests verde.
- **#29 Audit log central (Code stability tracking)** — 2026-04-28. Branch `feat/codebook-audit-log`. Fecha primeira metade do Tier 2 do Coding Management. Storage central em `QualiaData.auditLog: AuditEntry[]` (Opção B — preserva histórico de códigos deletados/merged que sumiriam em A). Captura events de `created`, `renamed`, `description_edited`, `memo_edited`, `absorbed` (target side), `merged_into` (source side antes de delete), `deleted` (tombstone quando não veio de merge). Soft-delete reversível por entry (`hidden: true` em vez de remoção física — Opção C: curadoria visual mantendo verdade no JSON). **Implementação:** (a) `src/core/auditLog.ts` (novo) — helpers puros: `appendEntry` com coalescing 60s pra description/memo (mesma sessão de edição = 1 entry; janela expira → entry nova), `hideEntry`/`unhideEntry`, `getEntriesForCode`, `renderEntryMarkdown`, `renderCodeHistoryMarkdown`. 22 unit tests. (b) `CodeDefinitionRegistry` ganhou `setAuditListener` + tipo `AuditMutationEvent` exportado; emite events em `create`/`update` (com snapshot pré-mutação pra capturar `from/to`)/`delete`. `suppressNextDelete(id)` permite ao caller suprimir audit `deleted` quando vai emitir seu próprio (usado pelo merge). (c) `executeMerge` em `mergeModal.ts` snapshot dos source names ANTES de delete, emite `merged_into` em cada source + `absorbed` no target via `registry.emitAuditExternal`, suprime os deletes automáticos. (d) `main.ts` instala listener: registry events viram `appendEntry(data.auditLog, { ...event, at: Date.now() })`. Cria `auditAccess: AuditAccess` (interface nova exportada de `baseCodeDetailView.ts`) com `getLog/hideEntry/unhideEntry/exportCodeHistory` e injeta em `UnifiedCodeDetailView`. (e) UI: seção `History` colapsável no Code Detail (`detailCodeRenderer.renderHistorySection`) com timeline cronológica por code, ícones de bullet, toggle "Show hidden (N)" quando há entries hidden, hide button por entry on-hover (eye-off → fade italic + restore button rotate-ccw), botão de export (download icon). `rebuildHistorySection` usa `replaceWith` pra preservar posição no DOM (sem isso, re-render appendava no fim do container e empurrava Delete button pra cima). (f) Export markdown: `data.auditLog` filtrado por codeId → `renderCodeHistoryMarkdown` → cria/atualiza `Codebook history — {name}.md` na vault e abre. Export INCLUI hidden entries (decisão: hide é só visual; .md vira documento editável pelo pesquisador). **Decisões de escopo:** captura só decisões analíticas (rename, merge, descrição, memo) — aplicações de marker NÃO entram (volume explodiria; já tem Temporal mode no Analytics consumindo `marker.createdAt`). Cor/folder/group changes também NÃO entram (cosmético/organizacional). Coalescing 60s evita ruído de saves debounced. **Script demo:** `scripts/seed-audit-log-demo.mjs` gera 6 demo codes vivos + 2 tombstones (deleted/merged) com timeline de 28 dias e 2 entries pré-hidden — facilita validação visual sem precisar mockar manualmente. 2389 tests verde (+22 do auditLog).
- **#28 Bulk operations (rename, recolor, move folder, add group)** — 2026-04-28. Branch `feat/bulk-operations-codebook`. Fecha o Tier 1 do Coding Management — sobre a infra de seleção do #27, adiciona 4 ações em lote acessíveis via right-click numa row selected (com 2+ selecionados). **Implementação:** (a) `src/core/bulkRenameModal.ts` (novo) — modal próprio com 2 campos "Add before" + "Add after" + preview reativo dos primeiros 5 nomes (oldName → newPrefix + oldName + newSuffix) + Apply. Sem regex, sem find/replace (UX travada 2026-04-28). (b) `bulkRenameSelected` no view: loop `registry.update(id, { name })`, conta success/skip por colisão de nome, Notice resumindo. (c) `bulkRecolorSelected`: input HTML5 `type=color` invisível clicado programaticamente; usa evento `change` (não `input`) pra aplicar UMA vez quando user fecha o picker — evita N×K updates por tick durante drag. Cor default = cor do primeiro selecionado (heurística "ponto de partida"). (d) `bulkMoveSelectedToFolder`: `FuzzySuggestModal` com folders + opção `— Move out of folder —` (root) + `+ New folder...`. Loop `setCodeFolder`. Auto-expande folder destino. (e) `bulkAddSelectedToGroup`: `FuzzySuggestModal` com groups + `+ New group...`. Loop `addCodeToGroup` (idempotente). **Context menu bulk** ganhou 4 items + separador antes do Delete (já existente do #27) + separador antes do Clear selection. Single-row ou seleção single mantém menu original. **Decisões de escopo:** loop em N códigos dispara N `onMutate` events — pra perf típica (5-50 códigos) não é problema; batching/suprimir intermediários fica como otimização futura se aparecer dor. Sem novos testes — features DOM-heavy com modais Obsidian, validadas via smoke test em vault real (jsdom não simula dialogs nativos confiavelmente). 2367 tests verde.
- **#27 Multi-select + Bulk delete** — 2026-04-28. Branch `feat/multi-select-codebook`. Tier 1 do Coding Management: seleção múltipla no codebook (Cmd/Ctrl toggle, Shift range) + bulk delete via Delete/Backspace ou context menu. **Modelo de seleção UX-travado:** com seleção vazia, click puro navega pro detail (UX original preservada); com seleção ativa (1+), o codebook entra em "modo seleção" — click puro numa selected tira ela da seleção; click puro numa NÃO-selected limpa toda a seleção (sem selecionar nova, sem navegar). Cmd continua sendo toggle individual; Shift continua sendo range. Esc + click em zona vazia também limpam. **Implementação:** (a) `CodebookTreeState` ganhou `selectedCodeIds: Set<string>`; renderer aplica classe `.is-selected` (background accent + inset shadow). (b) `onCodeClick(codeId, event)` agora passa o MouseEvent pro caller decidir. (c) `baseCodeDetailView` ganhou state `selectedCodeIds` + `selectionAnchor`, métodos `toggleCodeSelection/selectCodeRange/clearCodeSelection`, e listeners de keydown (Esc/Delete) + click em zona vazia. (d) `selectCodeRange` reusa `buildFlatTree` pra computar range respeitando árvore visível (search/expanded), só códigos (folders ignorados). (e) Right-click numa selected (com 2+ selecionados) abre menu bulk (`Delete N codes` + `Clear selection`); single-row ou seleção single mantém menu original. (f) Bulk delete usa `ConfirmModal` destructive com count + preview dos primeiros 5 nomes + warning sobre markers órfãos. **Pegadinhas:** virtual scroll recicla rows — selection state vive em `Set<string>` do view, não em data-attributes (re-aplicada no render por chave). Fix de fixtures de teste (2 specs) que não passavam `selectedCodeIds` no state. **Decisões de escopo:** drag em row selected continua single-drag (multi-drag fica fora). Folders não entram no range (decisão correta — folders são organizacionais). Range REPLACE (descarta seleção anterior) — anchor preservado pra extensão sequencial. 2367 tests verde.
- **#26 Drag-drop inter-groups** — 2026-04-28. Branch `feat/drag-drop-inter-groups`. Atalho de tagging tipo Atlas.ti/MAXQDA: arrastar código da árvore → soltar em chip do painel Groups adiciona membership; arrastar pra zona vazia da árvore com group filtrado remove do group ativo. UX simples: 1 gesto vs 4 cliques (right-click → "Add to group..." → modal → escolhe). **Implementação:** (a) `codeGroupsPanel.ts` ganhou listener de `dragover`/`drop` por chip, lê `dataTransfer.getData('text/plain')` (codeId), dispara callback `onDropCodeOnGroup` opcional; visual feedback via `.is-drop-target` (outline accent + scale 1.05). (b) `codebookDragDrop.ts` ganhou callback opcional `onDropOnEmptySpace(codeId)` — quando o drop não bate em row nem em folder e a callback existe, dispara. (c) `baseCodeDetailView.ts` wira: `onDropCodeOnGroup` chama `registry.addCodeToGroup` + save + refresh; `onDropOnEmptySpace` chama `removeCodeFromGroup(codeId, selectedGroupId)` quando há filter ativo (no-op caso contrário, gesto natural). **Pegadinha encontrada:** `dropEffect='link'` no chip quebra o drop silenciosamente porque `effectAllowed='move'` no dragstart do tree não permite — fix: usar `'move'` no chip. **Pegadinha 2 (rows escondidas):** durante group filter, rows não-membros ficam fade 0.4 mas continuam no DOM e capturam dragover; o cursor passa por cima delas e o handler interpreta como reparent, e empty-space-drop nunca dispara. Fix: `body.codebook-dragging .is-group-non-member, .qc-code-row-hidden { pointer-events: none }` — surgical, só durante drag, não afeta clique normal. **Decisões de escopo:** sem zona "no group" (anti-conceito — ausência não é group); sem reorder de chips (escopo separado); sem multi-drag (depende de Tier 1 multi-select). Idempotência preservada via `addCodeToGroup` no registry. Sem novos testes — feature DOM-heavy, validada via smoke test em vault real (jsdom não simula `dataTransfer` confiavelmente).
- **#24 Code × Metadata (Analytics)** — 2026-04-27. Branch `feat/code-metadata`. Modo novo cruzando códigos × Case Variables. 3 arquivos novos: `src/analytics/data/binning.ts` (helpers puros — quartis pra number ≥5 uniques / categórico ≤4 / 1 bin se constante; granularidade auto pra date — UTC, range >2y → ano, 1mo–2y → mês, <1mo → dia; explode multitext em string flat), `src/analytics/data/codeMetadata.ts` (função pura matriz [code × value] + chi² por código), `src/analytics/views/modes/codeMetadataMode.ts` (heatmap canvas 2D + coluna stats + sort interativo + tooltip + CSV). Refactor: `chiSquareFromContingency(observed: number[][])` extraído de `inferential.ts` como helper genérico R×C reutilizável; regression bit-idêntica protegida por testes (Cramér's V usa `min(R-1, C-1)`, equivalente ao legado quando C=2). UI: dropdown Variable + radios Display (Count / % row / % col, com row-click handler) + checkbox Hide missing + banner condicional quando dimensão = variável filtrada. Sort dividido em 2 headers: coluna Code cicla `total desc → total asc → name asc → name desc`, coluna χ²·p cicla `χ² desc → χ² asc → p asc → p desc`. Tooltip de hover (count + % row + % col por célula). Multitext: chi² desabilitado (`—`) por sobreposição de categorias. CSV export com 4 colunas estatísticas vazias pra linhas multitext (R/Python parse-friendly). 25 novos testes unitários (8 helper genérico + 2 regression locks + 16 binning + 9 codeMetadata). Sem persistência de UI state — `cmVariable/cmDisplay/cmHideMissing/cmSort` resetam ao reabrir view (mesmo pattern de `chiGroupBy/chiSort`).

### Bug fixes e dívidas resolvidas

- **§14 Analytics engine (codeId vs name)** — 2026-04-21 (commit `1422bb7`) + normalização canônica (commit `cf09894`, 2026-04-22). UnifiedCode ganhou `id`, markers normalizados no load via `normalizeCodeApplications`. Workbench vault: 241/241 canônico
- **§11.1 Round-trip integrity** — 2026-04-21. 4 bugs críticos no export/import QDPX corrigidos (GUID mismatch, frontmatter duplicado, `vault.create` não persistindo, models sem sync pós-import)
- **§16 Audio/Video scroll persistence** — 2026-04-22 (merge `8d38939`). Mirror `lastKnownScroll` + `setAutoCenter(false)` durante restore
- **§10 Toggle Media Coding** — 2026-04-23. 4 mídias (Image/Audio/Video/PDF) com `autoOpen` + `showButton` simétricos, toggle per-`(leaf, arquivo)` via `pinnedFileByLeaf`, PDF usa instrument/deinstrument in-place. Higiene cosmética (file-menu rename, showButton live, detach actions no onunload) incluída
- **§11 QDPX PDF round-trip** — 2026-04-23 / 2026-04-24. Branch `feat/pdf-text-anchoring`. Export de text markers usa plainText consolidado via pdfjs (`pdfPlainText.buildPlainText`) + `resolveMarkerOffsets` (indexOf com fallback whitespace-normalize). Import cria marker com `{text, page}` + indices placeholder; `resolvePendingIndices` popula indices via DOM text-search no primeiro render. Shape dims reais via `loadPdfExportData` tanto no export (E2) quanto no import (I1, `createMarkersForSource` chama 1x quando a source tem PDFSelection; fallback 612x792 + warning se load falha). Bug latente `PdfCodingModel.save()` sem settings também fixado. Round-trip validado manualmente com `scripts/smoke-roundtrip.sh`. **Pós-validação (2026-04-24, `3202a45`+`cc25439`):** (a) `ensurePdfJsLoaded` abre PDF em leaf escondida pra carregar `window.pdfjsLib` em vault novo — sem isso o importer caía em fallback 612x792 e shapes ficavam deslocados; (b) shape coords renomeadas de `NormalizedShapeCoords` pra `PercentShapeCoords` (escala 0-100, match do viewBox SVG) — XML do export agora sai dentro da spec REFI-QDA em vez de valores gigantes fora de escala
- **§12 Codebook Panel polish (K1-K3)** — 2026-04-22/23. K1 autoReveal removido (órfão), K2 drag-drop visual completo, K3 virtual scroll com row recycling
- **§15 Case Variables edge cases** — 2026-04-22. Emoji/unicode, valor vazio, hot-reload com popover, multi-pane sync
- **§13 Migração Image/Audio/Video para `FileView`** — 2026-04-22. Lifecycle limpo via `onLoadFile`/`onUnloadFile`. `registerFileIntercept` mantido (core-native extensions rejeitam `registerExtensions`)

---

## Fontes

Este roadmap consolida (arquivos originais já arquivados):
- `memory/hierarchy-plan.md` — plano de Code Hierarchy
- `docs/csv/TODO.md` — Parquet + features Saldaña
- `docs/analytics/ROADMAP.md` — Analytics enhancements
- `memory/board-roadmap.md` — Research Board open ideas
- `docs/markdown/ARCHITECTURE.md` — Phases 3-5 (per-code decorations, projects, power features)
- `docs/markdown/POC-RESIZE-HANDLE.md` — Resize handle POC
- `docs/markdown/COMPONENTS.md` — FuzzySuggestModal opportunity
