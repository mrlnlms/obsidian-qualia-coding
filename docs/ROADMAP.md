# Qualia Coding — Roadmap

> Features planejadas por prioridade. Items concluídos ficam no registro ao final.
> Última atualização: 2026-05-04 (Q-mode frente #1 fechada — Files Dendrogram + File Similarity + cluster drill-down).

## ⚡ Status atual (próxima sessão lê isso primeiro)

**Versão:** 0.3.0 (2026-05-05, tag pushed, GitHub Release automático via `.github/workflows/release.yml`). Smart Codes Tier 3 + Phase 2 fechado. Checklist de testes manuais da Fase 6 em `plugin-docs/archive/claude_sources/plans/20260504-manual-tests-fase-6.md` (workspace externo).

**Infra que a Fase 6 estabeleceu (não é só "abrir parquet grande"):**
- DuckDB-Wasm + Worker + Blob URLs → reusável pra LLM provider (Ollama/OpenAI/Anthropic) e Whisper transcription
- OPFS streaming → cache local pra modelos ML baixados
- `getFilteredSourceRowIds` + predicate builder tabular → prompt-target pra LLM tabular
- `sourceRowId` estável → anchoring de LLM em tabular sobrevive a sort/filter
- Audit log central + memo schema cross-entidade → "AI source" tracking + "memo-as-prompt" sem schema novo
- Bundle 14MB → distribuição via Community Plugins viável
- `mergePolicies` puro → merge LLM batch em codebook existente

**Frentes engatilhadas (ordem cravada com user 2026-05-04, pós-release 0.2.0):**

1. ~~**Q-mode gaps que sobraram**~~ ✅ **FEITO 2026-05-04** — Files Dendrogram + File Similarity Ranking + cluster drill-down cross-view (S0+S1+S2+S3, branch `feat/q-mode-gaps`). 4 commits + 2 fixes (papercut cluster IDs/silhouette + banner display). Ground truth do mock (corpus-teste-ia, 8 entrevistas × 16 codes × 6 groups) bate: 3 clusters separam Junior controle / Senior controle / Tratamento. 56 testes Q-mode passando (clusterEngine + distanceMatrix + qModeData). Frente analítica Q-mode 100% coberta — sem gaps abertos.

2. ~~**Smart Codes (Tier 3 Coding Management)**~~ ✅ **FEITO 2026-05-04** — branch `feat/smart-codes`, 19 commits. Schema completo (PredicateNode AST com 10 leaves + nesting), evaluator puro com short-circuit + cycle detection, SmartCodeCache com invalidação granular + computePreview, SmartCodeApi CRUD + autoRewriteOnMerge + diff helper, builder modal row-based + Smart Code Detail + List hub, command palette (`Smart Codes: Open hub` + `Smart Codes: New`), audit log entity discriminator + 5 sc_* event types, ⚡ icon na Codebook Timeline, export/import QDPX (`qualia:SmartCodes` namespace + 2-pass parse), CSV tabular `smart_codes.csv` + README R/Python snippets. **107 testes novos** (2584 → 2759). Stress: 10k markers + 100 smart codes em <1s. **Phase 2 ✅ FEITO (2026-05-05):** SC1 (analytics modes — frequency/cooccurrence/evolution/codeMetadata/lagSequential/memoView via helper `getSmartCodeViews`) + SC2 (Code Explorer ganha grupo SC top-level com tree SC → file → matches) + SC3 (emit granular MarkerMutation em todos 5 engine models — cache invalidation cirúrgica, dead code removal, cascade fix, hide UX cleanup, clear all completo). Smart Codes Tier 3 100% fechado.

3. **Submissão Community Plugins PR** — Release 0.2.0 já tem o artefato; falta PR no `obsidianmd/obsidian-releases` com README + screenshots. Bundle 14MB cabe mas é grande pra padrão da Community — pode receber pushback no review.

4. **LLM-assisted coding** — pesquisa de mercado profunda já feita: `docs/_study/llm-coding/` (40 ferramentas + 5 patterns analisados em 41 arquivos; síntese em `comparison.md`; cruzamento arquitetura×market em `qualia-fit.md`). **5 escolas filosóficas mapeadas** (§3 do comparison.md). **Decisão de produto pendente:** qual escola Qualia subscreve, qual use case primário, qual provider strategy, onde no fluxo entra, qual granularidade de revisão humana. Antes dessas 5 decisões cravadas (1 sessão de brainstorm dedicado), design não rola. Pós-decisão: ~10-15 sessões pra MVP S+M.

**Frentes em decisão de produto** (sem spec, sem design doc):
- **Intercoder Reliability + LLM-assisted coding** — duas decisões com possível acoplamento epistemológico (ver §"Intercoder Reliability"). Material de repertório acumulado em `docs/_study/llm-coding/` (40 ferramentas + 5 patterns) + 2 conversas externas com claude_ai (2026-04-26 sobre ICR + 2026-04-28 sobre tensão LLM-as-coder). Os 2 ângulos sobre ICR (clássico Kappa/α vs auditabilidade interpretativa) e as 5 escolas LLM ficam como repertório pra brainstorm — uma perspectiva não anula a outra. Brainstorm dedicado precede design técnico.
- ~~**Q-mode / P-mode analytics**~~ ✅ **FEITO 2026-05-04** (frente #1). Cobertura completa agora: Files Dendrogram + File Similarity + cluster drill-down + MDS Files + Source Comparison + Code × Metadata. P-mode segue coberto por Temporal + Evolution + Codebook Timeline.
- **Projects + Workspace** — provavelmente reinventa Workspaces nativo. User cravou "reavaliar antes de implementar" — provavelmente passar.
- **Margin Panel customization** — bloqueado por decisão em plugin externo.

**Frentes encerradas recentemente:** Coding Management Tier 1+2 ✅ (2026-04-28) · Analytics enhancements ✅ · Research Board Enhancements ✅ (2026-04-29) · Memos Phase 1+2+3 ✅ (2026-04-30) · **Parquet-lazy Fases 0/2/3/4/5 ✅ (2026-05-03/04)** · **Virtual scroll + markerTextCache + label CSV ✅ (2026-05-04, pré-Fase 6)** · **Fase 6 Slices A/B/C/D/E ✅ (2026-05-04)** · **Q-mode gaps S0+S1+S2+S3 ✅ (2026-05-04 — Files Dendrogram + File Similarity + cluster drill-down)** · **Smart Codes Tier 3 ✅ (2026-05-04 — branch `feat/smart-codes`, 19 commits, 107 testes novos, schema + evaluator + cache + UI hub + QDPX round-trip + CSV tabular)**. **Coding Management 100% fechado.**

**Bloqueadores no `BACKLOG.md`:** zero. Carla label vazia (whitespace-only) é minor não bloqueante.

---

## 🗺️ Áreas de trabalho

Sem ordem imposta — agrupamento temático pra varredura. Decisões de execução ficam com o user.

| Área | O que tem aberto |
|------|------------------|
| **[Coding Management](#2-coding-management)** | Tier 1 ✅ FEITO 2026-04-28 · Tier 2 ✅ FEITO 2026-04-28 · Tier 3 ✅ FEITO 2026-05-04 |
| **[Analytics](#3-analytics--melhorias)** | — |
| **[Margin Panel](#4-margin-panel--melhorias)** | Customization · Resize Handle. **Bloqueado** por decisão em plugin externo |

---

## ❓ Decisões de produto abertas

Sem ordem — precisam validar **se** e **como** existem antes de virar sessão.

- **[Parquet/CSV lazy loading](#parquetcsv-lazy-loading)** — **design doc fechado** (`docs/parquet-lazy-design.md`, 539 linhas, revisado por Codex+Gemini). Stack escolhida: DuckDB-Wasm + OPFS + AG Grid Infinite. 7 fases, 13-15 sessões. Decisão atualizada: **NÃO é mais contingente a LLM** — Fase 0 (sourceRowId) destrava ambos
- **[LLM-assisted coding](#llm-assisted-coding)** — **pesquisa de mercado profunda concluída** (`docs/_study/llm-coding/`, 41 arquivos: 40 tools + 5 patterns + síntese cross-tool + qualia-fit). 5 escolas filosóficas mapeadas. Decisão pendente: posicionamento (qual escola). Sem isso, design não rola
- **[Intercoder Reliability (kappa/alpha)](#intercoder-reliability--material-de-repertório-pra-discussão-epistemológica)** — registro 2026-05-04 acumula material de 2 conversas externas com 2 ângulos (A: ICR clássico Kappa/α; B: auditabilidade interpretativa via Friese/B&C; possível C híbrido). Repertório pra brainstorm, não decisão. Possível acoplamento com decisão LLM mapeado mas não cravado.
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

**Tier 3 — Smart Codes** ✅ **FEITO 2026-05-04** (branch `feat/smart-codes`):

| Feature | Estado |
|---|---|
| ~~**Smart Codes (saved queries)**~~ | ✅ FEITO 2026-05-04 — branch `feat/smart-codes`, 19 commits, 107 testes novos. Spec em `plugin-docs/archive/claude_sources/specs/20260504-smart-codes-design.md`, plan em `plugin-docs/archive/claude_sources/plans/20260504-smart-codes.md` (workspace externo). |

**Implementação:** schema completo (PredicateNode AST com 10 leaves: hasCode, caseVarEquals, caseVarRange, magnitudeGte/Lte, inFolder, inGroup, engineType, relationExists, smartCode nesting), evaluator puro com short-circuit + cycle detection (`src/core/smartCodes/evaluator.ts`), SmartCodeCache singleton com invalidação granular + computePreview + chunked compute (`cache.ts` + `matcher.ts`), SmartCodeApi CRUD + autoRewriteOnMerge + diffPredicateLeaves + rewriteCodeRef (`smartCodeRegistryApi.ts`), builder modal row-based linear com preview live <300ms + Smart Code Detail + List hub modal acessível via command palette (`Smart Codes: Open hub` + `Smart Codes: New`), audit log estendido com `entity?: 'code' | 'smartCode'` discriminator + 5 sc_* event types com coalescing (60s text edits + Set union pra predicate edits), ⚡ icon na Codebook Timeline, export QDPX bloco `<qualia:SmartCodes>` namespace custom + import 2-pass (alocar IDs → resolver refs incl. nesting), CSV tabular `smart_codes.csv` com `predicate_json` + README R/Python snippets condicionais. **Stress:** 10k markers + 100 smart codes em <1s.

**Pendente (Phase 2, não bloqueante):** integração em Analytics modes (frequency/cooccurrence/etc) + sidebar adapters por engine + emit granular `qualia:markers-changed` em modelos pra invalidação cirúrgica do cache. Funcionalidade core está acessível via SmartCodeListModal sem essas integrações.

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

### Parquet/CSV lazy loading

> **📄 Doc autoritativo: `docs/parquet-lazy-design.md`** (539 linhas, revisado por Codex + Gemini + cross-review com `qualia-fit.md`). **Esta seção é resumo — sempre consultar o design doc antes de virar spec.**

**Status atual (2026-05-04):** ✅ **100% FECHADO — todas as 7 fases entregues 2026-05-03/04.** As 9 decisões §9 foram cravadas em 2026-05-03 (ver changelog do design doc). Doc preservado como referência arquitetural / post-mortem. Não é mais decisão pendente nem trabalho aberto.

**Mudança vs versão anterior do ROADMAP:** parquet lazy **não é mais contingente a LLM coding**. Decisão invertida — atacar antes pra Fase 0 (`sourceRowId` estável) entregar dual-purpose: destrava parquet grande **e** destrava LLM em tabular (batch review, diff entre runs, anchoring estável após sort/filter).

**Stack final:**
- `@duckdb/duckdb-wasm` bundle EH (single-thread, ~6.4 MB, sem requisito COI)
- OPFS via `BROWSER_FSACCESS` (cópia streaming Node fs, ~1MB pico no cold start)
- AG Grid Community **Infinite Row Model** (Server-Side é Enterprise $999/dev/ano)
- main.js cresce 2.5MB → ~9MB (faixa Excalidraw 8.4MB)

**Alternativas A/B/D descartadas com justificativa:** A (sort/filter só em buffer) — UX confusa · B (desabilitar sort/filter) — mata batch coding por filter (caso central) · D (esperar LLM) — herdaria cap arbitrário.

**7 fases incrementais (em main, atrás de feature flag):**

| Fase | Entrega | Sessões |
|---|---|---|
| 0 | Schema `CsvMarker.row → sourceRowId` + migração one-shot vault workbench | 1-2 |
| 1 | `getMarkerText` async + adapter **batch resolver** (sidebar pré-computa hoje) | 1.5-2 |
| 2 | DuckDB-Wasm bootstrap (Worker + esbuild loaders + Blob URLs + lifecycle) — **infra reutilizável pra LLM provider e Whisper** | 2 |
| 3 | OPFS sync streaming via Node fs (não readBinary — pegou no review do Codex) | 2 |
| 4 | RowProvider + AG Grid Infinite Row Model + threshold | 2 |
| 5 | Batch coding modal via SQL (predicate builder) — **prompt-target pro LLM tabular** | 1-2 |
| 6 | Habilita flag + QDPX/tabularExporter streaming + UI Manage Cache + mocks DuckDB-Wasm + progress bar detalhada | 2.5-3 |

**Total: 13-15 sessões.**

**Calibração empírica que justificou o esforço (bench 2026-04-24):**

| Type | Size (MB) | Peak RSS | Multiplier RSS |
|------|-----------|----------|----------------|
| parquet | 76.9 | 755 MB | **9.8x** |
| parquet | 78.1 | 1405 MB | **18.0x** |
| parquet | 172.5 | 1390 MB | 8.1x |
| 2 parquets simultâneos | — | — | ❌ OOM |

Mitigação atual (size guard #28, 2026-04-28) já cobre crash via banner "Load anyway". Lazy loading fecha o gap "abrir arquivo grande funcionando + sort/filter/search/aggregate via SQL".

**9 decisões §9 — todas cravadas em 2026-05-03 e implementadas:**

1. ✅ Threshold hardcoded (sem setting — detalhe técnico não vira preferência)
2. ✅ OPFS namespace via path
3. ✅ Sort/filter header via SQL ativo (§2.2)
4. ✅ Search global via SQL `LIKE`
5. ✅ QDPX export streaming completo
6. ✅ Feature flag = constante de dev (não setting — descartado como hedge)
7. ✅ `sourceRowId` via `ROW_NUMBER()` (validado em spike empírico)
8. ✅ `textExtractor` lazy via SQL DuckDB (UNNEST + GROUP BY) — invertida 2026-05-03
9. ✅ Mocks via interface `RowProvider` + suite integração separada

**Pontos cegos validados:** Web Worker em plugin Obsidian ✅ · CSP `wasm-unsafe-eval` ✅ · OPFS cleanup em camadas ✅ · cross-platform ✅ · hot-reload + WASM gerenciável ✅ · 2GB ceiling do WASM 32-bit (documentar como limitação) · sem precedente público de DuckDB-Wasm em plugin Obsidian (risco de integração, não componente).

### LLM-assisted coding

> **📄 Pesquisa autoritativa: `docs/_study/llm-coding/`** (41 arquivos). Pontos de entrada:
> - `index.md` — TOC das 40 ferramentas + 5 patterns analisados
> - `comparison.md` (337 linhas) — síntese cross-tool, 5 escolas filosóficas, gaps universais, outliers únicos
> - `qualia-fit.md` (532 linhas) — cruzamento arquitetura Qualia × patterns mercado, fit/esforço (S/M/L/XL), greenfield real
> - `methodology.md` — template de coleta + estratégia de screenshots
> - 40 arquivos por ferramenta + 5 patterns DIY (R packages, Python notebooks, Custom GPTs, Claude Projects, manual)

**Status atual (2026-05-01):** pesquisa profunda **concluída**. Mapping arquitetura×mercado **concluído**. **Decisão de posicionamento pendente** — sem ela, design não rola. Brainstorm dedicado é o próximo passo, não execução.

**O que a pesquisa mostrou (sumário em 6 pontos do `comparison.md`):**

1. Mercado dividido em **5 escolas filosóficas**, não 2 ("AI faz tudo" / "AI auxilia, humano decide" / "AI explora, humano codifica" / "Methodology > AI" / "Sem AI"). Cada uma tem público real.
2. Vocabulário fragmentou — `code/codebook` (academic) vs `tag/theme/insight` (UX research) vs `atom/observation/clip/thésaurus` (especializados) — escolha de termo marca posicionamento.
3. AI é universalmente cloud + OpenAI nos pagos. Local-first é minoria (QualCoder, Transana 5.51, Provalis).
4. Citation-anchoring é baseline universal. **Qualia já tem nativamente** via offsets/markers em 6 engines.
5. **5 gaps universais nos pagos** (ninguém faz bem): confidence score visível, prompt visível ao user, cost meter pré-execução, badge persistente "isso veio do AI" pós-aceitar, diff entre AI runs.
6. Posicionamentos contra-narrativos vivos (Dedoose, Quirkos, Glean.ly, Cassandre, Taguette) — "AI-skeptic researcher" persona é real e atendida.

**O que Qualia já tem alinhado (foundation = "free wins"):**

- Citation-anchoring nativo (6 engines) — baseline pronto
- `description` (operacional) + `memo` (processual) — encaixa **memo-as-prompt** do MAXQDA sem mudança de schema (achado mais alavancável)
- Audit log central #29 — base pra AI audit trail (estender `AuditEntry.aiSource`)
- Groups + `hidden` flag — staging area sem schema novo
- Vault local — privacy-by-default gratuito (inverte a lógica dos competidores SaaS)
- Tabular CSV #19 — 2/3 do "three deliverables canon" (Chiarelli) prontos
- `mergePolicies` puro #30 — base pra "merge LLM batch into existing codebook"

**Patterns por esforço (tabela completa em `qualia-fit.md` §2):**

- **S (foundation pronta, só wiring + UI):** confidence score, AI source na audit entry, verbatim verification helper, processing log markdown, memo-as-prompt builder
- **M (extensão pequena, schema additive):** provider abstraction (OpenAI/Anthropic/Ollama), local LLM via Ollama HTTP, templates de prompt, cost meter, kappa/alpha humano-vs-LLM, transcription audio/video
- **L (greenfield + UX significativa):** background batch worker, diff entre AI runs, theme clustering, auto-coding completo
- **XL (repensar arquitetura):** conversational AI Q&A sobre o corpus (FAISS+embeddings), cross-project AI search (conflita com vault=projeto)

**Decisões pendentes (§9 do `qualia-fit.md`) — brainstorm dedicado:**

1. Em qual das 5 escolas Qualia se posiciona? (define UI/UX/copy)
2. Use case primário — Qualtrics 10k rows? Entrevista 30 páginas PDF? 100 imagens? Audio?
3. Provider strategy — Ollama default? OpenAI default? config aberta?
4. Onde no fluxo o AI entra — coding inline (durante leitura), batch pré-processamento, pós-coding (síntese)?
5. Granularidade da revisão humana — per-segment? per-file? per-code-suggestion? per-batch?

**Concorrência mapeada com profundidade:** ATLAS.ti (intentional/conversational/suggested) · NVivo (refuse first-pass, AI = memoing) · MAXQDA (memo-as-prompt) · Dedoose (zero AI) · Quirkos (manifesto anti-AI 2025) · Provalis (7 providers + cost meter UNIQUE) · Transana 5.51 (Embedded vs External UX distinction) · QualCoder (stack OSS completo, 9 providers, FAISS+e5-large local). Diferenciais possíveis em **gaps universais** (item 5 acima).

**Acoplamentos com outras decisões:**
- Fase 0 do parquet lazy (`sourceRowId`) ✅ — pré-req também pra LLM tabular (anchoring estável após sort/filter)
- Fase 2 do parquet lazy (Worker bootstrap) ✅ — infra reutilizável pra LLM provider (Ollama HTTP, OpenAI/Anthropic SDKs no worker) + Whisper transcription model
- Fase 5 do parquet lazy (predicate builder tabular) ✅ — prompt-target pro LLM tabular ("codifica todas as rows onde sentiment=negative")
- **Smart Codes** — independente do LLM (corrigido 2026-05-04). LLM agrega depois como NL→query layer (pattern AI Smart Coding do ATLAS.ti), mas Smart Codes funciona sozinho.
- **Intercoder Reliability** — humano-vs-LLM kappa/alpha é o caso forte que justifica Intercoder no contexto single-user. Atacar Intercoder depois de LLM dá uso óbvio; antes de LLM precisa modelar multi-coder via git branches ou similar.

**Estimativa MVP** (após decisão de posicionamento): provavelmente 10-15 sessões pra MVP cobrindo S+M; L é roadmap próprio.

### Intercoder Reliability — material de repertório pra discussão epistemológica

**2026-05-04 — registro pra brainstorm futuro.** Material acumulado em duas conversas externas (`claude_ai 2026-04-26 "Intercoder reliability em ferramentas QDA"` + `2026-04-28 "Status dos projetos em andamento"`) traz ângulos que vale ter lado a lado **quando a decisão for atacada**. Nenhuma das perspectivas abaixo está cravada como caminho — são repertório pra a discussão ser rica, não conclusões. Uma não anula a outra.

**Stats clássicas:** Percent Agreement, Cohen's κ (2 coders, nominais), Fleiss' κ (3+ coders), Krippendorff's α (multi-coder + dados faltantes + diferentes níveis de mensuração — **mais robusto, padrão ATLAS.ti em 3 variantes cu-α/c-α/α-binary**), Scott's Pi, Gwet's AC1.

**Implementações dominantes:** ATLAS.ti (Inter-coder Agreement dedicada com 3 variantes de Krippendorff), MAXQDA (PA + Kappa, paralelo de docs), NVivo (Coding Comparison Query, Cohen's κ), Dedoose (Training Center workflow-oriented), Quirkos (mais simples). Todos comparam "coding cycles" — projetos paralelos do mesmo material por coders diferentes.

**Boundary disagreement** em coding holístico (segmentos com fronteiras flexíveis) é problema crítico — coders podem concordar no código mas discordar de onde o trecho começa/termina. Stats clássicas não resolvem.

**Threshold convencional** (Landis & Koch): κ > 0.61 substancial, > 0.81 quase perfeito. Krippendorff: α ≥ 0.80, tentativo a partir de 0.667.

#### Ângulo A — ICR clássico como rigor acadêmico

**Argumento defendido por essa perspectiva:** peer reviewers de mixed methods e content analysis esperam Kappa/α; sem isso, paper rejeita em journals de tradição realista/pós-positivista. ATLAS.ti/NVivo/MAXQDA implementam bem. Caso forte adicional: **humano-vs-LLM kappa** — quando LLM auto-coding entrar, kappa entre LLM e humano vira métrica natural de validação automática.

**Esforço estimado se atacado:** modelar "coders" como first-class, reconciliação de discordâncias, cálculo estatístico, UI de comparação. ~5-8 sessões. No contexto single-user Obsidian, multi-coder via git branches ou arquivos paralelos.

**Acoplamento com LLM:** humano-vs-LLM kappa exige que LLM auto-coding já exista. Faz sentido depois de LLM, não antes.

#### Ângulo B — auditabilidade interpretativa como alternativa

**Argumento defendido por essa perspectiva (Friese, Saldaña com ressalvas, Braun & Clarke):** ICR é importação positivista que pode ser mal-ajustada pra tradição interpretativista. Pressupõe códigos como categorias estáveis com fronteiras objetivas, não construções analíticas em desenvolvimento. Em grounded theory ou reflexive thematic analysis, **o coding É a análise** — forçar consenso prematuro empobrece interpretação. Pode pressionar codebooks pro "menor denominador comum" (códigos descritivos rasos concordam mais que analíticos densos). **Braun & Clarke é explícita: ICR é incompatível com reflexive TA** — citação a verificar contra a fonte se o caminho for atacado.

**Resposta interpretativista alternativa proposta na conversa:** "auditabilidade interpretativa" — capacidade de **reconstruir o caminho analítico** (Lincoln & Guba *confirmability* + audit trail; tradição francesa *traçabilité*). Componentes sugeridos:

- Audit trail nativo (não só "quando código foi criado" mas história analítica: definição → revisões → memos vinculados a revisões → trechos que motivaram cada mudança)
- Codebook versionado git-style com diffs semânticos
- Memo-trace linking estrutural (memo ↔ código ↔ trecho ↔ decisão como grafo navegável)
- Reflexividade registrada (campos pro pesquisador documentar viés, posicionalidade, mudanças de interpretação)
- **Negotiated agreement** em vez de Kappa quando há múltiplos coders — registrar a *discussão* das discordâncias (argumentos, resolução, abertos), não a métrica
- Magnitude/intensity coding com traço (justificativa registrada, não só valor)
- Análise de cobertura interpretativa (% do corpus com coding denso vs raso)

**O que Qualia já tem que se sobrepõe à lista B** (observação factual, não argumento de que B é o caminho):
- Audit log central (#29) — pode servir como base pra trajetória do código
- Memo schema cross-entidade (#25) — memo-trace linking estrutural já existe
- Magnitude (#14) — campo de justificativa registrado
- mergePolicies #30 — política de merge auditável
- Vault-as-git — codebook versionado git-style sai do próprio Obsidian (commit history do data.json)

**Citações da conversa de 2026-04-26 que entram como material da discussão:**
> _"auditabilidade não é uma feature, é uma propriedade emergente da arquitetura de dados."_

> _"ferramenta de origem interpretativista que pode opcionalmente oferecer ICR pra quem precisa, mas cuja proposta central é auditabilidade analítica."_

São **propostas de uma das vozes**, não consenso nem decisão. Servem como input no brainstorm.

#### Acoplamento com decisão LLM-assisted coding

A segunda conversa (2026-04-28) registrou tensão epistemológica que conecta as duas decisões:

> _"você é crítico de synthetic data/synthetic users no mercado BR (taxonomia dos 4 tipos, Chapman), e LLM batch-coding sobre células tabulares é primo desse problema — o LLM é coder, ainda que humano valide. A epistemologia do espelho/janela complica também: quem é o codificador quando códigos vêm de LLM? O ciclo R→Q→recodificação→R que von Foerster ancora pressupõe um codificador humano que aprende. Se o codificador é LLM, ainda funciona? Vale separar essa decisão como tendo dimensão produto E dimensão epistêmica."_

A leitura de que isso "amarra ICR e LLM como decisão pai" é uma das hipóteses que pode entrar no brainstorm, **não conclusão**. Pode ser que faça sentido tratar como decisões independentes, ou amarrar parcialmente. Tabela abaixo é mapa de hipóteses cruzadas pra discutir, não verdades:

| Escola LLM (`comparison.md`) | Caminho ICR plausivelmente alinhado |
|---|---|
| "AI faz tudo" | A (Kappa clássico humano-vs-LLM como gate) |
| "AI auxilia, humano decide" | B ou C |
| "AI explora, humano codifica" | B |
| "Methodology > AI" (Quirkos, Dedoose anti-AI manifesto 2025) | B |
| "Sem AI" | B ou A clássico (sem LLM no kappa) |

#### O que precisa rolar antes de virar código

Brainstorm dedicado (1 sessão de produto, sem código) cobrindo:
1. Posicionamento epistemológico que Qualia quer assumir — ou se essa pergunta sequer precisa ser respondida pra o produto avançar (talvez convivência de A e B como escolhas do user funcione melhor)
2. As 5 decisões LLM pendentes (escola, use case primário, provider strategy, fluxo, granularidade revisão) — ver `docs/_study/llm-coding/qualia-fit.md` §9
3. Se ICR clássico entra como módulo dedicado ou se "auditabilidade" como propriedade emergente cobre o caso suficientemente

**Material de referência pra discussão (todos como repertório, não doutrina):**
- `docs/_study/llm-coding/` — pesquisa de mercado profunda (40 ferramentas + 5 patterns + qualia-fit)
- `claude_ai conversation 2026-04-26` — discussão ICR com perspectivas Friese/B&C/Saldaña
- `claude_ai conversation 2026-04-28` — tensão LLM-as-coder × crítica synthetic data BR
- Friese (post-coding), Braun & Clarke (reflexive TA), Saldaña (coding manual), Krippendorff (content analysis) — citar diretamente da fonte se o tema voltar
- ATLAS.ti / MAXQDA / NVivo / Dedoose docs — implementações concretas pra olhar UX

### Q-mode / P-mode analytics — próxima frente engatilhada

**Promovida 2026-05-04 a frente #1** (ver §Status atual). Trabalho concreto pra atacar:
- Dendrograma de Files (cluster hierárquico de docs por similaridade de coding) — hoje dendrogram só faz códigos
- Ranking explícito "esse documento se parece com aqueles" (MDS Files cobre 2D, falta lista ordenada)
- Q-mode equivalents pontuais de outras views R-mode quando fizer sentido (ex: cooccurrence by file similarity)

Estimativa: 2-3 sessões.

Trecho da conversa de 2026-04-28 com claude_ai sobre as views Analytics:

> _"20 lentes diferentes num microscópio que só aponta pra uma direção"_

> _"as 20 views operam todas em R-mode sobre snapshot. Q-mode é o gap óbvio, P-mode é viável (já tem `createdAt`), os outros são lower priority."_

**Correção factual (2026-05-04):** a frase "todas em R-mode" foi simplificação retórica. Cobertura real hoje:

**Tipologia rápida (verificar contra fonte original quando atacar):**
- **R-mode** — análise centrada em variáveis (códigos × frequência, co-occurrence, doc-code matrix)
- **Q-mode** — análise centrada em casos/documentos (que docs se parecem entre si pelo padrão de coding)
- **P-mode** — análise temporal (sequência de coding ao longo do tempo)

**Estado atual cruzado com a tipologia:**

| Mode | R | Q | P | Notas |
|---|---|---|---|---|
| Frequency, cooccurrence, docMatrix, polar, ACM, decisionTree, chiSquare, overlap, relationsNetwork, wordCloud, textStats, textRetrieval, dendrogram (codes), graph, lagSequential | ✅ | — | — | Pure R-mode |
| **MDS** | ✅ | ✅ | — | Toggle "Project: Codes / Files" — Files já é Q-mode (similaridade entre docs no 2D) |
| **Source comparison** | — | ✅ | — | Q-mode coarse — compara métricas entre engines/source types |
| **Code × Metadata (#24)** | ✅ | parcial | — | Heatmap código × valor de case variable + chi². Q-mode por *grupos* de casos (segmentado pela case variable), não casos individuais |
| **Temporal** | — | — | ✅ | `marker.createdAt` |
| **Evolution** | — | — | ✅ | Sequência temporal |
| **Codebook Timeline (#31)** | — | — | ✅ | Audit log temporal |

**Infra de Q-mode pavimentada por Case Variables:**
- Atribui propriedades tipadas aos casos (senioridade, region, age, etc) por arquivo
- Filter de Analytics por case variable (`groupFilter` equivalente)
- Code × Metadata cruza códigos × valor de case variable

**Gaps de Q-mode genuíno que sobram:**
- **Dendrogram de Files** — cluster hierárquico de docs por similaridade de coding (hoje dendrogram só faz códigos)
- **Q-mode equivalents** das outras views R-mode quando fizer sentido (ex: cooccurrence by file similarity)
- Ranking explícito "esse documento se parece com aqueles outros" (MDS Files cobre 2D mas não lista ordenada)

**P-mode** já está bem coberto (Temporal + Evolution + Codebook Timeline) — não é trabalho aberto.

**Acoplamento com decisões maiores:** Q-mode é cirúrgico, não acopla com ICR/LLM. Atacar antes desbloqueia clareza analítica que ajuda a discutir as decisões maiores depois.

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

~~**Group**~~ — ✅ FEITO 2026-04-30. Materialização de group memo via mesmo pattern do Code, com filename = `<groupName>.md`. UI no `codeGroupsPanel` ganha botão "Convert to note" ao lado do texto inline; quando materializado, vira card compacto com Open/Unmaterialize. Refatoração colateral: `MemoMaterializerAccess` virou genérica via `EntityRef` (era code-only) — prepara Marker/Relation pra reuso direto. Smart Open implementado: reusa leaf existente se arquivo já aberto. Esforço real: 8min (Phase 1 fez ~95% do trabalho pesado).

~~**Marker**~~ — ✅ FEITO 2026-04-30. Materialização de marker (segment) memo. Decisões fechadas: **(1) path naming híbrido por engine** — texto (markdown/csv/pdf-text): `<filename>-<excerpt-4-palavras>`; pdf-shape/image: `<file>-<shape>-<id-curto>`; audio/video: `<file>-<timecode>`. Implementado em `memoMarkerNaming.ts`. **(2) Surface única — só `detailMarkerRenderer`** (marker focused detail no Code Detail). Popovers de coding e memoView card ficam intocados (popover é "coding rápido", memoView card é compacto). Materializar é decisão analítica — user "no detail do marker" tá no mood certo. Bug fix: writeMemo de marker dispatch `qualia:registry-changed` pra views refresh (code/group fluem via `registry.onMutate`, marker não passa pelo registry).

~~**Relation**~~ — ✅ FEITO 2026-04-30. Decisões fechadas:

1. **Opção C escolhida**: criada **Relation Detail view** (`detailRelationRenderer.ts`) — surface única pros 2 tipos com banner contextual. Code-level mostra "Defined in codebook · applied in N markers" + Evidence list (markers que aplicam). App-level mostra "From segment in <file> · code-level: [link]" pra cross-nav. PromptModal antigo aposentado em favor de textarea inline na detail view.
2. **App-level UI criada**: rows clicáveis (cursor pointer + hover) com badge de memo (✏ inline / 📄 materializado) em ambos `detailCodeRenderer` e `detailMarkerRenderer`. Badge substitui o ✎ button antigo. Click row → Relation Detail.
3. **Filename naming**: code-level `<sourceCode>-<label>-<targetCode>.md` (ex: `Dup-01-tensão-Dup-03.md`); app-level `<filename>-<sourceCode>-<label>-<target>-<id-curto>.md` (id evita conflito quando múltiplos segmentos têm mesma tupla).

**Próximos passos (ordem sugerida):**
1. ~~Implementar Group~~ — ✅ FEITO 2026-04-30.
2. ~~Implementar Marker~~ — ✅ FEITO 2026-04-30.
3. ~~Implementar Relation~~ — ✅ FEITO 2026-04-30.

**Phase 2 fechada — 4/4 tipos materializam memo (Code, Group, Marker, Relation).**

#### Phase 3 — "Materialize all memos" — ✅ FEITO 2026-04-30

Command palette: **"Materialize all memos"**. Modal com:
- Toggles por tipo (5 kinds: Code, Group, Marker, Relation code-level, Relation segment-level — todos on por default).
- Toggle "Include empty memos" (default off).
- Toggle "Overwrite existing notes" (default off, com banner ⚠ quando ligado).
- Preview live com 4 buckets: a criar, a sobrescrever, já materializadas, vazias puladas.
- Botão dinâmico ("Materialize 5", "Overwrite 12", disabled quando 0).
- Estado **progress** in-modal (status do item atual + barra + counter X/Y).
- Estado **resultados** in-modal (✓ created · ↻ overwritten · ✗ failed com details expansíveis).

Implementação: `src/core/memoBatchMaterializer.ts` (`collectAllMemoRefs` + `categorize` + `materializeBatch` com `onProgress`) + `src/core/materializeAllMemosModal.ts` (3 estados de UI). `convertMemoToNote` ganhou `{ openInTab?: boolean }` pra batch não abrir N abas. `refreshMemoNote` novo pra overwrite (vault.modify do .md existente).

**Esforço real:** ~2h. **Bug caça-bruxa:** field name `selection` na classe colidia com algo do protótipo de `Modal`/`Component` do Obsidian — atribuição no constructor era sobrescrita antes do `onOpen`. Renomeado pra `batchOptions`. Pattern documentado em TECHNICAL-PATTERNS §32.

**Origem:** pesquisa com usuário sintético. Validar em demo pra ver se vira "wow moment" real.

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
- **#36 Convert memo to note Phase 2 — Relation** — 2026-04-30. Branch `feat/relation-detail`. Fecha Phase 2 — 4/4 tipos materializam memo (Code, Group, Marker, Relation). **Relation Detail view nova** em `src/core/detailRelationRenderer.ts` — surface única pros 2 tipos (code-level + app-level) com banner contextual. **Code-level**: banner "Defined in codebook · applied in N markers" + Evidence list (clicável → marker focused detail). **App-level**: banner "From segment in `<file>` · code-level: [Open code-level <label>]" (cross-nav pro code-level via link). Header com chips clicáveis Source → Label → Target. Direction display, Memo (textarea ou card), Delete relation. **Navegação**: BaseCodeDetailView ganha `relationContext` field + `showRelationDetail(ctx)` method + `doRenderRelationDetail()`. Rows de relation no `detailCodeRenderer` (Code Detail) e `detailMarkerRenderer` (Marker focused detail) ficam clickable com hover; badge de memo (✏ inline / 📄 materializado) substitui o ✎ button antigo (que abria PromptModal). Click row → Detail. Chip do target continua navegando pro code, com `stopPropagation`. **Filename naming**: code-level `<source>-<label>-<target>` (ex: `Dup-01-tensão-Dup-03.md`); app-level `<file>-<source>-<label>-<target>-<id-curto>` pra distinguir múltiplas instâncias da mesma tupla. **Plumbing**: `case 'relation-code'` e `case 'relation-app'` em 4 helpers (`resolveEntity`/`resolveFolder`/`readMemoRecord`/`writeMemo`) + `setRelationMemo` aceita `MemoRecord` (era só string) + `rebuildMemoReverseLookup` varre code-level relations + app-level relations dentro de markers (6 collections × N codes × M relations). **Settings**: Relation memo folder ativo. **Esforço real: ~1h** (boa parte foi UI da Detail view nova). PromptModal antigo aposentado.
- **#35 Convert memo to note Phase 2 — Marker** — 2026-04-30. Branch `feat/convert-memo-marker`. Estende #34 pra marker (segment) memos, fechando 3 dos 4 tipos. **Path naming híbrido em `memoMarkerNaming.ts`:** texto (markdown/csv/pdf-text) usa `<filename>-<excerpt-4-palavras>` sanitized; pdf-shape/image usa `<file>-<shape>-<id-curto>`; audio/video usa `<file>-<timecode>` (formato `00m32s-01m15s`). Funções puras separadas por engine, fallback pra ID-curto quando excerpt vazio. **Surface única — `detailMarkerRenderer`**: render condicional textarea/card só nessa view. Popovers de coding (image/media/pdf/markdown) e Memo View card ficam intocados (popover é "coding rápido", memoView é compacto demais pra botão extra). User materializa quando tá em mood analítico no marker focused detail (1 click do source chip do memoView). **Plumbing técnico:** `case 'marker'` em 4 helpers (`resolveEntity`/`resolveFolder`/`readMemoRecord`/`writeMemo`), `rebuildMemoReverseLookup` varre 6 collections (markdown markers, pdf markers + shapes, image markers, csv segment + row markers, audio + video file markers). **Bug fix:** writeMemo de marker dispara `document.dispatchEvent('qualia:registry-changed')` — code/group passam pelo `registry.onMutate` que dispatch automaticamente, mas marker muta direto via `dataManager.findMarker` então precisa emit explícito pras views (BaseCodeDetailView, memoView) refresh com card materializado. **Settings:** Marker memo folder ativo. Relation continua reservado. **Esforço real: ~25min** (10min plumbing + path naming, 10min UI, 5min bug fix de notification). Phase 2 Group já tinha quase tudo pronto.
- **#34 Convert memo to note Phase 2 — Group** — 2026-04-30. Branch `feat/convert-memo-group`. Estende #33 pra group memos. **Refator do core:** API `MemoMaterializerAccess` virou genérica via `EntityRef` (`convertMemo(ref)` em vez de `convertCodeMemo(codeId)`) — prepara Marker/Relation pra reuso direto sem mais refactor. Helpers internos no `memoMaterializer.ts` (`resolveEntity` / `resolveFolder` / `readMemoRecord` / `writeMemo`) abstraem o switch por tipo; cada novo tipo é ~5 linhas em cada helper. **UI:** `codeGroupsPanel.ts` — quando group selected tem memo inline, botão "Convert to note" aparece ao lado do texto (em wrap flex). Quando materializado, block do memo vira card compacto com Open/Unmaterialize (variant `.codebook-groups-memo-card`). **Smart Open:** `openMaterializedFile` em `main.ts` agora reusa leaf existente (`iterateAllLeaves` + `setActiveLeaf`) em vez de sempre criar nova aba. Aplica a Code também (regression-free). **Settings:** Group memo folder ativo (era disabled em Phase 1). Marker/Relation continuam reservados. **Esforço real: 8min.** Phase 1 fez ~95% do trabalho pesado — Phase 2 Group foi `case 'group':` em 3 helpers + UI compacta no panel. **Validação:** smoke 12/12 verde, zero warnings console, regression Code OK.
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
