# Qualia Coding — Roadmap

> Features planejadas por prioridade. Items concluídos ficam no registro ao final.
> Última atualização: 2026-04-30.

---

## 🗺️ Áreas de trabalho

Sem ordem imposta — agrupamento temático pra varredura. Decisões de execução ficam com o user.

| Área | O que tem aberto |
|------|------------------|
| **[Coding Management](#2-coding-management)** | Tier 1 ✅ FEITO 2026-04-28. Tier 2 ✅ FEITO 2026-04-28 · Tier 3 (bloqueado por LLM): Smart Codes |
| **[Analytics](#3-analytics--melhorias)** | — |
| **[Margin Panel](#4-margin-panel--melhorias)** | Customization · Resize Handle. **Bloqueado** por decisão em plugin externo |

---

## ❓ Decisões de produto abertas

Sem ordem — precisam validar **se** e **como** existem antes de virar sessão.

- **[LLM-assisted coding](#llm-assisted-coding)** — batch coding via LLM. Destrava "parquet gigante" como caso de uso. Amarra Parquet lazy loading e Smart Codes
- **[Parquet lazy loading](#parquet-lazy-loading)** — contingente ao LLM coding. Sem LLM, "parquet 500MB sequencial" não existe no workflow real
- **[Intercoder Reliability (kappa/alpha)](#intercoder-reliability)** — gap estratégico, complexidade alta no contexto single-user
- **[Projects + Workspace](#projects--workspace)** — reinventa gerência de projetos dentro de app de organização
- ~~**Research Board Enhancements**~~ — ✅ todos 6 sub-items resolvidos (4 feitos + 2 won't-do)
- ~~**Tabular round-trip (import)**~~ — fechado 2026-04-30, ver "Decisões fechadas sem implementar"
- ~~**Convert memo to note**~~ — Phase 1 entregue 2026-04-30 (#33, Code only). Extensão pra Group/Marker/Relation aguarda decisão pós-spike

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
| ~~**Multi-tab spreadsheet export**~~ | Médio | ✅ FEITO 2026-04-28 — ver registro #32. Export `qualia-analytics-YYYY-MM-DD.xlsx` com até 20 abas (1 por mode). |
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

**Status**: contingente ao LLM coding. Suporte básico já implementado (`hyparquet` + `parseTabularFile()` + `registerExtensions(['csv', 'parquet'])`). Size guard ✅ FEITO 2026-04-28 (banner inline com "Load anyway" pra parquet >50MB / csv >100MB — mata "abri sem querer e travei Obsidian"). Lazy loading completo continua contingente ao LLM coding.

**Calibração empírica do threshold (bench 2026-04-24, 11 arquivos reais, salvo em `safe-mode-baseline/results.jsonl` antes de remover):**

| Type | Size (MB) | Peak RSS | Peak Heap | Multiplier RSS | Status |
|------|-----------|----------|-----------|----------------|--------|
| csv | 56.9 | 389 MB | 319 MB | 6.8x | ✅ |
| csv | 75.8 | 560 MB | 485 MB | 7.4x | ✅ |
| parquet | 76.9 | 755 MB | 381 MB | **9.8x** | ✅ |
| parquet | 78.1 | 1405 MB | 1026 MB | **18.0x** | ✅ |
| csv | 148.4 | 1060 MB | 977 MB | 7.1x | ✅ |
| parquet | 172.5 | 1390 MB | 3470 MB | 8.1x | ✅ |
| csv | 230.1 | 1600 MB | 1514 MB | 7.0x | ✅ |
| parquet | 296.6 | 1464 MB | 3556 MB | 4.9x | ✅ |
| csv | 388.5 | 2658 MB | 2534 MB | 6.8x | ✅ |
| 2 parquets | — | — | — | — | ❌ OOM (`node_exit_134`) |

**Conclusões:**
- Parquet decode tem multiplier RSS ~5-18x — muito maior que CSV (~7x).
- Em 50 MB parquet, esperado ~250-900 MB RSS — ainda dentro do que Obsidian aguenta sem travar visivelmente (margem segura).
- Em 100 MB CSV, esperado ~700 MB RSS — dentro de aceitável.
- Acima desses limites, banner inline obriga confirmação consciente.

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

3 dos 5 sub-items originais já feitos. Restam 3 abertos (1 incerto, 2 não-feitos):

| Feature | Status |
|---------|--------|
| ~~**Sync com registry**~~ | ✅ FEITO — `boardReconciler.ts` (cor/nome/contagens em real time) |
| ~~**Context menu "Refresh"**~~ | ✅ FEITO — `reconcileBoard()` exposto via "Refresh on open" |
| ~~**Export board (PNG/SVG)**~~ | ✅ FEITO — `boardExport.ts` (PNG + SVG + bbox scene-coord) |
| ~~**Drag do Code Explorer pro board**~~ | ✅ FEITO 2026-04-29 — `handleDrop` em `boardView.ts:536` estendido pra aceitar raw codeId além de JSON payload da Frequency. Async reconcile preenche count/sources após drop. Fix DnD: `effectAllowed='copyMove'` (era 'move' — bloqueava o drop com `dropEffect='copy'` do board) |

> **Export PDF dispensado** em #20 (2026-04-24) — SVG cobre o caso vetorial melhor sem adicionar dependência externa. Ver registro em "Implementados".
> **Templates pré-definidos** (2x2, timeline, etc.) movido pra "Decisões fechadas sem implementar" em 2026-04-29 — board é canvas livre, user recria qualquer layout em <1min, manter biblioteca é overhead.

#### Drag do Code Explorer pro board — escopo (1 sessão / 6-10h)

**Comportamento:** user arrasta um Code da árvore do codebook (sidepanel) → solta no canvas do Research Board (workspace) → aparece um `CodeCard` node na posição do drop. Permite duplicatas (drop 3x = 3 cards).

**Estado atual:**
- ✅ Drag SOURCE — `codebookDragDrop.ts:157` faz `setData('text/plain', draggedCodeId)`, `row.draggable = true` em `codebookTreeRenderer.ts`
- ❌ Drop TARGET — zero handlers em `src/analytics/board/`

**Implementação:**

| Etapa | LOC | Tempo |
|---|---|---|
| Handlers `dragover` + `drop` no canvas wrapper do board | ~30-50 | 1-2h |
| Coord conversion mouse → Fabric scene coord (considerando viewportTransform — pattern já resolvido em `boardExport`) | ~20-30 | 1-2h |
| Criar `CodeCard` node ao drop (factory `createCodeCardNode` já existe em `nodes/`) | ~10-20 | 30min-1h |
| Persistir no boardState | ~10-20 | 30min |
| Edge cases (drop fora da área, sobre objeto existente, dataTransfer com payload inválido) | ~20-30 | 1h |
| Tests (drop sem zoom, com zoom 2x, com pan, codeId inválido) | ~80-150 | 2-3h |
| Smoke manual no workbench | — | 30min |

**Risco:** coord conversion no Fabric. Pattern já resolvido em `boardExport.ts` — reuso.

### Analytical Memos

**Mostly done.** O conceito original (memos em códigos, grupos, relações; view dedicada) foi entregue em #25 (Memos em todas entidades) + Analytic Memo View (2026-04-27) + #33 Convert memo to note Phase 1 (2026-04-30 — Code only).

#### Phase 2 — extensão do Convert memo to note (Group/Marker/Relation)

**Group** — atacado em sessão (2026-04-30). UI atual: PromptModal abre via click em `codeGroupsPanel` quando group selected. Pattern de implementação = copy-paste do Code, com filename = `<groupName>.md`. Esforço estimado: 1.5-2h.

**Marker** — aguarda decisão de UX. Esforço estimado: 3-4h. Decisões abertas:

1. **Path naming**: marker não tem `name`. Opções:
   - `<filename>-<id-curto>` (ex: `interview-01-m_5xy.md`) — estável, feio
   - Excerpt-based (ex: `interview-01-no-começo-do-projeto.md`) — legível pra texto, falha em image/audio/video
   - Híbrido por engine: texto = excerpt, image/audio/video = `<file>-<engine>-<id>`
2. **Surface da UI**: 6 lugares hoje editam marker memo (popovers de coding image/media/pdf/markdown + detailMarkerRenderer + memoView card). Popovers de coding são contextuais ("coding rápido"), botão "Convert to note" lá fica fora de contexto. Decisão: wirea só em `detailMarkerRenderer` e Memo View (deixa popovers como entry rápido)?
3. **Relevância questionável**: Saldaña diz memos analíticos vão em códigos, não em markers. Marker memos são notas fugazes ("aqui o informante hesitou"). Pode até valer pular Phase 2 pra marker.

**Relation** — aguarda decisão de UX. Esforço estimado: 3-4h. Decisões abertas:

1. **Code-level UX atual quebra pra Convert**: ✎ button no row de relation (Code Detail) abre `PromptModal` (single-line). PromptModal é dialog modal — sem header pra botão Convert; adicionar Convert "dentro" do modal é estranho. Alternativas:
   - **A. Modal com Convert no rodapé** + ✎ vira 📄 quando materializado (Open). 2 cliques pra Convert. Mantém UX compacta atual.
   - **B. Row inline expansível** (accordion). Click ✎ expande mostrando memo + textarea + Convert. Mais visível, adiciona altura variável.
   - **C. Relation Detail view** (igual Code Detail). Click row → tela própria. Coerente com app, mas é feature substancial.
2. **App-level relation tem zero UI Phase 1**: schema-ready, round-trip QDPX/CSV preserva, mas nada visual pra editar. Phase 2 precisa criar UI básica antes de Convert. Surface where? (popover de coding? marker detail?)
3. **Filename**: `<codeName>-<label>-<targetCodeName>.md` (ex: `Wellbeing-causa-Frustration.md`) — code-level OK; app-level precisa de `<filename>-<id-curto>` pra distinguir múltiplas instâncias da mesma tupla.

**Próximos passos (ordem sugerida):**
1. ~~Implementar Group~~ — em andamento.
2. Brainstorm Marker UX (path naming + surfaces) — sessão dedicada.
3. Brainstorm Relation UX (code-level + criar app-level UI) — sessão dedicada.

~~**O que sobrou em aberto:** "Convert memo to note"~~ — Phase 1 entregue 2026-04-30 pra Code memos. Phase 2 (Group/Marker/Relation) em andamento, ver detalhes acima.

**Origem da demanda:** pesquisa com usuário sintético (não real). Trata como hipótese a testar, não feature blockbuster.

#### Design já discutido (2026-04-29) — para retomar sem re-pensar

A questão central é **reatividade** entre memo no `data.json` e arquivo `.md` materializado. 3 designs foram considerados:

| Design | Como funciona | Custo | Veredito |
|---|---|---|---|
| **A. Snapshot one-way** | Convert cria `.md` com conteúdo atual; depois divergem livres | ~1 sessão | ❌ Confunde — qual é source of truth? |
| **B. Two-way file sync clássico** | Edita aqui, atualiza lá; edita lá, atualiza aqui | 4-6 sessões | ❌ Excesso. Race, conflict, infinite loop, fragilidade de vault events |
| **C. Reference-based** | Memo no `data.json` vira ponteiro; arquivo é canonical | 3-5 sessões | ⚠️ Quebra se user deleta o arquivo (perde memo) |
| **D. Hybrid (recomendado)** | `data.json` é canonical; arquivo é view materializada opcional; mudanças propagam de volta; deleção do arquivo só remove materialização (content preservado) | **1.5-2 sessões** | ✅ Resolve elegantemente — design honesto |

#### Design recomendado (D) — schema

```ts
memo: {
  content: string;                          // canonical, sempre presente
  materialized?: { path: string; mtime: number };  // opcional
}
```

**Fluxos:**
- **Convert** → cria `.md` no path escolhido, popula `materialized.path` + `mtime`
- **User edita `.md`** → `vault.on('modify')` dispara → atualiza `content` no `data.json`
- **User edita popover** → atualiza `content` + escreve no `.md` (suprimindo próprio modify pra evitar loop, ~10 LOC de self-write tracking)
- **User deleta `.md`** → `vault.on('delete')` dispara → remove `materialized`, **content fica preservado** em data.json (volta automático pro modo inline)
- **User renomeia `.md`** → `vault.on('rename')` → atualiza `materialized.path`

#### Custo real (~1.5-2 sessões / 10-15h)

| Etapa | Tempo |
|---|---|
| Schema + types | 2-3h |
| Convert button + file creation flow (path picker, template) | 2-3h |
| Vault listener (modify/delete/rename) + reactive update das views | 2-3h |
| Tests (modify, delete, rename, suprimir self-write, edge cases) | 2-3h |
| Edge cases (rename, conflict de path, multi-pane) | 2-3h |

#### Estimativa de impacto

| Audiência | Beneficio |
|---|---|
| Pesquisador que escreve memos longos analíticos | Alto — destrava ferramental Obsidian (backlinks, graph, templates) |
| Pesquisador que escreve memos curtos | Baixo — popover inline já basta |
| Demo/marketing | Médio — "memos viram notas reais com backlinks" é feature linda de demo |

**Não é blocker.** Sinaliza maturidade do produto mas ninguém está bloqueado por não ter.

#### Como atacar quando virar prioridade

Como demanda é sintética, fazer como **spike**, não feature de catálogo:

1. Implementa design D em 1.5-2 sessões
2. Marlon usa por 2 semanas em research real
3. Decide: manter+polir ou archive como "tentamos, não pegou"

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

## ⛔ Decisões fechadas sem implementar

Items que foram considerados, discutidos e **conscientemente dispensados**. Razão registrada pra evitar re-debate.

- **Full export do projeto (Parquet/JSON)** (fechado 2026-04-29) — coberto pela combinação atual: Tabular CSV zip pra análise externa (R/Python/BI) + REFI-QDA (QDPX) pra interop com Atlas.ti/NVivo/MAXQDA + `data.json` pra backup/restore. Não há caso de uso identificado que ficou fora dessa combinação. Reabrir só se aparecer demanda concreta.
- **Board export PDF** (fechado 2026-04-24, ver #20) — SVG nativo do Fabric cobre o caso vetorial melhor sem adicionar dependência externa de PDF lib (~100KB+).
- **Board templates pré-definidos** (2x2 matrix, timeline, affinity diagram) (fechado 2026-04-29) — board é canvas livre; user recria qualquer layout em <1min com sticky notes. Inflexibilidade do template > economia de tempo. Manter biblioteca de templates é overhead. Não há demanda concreta de pesquisador real (ideia de catálogo, não uso). Reabrir só se aparecer pedido específico.
- **Tabular round-trip (import)** (fechado 2026-04-30) — reimportar zip de CSVs do tabular export. Registrado como decisão aberta junto com a spec do export (2026-04-22) e listado nos "Não-objetivos" da spec original (export-only foi decisão deliberada, não esquecimento). Os 3 use cases hipotéticos (Excel bulk edit / colaboração CSV / merge de codings externos) cada um redefine o shape do import — atacar antes de uma decisão pai cravar = trabalho especulativo. Excel bulk edit já coberto pelo Codebook UI (rename/recolor/move/group em bulk). Colaboração entre vaults coberta por QDPX (schema com sources embutidas, round-trip integrity validada). Merge de codings externos amarra na decisão de **LLM-assisted coding** (que define o shape de "trazer applications novos sobre segments existentes") e potencialmente em **Intercoder Reliability** (que define se o shape é merge incremental ou import paralelo como snapshot). Tabular zip foi feito explicitamente como ramo de **análise externa** (R/Python/BI), não interop interno — não há fluxo claro de "o que volta de R pro plugin". Reabrir só quando LLM-assisted coding ou Intercoder Reliability decidirem entrar e o shape do import ficar definido por eles.

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
- **#33 Convert memo to note (Phase 1: Code)** — 2026-04-30. Branch `feat/convert-memo-to-note`. Materializa memo de Code como `.md` no vault (backlinks, graph view, Templater). Schema breaking aceito: `memo?: string` virou `memo?: { content, materialized? }` em CodeDefinition + GroupDefinition + BaseMarker + CodeRelation (~30 pontos de toque mecânico via accessors `getMemoContent`/`setMemoContent`). Migração legacy one-shot no `DataManager.load`. **Implementação:** 7 arquivos novos em `src/core/`: `memoTypes.ts` (MemoRecord + EntityRef discriminated union 5-way + serializers), `memoHelpers.ts` (accessors), `memoNoteFormat.ts` (parse/serialize frontmatter `qualiaMemoOf: code:<id>` + `qualiaCodeName`), `memoPathResolver.ts` (sufixo `(2)/(3)` + sanitizeFilename), `memoMigration.ts` (string → MemoRecord + helper `migrateMarkerMemo`), `memoMaterializer.ts` (convertMemoToNote / unmaterialize / syncFromFile), `memoMaterializerListeners.ts` (vault.on modify/rename/delete + reverse-lookup `Map<path, EntityRef>` + self-write tracker `Set<string>`). **Settings:** bloco "Memo materialization" com 4 paths (`code` ativo, `group/marker/relation` reservados — visíveis e disabled pra extensão futura). Defaults: `Analytic Memos/{Codes,Groups,Markers,Relations}/`. **UI:** botão "Convert to note" no header da seção Memo (Code Detail); quando materialized, textarea some e vira card `📄 Materialized at <path>` com botões Open / Unmaterialize. Convert abre `.md` em nova aba imediatamente. **Reatividade:** edit no `.md` propaga pro `data.json` (via modify listener), rename atualiza `materialized.path`, delete remove `materialized` mas preserva `content` (volta a inline). Self-write tracking via Set de paths + queueMicrotask cleanup evita loop. Frontmatter quebrado pelo user → desmaterialização graciosa, sem erro ruidoso. **Decisões fora de escopo Phase 1:** Group/Marker/Relation memos (extensão futura, mesmo schema/listener), Templater integration, materialização batch. **Tests:** 21 novos (memoHelpers + memoMigration + memoNoteFormat + memoPathResolver) — 2438 → 2479 verde. Validação manual em vault real obrigatória pós-merge (mocks jsdom não cobrem `vault.create`/`workspace.openFile`/listeners).
- **#32 Multi-tab xlsx export** — 2026-04-28. Branch `feat/multitab-xlsx`. Export único `qualia-analytics-YYYY-MM-DD.xlsx` com 1 aba por mode (até 20 abas). **Implementação:** (a) Refactor mecânico de 20 modes — extrair `buildXxxRows(ctx): string[][] | null` (pure) de cada `exportXxxCSV`, que agora chama `buildXxxRows + downloadCsv`. Lógica de dados intacta, só fragmentada pra reuso. Sync builders (frequency, cooccurrence, graph, docMatrix, evolution, temporal, dendrogram, lag, polar, chiSquare, decisionTree, sourceComparison, overlap, relationsNetwork, codeMetadata, memos) + async builders (wordCloud, ACM, MDS, textStats — extração de texto / cálculos pesados). (b) `chartHelpers.ts` ganha `downloadCsv(rows, filename)` — elimina boilerplate de Blob/link/click em 20 lugares. (c) `src/analytics/export/xlsxExporter.ts` (novo) — orquestra todos os builders, filtra abas vazias (modes sem dados pulam), trunca sheet names a 31 chars (limite Excel), gera blob via `write-excel-file/browser` + download. (d) Botão "Export XLSX" na toolbar do Analytics, ao lado do "Export CSV". (e) Lazy import do exporter (`await import(...)`) — ~80KB do bundle xlsx só carrega quando user aperta o botão. **Lib:** `write-excel-file` (~200KB minified, +4% bundle). **Decisões de escopo:** modes sem dados (codeMetadata sem variable, MCA sem codes suficientes) pulam silenciosamente — comportamento esperado. Filtros aplicados são os do Analytics atual (sources, codes, min freq, case var, group). Sem aba "summary" com meta, sem formatação (cores/bold), sem subset selection — MVP. Bundle 2.3MB → 2.4MB. Smoke test confirmou 18/20 abas geradas em vault de teste (cmVariable e MCA precisam config). 2438 tests verde mantido (refactor mecânico, sem novos tests).
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
